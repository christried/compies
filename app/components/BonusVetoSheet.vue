<script setup lang="ts">
import { teamName } from '~/utils/board'
import type { BoardTeam } from '~~/shared/event'
import { BONUS_VETO_MAX } from '~~/shared/rounds'

// The Host grants a Party a Bonus Veto (#233, spec #218 § Bonus Vetoes): one row per Party in its Team colour, with its count and a hold
// to confirm. There is no undo, so nothing here takes one back. At BONUS_VETO_MAX a Party's button is disabled with the reason. The sheet
// stays open after a grant: the page refetches the Event and the counts follow (EventHostDialogs sends it). The button shows "Gegeben"
// for DONE_MS and then starts again from idle, so the next grant to the Party needs its own hold (F7).
const props = defineProps<{
  open: boolean
  /** The Parties of the Game board, in team order. */
  teams: BoardTeam[]
  /** The Bonus Vetoes each Party has, index 0 = team 1. */
  granted: number[]
  /** Grants the Party one Bonus Veto; resolves to whether the server took it. */
  grant: (team: number) => Promise<boolean>
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const countOf = (team: BoardTeam) => props.granted[team.position - 1] ?? 0

/** How long a button shows its done state before it is ready for the next grant. */
const DONE_MS = 1500
/**
 * Each Party's button is keyed by how often it was reset, not by its count: the refetch that raises the count arrives before the
 * done state has painted, and a key on the count would mount a fresh idle button over it (F7). The key moves on DONE_MS after a grant.
 */
const resets = ref<Record<number, number>>({})
const timers = new Set<ReturnType<typeof setTimeout>>()
async function grantTo(team: BoardTeam): Promise<boolean> {
  const worked = await props.grant(team.position)
  if (worked) {
    const timer = setTimeout(() => {
      timers.delete(timer)
      resets.value[team.position] = (resets.value[team.position] ?? 0) + 1
    }, DONE_MS)
    timers.add(timer)
  }
  return worked
}
onBeforeUnmount(() => timers.forEach(clearTimeout))
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('bonusVeto.title')"
    @close="emit('close')"
  >
    <p class="m-0 text-[14px] text-ink-2">
      {{ t('bonusVeto.help') }}
    </p>
    <ul class="m-0 flex list-none flex-col gap-4 p-0">
      <li
        v-for="team in teams"
        :key="team.position"
        class="flex flex-col gap-2"
      >
        <TeamChip
          :team="team.position"
          :name="teamName(team, t)"
        />
        <p class="m-0 text-[14px] text-ink-2">
          {{ t('bonusVeto.count', countOf(team)) }}
        </p>
        <HoldToConfirmButton
          :key="resets[team.position] ?? 0"
          block
          size="card"
          :label="t('bonusVeto.grant')"
          :holding-label="t('veto.holding')"
          :done-label="t('bonusVeto.done')"
          :disabled="countOf(team) >= BONUS_VETO_MAX"
          :disabled-reason="t('error.bonusVetoLimit')"
          :action="() => grantTo(team)"
        />
      </li>
    </ul>
  </AppSheet>
</template>
