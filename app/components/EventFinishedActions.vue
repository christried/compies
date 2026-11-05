<script setup lang="ts">
import { Share2 } from '@lucide/vue'

// The row of buttons at the top of the finished stage (#313; #314 adds „Siegerehrung ansehen“ to it). The Host's dock keeps the page's one
// primary („Siegerehrung starten“), so these are secondaries. The page owns the dialogs; a button only asks.
const emit = defineEmits<{ share: [] }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex min-w-0 flex-wrap gap-2.5 empty:hidden">
    <AppButton
      variant="secondary"
      @click="emit('share')"
    >
      <AppIcon
        :icon="Share2"
        :size="18"
      />
      {{ t('share.open') }}
    </AppButton>
  </div>
</template>
