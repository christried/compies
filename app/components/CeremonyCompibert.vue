<script setup lang="ts">
// Compibert in the Award ceremony (#309): the still full pose, as the end frame shows it. It is the one place the animated rig replaces
// (#311); the layer sizes it (150 px on a desktop, 120 on a phone) and `Compibert` hides it from assistive technology.
defineProps<{ size: number }>()
</script>

<template>
  <Compibert
    variant="full"
    :size="size"
  />
</template>
