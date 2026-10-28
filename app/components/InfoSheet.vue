<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { INFO_SECTIONS, type InfoTopic } from '~/utils/info-sections'
import { noticeClasses } from '~/utils/notice'

// What a Format or Selection mode means (02-components § InfoSheet), from the product brief §17 (copy in
// `setup.info.<topic>`): „So läuft’s“, the Lucky Wheel's hidden wheel option, „Gut für“ and „Achtung“.
// The sections of a topic come from INFO_SECTIONS (a section a topic lacks is not listed). The stepper puts it in the info column and in the phone sheet.
// A section can have more than one paragraph: the hidden wheel option ends with what the Host sees (#145).
const props = defineProps<{
  topic: InfoTopic
}>()

const { t } = useI18n()

const sections = computed(() => INFO_SECTIONS[props.topic])
</script>

<template>
  <div
    lang="de"
    class="flex flex-col gap-3 text-[14px] leading-normal hyphens-auto"
  >
    <section
      v-for="section in sections"
      :key="section.section"
      class="flex flex-col gap-0.5"
      :class="section.section === 'warn' ? [noticeClasses('warning'), 'px-3 py-2.5'] : undefined"
    >
      <h3 class="m-0 flex items-center gap-1.5 font-display text-[18px] font-normal">
        <AppIcon
          v-if="section.section === 'warn'"
          :icon="TriangleAlert"
          :size="16"
        />
        {{ t(`setup.info.sections.${section.section}`) }}
      </h3>
      <p
        v-for="part in section.parts"
        :key="part"
        class="m-0 text-pretty"
      >
        {{ t(`setup.info.${topic}.${part}`) }}
      </p>
    </section>
  </div>
</template>
