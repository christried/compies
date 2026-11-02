<script setup lang="ts">
import { YOUTUBE_HOST, loadYouTubeApi, type YouTubeApi, type YouTubePlayer } from '~/utils/youtube'
import { clipTime } from '~~/shared/game'

// The clip as it will run in a Session (#141, screen 24): the YouTube player, cued to the start second and
// stopping after the length, plus a bar that shows where in the video the excerpt sits. The IFrame API
// loads once per page, on the client only. Without it (tests, a blocker) the labels and the stage still render.
const props = defineProps<{
  videoId: string | null
  /** Start second of the clip. */
  start: number
  /** Length of the clip in seconds. */
  length: number
}>()

const emit = defineEmits<{
  /** The video's length in seconds, once the player knows it. */
  duration: [seconds: number]
  /** The player cannot play the video (missing, private, not embeddable). */
  error: []
}>()

const DEBOUNCE_MS = 400

const { t } = useI18n()
const stage = useTemplateRef<HTMLElement>('stage')
const total = ref<number | null>(null)
let player: YouTubePlayer | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let unmounted = false

const end = computed(() => props.start + props.length)
/** The excerpt on the bar, as shares of the video; none until the video's length is known. */
const segment = computed(() => {
  if (!total.value) return null
  const left = Math.min(props.start / total.value, 1)
  return { left: `${left * 100}%`, width: `${Math.min(props.length / total.value, 1 - left) * 100}%` }
})

function readDuration() {
  const seconds = player?.getDuration() ?? 0
  if (seconds > 0 && seconds !== total.value) {
    total.value = seconds
    emit('duration', seconds)
  }
}

async function createPlayer(videoId: string) {
  let api: YouTubeApi
  try {
    api = await loadYouTubeApi()
  }
  catch {
    return
  }
  // The preview may have gone, or changed its video, while the script loaded.
  if (unmounted || !stage.value || player || props.videoId !== videoId) return
  const host = document.createElement('div')
  stage.value.replaceChildren(host)
  player = new api.Player(host, {
    videoId,
    host: YOUTUBE_HOST,
    playerVars: { start: props.start, end: end.value, rel: 0, playsinline: 1, modestbranding: 1 },
    events: { onReady: readDuration, onStateChange: readDuration, onError: () => emit('error') },
  })
}

function sync() {
  const videoId = props.videoId
  if (!videoId) {
    player?.stopVideo()
    return
  }
  if (!player) {
    void createPlayer(videoId)
    return
  }
  player.cueVideoById({ videoId, startSeconds: props.start, endSeconds: end.value })
}

onMounted(() => {
  if (import.meta.client && props.videoId) void createPlayer(props.videoId)
})

watch(() => [props.videoId, props.start, props.length], () => {
  if (!import.meta.client) return
  clearTimeout(timer)
  timer = setTimeout(sync, DEBOUNCE_MS)
})

watch(() => props.videoId, () => {
  total.value = null
})

onBeforeUnmount(() => {
  unmounted = true
  clearTimeout(timer)
  player?.destroy()
  player = null
})
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div
      ref="stage"
      role="group"
      :aria-label="t('gameEdit.playerLabel')"
      class="relative aspect-video overflow-hidden rounded-[14px] border-(length:--cp-bw) border-line bg-ink shadow-card [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:size-full"
    />
    <div
      :aria-label="t('gameEdit.barLabel')"
      role="img"
      class="relative h-11 rounded-[10px] border-[2.5px] border-line bg-paper-2"
    >
      <span
        v-if="segment"
        class="absolute -top-0.5 -bottom-0.5 rounded-[8px] border-3 border-line bg-primary"
        :style="segment"
      />
    </div>
    <div class="flex justify-between gap-2 font-mono text-[11px] text-ink-2">
      <span>0:00</span>
      <span>{{ t('gameEdit.excerpt', { from: clipTime(start), to: clipTime(end) }) }}</span>
      <span>{{ total ? clipTime(total) : '' }}</span>
    </div>
    <p class="m-0 text-small text-pretty text-ink-2">
      {{ t('gameEdit.excerptNote', { n: length }) }}
    </p>
  </div>
</template>
