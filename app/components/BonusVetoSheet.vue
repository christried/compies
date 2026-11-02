<script setup lang="ts">
import { teamName } from '~/utils/board'
import type { BoardTeam } from '~~/shared/event'
import { BONUS_VETO_MAX } from '~~/shared/rounds'

// The Host grants a Party a Bonus Veto (#233, spec #218 § Bonus Vetoes): one row per Party in its Team colour, with its count and a hold
// to confirm. There is no undo, so nothing here takes one back. At BONUS_VETO_MAX a Party's button is disabled with the reason. The sheet
// stays open after a grant: the page refetches the Event and the counts follow (EventHostDialogs sends it).
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
        <!-- Keyed by its count: a grant starts the button again from idle, so the next grant to this Party needs its own hold. -->
        <HoldToConfirmButton
          :key="countOf(team)"
          block
          size="card"
          :label="t('bonusVeto.grant')"
          :holding-label="t('veto.holding')"
          :done-label="t('bonusVeto.done')"
          :disabled="countOf(team) >= BONUS_VETO_MAX"
          :disabled-reason="t('error.bonusVetoLimit')"
          :action="() => grant(team.position)"
        />
      </li>
    </ul>
  </AppSheet>
</template>
