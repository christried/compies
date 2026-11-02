<script setup lang="ts">
import { Ban, Lock } from '@lucide/vue'
import { sealStamp } from '~/utils/motion'
import type { OwnVetoView } from '~~/shared/event'

// The hold-to-veto button of a Player (#231, 04-motion § Hold to confirm, reference App Spielrunde „Eigenes Veto versiegelt“). Only a
// Player of a Party sees it, and only while the Veto window is open. It is ready (a hold of one second casts the Party's Veto),
// holding, or done; once the Party cast it is a locked pill: for the Player who cast it with the seal stamp, for their teammates
// with the name of who did. With no Veto left it stays, disabled, and says why. Nobody else learns that a Veto was cast: the
// server sends the cast to the casting Party's Users only, so this button is the only place that shows it.
const props = defineProps<{
  /** The viewer's Party in the Veto window; null for the Bench, the Stands and a Host outside the teams. */
  own: OwnVetoView | null
  /** Whether the window is open now (after the stop, before its end). */
  open: boolean
  viewerId: string
  members: readonly { id: string, name: string }[]
  /** Casts the Party's Veto; resolves to whether the server took it. */
  cast: () => Promise<boolean>
}>()

const { t } = useI18n()

const mine = computed(() => props.own?.castBy === props.viewerId)
const mateName = computed(() => props.members.find(member => member.id === props.own?.castBy)?.name ?? '')
/** The seal stamp lands when the Party's cast arrives, and on a reload that shows a cast Party. */
const seal = useTemplateRef<HTMLElement>('seal')
watch(seal, (element) => {
  if (element) sealStamp(element)
})
</script>

<template>
  <div
    v-if="own && open && (own.castBy !== null || own.rejection === null || own.rejection === 'no_vetoes_left')"
    class="flex flex-col gap-1.5"
  >
    <div
      v-if="own.castBy !== null"
      data-testid="veto-locked"
      role="status"
      class="relative flex h-control-lg w-full items-center gap-2.5 rounded-pill border-(length:--cp-bw) border-line px-5 font-extrabold"
      :class="mine ? 'bg-surface-2 text-ink' : 'border-dashed border-ink-3 bg-paper-2 text-ink-2'"
    >
      <AppIcon
        :icon="Lock"
        :size="18"
      />
      <span class="min-w-0 truncate">{{ mine ? t('veto.cast') : t('veto.byMate', { name: mateName }) }}</span>
      <span
        v-if="mine"
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
      :disabled-reason="own.rejection === 'no_vetoes_left' ? t('error.noVetosLeft') : undefined"
      :action="cast"
    />
    <p class="m-0 text-[13px] text-ink-2">
      {{ own.castBy === null ? t('veto.hint') : mine ? t('veto.hintSealed') : t('veto.hintMate') }}
    </p>
  </div>
</template>
