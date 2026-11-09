<script setup lang="ts">
import { COUNT_TICK_MS, countAt } from '~/utils/count-up'
import { motionMs, reducedMotion } from '~/utils/motion'

// A live number with tabular figures so it does not jump when it changes (02-components § CpNum).
// With `say`, the digits are hidden from screen readers and `say` is read instead ("noch 42 Sekunden").
// Without it, the digits are read as they are.
// With `from` (#276, the Standings in motion) a numeric `value` counts up (or down) from it over 0.6 s `power2.out`, written at most 15 times a
// second (04-motion § Leaderboard). The digits count, `say` holds the final value from the start, so a screen reader is not read a count. Under
// reduced motion, for a string `value` (a timer) and when `from` is `value` the number shows at once. `from` turning undefined changes nothing on screen.
const props = withDefaults(defineProps<{
  value: number | string
  say?: string
  from?: number
}>(), { say: undefined, from: undefined })

/** The start of a count, or null when the number shows at once. */
function countFrom(): number | null {
  const { value, from } = props
  if (typeof value !== 'number' || typeof from !== 'number' || from === value || reducedMotion()) return null
  return from
}

// The server never counts (no news on a load); a client render that starts a count shows its first number from the first frame.
const shown = ref<number | string>(import.meta.client ? countFrom() ?? props.value : props.value)
let frame = 0

function stop() {
  cancelAnimationFrame(frame)
  frame = 0
}

function start() {
  stop()
  const from = countFrom()
  if (from === null) {
    shown.value = props.value
    return
  }
  const to = props.value as number
  const duration = motionMs('--cp-dur-slower', '600ms')
  const began = Date.now()
  let wrote = began
  shown.value = from
  const step = () => {
    const elapsed = Date.now() - began
    if (elapsed >= duration) {
      shown.value = to
      frame = 0
      return
    }
    if (Date.now() - wrote >= COUNT_TICK_MS) {
      shown.value = countAt(from, to, elapsed, duration)
      wrote = Date.now()
    }
    frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
}

watch([() => props.value, () => props.from], ([value, from], [previous]) => {
  // The news expired: `from` is gone, the value is the one the count landed on (or is landing on).
  if (from === undefined && value === previous) return
  start()
}, { flush: 'pre' })

onMounted(() => {
  if (countFrom() !== null) start()
})
onBeforeUnmount(stop)
</script>

<template>
  <span class="font-num tabular-nums">
    <span :aria-hidden="say ? 'true' : undefined">{{ shown }}</span>
    <span
      v-if="say"
      class="sr-only"
    >{{ say }}</span>
  </span>
</template>
