<script setup lang="ts">
import { X } from '@lucide/vue'

// Renders the toast stack once, in app.vue (02-components § ToastStack). Errors are alerts, the
// rest are status messages. Sits above the tab bar on phones and the dock on desktop. With a Host dock
// on the page it lifts above the dock: above the crown button on phones, above the pill on desktop.
const { toasts, dismiss } = useToast()
const { docked } = useHostDock()
const { t } = useI18n()

function run(toast: { id: number, action?: { run: () => void } }) {
  toast.action?.run()
  dismiss(toast.id)
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 layer-toast flex flex-col items-center gap-2 px-3.5"
    :class="docked ? 'bottom-36 md:bottom-24' : 'bottom-20 md:bottom-6'"
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
        @click="run(toast)"
      >
        {{ toast.action.label }}
      </button>
      <button
        type="button"
        class="hit-44 grid place-items-center"
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
