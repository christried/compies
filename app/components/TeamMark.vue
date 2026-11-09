<script setup lang="ts">
import { teamName } from '~/utils/board'
import { teamVar } from '~/utils/team-style'
import { teamPosition } from '~~/shared/settings'
import { TEAM_SYMBOLS } from '~~/shared/team-marks'

// A team's colour and symbol, never colour alone (DS People, TeamMark.dc.html, 02-components § TeamMark). Next to the
// team's name it is decorative; `standalone` gives it the name „Team Rot“ for a place that shows no text. The colour
// and the colour of the symbol come from the Team colour tokens (`--cp-team-n`, `--cp-team-n-ink`).
const props = withDefaults(defineProps<{
  /** The Team colour index, 1 to 8. */
  team: number
  size?: number
  standalone?: boolean
}>(), { size: 24, standalone: false })

const { t } = useI18n()

const index = computed(() => teamPosition(props.team))
const label = computed(() => (props.standalone ? teamName(index.value, t) : undefined))
</script>

<template>
  <span
    class="grid flex-none place-items-center rounded-pill border-line"
    :class="size >= 28 ? 'border-[2.5px]' : 'border-2'"
    :style="{ width: `${size}px`, height: `${size}px`, background: teamVar(index) }"
    :role="standalone ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="standalone ? undefined : 'true'"
  >
    <svg
      viewBox="0 0 24 24"
      :width="Math.round(size * 0.56)"
      :height="Math.round(size * 0.56)"
      class="block"
      aria-hidden="true"
    >
      <path
        :d="TEAM_SYMBOLS[index - 1]"
        :fill="teamVar(index, 'ink')"
      />
    </svg>
  </span>
</template>
