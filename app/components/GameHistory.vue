<script setup lang="ts">
import { ChevronDown, Pencil } from '@lucide/vue'
import { teamNameAt } from '~/utils/board'
import { joinNames } from '~/utils/list'
import type { HistoryCorrections } from '~/utils/history-corrections'
import type { BoardTeam } from '~~/shared/event'
import { winnersOf } from '~~/shared/results'
import type { ResultView, RoundView } from '~~/shared/stage'

// The history (#274, 02-components § GameHistory, the artboard's „Spielverlauf“): a numbered row for every Round with a Result, in the order given
// (by number), and the open Rounds after them as dashed rows without a number. A numbered row is a native `<details>`: its summary shows the
// game, the winners (the Parties on Place 1, so a Shared place names both) and the Scores; opened, it lists every Party's Place, points and
// Score. „korrigiert“ comes from `corrected`. With `corrections` (#275, the Host's, while the Event has not finished) every numbered row gets a
// pencil at its end that opens the result sheet on that Result. The pencil sits in the `<li>`, outside `<details>`: interactive content inside a
// `<summary>` is announced badly and its click fights the toggle. Without `corrections` nothing of it is in the DOM.
const props = withDefaults(defineProps<{
  results: ResultView[]
  /** The open Rounds (the page's `rounds`), shown after the numbered ones. */
  open: RoundView[]
  teams: BoardTeam[]
  /** What the Host's „Korrigieren“ needs (#275); null or missing: no button and no sheet (a Member, a finished Event). */
  corrections?: HistoryCorrections | null
}>(), { corrections: null })

const { t } = useI18n()
const headingId = useId()

const nameOf = (team: number) => teamNameAt(props.teams, team, t)

/** The Result whose sheet is open (#275): the button sets it, closing clears it. */
const correctionFor = ref<string | null>(null)
const chosen = computed(() => props.corrections ? props.results.find(result => result.roundId === correctionFor.value) ?? null : null)
// The Event can finish while the sheet is open: the sheet goes, and `correctionFor` with it, so a later `corrections` cannot pop it open again.
watch(() => props.corrections, (corrections) => {
  if (!corrections) correctionFor.value = null
})

/** How many winners' marks the summary stacks, and from how many winners the names line gives the first one and „+N“: the row is narrow (#275). */
const MARKS_MAX = 3
const NAMES_MAX = 2

/** The winners' line: both names for one or two winners, the first and „+N“ for more, so the names keep their share of the row. */
function winnerText(winners: number[]): string {
  if (winners.length <= NAMES_MAX) return joinNames(winners.map(nameOf))
  return t('history.moreWinners', { name: nameOf(winners[0]!), n: winners.length - 1 })
}

/** The Scores in Place order („16 : 12“), „–“ for a Party without one; null when no Party has a Score. */
function scoresOf(result: ResultView): string | null {
  if (result.places.every(line => line.score === null)) return null
  return result.places.map(line => line.score ?? '–').join(' : ')
}

// Each numbered row with what the template shows of it, computed once per change instead of per use (#288).
const rows = computed(() => props.results.map((result) => {
  const winners = winnersOf(result.places)
  return { result, winners, names: joinNames(winners.map(nameOf)), text: winnerText(winners), scores: scoresOf(result) }
}))
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex min-w-0 flex-col gap-2"
  >
    <h2
      :id="headingId"
      class="m-0 text-[16px] font-bold"
    >
      {{ t('history.title') }}
    </h2>

    <p
      v-if="results.length === 0 && open.length === 0"
      class="m-0 text-ink-2"
    >
      {{ t('history.empty') }}
    </p>

    <ol
      v-else
      :aria-labelledby="headingId"
      class="m-0 flex list-none flex-col gap-2 p-0"
    >
      <li
        v-for="{ result, winners, names, text, scores } in rows"
        :key="result.roundId"
        class="@container relative min-w-0"
      >
        <details class="group rounded-[12px] border-2 border-line bg-surface">
          <summary
            class="flex min-h-12 cursor-pointer list-none items-center gap-2.5 py-1.5 pl-3 marker:content-none [&::-webkit-details-marker]:hidden @max-[440px]:flex-wrap @max-[440px]:gap-y-0.5"
            :class="corrections ? 'pr-14' : 'pr-3'"
          >
            <span
              data-number
              class="grid size-[26px] flex-none place-items-center rounded-full border-2 border-line text-[12px] font-extrabold"
            >{{ result.number }}</span>
            <span class="flex min-w-24 flex-1 flex-col leading-tight @max-[440px]:relative">
              <b
                data-game
                class="truncate text-[13px]"
                :class="result.corrected && '@max-[440px]:pr-16'"
                :title="result.game.name"
              >{{ result.game.name }}</b>
              <span
                data-winners
                class="flex items-start gap-1.5 text-[12px] font-bold"
              >
                <span class="sr-only">{{ t('history.wonBy') }}</span>
                <span class="flex flex-none -space-x-1.5 pt-px">
                  <TeamMark
                    v-for="team in winners.slice(0, MARKS_MAX)"
                    :key="team"
                    :team="team"
                    :size="16"
                  />
                </span>
                <span
                  class="line-clamp-2 min-w-0"
                  :title="names"
                  :aria-hidden="winners.length > NAMES_MAX ? 'true' : undefined"
                >{{ text }}</span>
                <span
                  v-if="winners.length > NAMES_MAX"
                  class="sr-only"
                >{{ names }}</span>
                <span
                  v-if="result.corrected"
                  class="flex-none rounded-[6px] border-[1.5px] border-line px-1.5 text-[10px] font-extrabold @max-[440px]:absolute @max-[440px]:top-0 @max-[440px]:right-0"
                >{{ t('history.corrected') }}</span>
              </span>
            </span>
            <span
              v-if="scores"
              data-scores
              class="shrink-[4] truncate font-num text-[13px] text-ink-2 @max-[440px]:order-1 @max-[440px]:basis-full @max-[440px]:max-w-full @max-[440px]:pl-9"
              :class="corrections ? 'max-w-[30%]' : 'max-w-[38%]'"
              :title="scores!"
            >{{ scores }}</span>
            <AppIcon
              :icon="ChevronDown"
              :size="16"
              class="group-open:rotate-180"
            />
          </summary>
          <ol class="m-0 flex list-none flex-col gap-1.5 border-t-2 border-line-soft px-3 py-2.5">
            <li
              v-for="line in result.places"
              :key="line.team"
              class="flex items-center gap-2 text-[13px]"
            >
              <span
                data-place
                class="w-6 flex-none font-display text-[15px]"
              >{{ line.place }}.</span>
              <TeamMark
                :team="line.team"
                :size="20"
              />
              <b
                data-name
                class="min-w-0 flex-1 truncate"
                :title="nameOf(line.team)"
              >{{ nameOf(line.team) }}</b>
              <span
                data-earns
                class="flex-none font-num text-ink-2"
              >{{ t('result.earns', { n: line.points }, line.points) }}</span>
              <span
                v-if="line.score !== null"
                data-score
                class="max-w-[30%] flex-none truncate font-num"
                :title="line.score"
              >{{ line.score }}</span>
            </li>
          </ol>
        </details>
        <!-- Over the end of the summary row (its right padding makes room), 6px = the border + (48px row - 40px button) / 2. -->
        <IconButton
          v-if="corrections"
          :icon="Pencil"
          :label="t('history.correct', { n: result.number })"
          :size="40"
          class="absolute top-1.5 right-1.5"
          @click="correctionFor = result.roundId"
        />
      </li>

      <li
        v-for="round in open"
        :key="round.id"
        class="flex min-h-11 min-w-0 items-center gap-2.5 rounded-[12px] border-2 border-dashed border-ink-3 px-3 py-1.5 text-ink-2"
      >
        <span
          class="size-[26px] flex-none rounded-full border-2 border-dashed border-ink-3"
          aria-hidden="true"
        />
        <b
          data-game
          class="min-w-0 flex-1 truncate text-[13px]"
          :title="round.game.name"
        >{{ round.game.name }}</b>
        <span class="flex-none rounded-pill border-2 border-line bg-primary px-2.5 py-0.5 text-[12px] font-extrabold whitespace-nowrap text-on-primary">
          {{ t('rounds.playing') }}
        </span>
      </li>
    </ol>

    <ResultEntry
      v-if="corrections"
      :open="chosen !== null"
      :game="chosen?.game ?? null"
      :correction="chosen"
      :kicker="chosen ? { number: chosen.number, total: corrections.total } : null"
      :teams="teams"
      :points-table="corrections.pointsTable"
      :save="places => corrections!.save(chosen!.roundId, places)"
      @close="correctionFor = null"
    />
  </section>
</template>
