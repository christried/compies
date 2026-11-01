<script setup lang="ts">
import { reducedMotion } from '~/utils/motion'
import { SCRAMBLE_FRAME_MS, finalAngle, removalEase, removalEnd, revealStage, scramble, sliceSpans, wheelAngle, type WheelTiming } from '~/utils/wheel'
import type { WheelView } from '~~/shared/event'

// The Lucky Wheel on the stage (#229, 02-components § LuckyWheel, 04-motion § Lucky Wheel, reference App Spielrunde ?s=wheel).
// It shows the games left on the wheel and, from the server's spin, turns toward a fixed stop: the angle is a function of the
// server's clock alone (utils/wheel.ts), so every device, a late joiner included, stands at the same angle at the same moment. A
// requestAnimationFrame loop feeds it the server time while a spin runs and 3.5 s past its stop; at rest nothing runs.
// At the stop the drawn slice gets its outline and the result card comes. Under a Hidden wheel a Member sees placeholders; the
// drawn label turns into the real game half a second after the stop (a scramble, under reduced motion a crossfade), and the
// drawn slice leaves at stop + 2.8 s instead of 2.2 s. The drawn slice shrinks and the others close the gap (0.6 s), or fade and
// jump under reduced motion. Left out of 0.7: the bulbs, the flapper, Compibert and the sounds (the Release has no sound).
// The wheel is 340 px at most on a phone and 420 px from md up, and never changes size during a spin.
const props = defineProps<{
  wheel: WheelView
  /** The Event's Hidden wheel setting: it delays the drawn slice's removal for every viewer alike, so the devices stay in step. */
  hidden: boolean
  isHost: boolean
  /** The server's time in epoch ms (useServerClock). */
  serverNow: () => number
}>()

const { t } = useI18n()

/** The slices' fills (reference GameWheel). */
const FILLS = ['var(--cp-primary)', 'var(--cp-mint)', 'var(--cp-pop)', 'var(--cp-cobalt)']
/** How long past the stop the loop keeps running: the removal ends at 2.8 s + 0.6 s on a Hidden wheel. */
const TAIL_MS = 100
const RADIUS = 180
const LABEL_MAX = 22

const mounted = ref(false)
const reduced = ref(false)
const now = ref(0)
let frame = 0

const spin = computed(() => props.wheel.spin)
const timing = computed((): WheelTiming | null => {
  const current = spin.value
  return current && { spinStartAt: Date.parse(current.spinStartAt), stopAt: Date.parse(current.stopAt), slices: current.slices, resultIndex: current.resultIndex, resultOffset: current.resultOffset }
})
/** The server time of this frame; null before the page has mounted, so the server's render and the first client render agree. */
const clock = computed(() => (mounted.value ? now.value : null))
/** Whether the spin's own layout is on screen: from the commit until the drawn slice has left. */
const running = computed(() => timing.value !== null && clock.value !== null && clock.value < removalEnd(timing.value, props.hidden))
const stopped = computed(() => timing.value !== null && clock.value !== null && clock.value >= timing.value.stopAt)

function drive() {
  cancelAnimationFrame(frame)
  frame = 0
  reduced.value = reducedMotion()
  now.value = props.serverNow()
  const current = timing.value
  if (current && now.value < removalEnd(current, props.hidden) + TAIL_MS) frame = requestAnimationFrame(tick)
}
function tick() {
  now.value = props.serverNow()
  const current = timing.value
  frame = current && now.value < removalEnd(current, props.hidden) + TAIL_MS ? requestAnimationFrame(tick) : 0
}
onMounted(() => {
  mounted.value = true
  drive()
})
onBeforeUnmount(() => cancelAnimationFrame(frame))
watch(() => spin.value?.drawId, () => {
  if (mounted.value) drive()
})

// The wheel as drawn: the spin's slices while it runs, else the games left on the wheel (a Member under a Hidden wheel sees ???).
const count = computed(() => (running.value ? spin.value!.slices : props.wheel.count))
const spans = computed(() => {
  const current = timing.value
  return running.value && current ? sliceSpans(current.slices, current.resultIndex, removalEase(current, clock.value!, props.hidden, reduced.value)) : sliceSpans(count.value, -1, 0)
})
const names = computed(() => {
  if (running.value) return spin.value!.labels ?? Array.from({ length: count.value }, () => t('wheel.placeholderQ'))
  return props.wheel.slices ? props.wheel.slices.map(slice => slice.name) : Array.from({ length: count.value }, () => t('wheel.placeholderQ'))
})

/** The wheel rests where the last spin stopped (a multiple of a full turn off the final angle); 0 before the first one. */
const angle = computed(() => {
  const current = timing.value
  if (!current || clock.value === null) return 0
  return (running.value ? wheelAngle(current, clock.value, reduced.value) : finalAngle(current) % 360) + 0
})

// The drawn label under a Hidden wheel (a Member's): the placeholder until 0.5 s after the stop, then it turns into the game.
// The read that follows the stop already carries the real name there, so the placeholder is kept from the read before it.
const concealed = computed(() => props.hidden && !props.isHost)
const held = ref<{ drawId: string, labels: string[] } | null>(null)
watchEffect(() => {
  const current = spin.value
  if (current?.labels && concealed.value && timing.value && clock.value !== null && clock.value < timing.value.stopAt) held.value = { drawId: current.drawId, labels: current.labels }
})

function labelOf(index: number): { text: string, opacity: number } {
  const text = names.value[index] ?? ''
  const current = timing.value
  if (!running.value || !concealed.value || !current || index !== current.resultIndex) return { text, opacity: 1 }
  const stage = revealStage(current, clock.value!, reduced.value)
  if (stage.stage === 'real') return { text, opacity: 1 }
  if (stage.stage === 'placeholder') return { text: held.value?.drawId === spin.value!.drawId ? held.value.labels[index] ?? t('wheel.placeholderQ') : t('wheel.placeholderQ'), opacity: 1 }
  return reduced.value ? { text, opacity: stage.progress } : { text: scramble(text, Math.floor(stage.progress * (300 / SCRAMBLE_FRAME_MS))), opacity: 1 }
}

const shortened = (text: string) => (text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text)
const fontSize = computed(() => Math.max(10, Math.min(19, 230 / Math.max(count.value, 1) + 6)))

/** A point on the wheel `degrees` clockwise from the top. */
const point = (degrees: number, radius: number) => `${(200 + radius * Math.sin((degrees * Math.PI) / 180)).toFixed(2)},${(200 - radius * Math.cos((degrees * Math.PI) / 180)).toFixed(2)}`
function pathOf({ start, end }: { start: number, end: number }): string {
  if (end - start < 0.01) return ''
  if (end - start >= 359.99) return `M200,${200 - RADIUS}A${RADIUS},${RADIUS} 0 1 1 200,${200 + RADIUS}A${RADIUS},${RADIUS} 0 1 1 200,${200 - RADIUS}Z`
  return `M200,200L${point(start, RADIUS)}A${RADIUS},${RADIUS} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end, RADIUS)}Z`
}
const fillOf = (index: number) => (index === count.value - 1 && count.value % FILLS.length === 1 ? 'var(--cp-surface-2)' : FILLS[index % FILLS.length])

/** The drawn slice has its outline from the stop on, until it leaves. */
const winner = computed(() => (running.value && stopped.value && timing.value ? timing.value.resultIndex : -1))
/** How far the drawn slice has faded under reduced motion (the redistribution then jumps). */
const drawnOpacity = computed(() => {
  const current = timing.value
  if (!current || !running.value || !reduced.value || clock.value === null) return 1
  return removalEase(current, clock.value, props.hidden, true) === 1 ? 0 : 1
})

const card = computed(() => (stopped.value && spin.value?.game ? spin.value.game : null))
const status = computed(() => {
  if (timing.value && clock.value !== null && clock.value < timing.value.stopAt) return t('wheel.spinning')
  return count.value === 0 ? t('wheel.empty') : t('wheel.count', { n: count.value })
})
const headingId = useId()
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex flex-col items-center gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 text-ink"
  >
    <div class="flex w-full items-baseline justify-between gap-3">
      <h2
        :id="headingId"
        class="m-0 font-display text-[22px] leading-tight font-normal"
      >
        {{ t('wheel.title') }}
      </h2>
      <p class="m-0 text-[14px] font-bold text-ink-2">
        {{ status }}
      </p>
    </div>

    <div class="relative aspect-square w-full max-w-[340px] md:max-w-[420px]">
      <svg
        viewBox="0 0 400 400"
        role="img"
        :aria-label="t('wheel.aria', { n: count })"
        class="size-full overflow-visible"
      >
        <g
          data-testid="wheel-rotor"
          :style="{ transform: `rotate(${angle}deg)`, transformOrigin: '200px 200px' }"
        >
          <circle
            cx="200"
            cy="200"
            :r="RADIUS + 10"
            fill="var(--cp-surface-2)"
            stroke="var(--cp-line)"
            stroke-width="4"
          />
          <template
            v-for="(span, index) in spans"
            :key="index"
          >
            <path
              v-if="pathOf(span) !== ''"
              data-testid="wheel-slice"
              :d="pathOf(span)"
              :fill="fillOf(index)"
              stroke="var(--cp-line)"
              :stroke-width="winner === index ? 7 : 3"
              stroke-linejoin="round"
              :opacity="winner === index ? drawnOpacity : 1"
            />
            <text
              v-if="pathOf(span) !== '' && span.end - span.start > 4"
              :data-testid="`wheel-label-${index}`"
              :transform="`rotate(${(span.start + span.end) / 2 - 90} 200 200)`"
              :x="200 + RADIUS - 12"
              y="200"
              text-anchor="end"
              dominant-baseline="central"
              :font-size="fontSize"
              font-weight="800"
              fill="var(--cp-on-primary)"
              :opacity="labelOf(index).opacity"
            >{{ shortened(labelOf(index).text) }}</text>
          </template>
        </g>
        <circle
          cx="200"
          cy="200"
          r="22"
          fill="var(--cp-surface)"
          stroke="var(--cp-line)"
          stroke-width="4"
        />
        <!-- The pointer: it stays where it is while the wheel turns. -->
        <path
          d="M182,-6 L218,-6 L200,34 Z"
          fill="var(--cp-hot)"
          stroke="var(--cp-line)"
          stroke-width="4"
          stroke-linejoin="round"
        />
      </svg>
    </div>

    <div
      v-if="card"
      class="animate-pop-in flex w-full max-w-[420px] flex-col gap-2 rounded-[14px] border-2 border-line bg-surface-2 p-3"
    >
      <p class="m-0 text-[13px] font-extrabold tracking-wide text-ink-2 uppercase">
        {{ running ? t('wheel.says') : t('wheel.last') }}
      </p>
      <GameCard
        :game="card"
        layout="row"
      />
    </div>

    <!-- The result for screen readers, announced when the wheel stops. -->
    <p
      role="status"
      aria-live="polite"
      class="sr-only"
    >
      {{ card ? t('activity.wheel', { game: card.name }) : '' }}
    </p>
  </section>
</template>
