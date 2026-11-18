<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'

// The red line of a form message (#797, #825): the one place that draws it, for TextField, DateTimeField and FieldGroup.
// The caller decides when it shows (`useTouched`); `role="alert"` announces a message that appears after a touch or a try.
defineProps<{
  /** The line's id, which the field or the group points at with aria-describedby. */
  id: string
}>()
</script>

<template>
  <span
    :id="id"
    role="alert"
    class="flex items-center gap-1.5 text-small font-bold text-error-fg"
  >
    <AppIcon
      :icon="CircleAlert"
      :size="14"
    />
    <slot />
  </span>
</template>
