<script setup lang="ts">
// Nothing to show yet (02-components § EmptyState). Compibert sits left on desktop and stacks above
// the copy, centred, on phones. The heading is h2: the page title above it is the h1.
defineProps<{
  title: string
  text?: string
  /** The head's baked mood (#819): a search without a hit is confused; the other empty states keep the plain head. */
  mood?: 'confused' | 'sad'
}>()
</script>

<template>
  <div class="flex flex-col items-center gap-4 rounded-[18px] border-2 border-dashed border-line bg-paper-2 px-6 py-8 text-center md:flex-row md:text-left">
    <div class="w-[120px] flex-none">
      <Compibert
        variant="head"
        :mood="mood"
      />
    </div>
    <div class="flex min-w-0 flex-col items-center gap-1.5 md:items-start">
      <!-- A title that carries a typed term (#885: „Nix gefunden zu „…“.“) wraps inside a word too, so a long term never widens the page. -->
      <h2 class="m-0 font-display text-[28px] leading-tight font-normal [overflow-wrap:anywhere]">
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
