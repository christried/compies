<script setup lang="ts">
import { countdownEndsAt, countdownState, remainingMsAt, type CountdownState } from '~~/shared/countdown'
import type { CountdownView } from '~~/shared/stage'

// The Countdown on the stage (#236, spec #218 § Countdown, 04-motion § Synchronised moments): the time left as mm:ss, computed from
// the server's clock and the stored facts on every animation frame while it runs, rounded up to whole seconds. Nothing counts down
// by itself, so every Member sees the same moment (ceil((endsAt − serverNow) / 1000)). Paused shows its remainder and „Pausiert“;
// at zero „Zeit ist um“ until the Host resets it. The Host's controls follow the state; the page sends them (`command`) and refetches.
// The look is the plain one of the stage cards: the motion and graphics are a hand-off for after the first Event.
const props = defineProps<{
  countdown: CountdownView
  /** The server's clock in epoch ms (the page's useServerClock): the time left is measured against it, not the User's clock. */
  serverNow: () => number
  isHost: boolean
  /** Sends the Host's command; resolves to whether the server took it (the page's send). */
  command: (action: CountdownCommand) => Promise<boolean>
}>()

type CountdownCommand = 'start' | 'pause' | 'reset'

const { t } = useI18n()
const headingId = useId()
// The server ticker (#257) reads the clock every frame while the Countdown runs and holds still when it is paused, at zero or scrolled
// out of view. Before the page has mounted it is null: the stored facts stand in (a running one at its start instant), so the server
// render and the first client render agree, and the real time shows at mount.
const now = useServerTicker(() => props.serverNow(), {
  until: () => countdownEndsAt(props.countdown),
  target: useTemplateRef('root'),
})
const at = computed(() => now.value ?? (props.countdown.startedAt === null ? 0 : Date.parse(props.countdown.startedAt)))
const state = computed<CountdownState>(() => countdownState(props.countdown, at.value))
const seconds = computed(() => Math.ceil(remainingMsAt(props.countdown, at.value) / 1000))

const pad = (n: number) => String(n).padStart(2, '0')
const clock = computed(() => {
  const left = Math.max(0, seconds.value)
  return `${pad(Math.floor(left / 60))}:${pad(left % 60)}`
})

/** The Host's controls by state: ready starts, running pauses, paused resumes or resets, at zero only a reset. */
const actions = computed((): { command: CountdownCommand, label: string }[] => {
  if (state.value === 'ready') return [{ command: 'start', label: t('countdown.start') }]
  if (state.value === 'running') return [{ command: 'pause', label: t('countdown.pause') }]
  if (state.value === 'paused') return [{ command: 'start', label: t('countdown.resume') }, { command: 'reset', label: t('countdown.reset') }]
  // At zero („Zeit ist um“): only a reset.
  return [{ command: 'reset', label: t('countdown.reset') }]
})
</script>

<template>
  <section
    ref="root"
    :aria-labelledby="headingId"
    class="flex flex-col gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 md:p-5"
  >
    <h2
      :id="headingId"
      class="m-0 font-display text-[22px] leading-tight font-normal"
    >
      {{ t('countdown.title') }}
    </h2>
    <p
      data-testid="countdown-time"
      class="m-0 font-display text-[56px] leading-none tabular-nums"
    >
      {{ clock }}
    </p>
    <p
      v-if="state === 'paused'"
      class="m-0 text-[14px] text-ink-2"
    >
      {{ t('countdown.paused') }}
    </p>
    <p
      v-else-if="state === 'ended'"
      class="m-0 text-[14px] font-bold"
    >
      {{ t('countdown.ended') }}
    </p>
    <div
      v-if="isHost && actions.length > 0"
      class="flex flex-wrap gap-2"
    >
      <AppButton
        v-for="action in actions"
        :key="action.command"
        :variant="action.command === 'reset' ? 'secondary' : undefined"
        @click="command(action.command)"
      >
        {{ action.label }}
      </AppButton>
    </div>
  </section>
</template>
