<script setup lang="ts">
import { Armchair } from '@lucide/vue'

// The Stands of the Game board (#160, #437, 02-components § BenchZone / StandsZone): the one unlimited zone outside the teams, for every
// Member who sits in no team, whether they play later or only watch. It always takes a drop, so it has no locked state. The people come in the default slot.
defineProps<{
  count: number
  dropTarget: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-2 rounded-[18px] border-line bg-surface p-3 text-ink transition-[box-shadow,border-color] dur-fast"
    :class="dropTarget ? 'border-[3px] border-focus shadow-card' : 'border-(length:--cp-bw)'"
    role="group"
    :aria-label="t('board.stands')"
    data-drop-zone="stands"
  >
    <header class="flex items-center gap-2">
      <AppIcon
        :icon="Armchair"
        :size="18"
      />
      <h3 class="m-0 font-display text-[19px] leading-none font-normal">
        {{ t('board.stands') }}
      </h3>
      <span class="min-w-0 truncate text-[13px] text-ink-2">{{ t('board.standsSub') }}</span>
      <span class="num-ui ml-auto flex-none rounded-pill border-2 border-line px-2 text-[12px] font-extrabold">{{ count }}</span>
    </header>
    <div
      v-if="count > 0"
      class="flex flex-wrap gap-1.5 md:gap-3"
    >
      <slot />
    </div>
    <!-- The empty message is text for reading: in Dunkel it takes ink-2, since ink-3 is for disabled text and reads 3.24:1 on the surface (#409). -->
    <p
      v-else
      class="m-0 rounded-md border-[2.5px] border-dashed border-ink-3 px-3 py-4 text-center text-[14px] text-ink-3 dark:text-ink-2"
    >
      {{ t('board.standsEmpty') }}
    </p>
  </section>
</template>
