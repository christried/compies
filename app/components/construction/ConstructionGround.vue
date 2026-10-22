<script setup lang="ts">
// Bauzaun along the bottom of a construction scene, with the sign, the cone and (hero, desktop) the barrier.
// Fence lines follow the theme; sign, cone and barrier are physical objects with fixed colours.
// The strip turns compact below sm (inside working pages), the hero below md (the mobile shell).
defineProps<{
  variant: 'strip' | 'hero'
  sign?: boolean
}>()

const { t } = useI18n()

const LOOK = {
  strip: {
    ground: 'h-[138px] max-sm:h-[118px]',
    panel: 'h-[100px] w-[150px] max-sm:h-[82px] max-sm:w-[112px]',
    cone: 'right-7 w-[52px] max-sm:right-3.5 max-sm:w-10',
    sign: 'left-[30%] bottom-10 px-3 pt-[7px] pb-2 max-sm:left-[18px] max-sm:bottom-[34px]',
    signTitle: 'text-[20px] max-sm:text-[16px]',
  },
  hero: {
    ground: 'h-[130px] max-md:h-[110px]',
    panel: 'h-[100px] w-[150px] max-md:h-[82px] max-md:w-[112px]',
    cone: 'right-7 w-[52px] max-md:right-3.5 max-md:w-10',
    sign: 'left-[30%] bottom-10 px-3.5 pt-2 pb-[9px] max-md:left-[18px] max-md:bottom-[34px]',
    signTitle: 'text-[20px] max-md:text-[16px]',
  },
}
</script>

<template>
  <div
    aria-hidden="true"
    class="relative flex-none"
    :class="LOOK[variant].ground"
  >
    <div class="absolute bottom-2.5 -left-6 flex">
      <div
        v-for="panel in 10"
        :key="panel"
        class="relative flex-none"
        :class="LOOK[variant].panel"
      >
        <div class="fence-mesh absolute inset-x-0 top-0 bottom-3.5 border-x-5 border-y-3 border-line" />
        <span class="absolute bottom-0 -left-[15px] h-4 w-8 rounded-[3px] border-[2.5px] border-line bg-offline" />
        <span class="absolute -right-[15px] bottom-0 h-4 w-8 rounded-[3px] border-[2.5px] border-line bg-offline" />
      </div>
    </div>

    <!-- „Baustelle! Eltern haften für ihre Dinos.“ is HTML so the copy stays translatable (05-assets). -->
    <div
      v-if="sign"
      class="construction-sign absolute layer-content flex rotate-2 flex-col items-center text-center"
      :class="LOOK[variant].sign"
    >
      <span class="construction-sign-tie left-3.5" />
      <span class="construction-sign-tie right-3.5" />
      <span
        class="font-display uppercase"
        :class="LOOK[variant].signTitle"
      >{{ t('mvp.zone.signTitle') }}</span>
      <span class="text-caption font-extrabold">{{ t('mvp.zone.signText') }}</span>
    </div>

    <img
      v-if="variant === 'hero'"
      src="/baustelle/absperrschranke.svg"
      alt=""
      width="150"
      class="absolute bottom-1.5 left-[8%] layer-content block max-md:hidden"
    >
    <img
      src="/baustelle/leitkegel.svg"
      alt=""
      class="absolute bottom-1 layer-content block"
      :class="LOOK[variant].cone"
    >
  </div>
</template>

<style>
.construction-sign {
  border: 3px solid #151515;
  border-radius: 6px;
  background: #ffd23f;
  color: #151515;
  box-shadow: 4px 4px 0 var(--cp-shadow-ink);
  line-height: 1.05;
}
.construction-sign-tie {
  position: absolute;
  top: -9px;
  width: 6px;
  height: 14px;
  border-radius: 2px;
  background: #151515;
}
</style>
