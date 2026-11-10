<script setup lang="ts">
import { teamVar } from '~/utils/team-style'

// A Tag as a chip (#427, GLOSSARY: Tag): the pill with the line border, filled with a Team colour and its ink, so the Tags of
// a game are told apart at a glance. The colour comes from `tagColors` over the game's Tags in order; the place sets the size
// (the game card, the Tag field of the game form, a game's page). The Team colours' patterns stay with the Teams.
withDefaults(defineProps<{
  /** The Tag's colour, 1 to 8: its entry in `tagColors` of the game's Tag keys. */
  color: number
  as?: 'span' | 'li'
}>(), { as: 'span' })
</script>

<template>
  <component
    :is="as"
    class="rounded-pill border-2 border-line font-bold"
    :style="{ backgroundColor: teamVar(color), color: teamVar(color, 'ink') }"
  >
    <slot />
  </component>
</template>
