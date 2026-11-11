<script setup lang="ts">
import { Upload } from '@lucide/vue'
import { toCardWebp } from '~/utils/image-resize'
import { CENTRE_CROP, CROP_ZOOM_MAX, CROP_ZOOM_MIN, cropRoom, nudgeCrop, panCrop, tilePlacement, zoomCrop, zoomOf, type Crop } from '~~/shared/image'

// The image of a game in its form (#143, screen 24): a 16:10 tile and „Bild wählen“. The picked file is cropped
// and shrunk to a WebP in the browser right away; the form uploads the blob (v-model) once the game is saved.
// The Host moves the picture inside the tile (drag, or arrow keys, #457) and zooms it with the slider below (#516);
// the WebP is made again when the crop comes to rest, and the tile shows the same rectangle the canvas draws.
// `imageUrl` is the image the game already has.
const props = defineProps<{
  /** The cropped WebP waiting for the upload. */
  modelValue: Blob | null
  imageUrl?: string | null
  /** The form is sending the image. */
  uploading?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: Blob | null] }>()

/** The arrow keys settle this long after the last one: a held key makes one WebP, not thirty. */
const CROP_SETTLE_MS = 300

const { t } = useI18n()
const input = useTemplateRef<HTMLInputElement>('input')
const tile = useTemplateRef<HTMLElement>('tile')
const converting = ref(false)
const failure = ref<string | null>(null)
const labelId = useId()
const helpId = useId()

// The picked original stays in the browser (its object URL is what the tile shows); no bitmap is kept, `toCardWebp`
// decodes the file for each WebP it makes. Nothing of the original is uploaded.
const picture = shallowRef<{ file: File, url: string, width: number, height: number } | null>(null)
const crop = ref<Crop>(CENTRE_CROP)
/** The crop the WebP the form holds was made from. */
let lastMade: Crop = CENTRE_CROP
/** The crop of the newest make, finished or not: a crop that is already being made is not made twice. */
let requested: Crop = CENTRE_CROP
/** Bumped by every make and every pick or reset: a result of an older run is dropped. */
let generation = 0
const pending = new Set<Promise<void>>()
let settleTimer: ReturnType<typeof setTimeout> | null = null
let unmounted = false

const shown = computed(() => picture.value?.url ?? props.imageUrl ?? null)
const busy = computed(() => converting.value || Boolean(props.uploading))
const status = computed(() => {
  if (props.uploading) return t('gameEdit.imageUploading')
  return converting.value ? t('gameEdit.imageConverting') : null
})

const sameCrop = (a: Crop, b: Crop) => a.x === b.x && a.y === b.y && zoomOf(a) === zoomOf(b)

function clearSettleTimer() {
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = null
}

/** The crop is at rest once the Host has paused for CROP_SETTLE_MS: the arrow keys and the slider's change both wait so. */
function restSoon() {
  clearSettleTimer()
  settleTimer = setTimeout(() => {
    settleTimer = null
    rest()
  }, CROP_SETTLE_MS)
}

function dropPicture() {
  if (picture.value) URL.revokeObjectURL(picture.value.url)
  picture.value = null
  crop.value = CENTRE_CROP
  lastMade = CENTRE_CROP
  requested = CENTRE_CROP
  drag = null
  dragging.value = false
  clearSettleTimer()
  generation++
}

onBeforeUnmount(() => {
  unmounted = true
  clearSettleTimer()
  if (picture.value) URL.revokeObjectURL(picture.value.url)
})

// The parent removing the image (a `null` while a picture is held) empties the field. The field's own failed
// makes never emit `null`, so this is only ever a real reset.
watch(() => props.modelValue, (blob) => {
  if (blob === null && picture.value) dropPicture()
})

function pickJob(file: File): Promise<void> {
  return (async () => {
    try {
      const made = await toCardWebp(file)
      if (unmounted) return
      // Only a picture that converted replaces the one before it, so a failed pick keeps what was there.
      if (picture.value) URL.revokeObjectURL(picture.value.url)
      picture.value = { file, url: URL.createObjectURL(file), width: made.width, height: made.height }
      crop.value = CENTRE_CROP
      lastMade = CENTRE_CROP
      requested = CENTRE_CROP
      drag = null
      dragging.value = false
      clearSettleTimer()
      generation++
      emit('update:modelValue', made.blob)
    }
    catch {
      failure.value = t('gameEdit.imageConvertFailed')
    }
  })()
}

async function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  converting.value = true
  failure.value = null
  const job = pickJob(file)
  pending.add(job)
  try {
    await job
  }
  finally {
    pending.delete(job)
    converting.value = false
    // The same file chosen again must fire `change` again.
    target.value = ''
  }
}

/** Makes the WebP from the crop as it is now; a result that a newer make or a new pick outran is dropped. */
function makeNow(): Promise<void> {
  const current = picture.value
  if (!current) return Promise.resolve()
  const snapshot = { ...crop.value }
  const run = ++generation
  requested = snapshot
  const job = (async () => {
    try {
      const made = await toCardWebp(current.file, snapshot)
      if (run !== generation || unmounted) return
      lastMade = snapshot
      emit('update:modelValue', made.blob)
    }
    catch {
      if (run !== generation || unmounted) return
      // The form still holds the WebP of `lastMade`: the tile goes back to it, so tile and upload agree.
      crop.value = lastMade
      requested = lastMade
      failure.value = t('gameEdit.imageConvertFailed')
    }
  })()
  pending.add(job)
  void job.finally(() => pending.delete(job))
  return job
}

/** The crop came to rest: make the WebP again, but only when it is not the one the form holds. */
function rest() {
  if (!sameCrop(crop.value, requested)) void makeNow()
}

/**
 * Resolves once the WebP the form holds matches the tile (#457): the form waits for it before it saves. Flushes a
 * pending arrow-key timer, waits for a make or the pick in flight, and never rejects.
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

// Dragging: pointer events on the tile, with the pointer captured so a drag that leaves the tile keeps going.
let drag: { pointerId: number, startX: number, startY: number, from: Crop, tile: { width: number, height: number } } | null = null
const dragging = ref(false)

function onPointerDown(event: PointerEvent) {
  const current = picture.value
  const element = event.currentTarget as HTMLElement
  if (!current || props.uploading || event.button !== 0 || drag) return
  // The content box: the same box the picture's percentages refer to.
  const size = { width: element.clientWidth, height: element.clientHeight }
  if (size.width <= 0 || size.height <= 0) return
  drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, from: crop.value, tile: size }
  dragging.value = true
  try {
    element.setPointerCapture(event.pointerId)
  }
  catch {
    // A pointer that is no longer active cannot be captured; the drag still works inside the tile.
  }
}

function onPointerMove(event: PointerEvent) {
  const current = picture.value
  if (!drag || !current || event.pointerId !== drag.pointerId) return
  crop.value = panCrop(current, drag.tile, drag.from, { dx: event.clientX - drag.startX, dy: event.clientY - drag.startY })
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
  const current = picture.value
  const direction = ARROWS[event.key as keyof typeof ARROWS]
  // Ctrl, Meta and Alt combinations (Strg + Enter, #465) and every other key belong to the page.
  if (!current || !direction || props.uploading || event.ctrlKey || event.metaKey || event.altKey) return
  // The tile has focus: an arrow key moves the picture, not the page.
  event.preventDefault()
  const next = nudgeCrop(current, crop.value, direction)
  if (sameCrop(next, crop.value)) return
  crop.value = next
  restSoon()
}

// The zoom (#516): the slider moves the tile at once (`input`); its WebP is made when the slider's change settles.
const zoom = computed({
  get: () => zoomOf(crop.value),
  set: (value: number) => {
    if (picture.value) crop.value = zoomCrop(picture.value, crop.value, value)
  },
})
const zoomText = computed(() => zoom.value <= CROP_ZOOM_MIN
  ? t('gameEdit.imageZoomFits')
  : t('gameEdit.imageZoomValue', { factor: zoom.value.toFixed(1).replace('.', ',') }))

const room = computed(() => picture.value ? cropRoom(picture.value.width, picture.value.height, zoom.value) : { x: false, y: false })
// Full class strings, so Tailwind sees them: a swipe along the axis without room still scrolls the page. Above zoom 1
// both axes have room, so every picture zoomed in takes `touch-none`: the drag moves the picture, not the page (#516).
const TOUCH_ACTION = { x: 'touch-pan-y', y: 'touch-pan-x', both: 'touch-none', none: 'touch-auto' }
const tileClass = computed(() => {
  if (!picture.value) return ''
  const { x, y } = room.value
  const touch = x && y ? TOUCH_ACTION.both : x ? TOUCH_ACTION.x : y ? TOUCH_ACTION.y : TOUCH_ACTION.none
  const cursor = dragging.value ? 'cursor-grabbing' : x || y ? 'cursor-grab' : ''
  return `focus-visible:focus-ring select-none ${touch} ${cursor}`
})

const percent = (value: number) => `${Number(value.toFixed(4))}%`
const placementStyle = computed(() => {
  if (!picture.value) return undefined
  const place = tilePlacement(picture.value.width, picture.value.height, crop.value)
  return { left: percent(place.left), top: percent(place.top), width: percent(place.width), height: percent(place.height) }
})
</script>

<template>
  <div
    role="group"
    :aria-labelledby="labelId"
    class="flex flex-col gap-1.5"
  >
    <b
      :id="labelId"
      class="text-[14px]"
    >{{ t('gameEdit.image') }}</b>
    <div class="flex items-center gap-3">
      <!-- The content box is exactly 16:10 (the border is the overlay below), so the picture's percentages and the canvas agree (#457). -->
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- a named group for dragging and arrow keys: the rule only accepts widget roles such as slider, which would need a value (#457) -->
      <div
        ref="tile"
        class="relative aspect-[16/10] w-[120px] flex-none overflow-hidden rounded-[10px] bg-paper-2"
        :class="tileClass"
        :tabindex="picture ? 0 : undefined"
        role="group"
        :aria-label="picture ? t('gameEdit.imageCrop') : undefined"
        :aria-describedby="picture ? helpId : undefined"
        :data-crop-x="picture ? crop.x.toFixed(3) : undefined"
        :data-crop-y="picture ? crop.y.toFixed(3) : undefined"
        :data-crop-zoom="picture ? zoomOf(crop).toFixed(3) : undefined"
        @dragstart.prevent
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @lostpointercapture="endDrag"
        @keydown="onKeydown"
      >
        <img
          v-if="picture"
          :src="picture.url"
          :alt="t('gameEdit.imagePreviewAlt')"
          draggable="false"
          class="absolute max-w-none select-none"
          :style="placementStyle"
        >
        <img
          v-else-if="imageUrl"
          :src="imageUrl"
          :alt="t('gameEdit.imagePreviewAlt')"
          class="size-full object-cover"
        >
        <span
          v-else
          class="grid size-full place-items-center font-mono text-[10px] text-ink-2"
        >{{ t('gameEdit.imageRatio') }}</span>
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 rounded-[10px] border-[2.5px] border-line"
          :class="{ 'border-dashed': !shown }"
        />
      </div>
      <div class="flex min-w-0 flex-col items-start">
        <AppButton
          variant="secondary"
          :aria-disabled="busy || undefined"
          @click="busy || input?.click()"
        >
          <template #icon>
            <AppIcon
              :icon="Upload"
              :size="14"
            />
          </template>
          {{ shown ? t('gameEdit.imageChange') : t('gameEdit.imageChoose') }}
        </AppButton>
      </div>
    </div>
    <!-- A sibling of the tile row, not inside the tile: its keys are the slider's own, not the tile's (#516). -->
    <RangeSlider
      v-if="picture"
      v-model="zoom"
      class="w-full max-w-[240px]"
      :min="CROP_ZOOM_MIN"
      :max="CROP_ZOOM_MAX"
      :step="0.1"
      :label="t('gameEdit.imageZoom')"
      :value-text="zoomText"
      :disabled="uploading"
      @change="restSoon"
    />
    <!-- Below the row, so the button stays centred on the preview while the image is being converted or sent (#176). -->
    <span
      v-if="status"
      role="status"
      class="text-small font-bold text-ink-2"
    >{{ status }}</span>
    <span
      v-if="picture"
      :id="helpId"
      class="text-small text-ink-2"
    >{{ t('gameEdit.imageCropHelp') }}</span>
    <NoticeBanner
      v-if="failure"
      tone="critical"
    >
      {{ failure }}
    </NoticeBanner>
    <input
      ref="input"
      type="file"
      accept="image/*"
      class="sr-only"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    >
  </div>
</template>
