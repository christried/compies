<script setup lang="ts" generic="T extends string">
import type { Component } from 'vue'
import { Lock } from '@lucide/vue'

// Big choice cards in a radio group (02-components § RadioCardGroup): Format, Selection mode, points preset. The
// group is typed by its values (T), so a caller gets back the value type it passed in, with no cast (review D1).
// Roving tabindex, arrows move and select (the focus follows), Space/Enter select. A locked option is the
// LockedOption look (dashed, „Bald verfügbar“ chip) with aria-disabled: no click, no keyboard, and the
// arrow keys skip it. With `lockedReason` the whole group is locked (#147): the chosen card stays marked, every card
// is aria-disabled and described by the reason, and nothing can be chosen.
const props = withDefaults(defineProps<{
  modelValue: T
  options: { value: T, label: string, desc: string, icon: Component, locked?: boolean }[]
  /** The group's accessible name. */
  label: string
  /** Columns from md up; one column on phones. */
  columns?: 1 | 2 | 3
  /** Why the choice cannot change; set = every option is locked and the chosen one stays chosen. */
  lockedReason?: string
}>(), { columns: 2, lockedReason: undefined })

const emit = defineEmits<{ 'update:modelValue': [value: T] }>()

const { t } = useI18n()
const group = useTemplateRef('group')
const uid = useId()

const enabled = computed(() => props.options.flatMap((option, index) => (option.locked || props.lockedReason ? [] : [index])))
const selected = computed(() => props.options.findIndex(option => option.value === props.modelValue && !option.locked))

// Without a selection the first open option is the tab stop, so the group stays reachable.
function isTabStop(index: number) {
  if (selected.value >= 0) return index === selected.value
  return index === (enabled.value[0] ?? 0)
}

function select(index: number) {
  const option = props.options[index]!
  if (option.locked || props.lockedReason) return
  emit('update:modelValue', option.value)
}

function onKeydown(event: KeyboardEvent, index: number) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
  if (step === undefined || enabled.value.length === 0) return
  event.preventDefault()
  const at = enabled.value.indexOf(index)
  const next = enabled.value[(at + step + enabled.value.length) % enabled.value.length]!
  select(next)
  nextTick(() => group.value?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus())
}

const reasonId = `${uid}-group-locked`

/** The ids of what describes an option: its „Bald verfügbar“ chip and the reason of a locked group. */
function describedBy(option: { value: T, locked?: boolean }) {
  const ids = [option.locked ? `${uid}-${option.value}-locked` : null, props.lockedReason ? reasonId : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

const COLUMNS = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3' }
</script>

<template>
  <div
    ref="group"
    role="radiogroup"
    :aria-label="label"
    class="grid grid-cols-1 gap-2.5"
    :class="COLUMNS[columns]"
  >
    <span
      v-if="lockedReason"
      :id="reasonId"
      class="sr-only"
    >{{ lockedReason }}</span>
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue && !option.locked ? 'true' : 'false'"
      :aria-disabled="option.locked || lockedReason ? 'true' : undefined"
      :aria-describedby="describedBy(option)"
      :tabindex="isTabStop(index) ? 0 : -1"
      class="flex min-h-[72px] items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left transition-shadow focus-visible:focus-ring dur-base"
      :class="option.locked || (lockedReason && option.value !== modelValue)
        ? 'border-(length:--cp-bw) border-dashed border-ink-3 bg-paper-2 text-ink-2'
        : option.value === modelValue
          ? 'border-3 border-line bg-surface text-ink shadow-card'
          : 'border-(length:--cp-bw) border-line bg-surface text-ink hover:bg-paper-2'"
      @click="select(index)"
      @keydown="onKeydown($event, index)"
    >
      <span
        class="grid size-[42px] flex-none place-items-center rounded-xl border-2"
        :class="option.locked
          ? 'border-dashed border-ink-3'
          : option.value === modelValue ? 'border-line bg-primary text-on-primary' : 'border-line bg-paper-2'"
      >
        <AppIcon
          :icon="option.icon"
          :size="20"
        />
      </span>
      <span class="flex min-w-0 flex-1 flex-col leading-[1.3]">
        <!-- The chip shares the title line and wraps under the title on a narrow card, so the description keeps the full width (#174). -->
        <span class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b class="text-[15px]">{{ option.label }}</b>
          <span
            v-if="option.locked"
            :id="`${uid}-${option.value}-locked`"
            class="inline-flex h-[22px] flex-none items-center gap-1 rounded-pill border-2 border-dashed border-ink-2 px-[7px] text-[11px] font-bold whitespace-nowrap text-ink-2"
          >
            <AppIcon
              :icon="Lock"
              :size="11"
            />
            {{ t('stepper.locked') }}
          </span>
        </span>
        <span class="text-[12px] text-ink-2">{{ option.desc }}</span>
      </span>
    </button>
  </div>
</template>
