<script setup lang="ts">
import { toCardWebp } from '~/utils/image-resize'
import { CENTRE_CROP, CROP_ZOOM_MAX, CROP_ZOOM_MIN, PROFILE_IMAGE_TARGET, cropRoom, nudgeCrop, panCrop, tilePlacement, zoomCrop, zoomOf, type Crop } from '~~/shared/image'

// The crop of a Profile picture on the card „Profil“ (#910): a 160 px square tile the User drags, nudges with the arrow keys and zooms with the
// slider, and beside it the round preview, which shows how the picture reads as an avatar. The WebP is made again when the crop comes to rest
// (`model`), so „Speichern“ in the card always sends the crop on screen. The original never leaves the browser.
//
// A second copy of GameImageField's crop glue (pointer capture, arrow keys, slider, settle timer, generation guard), on purpose: the geometry is
// shared (`shared/image.ts`, #909), but pulling the glue out would change the Host's cover field and its tests, which this Release leaves alone.
// A later extraction can fold the two; until then a fix to one of them belongs in both (CODING_STANDARDS § One home).
const props = defineProps<{
  /** The picked file with its decoded size (from the pick's centre crop). */
  picture: { file: File, width: number, height: number }
  /** The card is sending: nothing in the crop changes, so the WebP the card holds stays the tile's (#573). */
  locked?: boolean
}>()

/** The WebP of the crop as it comes to rest; the card sets the first one from the pick. */
const model = defineModel<Blob | null>({ required: true })

/** The arrow keys settle this long after the last one: a held key makes one WebP, not thirty. */
const CROP_SETTLE_MS = 300
/** The tile's width ÷ height, from the target the WebP is made for: 1 for the Profile picture. */
const RATIO = PROFILE_IMAGE_TARGET.width / PROFILE_IMAGE_TARGET.height

const { t } = useI18n()
const failure = ref<string | null>(null)
const helpId = useId()

// The component mounts only after a pick in the browser, never during SSR. No bitmap is kept: `toCardWebp` decodes the file for each WebP it makes.
const url = URL.createObjectURL(props.picture.file)
const crop = ref<Crop>(CENTRE_CROP)
/** The crop the WebP the card holds was made from. */
let lastMade: Crop = CENTRE_CROP
/** The crop of the newest make, finished or not: a crop that is already being made is not made twice. */
let requested: Crop = CENTRE_CROP
/** Bumped by every make: a result of an older run is dropped. */
let generation = 0
const pending = new Set<Promise<void>>()
let settleTimer: ReturnType<typeof setTimeout> | null = null
let unmounted = false
// Dragging: pointer events on the tile, with the pointer captured so a drag that leaves the tile keeps going.
// `captured` is false when the browser refused the capture (see onPointerDown).
let drag: { pointerId: number, startX: number, startY: number, from: Crop, tile: { width: number, height: number }, captured: boolean } | null = null
const dragging = ref(false)
const tileRef = useTemplateRef<HTMLElement>('tile')

const frozen = computed(() => Boolean(props.locked))

const sameCrop = (a: Crop, b: Crop) => a.x === b.x && a.y === b.y && zoomOf(a) === zoomOf(b)

function clearSettleTimer() {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = null
}

/** The crop is at rest once the User has paused for CROP_SETTLE_MS: the arrow keys and the slider's change both wait so. */
function restSoon() {
  clearSettleTimer()
  settleTimer = setTimeout(() => {
    settleTimer = null
    rest()
  }, CROP_SETTLE_MS)
}

// A keyboard User's „Hochladen“ has just gone: the tile takes the focus, so they land on the crop.
onMounted(() => {
  void nextTick(() => tileRef.value?.focus())
})

onBeforeUnmount(() => {
  unmounted = true
  clearSettleTimer()
  URL.revokeObjectURL(url)
})

/** Makes the WebP from the crop as it is now; a result that a newer make outran is dropped. */
function makeNow(): Promise<void> {
  const snapshot = { ...crop.value }
  const run = ++generation
  requested = snapshot
  const job = (async () => {
    try {
      const made = await toCardWebp(props.picture.file, snapshot, PROFILE_IMAGE_TARGET)
      if (run !== generation || unmounted) return
      // A make that worked answers an earlier failed one: the banner goes (#573).
      failure.value = null
      lastMade = snapshot
      model.value = made.blob
    }
    catch {
      if (run !== generation || unmounted) return
      // The card still holds the WebP of `lastMade`: the tile goes back to it, so tile and upload agree.
      crop.value = lastMade
      requested = lastMade
      failure.value = t('profile.imageConvertFailed')
    }
  })()
  pending.add(job)
  void job.finally(() => pending.delete(job))
  return job
}

/** The crop came to rest: make the WebP again, but only when it is not the one the card holds. */
function rest() {
  if (!sameCrop(crop.value, requested)) void makeNow()
}

/**
 * Resolves once the WebP the card holds matches the tile (#457): the card waits for it before it sends. Flushes a
 * pending arrow-key timer, waits for a make in flight, and never rejects.
 */
async function settle(): Promise<void> {
  for (;;) {
    clearSettleTimer()
    rest()
    if (!pending.size) return
    await Promise.all([...pending])
  }
}
defineExpose({ settle })

function onPointerDown(event: PointerEvent) {
  const element = event.currentTarget as HTMLElement
  if (frozen.value || event.button !== 0 || drag) return
  // The content box: the same box the picture's percentages refer to.
  const size = { width: element.clientWidth, height: element.clientHeight }
  if (size.width <= 0 || size.height <= 0) return
  let captured = true
  try {
    element.setPointerCapture(event.pointerId)
  }
  catch {
    // A pointer that is no longer active cannot be captured; the drag still works inside the tile. Without the capture a
    // release outside the tile sends no pointerup here, so onPointerMove ends the drag at the first move without a button (#573).
    captured = false
  }
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, from: crop.value, tile: size, captured }
  dragging.value = true
}

function onPointerMove(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  if (!drag.captured && event.buttons === 0) {
    drag = null
    dragging.value = false
    rest()
    return
  }
  // The card is sending: the crop the WebP was made from stays the tile's (#573).
  if (frozen.value) return
  crop.value = panCrop(props.picture, drag.tile, drag.from, { dx: event.clientX - drag.startX, dy: event.clientY - drag.startY }, RATIO)
}

function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointerId) return
  const { pointerId } = drag
  drag = null
  dragging.value = false
  const element = event.currentTarget as HTMLElement
  if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId)
  rest()
}

const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const

function onKeydown(event: KeyboardEvent) {
  const direction = ARROWS[event.key as keyof typeof ARROWS]
  // Ctrl, Meta and Alt combinations (Strg + Enter, #465) and every other key belong to the page.
  if (!direction || frozen.value || event.ctrlKey || event.metaKey || event.altKey) return
  // The tile has focus: an arrow key moves the picture, not the page.
  event.preventDefault()
  const next = nudgeCrop(props.picture, crop.value, direction, RATIO)
  if (sameCrop(next, crop.value)) return
  crop.value = next
  restSoon()
}

// The zoom (#516): the slider moves the tile at once (`input`); its WebP is made when the slider's change settles.
const zoom = computed({
  get: () => zoomOf(crop.value),
  set: (value: number) => {
    if (frozen.value) return
    crop.value = zoomCrop(props.picture, crop.value, value, RATIO)
  },
})
const zoomText = computed(() => zoom.value <= CROP_ZOOM_MIN
  ? t('gameEdit.imageZoomFits')
  : t('gameEdit.imageZoomValue', { factor: zoom.value.toFixed(1).replace('.', ',') }))

const room = computed(() => cropRoom(props.picture.width, props.picture.height, zoom.value, RATIO))
// Full class strings, so Tailwind sees them: a swipe along the axis without room still scrolls the page. Above zoom 1
// both axes have room, so every picture zoomed in takes `touch-none`: the drag moves the picture, not the page (#516).
const TOUCH_ACTION = { x: 'touch-pan-y', y: 'touch-pan-x', both: 'touch-none', none: 'touch-auto' }
const tileClass = computed(() => {
  const { x, y } = room.value
  const touch = x && y ? TOUCH_ACTION.both : x ? TOUCH_ACTION.x : y ? TOUCH_ACTION.y : TOUCH_ACTION.none
  const cursor = dragging.value ? 'cursor-grabbing' : x || y ? 'cursor-grab' : ''
  return `focus-visible:focus-ring select-none ${touch} ${cursor}`
})

const percent = (value: number) => `${Number(value.toFixed(4))}%`
// The tile and the disc are both 1:1 windows on the same picture, so one placement serves both.
const placementStyle = computed(() => {
  const place = tilePlacement(props.picture.width, props.picture.height, crop.value, RATIO)
  return { left: percent(place.left), top: percent(place.top), width: percent(place.width), height: percent(place.height) }
})
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-4">
      <!-- The content box is exactly square (the border is the overlay below), so the picture's percentages and the canvas agree (#457). -->
      <!-- The data-crop-* attributes are test hooks, also read in the browser check (#517); nothing styles on them. -->
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- a named group for dragging and arrow keys: the rule only accepts widget roles such as slider, which would need a value (#457) -->
      <div
        ref="tile"
        class="relative size-40 flex-none overflow-hidden rounded-[10px] bg-paper-2"
        :class="tileClass"
        tabindex="0"
        role="group"
        :aria-label="t('gameEdit.imageCrop')"
        :aria-describedby="helpId"
        :data-crop-x="crop.x.toFixed(3)"
        :data-crop-y="crop.y.toFixed(3)"
        :data-crop-zoom="zoomOf(crop).toFixed(3)"
        @dragstart.prevent
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @lostpointercapture="endDrag"
        @keydown="onKeydown"
      >
        <img
          :src="url"
          :alt="t('gameEdit.imagePreviewAlt')"
          draggable="false"
          class="absolute max-w-none select-none"
          :style="placementStyle"
        >
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 rounded-[10px] border-[2.5px] border-line"
        />
      </div>
      <!-- The avatar as others see it: the card's own size (80 px) and border. -->
      <div
        aria-hidden="true"
        class="relative size-20 flex-none overflow-hidden rounded-pill border-[2.5px] border-line bg-paper-2"
      >
        <img
          :src="url"
          alt=""
          draggable="false"
          class="pointer-events-none absolute max-w-none select-none"
          :style="placementStyle"
        >
      </div>
    </div>
    <!-- A sibling of the tile row, not inside the tile: its keys are the slider's own, not the tile's (#516). -->
    <RangeSlider
      v-model="zoom"
      class="w-full max-w-[240px]"
      :min="CROP_ZOOM_MIN"
      :max="CROP_ZOOM_MAX"
      :step="0.1"
      :label="t('gameEdit.imageZoom')"
      :value-text="zoomText"
      :disabled="frozen"
      @change="restSoon"
    />
    <span
      :id="helpId"
      class="text-small text-ink-2"
    >{{ t('gameEdit.imageCropHelp') }}</span>
    <NoticeBanner
      v-if="failure"
      tone="critical"
    >
      {{ failure }}
    </NoticeBanner>
  </div>
</template>
