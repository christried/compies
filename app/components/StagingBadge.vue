<script setup lang="ts">
// The staging build labels itself on every page (#178). Production renders nothing. It sits bottom left,
// above the phone tab bar (about 80 px tall) and the stepper footer, clear of the centred toasts and the
// host dock. It is decoration for sighted users: the page itself already says where it is.
const { t } = useI18n()
</script>

<template>
  <div
    v-if="useRuntimeConfig().public.staging"
    aria-hidden="true"
    class="pointer-events-none fixed left-2 layer-header rounded-pill border-2 border-line bg-warning px-2.5 py-1 font-mono text-[12px] leading-none font-bold tracking-[0.08em] text-on-warning shadow-sm bottom-[calc(env(safe-area-inset-bottom)+88px)]"
  >
    {{ t('staging.badge') }}
  </div>
</template>
