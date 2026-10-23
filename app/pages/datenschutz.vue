<script setup lang="ts">
// Datenschutzerklärung (#8): public, reachable without sign-in.
const { t } = useI18n()
useHead({ title: () => `${t('legal.datenschutz.title')} | ${t('app.name')}` })
</script>

<template>
  <AppShell kind="bare">
    <div class="mx-auto flex w-full max-w-[720px] flex-col">
      <BackLink />
    </div>
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
