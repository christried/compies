<script setup lang="ts">
// A person (DS People, Avatar.dc.html). MVP: the provider image, or the initial when there is
// none; team, host badge and presence arrive with the lobby. Decorative: the name next to it
// carries the meaning.
const props = withDefaults(defineProps<{
  name: string
  image?: string | null
  size?: 32 | 40 | 64
}>(), { image: null, size: 40 })

const failed = ref(false)
watch(() => props.image, () => failed.value = false)
</script>

<template>
  <span
    class="relative grid flex-none place-items-center overflow-hidden rounded-pill border-line bg-paper-2 font-extrabold text-ink"
    :class="size >= 40 ? 'border-[2.5px]' : 'border-2'"
    :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.44)}px` }"
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
