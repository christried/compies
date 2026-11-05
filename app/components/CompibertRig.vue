<script setup lang="ts">
import fullSvg from '~/assets/compibert/compibert-full.svg?raw'
import headSvg from '~/assets/compibert/compibert-head.svg?raw'

// The animated Compibert (#311, ADR 0015): the same SVG assets as `Compibert.vue`, mounted and moved by GSAP. `Compibert.vue` stays plain markup
// without any script (header, Construction page, empty states), so a page that has no rig loads no GSAP; this one is for the ceremony's end frame.
// The server and the first paint show the still pose (open eyes, no GSAP); the rig takes over in onMounted.
const props = withDefaults(defineProps<{
  state?: RigState
  /** Fixed for the instance's life: change it with `:key`. */
  variant?: RigVariant
  /** Width in px; without it the rig fills its container's width. Full is 404 × 344, the head is square. */
  size?: number
}>(), { state: 'idle', variant: 'full', size: undefined })

// Cheap outline on weak devices (hand-off § Performance): the hard shadow's offset in the figure's own units, 7 and 8 of the 404-wide viewBox.
const SHADOW_X = 7 / 404
const SHADOW_Y = 8 / 404
const WEAK_CORES = 4

const root = useTemplateRef<HTMLElement>('root')
const uid = useId()
const prefix = `cb${uid.replace(/\W/g, '')}_`
// Depends on the variant and the prefix only, never on `size` or `state`: Vue must never replace the DOM that GSAP is animating.
const svg = computed(() => rigMarkup(props.variant === 'full' ? fullSvg : headSvg, props.variant, prefix))

const ready = ref(false)
const onStage = ref(true)
const inView = ref(true)
const held = ref(false)
const cheap = ref(false)
const shadow = ref({ x: 0, y: 0 })
const animating = computed(() => ready.value && onStage.value && inView.value)

let rig: Rig | undefined
let unmounted = false
let leaveStage = () => {}
let stopWatching = () => {}

// A rig animates only while it is on the stage and on screen; off-screen it is also hidden, so the browser does not paint it.
watch([onStage, inView], () => {
  rig?.setActive(onStage.value && inView.value)
  const figure = root.value?.querySelector('svg')
  if (figure) figure.style.visibility = inView.value ? '' : 'hidden'
}, { flush: 'sync' })

function enter(state: RigState) {
  const reduced = reducedMotion()
  held.value = reduced
  rig?.setState(state, reduced)
}
watch(() => props.state, enter)

onMounted(async () => {
  const element = root.value
  if (!element) return
  // Head crops are cheap and exempt from the one-rig rule.
  if (props.variant === 'full') leaveStage = joinStage((allowed) => { onStage.value = allowed })
  stopWatching = watchView(element, (visible) => { inView.value = visible })
  // Client only, after mount, so the server's markup and the first client render agree.
  if (navigator.hardwareConcurrency <= WEAK_CORES) {
    const width = props.size ?? element.clientWidth
    shadow.value = { x: Math.round(width * SHADOW_X * 100) / 100, y: Math.round(width * SHADOW_Y * 100) / 100 }
    cheap.value = true
  }
  let gsap
  try {
    gsap = await loadGsap()
  }
  catch {
    return // the chunk did not load: the still pose stays
  }
  if (unmounted) return
  rig = mountRig(gsap, element, { variant: props.variant, reduced: reducedMotion() })
  ready.value = true
  enter(props.state)
  rig.setActive(onStage.value && inView.value)
})

onBeforeUnmount(() => {
  unmounted = true
  rig?.destroy()
  rig = undefined
  leaveStage()
  stopWatching()
})
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- the rig is our own static asset, not user content -->
  <span
    ref="root"
    class="compibert-rig block flex-none"
    :class="[
      variant === 'full' ? 'overflow-visible' : 'compibert-rig--head overflow-hidden',
      cheap ? 'compibert-rig--cheap' : '',
    ]"
    :style="{
      'width': size ? `${size}px` : '100%',
      'aspectRatio': variant === 'full' ? '404 / 344' : '1',
      '--cb-hard': `url(#${prefix}hrd)`,
      '--cb-sticker': `url(#${prefix}stk)`,
      '--cb-dx': `${shadow.x}px`,
      '--cb-dy': `${shadow.y}px`,
    }"
    aria-hidden="true"
    :data-state="state"
    :data-ready="ready ? 'true' : 'false'"
    :data-animating="animating ? 'true' : 'false'"
    :data-held="held ? 'true' : 'false'"
    v-html="svg"
  />
</template>

<style>
/* Light = hard shadow, dark = sticker rim, on the static `.cb-fig` group: no filter parameter is ever tweened. The head crop has none. */
.compibert-rig {
  --cb-outline: var(--cb-hard);
}
[data-theme=dark] .compibert-rig {
  --cb-outline: var(--cb-sticker);
}
.compibert-rig > svg {
  display: block;
  overflow: inherit;
}
.compibert-rig .cb-fig {
  filter: var(--cb-outline);
}
.compibert-rig--head .cb-fig {
  filter: none;
}
/* Weak devices (4 cores or fewer): the SVG filter is the expensive part, so light gets a CSS drop-shadow of the same offset and dark gets no outline. */
.compibert-rig--cheap .cb-fig {
  filter: none;
}
.compibert-rig--cheap:not(.compibert-rig--head) {
  filter: drop-shadow(var(--cb-dx) var(--cb-dy) 0 #151515);
}
[data-theme=dark] .compibert-rig--cheap {
  filter: none;
}
</style>
