<script setup lang="ts">
import type { EventView } from '~~/shared/event'
import { reducedMotion } from '~/utils/motion'
import { SMOKE_SHAPES, smokeNextEdge, smokeRate, smokeWindows } from '~/utils/stage-smoke'

// The smoke behind the Event page's stage (#675, note 19-rauch-auf-der-buehne, option 1b „Aufsteigend“): five soft colour clouds that drift up
// over the shell's paper (the Hell dot grid, Dunkel's stage fog) and under every card. It is decoration: `aria-hidden`, no pointer, no text.
// Its motion is CSS (ADR 0015, `cp-smoke-rise-*`); the one thing script does is its rate, half speed in the five moments the note names
// (`stage-smoke.ts`), which is read from the Event read the page already has and the server clock it already keeps (ADR 0013: no new field,
// message or timer on the server). The layer is fixed over the visible stage, under the header and left of the panel: the page scrolls as a
// document, so an absolute layer would be page-tall and scroll away.
const props = defineProps<{
  view: Pick<EventView, 'wheel' | 'coin' | 'ceremony'>
  serverNow: () => number
  /** The Clip shows on this device (`clipOpen && data.clip`): the smoke dims to half and drifts at half speed until it is closed. */
  clipShown: boolean
}>()

const layer = useTemplateRef<HTMLElement>('layer')
const windows = computed(() => smokeWindows(props.view))
// Reads the clock at the edges of the windows only: the rate changes there and nowhere else. Null until the clock is usable: full speed.
const now = useServerTicker(() => props.serverNow(), {
  until: () => windows.value.reduce<number | null>((latest, w) => (latest === null || w.to > latest ? w.to : latest), null),
  every: (at) => {
    const edge = smokeNextEdge(windows.value, at)
    return edge === null ? 1000 : edge - at
  },
})
const rate = computed(() => (props.clipShown || (now.value !== null && smokeRate(windows.value, now.value) === 0.5) ? 0.5 : 1))

/** `updatePlaybackRate` keeps the position of an animation, so the change of speed has no jump. A transition of the layer (the dim) is left alone. */
function applyRate() {
  const element = layer.value
  if (!element || typeof element.getAnimations !== 'function' || reducedMotion()) return
  for (const animation of element.getAnimations({ subtree: true })) {
    if (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition) continue
    if (animation.playbackRate !== rate.value) animation.updatePlaybackRate(rate.value)
  }
}

watch(rate, applyRate, { flush: 'post' })
onMounted(applyRate)

const place = (box: { x: number, y: number, w: number, h: number }, prefix: string) => ({
  [`--${prefix}x`]: `${box.x}%`, [`--${prefix}y`]: `${box.y}%`, [`--${prefix}w`]: `${box.w}%`, [`--${prefix}h`]: `${box.h}%`,
})
</script>

<template>
  <!-- A CSS animation that starts later runs at 1: `animationstart` applies the rate to it. -->
  <div
    ref="layer"
    aria-hidden="true"
    data-layer="stage-smoke"
    class="stage-smoke pointer-events-none fixed top-[calc(3.5rem+var(--cp-bw))] right-0 bottom-0 left-0 layer-decor contain-strict overflow-hidden transition-opacity motion-reduce:transition-none md:top-[calc(var(--cp-header-h)+var(--cp-bw))] md:right-(--cp-panel-w) reduced:transition-none"
    :class="clipShown ? 'opacity-50 dur-slower ease-out' : 'opacity-100 dur-slow ease-in'"
    @animationstart="applyRate"
  >
    <div class="absolute inset-0 opacity-[.24] dark:opacity-[.12]">
      <div
        v-for="(shape, index) in SMOKE_SHAPES"
        :key="index"
        class="absolute top-(--sy) left-(--sx) h-(--sh) w-(--sw) rounded-full bg-[radial-gradient(closest-side,var(--c),transparent)] opacity-80 [--c:var(--smoke-hell)] [animation:var(--smoke-drift)] will-change-[transform,opacity] motion-reduce:animate-none motion-reduce:will-change-auto md:top-(--wy) md:left-(--wx) md:h-(--wh) md:w-(--ww) dark:[--c:var(--smoke-dunkel)] reduced:animate-none reduced:will-change-auto"
        :style="{
          ...place(shape.narrow, 's'),
          ...place(shape.wide, 'w'),
          '--smoke-hell': `var(--cp-${shape.hell})`,
          '--smoke-dunkel': `var(--cp-${shape.dunkel})`,
          '--smoke-drift': `${shape.keyframes} ${shape.legSeconds}s var(--cp-ease-io) ${shape.delaySeconds}s infinite alternate`,
        }"
      />
    </div>
  </div>
</template>
