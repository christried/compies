<script setup lang="ts">
import { confetti } from '~/utils/confetti'
import { reducedMotion } from '~/utils/motion'

// A layer of sticker confetti over its positioned parent (#276, 04-motion § Confetti; the Neuigkeiten timings of `confetti()`). It knows nothing of
// what it celebrates, so the 0.9 award ceremony can use it too: the caller calls `burst(x, y)` with a point in px inside the parent. Under
// reduced motion a burst adds no piece, so no caller has to remember. `ReleaseCard` keeps its own layer.
const layer = useTemplateRef('layer')

/** Bursts `count` pieces (18 by default, 04-motion) from (x, y), in px inside the positioned parent. */
function burst(x: number, y: number, count = 18) {
  if (!layer.value || reducedMotion()) return
  confetti(layer.value, x, y, count)
}

defineExpose({ burst })
</script>

<template>
  <div
    ref="layer"
    aria-hidden="true"
    class="pointer-events-none absolute inset-0 layer-confetti"
  />
</template>
