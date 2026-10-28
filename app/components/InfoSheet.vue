<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { noticeClasses } from '~/utils/notice'

// What a Format or Selection mode means (02-components § InfoSheet), from the product brief §17 (copy in
// `setup.info.<topic>`): „So läuft’s“, the Lucky Wheel's hidden wheel option, „Gut für“ and „Achtung“.
// Sections a topic lacks are left out. The stepper puts it in the info column and in the phone sheet.
// A section can have more than one paragraph: the hidden wheel option ends with what the Host sees (#145).
const props = defineProps<{
  topic: 'teams' | 'ffa' | 'admin' | 'wheel'
}>()

const { t, te } = useI18n()

const sections = computed(() => [
  { key: 'how', heading: 'setup.info.sections.how', parts: ['how'] },
  { key: 'hideWheel', heading: 'setup.info.sections.hideWheel', parts: ['hideWheel', 'hostSees'] },
  { key: 'good', heading: 'setup.info.sections.good', parts: ['good'] },
  { key: 'warn', heading: 'setup.info.sections.warn', parts: ['warn'] },
].map(section => ({ ...section, parts: section.parts.filter(part => te(`setup.info.${props.topic}.${part}`)) }))
  .filter(section => section.parts.length > 0))
</script>

<template>
  <div
    lang="de"
    class="flex flex-col gap-3 text-[14px] leading-normal hyphens-auto"
  >
    <section
      v-for="section in sections"
      :key="section.key"
      class="flex flex-col gap-0.5"
      :class="section.key === 'warn' ? [noticeClasses('warning'), 'px-3 py-2.5'] : undefined"
    >
      <h3 class="m-0 flex items-center gap-1.5 font-display text-[18px] font-normal">
        <AppIcon
          v-if="section.key === 'warn'"
          :icon="TriangleAlert"
          :size="16"
        />
        {{ t(section.heading) }}
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
