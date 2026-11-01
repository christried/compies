<script setup lang="ts">
import { SkipForward, Volume2, VolumeX, X } from '@lucide/vue'
import { YOUTUBE_HOST, YOUTUBE_PLAYING, loadYouTubeApi, type YouTubeApi, type YouTubePlayer } from '~/utils/youtube'
import { clipPosition } from '~~/shared/clip'
import type { ClipView } from '~~/shared/event'

// The synced clip (#230, 04-motion § Clip overlay and § Synchronised moments, 02-components § ClipPlayer): the game's YouTube excerpt
// over the stage, playing the same second on every device. It opens when the Event read carries the clip (the server clock is at
// the draw's stop) and closes by itself at `endsAt` without waiting for a refetch. A late joiner lands on the right second
// (`clipPosition`), and when the player has drifted by more than a second after 3 s of playback it seeks once. A game without
// a video shows its card for the clip's length. Mute and close are this device's alone; the Host's „Clip überspringen“ is the
// only thing sent (the page POSTs it, the server stores it, and every client's refetch ends the clip).
// Sound: a desktop starts with sound unless the User's own setting is off; a phone starts muted. When the browser blocks the
// unmuted start (the player says so, or is not PLAYING after a second) the clip plays muted and „Ton aktivieren“ asks for the
// tap that unlocks sound. The mounted overlay is keyed by the draw, so the next draw's clip shows again after a close.
const props = defineProps<{
  clip: ClipView
  /** The server's time in epoch ms (useServerClock). */
  serverNow: () => number
  isHost: boolean
  /** The Host's skip for everyone; resolves to whether the server took it. */
  skip: () => Promise<boolean>
}>()

/** How long the player may take to start with sound before the clip plays muted instead. */
const AUTOPLAY_WAIT_MS = 1000
/** After this much playback the position is checked against the server's, once (04-motion § Synchronised moments). */
const DRIFT_CHECK_MS = 3000
const DRIFT_LIMIT_S = 1
/** The progress bar and the end of the clip follow the server clock at this pace. */
const TICK_MS = 250

const { t } = useI18n()
const sound = useSound()
const wide = useMediaQuery('(min-width: 61.25rem)')
const stage = useTemplateRef<HTMLElement>('stage')

const videoId = computed(() => props.clip.game.youtubeId)
const startAt = Date.parse(props.clip.startAt)
const endsAt = Date.parse(props.clip.endsAt)
/** The video's last second of the clip. */
const endSecond = props.clip.game.clipStart + props.clip.game.clipLength

const now = ref(props.serverNow())
const closedByMe = ref(false)
const ended = ref(now.value >= endsAt)
const open = computed(() => !closedByMe.value && !ended.value)
/** The player could not be made or cannot play the video: the game's card stands in for it. */
const playerFailed = ref(false)
const showsPlayer = computed(() => videoId.value !== null && !playerFailed.value)

const muted = ref(true)
/** The sound is muted by the device or the browser, not by a choice: „Ton aktivieren“ is offered. */
const soundBlocked = ref(false)
/** How far the clip has run, 0 to 1, for the bar. */
const progress = computed(() => Math.min(1, Math.max(0, (now.value - startAt) / (endsAt - startAt))))

let player: YouTubePlayer | null = null
let started = false
let driftTimer: ReturnType<typeof setTimeout> | undefined
let autoplayTimer: ReturnType<typeof setTimeout> | undefined
let tickTimer: ReturnType<typeof setInterval> | undefined

/** The second of the video that every device is at now; the start second when this device's estimate is a hair early. */
const secondNow = () => clipPosition(props.clip, props.serverNow()) ?? props.clip.game.clipStart

function load(second: number) {
  player?.loadVideoById({ videoId: videoId.value!, startSeconds: second, endSeconds: endSecond })
}

/** The unmuted start did not happen: play muted at the right second and ask for the tap. */
function fallBackToMuted() {
  if (!player || started) return
  clearTimeout(autoplayTimer)
  muted.value = true
  soundBlocked.value = true
  player.mute()
  load(secondNow())
}

function onPlaying() {
  if (started) return
  started = true
  clearTimeout(autoplayTimer)
  driftTimer = setTimeout(() => {
    const expected = clipPosition(props.clip, props.serverNow())
    if (player && expected !== null && Math.abs(player.getCurrentTime() - expected) > DRIFT_LIMIT_S) player.seekTo(expected, true)
  }, DRIFT_CHECK_MS)
}

async function createPlayer() {
  let api: YouTubeApi
  try {
    api = await loadYouTubeApi()
  }
  catch {
    playerFailed.value = true
    return
  }
  // The clip may have closed, or the overlay gone, while the script loaded.
  if (!stage.value || !open.value || player) return
  const host = document.createElement('div')
  stage.value.replaceChildren(host)
  player = new api.Player(host, {
    videoId: videoId.value!,
    host: YOUTUBE_HOST,
    playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1, modestbranding: 1 },
    events: {
      onReady: () => {
        if (muted.value) player?.mute()
        else player?.unMute()
        load(secondNow())
        // A browser that blocks the unmuted start may say nothing: not PLAYING in time is the same answer.
        if (!muted.value) autoplayTimer = setTimeout(fallBackToMuted, AUTOPLAY_WAIT_MS)
      },
      onStateChange: (change) => {
        if (change.data === (api.PlayerState?.PLAYING ?? YOUTUBE_PLAYING)) onPlaying()
      },
      onAutoplayBlocked: fallBackToMuted,
      onError: () => {
        playerFailed.value = true
      },
    },
  })
}

function destroyPlayer() {
  clearTimeout(driftTimer)
  clearTimeout(autoplayTimer)
  player?.destroy()
  player = null
}

function toggleMute() {
  muted.value = !muted.value
  soundBlocked.value = false
  if (muted.value) player?.mute()
  else player?.unMute()
}

/** „Ton aktivieren“: the tap the browser needs before it plays sound. */
function enableSound() {
  muted.value = false
  soundBlocked.value = false
  player?.unMute()
}

/** Closes this device's clip. Nothing is sent: the other devices play on. */
function closeForMe() {
  closedByMe.value = true
}

watch(open, (isOpen) => {
  if (!isOpen) destroyPlayer()
})

onMounted(() => {
  // A desktop plays with sound unless the User turned sound off; a phone starts muted and offers the tap (the phone's browser
  // would block the unmuted start anyway).
  muted.value = !(wide.value === true && sound.enabled.value)
  soundBlocked.value = muted.value && sound.enabled.value
  tickTimer = setInterval(() => {
    now.value = props.serverNow()
    if (now.value >= endsAt) ended.value = true
  }, TICK_MS)
  if (open.value && videoId.value) void createPlayer()
})

onBeforeUnmount(() => {
  clearInterval(tickTimer)
  destroyPlayer()
})
</script>

<template>
  <Transition
    enter-active-class="animate-clip-in"
    leave-active-class="transition-opacity dur-base ease-in"
    leave-to-class="opacity-0"
  >
    <section
      v-if="open"
      :aria-label="t('clip.label', { name: clip.game.name })"
      class="fixed inset-x-0 top-[calc(var(--cp-header-h)+var(--cp-bw)+10px)] layer-clip mx-auto flex w-[min(720px,calc(100%-1.75rem))] flex-col overflow-hidden rounded-[14px] border-(length:--cp-bw) border-line bg-surface shadow-card"
    >
      <div
        class="relative aspect-video bg-ink"
        :class="{ 'grid place-items-center bg-paper-2 p-4': !showsPlayer }"
      >
        <div
          v-if="showsPlayer"
          ref="stage"
          role="group"
          :aria-label="t('gameEdit.playerLabel')"
          class="size-full [&_iframe]:size-full"
        />
        <GameCard
          v-else
          :game="clip.game"
          class="w-full max-w-[420px]"
        />
        <span class="pointer-events-none absolute top-2.5 left-2.5 inline-flex h-[30px] items-center gap-1.5 rounded-pill border-2 border-line bg-surface px-2.5 text-[12px] font-extrabold">
          <span class="size-2 rounded-full bg-hot motion-safe:animate-pulse" />
          {{ t('clip.live') }}
        </span>
      </div>
      <div
        role="progressbar"
        :aria-label="t('clip.label', { name: clip.game.name })"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(progress * 100)"
        class="h-2.5 border-y-2 border-line bg-surface"
      >
        <span
          class="block h-full bg-hot transition-[width] duration-250 ease-linear"
          :style="{ width: `${progress * 100}%` }"
        />
      </div>
      <div class="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <AppButton
          v-if="soundBlocked"
          variant="primary"
          size="md"
          @click="enableSound"
        >
          <AppIcon
            :icon="Volume2"
            :size="16"
          />
          {{ t('sound.enable') }}
        </AppButton>
        <IconButton
          v-else-if="showsPlayer"
          :icon="muted ? VolumeX : Volume2"
          :label="muted ? t('common.soundOn') : t('common.soundOff')"
          @click="toggleMute"
        />
        <span class="flex-1" />
        <AppButton
          v-if="isHost"
          variant="secondary"
          size="md"
          @click="() => skip()"
        >
          <AppIcon
            :icon="SkipForward"
            :size="16"
          />
          {{ t('dock.skipClip') }}
        </AppButton>
        <IconButton
          :icon="X"
          :label="t('clip.closeForMe')"
          @click="closeForMe"
        />
      </div>
      <p
        v-if="soundBlocked && wide"
        class="m-0 px-3 pb-2.5 text-small text-pretty text-ink-2"
      >
        {{ t('sound.blocked') }}
      </p>
    </section>
  </Transition>
</template>
