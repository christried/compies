<script setup lang="ts">
import type { Component } from 'vue'
import { Crown, Ellipsis } from '@lucide/vue'

// Host controls (02-components § HostDock). Desktop: a floating pill at the bottom centre. Phones: a
// crown button bottom right that opens the same actions in a sheet. Shortcut H focuses the toolbar.
// The pill shows at most three actions; the rest, and every action placed in „Mehr“ (#155), wait behind
// the „Mehr“ button, which lists all actions grouped. Each action carries what it does.
// An action with a `disabledReason` looks disabled (dashed) but stays focusable and clickable: its `run`
// answers the click with the reason, as a neutral toast (#52).
export interface DockAction {
  /** Stable key for v-for and tests. */
  key: string
  label: string
  icon: Component
  /** The heading this action is listed under in „Mehr“ and on the phone sheet. */
  group: string
  /** Exactly one action per state is primary; the caller says which. */
  primary?: boolean
  /** Looks disabled (dashed) but stays focusable; `run` answers the click with this reason as a toast (as today). */
  disabledReason?: string
  /** `dock` (default): in the pill (at most three). `more`: only in „Mehr“. */
  place?: 'dock' | 'more'
  run: () => void
}

const props = defineProps<{
  actions: DockAction[]
}>()

const { t } = useI18n()
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const sheetOpen = ref(false)

const pillActions = computed(() => props.actions.filter(action => action.place !== 'more').slice(0, 3))
// Any action that is not in the pill (placed in „Mehr“, or past the third) ends the pill with „Mehr“.
const hasMore = computed(() => props.actions.length > pillActions.value.length)

// „Mehr“ lists every action, grouped under each heading in the order the heading first appears (#155).
const groups = computed(() => {
  const byName = new Map<string, DockAction[]>()
  for (const action of props.actions) byName.set(action.group, [...(byName.get(action.group) ?? []), action])
  return [...byName].map(([name, actions]) => ({ name, actions }))
})

const moreButton = useTemplateRef<HTMLElement>('moreButton')
const menu = useTemplateRef<HTMLElement>('menu')
const moreOpen = ref(false)

// Opening moves focus to the first item; closing gives it back to „Mehr“ (as UserMenu does).
async function openMore() {
  moreOpen.value = true
  await nextTick()
  menuItems()[0]?.focus()
}

function closeMore() {
  moreOpen.value = false
  moreButton.value?.focus()
}

function menuItems() {
  return [...(menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
}

// Arrow keys walk the menu items and wrap around (as UserMenu does).
function stepMore(step: 1 | -1) {
  const items = menuItems()
  if (!items.length) return
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length
  items[next]!.focus()
}

// A click anywhere else closes the menu; the „Mehr“ button itself toggles it.
function closeOnOutside(event: Event) {
  if (!moreOpen.value) return
  const target = event.target as Node
  if (menu.value?.contains(target) || moreButton.value?.contains(target)) return
  closeMore()
}

// Closing first, so focus is back on „Mehr“ before the action may open a dialog of its own.
function runFromMenu(action: DockAction) {
  closeMore()
  action.run()
}

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
  document.addEventListener('pointerdown', closeOnOutside)
  leaveDock = useHostDock().attach()
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onShortcut)
  document.removeEventListener('pointerdown', closeOnOutside)
  leaveDock?.()
})
</script>

<template>
  <div>
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- the arrow keys move focus between the toolbar buttons -->
    <div
      ref="toolbar"
      role="toolbar"
      :aria-label="t('dock.label')"
      class="fixed bottom-6 left-1/2 layer-dock hidden -translate-x-1/2 items-center gap-2 rounded-pill border-(length:--cp-bw) border-line bg-surface p-1.5 shadow-card md:flex"
      @keydown="moveFocus"
    >
      <button
        v-for="action in pillActions"
        :key="action.key"
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

      <button
        v-if="hasMore"
        ref="moreButton"
        type="button"
        class="outline-memphis hit-44 inline-flex h-11 items-center gap-2 rounded-pill border-(length:--cp-bw) border-line bg-surface px-4 font-bold whitespace-nowrap text-ink shadow-btn lift"
        aria-haspopup="menu"
        :aria-expanded="moreOpen"
        @click="moreOpen ? closeMore() : openMore()"
      >
        <AppIcon
          :icon="Ellipsis"
          :size="16"
        />
        {{ t('dock.more') }}
      </button>
    </div>

    <div
      v-if="moreOpen"
      ref="menu"
      role="menu"
      :aria-label="t('dock.label')"
      class="fixed bottom-[100px] left-1/2 layer-dock hidden w-[380px] -translate-x-1/2 flex-col gap-2.5 rounded-[18px] border-(length:--cp-bw) border-line bg-surface p-3.5 shadow-modal md:flex"
      @keydown.esc="closeMore"
      @keydown.down.prevent="stepMore(1)"
      @keydown.up.prevent="stepMore(-1)"
    >
      <div class="flex items-center gap-2.5">
        <span class="grid size-8 flex-none place-items-center rounded-pill border-2 border-line bg-primary text-on-primary">
          <AppIcon
            :icon="Crown"
            :size="16"
          />
        </span>
        <b class="flex-1 text-[16px]">{{ t('dock.label') }}</b>
        <kbd class="rounded-md border-[1.5px] border-line px-1.5 font-mono text-[11px]">H</kbd>
      </div>
      <div
        v-for="group in groups"
        :key="group.name"
        role="group"
        :aria-label="group.name"
        class="flex flex-col gap-0.5"
      >
        <p
          class="px-2 pb-0.5 text-[11px] tracking-[0.08em] text-ink-2 uppercase"
          aria-hidden="true"
        >
          {{ group.name }}
        </p>
        <button
          v-for="action in group.actions"
          :key="action.key"
          type="button"
          role="menuitem"
          class="outline-memphis hit-44 flex min-h-11 items-center gap-2.5 rounded-[10px] px-2 text-left text-[14px] font-bold aria-disabled:border-dashed aria-disabled:text-ink-3"
          :class="action.primary ? 'bg-primary text-on-primary' : 'text-ink hover:bg-paper-2'"
          :aria-disabled="action.disabledReason ? 'true' : undefined"
          @click="runFromMenu(action)"
        >
          <AppIcon
            :icon="action.icon"
            :size="18"
          />
          <span class="flex flex-col leading-tight">
            {{ action.label }}
            <span
              v-if="action.disabledReason"
              class="text-[11px] font-semibold text-ink-2"
            >{{ action.disabledReason }}</span>
          </span>
        </button>
      </div>
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
