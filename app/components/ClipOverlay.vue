<script setup lang="ts">
import { SkipForward, Volume2, VolumeX, X } from '@lucide/vue'
import { MD_QUERY } from '~/composables/useMediaQuery'
import { YOUTUBE_HOST, YOUTUBE_PAUSED, YOUTUBE_PLAYING, loadYouTubeApi, type YouTubeApi, type YouTubePlayer } from '~/utils/youtube'
import { clipPosition } from '~~/shared/clip'
import { clipEnded } from '~~/shared/draw-timeline'
import type { ClipView } from '~~/shared/stage'

// The synced clip (#230, 04-motion § Clip overlay and § Synchronised moments, 02-components § ClipPlayer): the game's YouTube excerpt
// over the stage, playing the same second on every device. It opens when the Event read carries the clip (the server clock is at
// the draw's stop) and closes by itself at `endsAt` without waiting for a refetch. A late joiner lands on the right second
// (`clipPosition`), and when the player has drifted by more than a second after 3 s of playback it seeks once. A game without
// a video shows its card for the clip's length. The player takes no input (#509): its container is `inert` and `pointer-events-none`,
// and nothing is placed over it, because YouTube forbids covering an embedded player; a player that pauses anyway (headset button, the
// system) is resumed at the synced second. Mute and close are this device's alone; the Host's „Clip überspringen“ is the
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
/** The progress bar and the end of the clip follow the server clock at this pace; also the bar's transition length: one tick eases into the next. */
const TICK_MS = 250
/** At most one resume per this long: a player that pauses again at once is asked again after it, never in a tight loop (#509). */
const RESUME_GAP_MS = 1000
/** No resume in the last second before `endsAt`: the video stops by itself at its end second, and a resume there would only start it to stop it again. */
const END_MARGIN_MS = 1000

const { t } = useI18n()
const sound = useSound()
const wide = useMediaQuery(MD_QUERY)
const stage = useTemplateRef<HTMLElement>('stage')

const videoId = computed(() => props.clip.game.youtubeId)
const startAt = Date.parse(props.clip.startAt)
const endsAt = Date.parse(props.clip.endsAt)
/** The video's last second of the clip. */
const endSecond = props.clip.game.clipStart + props.clip.game.clipLength

// The server's time of this tick; null before the page has mounted, so the progress bar renders the same on the server and on a
// hard load's first client render (review 0.7, F11). The read carries a clip only while it runs, so it has not ended before mount.
// The ticker (#257) runs every TICK_MS and not every frame: the bar eases over 250 ms in CSS, so a write per frame would fight the
// transition. The clip is not a countdown, and it ends at `endsAt` from the ticker without waiting for a refetch.
const now = useServerTicker(() => props.serverNow(), { until: () => endsAt, every: TICK_MS })
const closedByMe = ref(false)
const ended = computed(() => now.value !== null && clipEnded({ endsAt }, now.value))
const open = computed(() => !closedByMe.value && !ended.value)
/** The player could not be made or cannot play the video: the game's card stands in for it. */
const playerFailed = ref(false)
const showsPlayer = computed(() => videoId.value !== null && !playerFailed.value)

const muted = ref(true)
/** The sound is muted by the device or the browser, not by a choice: „Ton aktivieren“ is offered. */
const soundBlocked = ref(false)
/** „Ton aktivieren“ is offered only with a player: a game without a video (or a failed player) has no sound to unlock (F22). */
const offersSound = computed(() => soundBlocked.value && showsPlayer.value)
/** How far the clip has run, 0 to 1, for the bar. */
const progress = computed(() => (now.value === null ? 0 : Math.min(1, Math.max(0, (now.value - startAt) / (endsAt - startAt)))))

let player: YouTubePlayer | null = null
let started = false
let driftTimer: ReturnType<typeof setTimeout> | undefined
let autoplayTimer: ReturnType<typeof setTimeout> | undefined
let resumeTimer: ReturnType<typeof setTimeout> | undefined
/** Server ms of the last resume. */
let resumedAt = Number.NEGATIVE_INFINITY
/** `PlayerState.PAUSED`, set in createPlayer from the API. */
let pausedState = YOUTUBE_PAUSED

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

/** The player paused although nobody could ask it to (#509): play on at the second everybody else is at. */
function resumeIfPaused() {
  clearTimeout(resumeTimer)
  // Only a clip that has played before (the unmuted-start fallback owns the start), is open, and is not about to end.
  if (!player || !started || !open.value) return
  const at = props.serverNow()
  if (endsAt - at <= END_MARGIN_MS) return
  const wait = resumedAt + RESUME_GAP_MS - at
  if (wait > 0) {
    // Paused again within the gap: look again when it is over, and resume only if it is still paused.
    resumeTimer = setTimeout(() => {
      if (player?.getPlayerState() === pausedState) resumeIfPaused()
    }, wait)
    return
  }
  resumedAt = at
  // Play first: a seek on a paused player keeps it paused. A null position is a hair before the start.
  player.playVideo()
  player.seekTo(clipPosition(props.clip, at) ?? props.clip.game.clipStart, true)
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
  pausedState = api.PlayerState?.PAUSED ?? YOUTUBE_PAUSED
  const host = document.createElement('div')
  stage.value.replaceChildren(host)
  player = new api.Player(host, {
    videoId: videoId.value!,
    host: YOUTUBE_HOST,
    playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, playsinline: 1 },
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
        else if (change.data === pausedState) resumeIfPaused()
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
  clearTimeout(resumeTimer)
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
  if (open.value && videoId.value) void createPlayer()
})

onBeforeUnmount(() => {
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
      class="fixed inset-x-0 top-(--clip-top) layer-clip mx-auto flex max-h-[calc(100dvh-var(--clip-top)-10px)] w-[min(720px,calc(100%-1.75rem))] flex-col overflow-x-hidden overflow-y-auto rounded-[14px] border-(length:--cp-bw) border-line bg-surface shadow-card [--clip-bar-h:74px] [--clip-top:calc(var(--cp-header-h)_+_var(--cp-bw)_+_10px)] [--clip-video-h:calc(100dvh-var(--clip-top)-var(--clip-bar-h)-2*var(--cp-bw)-10px)]"
    >
      <!-- Phone held sideways (#549): the video is as wide as the height left under the header allows, 16:9 kept and never lower than
           YouTube's 200 px, so the bar below it stays on screen. --clip-bar-h is that bar: the 10 px progress line and a row of
           44 px buttons with py-2.5. What does not fit scrolls inside the section. The sides of the narrower box are its own colour.
           Without a video (#555) there is no 16:9 box and no cap: the card is taller than that box on a phone, so the box takes the
           card's height with its padding, and a viewport too low for it scrolls the section as above. -->
      <div
        class="shrink-0"
        :class="showsPlayer ? 'bg-ink' : 'bg-paper-2'"
      >
        <div
          :class="showsPlayer
            ? 'relative mx-auto aspect-video w-[min(100%,max(calc(200px*16/9),calc(var(--clip-video-h)*16/9)))] bg-ink'
            : 'grid place-items-center bg-paper-2 p-4'"
        >
          <div
            v-if="showsPlayer"
            ref="stage"
            inert
            role="group"
            :aria-label="t('gameEdit.playerLabel')"
            class="pointer-events-none size-full [&_iframe]:size-full"
          />
          <GameCard
            v-else
            :game="clip.game"
            class="w-full max-w-[420px]"
          />
        </div>
      </div>
      <div
        role="progressbar"
        :aria-label="t('clip.label', { name: clip.game.name })"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(progress * 100)"
        class="h-2.5 shrink-0 border-y-2 border-line bg-surface"
      >
        <span
          class="block h-full bg-hot transition-[width] ease-linear"
          :style="{ width: `${progress * 100}%`, transitionDuration: `${TICK_MS}ms` }"
        />
      </div>
      <div class="flex shrink-0 flex-wrap items-center gap-2 px-3 py-2.5">
        <AppButton
          v-if="offersSound"
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
        <span
          v-if="isHost"
          class="inline-flex items-center gap-1.5 text-[13px] font-bold whitespace-nowrap text-ink-2"
        >
          <span
            class="size-2 flex-none rounded-full bg-hot animate-live"
            aria-hidden="true"
          />
          {{ t('clip.live') }}
        </span>
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
        v-if="offersSound && wide"
        class="m-0 px-3 pb-2.5 text-small text-pretty text-ink-2"
      >
        {{ t('sound.blocked') }}
      </p>
    </section>
  </Transition>
</template>
