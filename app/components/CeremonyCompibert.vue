<script setup lang="ts">
import type { RigState } from '~/utils/compibert-rig'

// Compibert in the Award ceremony (#309, #311, #312): the animated rig on the ground of the stage. The layer sizes it (150 px on a desktop,
// 120 on a phone) and decides his pose (the run's timeline, then the dance; under reduced motion the cheer pose, held). The rig hides itself
// from assistive technology. It is mounted with the layer's dialog only, so GSAP loads when the ceremony opens and never on a finished
// Event page that stays closed (ADR 0015).
defineProps<{ size: number, state: RigState }>()
</script>

<template>
  <CompibertRig
    variant="full"
    :state="state"
    :size="size"
  />
</template>
