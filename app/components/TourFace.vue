<script setup lang="ts">
import { tourLayout } from '~/utils/tour-placement'
import type { TourFace } from '~~/shared/tour'

// Compibert at the Tour's bubble (#460, 17-rundgang.md § TourFace): the head crop on the bubble's top-left corner, in front of the border like a sticker,
// 72 px at 14 / -20 (56 px at 8 / -16 on a phone). Face only. He waves at the greeting (`wave`), looks at the thing on the pointing steps (`idle` with no
// micro actions, the pupils at the anchor) and cheers at the end (`cheer`, two hops, then he lands). The motion is the rig's (ADR 0015); under reduced motion
// the rig holds its pose and the nod does nothing. Decorative: `aria-hidden`.
const props = defineProps<{
  face: TourFace
  /** Degrees from the face's centre to the anchor (the placement's `faceDir`). */
  look: number
  narrow: boolean
}>()

const rig = useTemplateRef<{ nod: () => void }>('rig')
const STATE = { hello: 'wave', points: 'idle', cheers: 'cheer' } as const

// Size and place are the placement's layout (#785): its face zone and look direction use the same numbers.
const layout = computed(() => tourLayout(props.narrow))
const size = computed(() => layout.value.S)
/** The end hops twice (1.15 s, the reference's `arrive()`) and lands. */
const HOPS_FOR = 1.15

defineExpose({ nod: () => rig.value?.nod() })
</script>

<template>
  <span
    aria-hidden="true"
    data-tour-face
    class="pointer-events-none absolute"
    :style="{ width: `${size}px`, left: `${layout.faceL}px`, top: `${layout.faceT}px` }"
  >
    <!-- The head crop clips at its edge by default; the hop and the rim must not be cut. -->
    <CompibertRig
      ref="rig"
      variant="head"
      rim
      :micro="false"
      :size="size"
      :state="STATE[face]"
      :look="face === 'points' ? look : null"
      :hops-for="face === 'cheers' ? HOPS_FOR : undefined"
      class="overflow-visible!"
    />
  </span>
</template>
