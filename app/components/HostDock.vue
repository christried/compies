<script setup lang="ts">
import type { Component } from 'vue'
import { Crown, Ellipsis } from '@lucide/vue'

// Host controls (02-components § HostDock). Desktop: a floating pill at the bottom centre. Phones: a
// crown button bottom right that opens the same actions in a sheet. Shortcut H focuses the toolbar.
// The pill shows at most three actions; the rest, and every action placed in „Mehr“ (#155), wait behind
// the „Mehr“ button, which lists all actions grouped. Each action carries what it does.
// An action with a `disabledReason` looks disabled (dashed) but stays focusable and clickable: its `run`
// answers the click with the reason, as a neutral toast (#52). On the pill the reason also shows in a bubble above it,
// linked with aria-describedby (#164); on the phone sheet it sits under the button.
// A `hold` action (#164, „Session beenden“) is a HoldToConfirmButton in the pill and in the sheet: its `run` happens
// after the hold and resolves to whether it worked. It is not repeated in „Mehr“. „Mehr“ is there whenever there are actions.
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
  /** Needs a one second hold; then `run` returns whether the server took it. */
  hold?: boolean
  run: () => void | Promise<boolean>
}

const props = defineProps<{
  actions: DockAction[]
}>()

const { t } = useI18n()
const toolbar = useTemplateRef<HTMLElement>('toolbar')
const sheetOpen = ref(false)

const pillActions = computed(() => props.actions.filter(action => action.place !== 'more').slice(0, 3))

function grouped(actions: DockAction[]) {
  const byName = new Map<string, DockAction[]>()
  for (const action of actions) byName.set(action.group, [...(byName.get(action.group) ?? []), action])
  return [...byName].map(([name, list]) => ({ name, actions: list }))
}

// „Mehr“ lists every action but a hold action that sits in the pill, grouped under each heading in the order the
// heading first appears (#155, #164). The phone sheet has no „Mehr“ step, so it lists them all.
const menuActions = computed(() => props.actions.filter(action => !(action.hold && pillActions.value.includes(action))))
const hasMore = computed(() => menuActions.value.length > 0)
const groups = computed(() => grouped(menuActions.value))
const sheetGroups = computed(() => grouped(props.actions))

// The reason of a disabled primary in the pill, for the bubble above it.
const reasonId = useId()
const bubbleAction = computed(() => pillActions.value.find(action => action.primary && action.disabledReason))

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

// A hold action in the sheet: the sheet closes once the server took it.
async function runHold(action: DockAction): Promise<boolean> {
  const worked = (await action.run()) !== false
  if (worked) sheetOpen.value = false
  return worked
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
      <template
        v-for="action in pillActions"
        :key="action.key"
      >
        <HoldToConfirmButton
          v-if="action.hold"
          :label="action.label"
          :icon="action.icon"
          :variant="action.primary ? 'primary' : 'secondary'"
          size="card"
          :action="async () => (await action.run()) !== false"
        />
        <button
          v-else
          type="button"
          class="outline-memphis hit-44 inline-flex h-11 items-center gap-2 rounded-pill px-4 font-bold whitespace-nowrap shadow-btn lift aria-disabled:border-dashed aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:hover:bg-none"
          :class="action.primary ? 'bg-primary text-on-primary' : 'border-(length:--cp-bw) border-line bg-surface text-ink'"
          :aria-disabled="action.disabledReason ? 'true' : undefined"
          :aria-describedby="action === bubbleAction ? reasonId : undefined"
          @click="run(action)"
        >
          <AppIcon
            :icon="action.icon"
            :size="16"
          />
          {{ action.label }}
        </button>
      </template>

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

    <!-- The reason a disabled primary is disabled, above the pill (desktop). -->
    <p
      v-if="bubbleAction"
      :id="reasonId"
      class="fixed bottom-[88px] left-1/2 layer-dock m-0 hidden max-w-[360px] -translate-x-1/2 rounded-[12px] border-2 border-line bg-surface px-3 py-1.5 text-center text-[13px] font-bold text-ink shadow-card md:block"
    >
      {{ bubbleAction.disabledReason }}
    </p>

    <div
      v-if="moreOpen"
      ref="menu"
      role="menu"
      tabindex="-1"
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
          class="outline-memphis hit-44 flex min-h-11 items-center gap-2.5 rounded-[10px] border-0 bg-transparent px-2 text-left text-[14px] font-bold text-ink hover:tint aria-disabled:text-ink-3 aria-disabled:hover:bg-none"
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
      <!-- The phone has no „Mehr“ step: the sheet lists every action under its group (#155). -->
      <div class="flex flex-col gap-4">
        <div
          v-for="group in sheetGroups"
          :key="group.name"
          role="group"
          :aria-label="group.name"
          class="flex flex-col gap-2.5"
        >
          <p
            class="text-[11px] tracking-[0.08em] text-ink-2 uppercase"
            aria-hidden="true"
          >
            {{ group.name }}
          </p>
          <template
            v-for="action in group.actions"
            :key="action.key"
          >
            <HoldToConfirmButton
              v-if="action.hold"
              :label="action.label"
              :icon="action.icon"
              :variant="action.primary ? 'primary' : 'secondary'"
              :action="() => runHold(action)"
            />
            <button
              v-else
              type="button"
              class="outline-memphis hit-44 flex min-h-14 items-center gap-3 rounded-pill border-(length:--cp-bw) border-line px-5 py-2 text-left font-bold shadow-btn hover:tint aria-disabled:border-dashed aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:hover:bg-none"
              :class="action.primary ? 'bg-primary text-on-primary' : 'bg-surface text-ink'"
              :aria-disabled="action.disabledReason ? 'true' : undefined"
              @click="run(action)"
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
          </template>
        </div>
      </div>
    </AppSheet>
  </div>
</template>
