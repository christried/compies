<script setup lang="ts">
// Game notes (#223, #443): the library entry's section and the game dialog's. Plain text with the line breaks the Host wrote; `{{ }}` only, so no
// formatting and no links. The heading level is the place's: the entry's page has an h1 above it (h2), the dialog's title is an h2 (h3).
withDefaults(defineProps<{
  notes: string
  level?: 'h2' | 'h3'
}>(), { level: 'h2' })

const { t } = useI18n()
</script>

<template>
  <section class="flex flex-col gap-2">
    <component
      :is="level"
      class="m-0 text-[16px] font-extrabold"
    >
      {{ t('library.notes') }}
    </component>
    <p class="m-0 text-[15px] leading-[1.5] whitespace-pre-wrap [overflow-wrap:anywhere]">
      {{ notes }}
    </p>
  </section>
</template>
