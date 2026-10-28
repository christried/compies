<script setup lang="ts">
import { reducedMotion } from '~/utils/motion'

// The „Neu“ chip after the version link in the page footer and the user menu (10-footer-und-anmerkungen §
// NewChip): the small sibling of the NewStamp on Neuigkeiten. It lands once per mount, and the link's name
// carries the meaning, so the chip itself is hidden from assistive tech.
const { t } = useI18n()
const chip = useTemplateRef('chip')

onMounted(() => {
  if (reducedMotion()) return
  chip.value?.animate?.(
    [{ opacity: 0, transform: 'rotate(-6deg) scale(.5)' }, { opacity: 1, transform: 'rotate(-6deg) scale(1)' }],
    { duration: 220, delay: 360, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' },
  )
})
</script>

<template>
  <span
    ref="chip"
    aria-hidden="true"
    class="ml-2 inline-flex h-5 -rotate-6 items-center rounded-pill border-2 border-line bg-primary px-1.5 align-[1px] font-sans text-[12px] leading-none font-extrabold tracking-[.06em] text-on-primary uppercase"
  >{{ t('news.new') }}</span>
</template>
