<script setup lang="ts">
import { X } from '@lucide/vue'

// Renders the toast stack once, in app.vue (02-components § ToastStack). Errors are alerts, the
// rest are status messages. Sits above the tab bar on phones and the dock on desktop. With a Host dock
// on the page it lifts above the dock: above the crown button on phones, above the pill on desktop.
const { toasts, dismiss, timed, holdForTab, setFocusInside } = useToast()
const { docked } = useHostDock()
const { t } = useI18n()
// A timed toast waits for the keyboard (#867): the bookkeeping is `useToast`'s, this only tells it about focus and Tab presses.
const root = useTemplateRef<HTMLElement>('root')
const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Tab') holdForTab()
}
const focusOnStack = () => root.value?.contains(document.activeElement) ?? false
function onFocusout(event: FocusEvent) {
  // Focus moving from one button of the stack to another never leaves it.
  if (!root.value?.contains(event.relatedTarget as Node | null)) setFocusInside(false)
}
let listening = false
function listen(on: boolean) {
  if (on === listening) return
  listening = on
  if (on) window.addEventListener('keydown', onKeydown, true)
  else window.removeEventListener('keydown', onKeydown, true)
}
onMounted(() => {
  // One listener while a timed toast is up (capture: a handler that stops the event still counts as a press).
  watch(timed, listen, { immediate: true })
  // A toast that leaves takes the focus on its button with it, and that fires no focusout: ask the page where the focus is.
  watch(toasts, () => setFocusInside(focusOnStack()), { flush: 'post' })
})
onBeforeUnmount(() => {
  listen(false)
  setFocusInside(false)
})
// A ring drawn inside the error toast lies on its fill, where Dunkel's --cp-focus is 1.48:1 (#409); --cp-on-error pairs with the fill (5.93:1). Hell keeps the ring it has.
const RING_ON_ERROR = 'dark:focus-visible:outline-on-error'

function run(toast: { id: number, action?: { run: () => void } }) {
  toast.action?.run()
  dismiss(toast.id)
}
</script>

<template>
  <div
    ref="root"
    class="pointer-events-none fixed inset-x-0 layer-toast flex flex-col items-center gap-2 px-3.5"
    :class="docked ? 'bottom-44 md:bottom-24' : 'bottom-20 md:bottom-6'"
    @focusin="setFocusInside(true)"
    @focusout="onFocusout"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :role="toast.tone === 'error' ? 'alert' : 'status'"
      class="animate-enter pointer-events-auto flex max-w-[480px] items-center gap-3 rounded-pill border-2 border-line px-4 py-2.5 font-bold shadow-soft"
      :class="toast.tone === 'error' ? 'bg-error text-on-error' : 'bg-surface text-ink'"
    >
      <span>{{ toast.text }}</span>
      <button
        v-if="toast.action"
        type="button"
        class="hit-44 font-extrabold underline"
        :class="toast.tone === 'error' && RING_ON_ERROR"
        @click="run(toast)"
      >
        {{ toast.action.label }}
      </button>
      <button
        type="button"
        class="hit-44 grid place-items-center"
        :class="toast.tone === 'error' && RING_ON_ERROR"
        :aria-label="t('common.close')"
        @click="dismiss(toast.id)"
      >
        <AppIcon
          :icon="X"
          :size="16"
        />
      </button>
    </div>
  </div>
</template>
