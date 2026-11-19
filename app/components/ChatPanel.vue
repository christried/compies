<script setup lang="ts">
import { Crown } from '@lucide/vue'
import { teamNameAt } from '~/utils/board'
import { formatActivityTime } from '~/utils/berlin-time'
import { groupMessages, mergeMessages, splitMessageText } from '~/utils/chat'
import { chatRise } from '~/utils/motion'
import type { Message, MessagePage } from '~~/shared/chat'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { NOTES_LINK_REL } from '~~/shared/notes-doc'

// The Chat (#761, GLOSSARY: Chat, 02-components § ChatPanel, spec #719 § A), read only: the Event's Messages, oldest at the top and the newest at the bottom, scrolled to the
// end on load. It follows the Activity feed (`ActivityFeed.vue`): the first page from the Chat's endpoint, what the room sends (`chat.added`) at once, the first page
// again whenever the connection opens (a message sent while the socket was down is gone), and „Ältere laden“ for the page before the oldest one shown. A Message
// the page and the room both bring shows once (by id). A Message stores no name and no place (ADR 0016's opposite, on purpose): the name line of each group
// takes the writer's current Display name, Team and place from the Event read's Members, so a rename or a move shows in old Messages. The composer is #667's, links #762's
// and the delete control #763's.
const props = withDefaults(defineProps<{
  slug: string
  room: Pick<ReturnType<typeof useEventRoom>, 'state' | 'on'>
  /** The Event's Members: the name line is computed from them, never from the Chat's read. */
  members: MemberView[]
  /** The Event's teams, for the name of the Team a writer sits in. */
  teams: BoardTeam[]
  viewerId: string
  /** The panel's tab is the one shown: the log scrolls to its end when it turns true, since a log that mounted hidden could not (#761). */
  active?: boolean
}>(), { active: true })

const { t } = useI18n()

/** Oldest first. */
const messages = ref<Message[]>([])
/** The cursor of the page before the oldest one loaded; null when there is none. */
const next = ref<string | null>(null)
const status = ref<'loading' | 'ready' | 'failed'>('loading')
const loadingOlder = ref(false)
const scroller = ref<HTMLElement>()
const now = new Date()

/** A page is newest first. */
const pageMessages = (page: MessagePage): Message[] => [...page.messages].reverse()

const atEnd = () => !scroller.value || scroller.value.scrollHeight - scroller.value.scrollTop - scroller.value.clientHeight < 40
const scrollToEnd = () => void nextTick(() => scroller.value?.scrollTo({ top: scroller.value.scrollHeight }))

async function loadFirst() {
  try {
    const page = await $fetch<MessagePage>(`/api/e/${props.slug}/messages`)
    const first = status.value !== 'ready'
    messages.value = mergeMessages(messages.value, pageMessages(page))
    if (first) next.value = page.next
    status.value = 'ready'
    scrollToEnd()
  }
  catch {
    // A Chat that has shown Messages keeps them; the next open of the connection tries again.
    if (status.value !== 'ready') status.value = 'failed'
  }
}

async function loadOlder() {
  if (!next.value || loadingOlder.value) return
  loadingOlder.value = true
  try {
    const page = await $fetch<MessagePage>(`/api/e/${props.slug}/messages`, { query: { before: next.value } })
    // The list grows above what is read: keep what the reader looks at where it is.
    const before = scroller.value?.scrollHeight ?? 0
    messages.value = mergeMessages(messages.value, pageMessages(page))
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

const stopListening = props.room.on('chat.added', ({ message }) => {
  if (messages.value.some(held => held.id === message.id)) return
  const follow = atEnd()
  messages.value = mergeMessages(messages.value, [message])
  // The bubble that arrived rises alone, also where it joins a group; the first page, an older page and a re-read never do.
  void nextTick(() => {
    const bubble = [...scroller.value?.querySelectorAll<HTMLElement>('[data-message-id]') ?? []].find(element => element.dataset.messageId === message.id)
    if (bubble) chatRise(bubble)
  })
  if (follow) scrollToEnd()
})
onScopeDispose(stopListening)

watch(props.room.state, (state) => {
  if (state === 'open' && status.value === 'ready') void loadFirst()
})
watch(() => props.active, (active) => {
  if (active) scrollToEnd()
})
onMounted(() => void loadFirst())

const memberById = computed(() => new Map(props.members.map(member => [member.id, member])))

/** The groups with what their name line shows, all computed from the Members the page holds. */
const groups = computed(() => groupMessages(messages.value).map((group) => {
  const member = memberById.value.get(group.writerId)
  const own = group.writerId === props.viewerId
  const first = group.messages[0]!
  return {
    key: first.id,
    own,
    member,
    name: own ? t('common.you') : member?.name,
    /** In a team: the team's number and name; on the Stands: no number. Nothing for a writer the Event no longer lists. */
    place: member ? { team: member.zone === 'team' ? member.team : null, text: member.zone === 'team' && member.team !== null ? teamNameAt(props.teams, member.team, t) : t('board.stands') } : undefined,
    messages: group.messages,
    at: first.at,
    time: formatActivityTime(new Date(first.at), now),
  }
}))
</script>

<template>
  <!-- It fills its parent (the SidePanel's tab), which has the height; the log scrolls inside. -->
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <div
      v-if="status === 'failed'"
      class="m-3 flex flex-col items-start gap-3 rounded-[12px] border-2 border-dashed border-line-soft p-3.5"
    >
      <p class="m-0 text-ink-2">
        {{ t('chat.loadFailed') }}
      </p>
      <AppButton
        variant="secondary"
        @click="retry"
      >
        {{ t('chat.retry') }}
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
        {{ t('chat.older') }}
      </AppButton>

      <div
        ref="scroller"
        role="log"
        aria-live="polite"
        :aria-busy="status === 'loading'"
        :aria-label="t('chat.logAria')"
        class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3 pb-1.5"
      >
        <!-- The feed's dashed look, not `EmptyState`: its 120 px Compibert is too wide for the panel. -->
        <div
          v-if="status === 'ready' && messages.length === 0"
          class="rounded-[12px] border-2 border-dashed border-line-soft p-3.5 text-[14px] text-pretty text-ink-2"
        >
          <p class="m-0 font-extrabold text-ink">
            {{ t('empty.chat.title') }}
          </p>
          <p class="m-0 mt-1 font-semibold">
            {{ t('empty.chat.text') }}
          </p>
        </div>

        <div
          v-for="group in groups"
          :key="group.key"
          class="flex items-end gap-2"
          :class="group.own && 'flex-row-reverse'"
        >
          <UserAvatar
            v-if="!group.own"
            :size="28"
            :name="group.member?.name ?? '?'"
            :image="group.member?.image"
            :team="group.member?.team"
          />
          <div
            class="flex max-w-[84%] min-w-0 flex-col gap-[3px]"
            :class="group.own ? 'items-end' : 'items-start'"
          >
            <div class="flex max-w-full min-w-0 items-center gap-1.5 px-1 text-[12px]">
              <b
                v-if="group.name !== undefined"
                class="truncate font-extrabold"
              >{{ group.name }}</b>
              <span
                v-if="group.member?.isHost"
                class="inline-flex h-[18px] flex-none items-center gap-[3px] rounded-pill border-[1.5px] border-line bg-primary px-1.5 text-[10px] font-bold text-on-primary"
              >
                <AppIcon
                  :icon="Crown"
                  :size="10"
                />{{ t('common.host') }}
              </span>
              <span
                v-if="group.place"
                class="flex min-w-0 items-center gap-1 text-ink-2"
              >
                <TeamMark
                  v-if="group.place.team !== null"
                  :team="group.place.team"
                  :size="16"
                />
                <span class="truncate">{{ group.place.text }}</span>
              </span>
              <time
                :datetime="group.at"
                class="flex-none text-ink-2 tabular-nums"
              >{{ group.time }}</time>
            </div>

            <template
              v-for="message in group.messages"
              :key="message.id"
            >
              <!-- A deleted Message keeps its place and its group; #763 adds the control and the live turn into this line. -->
              <div
                v-if="message.text === null"
                :data-message-id="message.id"
                class="border-2 border-dashed border-ink-3 px-3 py-1.5 text-[13px] text-ink-2 italic"
                :class="group.own ? 'rounded-[14px_14px_4px_14px]' : 'rounded-[14px_14px_14px_4px]'"
              >
                {{ message.deletedBy === 'host' ? t('chat.deleted') : t('chat.deletedByWriter') }}
              </div>
              <!-- The text is interpolated, never `v-html`; #762 swaps this span's content for links. -->
              <div
                v-else
                :data-message-id="message.id"
                class="border-2 border-line px-3 py-2 text-[14px] leading-[1.4]"
                :class="[group.own ? 'rounded-[14px_14px_4px_14px] bg-primary text-on-primary' : 'rounded-[14px_14px_14px_4px] bg-surface text-ink']"
              >
                <span class="[overflow-wrap:anywhere]"><template
                  v-for="(piece, index) in splitMessageText(message.text)"
                  :key="index"
                ><a
                  v-if="piece.href"
                  :href="piece.href"
                  target="_blank"
                  :rel="NOTES_LINK_REL"
                  class="underline underline-offset-2"
                >{{ piece.text }}</a><template v-else>{{ piece.text }}</template></template></span>
              </div>
            </template>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
