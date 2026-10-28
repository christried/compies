<script setup lang="ts">
// Datenschutzerklärung (#8): public, reachable without sign-in.
const { t } = useI18n()
useHead({ title: () => t('legal.datenschutz.title') })
</script>

<template>
  <AppShell kind="bare">
    <div class="mx-auto flex w-full max-w-[720px] flex-col">
      <BackLink />
    </div>
    <LegalDocument
      doc="datenschutz"
      :sections="[
        'intro', 'controller', 'overview', 'hosting', 'database', 'storage', 'signIn', 'avatar', 'youtube', 'cookies',
        'security', 'events', 'calendar', 'fonts', 'recipients', 'transfer', 'retention',
        'obligation', 'rights', 'complaint', 'dataSecurity', 'changes',
      ]"
    />
  </AppShell>
</template>
