<script setup lang="ts">
import { teamName } from '~/utils/board'
import { clockTick, revealTile, vetoStamp } from '~/utils/motion'
import { VETO_WINDOW_MS } from '~~/shared/rounds'
import type { BoardTeam, MemberView, WheelView } from '~~/shared/event'

// The Veto window on the stage (#231, 02-components § VetoWindow, 04-motion § Veto window, reference App Spielrunde „Clip + Veto-Fenster“,
// „Eigenes Veto versiegelt“, „Aufdecken“). It opens at the wheel's stop and runs until `vetoEndsAt`: the game it is about (for a game
// the Host set this card is the only place on the stage that names it, F6), the time left (rendered from the server's clock, the last
// ten seconds tick) and every Party's Vetoes left in its Team colour. The hold-to-veto button is not here: it sits in the VetoBar, a
// fixed layer (review 0.7, F4). Nobody sees another Party's cast before the end: the numbers and tiles come from the server per
// viewer. At the end the page reads again (useInstantRefresh), and the tiles turn over, with a „VETO“ stamp on every Party that
// vetoed, then the outcome says what happens to the game. A Party's tile after a reload shows the same, without the turning.
const props = defineProps<{
  wheel: WheelView
  teams: readonly BoardTeam[]
  members: readonly MemberView[]
  /** The server's time in epoch ms (useServerClock). */
  serverNow: () => number
}>()

const { t } = useI18n()

const vetoes = computed(() => props.wheel.vetoes)
// The draw the window belongs to: the latest one of any kind (#232), a spin or a game the Host set; a set draw's window opens at once.
const draw = computed(() => vetoes.value.draw)
const { mounted, now, endsAt, open, msLeft, secondsLeft } = useVetoClock(() => draw.value, props.serverNow)
const revealed = computed(() => vetoes.value.revealed)
/** Shown from the stop on while the window runs, and after it as long as this draw is the latest with a window. */
const shown = computed(() => endsAt.value !== null && (open.value || (mounted.value && now.value >= endsAt.value)))
/** The window has ended but the reveal has not come in yet: the page reads again in a moment. */
const revealing = computed(() => shown.value && !open.value && revealed.value === null)

const fraction = computed(() => Math.min(1, msLeft.value / VETO_WINDOW_MS))

const timer = useTemplateRef<HTMLElement>('timer')
watch(secondsLeft, (seconds) => {
  if (open.value && seconds <= 10 && timer.value) clockTick(timer.value)
})

interface Tile {
  team: number
  name: string
  left: number
  cast: { name: string } | null
}
const tiles = computed((): Tile[] => vetoes.value.left.map((left, index) => {
  const team = index + 1
  const veto = revealed.value?.find(entry => entry.team === team)
  return {
    team,
    name: teamName(props.teams.find(entry => entry.position === team) ?? team, t),
    left,
    cast: veto ? { name: props.members.find(member => member.id === veto.userId)?.name ?? '' } : null,
  }
}))

const vetoed = computed(() => (revealed.value?.length ?? 0) > 0)
const outcome = computed(() => {
  if (revealed.value === null) return null
  const game = draw.value?.game?.name ?? ''
  if (!vetoed.value) return t('veto.outcomeSet', { game })
  const list = new Intl.ListFormat('de', { style: 'long', type: 'conjunction' }).format(revealed.value.map(entry => props.members.find(member => member.id === entry.userId)?.name ?? ''))
  // A vetoed spin flies off the wheel and the wheel spins again; a vetoed set game is chosen anew (#232).
  return t(draw.value?.kind === 'set' ? 'veto.outcomeVetoSet' : 'veto.outcomeVeto', { list, game })
})

// The tiles turn over when the reveal arrives while the page is open, not when a reload shows a window that ended long ago.
const turning = useTemplateRef<HTMLElement[]>('tile')
const stamps = useTemplateRef<HTMLElement[]>('stamp')
watch(revealed, (now, before) => {
  if (before !== null || now === null) return
  turning.value?.forEach((element, index) => revealTile(element, index))
  stamps.value?.forEach(element => vetoStamp(element))
}, { flush: 'post' })
</script>

<template>
  <section
    v-if="shown"
    :aria-label="t('veto.title')"
    class="flex flex-col gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 text-ink"
  >
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="m-0 font-display text-[22px] leading-tight font-normal">
        {{ t('veto.title') }}
      </h2>
      <p
        ref="timer"
        role="timer"
        class="m-0 origin-right text-[14px] font-bold tabular-nums"
        :class="open && secondsLeft <= 10 ? 'text-error-fg' : 'text-ink-2'"
      >
        {{ open ? t('veto.timeLeft', secondsLeft) : revealing ? t('veto.revealing') : t('veto.revealed') }}
      </p>
    </div>

    <GameCard
      v-if="draw?.game"
      :game="draw.game"
      layout="row"
    />

    <div
      v-if="open || revealing"
      aria-hidden="true"
      class="h-2.5 overflow-hidden rounded-pill border-2 border-line bg-paper-2"
    >
      <div
        class="h-full origin-left bg-hot"
        :style="{ transform: `scaleX(${fraction})` }"
      />
    </div>

    <ul
      :aria-label="t('veto.parties')"
      class="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2 p-0"
    >
      <li
        v-for="tile in tiles"
        :key="tile.team"
        ref="tile"
        data-testid="veto-tile"
        class="flex min-h-20 flex-col gap-1 rounded-[14px] border-(length:--cp-bw) bg-surface p-2.5"
        :class="revealed !== null && !tile.cast ? 'bg-paper-2' : ''"
        :style="{ borderColor: `var(--cp-team-${tile.team})` }"
      >
        <TeamChip
          :team="tile.team"
          :name="tile.name"
        />
        <template v-if="revealed === null">
          <p class="m-0 text-[14px] font-bold text-ink-2">
            {{ t('veto.left', tile.left) }}
          </p>
        </template>
        <!-- The stamp sits in the row, beside the text, so at 390 px it never covers „von …“ (F8). -->
        <div
          v-else
          class="flex items-end justify-between gap-2"
        >
          <div class="min-w-0">
            <p class="m-0 text-[14px] font-bold">
              {{ tile.cast ? t('veto.tileVeto') : t('veto.tileNone') }}
            </p>
            <p class="m-0 text-[13px] text-ink-2">
              {{ tile.cast ? t('veto.tileBy', { name: tile.cast.name }) : t('veto.tileSpared') }}
            </p>
          </div>
          <span
            v-if="tile.cast"
            ref="stamp"
            aria-hidden="true"
            class="flex-none -rotate-[8deg] rounded-[10px] border-[3px] border-line bg-hot px-2.5 py-0.5 font-display text-[18px] tracking-wide text-on-hot uppercase shadow-sm"
          >{{ t('veto.tileVeto') }}</span>
        </div>
      </li>
    </ul>

    <p
      v-if="outcome"
      role="status"
      class="m-0 font-bold"
    >
      {{ outcome }}
    </p>
  </section>
</template>
