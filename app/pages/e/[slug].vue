<script setup lang="ts">
import { CalendarCheck, CalendarClock, CalendarPlus, Check, ChevronRight, CircleAlert, Link as LinkIcon, Minus, Plus, Search, Trash2 } from '@lucide/vue'
import { apiFailure } from '~/utils/api-error'
import { formatSetDay, formatSlotDay, formatSlotTime, formatSlotWhen } from '~/utils/berlin-time'
import { isInviteLinkPath } from '~/utils/auth-guard'
import type { VoteValue } from '~~/shared/poll'
import { SESSIONS_MAX, sessionsEditable, type EventView } from '~~/shared/event'

// The Event link (`/e/<slug>`, ADR 0006) in the event shell (screen M3). Members see the poll:
// Slot cards, "Wer kann wann?", the Best slot and the vote count. Votes show at once and roll back
// with a toast when saving fails (ADR 0001). The page refetches every 15 s while the tab is visible.
// The Date is set in the confirm dialog (#13): from a Slot card ("Diesen festlegen") or the host dock.
// The Host picks only the Slot; its time goes to the next Session without a Date (#52). Each Session with
// a Date gets a DateSetCard at the top, numbered when the Event has several Sessions (#49). The Host acts on
// each card: Verschieben, Neue Terminsuche and Entfernen (#55). "Session hinzufügen" sits after the cards,
// and the "−" next to "N Termine gesucht" removes an undated Session. Termine bearbeiten opens
// SlotEditSheet (#15).
// The Invite link (`/e/<slug>-<token>`) is handled by InviteEntry (#10), not here.

const route = useRoute()
const { t } = useI18n()
const { toast } = useToast()
const slug = computed(() => String(route.params.slug))
const invite = isInviteLinkPath(route.path)
const { data, error, refresh } = await useFetch<EventView>(() => `/api/e/${slug.value}`, { immediate: !invite })

const notFound = computed(() => error.value?.statusCode === 404)
const deleted = computed(() => error.value?.statusCode === 410)
const failed = computed(() => error.value !== null && !notFound.value && !deleted.value)

useHead({ title: () => `${data.value?.event.name ?? t('app.name')} | ${t('app.name')}` })

/** Votes that are being saved, by Slot. They are drawn at once and dropped when the server has answered. */
const pending = ref<Partial<Record<string, VoteValue>>>({})
const savedNote = ref(false)

const slots = computed(() => (data.value?.slots ?? []).map((slot) => {
  const instant = new Date(slot.startsAt)
  return { id: slot.id, day: formatSlotDay(instant), time: formatSlotTime(instant), past: slot.past, label: formatSlotWhen(instant) }
}))

const viewerId = computed(() => data.value?.viewerId ?? '')
const people = computed(() => data.value?.members ?? [])
const total = computed(() => people.value.length)

/** The server's Votes with this User's pending Votes laid over them. */
const shownVotes = computed(() => {
  const overlaid = (data.value?.votes ?? []).filter(vote => vote.userId !== viewerId.value || pending.value[vote.slotId] === undefined)
  const mine = Object.entries(pending.value)
    .filter((entry): entry is [string, VoteValue] => entry[1] !== undefined)
    .map(([slotId, value]) => ({ slotId, userId: viewerId.value, value }))
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
  return shownVotes.value.find(vote => vote.slotId === slotId && vote.userId === viewerId.value)?.value ?? null
}

function dropPending(slotId: string) {
  pending.value = Object.fromEntries(Object.entries(pending.value).filter(([key]) => key !== slotId))
}

/** The Slots with a Vote on its way to the server. */
const sending = new Set<string>()

// Quick presses: the drawn choice follows each press at once, but while a Vote is in flight the later
// choices wait, and only the newest of them is sent (#50). A failed save falls back to the saved Vote.
async function vote(slotId: string, value: VoteValue) {
  pending.value = { ...pending.value, [slotId]: value }
  if (sending.has(slotId)) return
  sending.add(slotId)
  try {
    let sent: VoteValue | undefined = value
    while (sent !== undefined) {
      await $fetch(`/api/e/${slug.value}/slots/${slotId}/vote`, { method: 'PUT', body: { value: sent } })
      savedNote.value = true
      const newest: VoteValue | undefined = pending.value[slotId]
      sent = newest === sent ? undefined : newest
    }
  }
  catch (failure) {
    // Only a rate limit gets its own copy; any other refusal is the plain "did not arrive" (#11).
    const rateLimited = apiFailure(failure).code === 'rate_limited'
    toast({ tone: 'error', text: t(rateLimited ? 'error.rateLimited' : 'error.voteFailed') })
    dropPending(slotId)
  }
  finally {
    sending.delete(slotId)
    // Refetch first so the server's answer replaces the drawn Vote without a flicker back to the old one.
    await refresh()
    if (!sending.has(slotId)) dropPending(slotId)
  }
}

function comingSoon() {
  toast({ tone: 'info', text: t('common.comingSoon') })
}

const {
  confirmOpen,
  confirming,
  rescheduleOpen,
  rescheduling,
  rescheduleSessionId,
  addOpen,
  adding,
  confirmDate,
  openReschedule,
  rescheduleDate,
  reopenSession,
  removeSession,
  addSession,
} = useHostActions(slug, refresh)
const confirmPreset = ref<string | null>(null)

/** Bumped when a Reopen or a removal is refused, so its hold button starts again from zero (#55). */
const holdEpoch = ref(0)

async function reopenOne(sessionId: string) {
  if (!(await reopenSession(sessionId))) holdEpoch.value += 1
}

async function removeOne(sessionId: string) {
  if (!(await removeSession(sessionId))) holdEpoch.value += 1
}

/** The open Slots the Host can still confirm, in time order, with their counts for the dialog (#52). */
const confirmOptions = computed(() => slots.value
  .filter(slot => !slot.past)
  .map(slot => ({ id: slot.id, day: slot.day, time: slot.time, ...countsFor(slot.id) })))

/** The Event's Sessions (#49): dated ones in Date order with their numbers, then those still waiting for a Date. */
const sessions = computed(() => data.value?.sessions ?? [])
const datedSessions = computed(() => sessions.value.filter(session => session.startsAt !== null))
const missing = computed(() => data.value?.missingDates ?? 0)
/** The Dates still missing after the one the Host sets now (#52): the dialog says so. */
const missingAfterSet = computed(() => Math.max(missing.value - 1, 0))

/** Why "Termin festlegen" cannot set a Date right now, or null (#52): no open Slot at all, or none in the future. */
const setBlocked = computed(() => {
  if (slots.value.length === 0) return t('mvp.set.noSlots')
  if (confirmOptions.value.length === 0) return t('mvp.set.noFutureSlot')
  return null
})

/** Opens the confirm dialog: the Slot picked on its card, else the Best slot, else the earliest future Slot. */
function openConfirm(slotId?: string) {
  const first = confirmOptions.value[0]
  if (!first) {
    toast({ tone: 'info', text: setBlocked.value ?? t('mvp.set.noFutureSlot') })
    return
  }
  confirmPreset.value = slotId ?? data.value?.bestSlotId ?? first.id
  confirmOpen.value = true
}

/** The Session the reschedule dialog moves, while it still has its Date (#55). */
const rescheduleSession = computed(() => sessions.value.find(session => session.id === rescheduleSessionId.value && session.startsAt !== null) ?? null)

/** Sessions can be added, removed and reopened in every Phase before the Event finishes (#55, sessionsEditable). */
const canChangeSessions = computed(() => (data.value ? sessionsEditable(data.value.event.phase) : false))
const full = computed(() => sessions.value.length >= SESSIONS_MAX)

/** The last Session still waiting for a Date: the "−" next to "N Termine gesucht" removes it (#55). */
const lastUndated = computed(() => [...sessions.value].reverse().find(session => session.startsAt === null) ?? null)

/** The "−" removes one undated Session with one tap, as long as one Session stays (#55). */
function removeMissing() {
  if (lastUndated.value) removeOne(lastUndated.value.id)
}

/** The withdrawn Date as the notice shows it, in Berlin time. */
function whenOf(iso: string) {
  const instant = new Date(iso)
  return t('mvp.set.dateTime', { date: formatSetDay(instant), time: formatSlotTime(instant) })
}

/** The Reopen notices of the Sessions and of the removed ones (#65), and how a Member closes one (#14, useReopenNotices). */
const noticeSessions = computed(() => [...sessions.value, ...(data.value?.removedSessions ?? [])])
const { notices: reopenNotices, close: closeReopenNotice } = useReopenNotices(noticeSessions)

const editing = ref(false)
const editableSlots = computed(() => (data.value?.slots ?? []).map(slot => ({
  id: slot.id,
  startsAt: slot.startsAt,
  votes: (data.value?.votes ?? []).filter(vote => vote.slotId === slot.id).length,
})))
const inviteOpen = ref(false)

// "Termin festlegen" looks disabled with its reason when no open future Slot can become a Date (#52).
const hostActions = computed(() => [
  { key: 'set', label: t('dock.setDate'), icon: CalendarCheck, primary: true, disabledReason: setBlocked.value ?? undefined },
  { key: 'edit', label: t('mvp.slots.title'), icon: CalendarClock },
  { key: 'invite', label: t('common.invite'), icon: LinkIcon },
])

function onHostAction(key: string) {
  if (key === 'set') openConfirm()
  else if (key === 'edit') editing.value = true
  else if (key === 'invite') inviteOpen.value = true
  else comingSoon()
}

// Only a loaded Event is refetched; the invite path never loads one.
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
    kind="event"
  >
    <template
      v-if="data"
      #title
    >
      <h1 class="m-0 min-w-0 truncate text-[22px] leading-none">
        {{ data.event.name }}
      </h1>
      <PhasePill :phase="data.event.phase" />
    </template>

    <div
      v-if="data"
      class="mx-auto flex w-full max-w-[1100px] flex-col gap-4"
    >
      <NoticeBanner
        v-for="session in reopenNotices"
        :key="session.id"
        tone="warning"
        :icon="CircleAlert"
        @close="closeReopenNotice(session)"
      >
        {{ t('mvp.reopen.notice', { when: whenOf(session.previousStartsAt ?? '') }) }}
      </NoticeBanner>

      <template v-if="datedSessions.length > 0">
        <DateSetCard
          v-for="session in datedSessions"
          :key="session.id"
          :starts-at="session.startsAt ?? ''"
          :number="sessions.length > 1 ? session.number : null"
          :is-host="data.event.isHost"
          @reschedule="openReschedule(session.id)"
        >
          <template #host-actions>
            <HoldToConfirmButton
              v-if="canChangeSessions"
              :key="`reopen-${session.id}-${holdEpoch}`"
              variant="secondary"
              size="card"
              :label="t('mvp.reopen.cta')"
              :icon="Search"
              @confirm="reopenOne(session.id)"
            />
            <HoldToConfirmButton
              v-if="canChangeSessions && sessions.length > 1"
              :key="`remove-${session.id}-${holdEpoch}`"
              variant="secondary"
              size="card"
              :label="t('mvp.sessions.remove')"
              :icon="Trash2"
              @confirm="removeOne(session.id)"
            />
          </template>
        </DateSetCard>

        <div class="flex flex-wrap gap-2">
          <a
            :href="`/api/e/${slug}/ics`"
            download
            class="outline-memphis inline-flex h-12 items-center gap-2 rounded-pill border-(length:--cp-bw) border-line bg-primary px-4.5 text-body font-bold whitespace-nowrap text-on-primary no-underline shadow-btn lift"
          >
            <AppIcon
              :icon="CalendarPlus"
              :size="18"
            />
            {{ t('mvp.set.ics') }}
          </a>
          <AppButton
            v-if="data.event.isHost"
            variant="secondary"
            size="card"
            @click="onHostAction('invite')"
          >
            <AppIcon
              :icon="LinkIcon"
              :size="18"
            />
            {{ t('common.invite') }}
          </AppButton>
        </div>
      </template>

      <div
        v-if="data.event.isHost && canChangeSessions"
        class="flex flex-wrap items-center gap-2"
      >
        <AppButton
          v-if="!full"
          variant="secondary"
          size="card"
          @click="addOpen = true"
        >
          <AppIcon
            :icon="Plus"
            :size="18"
          />
          {{ t('mvp.sessions.add') }}
        </AppButton>
        <p
          v-else
          class="m-0 text-small font-bold text-ink-2"
        >
          {{ t('mvp.sessions.max', { max: SESSIONS_MAX }) }}
        </p>
      </div>

      <template v-if="data.event.phase === 'poll'">
        <header class="flex flex-wrap items-end gap-3">
          <div class="flex min-w-[200px] flex-1 flex-col gap-0.5">
            <span class="text-[13px] font-bold text-ink-2">
              {{ t('mvp.poll.kicker', { voted: data.progress.voted, total: data.progress.total }) }}
            </span>
            <h2 class="m-0 font-display text-[32px] leading-none font-normal md:text-[44px]">
              {{ t('poll.title') }}
            </h2>
          </div>
        </header>

        <NoticeBanner
          v-if="savedNote"
          tone="success"
          :icon="Check"
          @close="savedNote = false"
        >
          {{ t('mvp.poll.savedNote') }}
        </NoticeBanner>

        <div
          v-if="missing > 0"
          class="flex flex-wrap items-center gap-3"
        >
          <p class="m-0 font-display text-[26px] leading-[1.05] max-sm:text-[22px]">
            {{ t('mvp.poll.missingDates', { n: missing }, missing) }}
          </p>
          <IconButton
            v-if="data.event.isHost && canChangeSessions && sessions.length > 1"
            :icon="Minus"
            :label="t('mvp.sessions.removeMissing')"
            @click="removeMissing"
          />
        </div>

        <VoteLegend v-if="slots.length > 0" />

        <section
          v-if="slots.length === 0"
          class="flex flex-col gap-1 rounded-[20px] border-2 border-dashed border-line bg-surface p-5 text-ink-2"
        >
          <h2 class="m-0 text-[18px] text-ink">
            {{ t('mvp.reopen.noSlotsTitle') }}
          </h2>
          <p class="m-0 text-pretty">
            {{ data.event.isHost ? t('mvp.reopen.noSlotsHost') : t('mvp.reopen.noSlotsMember') }}
          </p>
        </section>

        <ol
          v-else
          class="m-0 grid list-none gap-3 p-0 md:grid-cols-4"
        >
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
              :can-pick="data.event.isHost"
              @vote="value => vote(slot.id, value)"
              @pick="openConfirm(slot.id)"
            />
          </li>
        </ol>

        <section
          v-if="slots.length > 0"
          class="flex flex-col gap-2"
        >
          <h2 class="m-0 font-display text-[26px] leading-[1.05] font-normal max-sm:text-[22px]">
            {{ t('mvp.poll.whoWhen') }}
          </h2>
          <PollMatrix
            :people="people"
            :slots="slots"
            :votes="shownVotes"
            :me-id="viewerId"
          />
        </section>
      </template>

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
      v-if="data?.event.isHost && data.event.phase === 'poll'"
      :actions="hostActions"
      @action="onHostAction"
    />

    <DateConfirmDialog
      v-if="data?.event.isHost"
      :open="confirmOpen"
      :options="confirmOptions"
      :preselected="confirmPreset"
      :missing-after="missingAfterSet"
      :loading="confirming"
      @confirm="confirmDate"
      @cancel="confirmOpen = false"
    />
    <SlotEditSheet
      v-if="data?.event.isHost && data.event.phase === 'poll'"
      :open="editing"
      :slug="slug"
      :slots="editableSlots"
      @close="editing = false"
      @changed="refresh"
    />

    <DateRescheduleDialog
      v-if="data?.event.isHost && rescheduleSession"
      :open="rescheduleOpen"
      :starts-at="rescheduleSession.startsAt ?? ''"
      :loading="rescheduling"
      @confirm="rescheduleDate"
      @cancel="rescheduleOpen = false"
    />

    <SessionAddSheet
      v-if="data?.event.isHost && canChangeSessions"
      :open="addOpen"
      :busy="adding"
      @close="addOpen = false"
      @submit="addSession"
    />

    <InviteSheet
      v-if="data?.inviteUrl"
      :open="inviteOpen"
      :slug="slug"
      :url="data.inviteUrl"
      @close="inviteOpen = false"
      @rotated="refresh()"
    />
  </AppShell>
</template>
