<script setup lang="ts">
import type { Component } from 'vue'
import { Crown } from '@lucide/vue'

// Host controls (02-components § HostDock). Desktop: a floating pill at the bottom centre. Phones: a
// crown button bottom right that opens the same actions in a sheet. Shortcut H focuses the toolbar.
// Callers pass at most three actions; the "Mehr" overflow is not needed yet. Each action carries what it does.
// An action with a `disabledReason` looks disabled (dashed) but stays focusable and clickable: its `run`
// answers the click with the reason, as a neutral toast (#52).
export interface DockAction {
  label: string
  icon: Component
  primary?: boolean
  disabledReason?: string
  run: () => void
}

defineProps<{
  actions: DockAction[]
}>()

const { t } = useI18n()
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const sheetOpen = ref(false)

function run(action: DockAction) {
  action.run()
  sheetOpen.value = false
}

// Arrow keys move between the actions inside the toolbar (02-components § HostDock).
function moveFocus(event: KeyboardEvent) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  const buttons = [...(toolbar.value?.querySelectorAll<HTMLElement>('button') ?? [])]
  const index = buttons.indexOf(document.activeElement as HTMLElement)
  if (index === -1) return
  event.preventDefault()
  const step = event.key === 'ArrowRight' ? 1 : -1
  buttons[(index + step + buttons.length) % buttons.length]?.focus()
}

function onShortcut(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (event.key.toLowerCase() !== 'h' || event.metaKey || event.ctrlKey || event.altKey) return
  if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
  toolbar.value?.querySelector<HTMLElement>('button')?.focus()
}

// While mounted, the toasts lift above the dock (ToastStack, useHostDock).
let leaveDock: (() => void) | undefined
onMounted(() => {
  window.addEventListener('keydown', onShortcut)
  leaveDock = useHostDock().attach()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onShortcut)
  leaveDock?.()
})
</script>

<template>
  <div>
    <div
      ref="toolbar"
      role="toolbar"
      :aria-label="t('dock.label')"
      class="fixed bottom-6 left-1/2 layer-dock hidden -translate-x-1/2 items-center gap-2 rounded-pill border-(length:--cp-bw) border-line bg-surface p-1.5 shadow-card md:flex"
      @keydown="moveFocus"
    >
      <button
        v-for="action in actions"
        :key="action.label"
        type="button"
        class="outline-memphis hit-44 inline-flex h-11 items-center gap-2 rounded-pill px-4 font-bold whitespace-nowrap shadow-btn lift aria-disabled:border-dashed aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:hover:bg-none"
        :class="action.primary ? 'bg-primary text-on-primary' : 'border-(length:--cp-bw) border-line bg-surface text-ink'"
        :aria-disabled="action.disabledReason ? 'true' : undefined"
        @click="run(action)"
      >
        <AppIcon
          :icon="action.icon"
          :size="16"
        />
        {{ action.label }}
      </button>
    </div>

    <button
      type="button"
      class="outline-memphis hit-44 fixed right-4 bottom-20 layer-dock grid size-14 place-items-center rounded-pill border-(length:--cp-bw) border-line bg-primary text-on-primary shadow-btn lift md:hidden"
      :aria-label="t('dock.label')"
      aria-haspopup="dialog"
      :aria-expanded="sheetOpen"
      @click="sheetOpen = true"
    >
      <AppIcon
        :icon="Crown"
        :size="24"
      />
    </button>

    <AppSheet
      :open="sheetOpen"
      :title="t('dock.label')"
      @close="sheetOpen = false"
    >
      <div class="flex flex-col gap-2.5">
        <button
          v-for="action in actions"
          :key="action.label"
          type="button"
          class="outline-memphis hit-44 flex h-14 items-center gap-3 rounded-pill border-(length:--cp-bw) border-line px-5 font-bold shadow-btn hover:tint aria-disabled:border-dashed aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:hover:bg-none"
          :class="action.primary ? 'bg-primary text-on-primary' : 'bg-surface text-ink'"
          :aria-disabled="action.disabledReason ? 'true' : undefined"
          @click="run(action)"
        >
          <AppIcon
            :icon="action.icon"
            :size="18"
          />
          {{ action.label }}
        </button>
      </div>
    </AppSheet>
  </div>
</template>
