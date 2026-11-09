<script setup lang="ts">
import { Ban, Lock } from '@lucide/vue'
import { sealStamp } from '~/utils/motion'
import { vetoActionShown } from '~/utils/veto-bar'
import type { OwnVetoView } from '~~/shared/stage'

// The hold-to-veto button of a Player (#231, 04-motion § Hold to confirm, reference App Spielrunde „Eigenes Veto versiegelt“). It sits in
// the VetoBar (review 0.7, F4). Only a Player of a Party sees it, and only while the Veto window is open. It is ready (a hold of one
// second casts the Party's Veto), holding, or done; once the Party cast it is a locked pill with the seal stamp, the same for every Player of
// the Party: nobody learns which of them cast it (#355). With no Veto left it stays, disabled. Nobody else learns that a Veto was cast: the
// server sends the cast to the casting Party's Users only, so the bar is the only place that shows it. What it means is the bar's title and line.
defineProps<{
  /** The viewer's Party in the Veto window; null for the Bench, the Stands and a Host outside the teams. */
  own: OwnVetoView | null
  /** Whether the window is open now (after the stop, before its end). */
  open: boolean
  /** Casts the Party's Veto; resolves to whether the server took it. */
  cast: () => Promise<boolean>
}>()

const { t } = useI18n()

/** The seal stamp lands when the Party's cast arrives, and on a reload that shows a cast Party. */
const seal = useTemplateRef<HTMLElement>('seal')
watch(seal, (element) => {
  if (element) sealStamp(element)
})
</script>

<template>
  <div
    v-if="open && vetoActionShown(own)"
    class="flex flex-col gap-1.5"
  >
    <div
      v-if="own.cast"
      data-testid="veto-locked"
      role="status"
      class="relative flex h-control-lg w-full items-center gap-2.5 rounded-pill border-(length:--cp-bw) border-line bg-surface-2 px-5 font-extrabold text-ink"
    >
      <AppIcon
        :icon="Lock"
        :size="18"
      />
      <span class="min-w-0 truncate">{{ t('veto.locked') }}</span>
      <span
        ref="seal"
        data-testid="veto-seal"
        class="ml-auto -rotate-[8deg] rounded-[10px] border-[3px] border-line bg-hot px-3 py-0.5 font-display text-[18px] font-normal tracking-wide text-on-hot uppercase shadow-sm"
      >{{ t('veto.stamp') }}</span>
    </div>
    <HoldToConfirmButton
      v-else
      data-testid="veto-hold"
      variant="hot"
      size="lg"
      block
      hint="badge"
      :icon="Ban"
      :label="t('veto.hold')"
      :holding-label="t('veto.holding')"
      :done-label="t('veto.cast')"
      :disabled="own.rejection !== null"
      :action="cast"
    />
  </div>
</template>
