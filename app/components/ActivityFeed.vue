<script setup lang="ts">
import { activityIcon, activityParts, groupActivity, readEntry, type ActivityGroup, type FeedSession } from '~/utils/activity'
import { formatActivityTime } from '~/utils/berlin-time'
import type { ActivityEntry, ActivityPage } from '~~/shared/activity'

// The Activity feed (#159, GLOSSARY: Activity feed, 11-event-seite § SidePanel): what happened in the Event, oldest
// at the top and the newest at the bottom, scrolled to the end on load. It reads the first page from the feed
// endpoint, adds what the room sends (`activity.added`) at once, and reads the first page again whenever the
// connection opens, because a message sent while the socket was down is gone; an entry the page and the room both
// bring shows once (by id). „Ältere laden“ reads the page before the oldest one shown. The room comes from the
// Event page: one socket per page. The headers over the groups come from the Sessions that have started (#164).
const props = withDefaults(defineProps<{
  slug: string
  room: Pick<ReturnType<typeof useEventRoom>, 'state' | 'on'>
  /** The Sessions that have started, with when they ran. */
  sessions?: FeedSession[]
  /** The number of the next dated Session that has not started, for „Vor Session m“; null when none is left. */
  nextNumber?: number | null
}>(), { sessions: () => [], nextNumber: null })

const { t } = useI18n()

/** Oldest first. */
const entries = ref<ActivityEntry[]>([])
/** The cursor of the page before the oldest one loaded; null when there is none. */
const next = ref<string | null>(null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const loadingOlder = ref(false)
const scroller = ref<HTMLElement>()
const now = new Date()

/** Adds entries the feed does not hold yet and keeps the list in time order (the sort is stable, so equal times keep their order). */
function merge(incoming: ActivityEntry[]) {
  const known = new Set(entries.value.map(entry => entry.id))
  const added = incoming.filter(entry => !known.has(entry.id))
  if (added.length === 0) return
  entries.value = [...entries.value, ...added].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

/** A page is newest first; the entries it carries are checked once more, since they come over the wire. */
function pageEntries(page: ActivityPage): ActivityEntry[] {
  return page.entries.flatMap((entry) => {
    const read = readEntry(entry)
    return read ? [read] : []
  }).reverse()
}

const atEnd = () => !scroller.value || scroller.value.scrollHeight - scroller.value.scrollTop - scroller.value.clientHeight < 40
const scrollToEnd = () => void nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight }))

async function loadFirst() {
  try {
    const page = await $fetch<ActivityPage>(`/api/e/${props.slug}/activity`)
    const first = status.value !== 'ready'
    merge(pageEntries(page))
    if (first) next.value = page.next
    status.value = 'ready'
    scrollToEnd()
  }
  catch {
    // A feed that has shown entries keeps them; the next open of the connection tries again.
    if (status.value !== 'ready') status.value = 'failed'
  }
}

async function loadOlder() {
  if (!next.value || loadingOlder.value) return
  loadingOlder.value = true
  try {
    const page = await $fetch<ActivityPage>(`/api/e/${props.slug}/activity`, { query: { before: next.value } })
    // The list grows above what is read: keep what the reader looks at where it is.
    const before = scroller.value?.scrollHeight ?? 0
    merge(pageEntries(page))
    next.value = page.next
    await nextTick()
    if (scroller.value) scroller.value.scrollTop += scroller.value.scrollHeight - before
  }
  catch {
    // The button stays; pressing it again tries again.
  }
  finally {
    loadingOlder.value = false
  }
}

function retry() {
  status.value = 'loading'
  void loadFirst()
}

const stopListening = props.room.on('activity.added', (message) => {
  const entry = readEntry(message.entry)
  if (!entry) return
  const follow = atEnd()
  merge([entry])
  if (follow) scrollToEnd()
})
onScopeDispose(stopListening)

watch(props.room.state, (state) => {
  if (state === 'open' && status.value === 'ready') void loadFirst()
})
onMounted(() => void loadFirst())

const TONE = { primary: 'bg-primary text-on-primary', surface: 'bg-surface text-ink', success: 'bg-success text-on-success' }

/** The entries with their sentence in pieces (names in bold) and their icon; an entry no ticket has a sentence for yet is left out. */
const shown = computed(() => entries.value.flatMap((entry) => {
  const parts = activityParts(entry, t)
  return parts === null ? [] : [{ entry, parts, ...activityIcon(entry), time: formatActivityTime(new Date(entry.at), now) }]
}))

// The headers (#164): „Vor dem Start“, then „Session n“ from a start to its end, „Vor Session m“ until the next start and
// „Nach Session n“ when none is left. An Event with one Session has no numbers: „Session“ and „Nach der Session“.
function groupTitle(group: ActivityGroup): string {
  const n = group.number
  switch (group.kind) {
    case 'beforeStart': return t('activity.beforeStart')
    case 'session': return n === null ? t('activity.sessionGroupSingle') : t('activity.sessionGroup', { n })
    case 'before': return t('activity.beforeSession', { n })
    case 'after': return n === null ? t('activity.afterSessionSingle') : t('activity.afterSession', { n })
  }
}
const groups = computed(() => {
  const byId = new Map(shown.value.map(item => [item.entry.id, item]))
  return groupActivity(shown.value.map(item => item.entry), props.sessions, props.nextNumber).map(group => ({
    key: group.key,
    title: groupTitle(group),
    items: group.entries.map(entry => byId.get(entry.id)!),
  }))
})
</script>

<template>
  <!-- It fills its parent (the SidePanel's tab or the phone's Aktivität view), which has the height; the log scrolls inside. -->
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div
      v-if="status === 'failed'"
      class="m-3 flex flex-col items-start gap-3 rounded-[12px] border-2 border-dashed border-line-soft p-3.5"
    >
      <p class="m-0 text-ink-2">
        {{ t('activity.loadFailed') }}
      </p>
      <AppButton
        variant="secondary"
        @click="retry"
      >
        {{ t('activity.retry') }}
      </AppButton>
    </div>

    <template v-else>
      <AppButton
        v-if="next"
        variant="secondary"
        class="mt-3 self-center"
        :aria-disabled="loadingOlder"
        @click="loadOlder"
      >
        {{ t('activity.older') }}
      </AppButton>

      <div
        ref="scroller"
        role="log"
        aria-live="polite"
        :aria-label="t('activity.logAria')"
        class="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
      >
        <p
          v-if="status === 'ready' && shown.length === 0"
          class="mx-0 my-4 rounded-[12px] border-2 border-dashed border-line-soft p-3.5 text-[14px] font-semibold text-pretty text-ink-2"
        >
          {{ t('activity.empty') }}
        </p>

        <section
          v-for="group in groups"
          :key="group.key"
        >
          <h3 class="sticky top-0 z-10 m-0 bg-surface pt-3 pb-1.5 text-[12px] font-extrabold tracking-[.04em] text-ink-2 uppercase">
            {{ group.title }}
          </h3>
          <ol class="m-0 flex list-none flex-col p-0">
            <li
              v-for="item in group.items"
              :key="item.entry.id"
              class="flex items-start gap-2.5 py-1.5"
            >
              <span
                class="grid size-7 flex-none place-items-center rounded-full border-2 border-line"
                :class="TONE[item.tone]"
                aria-hidden="true"
              >
                <AppIcon
                  :icon="item.icon"
                  :size="14"
                />
              </span>
              <span class="min-w-0 flex-1 pt-[3px] text-[14px] leading-[1.4] text-pretty">
                <template
                  v-for="(part, index) in item.parts"
                  :key="index"
                ><b
                  v-if="part.strong"
                  class="font-extrabold"
                >{{ part.text }}</b><template v-else>{{ part.text }}</template></template>
              </span>
              <time
                :datetime="item.entry.at"
                class="w-[4.75rem] flex-none pt-[5px] text-right text-[12px] text-ink-2 tabular-nums"
              >{{ item.time }}</time>
            </li>
          </ol>
        </section>
      </div>
    </template>
  </div>
</template>
