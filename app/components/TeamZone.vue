<script setup lang="ts">
import { Lock, Plus } from '@lucide/vue'

// One team on the Game board (#160, 02-components § TeamZone, App Lobby screen 09): one header band in the team's
// colour and pattern with its mark, its name (a `header` slot, which the Team words of #161 fill) and the count; below it
// the people in the default slot and a free place up to the Team size, in the same cells as the people. While Players
// cannot move into a team the free places read „Zu“ with the reason; a team a person is held over lights up its first
// free place. The zone is the drop target of the board's drag: `data-drop-zone` is what the GameBoard finds it by.
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
    class="flex min-w-0 flex-col rounded-[14px] border-line bg-surface text-ink transition-[box-shadow,border-color] dur-fast"
    :class="[
      dropTarget ? 'border-[3px] border-focus shadow-card' : mine ? 'border-[3px] shadow-card' : 'border-(length:--cp-bw)',
    ]"
    role="group"
    :aria-label="t('board.zoneAria', { name, n: free, size })"
    :data-drop-zone="`team-${team}`"
  >
    <!-- The pattern is the colour's second signal; the name sits on a solid chip of the colour, never on the pattern. -->
    <header
      class="flex items-center gap-2 rounded-t-[11px] border-b-2 border-line px-2 py-1.5 md:px-3 md:py-2"
      :style="{ backgroundColor: `var(--cp-team-${team})`, backgroundImage: `var(--cp-team-${team}-pattern)`, backgroundSize: '16px 16px' }"
    >
      <slot name="header">
        <TeamMark
          :team="team"
          :size="26"
          class="max-md:!size-5"
        />
        <h3
          class="m-0 min-w-0 truncate rounded-[6px] px-2 py-px font-display text-[14px] leading-[1.3] font-normal md:text-[19px]"
          :title="name"
          :style="{ backgroundColor: `var(--cp-team-${team})`, color: `var(--cp-team-${team}-ink)` }"
        >
          {{ name }}
        </h3>
      </slot>
      <span class="num-ui ml-auto flex-none rounded-pill border-2 border-line bg-surface px-[7px] text-[12px] font-extrabold text-ink">{{ taken }}/{{ size }}</span>
    </header>
    <div class="flex min-h-16 flex-wrap gap-1.5 p-2.5 md:min-h-20 md:gap-3 md:p-3">
      <slot />
      <template v-if="lockReason">
        <div
          v-for="slot in free"
          :key="`closed-${slot}`"
          role="img"
          :aria-label="t('board.closedAria', { reason: lockReason })"
          :title="lockReason"
          class="flex w-12 flex-col items-center gap-1 pt-1 text-[12px] font-semibold text-ink-3 md:w-[60px]"
        >
          <span class="grid size-10 place-items-center rounded-pill border-[2.5px] border-dashed border-ink-3 md:size-12">
            <AppIcon
              :icon="Lock"
              :size="16"
            />
          </span>
          {{ t('board.closed') }}
        </div>
      </template>
      <template v-else>
        <div
          v-for="slot in free"
          :key="`free-${slot}`"
          class="flex w-12 flex-col items-center gap-1 pt-1 text-[12px] md:w-[60px]"
          :class="dropTarget && slot === 1 ? 'font-extrabold text-focus' : 'font-semibold text-ink-2'"
        >
          <span
            class="grid size-10 place-items-center rounded-pill border-dashed md:size-12"
            :class="dropTarget && slot === 1 ? 'border-[3px] border-focus bg-surface-2 text-focus' : 'border-[2.5px] border-ink-3 text-ink-3'"
          >
            <AppIcon
              :icon="Plus"
              :size="16"
            />
          </span>
          {{ dropTarget && slot === 1 ? t('board.dropHere') : t('board.free') }}
        </div>
      </template>
    </div>
  </div>
</template>
