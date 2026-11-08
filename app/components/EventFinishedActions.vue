<script setup lang="ts">
import { Play, Share2 } from '@lucide/vue'

// The row of buttons at the top of the finished stage (#313 „Bild teilen“, #314 „Siegerehrung ansehen“). The Host's dock keeps the page's one
// primary („Siegerehrung starten“), so these are secondaries. The page owns the dialogs and the layer; a button only asks.
defineProps<{
  /** The Host has started the Award ceremony at least once: there is a show to watch again. */
  ceremonyStarted: boolean
}>()

const emit = defineEmits<{
  share: []
  /** Plays the Award ceremony again, for this viewer only (#314). */
  replay: []
}>()

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
    <AppButton
      v-if="ceremonyStarted"
      variant="secondary"
      @click="emit('replay')"
    >
      <AppIcon
        :icon="Play"
        :size="18"
      />
      {{ t('ceremony.watch') }}
    </AppButton>
  </div>
</template>
