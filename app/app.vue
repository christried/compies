<script setup lang="ts">
import { setLucideProps } from '@lucide/vue'

// Handoff rule: every Lucide icon uses stroke 2.5.
setLucideProps({ strokeWidth: 2.5 })

// The installed app's splash (#674): decided once on the server, after the auth middleware has loaded the User; the layer is in the first byte.
const bootDue = useBootSplash()
</script>

<template>
  <NuxtPwaManifest />
  <NuxtPage />
  <LazyBootSplash
    v-if="bootDue"
    @done="bootDue = false"
  />
  <ToastStack />
  <WhatsNewDialog />
  <StagingBadge />
</template>
