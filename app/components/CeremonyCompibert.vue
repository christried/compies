<script setup lang="ts">
import type { RigState } from '~/utils/compibert-rig'

// Compibert in the Award ceremony (#309, #311): the animated rig on the ground of the end frame. The layer sizes it (150 px on a desktop,
// 120 on a phone) and the rig hides itself from assistive technology. It is mounted with the layer's dialog only, so GSAP loads when the
// ceremony opens and never on a finished Event page that stays closed (ADR 0015).
defineProps<{ size: number }>()

// The one place that decides what he does: the dance, or under reduced motion the cheer pose, held (the rig's own reduced path crossfades
// into it and stops every loop). Read when the end frame renders; the Pokal-Lauf (#312) drives this from the run's timeline instead.
const state = computed<RigState>(() => (import.meta.client && reducedMotion() ? 'cheer' : 'dance'))
</script>

<template>
  <CompibertRig
    variant="full"
    :state="state"
    :size="size"
  />
</template>
