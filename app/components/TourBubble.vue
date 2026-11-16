<script setup lang="ts">
// The Tour's bubble (#460, 17-rundgang.md § TourBubble): the explaining box in the popover look, with a tail that points at the thing and Compibert's face on
// its corner (the `face` slot). `TourLayer` sets where it stands (the fallthrough `style`) and how wide it is; its height is its content. The drop shadow is
// a `filter` on the box and the tail together, so the tail casts it too: ink in Hell, `--cp-hot` in Dunkel (the two colours of `shadow-modal`, no new token).
// `measure` is the hidden twin the layer reads the height from: the same width and content, no role, no ids, no live region.
const props = withDefaults(defineProps<{
  title: string
  body: string
  /** The step's number from 1, and how many there are. */
  step: number
  total: number
  /** The edge that holds the tail. */
  side: 'top' | 'bottom' | 'left' | 'right' | 'none'
  /** Along that edge, from the bubble's top-left. */
  tail?: { x: number, y: number } | null
  first: boolean
  last: boolean
  narrow: boolean
  /** What the polite live region says. */
  live?: string
  measure?: boolean
}>(), { tail: null, live: '', measure: false })

defineEmits<{
  back: []
  next: []
  skip: []
}>()

const { t } = useI18n()
const titleId = useId()
const bodyId = useId()
const root = useTemplateRef<HTMLElement>('root')
defineExpose({ root })

const TAIL_SIZE = { wide: 20, narrow: 16 }
const size = computed(() => (props.narrow ? TAIL_SIZE.narrow : TAIL_SIZE.wide))

/**
 * The tail: a square rotated 45°, the surface's fill, the border on its two outer sides, its tip rounded to 3 px. It stands on the border's centre line,
 * so it covers the border where it sits (`--cp-bw` is 3 px in Hell and 2.5 px in Dunkel: hence the calc, not a number).
 */
const tailStyle = computed(() => {
  if (!props.tail || props.side === 'none') return null
  const half = size.value / 2
  const line = 'var(--cp-bw) solid var(--cp-line)'
  const inset = `calc(var(--cp-bw) / 2 - ${half}px)`
  const base = { width: `${size.value}px`, height: `${size.value}px` }
  switch (props.side) {
    case 'top': return { ...base, left: `${props.tail.x - half}px`, top: inset, borderTop: line, borderLeft: line, borderTopLeftRadius: '3px' }
    case 'bottom': return { ...base, left: `${props.tail.x - half}px`, bottom: inset, borderBottom: line, borderRight: line, borderBottomRightRadius: '3px' }
    case 'left': return { ...base, top: `${props.tail.y - half}px`, left: inset, borderLeft: line, borderBottom: line, borderBottomLeftRadius: '3px' }
    default: return { ...base, top: `${props.tail.y - half}px`, right: inset, borderTop: line, borderRight: line, borderTopRightRadius: '3px' }
  }
})
</script>

<template>
  <div
    ref="root"
    :role="measure ? undefined : 'dialog'"
    :aria-modal="measure ? undefined : 'true'"
    :aria-labelledby="measure ? undefined : titleId"
    :aria-describedby="measure ? undefined : bodyId"
    data-tour-bubble
    class="tour-bubble absolute"
  >
    <div
      class="relative"
      style="filter: drop-shadow(10px 10px 0 var(--tour-shadow))"
    >
      <div
        class="relative rounded-[18px] border-(length:--cp-bw) border-line bg-surface text-ink"
        :class="narrow ? 'p-4' : 'px-5 py-[18px]'"
      >
        <div
          class="flex items-start justify-between gap-3"
          :class="narrow ? 'min-h-[30px]' : 'min-h-[34px]'"
        >
          <h2
            :id="measure ? undefined : titleId"
            class="m-0 font-display text-h3 leading-[1.05] font-normal text-balance"
            :class="narrow ? 'ml-[54px]' : 'ml-[72px]'"
          >
            {{ title }}
          </h2>
          <span
            :aria-label="t('tour.countLabel', { n: step, total })"
            class="flex-none pt-1 text-[13px] font-bold text-ink-2 tabular-nums"
          >{{ t('tour.count', { n: step, total }) }}</span>
        </div>
        <p
          :id="measure ? undefined : bodyId"
          class="m-0 mt-1 text-pretty"
          :class="narrow ? 'text-[15px] leading-[1.45]' : 'text-[16px] leading-[1.45]'"
        >
          {{ body }}
        </p>
        <div class="mt-4 flex items-center gap-2">
          <button
            type="button"
            class="-ml-2 inline-flex h-11 items-center px-2 text-[14px] font-bold text-ink-2 underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
            @click="$emit('skip')"
          >
            {{ t('tour.skip') }}
          </button>
          <span class="flex-1" />
          <AppButton
            v-if="!first"
            variant="secondary"
            @click="$emit('back')"
          >
            {{ t('common.back') }}
          </AppButton>
          <AppButton
            data-autofocus
            @click="$emit('next')"
          >
            {{ last ? t('tour.finish') : t('common.next') }}
          </AppButton>
        </div>
      </div>
      <span
        v-if="tailStyle"
        aria-hidden="true"
        data-tour-tail
        class="absolute rotate-45 bg-surface"
        :style="tailStyle"
      />
    </div>
    <slot name="face" />
    <!-- Read out on each step: its number, title and text (spec #622, story 27). The visible texts are the dialog's name and content. -->
    <p
      v-if="!measure"
      role="status"
      aria-live="polite"
      class="sr-only"
    >
      {{ live }}
    </p>
  </div>
</template>

<style>
.tour-bubble {
  --tour-shadow: var(--cp-shadow-ink);
}
[data-theme=dark] .tour-bubble {
  --tour-shadow: var(--cp-hot);
}
@media (prefers-color-scheme: dark) {
  [data-theme=system] .tour-bubble {
    --tour-shadow: var(--cp-hot);
  }
}
</style>
