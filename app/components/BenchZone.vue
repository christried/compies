<script setup lang="ts">
import { Armchair, Eye } from '@lucide/vue'

// The Bench and the Stands of the Game board (#160, 02-components § BenchZone / StandsZone): unlimited zones, the
// substitutes and the spectators. Both always take a drop, so they have no locked state. The people come in the default slot.
const props = defineProps<{
  zone: 'bench' | 'stands'
  count: number
  dropTarget: boolean
}>()

const { t } = useI18n()
const label = computed(() => t(props.zone === 'bench' ? 'board.bench' : 'board.stands'))
</script>

<template>
  <section
    class="flex min-w-0 flex-col gap-2 rounded-[18px] border-line bg-surface p-3 text-ink transition-[box-shadow,border-color] dur-fast"
    :class="dropTarget ? 'border-[3px] border-focus shadow-card' : 'border-(length:--cp-bw)'"
    role="group"
    :aria-label="label"
    :data-drop-zone="zone"
  >
    <header class="flex items-center gap-2">
      <AppIcon
        :icon="zone === 'bench' ? Armchair : Eye"
        :size="18"
      />
      <h3 class="m-0 font-display text-[19px] leading-none font-normal">
        {{ label }}
      </h3>
      <span class="min-w-0 truncate text-[13px] text-ink-2">{{ t(zone === 'bench' ? 'board.benchSub' : 'board.standsSub') }}</span>
      <span class="num-ui ml-auto flex-none rounded-pill border-2 border-line px-2 text-[12px] font-extrabold">{{ count }}</span>
    </header>
    <div
      v-if="count > 0"
      class="flex flex-wrap gap-1.5 md:gap-3"
    >
      <slot />
    </div>
    <p
      v-else
      class="m-0 rounded-md border-[2.5px] border-dashed border-ink-3 px-3 py-4 text-center text-[14px] text-ink-3"
    >
      {{ t(zone === 'bench' ? 'board.benchEmpty' : 'board.standsEmpty') }}
    </p>
  </section>
</template>
