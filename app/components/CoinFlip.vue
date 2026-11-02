<script setup lang="ts">
import tailSvg from '~/assets/compibert/coin-tail.svg?raw'
import { coinFinalPose, coinStandPose, FLIGHT_OPTIONS, flightKeyframes, type CoinPose } from '~/utils/coin-flight'
import { motionToken, reducedMotion } from '~/utils/motion'
import { COIN_DURATION_MS, coinLanded } from '~~/shared/coin'
import type { CoinView } from '~~/shared/event'

// The Coin flip on the stage (#235, spec #218 § Coin flip, 04-motion § Coin, reference Coin3D): the coin of the Event's latest toss.
// Every Member's coin flies from the same start instant and lands at the same instant: before the start it stands, after it the flight
// is seeked to the server's clock (a late joiner seeks in), and from the landing on the end frame shows at once. The result („Kopf!“ or
// „Schwanz!“) appears only at the landing, in a live region. Under reduced motion no flight runs: at the landing the coin fades out and in
// with its final face (0.5 s), and the result appears. The server picks the side; the page sends it with the toss (#235).

const props = defineProps<{
  toss: CoinView
  /** The server's time in epoch ms (useServerClock): the flight and the landing are measured against it. */
  serverNow: () => number
}>()

const { t } = useI18n()
const headingId = useId()
const camera = useTemplateRef<HTMLElement>('camera')
const position = useTemplateRef<HTMLElement>('position')
const spin = useTemplateRef<HTMLElement>('spin')
const shadow = useTemplateRef<HTMLElement>('shadow')
const banner = useTemplateRef<HTMLElement>('banner')

/** The 13 stacked edge discs of the coin (Coin3D): every fourth one dark, the others gold. */
const EDGES = Array.from({ length: 13 }, (_, index) => ({ z: index - 6, color: index % 4 === 0 ? '#151515' : '#c99a1a' }))
const FACE = 'position:absolute;inset:0;border-radius:50%;box-sizing:border-box;border:5px solid #151515;backface-visibility:hidden;-webkit-backface-visibility:hidden'
const HEAD_FACE = `${FACE};display:grid;place-items:center;background:var(--cp-primary);transform:translateZ(7px);box-shadow:inset 0 0 0 7px #fffdf8,inset 0 0 0 10px #151515`
const TAIL_FACE = `${FACE};display:grid;place-items:center;background:#3a86ff;transform:rotateY(180deg) translateZ(7px);box-shadow:inset 0 0 0 7px #fffdf8,inset 0 0 0 10px #151515`

const tails = computed(() => props.toss.side === 'tails')
const startMs = computed(() => Date.parse(props.toss.startedAt))
const landsMs = computed(() => Date.parse(props.toss.landsAt))
const result = computed(() => (tails.value ? t('coin.tail') : t('coin.head')))

/** Whether the toss has landed on the server's clock. Read on the client only, so the server's render and the first one agree. */
const landed = ref(false)
const pose = computed<CoinPose>(() => (landed.value ? coinFinalPose(tails.value) : coinStandPose))

let flight: Animation[] = []
let frame = 0
let reduced = false

/** Stops the flight and the frames: the coin keeps its pose until the next toss. */
function stopFlight() {
  cancelAnimationFrame(frame)
  frame = 0
  for (const animation of flight) animation.cancel()
  flight = []
}

/** Starts the four animations paused and seeks them to the server's clock: 0 before the start, the whole flight after the landing. */
function startFlight() {
  const ease = { io: motionToken('--cp-ease-io', 'cubic-bezier(.65,0,.35,1)'), out: motionToken('--cp-ease-out', 'cubic-bezier(.16,1,.3,1)') }
  const keyframes = flightKeyframes(tails.value, ease)
  const parts = [[camera.value, keyframes.camera], [position.value, keyframes.position], [spin.value, keyframes.spin], [shadow.value, keyframes.shadow]] as const
  flight = parts.flatMap(([element, frames]) => (element && typeof element.animate === 'function' ? [element.animate(frames, FLIGHT_OPTIONS)] : []))
  for (const animation of flight) animation.pause()
  seek(props.serverNow())
}

/** Moves every part of the flight to the server's moment: the start is 0, the landing is the full duration. */
function seek(at: number) {
  const elapsed = Math.min(Math.max(at - startMs.value, 0), COIN_DURATION_MS)
  for (const animation of flight) animation.currentTime = elapsed
}

/** At the landing: the result pops in (04-motion § Coin: 0.38 s pop), or under reduced motion the coin fades with its final face. */
function onLanded() {
  if (reduced) {
    camera.value?.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: 500 })
    return
  }
  void nextTick(() => {
    banner.value?.animate(
      [{ transform: 'rotate(-4deg) scale(.4)' }, { transform: 'rotate(-4deg) scale(1.1)' }, { transform: 'rotate(-4deg) scale(1)' }],
      { duration: 380, easing: motionToken('--cp-ease-pop', 'cubic-bezier(.34,1.56,.64,1)') },
    )
  })
}

/** One frame: reads the server's clock, seeks the flight to it, and waits for the landing. */
function tick() {
  frame = 0
  const was = landed.value
  const at = props.serverNow()
  landed.value = coinLanded({ landsAt: landsMs.value }, at)
  if (!reduced) seek(at)
  if (landed.value && !was) onLanded()
  if (!landed.value) frame = requestAnimationFrame(tick)
}

/** Starts the toss the page shows: its flight (unless reduced motion) and the frames until it lands. */
function start() {
  stopFlight()
  reduced = reducedMotion()
  landed.value = coinLanded({ landsAt: landsMs.value }, props.serverNow())
  if (!reduced) startFlight()
  if (!landed.value) frame = requestAnimationFrame(tick)
}

onMounted(start)
watch(() => props.toss.id, start)
onBeforeUnmount(stopFlight)
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex flex-col items-center gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 text-ink"
  >
    <h2
      :id="headingId"
      class="m-0 w-full font-display text-[22px] leading-tight font-normal"
    >
      {{ t('coin.title') }}
    </h2>
    <div
      class="relative aspect-square w-full max-w-[340px] overflow-hidden rounded-[18px] border-(length:--cp-bw) border-line"
      :style="{ background: 'var(--cp-surface-2)', perspective: '760px', perspectiveOrigin: '50% 42%' }"
    >
      <div
        ref="camera"
        class="absolute inset-0"
        :style="{ transformStyle: 'preserve-3d', transform: pose.camera }"
      >
        <div
          class="absolute top-1/2 left-1/2 size-[620px] -mt-[310px] -ml-[310px] rounded-full"
          :style="{ transformStyle: 'preserve-3d', transform: 'translateY(90px) rotateX(90deg)', background: 'var(--cp-paper-2)', boxShadow: 'inset 0 0 0 4px var(--cp-line-soft)' }"
        >
          <span
            ref="shadow"
            class="absolute top-1/2 left-1/2 size-[150px] -mt-[75px] -ml-[75px] rounded-full blur-[6px]"
            :style="{ background: 'var(--cp-shadow-ink)', transform: pose.shadow, opacity: pose.shadowOpacity }"
          />
        </div>
        <div
          ref="position"
          class="absolute top-1/2 left-1/2 size-[140px] -mt-[70px] -ml-[70px]"
          :style="{ transformStyle: 'preserve-3d', transform: pose.position }"
        >
          <div
            ref="spin"
            class="absolute inset-0"
            :style="{ transformStyle: 'preserve-3d', transform: pose.spin }"
          >
            <span
              v-for="edge in EDGES"
              :key="edge.z"
              class="absolute inset-0 rounded-full"
              :style="{ background: edge.color, transform: `translateZ(${edge.z}px)` }"
            />
            <div
              :style="HEAD_FACE"
              aria-hidden="true"
            >
              <Compibert
                variant="head"
                :size="104"
              />
            </div>
            <!-- eslint-disable vue/no-v-html -- the tail is our own static asset, not user content -->
            <div
              :style="TAIL_FACE"
              aria-hidden="true"
            >
              <span
                class="block size-[118px] overflow-hidden rounded-full [&>svg]:block [&>svg]:size-full"
                v-html="tailSvg"
              />
            </div>
            <!-- eslint-enable vue/no-v-html -->
          </div>
        </div>
      </div>
      <div
        aria-live="polite"
        class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center"
      >
        <span
          v-if="landed"
          ref="banner"
          class="rounded-[12px] border-[3px] border-[#151515] px-4 py-1 font-display text-[28px] leading-[1.1] whitespace-nowrap text-[#151515]"
          :style="{ background: tails ? '#3a86ff' : 'var(--cp-primary)', boxShadow: '4px 4px 0 var(--cp-shadow-ink)', transform: 'rotate(-4deg)' }"
        >
          {{ result }}
        </span>
      </div>
    </div>
  </section>
</template>
