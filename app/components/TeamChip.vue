<script setup lang="ts">
import { Lock } from '@lucide/vue'

// A team's label: its mark and its name (DS People, 02-components § TeamChip). A frozen name (#164, since the first
// Session started) carries a small lock that says so. The name sits on a solid chip of the Team
// colour, never on the pattern. On a phone the name wraps to at most two lines (11-event-seite § GameBoard), from `md`
// it truncates on one line; the full name is in `title` (hover) and stays whole in the DOM,
// so it is the accessible name too. `compact` is the mark alone, for tight rows, and then the chip carries the name as
// its label.
const props = withDefaults(defineProps<{
  /** The Team colour index, 1 to 8. */
  team: number
  /** The Team name, or the colour's name when the team has none (teamName). */
  name: string
  compact?: boolean
  /** The name is frozen since the first Session started (#164). */
  frozen?: boolean
}>(), { compact: false, frozen: false })

const { t } = useI18n()
</script>

<template>
  <span
    class="flex min-w-0 items-center gap-2"
    :title="name"
    :role="compact ? 'img' : undefined"
    :aria-label="compact ? name : undefined"
  >
    <TeamMark
      :team="team"
      :size="compact ? 20 : 26"
      class="max-md:!size-5"
    />
    <span
      v-if="!compact"
      class="min-w-0 rounded-[6px] px-1.5 py-px font-display text-[13px] leading-[1.3] font-normal break-words line-clamp-2 md:line-clamp-none md:truncate md:px-2 md:text-[19px]"
      :style="{ backgroundColor: `var(--cp-team-${props.team})`, color: `var(--cp-team-${props.team}-ink)` }"
    >{{ name }}</span>
    <span
      v-if="frozen && !compact"
      role="img"
      :aria-label="t('team.word.frozen')"
      :title="t('team.word.frozen')"
      class="flex-none"
    >
      <AppIcon
        :icon="Lock"
        :size="14"
      />
    </span>
  </span>
</template>
