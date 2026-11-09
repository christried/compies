<script setup lang="ts">
import { teamVar } from '~/utils/team-style'
import type { CeremonyModel } from '~/utils/ceremony'

// One Standing below the Winners in the Award ceremony (#364): rank, the Team swatch, the Party's name and its points. The single stage's list, a
// Tie's `side` and `below` lists and its line of chips drew it three times in AwardCeremony.vue. The `<ol>` around it, with its `aria-label` and
// its `data-rows`, stays there; this is the `<li>` the Pokal-Lauf finds by `data-part="row"`.
defineProps<{
  /** One Standing below the Winners: its team, name, rank (equal points share it: 2, 2, 4) and points. */
  row: CeremonyModel['rows'][number]
  /** `side`: a list beside the cards (also a sole Winner's list), `below`: under them, `chips`: one line of pills. */
  variant: 'side' | 'below' | 'chips'
}>()

const { t } = useI18n()
</script>

<template>
  <li
    v-if="variant === 'chips'"
    data-part="row"
    class="box-border flex h-10 max-w-full items-center gap-2 rounded-pill border-[2.5px] border-line bg-surface pr-3.5 pl-[5px] shadow-sm"
  >
    <span class="grid size-7 flex-none place-items-center rounded-pill bg-paper-2 font-num text-[14px] leading-none">{{ row.rank }}</span>
    <i
      aria-hidden="true"
      class="size-4 flex-none rounded-[5px] border-2 border-line"
      :style="{ backgroundColor: teamVar(row.team), backgroundImage: teamVar(row.team, 'pattern') }"
    />
    <span class="min-w-0 truncate text-[14px] font-extrabold">{{ row.name }}</span>
    <span class="flex-none font-num text-[14px]">{{ t('ceremony.pts', { n: row.points }) }}</span>
  </li>
  <li
    v-else
    data-part="row"
    class="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[12px] border-(length:--cp-bw) border-line bg-surface px-3.5 shadow-sm"
    :class="variant === 'side' ? 'min-h-[52px]' : 'min-h-[48px]'"
  >
    <span class="font-num text-[22px]">{{ row.rank }}</span>
    <span class="flex min-w-0 items-center gap-2 font-extrabold">
      <i
        aria-hidden="true"
        class="size-[18px] flex-none rounded-[5px] border-2 border-line"
        :style="{ backgroundColor: teamVar(row.team), backgroundImage: teamVar(row.team, 'pattern') }"
      />
      <span class="truncate">{{ row.name }}</span>
    </span>
    <span class="font-num text-[18px]">{{ t('ceremony.pts', { n: row.points }) }}</span>
  </li>
</template>
