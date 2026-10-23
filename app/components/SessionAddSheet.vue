<script setup lang="ts">
// The sheet of "Session hinzufügen" (#55), for the Host only, after the Session cards. The new Session gets a
// Date from a date and time field, or it waits for the Date poll. The sheet emits the Berlin time (or null for
// the poll); the page posts it. The server checks the rules again (in the future, not another Session's Date).

const props = withDefaults(defineProps<{
  open: boolean
  busy?: boolean
}>(), { busy: false })

const emit = defineEmits<{ close: [], submit: [startsAt: string | null] }>()

const { t } = useI18n()
const mode = ref<'date' | 'poll'>('date')
const value = ref('')

watch(() => props.open, (open) => {
  if (open) {
    mode.value = 'date'
    value.value = ''
  }
})

const blocked = computed(() => props.busy || (mode.value === 'date' && value.value === ''))

function submit() {
  if (blocked.value) return
  emit('submit', mode.value === 'date' ? value.value : null)
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('mvp.sessions.add')"
    @close="emit('close')"
  >
    <p class="m-0 text-pretty text-ink-2">
      {{ t('mvp.sessions.addText') }}
    </p>
    <SegmentedControl
      v-model="mode"
      :label="t('mvp.sessions.choice')"
      :options="[
        { value: 'date', label: t('mvp.sessions.withDate') },
        { value: 'poll', label: t('mvp.sessions.withPoll') },
      ]"
    />
    <DateTimeField
      v-if="mode === 'date'"
      v-model="value"
      :label="t('mvp.sessions.dateLabel')"
    />
    <AppButton
      size="lg"
      :aria-disabled="blocked ? 'true' : undefined"
      @click="submit"
    >
      {{ t('mvp.sessions.cta') }}
    </AppButton>
  </AppSheet>
</template>
