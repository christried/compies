<script setup lang="ts">
import { Medal } from '@lucide/vue'

// The early Finish sheet (#953, spec #961 § Host dock): the delete sheet's pattern (EventDeleteSheet, a one second hold) for „Event abschließen“
// before the Game count. It names the Leading Party that can no longer be caught and the games that will not be played. The page's dialogs
// send the finish (`finish`); a refusal keeps the sheet open. The copy is provisional, for the hotfix's wording sweep.
const props = defineProps<{
  open: boolean
  /** The name of the sole Leading Party (teamNameAt). */
  team: string
  /** The first and the last game that will not be played: the Rounds with a Result + 1, and the Game count. */
  from: number
  to: number
  /** Sends the finish; resolves to whether the server took it (the hold goes back to idle on false). */
  finish: () => Promise<boolean>
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()

const games = computed(() => (props.from === props.to ? t('finishEarly.one', { n: props.to }) : t('finishEarly.many', { from: props.from, to: props.to })))
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('finishEarly.title')"
    @close="emit('close')"
  >
    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t('finishEarly.lead', { team }) }} {{ games }}
    </p>

    <HoldToConfirmButton
      :label="t('dock.finish')"
      :icon="Medal"
      :action="finish"
    />

    <AppButton
      variant="secondary"
      class="self-start"
      @click="emit('close')"
    >
      {{ t('common.cancel') }}
    </AppButton>
  </AppSheet>
</template>
