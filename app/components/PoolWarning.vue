<script setup lang="ts">
import type { PoolWarning } from '~~/shared/rounds'

// The Host's live pool warning (#234, spec #218 § Pool warning): the games left may run short of the Game count and the Vetoes
// still to come. It never blocks anything, and only the Host sees it: on the stage of a running Event and in the settings editor.
// It looks like the setup hint under the Game pool (StepPool), with the same „Nur du siehst das“ chip.
const props = defineProps<{ warning: PoolWarning }>()

const { t } = useI18n()
const text = computed(() => t('poolWarning.text', { needed: t('poolWarning.needed', props.warning.needed), have: props.warning.have }, props.warning.have))
</script>

<template>
  <NoticeBanner
    tone="warning"
    host-only
  >
    <b>{{ t('poolWarning.title') }}</b> {{ text }}
  </NoticeBanner>
</template>
