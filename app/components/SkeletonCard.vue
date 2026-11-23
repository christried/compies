<script setup lang="ts">
// Loading placeholder in the shape of a Home card (02-components § SkeletonCard), or, with `shape="archive"`, of an Archive card (#884,
// artboard „App Ende & Archiv“ screen 21, „Lädt“): the same box as ArchiveCard, a block for the Winner strip, the name, a shorter date
// and a pill. It pulses and is hidden from assistive technology; the list around it carries aria-busy. Reduced motion: static.

withDefaults(defineProps<{ shape?: 'home' | 'archive' }>(), { shape: 'home' })
</script>

<template>
  <div
    v-if="shape === 'home'"
    aria-hidden="true"
    class="flex min-h-[200px] flex-col gap-4 rounded-[18px] border-2 border-line bg-surface p-5 animate-[pulse_1.2s_ease-in-out_infinite] reduced:animate-none"
  >
    <span class="block h-7 w-2/3 rounded-pill bg-paper-2" />
    <span class="block h-4 w-1/3 rounded-pill bg-paper-2" />
    <span class="block h-10 w-1/2 rounded-pill bg-paper-2" />
    <span class="mt-auto block h-11 w-32 rounded-pill bg-paper-2" />
  </div>
  <div
    v-else
    aria-hidden="true"
    class="flex flex-col gap-2.5 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-3.5 animate-[pulse_1.2s_ease-in-out_infinite] reduced:animate-none"
  >
    <span class="block h-[46px] rounded-[12px] bg-paper-2" />
    <span class="flex min-w-0 flex-col gap-0.5">
      <span class="block h-[21px] w-2/3 rounded-[6px] bg-paper-2" />
      <span class="block h-4 w-1/3 rounded-[6px] bg-paper-2" />
    </span>
    <span class="block h-6 w-[84px] rounded-pill bg-paper-2" />
  </div>
</template>
