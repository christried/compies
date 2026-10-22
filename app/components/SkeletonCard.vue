<script setup lang="ts">
// Loading placeholder in the shape of a Home card (02-components § SkeletonCard). It pulses and is
// hidden from assistive technology; the list around it carries aria-busy. Reduced motion: static.
</script>

<template>
  <div
    aria-hidden="true"
    class="flex min-h-[200px] flex-col gap-4 rounded-[18px] border-2 border-line bg-surface p-5 animate-[pulse_1.2s_ease-in-out_infinite] reduced:animate-none"
  >
    <span class="block h-7 w-2/3 rounded-pill bg-paper-2" />
    <span class="block h-4 w-1/3 rounded-pill bg-paper-2" />
    <span class="block h-10 w-1/2 rounded-pill bg-paper-2" />
    <span class="mt-auto block h-11 w-32 rounded-pill bg-paper-2" />
  </div>
</template>
