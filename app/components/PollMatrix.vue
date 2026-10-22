<script setup lang="ts">
import { Check, Minus, X } from '@lucide/vue'
import type { VoteValue } from '~~/shared/poll'

// "Wer kann wann?": everyone in the Session against every Slot (02-components § PollMatrix). A real
// table with row and column headers. "noch nicht abgestimmt" (no Vote yet) is drawn dashed and is
// not the same as Nein. Scrolls sideways on phones.
export interface MatrixPerson {
  id: string
  name: string
  image: string | null
  isHost: boolean
}

export interface MatrixSlot {
  id: string
  label: string
  past: boolean
}

const props = defineProps<{
  people: MatrixPerson[]
  slots: MatrixSlot[]
  votes: { slotId: string, userId: string, value: VoteValue }[]
  meId: string
}>()

const { t } = useI18n()

const valueOf = computed(() => {
  const map = new Map<string, VoteValue>()
  for (const vote of props.votes) map.set(`${vote.userId}|${vote.slotId}`, vote.value)
  return (userId: string, slotId: string) => map.get(`${userId}|${slotId}`) ?? null
})

// One look per Vote value (#11 § Acceptance: yes, maybe, no and the dashed "not voted yet").
const LOOK: Record<VoteValue | 'open', { key: string, icon?: typeof Check, cell: string }> = {
  yes: { key: 'poll.yes', icon: Check, cell: 'bg-success text-on-success border-solid rounded-full' },
  maybe: { key: 'poll.maybe', icon: Minus, cell: 'bg-warning text-on-warning border-solid rounded-full' },
  no: { key: 'poll.no', icon: X, cell: 'bg-surface text-ink border-solid rounded-[6px]' },
  open: { key: 'mvp.poll.notVoted', cell: 'bg-transparent text-ink-3 border-dashed rounded-full' },
}

function lookFor(userId: string, slotId: string) {
  return LOOK[valueOf.value(userId, slotId) ?? 'open']
}
</script>

<template>
  <div class="overflow-x-auto rounded-[14px] border-(length:--cp-bw) border-line bg-surface">
    <table class="w-full min-w-[418px] border-collapse md:min-w-0">
      <caption class="sr-only">
        {{ t('mvp.poll.whoWhen') }}
      </caption>
      <thead>
        <tr>
          <th
            scope="col"
            class="border-b-2 border-line-soft px-3 py-2"
          />
          <th
            v-for="slot in slots"
            :key="slot.id"
            scope="col"
            class="border-b-2 border-line-soft px-1 py-2 text-center text-[12px] leading-tight font-extrabold"
            :class="slot.past && 'text-ink-3'"
          >
            {{ slot.label }}
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
            class="border-b-[1.5px] border-line-soft px-3 py-1.5 text-left text-[13px]"
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
            :title="t(lookFor(person.id, slot.id).key)"
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
            <span class="sr-only">{{ t(lookFor(person.id, slot.id).key) }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
