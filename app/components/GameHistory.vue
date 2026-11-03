<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import { teamName } from '~/utils/board'
import { joinNames } from '~/utils/list'
import type { BoardTeam } from '~~/shared/event'
import type { ResultView, RoundView } from '~~/shared/stage'

// The history (#274, 02-components § GameHistory, the artboard's „Spielverlauf“): a numbered row for every Round with a Result, in the order given
// (by number), and the open Rounds after them as dashed rows without a number. A numbered row is a native `<details>`: its summary shows the
// game, the winners (the Parties on Place 1, so a Shared place names both) and the Scores; opened, it lists every Party's Place, points and
// Score. The end of a summary is free for #275's „Korrigieren“; no button, prop or slot for it yet. „korrigiert“ comes from `corrected`.
const props = defineProps<{
  results: ResultView[]
  /** The open Rounds (the page's `rounds`), shown after the numbered ones. */
  open: RoundView[]
  teams: BoardTeam[]
}>()

const { t } = useI18n()
const headingId = useId()

const nameOf = (team: number) => teamName(props.teams.find(item => item.position === team) ?? team, t)
const winnersOf = (result: ResultView) => result.places.filter(line => line.place === 1).map(line => line.team)

/** The Scores in Place order („16 : 12“), „–“ for a Party without one; null when no Party has a Score. */
function scoresOf(result: ResultView): string | null {
  if (result.places.every(line => line.score === null)) return null
  return result.places.map(line => line.score ?? '–').join(' : ')
}
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
        v-for="result in results"
        :key="result.roundId"
        class="min-w-0"
      >
        <details class="group rounded-[12px] border-2 border-line bg-surface">
          <summary class="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-3 py-1.5 marker:content-none [&::-webkit-details-marker]:hidden">
            <span
              data-number
              class="grid size-[26px] flex-none place-items-center rounded-full border-2 border-line text-[12px] font-extrabold"
            >{{ result.number }}</span>
            <span class="flex min-w-0 flex-1 flex-col leading-tight">
              <b
                data-game
                class="truncate text-[13px]"
                :title="result.game.name"
              >{{ result.game.name }}</b>
              <span
                data-winners
                class="flex items-start gap-1.5 text-[12px] font-bold"
              >
                <span class="sr-only">{{ t('history.wonBy') }}</span>
                <span class="flex flex-none -space-x-1.5 pt-px">
                  <TeamMark
                    v-for="team in winnersOf(result)"
                    :key="team"
                    :team="team"
                    :size="16"
                  />
                </span>
                <span
                  class="line-clamp-2 min-w-0"
                  :title="joinNames(winnersOf(result).map(nameOf))"
                >{{ joinNames(winnersOf(result).map(nameOf)) }}</span>
                <span
                  v-if="result.corrected"
                  class="flex-none rounded-[6px] border-[1.5px] border-line px-1.5 text-[10px] font-extrabold"
                >{{ t('history.corrected') }}</span>
              </span>
            </span>
            <span
              v-if="scoresOf(result)"
              data-scores
              class="max-w-[38%] truncate font-num text-[13px] text-ink-2"
              :title="scoresOf(result)!"
            >{{ scoresOf(result) }}</span>
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
  </section>
</template>
