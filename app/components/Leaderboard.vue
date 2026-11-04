<script setup lang="ts">
import { ArrowDown, ArrowUp, Minus } from '@lucide/vue'
import { teamName } from '~/utils/board'
import { deltaPop, highlightRow, winnerStamp } from '~/utils/motion'
import { pointsDelta, rankMoves, type StandingsNews } from '~/utils/standings-news'
import type { BoardTeam } from '~~/shared/event'
import type { EndView, StandingView } from '~~/shared/stage'

// The Standings (#274, GLOSSARY: Standings, Shared place; 02-components § Leaderboard, 03-screens 17): every Party's
// rank and points, in the order the Event read gives (points descending, then team; `standingsOf` is the only place that ranks, so this
// sorts nothing). A shared rank prints the same text twice („1.“, „1.“, „3.“). A real table, so a screen reader walks it by rank, Party and
// points; its row layout is the artboard's card-like rows, drawn on the native cells (a border on each cell, rounded at the ends,
// `border-separate` for the gaps), because `display: flex` on a `tr` would drop the table semantics in some browsers.
// Rows are keyed by team and carry `data-team`; the `tbody` is a Vue move group, so a row that takes a new place glides (`lb-swap`, #276).
// In motion (#276, 04-motion § Leaderboard): the page's `news` (useStandingsNews, one owner for both Leaderboards) says that a Result is new.
// Then each Party's points count up from what the page saw, a delta pill pops in the points cell, and on the stage (`celebrate`) the winners get a
// stamp and 18 sticker confetti from the first winner's row. A Standings change without news does nothing but move the rows. The announcement
// for screen readers is the page's live region, not this table's: with the stage and the side panel mounted together, two would read it twice.
// `framed` is the stage block's card; the „Tabelle“ tab (the side panel, the phone's view) is unframed.
const props = withDefaults(defineProps<{
  standings: StandingView[]
  end: EndView
  teams: BoardTeam[]
  framed?: boolean
  /** The stage block only: the stamp and the confetti (the side panel's scroll container would clip the stamp). */
  celebrate?: boolean
  news?: StandingsNews | null
  /** The id of a heading outside this table that names it (#274): the phone's „Tabelle“ view, whose page h1 is the title; then the Leaderboard shows no h2 of its own. */
  labelledBy?: string
}>(), { framed: false, celebrate: false, news: null })

const { t } = useI18n()
const headingId = useId()
const root = useTemplateRef('root')
const confetti = useTemplateRef('confetti')

const nameOf = (team: number) => teamName(props.teams.find(item => item.position === team) ?? team, t)

/** A Leaderboard that mounts with a news younger than this plays it (the first Result creates the stage block in the render that brings the news); an older one is a tab opened later. */
const FRESH_MS = 1000
/** The confetti leaves just as the stamp lands (the stamp starts at 0.52 s and `DS Scoring` fires the burst at 0.56 s). */
const CONFETTI_AT_MS = 560
/** Where the burst starts, from the right edge of the winner's row. */
const CONFETTI_INSET = 60
const STAGGER_MS = 40
/** `lb-swap`: spring, the slower duration, each row after the one before it; the reduced twins do nothing. */
const MOVE_CLASS = 'transition-transform dur-slower ease-spring motion-reduce:transition-none reduced:transition-none [transition-delay:var(--lb-delay,0ms)]'
/**
 * A tab nobody is looking at stays calm (#276): a Result read while the page is hidden moves the rows at once, so the glide does not start
 * when the Member returns (the browser holds a hidden page's transitions at their start). Evaluated with each render, which is when Vue plans the move.
 */
const unwatched = () => import.meta.client && document.visibilityState === 'hidden'

/** The news this Leaderboard plays: its own copy, so a news it did not play (a stale one at mount) shows nothing. */
const playing = shallowRef<StandingsNews | null>(null)
let playedKey = 0
let burstTimer: ReturnType<typeof setTimeout> | undefined

// Runs before the render of the update that carries the news, so the pills and the first number of the count are in that very render.
watch(() => props.news, (news, previous) => {
  if (!news) {
    playing.value = null
    return
  }
  if (news.key === playedKey) return
  playedKey = news.key
  // `previous` is undefined only on the first run, at mount.
  if (previous === undefined && Date.now() - news.at >= FRESH_MS) return
  playing.value = news
}, { immediate: true })

const deltas = computed(() => (playing.value ? pointsDelta(playing.value.before, props.standings) : null))
const moves = computed(() => new Map((playing.value ? rankMoves(playing.value.before, props.standings) : []).map(move => [move.team, move] as const)))
const startOf = (team: number) => playing.value?.before.find(standing => standing.team === team)?.points ?? (playing.value ? 0 : undefined)

type PillKind = 'up' | 'down' | 'same'
const PILLS = {
  up: { icon: ArrowUp, classes: 'bg-success text-on-success' },
  down: { icon: ArrowDown, classes: 'bg-surface text-ink' },
  same: { icon: Minus, classes: 'bg-paper-2 text-ink' },
} as const
function pillOf(team: number) {
  const move = moves.value.get(team)
  const kind: PillKind = move === undefined ? 'same' : move.to < move.from ? 'up' : 'down'
  const delta = deltas.value?.get(team) ?? 0
  // A real minus (U+2212), like the artboard's „−“; „+0“ for a Party that gained nothing.
  return { ...PILLS[kind], text: delta < 0 ? `−${-delta}` : `+${delta}` }
}

function burst(news: StandingsNews) {
  const card = root.value
  const row = card?.querySelector(`tr[data-team="${news.winners[0]}"]`)
  if (!card || !row) return
  const cardBox = card.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  confetti.value?.burst(rowBox.right - cardBox.left - CONFETTI_INSET, rowBox.top + rowBox.height / 2 - cardBox.top)
}

function play(news: StandingsNews) {
  const card = root.value
  if (!card) return
  clearTimeout(burstTimer)
  for (const pill of card.querySelectorAll('[data-delta]')) deltaPop(pill)
  for (const move of rankMoves(news.before, props.standings)) {
    const row = card.querySelector(`tr[data-team="${move.team}"]`)
    if (row) highlightRow(row)
  }
  if (!props.celebrate) return
  for (const stamp of card.querySelectorAll('[data-stamp]')) winnerStamp(stamp)
  if (news.winners.length > 0) burstTimer = setTimeout(() => burst(news), CONFETTI_AT_MS)
}

onMounted(() => {
  if (playing.value) play(playing.value)
})
watch(playing, (news) => {
  if (news) play(news)
}, { flush: 'post' })
onBeforeUnmount(() => clearTimeout(burstTimer))
</script>

<template>
  <section
    ref="root"
    :aria-labelledby="labelledBy ?? headingId"
    class="flex min-w-0 flex-col gap-2"
    :class="framed && 'relative rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 shadow-card'"
  >
    <div class="mb-1 flex flex-col leading-[1.15]">
      <!-- No kicker before the first Result (#274): „Nach Spiel 0 von 6“ says nothing; the empty line below does. -->
      <p
        v-if="end.played > 0"
        class="m-0 text-[13px] font-bold text-ink-2"
      >
        {{ t('table.after', { n: end.played, total: end.gameCount }) }}
      </p>
      <h2
        v-if="!labelledBy"
        :id="headingId"
        class="m-0 font-display text-[28px] font-normal"
      >
        {{ t('table.title') }}
      </h2>
    </div>

    <p
      v-if="end.played === 0"
      class="m-0 text-ink-2"
    >
      {{ t('table.empty') }}
    </p>

    <table
      v-else
      :aria-labelledby="labelledBy ?? headingId"
      class="-my-2 w-full border-separate border-spacing-y-2"
    >
      <thead class="sr-only">
        <tr>
          <th scope="col">
            {{ t('table.colRank') }}
          </th>
          <th scope="col">
            {{ t('table.colParty') }}
          </th>
          <th scope="col">
            {{ t('table.colPoints') }}
          </th>
        </tr>
      </thead>
      <!-- `lb-swap` (04-motion): the rows glide into their new order, each 0.04 s after the one before it. The class names are the motion tokens; under reduced motion the move does nothing and the changed rows get the highlight. -->
      <TransitionGroup
        tag="tbody"
        :move-class="unwatched() ? undefined : MOVE_CLASS"
      >
        <tr
          v-for="(standing, index) in standings"
          :key="standing.team"
          :data-team="standing.team"
          :style="{ '--lb-delay': `${index * STAGGER_MS}ms` }"
        >
          <td class="w-px rounded-l-[12px] border-y-2 border-l-2 border-line bg-surface py-1.5 pr-2.5 pl-1.5">
            <span
              data-rank
              class="grid size-[38px] place-items-center rounded-[10px] border-line font-display text-[19px]"
              :class="standing.rank === 1 ? 'border-[3px] bg-primary text-on-primary' : 'border-[2.5px] bg-surface text-ink'"
            >{{ standing.rank }}.</span>
          </td>
          <td class="w-full max-w-0 border-y-2 border-line bg-surface py-1.5 pr-2.5">
            <div class="flex items-center gap-2.5">
              <TeamMark
                :team="standing.team"
                :size="28"
              />
              <b
                class="min-w-0 truncate text-[14px]"
                :title="nameOf(standing.team)"
              >{{ nameOf(standing.team) }}</b>
            </div>
          </td>
          <td class="relative rounded-r-[12px] border-y-2 border-r-2 border-line bg-surface py-1.5 pr-3 pl-1 text-right align-middle">
            <div class="flex items-center justify-end gap-2">
              <Transition
                leave-active-class="transition-opacity dur-fast ease-in"
                leave-to-class="opacity-0"
              >
                <span
                  v-if="playing"
                  data-delta
                  aria-hidden="true"
                  class="inline-flex h-6 flex-none items-center gap-1 rounded-pill border-2 border-line px-2 text-[13px] leading-none font-extrabold"
                  :class="pillOf(standing.team).classes"
                >
                  <component
                    :is="pillOf(standing.team).icon"
                    :size="12"
                    :stroke-width="3"
                  />{{ pillOf(standing.team).text }}
                </span>
              </Transition>
              <CpNum
                class="text-[26px] leading-none"
                :value="standing.points"
                :from="startOf(standing.team)"
                :say="t('table.points', { n: standing.points }, standing.points)"
              />
            </div>
            <!-- The stamp is a physical sticker: fixed ink on the yellow in both modes (`DS Scoring` data-won). Decorative: the live region says who won. -->
            <Transition
              leave-active-class="transition-opacity dur-fast ease-in"
              leave-to-class="opacity-0"
            >
              <span
                v-if="celebrate && playing?.winners.includes(standing.team)"
                data-stamp
                aria-hidden="true"
                class="absolute -top-6 -right-2.5 rounded-[10px] border-[3px] border-[#151515] bg-primary px-2.5 py-0.5 font-display text-[16px] leading-[1.2] whitespace-nowrap text-[#151515] shadow-sm"
                style="transform: rotate(8deg)"
              >{{ t(playing.kind === 'entered' ? 'table.winStamp' : 'table.wonStamp', { n: playing.number }) }}</span>
            </Transition>
          </td>
        </tr>
      </TransitionGroup>
    </table>

    <StickerConfetti
      v-if="celebrate"
      ref="confetti"
    />
  </section>
</template>
