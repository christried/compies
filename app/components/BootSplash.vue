<script setup lang="ts">
import type { RigState } from '~/utils/compibert-rig'
import type { Gsap } from '~/utils/gsap'
import { bootCookie } from '~~/shared/boot'
import { bootRun, bootTimeline } from '~/utils/boot-motion'

// The installed app's splash „Reinsprinten“ (#674, spec #927, screen 01, 04-motion § Boot): the layer is in the first byte of Home for a signed-in User
// without the cookie `compies-boot` (`useBootSplash`), and only the stylesheet shows it, under `display-mode: standalone`, so a browser tab never sees
// it and Home never flashes before it. The still frame is what the first byte shows; the run-in cuts to its start poses and plays (ADR 0015: the
// splash moves the rig, so it loads GSAP, through `loadGsap()` only). It ends by itself, on a tap or on a key, and then says `done`.
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const calm = useReducedMotion()
const root = useTemplateRef<HTMLElement>('root')
const wrap = useTemplateRef<HTMLElement>('wrap')
const state = ref<RigState>('idle')
// Empty in the first byte: a live region announces a change, not its first render.
const announcement = ref('')

const LETTERS = [...'COMPIES']
// The artboard's resting look of each letter (App Einstieg `letters`): the colour of its hard shadow, its lift and its tilt.
const SHADOWS = ['var(--cp-hot)', 'var(--cp-mint)', 'var(--cp-pop)', 'var(--cp-cobalt)']
const LIFT = [0, -10, 4, -14, 2, -6, 0]
const TILT = [-4, 3, -2, 5, -3, 2, -4]
const letterStyle = (index: number) => ({
  textShadow: `4px 4px 0 ${SHADOWS[index % SHADOWS.length]}`,
  transform: `translateY(${LIFT[index]}px) rotate(${TILT[index]}deg)`,
})

// The Lab's boxes, in a 160 px-wide figure: the wrapper's `--boot-k` is its width / 160, so they follow the figure's size.
const scaled = (value: number) => `calc(var(--boot-k) * ${value}px)`
const LINES = [{ left: -80, top: 44, width: 76 }, { left: -104, top: 66, width: 96 }, { left: -66, top: 88, width: 56 }]
const DUST = [{ size: 22, left: 52, top: 112 }, { size: 18, left: 40, top: 116 }, { size: 14, left: 30, top: 118 }, { size: 10, left: 22, top: 120 }]

/** The calm splash holds its still frame this long, counted from the mount, before it fades away. */
const HOLD_MS = 600
/** The run-in starts only if GSAP and the rig are ready this soon after the mount: a slow phone gets no run, and no retry. */
const GIVE_UP_MS = 400

let ended = false
let timeline: ReturnType<typeof bootTimeline> | undefined
let fade: Animation | undefined
const timers: ReturnType<typeof setTimeout>[] = []
let rigIsReady = () => {}
const rigReady = new Promise<void>((resolve) => { rigIsReady = resolve })

function later(ms: number, callback: () => void) {
  timers.push(setTimeout(callback, ms))
}

function stopListening() {
  root.value?.removeEventListener('pointerdown', skip)
  window.removeEventListener('keydown', onKey, true)
}

/** The one end: said once, whichever way the splash got here. */
function finish() {
  if (ended) return
  ended = true
  stopListening()
  emit('done')
}

/** A tap or a key: the run-in jumps to its end (the last tween is the fade to nothing, which then says `done`); any other path ends at once. */
function skip() {
  if (ended) return
  if (timeline) timeline.progress(1)
  else finish()
}

// Capture and stop: the layer covers the page, so a key must not reach a dialog open under it.
function onKey(event: KeyboardEvent) {
  event.stopPropagation()
  skip()
}

/** The still frame fades away, linear, over the token the app's layers use; then `done`. Where an element cannot animate it goes at once. */
function fadeAway(layer: HTMLElement) {
  if (ended) return
  if (typeof layer.animate !== 'function') return finish()
  fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: motionMs('--cp-dur-base', '220ms'), easing: 'linear', fill: 'forwards' })
  fade.finished.then(finish, () => {})
}

/** GSAP and the rig, or nothing when the 400 ms come first (or GSAP does not load). */
async function loadInTime(): Promise<Gsap | null> {
  const both = Promise.all([loadGsap(), rigReady]).then(([gsap]) => gsap, () => null)
  const give = new Promise<null>(resolve => later(GIVE_UP_MS, () => resolve(null)))
  return Promise.race([both, give])
}

/** Measured before the start poses are set: the wrapper's place and the letters' centres, in the layer's coordinates. */
function run(gsap: Gsap, layer: HTMLElement, figure: HTMLElement) {
  const origin = layer.getBoundingClientRect().left
  const letters = [...layer.querySelectorAll<HTMLElement>('[data-part=boot-letter]')]
  const box = figure.getBoundingClientRect()
  const { distance, times } = bootRun({
    wrapperLeft: box.left - origin,
    wrapperWidth: box.width,
    centres: letters.map((letter) => {
      const rect = letter.getBoundingClientRect()
      return rect.left - origin + rect.width / 2
    }),
  })
  const all = (part: string) => [...layer.querySelectorAll<HTMLElement>(`[data-part=${part}]`)]
  timeline = bootTimeline(
    gsap,
    { layer, wrap: figure, letters, lines: all('boot-line'), dust: all('boot-dust') },
    { distance, times, setState: next => (state.value = next), onDone: finish },
  )
  timeline.play()
}

onMounted(async () => {
  const layer = root.value
  const figure = wrap.value
  if (!layer || !figure) return
  // A browser tab: the stylesheet has hidden the layer all along. It ends without writing the cookie, so the installed app's first launch still gets it.
  if (!window.matchMedia('(display-mode: standalone)').matches) return finish()
  // Written once, when the layer has shown. Secure where the page is served over https, as the session cookie is (`BETTER_AUTH_URL` is that origin).
  document.cookie = bootCookie(location.protocol === 'https:')
  announcement.value = t('bootSplash.announce')
  layer.addEventListener('pointerdown', skip)
  window.addEventListener('keydown', onKey, true)

  if (reducedMotion()) {
    later(HOLD_MS, () => fadeAway(layer))
    return
  }
  const gsap = await loadInTime()
  if (ended) return
  if (gsap) run(gsap, layer, figure)
  else fadeAway(layer)
})

onBeforeUnmount(() => {
  ended = true
  stopListening()
  timeline?.kill()
  fade?.cancel()
  timers.forEach(clearTimeout)
})
</script>

<template>
  <!-- The layer is `display: none` by default; the style block below shows it for the installed app. -->
  <div
    ref="root"
    class="boot-splash fixed inset-0 layer-confetti flex-col items-center justify-center overflow-hidden bg-paper text-ink"
    data-part="boot-splash"
    :data-variant="calm ? 'calm' : 'run'"
  >
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ announcement }}
    </p>
    <div class="flex flex-col items-end gap-3">
      <p
        class="m-0 flex font-display text-[58px] leading-none uppercase md:text-[104px]"
        role="img"
        aria-label="Compies"
      >
        <span
          v-for="(letter, index) in LETTERS"
          :key="index"
          class="inline-block"
          data-part="boot-letter"
          aria-hidden="true"
        >
          <span
            class="inline-block"
            :style="letterStyle(index)"
          >{{ letter }}</span>
        </span>
      </p>
      <div
        ref="wrap"
        class="relative w-[200px] overflow-visible [--boot-k:1.25] md:w-[280px] md:[--boot-k:1.75]"
        data-part="boot-wrap"
      >
        <span
          v-for="(line, index) in LINES"
          :key="`line${index}`"
          class="absolute rounded-[3px] bg-ink opacity-0"
          data-part="boot-line"
          :style="{ left: scaled(line.left), top: scaled(line.top), width: scaled(line.width), height: scaled(6) }"
        />
        <span
          v-for="(puff, index) in DUST"
          :key="`dust${index}`"
          class="absolute rounded-full border-[2.5px] border-ink bg-paper-2 opacity-0"
          data-part="boot-dust"
          :style="{ left: scaled(puff.left), top: scaled(puff.top), width: scaled(puff.size), height: scaled(puff.size) }"
        />
        <div class="relative">
          <CompibertRig
            variant="full"
            :state="state"
            :micro="false"
            @ready="rigIsReady"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* The installed app only (iOS standalone matches the same query): a browser tab never sees the layer, and Home never flashes before it. */
.boot-splash {
  display: none;
}
@media (display-mode: standalone) {
  .boot-splash {
    display: flex;
  }
}
/* The calm splash, and a device that asks for less motion, fade in from the first byte, before any script runs (#674). */
.boot-splash[data-variant=calm] {
  animation: boot-fade-in 0.2s linear both;
}
@media (prefers-reduced-motion: reduce) {
  .boot-splash {
    animation: boot-fade-in 0.2s linear both;
  }
}
@keyframes boot-fade-in {
  from {
    opacity: 0;
  }
}
</style>
