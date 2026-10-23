<script setup lang="ts">
import { CalendarCheck, CalendarClock, Check, ChevronRight, CircleAlert, Link as LinkIcon, Search } from '@lucide/vue'
import { apiFailure } from '~/utils/api-error'
import { formatSetDay, formatSlotDay, formatSlotTime, formatSlotWhen } from '~/utils/berlin-time'
import { isInviteLinkPath } from '~/utils/auth-guard'
import type { VoteValue } from '~~/shared/poll'
import type { EventView } from '~~/shared/event'

// The Event link (`/e/<slug>`, ADR 0006) in the event shell (screen M3). Members see the poll:
// Slot cards, "Wer kann wann?", the Best slot and the vote count. Votes show at once and roll back
// with a toast when saving fails (ADR 0001). The page refetches every 15 s while the tab is visible.
// The Date is set in the confirm dialog (#13): from a Slot card ("Diesen festlegen") or the host dock.
// The set Date replaces the cards and the matrix with DateSetCard. Set the Date, Reschedule and Reopen
// (#13, #14) post through useHostActions. Termine bearbeiten opens SlotEditSheet (#15).
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

async function vote(slotId: string, value: VoteValue) {
  pending.value = { ...pending.value, [slotId]: value }
  try {
    await $fetch(`/api/e/${slug.value}/slots/${slotId}/vote`, { method: 'PUT', body: { value } })
    savedNote.value = true
  }
  catch (failure) {
    // Only a rate limit gets its own copy; any other refusal is the plain "did not arrive" (#11).
    const rateLimited = apiFailure(failure).code === 'rate_limited'
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

function comingSoon() {
  toast({ tone: 'info', text: t('common.comingSoon') })
}

const { confirmOpen, confirming, rescheduleOpen, rescheduling, confirmDate: confirmStart, rescheduleDate, reopenDate } = useHostActions(slug, refresh)
const confirmPreset = ref<string | null>(null)

/** The Slots the Host can still confirm, in time order, with their counts for the dialog. */
const confirmOptions = computed(() => slots.value
  .filter(slot => !slot.past)
  .map(slot => ({ id: slot.id, day: slot.day, time: slot.time, ...countsFor(slot.id) })))

/** Opens the confirm dialog: the Slot picked on its card, else the Best slot, else the earliest future Slot. */
function openConfirm(slotId?: string) {
  const first = confirmOptions.value[0]
  if (!first) {
    toast({ tone: 'error', text: t('mvp.set.noFutureSlot') })
    return
  }
  confirmPreset.value = slotId ?? data.value?.bestSlotId ?? first.id
  confirmOpen.value = true
}

/** Sets the Date to the Slot the Host picked in the dialog. */
function confirmDate(slotId: string) {
  const slot = data.value?.slots.find(candidate => candidate.id === slotId)
  if (slot) return confirmStart(new Date(slot.startsAt))
}

/** The withdrawn Date as the notice shows it, in Berlin time. */
const previousWhen = computed(() => {
  const previous = data.value?.event.previousStartsAt
  if (!previous) return null
  const instant = new Date(previous)
  return t('mvp.set.dateTime', { date: formatSetDay(instant), time: formatSlotTime(instant) })
})

// The Reopen notice stays closed in this browser for this Event and this withdrawn Date. A later
// Reopen with another Date has another value, so it shows again. Without storage it returns on reload.
const REOPEN_KEY_PREFIX = 'compies-reopen-closed:'
const closedReopenAt = ref<string | null>(null)
// False during SSR and until the stored state is read, so a closed notice never paints.
const storageRead = ref(false)
const reopenNoticeShown = computed(() => {
  const previous = data.value?.event.previousStartsAt
  return storageRead.value && Boolean(previous) && previous !== closedReopenAt.value
})

function closeReopenNotice() {
  const previous = data.value?.event.previousStartsAt
  if (!previous) return
  closedReopenAt.value = previous
  try {
    localStorage.setItem(REOPEN_KEY_PREFIX + slug.value, previous)
  }
  catch {
    // Storage blocked: the notice comes back after a reload.
  }
}

// Storage exists only in the browser, so the closed Date is read after mount, not during SSR.
onMounted(() => {
  try {
    closedReopenAt.value = localStorage.getItem(REOPEN_KEY_PREFIX + slug.value)
  }
  catch {
    // Storage blocked: nothing is remembered.
  }
  storageRead.value = true
})

const editing = ref(false)
const editableSlots = computed(() => (data.value?.slots ?? []).map(slot => ({
  id: slot.id,
  startsAt: slot.startsAt,
  votes: (data.value?.votes ?? []).filter(vote => vote.slotId === slot.id).length,
})))
const inviteOpen = ref(false)

const hostActions = computed(() => [
  { key: 'set', label: t('dock.setDate'), icon: CalendarCheck, primary: true },
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
      <template v-if="data.event.phase === 'poll'">
        <NoticeBanner
          v-if="reopenNoticeShown"
          tone="warning"
          :icon="CircleAlert"
          @close="closeReopenNotice"
        >
          {{ t('mvp.reopen.notice', { when: previousWhen }) }}
        </NoticeBanner>

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
          <b>{{ t('mvp.poll.saved') }}</b> {{ t('mvp.poll.savedText') }}
        </NoticeBanner>

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

      <DateSetCard
        v-else-if="data.event.startsAt"
        :starts-at="data.event.startsAt"
        :is-host="data.event.isHost"
        :ics-url="`/api/e/${slug}/ics`"
        @reschedule="rescheduleOpen = true"
        @invite="onHostAction('invite')"
      >
        <template #host-actions>
          <HoldToConfirmButton
            variant="secondary"
            :label="t('mvp.reopen.cta')"
            :icon="Search"
            @confirm="reopenDate"
          />
        </template>
      </DateSetCard>

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
      :total="total"
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
      v-if="data?.event.isHost && data.event.startsAt"
      :open="rescheduleOpen"
      :starts-at="data.event.startsAt"
      :loading="rescheduling"
      @confirm="rescheduleDate"
      @cancel="rescheduleOpen = false"
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
