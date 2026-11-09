<script setup lang="ts">
import { clockTick } from '~/utils/motion'
import { clockText, vetoActionShown, vetoBarState } from '~/utils/veto-bar'
import { teamNameAt } from '~/utils/board'
import type { BoardTeam } from '~~/shared/event'
import type { WheelView } from '~~/shared/stage'

// The Veto bar (review 0.7, F4; 02-components § VetoWindow, 04-motion § Veto window, reference App Spielrunde „Clip + Veto-Fenster“,
// „Eigenes Veto versiegelt“): the Veto window's action in a fixed layer above the clip, because the stage is long and the hold button
// sat below the fold. A Player of a Party sees it while the window is open: the time left, what the Party may do, and the hold
// button (VetoButton) or its locked pill. The Bench, the Stands and a Host outside the teams get no bar; the inline VetoWindow shows
// them the time. At the desktop width it is a pill that leaves the side panel free, on a phone it floats above the tab bar. With
// the Host dock on the page it sits above the dock. It rises in with `animate-veto-in` and leaves with the fade the clip uses.
const props = defineProps<{
  wheel: WheelView
  /** The Event's Teams: the lock names the Party, never the Player who cast (#355). */
  teams: readonly BoardTeam[]
  /** A Party is a single Player (team size 1): the bar speaks to „du“ instead of „euer Team“. */
  solo?: boolean
  /** The server's time in epoch ms (useServerClock). */
  serverNow: () => number
  /** Casts the viewer's Party's Veto on a draw; resolves to whether the server took it. */
  cast: (drawId: string) => Promise<boolean>
}>()

const { t } = useI18n()
const { docked } = useHostDock()
const vetoes = computed(() => props.wheel.vetoes)
const { open, secondsLeft } = useVetoClock(() => vetoes.value.draw, props.serverNow)

const own = computed(() => vetoes.value.own)
const shown = computed(() => open.value && vetoActionShown(own.value))
// The page leaves room under its blocks while the bar covers the bottom.
const emit = defineEmits<{ shown: [shown: boolean] }>()
watch(shown, value => emit('shown', value), { immediate: true })
const state = computed(() => (own.value ? vetoBarState(own.value) : 'ready'))
const left = computed(() => vetoes.value.left[(own.value?.team ?? 1) - 1] ?? 0)
const title = computed(() => {
  if (state.value === 'cast' && own.value) return t('veto.byParty', { team: teamNameAt(props.teams, own.value.team, t) })
  return t(props.solo ? 'veto.soloLeft' : 'veto.partyLeft', left.value)
})
const sub = computed(() => ({ ready: t('veto.hint'), cast: t('veto.hintSealed'), none: '' })[state.value])

/** The last ten seconds turn red and tick once a second (04-motion § Veto window); a reduced-motion page does not pulse. */
const urgent = computed(() => secondsLeft.value <= 10)
const clock = useTemplateRef<HTMLElement>('clock')
watch(secondsLeft, () => {
  if (shown.value && urgent.value && clock.value) clockTick(clock.value)
})
</script>

<template>
  <Transition
    enter-active-class="animate-veto-in"
    leave-active-class="transition-opacity dur-base ease-in"
    leave-to-class="opacity-0"
  >
    <section
      v-if="shown && own"
      data-testid="veto-bar"
      :aria-label="t('veto.title')"
      class="fixed right-2.5 left-2.5 layer-veto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[20px] border-(length:--cp-bw) border-line bg-surface py-2.5 pr-2.5 pl-4 shadow-card md:right-[calc(var(--cp-panel-w)+24px)] md:left-6 md:flex-nowrap md:rounded-pill"
      :class="docked ? 'bottom-[162px] md:bottom-[100px]' : 'bottom-[90px] md:bottom-5'"
    >
      <span class="flex flex-none flex-col items-center leading-none">
        <span
          ref="clock"
          role="timer"
          class="timer text-[34px] tabular-nums md:text-[40px]"
          :class="urgent ? 'text-error-fg' : 'text-ink'"
        >{{ clockText(secondsLeft) }}</span>
        <span class="text-[10px] font-extrabold tracking-[0.06em] text-ink-2 uppercase">{{ t('veto.timeLabel') }}</span>
      </span>
      <div class="flex min-w-[calc(100%-90px)] flex-1 flex-col leading-snug md:min-w-40">
        <b class="text-[14px]">{{ title }}</b>
        <span
          v-if="sub"
          class="text-[12px] text-ink-2"
        >{{ sub }}</span>
      </div>
      <!-- The column takes the locked pill's width at md (#218): a fixed 260 px cut its label to „Vet…“ beside the stamp. The ready hold keeps its 260 px minimum. -->
      <div class="w-full flex-none md:w-auto md:min-w-[260px]">
        <VetoButton
          :own="own"
          :open="open"
          :cast="() => cast(vetoes.draw!.drawId)"
        />
      </div>
    </section>
  </Transition>
</template>
