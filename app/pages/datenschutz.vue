<script setup lang="ts">
// Datenschutzerklärung (#8): public, reachable without sign-in.
const { t } = useI18n()
useHead({ title: () => `${t('legal.datenschutz.title')} | ${t('app.name')}` })
</script>

<template>
  <AppShell kind="bare">
    <LegalDocument
      doc="datenschutz"
      :sections="[
        'intro', 'controller', 'overview', 'hosting', 'database', 'signIn', 'avatar', 'cookies',
        'security', 'sessions', 'calendar', 'fonts', 'recipients', 'transfer', 'retention',
        'obligation', 'rights', 'complaint', 'dataSecurity', 'changes',
      ]"
    />
  </AppShell>
</template>
