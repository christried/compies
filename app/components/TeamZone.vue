<script setup lang="ts">
import { Lock, Plus } from '@lucide/vue'

// One team on the Game board (#160, 02-components § TeamZone): the header with its mark and name (a `header` slot, which
// the Team words of #161 fill), the people in the default slot, and a free slot up to the Team size. While Players cannot
// move into it the free slots read „Zu“ with the reason; a team a person is held over reads as a drop target. The
// zone is the drop target of the board's drag: `data-drop-zone` is what the GameBoard finds it by.
const props = defineProps<{
  /** The team's position, which is its Team colour index. */
  team: number
  name: string
  /** The Team size. */
  size: number
  /** How many Players sit in it. */
  taken: number
  /** The viewer cannot move into it, and why. */
  lockReason: string | null
  dropTarget: boolean
  /** The viewer's own team. */
  mine: boolean
}>()

const { t } = useI18n()
const free = computed(() => Math.max(props.size - props.taken, 0))
</script>

<template>
  <div
    class="flex min-w-0 flex-col rounded-[18px] border-line bg-surface text-ink transition-[box-shadow,border-color] dur-fast"
    :class="[
      dropTarget ? 'border-[3px] border-focus shadow-card' : mine ? 'border-[3px] shadow-card' : 'border-(length:--cp-bw)',
    ]"
    role="group"
    :aria-label="t('board.zoneAria', { name, n: free, size })"
    :data-drop-zone="`team-${team}`"
  >
    <!-- The pattern is the colour's second signal; no text sits on it. -->
    <div
      class="h-2.5 rounded-t-[14px] border-b-2 border-line"
      aria-hidden="true"
      :style="{ backgroundColor: `var(--cp-team-${team})`, backgroundImage: `var(--cp-team-${team}-pattern)`, backgroundSize: '16px 16px' }"
    />
    <header
      class="flex items-center gap-2 border-b-(length:--cp-bw) border-line px-3 py-2"
      :style="{ backgroundColor: `var(--cp-team-${team})`, color: `var(--cp-team-${team}-ink)` }"
    >
      <slot name="header">
        <TeamMark
          :team="team"
          :size="26"
        />
        <h3 class="m-0 line-clamp-2 min-w-0 flex-1 font-display text-[19px] leading-[1.05] font-normal">
          {{ name }}
        </h3>
      </slot>
      <span class="num-ui flex-none rounded-pill border-2 border-line bg-surface px-2 text-[12px] font-bold text-ink">{{ taken }}/{{ size }}</span>
    </header>
    <!-- One column in a narrow zone, two from about 250 px (02-components § TeamZone). -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-1 p-2">
      <slot />
      <template v-if="lockReason">
        <div
          v-for="slot in free"
          :key="`closed-${slot}`"
          role="img"
          :aria-label="t('board.closedAria', { reason: lockReason })"
          :title="lockReason"
          class="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border-[2.5px] border-dashed border-ink-3 text-[13px] font-semibold text-ink-3"
        >
          <AppIcon
            :icon="Lock"
            :size="16"
          />
          {{ t('board.closed') }}
        </div>
      </template>
      <template v-else>
        <div
          v-for="slot in free"
          :key="`free-${slot}`"
          class="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-md border-dashed text-[13px]"
          :class="dropTarget ? 'border-[3px] border-focus bg-surface-2 font-extrabold text-focus' : 'border-[2.5px] border-ink-3 font-semibold text-ink-3'"
        >
          <AppIcon
            :icon="Plus"
            :size="16"
          />
          {{ dropTarget ? t('board.dropHere') : t('board.free') }}
        </div>
      </template>
    </div>
  </div>
</template>
