<script setup lang="ts">
import { teamSurfaceStyle } from '~/utils/team-style'
import type { CeremonyWinner } from '~/utils/ceremony'
import type { CeremonySizes } from '~/utils/ceremony-sizes'

// One Winner's card in the Award ceremony (#364): the back (the Party in its Team colour, its points), the front „???“ the run turns over, and
// the stamp. The sole Winner's card, a chain's and a grid's drew it three times in AwardCeremony.vue; `stage` (`ceremonySizes(…).stage`) says
// which one, and its `kind` narrows the sizes. The single card's own numbers (240 × 160, 40, 16, 32, 48, 20) are the artboard's and stay Tailwind
// classes; the chain's and the grid's come from `stage`. The people under a single or chain card are a list of their own beside it (AwardCeremony.vue);
// a grid card's stack stands on its back, so the stage passes it as the default slot (single and chain ignore it). The Pokal-Lauf finds the card,
// `back`, `front` and `stamp` by `data-part`: the grid's stamp is inside its back, next to the points; the single and chain card's follows the front.
defineProps<{
  winner: CeremonyWinner
  /** The sizes of the stage the card stands on; the variant drawn is the one its `kind` names. */
  stage: CeremonySizes['stage']
}>()

const { t } = useI18n()
</script>

<template>
  <div
    v-if="stage.kind === 'chain'"
    data-testid="winner-card"
    data-part="card"
    class="relative box-border flex-none overflow-hidden rounded-[16px] border-(length:--cp-bw) border-line bg-surface shadow-card"
    :style="{ width: `${stage.cardWidth}px`, height: `${stage.cardHeight}px` }"
  >
    <div
      data-part="back"
      class="absolute inset-0 flex flex-col"
    >
      <div
        class="flex min-w-0 flex-none items-center border-b-(length:--cp-bw) border-line px-3 font-extrabold"
        :style="{ height: `${stage.stripHeight}px`, fontSize: `${stage.nameFontSize}px`, ...teamSurfaceStyle(winner.team) }"
      >
        <span class="truncate">{{ winner.name }}</span>
      </div>
      <div
        class="flex flex-1 items-start font-num leading-none"
        :style="{ padding: stage.pointsPadding, fontSize: `${stage.pointsFontSize}px` }"
      >
        {{ t('ceremony.pts', { n: winner.points }) }}
      </div>
    </div>
    <div
      data-part="front"
      aria-hidden="true"
      class="absolute inset-0 flex flex-col items-center justify-center bg-paper-2 opacity-0"
    >
      <span class="font-num text-[40px] leading-none">???</span>
    </div>
    <span
      data-part="stamp"
      class="absolute -rotate-8 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num text-hot"
      :style="{ right: `${stage.stampOffset}px`, bottom: `${stage.stampOffset}px`, fontSize: `${stage.stampFontSize}px` }"
    >{{ t('ceremony.stamp') }}</span>
  </div>

  <li
    v-else-if="stage.kind === 'grid'"
    data-testid="winner-card"
    data-part="card"
    class="relative box-border flex-none overflow-hidden rounded-[14px] border-(length:--cp-bw) border-line bg-surface shadow-card"
    :style="{ width: `${stage.cardWidth}px`, height: `${stage.cardHeight}px` }"
  >
    <div
      data-part="back"
      class="absolute inset-0 flex flex-col"
    >
      <div
        class="flex min-w-0 flex-none items-center border-b-(length:--cp-bw) border-line px-2.5 font-extrabold"
        :style="{ height: `${stage.stripHeight}px`, fontSize: `${stage.nameFontSize}px`, ...teamSurfaceStyle(winner.team) }"
      >
        <span class="truncate">{{ winner.name }}</span>
      </div>
      <div
        class="flex flex-1 flex-col justify-center px-2.5"
        :style="{ gap: `${stage.backGap}px` }"
      >
        <div class="flex items-center justify-between gap-2">
          <span
            class="font-num leading-none"
            :style="{ fontSize: `${stage.pointsFontSize}px` }"
          >{{ t('ceremony.pts', { n: winner.points }) }}</span>
          <span
            data-part="stamp"
            class="-rotate-8 rounded-[5px] border-[2.5px] border-hot bg-surface px-[7px] py-px font-num leading-[1.2] text-hot"
            :style="{ fontSize: `${stage.stampFontSize}px` }"
          >{{ t('ceremony.stamp') }}</span>
        </div>
        <slot />
      </div>
    </div>
    <div
      data-part="front"
      aria-hidden="true"
      class="absolute inset-0 flex flex-col items-center justify-center bg-paper-2 opacity-0"
    >
      <span class="font-num text-[32px] leading-none">???</span>
    </div>
  </li>

  <div
    v-else
    data-testid="winner-card"
    data-part="card"
    class="relative h-[160px] w-[240px] max-w-full overflow-hidden rounded-[16px] border-(length:--cp-bw) border-line bg-surface shadow-card"
  >
    <div data-part="back">
      <div
        class="flex h-10 flex-none items-center overflow-hidden border-b-(length:--cp-bw) border-line px-3 text-[16px] font-extrabold whitespace-nowrap"
        :style="teamSurfaceStyle(winner.team)"
      >
        <span class="truncate">{{ winner.name }}</span>
      </div>
      <div class="flex flex-col gap-1 px-3.5 py-3">
        <span class="text-[13px] font-bold text-ink-2">{{ t('ceremony.place1') }}</span>
        <span class="font-num text-[32px] leading-none">{{ t('ceremony.pts', { n: winner.points }) }}</span>
      </div>
    </div>
    <!-- The front is decoration (opacity-0 in the static end frame, the run shows it at its first frame): „Platz 1“ stays real text on the back. -->
    <div
      data-part="front"
      aria-hidden="true"
      class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-paper-2 opacity-0"
    >
      <span class="font-num text-[48px] leading-none">???</span>
      <span class="text-[13px] font-bold text-ink-2">{{ t('ceremony.place1') }}</span>
    </div>
    <!-- The stamp is a physical sticker: fixed in both modes. -->
    <span
      data-part="stamp"
      class="absolute right-3 bottom-3 -rotate-8 rounded-[6px] border-[3px] border-hot bg-surface px-2.5 py-0.5 font-num text-[20px] text-hot"
    >{{ t('ceremony.stamp') }}</span>
  </div>
</template>
