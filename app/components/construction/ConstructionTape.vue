<script setup lang="ts">
// Absperrband across a construction scene. Never scrolls (people idle on these pages).
// Fixed colours on purpose: a physical object, same in light and dark.
// Compact (3 words) below sm for the strip, below md for the hero.
const props = defineProps<{ variant: 'strip' | 'hero' }>()

const { t } = useI18n()
const words = computed(() => [1, 2, 3].flatMap(() => [t('mvp.zone.tapeA'), t('mvp.zone.tapeB')]))
const extraWord = computed(() => props.variant === 'hero' ? 'max-md:hidden' : 'max-sm:hidden')
</script>

<template>
  <div
    aria-hidden="true"
    class="tape construction-tape absolute -inset-x-10 layer-sticky flex items-center justify-around overflow-hidden"
    :class="variant === 'hero'
      ? 'construction-tape-hero top-[26px] h-[34px] -rotate-4 md:top-[34px]'
      : 'top-2 h-[30px] -rotate-3'"
  >
    <span
      v-for="(word, i) in words"
      :key="i"
      class="construction-tape-word flex-none font-display uppercase"
      :class="[
        variant === 'hero' ? 'px-3 text-[17px] leading-[22px]' : 'px-2.5 text-[15px] leading-5',
        i >= 3 && extraWord,
      ]"
    >{{ word }}</span>
  </div>
</template>

<style>
/* Stripes and edges come from the `tape` utility; the hero tape is a size larger (BaustelleZone variant=hero). */
.construction-tape {
  box-shadow: 0 4px 0 rgba(21, 21, 21, .22);
}
.construction-tape-hero {
  border-block-width: 3px;
  background-image: repeating-linear-gradient(-45deg, #ff4f4f 0 16px, #fffdf8 16px 32px);
  box-shadow: 0 5px 0 rgba(21, 21, 21, .22);
}
.construction-tape-word {
  background: #151515;
  color: #fffdf8;
  letter-spacing: .04em;
}
</style>
