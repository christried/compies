<script setup lang="ts">
import type { Component } from 'vue'
import { VOTE_VALUES, type VoteValue } from '~~/shared/poll'
import { buildPollCsv } from '~~/shared/poll-csv'
import { VOTE_LOOK } from '~/utils/vote-look'

// "Wer kann wann?": everyone in the Event against every Slot (02-components § PollMatrix). A real
// table with row and column headers. "noch nicht abgestimmt" (no Vote yet) is drawn dashed and is
// not the same as Nein. Scrolls sideways only when the Slots don't fit; headers keep the day and the
// time on separate lines and are never cut.
export interface MatrixPerson {
  id: string
  name: string
  image: string | null
  isHost: boolean
}

export interface MatrixSlot {
  id: string
  /** The day as the header shows it, e.g. `Sa 24.10.` */
  day: string
  /** The time on its own line, e.g. `20:30`. */
  time: string
  past: boolean
}

const props = defineProps<{
  people: MatrixPerson[]
  slots: MatrixSlot[]
  votes: { slotId: string, userId: string, value: VoteValue, note?: string | null }[]
  meId: string
}>()

const { t } = useI18n()
const route = useRoute()

// The file is built here from what the matrix shows, so it needs no request (#84).
function exportCsv() {
  const csv = buildPollCsv({
    labels: { name: t('mvp.poll.csvName'), past: t('mvp.poll.past'), yes: t('poll.yes'), maybe: t('poll.maybe'), no: t('poll.no') },
    people: props.people,
    slots: props.slots,
    votes: props.votes,
  })
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${route.params.slug}-terminumfrage.csv`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}

const voteOf = computed(() => {
  const map = new Map(props.votes.map(vote => [`${vote.userId}|${vote.slotId}`, vote]))
  return (userId: string, slotId: string) => map.get(`${userId}|${slotId}`)
})

// The matrix cell per Vote value (#11 § Acceptance: yes, maybe, no and the dashed "not voted yet"): the shared
// vote look plus the cell's shape.
const SHAPE: Record<VoteValue, string> = { yes: 'rounded-full', maybe: 'rounded-full', no: 'rounded-[6px]' }
const LOOK: Record<VoteValue | 'open', { key: string, icon?: Component, cell: string }> = {
  ...Object.fromEntries(VOTE_VALUES.map(value => [value, { key: VOTE_LOOK[value].labelKey, icon: VOTE_LOOK[value].cellIcon, cell: `${VOTE_LOOK[value].fill} border-solid ${SHAPE[value]}` }])) as Record<VoteValue, { key: string, icon?: Component, cell: string }>,
  open: { key: 'mvp.poll.notVoted', cell: 'bg-transparent text-ink-3 border-dashed rounded-full' },
}

function lookFor(userId: string, slotId: string) {
  return LOOK[voteOf.value(userId, slotId)?.value ?? 'open']
}

/** What a cell says in words (#102): the Vote, followed by its Note when there is one. */
function textFor(userId: string, slotId: string) {
  const note = voteOf.value(userId, slotId)?.note
  const label = t(lookFor(userId, slotId).key)
  return note ? `${label}: ${note}` : label
}

// A Note opens in COMPIES style instead of a native tooltip (#125). The input type decides, not the width: a mouse
// gets the popover (hover or focus), touch and pen get the dialog from the tap, the keyboard gets the popover on
// focus and the dialog on Enter or Space.
interface Active { key: string, person: MatrixPerson, vote: VoteValue, note: string, el: HTMLElement }

const active = ref<Active | null>(null)
const mode = ref<'popover' | 'dialog' | null>(null)
const scrollBox = useTemplateRef<HTMLElement>('scrollBox')

let lastPointer: string = 'keyboard'
let closeTimer: ReturnType<typeof setTimeout> | undefined
let ignoreScroll = false
let skipNextFocus = false

function noteOf(userId: string, slotId: string) {
  return voteOf.value(userId, slotId)?.note || null
}

function cancelClose() {
  clearTimeout(closeTimer)
}

function openPopover(next: Active) {
  cancelClose()
  active.value = next
  mode.value = 'popover'
}

function closePopover() {
  cancelClose()
  if (mode.value !== 'popover') return
  mode.value = null
  active.value = null
}

// The pointer may move from the cell onto the popover (WCAG 1.4.13), so closing waits a moment.
function closePopoverSoon() {
  cancelClose()
  closeTimer = setTimeout(closePopover, 120)
}

// Focus goes back to the cell then, which must not open its popover again.
function closeDialog() {
  skipNextFocus = true
  mode.value = null
  active.value = null
}

// A cell partly under the sticky name column or past the right edge is scrolled into view first.
function scrollIntoReach(el: HTMLElement) {
  const box = scrollBox.value
  const rowHeader = el.closest('tr')?.querySelector('th')
  if (!box || !rowHeader) return
  const hidden = box.getBoundingClientRect().left + rowHeader.getBoundingClientRect().width - el.getBoundingClientRect().left
  const cut = el.getBoundingClientRect().right - box.getBoundingClientRect().right
  const by = hidden > 0 ? -(hidden + 8) : cut > 0 ? cut + 8 : 0
  if (by === 0) return
  // The scroll event this causes comes after the popover has opened and must not close it again.
  ignoreScroll = true
  box.scrollLeft += by
  requestAnimationFrame(() => {
    ignoreScroll = false
  })
}

function handlersFor(person: MatrixPerson, slotId: string, vote: VoteValue, note: string) {
  const from = (el: EventTarget | null): Active => ({ key: `${person.id}|${slotId}`, person, vote, note, el: el as HTMLElement })
  return {
    pointerenter: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') openPopover(from(event.currentTarget))
    },
    pointerleave: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') closePopoverSoon()
    },
    focus: (event: FocusEvent) => {
      if (skipNextFocus) {
        skipNextFocus = false
        return
      }
      if (lastPointer === 'touch' || lastPointer === 'pen') return
      const el = event.currentTarget as HTMLElement
      scrollIntoReach(el)
      openPopover(from(el))
    },
    blur: closePopover,
    keydown: (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePopover()
    },
    click: (event: MouseEvent) => {
      if (lastPointer === 'mouse') return
      const el = event.currentTarget as HTMLElement
      closePopover()
      // A tap doesn't focus a button on iOS; the dialog returns focus to whatever had it.
      el.focus({ preventScroll: true })
      active.value = from(el)
      mode.value = 'dialog'
    },
  }
}

function onPointerDown(event: PointerEvent) {
  lastPointer = event.pointerType
  skipNextFocus = false
}
function onKeyDown() {
  lastPointer = 'keyboard'
  skipNextFocus = false
}
function onScroll() {
  if (!ignoreScroll) closePopover()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('keydown', onKeyDown, true)
  // Capture: it also hears the matrix's own scroll box.
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('scroll', onScroll, { capture: true })
  cancelClose()
})
</script>

<template>
  <div class="grid gap-3">
    <!-- relative: the cells' sr-only texts are absolute and would otherwise widen the whole page on phones. -->
    <div
      ref="scrollBox"
      class="relative overflow-x-auto rounded-[14px] border-(length:--cp-bw) border-line bg-surface"
    >
      <table class="w-full border-collapse">
        <caption class="sr-only">
          {{ t('mvp.poll.whoWhen') }}
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              class="sticky left-0 z-[1] border-b-2 border-line-soft bg-surface px-3 py-2"
            />
            <th
              v-for="slot in slots"
              :key="slot.id"
              scope="col"
              class="border-b-2 border-line-soft px-1 py-2 text-center text-[12px] leading-tight font-extrabold whitespace-nowrap"
              :class="slot.past && 'text-ink-3'"
            >
              <span class="block">{{ slot.day }}</span>
              <span class="block">{{ slot.time }}</span>
              <span
                v-if="slot.past"
                class="block text-[11px] font-bold"
              >{{ t('mvp.poll.past') }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="person in people"
            :key="person.id"
          >
            <th
              scope="row"
              class="sticky left-0 z-[1] min-w-[120px] border-b-[1.5px] border-line-soft bg-surface px-3 py-1.5 text-left text-[13px]"
              :class="person.id === meId ? 'font-extrabold' : 'font-semibold'"
            >
              <span class="flex items-center gap-2">
                <UserAvatar
                  :name="person.name"
                  :image="person.image"
                  :size="24"
                />
                {{ person.id === meId ? t('mvp.poll.you', { name: person.name }) : person.name }}
              </span>
            </th>
            <td
              v-for="slot in slots"
              :key="slot.id"
              class="border-b-[1.5px] border-line-soft text-center"
            >
              <!-- A cell with a Note is one 44 px button (#125), named by its sr-only text. Others keep the box but aren't focusable. -->
              <component
                :is="noteOf(person.id, slot.id) ? 'button' : 'div'"
                :type="noteOf(person.id, slot.id) ? 'button' : undefined"
                :aria-haspopup="noteOf(person.id, slot.id) ? 'dialog' : undefined"
                class="relative mx-auto grid size-11 place-items-center rounded-[12px]"
                :class="noteOf(person.id, slot.id) && ['hover:bg-paper-2', active?.key === `${person.id}|${slot.id}` && 'bg-paper-2']"
                v-on="noteOf(person.id, slot.id) ? handlersFor(person, slot.id, voteOf(person.id, slot.id)!.value, noteOf(person.id, slot.id)!) : {}"
              >
                <span
                  class="inline-grid size-[26px] place-items-center border-2 border-line"
                  :class="lookFor(person.id, slot.id).cell"
                >
                  <AppIcon
                    v-if="lookFor(person.id, slot.id).icon"
                    :icon="lookFor(person.id, slot.id).icon!"
                    :size="13"
                  />
                </span>
                <!-- The dot marks a Note (#102); its text is in the sr-only span. -->
                <span
                  v-if="noteOf(person.id, slot.id)"
                  aria-hidden="true"
                  class="absolute top-1 right-1 size-2.5 rounded-full border-2 border-line bg-primary"
                />
                <span class="sr-only">{{ textFor(person.id, slot.id) }}</span>
              </component>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <NotePopover
      :open="mode === 'popover'"
      :anchor="active?.el ?? null"
      :name="active?.person.name ?? ''"
      :image="active?.person.image ?? null"
      :value="active?.vote ?? 'yes'"
      :note="active?.note ?? ''"
      @pointerenter="cancelClose"
      @pointerleave="closePopoverSoon"
    />
    <NoteDialog
      :open="mode === 'dialog'"
      :name="active?.person.name ?? ''"
      :image="active?.person.image ?? null"
      :value="active?.vote ?? 'yes'"
      :note="active?.note ?? ''"
      @close="closeDialog"
    />
    <div>
      <AppButton
        variant="secondary"
        size="md"
        @click="exportCsv"
      >
        {{ t('mvp.poll.exportCsv') }}
      </AppButton>
    </div>
  </div>
</template>
