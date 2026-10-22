<script setup lang="ts">
// Plain-text legal page (#8) in the bare shell. Copy lives under `legal.<doc>` in de.json;
// each section is a key with a `heading` and a `text`.
const props = defineProps<{
  doc: 'impressum' | 'datenschutz'
  sections: string[]
}>()

const { t } = useI18n()
</script>

<template>
  <article class="mx-auto flex w-full max-w-[720px] flex-col gap-6 py-4 md:py-8">
    <h1 class="m-0 text-[36px] leading-none md:text-[44px]">
      {{ t(`legal.${props.doc}.title`) }}
    </h1>

    <section
      v-for="key in props.sections"
      :key="key"
      class="flex flex-col gap-2"
    >
      <h2 class="m-0 text-[22px] leading-tight">
        {{ t(`legal.${props.doc}.${key}.heading`) }}
      </h2>
      <p class="m-0 text-body text-pretty text-ink-2">
        {{ t(`legal.${props.doc}.${key}.text`) }}
      </p>
    </section>
  </article>
</template>
