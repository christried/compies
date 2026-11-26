<script setup lang="ts">
import fullSvg from '~/assets/compibert/compibert-full.svg?raw'
import headSvg from '~/assets/compibert/compibert-head.svg?raw'
import { PARTY_HAT } from '~/utils/compibert-hat'

// The animated Compibert (#311, ADR 0015): the same SVG assets as `Compibert.vue`, mounted and moved by GSAP. `Compibert.vue` stays plain markup
// without any script (header, Construction page, empty states), so a page that has no rig loads no GSAP; this one is for the ceremony's end frame.
// The server and the first paint show the still pose (open eyes, no GSAP); the rig takes over in onMounted.
const props = withDefaults(defineProps<{
  /** The base: what he does while no reaction runs. */
  state?: RigState
  /** A timed reaction over the base (#928): a new object is a new reaction, even with equal content. It returns to `state` by itself after its length; the caller never flips `state` back. */
  reaction?: Reaction | null
  /** Fixed for the instance's life: change it with `:key`. */
  variant?: RigVariant
  /** Width in px; without it the rig fills its container's width. Full is 404 × 344, the head and the bust (#526) are square. */
  size?: number
  /** The Tour's face (#460): where the pupils look, in degrees from the face's centre (0 = right, 90 = down); null looks straight ahead. Applied after each state change. */
  look?: number | null
  /** false: the idle has no micro actions (the blink stays). */
  micro?: boolean
  /** Seconds after which a `cheer` stops hopping and lands. */
  hopsFor?: number
  /** The head crop wears the Sticker outline in Dunkel (and System-dark): the cream rim keeps him from vanishing on a dark bubble. Hell has none. */
  rim?: boolean
  /** The party hat of the header's head (#673): drawn at the svg's root, as the still head does, so it does not follow the head's motion. Fixed for the instance's life: change it with `:key`. */
  accessory?: 'partyhat'
}>(), { state: 'idle', reaction: null, variant: 'full', size: undefined, look: null, micro: true, hopsFor: undefined, rim: false, accessory: undefined })

const emit = defineEmits<{
  /** Once, when GSAP has loaded, the rig is mounted and the base is entered: the boot splash (#674) starts its run-in on it. Never after a failed load. */
  ready: []
}>()

// Cheap outline on weak devices (hand-off § Performance): the hard shadow's offset in the figure's own units, 7 and 8 of the viewBox's width
// (`viewWidth`: 404 for the full figure, 254 for the bust's crop of it (#526), 192 for the head (#584)).
const SHADOW_X = 7
const SHADOW_Y = 8
const WEAK_CORES = 4

const root = useTemplateRef<HTMLElement>('root')
const uid = useId()
const prefix = `cb${uid.replace(/\W/g, '')}_`
// Depends on the variant, the prefix and the accessory only, never on `size` or `state`: Vue must never replace the DOM that GSAP is animating (a new accessory is a new instance, by `:key`).
const svg = computed(() => {
  const markup = rigMarkup(props.variant === 'head' ? headSvg : fullSvg, props.variant, prefix)
  return props.accessory === 'partyhat' ? markup.replace(/<\/svg>$/, `${PARTY_HAT}</svg>`) : markup
})

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

// A rig that was never asked to look keeps the states' own pupils (`suspense` glances): only a look, or the return from one, touches them.
let looked = false
function applyLook(instant: boolean) {
  if (props.look === null && !looked) return
  looked = props.look !== null
  rig?.lookAt(props.look, instant)
}

// What shows: the running reaction, else the base.
const visible = ref<RigState>(props.state)
let running: RigState | null = null
let reactionTimer: ReturnType<typeof setTimeout> | undefined
// A reaction that came before the rig was there (GSAP still loading, or set at mount): it starts, with its full length, once the base has been entered.
let early: Reaction | null = props.reaction

/** The single place that sets the rig's state. */
function enter(state: RigState) {
  const reduced = reducedMotion()
  visible.value = state
  held.value = reduced
  rig?.setState(state, reduced, { hopsFor: props.hopsFor })
  // `restTo` re-centres the face, so the look is told again after each state.
  applyLook(reduced)
}

function dropReaction() {
  clearTimeout(reactionTimer)
  reactionTimer = undefined
  running = null
  early = null
}

function react(reaction: Reaction) {
  if (unmounted) return
  if (!rig) {
    early = reaction
    return
  }
  if (!admitReaction(props.state, running, reaction.state)) return
  running = reaction.state
  enter(reaction.state)
  clearTimeout(reactionTimer)
  reactionTimer = setTimeout(() => {
    reactionTimer = undefined
    running = null
    enter(props.state)
  }, reactionSeconds(reaction) * 1000)
}

// The base first, then the reaction: a reconnect is `state` confused → idle and a `wave` in one tick, and the wave must be admitted.
watch([() => props.state, () => props.reaction], ([state, reaction], [before, previous]) => {
  if (state !== before) {
    // A base turning `confused` ends the reaction at once (errors block); any other base waits for the reaction's end.
    if (state === 'confused') dropReaction()
    if (state === 'confused' || running === null) enter(state)
  }
  if (reaction && reaction !== previous) react(reaction)
})
watch(() => props.look, () => applyLook(reducedMotion()))

/** One nod of the head (the Tour's „Zeigt“); nothing under reduced motion. */
defineExpose({ nod: () => rig?.nod() })

onMounted(async () => {
  const element = root.value
  if (!element) return
  // Head crops are cheap and exempt from the one-rig rule; so is the bust (#526), which stands beside the wheel for a few seconds.
  if (props.variant === 'full') leaveStage = joinStage(allowed => (onStage.value = allowed))
  stopWatching = watchView(element, visible => (inView.value = visible))
  // Client only, after mount, so the server's markup and the first client render agree.
  if (navigator.hardwareConcurrency <= WEAK_CORES) {
    const width = props.size ?? element.clientWidth
    const figure = viewWidth(props.variant)
    shadow.value = { x: Math.round(width * SHADOW_X / figure * 100) / 100, y: Math.round(width * SHADOW_Y / figure * 100) / 100 }
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
  rig = mountRig(gsap, element, { variant: props.variant, reduced: reducedMotion(), micro: props.micro })
  ready.value = true
  enter(props.state)
  // The first look is set, not eased: he arrives looking at it (the reference's `look(first)`).
  applyLook(true)
  rig.setActive(onStage.value && inView.value)
  const waiting = early
  early = null
  if (waiting) react(waiting)
  emit('ready')
})

onBeforeUnmount(() => {
  unmounted = true
  clearTimeout(reactionTimer)
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
      variant === 'full' ? 'overflow-visible' : 'overflow-hidden',
      variant === 'head' ? 'compibert-rig--head' : '',
      rim ? 'compibert-rig--rim' : '',
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
    :data-state="visible"
    :data-ready="ready ? 'true' : 'false'"
    :data-animating="animating ? 'true' : 'false'"
    :data-held="held ? 'true' : 'false'"
    v-html="svg"
  />
</template>

<style>
/* Light = hard shadow, dark = sticker rim, on the static `.cb-fig` group: no filter parameter is ever tweened. The head crop has none.
   System twins under the dark media query (#402). */
.compibert-rig {
  --cb-outline: var(--cb-hard);
}
[data-theme=dark] .compibert-rig {
  --cb-outline: var(--cb-sticker);
}
@media (prefers-color-scheme: dark) {
  [data-theme=system] .compibert-rig {
    --cb-outline: var(--cb-sticker);
  }
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
/* The Tour's face (#460): the head crop wears the Sticker rim in Dunkel and System-dark only, so his ink line does not vanish on the dark bubble.
   Before the cheap rules, and not on a weak device, which keeps no outline. */
[data-theme=dark] .compibert-rig--rim:not(.compibert-rig--cheap) .cb-fig {
  filter: var(--cb-outline);
}
@media (prefers-color-scheme: dark) {
  [data-theme=system] .compibert-rig--rim:not(.compibert-rig--cheap) .cb-fig {
    filter: var(--cb-outline);
  }
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
@media (prefers-color-scheme: dark) {
  [data-theme=system] .compibert-rig--cheap {
    filter: none;
  }
}
</style>
