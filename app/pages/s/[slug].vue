<script setup lang="ts">
import { CalendarCheck, CalendarClock, Check, ChevronRight, Link as LinkIcon } from '@lucide/vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { isInviteLinkPath } from '~/utils/auth-guard'
import type { VoteValue } from '~~/shared/poll'
import type { SessionView } from '~~/shared/session'

// The Session link (`/s/<slug>`, ADR 0006) in the session shell (screen M3). Members see the poll:
// Slot cards, "Wer kann wann?", the Best slot and the vote count. Votes show at once and roll back
// with a toast when saving fails (ADR 0001). The page refetches every 15 s while the tab is visible.
// Host actions are stubs until #13 (Termin festlegen) and #16 (Einladen). Termine bearbeiten opens SlotEditSheet (#15).
// The Invite link (`/s/<slug>-<token>`) is handled by InviteEntry (#10), not here.

const route = useRoute()
const { t } = useI18n()
const { toast } = useToast()
const slug = computed(() => String(route.params.slug))
const invite = isInviteLinkPath(route.path)
const { data, error, refresh } = await useFetch<SessionView>(() => `/api/s/${slug.value}`, { immediate: !invite })

const notFound = computed(() => error.value?.statusCode === 404)
const deleted = computed(() => error.value?.statusCode === 410)
const failed = computed(() => error.value !== null && !notFound.value && !deleted.value)

useHead({ title: () => `${data.value?.session.name ?? t('app.name')} | ${t('app.name')}` })

/** Votes that are being saved, by Slot. They are drawn at once and dropped when the server has answered. */
const pending = ref<Partial<Record<string, VoteValue>>>({})
const savedNote = ref(false)

const slots = computed(() => (data.value?.slots ?? []).map((slot) => {
  const instant = new Date(slot.startsAt)
  const day = formatSlotDay(instant)
  const time = formatSlotTime(instant)
  return { id: slot.id, day, time, past: slot.past, label: `${day} ${time}` }
}))

const setDate = computed(() => {
  const startsAt = data.value?.session.startsAt
  if (!startsAt) return null
  const instant = new Date(startsAt)
  return `${formatSlotDay(instant)} ${formatSlotTime(instant)}`
})

const me = computed(() => data.value?.viewerId ?? '')
const people = computed(() => data.value?.members ?? [])
const total = computed(() => people.value.length)

/** The server's Votes with this User's pending Votes laid over them. */
const shownVotes = computed(() => {
  const overlaid = (data.value?.votes ?? []).filter(vote => vote.userId !== me.value || pending.value[vote.slotId] === undefined)
  const mine = Object.entries(pending.value)
    .filter((entry): entry is [string, VoteValue] => entry[1] !== undefined)
    .map(([slotId, value]) => ({ slotId, userId: me.value, value }))
  return [...overlaid, ...mine]
})

function countsFor(slotId: string) {
  const counts = { yes: 0, maybe: 0, no: 0 }
  for (const vote of shownVotes.value) {
    if (vote.slotId === slotId) counts[vote.value] += 1
  }
  return counts
}

function myVoteFor(slotId: string): VoteValue | null {
  return shownVotes.value.find(vote => vote.slotId === slotId && vote.userId === me.value)?.value ?? null
}

async function vote(slotId: string, value: VoteValue) {
  pending.value = { ...pending.value, [slotId]: value }
  try {
    await $fetch(`/api/s/${slug.value}/slots/${slotId}/vote`, { method: 'PUT', body: { value } })
    savedNote.value = true
  }
  catch (failure) {
    const rateLimited = (failure as { statusCode?: number }).statusCode === 429
    toast({ tone: 'error', text: t(rateLimited ? 'error.rateLimited' : 'error.voteFailed') })
  }
  finally {
    // Refetch first so the server's answer replaces the drawn Vote without a flicker back to the old one.
    await refresh()
    if (pending.value[slotId] === value) {
      pending.value = Object.fromEntries(Object.entries(pending.value).filter(([key]) => key !== slotId))
    }
  }
}

// #13 opens the date confirm dialog here; until then the host actions only say so.
function comingSoon() {
  toast({ tone: 'info', text: t('common.comingSoon') })
}

const editing = ref(false)
const editableSlots = computed(() => (data.value?.slots ?? []).map(slot => ({
  id: slot.id,
  startsAt: slot.startsAt,
  votes: (data.value?.votes ?? []).filter(vote => vote.slotId === slot.id).length,
})))

const hostActions = computed(() => [
  { key: 'set', label: t('dock.setDate'), icon: CalendarCheck, primary: true },
  { key: 'edit', label: t('mvp.slots.title'), icon: CalendarClock },
  { key: 'invite', label: t('common.invite'), icon: LinkIcon },
])

function onHostAction(key: string) {
  if (key === 'edit') editing.value = true
  else comingSoon()
}

// Only a loaded Session is refetched; the invite path never loads one.
usePollRefresh(() => {
  if (data.value) refresh()
})
</script>

<template>
  <InviteEntry
    v-if="invite"
    :invite="slug"
  />
  <AppShell
    v-else
    kind="session"
  >
    <template
      v-if="data"
      #title
    >
      <h1 class="m-0 min-w-0 truncate text-[22px] leading-none">
        {{ data.session.name }}
      </h1>
      <PhasePill :phase="data.session.phase" />
    </template>

    <div
      v-if="data"
      class="mx-auto flex w-full max-w-[1100px] flex-col gap-4"
    >
      <template v-if="data.session.phase === 'poll'">
        <header class="flex flex-wrap items-end gap-3">
          <div class="flex min-w-[200px] flex-1 flex-col gap-0.5">
            <span class="text-[13px] font-bold text-ink-2">
              {{ t('mvp.poll.kicker', { voted: data.progress.voted, total: data.progress.total }) }}
            </span>
            <h2 class="m-0 font-display text-[32px] leading-none font-normal md:text-[44px]">
              {{ t('poll.title') }}
            </h2>
          </div>
          <span class="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-2">
            <span
              class="size-2 rounded-full border border-line bg-online"
              aria-hidden="true"
            />
            {{ t('mvp.poll.live') }}
          </span>
        </header>

        <NoticeBanner
          v-if="savedNote"
          tone="success"
          :icon="Check"
        >
          <b>{{ t('mvp.poll.saved') }}</b> {{ t('mvp.poll.savedText') }}
        </NoticeBanner>

        <ol class="m-0 grid list-none gap-3 p-0 md:grid-cols-4">
          <li
            v-for="slot in slots"
            :key="slot.id"
          >
            <PollSlotCard
              :timeslot="slot"
              :counts="countsFor(slot.id)"
              :total="total"
              :my-vote="myVoteFor(slot.id)"
              :best="data.bestSlotId === slot.id"
              :can-pick="data.session.isHost"
              @vote="value => vote(slot.id, value)"
              @pick="comingSoon"
            />
          </li>
        </ol>

        <section class="flex flex-col gap-2">
          <h2 class="m-0 text-[14px] font-bold">
            {{ t('mvp.poll.whoWhen') }}
          </h2>
          <PollMatrix
            :people="people"
            :slots="slots"
            :votes="shownVotes"
            :me-id="me"
          />
        </section>
      </template>

      <p
        v-else-if="setDate"
        class="m-0 flex items-center gap-2 rounded-[14px] border-(length:--cp-bw) border-line bg-surface p-4 font-bold"
      >
        {{ t('poll.confirmedBanner', { slot: setDate }) }}
      </p>

      <BaustelleZone
        compact
        :title="t('mvp.poll.zoneOpenTitle')"
        :text="t('mvp.poll.zoneOpenText')"
      />
    </div>

    <FullScreenState
      v-else-if="notFound"
      kind="invalid"
    >
      <template #actions>
        <AppButton
          to="/"
          size="lg"
        >
          {{ t('errorPage.home') }}
          <AppIcon :icon="ChevronRight" />
        </AppButton>
      </template>
    </FullScreenState>

    <FullScreenState
      v-else-if="deleted"
      kind="deleted"
    >
      <template #actions>
        <AppButton
          to="/"
          size="lg"
        >
          {{ t('errorPage.home') }}
          <AppIcon :icon="ChevronRight" />
        </AppButton>
      </template>
    </FullScreenState>

    <FullScreenState
      v-else-if="failed"
      kind="generic"
    />

    <HostDock
      v-if="data?.session.isHost && data.session.phase === 'poll'"
      :actions="hostActions"
      @action="onHostAction"
    />
    <SlotEditSheet
      v-if="data?.session.isHost && data.session.phase === 'poll'"
      :open="editing"
      :slug="slug"
      :slots="editableSlots"
      @close="editing = false"
      @changed="refresh"
    />
  </AppShell>
</template>
