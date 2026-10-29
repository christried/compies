<script setup lang="ts">
// A person (DS People, Avatar.dc.html): the provider image, or the initial when there is none. `team` rings the avatar
// in its Team colour and `lifted` is the avatar in the hand while it is dragged on the Game board (#160); presence
// arrives with #162. Decorative: the name next to it carries the meaning, and the team is named in text beside it too.
const props = withDefaults(defineProps<{
  name: string
  image?: string | null
  /** 24 for the poll matrix rows (DS People). */
  size?: 24 | 32 | 40 | 64
  /** The Team colour index, 1 to 8: a ring in that colour. */
  team?: number | null
  /** Scaled up with `shadow-lift`, while it is dragged. */
  lifted?: boolean
}>(), { image: null, size: 40, team: null, lifted: false })

const failed = ref(false)
watch(() => props.image, () => failed.value = false)
</script>

<template>
  <span
    class="relative grid flex-none place-items-center overflow-hidden rounded-pill border-line bg-paper-2 font-extrabold text-ink"
    :class="[size >= 40 ? 'border-[2.5px]' : 'border-2', lifted ? 'scale-[1.08] shadow-lift' : '']"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.44)}px`, ...(team && !lifted ? { boxShadow: `0 0 0 3px var(--cp-team-${team})` } : {}) }"
    aria-hidden="true"
  >
    <img
      v-if="image && !failed"
      :src="image"
      alt=""
      class="size-full object-cover"
      referrerpolicy="no-referrer"
      @error="failed = true"
    >
    <template v-else>{{ [...name][0]?.toUpperCase() }}</template>
  </span>
</template>
