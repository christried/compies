<script setup lang="ts">
import { teamName } from '~/utils/board'

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

/** Circle, triangle, square, diamond, cross, bar, arc, star: one symbol per colour (TeamMark.dc.html). */
const SYMBOLS = [
  'M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16Z',
  'M12 3.5 21 19.5H3Z',
  'M5 5h14v14H5Z',
  'M12 2.5 21.5 12 12 21.5 2.5 12Z',
  'M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z',
  'M3 8.5h18v7H3Z',
  'M3 17a9 9 0 0 1 18 0Z',
  'M12 2 14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z',
]

const index = computed(() => Math.max(1, Math.min(8, Math.round(props.team))))
const label = computed(() => (props.standalone ? teamName(index.value, t) : undefined))
</script>

<template>
  <span
    class="grid flex-none place-items-center rounded-pill border-line"
    :class="size >= 28 ? 'border-[2.5px]' : 'border-2'"
    :style="{ width: `${size}px`, height: `${size}px`, background: `var(--cp-team-${index})` }"
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
        :d="SYMBOLS[index - 1]"
        :fill="`var(--cp-team-${index}-ink)`"
      />
    </svg>
  </span>
</template>
