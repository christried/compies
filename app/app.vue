<script setup lang="ts">
import { setLucideProps } from '@lucide/vue'

// Handoff rule: every Lucide icon uses stroke 2.5.
setLucideProps({ strokeWidth: 2.5 })
</script>

<template>
  <NuxtPwaManifest />
  <NuxtPage />
  <ToastStack />
  <WhatsNewDialog />
  <StagingBadge />
</template>
