<script setup lang="ts">
import type { Component } from 'vue'
import { Lock } from '@lucide/vue'

// Big choice cards in a radio group (02-components § RadioCardGroup): Format, Selection mode, points preset.
// Roving tabindex, arrows move and select (the focus follows), Space/Enter select. A locked option is the
// LockedOption look (dashed, „Bald verfügbar“ chip) with aria-disabled: no click, no keyboard, and the
// arrow keys skip it.
const props = withDefaults(defineProps<{
  modelValue: string
  options: { value: string, label: string, desc: string, icon: Component, locked?: boolean }[]
  /** The group's accessible name. */
  label: string
  /** Columns from md up; one column on phones. */
  columns?: 1 | 2 | 3
}>(), { columns: 2 })

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const { t } = useI18n()
const group = useTemplateRef('group')
const uid = useId()

const enabled = computed(() => props.options.flatMap((option, index) => (option.locked ? [] : [index])))
const selected = computed(() => props.options.findIndex(option => option.value === props.modelValue && !option.locked))

// Without a selection the first open option is the tab stop, so the group stays reachable.
function isTabStop(index: number) {
  return selected.value >= 0 ? index === selected.value : index === enabled.value[0]
}

function select(index: number) {
  const option = props.options[index]!
  if (option.locked) return
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
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue && !option.locked ? 'true' : 'false'"
      :aria-disabled="option.locked ? 'true' : undefined"
      :aria-describedby="option.locked ? `${uid}-${option.value}-locked` : undefined"
      :tabindex="isTabStop(index) ? 0 : -1"
      class="flex min-h-[72px] items-center gap-3 rounded-[14px] px-3.5 py-2.5 text-left transition-shadow focus-visible:focus-ring dur-base"
      :class="option.locked
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
        <b class="text-[15px]">{{ option.label }}</b>
        <span class="text-[12px] text-ink-2">{{ option.desc }}</span>
      </span>
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
    </button>
  </div>
</template>
