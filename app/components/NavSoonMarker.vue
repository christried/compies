<script setup lang="ts">
// The 16 × 10 tape chip next to nav items that lead to a Construction page.
// Decorative: the nav item itself carries aria-description="Baustelle".
const { t } = useI18n()
</script>

<template>
  <span
    class="tape-chip inline-block h-2.5 w-4 flex-none"
    :title="t('mvp.zone.navMarker')"
    aria-hidden="true"
  />
</template>
