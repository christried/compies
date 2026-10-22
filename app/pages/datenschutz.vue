<script setup lang="ts">
// Datenschutzerklärung (#8): public, reachable without sign-in. Placeholder copy until the operator supplies the text.
const { t } = useI18n()
useHead({ title: () => `${t('legal.datenschutz.title')} | ${t('app.name')}` })
</script>

<template>
  <AppShell kind="bare">
    <LegalDocument
      doc="datenschutz"
      :sections="['controller', 'signIn', 'storage', 'cookies', 'rights']"
    />
  </AppShell>
</template>
