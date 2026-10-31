<script setup lang="ts">
import { Lock, Plus } from '@lucide/vue'

// One team on the Game board (#160, 02-components § TeamZone, App Lobby screen 09): one header band in the team's
// colour and pattern with its mark, its name (a TeamChip, #161) and the count (with a lock once the name is frozen, #164); under it the `builder` slot (the Team
// word field, #161); below that the people in the default slot and a free place up to the Team size, in the same cells as the people. While Players
// cannot move into a team the free places read „Zu“ with the reason; a team a person is held over lights up its first
// free place. The zone is the drop target of the board's drag: `data-drop-zone` is what the GameBoard finds it by.
const props = withDefaults(defineProps<{
  /** The team's position, which is its Team colour index. */
  team: number
  name: string
  /** The Team size. */
  size: number
  /** How many Players sit in it. */
  taken: number
  /** The viewer cannot move into it, and why. */
  lockReason: string | null
  /** What the locked places say: „Zu“ in the poll, „Gesperrt“ once the first Session started (#164). */
  lockLabel?: 'closed' | 'locked'
  /** The team's name is frozen since the first Session started (#164). */
  frozen?: boolean
  dropTarget: boolean
  /** The viewer's own team. */
  mine: boolean
}>(), { lockLabel: 'closed', frozen: false })

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
    <!-- The pattern is the colour's second signal; the TeamChip puts the name on a solid chip of the colour, never on the pattern. -->
    <header
      class="flex items-center gap-2 rounded-t-[11px] border-b-2 border-line px-2 py-1.5 md:px-3 md:py-2"
      :style="{ backgroundColor: `var(--cp-team-${team})`, backgroundImage: `var(--cp-team-${team}-pattern)`, backgroundSize: '16px 16px' }"
    >
      <slot name="header">
        <!-- A level 3 heading, as the Bench and the Stands have, so the teams stay in heading navigation. -->
        <!-- eslint-disable-next-line vuejs-accessibility/heading-has-content -- the TeamChip is the heading's text -->
        <h3 class="m-0 flex min-w-0 text-[length:inherit] font-normal">
          <TeamChip
            :team="team"
            :name="name"
          />
        </h3>
      </slot>
      <span class="num-ui ml-auto inline-flex flex-none items-center gap-1 rounded-pill border-2 border-line bg-surface px-[7px] text-[12px] font-extrabold text-ink">
        <span
          v-if="frozen"
          role="img"
          :aria-label="t('team.word.frozen')"
          :title="t('team.word.frozen')"
          class="flex-none"
        >
          <AppIcon
            :icon="Lock"
            :size="12"
          />
        </span>
        {{ taken }}/{{ size }}
      </span>
    </header>
    <slot name="builder" />
    <div class="flex min-h-16 flex-wrap gap-1.5 p-2.5 md:min-h-20 md:gap-3 md:p-3">
      <slot />
      <template v-if="lockReason">
        <div
          v-for="slot in free"
          :key="`closed-${slot}`"
          role="img"
          :aria-label="t(lockLabel === 'locked' ? 'board.lockedAria' : 'board.closedAria', { reason: lockReason })"
          :title="lockReason"
          class="flex w-12 flex-col items-center gap-1 pt-1 text-[12px] font-semibold text-ink-3 md:w-[60px]"
        >
          <span class="grid size-9 place-items-center rounded-pill border-[2.5px] border-dashed border-ink-3 md:size-11">
            <AppIcon
              :icon="Lock"
              :size="16"
            />
          </span>
          {{ t(lockLabel === 'locked' ? 'board.locked' : 'board.closed') }}
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
            class="grid size-9 place-items-center rounded-pill border-dashed md:size-11"
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
