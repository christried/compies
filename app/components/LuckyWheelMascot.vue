<script setup lang="ts">
import { mascotBox, mascotMoments, mascotPhase, type MascotSpin, type MascotWidth } from '~/utils/wheel-mascot'
import { buildMascotTravel } from '~/utils/wheel-mascot-run'

// Compibert beside the Lucky Wheel (#526, spec #503, hand-off note 16-compibert-gluecksrad.md, option 1b „Hinterm Rad“): the bust peeks out from behind
// the wheel at its upper right during a spin, is excited, holds his breath at the brake, cheers at the stop and leaves with the drawn slice.
// He is mounted only while he is there (`mascotPhase`), so a wheel at rest has no rig and loads nothing. His stage and state are pure
// functions of the server's time (`utils/wheel-mascot.ts`, ADR 0013); `now` is the wheel's own clock, handed down, so a late joiner and a
// returning tab get his place for the time at once and nothing is replayed, and he reads no clock of his own. His way in and out is a paused
// GSAP timeline moved by that clock (`utils/wheel-mascot-run.ts`, ADR 0015); the rig is the bust. He is told the spin's two instants and
// nothing of the draw, so he cannot show it (CODING_STANDARDS § Secrecy), and he says nothing to a screen reader.
const props = defineProps<{
  /** From the wheel's breakpoint (`MD_QUERY`), not from `useRoomy`: the bust's size. */
  width: MascotWidth
  spin: MascotSpin
  /** The Event's Hidden wheel setting: his cheer waits for the reveal, for every viewer alike. */
  hidden: boolean
  /** The server's time in epoch ms (the wheel's `clock`); null before the page has mounted, so the server's render and the first client render agree. */
  now: number | null
  reduced: boolean
}>()

const box = useTemplateRef<HTMLElement>('box')
const phase = computed(() => (props.now === null ? null : mascotPhase(props.spin, props.hidden, props.reduced, props.now)))
const placement = computed(() => mascotBox(props.width))
/** The travel is built and at the clock's place; until then the box is transparent (`data-[ready=false]:opacity-0`), so he never shows at rest before his way in; GSAP owns the inline opacity after. */
const ready = ref(false)

let timeline: ReturnType<typeof buildMascotTravel> | undefined
let building = 0

function seek() {
  if (timeline && props.now !== null) timeline.time(Math.max(0, props.now - props.spin.spinStartAt) / 1000, false)
}

function release() {
  building++
  timeline?.kill()
  timeline = undefined
  ready.value = false
}

async function build(element: HTMLElement) {
  const ticket = ++building
  let gsap
  try {
    gsap = await loadGsap()
  }
  catch {
    return // the chunk did not load: he stays absent, the wheel does not need him
  }
  if (ticket !== building || box.value !== element) return
  timeline?.kill()
  timeline = buildMascotTravel(gsap, element, { width: props.width, spin: props.spin, hidden: props.hidden, reduced: props.reduced })
  seek()
  ready.value = true
}

// Built when his box appears, put at the clock's place every frame after, torn down when he has left.
watch(box, element => (element ? void build(element) : release()), { flush: 'post' })
watch(() => props.now, seek)
watch([() => props.width, () => props.reduced], () => {
  if (box.value) void build(box.value)
})

// The chunk is asked for when a spin is ahead and motion is not reduced, the ceremony's rule: a wheel at rest, or whose spin has long ended,
// loads none (ADR 0015). The rig and the travel ask again under reduced motion, as the rig's blink does.
watch(() => props.now !== null && props.now < mascotMoments(props.spin, props.hidden, props.reduced).goneAt, (ahead) => {
  if (ahead && !props.reduced) loadGsap().catch(() => {})
}, { immediate: true })

onBeforeUnmount(release)
</script>

<template>
  <div
    v-if="phase"
    ref="box"
    class="wheel-mascot pointer-events-none absolute z-0 left-(--wm-left) data-[ready=false]:opacity-0"
    :style="{ '--wm-left': placement.left, 'top': `${placement.top}px`, 'width': `${placement.size}px` }"
    aria-hidden="true"
    data-testid="wheel-mascot"
    :data-stage="phase.stage"
    :data-width="width"
    :data-ready="ready ? 'true' : 'false'"
  >
    <CompibertRig
      variant="bust"
      :size="placement.size"
      :state="phase.state"
    />
  </div>
</template>
