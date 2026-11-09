<script setup lang="ts">
import { BellRing, Pause, Play, RotateCcw, Timer } from '@lucide/vue'
import type { Component } from 'vue'
import { countdownClock, PIP_COUNT, type Tone } from '~/utils/countdown-card'
import type { CountdownCommand } from '~~/shared/countdown'
import type { CountdownView } from '~~/shared/stage'

// The Countdown on the stage (#236, spec #218 § Countdown; its motion and graphics #340, 13-countdown, 04-motion § Countdown): the time
// left from the server's clock and the stored facts on every animation frame while it runs, rounded up to whole seconds. Nothing counts
// down by itself, so every Member sees the same moment (ceil((endsAt − serverNow) / 1000)). `useCountdownCard` owns the frame (`countdownFrame`,
// a function of those facts and the ticker's value: a viewer who opens the page at 7 s gets the 7 row at once), the status region, the tick
// on each second and the burst at zero (#363). This component keeps the layout, the frame's mapping to classes, pill, meta, timer text and
// actions, and the focus hand-over.
const props = withDefaults(defineProps<{
  countdown: CountdownView
  /** The server's clock in epoch ms (the page's useServerClock): the time left is measured against it, not the User's clock. */
  serverNow: () => number
  isHost: boolean
  /** Sends the Host's command; resolves to whether the server took it (the page's send). */
  command: (action: CountdownCommand) => Promise<boolean>
  /** The Host's name for the Members' lines. */
  hostName?: string
  /**
   * The card appeared while the page was open (the stage had rendered the Event without a Countdown): the status region then says it was set.
   * A card that is there when the page opens, by load or by a client navigation, says nothing (13-countdown § Accessibility, #332).
   */
  announceSet?: boolean
}>(), { hostName: undefined, announceSet: false })

const { t } = useI18n()
const headingId = useId()
const actionsRow = useTemplateRef<HTMLElement>('actionsRow')

const { frame, live, words, durationSet } = useCountdownCard(props)

const host = computed(() => props.hostName ?? t('countdown.hostFallback'))

const TONE_FILL: Record<Tone, string> = { calm: 'bg-paper-2', run: 'bg-primary', warn: 'bg-warning', err: 'bg-error' }
const TONE_TEXT: Record<Tone, string> = { calm: 'text-ink', run: 'text-on-primary', warn: 'text-on-warning', err: 'text-on-error' }
const DIGIT_TEXT = { 'ink': 'text-ink', 'warning-fg': 'text-warning-fg', 'error-fg': 'text-error-fg' } as const
const tileClass = computed(() => {
  const { tone, digitFg, view } = frame.value
  return [TONE_FILL[tone], digitFg === 'on' ? TONE_TEXT[tone] : DIGIT_TEXT[digitFg], view === 'paused' ? 'border-dashed' : 'border-solid']
})

const PILL = {
  ready: { class: 'bg-surface text-ink', key: 'ready' },
  running: { class: 'bg-primary text-on-primary', key: 'running' },
  paused: { class: 'bg-surface text-ink', key: 'paused' },
  done: { class: 'bg-error text-on-error', key: 'done' },
} as const

const characters = computed(() => [...frame.value.text])
const pips = computed(() => Array.from({ length: PIP_COUNT }, (_, i) => i < (frame.value.pips ?? 0)))
const pipFill = computed(() => (frame.value.warning ? 'bg-warning' : 'bg-error'))
const fillWidth = computed(() => `${Math.round(frame.value.fill * 10000) / 100}%`)
const fillEdge = computed(() => frame.value.fill > 0 && frame.value.fill < 1)

const meta = computed(() => {
  const { view, s } = frame.value
  const asHost = props.isHost
  if (view === 'running') return t('countdown.meta.set', { time: countdownClock(Math.ceil(props.countdown.durationMs / 1000)) })
  if (view === 'ready') return t(asHost ? 'countdown.meta.readyHost' : 'countdown.meta.ready', { time: countdownClock(s), host: host.value })
  if (view === 'paused') return t(asHost ? 'countdown.meta.pausedHost' : 'countdown.meta.paused', { time: countdownClock(s), host: host.value })
  return t(asHost ? 'countdown.meta.doneHost' : 'countdown.meta.done', { host: host.value })
})

/** What the screen reader can read on demand (the sr-only timer; implicit `aria-live="off"`, so it may change every second). */
const timerText = computed(() => {
  const { view, s } = frame.value
  if (view === 'done') return t('countdown.sr.timerDone')
  if (view === 'ready') return t('countdown.sr.timerReady', { duration: durationSet.value })
  return t(view === 'paused' ? 'countdown.sr.timerPaused' : 'countdown.sr.timer', { duration: words(s) })
})

/** The Host's controls by state: ready starts, running pauses, paused resumes or resets, at zero only a reset. */
const actions = computed((): { command: CountdownCommand, label: string, icon: Component }[] => {
  const { view } = frame.value
  if (view === 'ready') return [{ command: 'start', label: t('countdown.start'), icon: Play }]
  if (view === 'running') return [{ command: 'pause', label: t('countdown.pause'), icon: Pause }]
  if (view === 'paused') return [{ command: 'start', label: t('countdown.resume'), icon: Play }, { command: 'reset', label: t('countdown.reset'), icon: RotateCcw }]
  // At zero („Zeit ist um“): only a reset.
  return [{ command: 'reset', label: t('countdown.reset'), icon: RotateCcw }]
})

// Focus stays in the card after a Host action: the button that was pressed is gone when the state changes (Starten becomes Pausieren), so the
// first button of the new set takes the focus, once it is rendered. The press may resolve before or after the new state arrives.
const actionsKey = computed(() => actions.value.map(action => action.command).join())
let focusPendingSince: number | null = null
const FOCUS_WAIT_MS = 5000

function focusFirstAction() {
  actionsRow.value?.querySelector('button')?.focus()
}

async function press(action: CountdownCommand, event: MouseEvent) {
  const hadFocus = event.currentTarget === document.activeElement
  const keyAtPress = actionsKey.value
  const taken = await props.command(action)
  if (!taken || !hadFocus) return
  if (actionsKey.value !== keyAtPress) {
    await nextTick()
    focusFirstAction()
  }
  else focusPendingSince = Date.now()
}

watch(actionsKey, () => {
  if (focusPendingSince !== null && Date.now() - focusPendingSince < FOCUS_WAIT_MS) focusFirstAction()
  focusPendingSince = null
}, { flush: 'post' })
</script>

<template>
  <section
    ref="root"
    data-cd="card"
    :aria-labelledby="headingId"
    class="relative flex animate-enter flex-col gap-3.5 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-3.5 md:px-4.5 md:pt-4 md:pb-4.5"
    :class="frame.view === 'done' ? 'shadow-[6px_6px_0_var(--cp-error)]' : 'shadow-card'"
  >
    <div class="flex min-h-8 items-center gap-2.5">
      <span
        aria-hidden="true"
        class="grid size-8 flex-none place-items-center rounded-full border-2 border-line bg-primary text-on-primary"
      >
        <AppIcon
          :icon="Timer"
          :size="17"
        />
      </span>
      <h2
        :id="headingId"
        class="m-0 font-display text-[24px] leading-none font-normal md:text-[28px]"
      >
        {{ t('countdown.title') }}
      </h2>
      <span
        data-testid="countdown-pill"
        class="ml-auto inline-flex h-7 flex-none items-center gap-1.5 rounded-pill border-2 border-line px-2.75 text-[13px] font-extrabold whitespace-nowrap transition-colors dur-fast ease-snap motion-reduce:transition-none reduced:transition-none"
        :class="PILL[frame.view].class"
      >
        <span
          v-if="frame.view === 'ready' || frame.view === 'running'"
          aria-hidden="true"
          class="size-2 rounded-full border-[1.5px] border-line"
          :class="frame.view === 'running' ? 'bg-hot' : 'bg-ink-3'"
        />
        <AppIcon
          v-else
          :icon="frame.view === 'paused' ? Pause : BellRing"
          :size="14"
        />
        {{ t(`countdown.pill.${PILL[frame.view].key}`) }}
      </span>
    </div>

    <div class="flex flex-col items-center gap-3 md:grid md:grid-cols-[300px_minmax(0,1fr)] md:gap-5.5">
      <div
        ref="tile"
        data-testid="countdown-tile"
        data-cd="tile"
        class="relative grid h-[100px] place-items-center self-stretch rounded-[12px] border-(length:--cp-bw) border-line transition-colors dur-fast ease-snap md:h-[132px] motion-reduce:transition-none reduced:transition-none"
        :class="tileClass"
      >
        <span
          ref="ringA"
          data-cd="ringA"
          aria-hidden="true"
          class="pointer-events-none absolute inset-[-3px] rounded-[12px] border-(length:--cp-bw) border-error opacity-0"
        />
        <span
          ref="ringB"
          data-cd="ringB"
          aria-hidden="true"
          class="pointer-events-none absolute inset-[-3px] rounded-[12px] border-(length:--cp-bw) border-error opacity-0"
        />
        <span
          role="timer"
          class="sr-only"
        >{{ timerText }}</span>
        <span
          ref="digits"
          data-testid="countdown-digits"
          data-cd="digits"
          aria-hidden="true"
          class="inline-flex"
          :style="{ transform: `scale(${frame.scale.toFixed(3)})` }"
        >
          <span
            ref="pulse"
            data-testid="countdown-time"
            data-cd="pulse"
            class="inline-flex items-baseline font-timer text-[68px] leading-[.9] font-normal whitespace-nowrap tabular-nums md:text-[96px]"
          >
            <span
              v-for="(character, index) in characters"
              :key="index"
              class="inline-block text-center"
              :style="{ width: character === ':' ? 'var(--cp-timer-sep)' : 'var(--cp-timer-slot)' }"
            >{{ character }}</span>
          </span>
        </span>
        <!-- The ghost's box is 1.315 times the tile at rest and 1.644 in the burst, and the stamp's box is held at scale 2.4 until its drop: the
          wrappers clip those empty boxes, so the page does not scroll sideways at 390 px (#379). The rings and the digits are not clipped:
          they radiate past the tile on purpose. -->
        <span
          v-if="frame.view === 'done'"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <span
            ref="ghost"
            data-cd="ghost"
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 grid place-items-center font-timer text-[68px] leading-[.9] opacity-0 md:text-[96px]"
            style="transform: scale(1.315)"
          >1</span>
        </span>
        <span
          v-if="frame.view === 'paused'"
          data-cd="badge"
          aria-hidden="true"
          class="absolute top-2 right-2 grid size-[30px] place-items-center rounded-full border-2 border-line bg-surface text-ink"
        >
          <AppIcon
            :icon="Pause"
            :size="15"
          />
        </span>
        <!-- The stamp's box is held at scale 2.4 until its drop, so its wrapper clips it horizontally on phones only (#379): that keeps the
          page from widening at 390 px, while the drop's vertical spill and the desktop drop stay as designed. -->
        <span
          v-if="frame.view === 'done'"
          aria-hidden="true"
          class="pointer-events-none absolute inset-0 max-md:overflow-x-clip"
        >
          <span
            ref="stamp"
            data-cd="stamp"
            aria-hidden="true"
            class="absolute top-1/2 left-1/2 rounded-[8px] border-(length:--cp-bw) border-line bg-surface px-2.75 py-1.75 font-num text-[19px] leading-none whitespace-nowrap text-ink shadow-sm md:px-3.5 md:py-2.25 md:text-[24px]"
            style="transform: translate(-50%, -50%) rotate(-6deg)"
          >{{ t('countdown.stamp') }}</span>
        </span>
      </div>

      <div class="flex min-w-0 flex-col justify-center gap-3 self-stretch">
        <div
          v-if="frame.pips === null"
          aria-hidden="true"
          class="h-4 overflow-hidden rounded-pill border-(length:--cp-bw-thin) border-line bg-paper-2"
        >
          <span
            data-cd="fill"
            class="block h-full bg-primary"
            :class="fillEdge ? 'border-r-(length:--cp-bw-thin) border-r-line' : ''"
            :style="{ width: fillWidth, backgroundImage: frame.view === 'paused' ? 'repeating-linear-gradient(-45deg, transparent 0 6px, var(--cp-line-soft) 6px 12px)' : 'none' }"
          />
        </div>
        <div
          v-else
          aria-hidden="true"
          class="grid h-4 grid-cols-10 gap-[5px]"
        >
          <span
            v-for="(lit, index) in pips"
            :key="index"
            data-pip
            :data-lit="lit ? 'true' : 'false'"
            class="rounded-[5px] border-(length:--cp-bw-thin)"
            :class="lit ? ['border-solid border-line', pipFill] : 'border-dashed border-ink-3 bg-transparent'"
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <span
            data-testid="countdown-meta"
            class="min-w-0 flex-[1_1_200px] text-[14px] font-bold text-pretty text-ink-2"
          >{{ meta }}</span>
          <div
            v-if="isHost && actions.length > 0"
            ref="actionsRow"
            data-testid="countdown-actions"
            class="flex basis-full gap-2.5 md:basis-auto"
          >
            <AppButton
              v-for="action in actions"
              :key="action.command"
              variant="secondary"
              class="flex-1 md:flex-none"
              @click="press(action.command, $event)"
            >
              <template #icon>
                <AppIcon
                  :icon="action.icon"
                  :size="18"
                />
              </template>
              {{ action.label }}
            </AppButton>
          </div>
        </div>
      </div>
    </div>

    <p
      role="status"
      aria-live="polite"
      class="sr-only"
    >
      {{ live }}
    </p>
  </section>
</template>
