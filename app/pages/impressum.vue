<script setup lang="ts">
// Impressum (#8): public, reachable without sign-in. Placeholder copy until the operator supplies the text.
const { t } = useI18n()
useHead({ title: () => `${t('legal.impressum.title')} | ${t('app.name')}` })
</script>

<template>
  <AppShell kind="bare">
    <LegalDocument
      doc="impressum"
      :sections="['operator', 'contact', 'responsible']"
    />
  </AppShell>
</template>
