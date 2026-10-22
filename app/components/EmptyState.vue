<script setup lang="ts">
// Nothing to show yet (02-components § EmptyState). Compibert sits left on desktop and stacks above
// the copy, centred, on phones. The heading is h2: the page title above it is the h1.
defineProps<{
  title: string
  text?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center gap-4 rounded-[18px] border-2 border-dashed border-line bg-paper-2 px-6 py-8 text-center md:flex-row md:text-left">
    <div class="w-[120px] flex-none">
      <Compibert variant="bust" />
    </div>
    <div class="flex min-w-0 flex-col items-center gap-1.5 md:items-start">
      <h2 class="m-0 font-display text-[28px] leading-tight font-normal">
        {{ title }}
      </h2>
      <p
        v-if="text"
        class="m-0 max-w-[460px] text-[15px] text-pretty text-ink-2"
      >
        {{ text }}
      </p>
      <div
        v-if="$slots.action"
        class="mt-2"
      >
        <slot name="action" />
      </div>
    </div>
  </div>
</template>
