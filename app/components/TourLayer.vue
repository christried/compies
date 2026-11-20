<script setup lang="ts">
import { bubbleIn, bubbleOut, canAnimate, cancelQuietly, glideScroll, moveHole, tourEnter, tourExit, tourTick, type TourHole, type TourPlay } from '~/utils/tour-motion'
import { placeTour, TOUR_BUBBLE_WIDTH, tourBubbleWidth, TOUR_NARROW_BELOW, type TourPlacement, type TourThing } from '~/utils/tour-placement'
import { tourStepCue } from '~/utils/sound-cues'
import { tourFace, tourMove, tourThing, type TourStep } from '~~/shared/tour'

// The Tour's layer (#647, #460, ADR 0017): the controller of the Rundgang. It measures the thing a step points at, asks `placeTour` where the hole and the
// bubble stand, scrolls the page to it, follows it through resizing and scrolling, and plays the note's motion (17-rundgang.md); the pieces it moves are
// `TourSpotlight` (the hole, its shadow is the dark), `TourBubble` (the box with its tail) and `TourFace` (Compibert on the bubble's corner). It decides nothing
// about when it is open: `useTour` passes `open` and says what was seen, it also says which step shows (`show`, #766) and decides nothing about the page, and `over` is emitted at once, so the page behind takes input again while the layer
// plays its exit. The behaviour that stays from #647: the focus goes in and back, Tab stays inside, Esc skips, the arrows walk, each step is announced.
// The layer is fixed on the modal step of the scale (over the sticky tab bar, the header and the dock, under the toasts) and is its own shield: a click outside
// the bubble does nothing. The page behind is inert through AppShell's `covered`, so the keys are taken from the document.
const props = defineProps<{
  open: boolean
  steps: readonly TourStep[]
}>()
const emit = defineEmits<{
  over: [how: 'finished' | 'skipped']
  show: [step: TourStep]
}>()

const { t } = useI18n()
// The Event page's immediate-play function (#747): the layer never makes a player of its own, and with none provided it is silent.
const playNow = useImmediateCue()

/** The step the User is on, and the one whose texts the bubble shows (it lags while a change plays: the swap is at 150 ms). */
const at = ref(0)
const shownAt = ref(0)
const step = computed(() => props.steps[shownAt.value])
const first = computed(() => shownAt.value <= 0)
const last = computed(() => shownAt.value >= props.steps.length - 1)

// In the DOM: open, or on its way out.
const mounted = ref(false)
const placement = shallowRef<TourPlacement | null>(null)
const hole = shallowRef<TourHole | null>(null)
/** The bubble waits invisible between its exit and its entry on a step change. */
const waiting = ref(false)
const narrow = ref(false)
const bubbleWidth = ref(TOUR_BUBBLE_WIDTH)
/** The step the hidden twin holds to read its height. */
const measuring = ref(0)

const root = useTemplateRef<HTMLElement>('root')
const spot = useTemplateRef<{ el: HTMLElement | null }>('spot')
const bubble = useTemplateRef<{ root: HTMLElement | null }>('bubble')
const twin = useTemplateRef<{ root: HTMLElement | null }>('twin')
const face = useTemplateRef<{ nod: () => void }>('face')
const panel = toRef(() => bubble.value?.root ?? null)

// Not tracked in the registry of open layers: the Tour must not read itself as a layer that stops it.
const { onKeydown } = useDialog(toRef(props, 'open'), panel, () => finish('skipped'), { tracked: false })

const texts = (index: number) => {
  const id = props.steps[index]?.id
  return id ? { title: t(`tour.${id}.title`), text: t(`tour.${id}.text`) } : { title: '', text: '' }
}
const shown = computed(() => texts(shownAt.value))
const live = computed(() => t('tour.live', { n: shownAt.value + 1, total: props.steps.length, title: shown.value.title, text: shown.value.text }))
const measured = computed(() => texts(measuring.value))

// --- Measuring and placing --------------------------------------------------------------------------------------------------------------------------

/**
 * The element a step points at: its narrow child below TOUR_NARROW_BELOW, and the whole thing when that child is not on the page (#648).
 * Null when the step points at nothing or the thing is not there.
 */
function findThing(step: TourStep | undefined): HTMLElement | null {
  const find = (value: string | null) => value ? document.querySelector<HTMLElement>(`[data-tour="${value}"]`) : null
  return find(step ? tourThing(step, narrow.value) : null) ?? find(step?.target ?? null)
}

/** The thing a step points at, in the placement's terms; null when the step points at nothing, or it is gone or not visible (the step stays, without a thing). */
function readThing(element: HTMLElement | null): TourThing | null {
  if (!element || element.checkVisibility?.() === false) return null
  const box = element.getBoundingClientRect()
  // A thing in the sticky header or the tab bar never scrolls; the others are placed by their page y.
  const scrolls = !element.closest('[data-tour-edge]')
  let radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
  // A percentage is of the short side, as the reference's `measure()`.
  if (getComputedStyle(element).borderTopLeftRadius.includes('%')) radius = Math.min(box.width, box.height) * radius / 100
  return { x: box.left, y: scrolls ? box.top + window.scrollY : box.top, w: box.width, h: box.height, radius, scrolls }
}

/** Where the tail aims: the centre of the step's `data-tour-anchor` inside the thing (the first visible one in DOM order), in the thing's coordinates; null: the thing's centre. */
function readAnchor(element: HTMLElement, name: string | undefined): { x: number, y: number, scrolls: boolean } | null {
  if (!name) return null
  const found = [...element.querySelectorAll<HTMLElement>(`[data-tour-anchor="${name}"]`)].find(candidate => candidate.checkVisibility?.() !== false)
  if (!found) return null
  const box = found.getBoundingClientRect()
  const scrolls = !found.closest('[data-tour-edge]')
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 + (scrolls ? window.scrollY : 0), scrolls }
}

// A layer that opens in its own setup (mounted open) is not in the DOM yet when it starts to measure.
let inDom = false
const inDomWhen = new Promise<void>(resolve => onMounted(() => {
  inDom = true
  resolve()
}))

/** Where the bubble and the hole stand for a step, measured now. `keepScroll`: the page stays where a User put it. */
async function place(index: number, keepScroll?: number): Promise<TourPlacement> {
  if (!inDom) await inDomWhen
  const current = props.steps[index]
  // The twin takes the step's texts and the live bubble's width, and its height is the one that is placed.
  const win = { w: document.documentElement.clientWidth, h: window.innerHeight }
  measuring.value = index
  bubbleWidth.value = tourBubbleWidth(win.w)
  narrow.value = win.w < TOUR_NARROW_BELOW
  await nextTick()
  const bubbleHeight = twin.value?.root?.offsetHeight ?? 0
  const tabs = document.querySelector<HTMLElement>('[data-tour-edge="tabs"]')
  const element = findThing(current)
  const thing = readThing(element)
  return placeTour({
    window: win,
    headerBottom: document.querySelector('[data-tour-edge="header"]')?.getBoundingClientRect().bottom ?? 0,
    stageBottom: tabs && tabs.checkVisibility?.() !== false ? tabs.getBoundingClientRect().top : win.h,
    maxScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    thing,
    anchor: (thing && element && readAnchor(element, current?.anchor)) || undefined,
    keepScroll,
    bubbleHeight,
  })
}

/** What the layer scrolled the page to itself: a scroll event that lands there is not a User's. */
let ownScroll: number | null = null
/** The User scrolled while a change played: the change does not take the page back to its aim. */
let scrolledByUser = false
function scrollNow(y: number) {
  ownScroll = y
  window.scrollTo(0, y)
}

/** Puts the placement of step `index` on screen without motion. */
function commit(next: TourPlacement, index: number) {
  // A step shows once: on the first placement of a start and when the index moves, not when `replace` places the same step again (#766).
  const showing = placement.value === null || shownAt.value !== index
  placement.value = next
  hole.value = next.hole
  shownAt.value = index
  const shownStep = props.steps[index]
  if (showing && shownStep) emit('show', shownStep)
}

// --- Motion ------------------------------------------------------------------------------------------------------------------------------------------

let timers: ReturnType<typeof setTimeout>[] = []
let plays: Animation[] = []
let stopGlide: (() => void) | undefined
let exit: TourPlay | undefined
/** A change is playing: „Weiter“ and „Zurück“ wait for it. */
let changing = false
/** The newest change or re-place wins: an older one that returns from its measuring does nothing. */
let run = 0
let byUser = false

const later = (ms: number, fn: () => void) => void timers.push(setTimeout(fn, ms))

/** Stops everything that moves and puts the layer in the state the running change was heading for. */
function settle() {
  for (const timer of timers) clearTimeout(timer)
  timers = []
  for (const play of plays) cancelQuietly(play)
  plays = []
  stopGlide?.()
  stopGlide = undefined
  changing = false
  waiting.value = false
}

function focusForward() {
  // The bubble is fixed: a focus that scrolls the page would move it under a glide (#785).
  panel.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
}

/** Opens: places the first step and plays the start. */
async function start() {
  settle()
  exit?.cancel()
  exit = undefined
  byUser = false
  run += 1
  const mine = run
  at.value = 0
  shownAt.value = 0
  placement.value = null
  hole.value = null
  mounted.value = true
  listen()
  const next = await place(0)
  if (mine !== run) return
  commit(next, 0)
  if (next.scroll !== null) scrollNow(next.scroll)
  await nextTick()
  if (mine !== run) return
  watchThing()
  // The bubble is hidden until it is placed, so `useDialog.focusIn`, one tick after `open`, found nothing it could focus; the return element it recorded stays (#785).
  focusForward()
  if (canAnimate() && root.value && bubble.value?.root) tourEnter(root.value, bubble.value.root)
  nodIfPointing(0)
  sing(0)
}

/** The face nods on a pointing step when the bubble arrives (the rig does nothing under reduced motion). */
function nodIfPointing(index: number) {
  const current = props.steps[index]
  if (current && tourFace(current) === 'points') face.value?.nod()
}

/** The step that just showed sounds its cue, if it has one (#747): once per showing, so also after „Zurück“. A re-place of the same step (resize, scroll) is no showing. */
function sing(index: number) {
  const id = tourStepCue(props.steps[index]?.id ?? '')
  if (id) playNow(id)
}

/** One move of the Tour: next and back change the step, skip and the end are over. */
async function go(action: 'next' | 'back' | 'skip') {
  if (action === 'skip') {
    finish('skipped')
    return
  }
  // A change plays for half a second; a second click on „Weiter“ meanwhile does nothing.
  if (changing) return
  const move = tourMove(props.steps.length, at.value, action)
  if ('over' in move) {
    finish(move.over)
    return
  }
  await change(move.at)
}

/** Over: the User ended it. `over` goes out at once, and the layer plays its exit when the page closes it. */
function finish(how: 'finished' | 'skipped') {
  byUser = true
  settle()
  emit('over', how)
}

/** From the current step to `next`, by the note's table: out, hole and scroll, swap, in (520 ms in all), or a cut. */
async function change(next: number) {
  run += 1
  const mine = run
  const before = hole.value
  at.value = next
  // Decided now, not after the measuring: a second click on „Weiter“ in the meantime must already find the change running.
  const animated = canAnimate() && !reducedMotion()
  if (animated) changing = true
  const target = await place(next)
  if (mine !== run) return
  const bubbleEl = bubble.value?.root
  const spotEl = spot.value?.el
  if (!animated || !bubbleEl || !spotEl) {
    // Nothing to animate, a hidden tab or reduced motion: hole, scroll and content change at once (reduced: the bubble still fades in, over `dur-fast`).
    changing = false
    commit(target, next)
    if (target.scroll !== null) scrollNow(target.scroll)
    await nextTick()
    if (mine !== run) return
    watchThing()
    if (canAnimate() && bubble.value?.root) bubbleIn(bubble.value.root, target.side)
    focusForward()
    nodIfPointing(next)
    sing(next)
    return
  }
  changing = true
  const out = bubbleOut(bubbleEl)
  if (out) plays.push(out)
  // The hole goes where the next step wants it and the page scrolls with it, both over `dur-slow`: they land together.
  const sweep = before ? moveHole(spotEl, before, target.hole) : null
  if (sweep) plays.push(sweep)
  hole.value = target.hole
  scrolledByUser = false
  if (target.scroll !== null) {
    const from = window.scrollY
    ownScroll = target.scroll
    // Each frame is the layer's own scroll, so a scroll event that lands on it is not a User's (and one that does not is).
    stopGlide = glideScroll(from, target.scroll, motionMs('--cp-dur-slow', '360ms'), y => scrollNow(y))
  }
  later(150, () => {
    // Swap the content and the place while the bubble is out of sight.
    waiting.value = true
    commit(target, next)
    if (out) cancelQuietly(out)
    focusForward()
  })
  later(300, async () => {
    waiting.value = false
    await nextTick()
    if (mine !== run || !bubble.value?.root) return
    const arrival = bubbleIn(bubble.value.root, target.side)
    if (arrival) plays.push(arrival)
    nodIfPointing(next)
    sing(next)
  })
  later(520, () => {
    // The page's scroll lands with the glide; the layer holds what it was told. The glide lives on frames: one that lost them (a starved main thread) stopped
    // half-way, and `settle()` would leave the page there, which `onScroll` then takes for the User's. A change ends on its aim unless the User scrolled meanwhile (#785).
    const lost = target.scroll !== null && !scrolledByUser && Math.abs(window.scrollY - target.scroll) > 0.5
    settle()
    if (lost) scrollNow(target.scroll!)
    watchThing()
  })
}

// --- Following the thing ------------------------------------------------------------------------------------------------------------------------------

let frame = 0
/** Whether a re-place that waits for its frame keeps the User's scroll (all but a resize do). */
let keep = true

/** One re-place per frame, without motion: the Event page keeps updating behind the Tour, and a window resizes and scrolls. */
function replace(keepScroll: boolean) {
  keep = keep && keepScroll
  if (frame) return
  frame = requestAnimationFrame(async () => {
    frame = 0
    const keepNow = keep
    keep = true
    if (!mounted.value || !props.open || changing || !placement.value) return
    run += 1
    const mine = run
    const index = shownAt.value
    const next = await place(index, keepNow ? window.scrollY : undefined)
    if (mine !== run || changing || !props.open) return
    commit(next, index)
    if (!keepNow && next.scroll !== null && Math.abs(next.scroll - window.scrollY) > 0.5) scrollNow(next.scroll)
    watchThing()
  })
}

function onResize() {
  replace(false)
}
function onScroll() {
  // The layer's own scrolling (a glide, a re-place) lands on `ownScroll`: only a User's scroll re-places.
  if (ownScroll !== null && Math.abs(window.scrollY - ownScroll) < 1) return
  if (changing) scrolledByUser = true
  replace(true)
}

let observer: ResizeObserver | undefined
let watched: HTMLElement | null = null
/**
 * Watches the page for a change of size once per open Tour, and the step's thing: only the thing's element is swapped when the step's thing changes.
 * Every `observe()` delivers a first callback, which asks for a re-place that commits and comes back here: disconnecting and observing again on each
 * commit re-placed once per frame for as long as the Tour was open (#785).
 */
function watchThing() {
  if (typeof ResizeObserver === 'undefined') return
  if (!observer) {
    observer = new ResizeObserver(() => replace(true))
    observer.observe(document.body)
  }
  const element = findThing(step.value)
  if (element === watched) return
  if (watched) observer.unobserve(watched)
  watched = element
  if (element) observer.observe(element)
}

let listening = false
function listen() {
  if (listening) return
  listening = true
  window.addEventListener('resize', onResize)
  window.addEventListener('orientationchange', onResize)
  window.addEventListener('scroll', onScroll, { passive: true })
}
function unlisten() {
  listening = false
  window.removeEventListener('resize', onResize)
  window.removeEventListener('orientationchange', onResize)
  window.removeEventListener('scroll', onScroll)
  observer?.disconnect()
  observer = undefined
  watched = null
  cancelAnimationFrame(frame)
  frame = 0
}

// --- Closing -----------------------------------------------------------------------------------------------------------------------------------------

/** The layer's exit, after `open` went false (the User finished or skipped, or the page closed it): the shield stays on until it is out. */
async function close() {
  const ticks = byUser
  byUser = false
  settle()
  run += 1
  const mine = run
  unlisten()
  if (!root.value) {
    mounted.value = false
    return
  }
  exit = tourExit(root.value, bubble.value?.root ?? null)
  const playing = exit
  await playing.finished
  if (mine !== run) return
  exit = undefined
  mounted.value = false
  // The Tour lives on the Profil: the avatar ticks once to say so, when a User ended it.
  if (ticks) tourTick(document.querySelector('[data-tour-avatar]'))
}

// On the document, not on the box: a click on the inert page behind puts the focus on the body, and the box's own keydown would miss the next key.
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    // Alt+Left is the browser's Back.
    if (event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    void go(event.key === 'ArrowRight' ? 'next' : 'back')
    return
  }
  onKeydown(event)
}

watch(() => props.open, (isOpen, wasOpen) => {
  if (!import.meta.client) return
  if (isOpen) {
    document.addEventListener('keydown', onDocumentKeydown)
    void start()
  }
  else {
    document.removeEventListener('keydown', onDocumentKeydown)
    if (wasOpen) void close()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (!import.meta.client) return
  document.removeEventListener('keydown', onDocumentKeydown)
  settle()
  exit?.cancel()
  unlisten()
  run += 1
})
</script>

<template>
  <!-- The layer is its own shield (no `pointer-events-none`): a click outside the bubble does nothing. -->
  <div
    v-if="mounted && step"
    ref="root"
    data-tour-layer
    class="fixed inset-0 layer-modal"
  >
    <TourSpotlight
      ref="spot"
      :rect="hole"
      :radius="hole?.radius"
      :ring="hole?.ring"
    />
    <TourBubble
      ref="bubble"
      :title="shown.title"
      :body="shown.text"
      :step="shownAt + 1"
      :total="steps.length"
      :side="placement?.side ?? 'none'"
      :tail="placement?.tail ?? null"
      :first="first"
      :last="last"
      :narrow="narrow"
      :live="live"
      :style="{
        left: `${placement?.bubble.x ?? 0}px`,
        top: `${placement?.bubble.y ?? 0}px`,
        width: `${bubbleWidth}px`,
        opacity: waiting ? 0 : undefined,
        visibility: placement ? undefined : 'hidden',
      }"
      @back="go('back')"
      @next="go('next')"
      @skip="go('skip')"
    >
      <template #face>
        <TourFace
          ref="face"
          :face="tourFace(step)"
          :look="placement?.faceDir ?? 0"
          :narrow="narrow"
        />
      </template>
    </TourBubble>
    <!-- The twin the height is read from: the next step's texts at the live bubble's width, out of sight and out of reach. -->
    <TourBubble
      ref="twin"
      measure
      inert
      aria-hidden="true"
      :title="measured.title"
      :body="measured.text"
      :step="measuring + 1"
      :total="steps.length"
      side="none"
      :first="measuring <= 0"
      :last="measuring >= steps.length - 1"
      :narrow="narrow"
      :style="{ left: '-9999px', top: '0px', width: `${bubbleWidth}px`, visibility: 'hidden' }"
    />
  </div>
</template>
