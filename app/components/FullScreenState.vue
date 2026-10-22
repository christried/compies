<script setup lang="ts">
// Full-page system states (screen 31) in the bare shell. Focus goes to the title on mount.
const props = defineProps<{
  kind: 'notFound' | 'noPermission' | 'generic'
}>()

const { t } = useI18n()
const heading = useTemplateRef('heading')

onMounted(() => heading.value?.focus())

const copy = computed(() => `errorPage.${props.kind}`)
</script>

<template>
  <div class="mx-auto flex max-w-[560px] flex-1 flex-col items-center justify-center gap-3.5 py-10 text-center">
    <div class="w-[140px]">
      <Compibert variant="bust" />
    </div>
    <h1
      ref="heading"
      tabindex="-1"
      class="m-0 text-[36px] leading-none md:text-[44px]"
    >
      {{ t(`${copy}.title`) }}
    </h1>
    <p class="m-0 text-[16px] text-ink-2">
      {{ t(`${copy}.text`) }}
    </p>
    <div class="mt-1.5 flex flex-wrap justify-center gap-2.5">
      <slot name="actions" />
    </div>
  </div>
</template>
