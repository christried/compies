<script setup lang="ts">
import { teamName } from '~/utils/board'
import type { BoardTeam } from '~~/shared/event'
import type { EndView, StandingView } from '~~/shared/stage'

// The Standings (#274, GLOSSARY: Standings, Shared place; 02-components § Leaderboard, 03-screens 17, the calm state): every Party's
// rank and points, in the order the Event read gives (points descending, then team; `standingsOf` is the only place that ranks, so this
// sorts nothing). A shared rank prints the same text twice („1.“, „1.“, „3.“). A real table, so a screen reader walks it by rank, Party and
// points; its row layout is the artboard's card-like rows, drawn on the native cells (a border on each cell, rounded at the ends,
// `border-separate` for the gaps), because `display: flex` on a `tr` would drop the table semantics in some browsers.
// Rows are keyed by team and carry `data-team`, so the motion of 0.8-04 (#276) can wrap the `tbody` and find them. No motion here.
// `framed` is the stage block's card; the „Tabelle“ tab (the side panel, the phone's view) is unframed.
const props = withDefaults(defineProps<{
  standings: StandingView[]
  end: EndView
  teams: BoardTeam[]
  framed?: boolean
}>(), { framed: false })

const { t } = useI18n()
const headingId = useId()

const nameOf = (team: number) => teamName(props.teams.find(item => item.position === team) ?? team, t)
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex min-w-0 flex-col gap-2"
    :class="framed && 'rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 shadow-card'"
  >
    <div class="mb-1 flex flex-col leading-[1.15]">
      <p class="m-0 text-[13px] font-bold text-ink-2">
        {{ t('table.after', { n: end.played, total: end.gameCount }) }}
      </p>
      <h2
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
      :aria-labelledby="headingId"
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
      <tbody>
        <tr
          v-for="standing in standings"
          :key="standing.team"
          :data-team="standing.team"
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
          <td class="rounded-r-[12px] border-y-2 border-r-2 border-line bg-surface py-1.5 pr-3 pl-1 text-right align-middle">
            <CpNum
              class="text-[26px] leading-none"
              :value="standing.points"
              :say="t('table.points', { n: standing.points }, standing.points)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
