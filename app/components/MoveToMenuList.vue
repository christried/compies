<script setup lang="ts">
import type { Component } from 'vue'

// The list of places inside the MoveToMenu (#160): every team, the Bench and the Stands. A place the person cannot
// go to stays in the list, dimmed, with the reason under it (`aria-disabled`, so it keeps its focus and is read out).
export interface MoveTarget {
  /** The key of the place (`placeKey`). */
  key: string
  label: string
  icon?: Component
  /** The team's colour index, to show its mark. */
  team?: number
  /** Why the person cannot go there; null when they can. */
  reason: string | null
}

defineProps<{ targets: MoveTarget[] }>()
const emit = defineEmits<{ pick: [key: string] }>()

const list = useTemplateRef<HTMLElement>('list')

/** Moves the focus along the enabled and the disabled items alike: the reasons are worth reading. */
function onKeydown(event: KeyboardEvent) {
  const items = [...(list.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
  const at = items.indexOf(document.activeElement as HTMLElement)
  const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (step === 0) return
  event.preventDefault()
  items[(at + step + items.length) % items.length]?.focus()
}

defineExpose({ focusFirst: () => list.value?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus() })
</script>

<template>
  <ul
    ref="list"
    role="menu"
    tabindex="-1"
    class="m-0 flex list-none flex-col gap-1 p-0"
    @keydown="onKeydown"
  >
    <li
      v-for="target in targets"
      :key="target.key"
      role="none"
    >
      <button
        type="button"
        role="menuitem"
        class="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-[15px]"
        :class="target.reason ? 'cursor-not-allowed text-ink-3' : 'font-semibold text-ink hover:bg-surface-2'"
        :aria-disabled="target.reason ? 'true' : undefined"
        @click="!target.reason && emit('pick', target.key)"
      >
        <TeamMark
          v-if="target.team"
          :team="target.team"
          :size="24"
        />
        <AppIcon
          v-else-if="target.icon"
          :icon="target.icon"
          :size="20"
        />
        <span class="flex min-w-0 flex-1 flex-col">
          <span>{{ target.label }}</span>
          <span
            v-if="target.reason"
            class="text-[13px] font-normal"
          >{{ target.reason }}</span>
        </span>
      </button>
    </li>
  </ul>
</template>
