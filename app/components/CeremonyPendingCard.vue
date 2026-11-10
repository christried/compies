<script setup lang="ts">
import { Trophy } from '@lucide/vue'

// The finished page's card while the Award ceremony is still to come (#445): it stands in the place of the Standings, in the stage and in the
// Tabelle tab, so it is a framed card of the stage's look and not a NoticeBanner. No Compibert and no button: the Host's action is the dock's
// „Siegerehrung starten“, which the Host's sentence names.
defineProps<{
  isHost: boolean
}>()

const { t } = useI18n()
const headingId = useId()
</script>

<template>
  <section
    :aria-labelledby="headingId"
    class="flex items-start gap-3 rounded-[16px] border-(length:--cp-bw) border-line bg-surface p-4 shadow-card"
  >
    <AppIcon
      :icon="Trophy"
      :size="22"
      class="mt-0.5 shrink-0"
    />
    <div class="flex min-w-0 flex-col gap-1">
      <h2
        :id="headingId"
        class="m-0 text-[18px] font-extrabold"
      >
        {{ t('ceremony.pending.title') }}
      </h2>
      <p class="m-0 text-[15px] text-ink-2">
        {{ isHost ? t('ceremony.pending.host', { action: t('dock.ceremony') }) : t('ceremony.pending.member') }}
      </p>
    </div>
  </section>
</template>
