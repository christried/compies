<script setup lang="ts">
// Construction strip inside working pages: says what is not built yet. A note, never a control.
withDefaults(defineProps<{
  title: string
  text?: string
  chip?: string
  sign?: boolean
  /** Smaller title and padding for phones and inline use (the reference's `compact`). */
  compact?: boolean
}>(), { text: '', chip: undefined, sign: true, compact: false })

const { t } = useI18n()
</script>

<template>
  <div
    role="note"
    :aria-label="`${t('mvp.zone.navMarker')}: ${title}`"
    class="outline-memphis relative flex flex-col overflow-hidden rounded-[18px] bg-paper-2 text-ink"
  >
    <div class="relative layer-sticky flex max-w-[600px] flex-col items-start gap-1.5 px-5 pt-[18px] pb-1.5 max-sm:px-3.5 max-sm:pt-3.5 max-sm:pb-1">
      <ConstructionChip>{{ chip ?? t('mvp.zone.chip') }}</ConstructionChip>
      <b
        class="font-display text-[26px] leading-[1.05] font-normal text-balance max-sm:text-[22px]"
        :class="compact && 'text-[22px]'"
      >{{ title }}</b>
      <span class="text-[14px] text-pretty text-ink-2"><slot>{{ text }}</slot></span>
    </div>
    <div class="relative">
      <ConstructionTape variant="strip" />
      <ConstructionGround
        variant="strip"
        :sign="sign"
      />
    </div>
  </div>
</template>
