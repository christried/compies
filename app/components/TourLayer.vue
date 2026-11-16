
<script setup lang="ts">
import { tourMove, type TourStep } from '~~/shared/tour'

// The Tour's layer (#647, ADR 0017): one box in the popover look, centred in the window, with the current step's text and its buttons. The look
// is provisional until #460 (bubble, spotlight, Compibert, placement against a target); what stays is the behaviour: the focus goes in and back,
// Tab stays inside, Esc skips, the arrows walk, and each step is announced. It decides nothing about when it is open: `useTour` passes `open`,
// and says what was seen. The layer is fixed on the scale's popover step (over the sticky tab bar, the header and the dock, under the toasts); it
// dims nothing and locks no scroll, so the wrapper takes no pointer and only the box does. The page behind is inert through AppShell's `covered`, so the box takes the keys from the document.
const props = defineProps<{
  open: boolean
  steps: readonly TourStep[]
}>()
const emit = defineEmits<{
  over: [how: 'finished' | 'skipped']
}>()

const { t } = useI18n()
const panel = useTemplateRef<HTMLElement>('panel')
const titleId = useId()

const at = ref(0)
const step = computed(() => props.steps[at.value])
const last = computed(() => at.value >= props.steps.length - 1)

// Not tracked in the registry of open layers: the Tour must not read itself as a layer that stops it.
const { onKeydown } = useDialog(toRef(props, 'open'), panel, () => emit('over', 'skipped'), { tracked: false })

/** The pure `tourMove` is the one place a step moves, so a quick second click cannot pass the end. */
async function go(action: 'next' | 'back' | 'skip') {
  const move = tourMove(props.steps.length, at.value, action)
  if ('over' in move) {
    emit('over', move.over)
    return
  }
  at.value = move.at
  // „Zurück“ is gone on the first step, and the focus would fall to the body with it.
  await nextTick()
  panel.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
}

// On the document, not on the box: a click on the inert page behind puts the focus on the body, and the box's own keydown would miss the next key.
function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    // Alt+Left is the browser's Back.
    if (event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    void go(event.key === 'ArrowRight' ? 'next' : 'back')
    return
  }
  onKeydown(event)
}

watch(() => props.open, (isOpen) => {
  if (isOpen) at.value = 0
  if (!import.meta.client) return
  if (isOpen) document.addEventListener('keydown', onDocumentKeydown)
  else document.removeEventListener('keydown', onDocumentKeydown)
}, { immediate: true })

onBeforeUnmount(() => {
  if (import.meta.client) document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div
    v-if="open && step"
    class="pointer-events-none fixed inset-0 layer-popover flex items-center justify-center p-3.5"
  >
    <div
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      class="pointer-events-auto flex w-full max-w-[360px] animate-enter flex-col gap-3 rounded-[18px] border-(length:--cp-bw) border-line bg-surface p-4 text-ink shadow-modal"
    >
      <h2
        :id="titleId"
        class="m-0 font-display text-[22px] leading-none font-normal"
      >
        {{ t(`tour.${step.id}.title`) }}
      </h2>
      <p class="m-0 text-[14px] leading-[1.45]">
        {{ t(`tour.${step.id}.text`) }}
      </p>
      <!-- Read out on each step (the pattern of the Standings' status line in EventPage). The visible texts are the dialog's name and its content. -->
      <p
        role="status"
        aria-live="polite"
        class="sr-only"
      >
        {{ t(`tour.${step.id}.title`) }}. {{ t(`tour.${step.id}.text`) }}
      </p>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <AppButton
          variant="secondary"
          @click="go('skip')"
        >
          {{ t('tour.skip') }}
        </AppButton>
        <div class="flex items-center gap-2">
          <AppButton
            v-if="at > 0"
            variant="secondary"
            @click="go('back')"
          >
            {{ t('common.back') }}
          </AppButton>
          <AppButton
            data-autofocus
            @click="go('next')"
          >
            {{ last ? t('tour.finish') : t('common.next') }}
          </AppButton>
        </div>
      </div>
    </div>
  </div>
</template>
