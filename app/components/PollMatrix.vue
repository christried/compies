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
</script>

<template>
  <div class="grid gap-3">
    <!-- relative: the cells' sr-only texts are absolute and would otherwise widen the whole page on phones. -->
    <div class="relative overflow-x-auto rounded-[14px] border-(length:--cp-bw) border-line bg-surface">
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
              :title="textFor(person.id, slot.id)"
            >
              <span
                class="relative inline-grid size-[26px] place-items-center border-2 border-line"
                :class="lookFor(person.id, slot.id).cell"
              >
                <AppIcon
                  v-if="lookFor(person.id, slot.id).icon"
                  :icon="lookFor(person.id, slot.id).icon!"
                  :size="13"
                />
                <!-- A Note is marked with a dot at the corner (#102); its text is in the title and the sr-only text. -->
                <span
                  v-if="voteOf(person.id, slot.id)?.note"
                  aria-hidden="true"
                  class="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-ink bg-primary"
                />
              </span>
              <span class="sr-only">{{ textFor(person.id, slot.id) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
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
