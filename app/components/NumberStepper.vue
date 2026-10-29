<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'

// A whole number with a minus and a plus button (02-components § NumberStepper): teams, Team size, Game count,
// points per place, Veto allowance. The value is the spinbutton (#174, review S8): focusable, moved with the arrow
// keys (ArrowUp/ArrowRight count up, ArrowDown/ArrowLeft down) and Home/End for the limits, and it announces its
// value. The buttons sit outside it. At a limit the button stays focusable but is aria-disabled, does nothing and
// says why: as its title and as a visually hidden description. A parent that has a tighter limit than `max` (24
// Players in teams) just passes the lower `max` with its own reason. `lockedReason` locks both buttons and the
// value with that reason (#147).
const props = withDefaults(defineProps<{
  modelValue: number
  min: number
  max: number
  step?: number
  /** Shown after the value, e.g. „Teams“. */
  unit?: string
  /** The group's accessible name, and the value's. */
  label: string
  minReason?: string
  maxReason?: string
  /** Both buttons are aria-disabled and say this: the value cannot change now. */
  lockedReason?: string
  /** The id of what describes the value, e.g. the error of a row that rises (PointsTableEditor). */
  describedBy?: string
  /** lg = the big Game count stepper (56 px buttons, 72 px number). */
  size?: 'md' | 'lg'
}>(), { step: 1, unit: undefined, minReason: undefined, maxReason: undefined, lockedReason: undefined, describedBy: undefined, size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const { t } = useI18n()
const minId = useId()
const maxId = useId()

const atMin = computed(() => Boolean(props.lockedReason) || props.modelValue - props.step < props.min)
const atMax = computed(() => Boolean(props.lockedReason) || props.modelValue + props.step > props.max)
const minText = computed(() => props.lockedReason ?? props.minReason)
const maxText = computed(() => props.lockedReason ?? props.maxReason)

// Nothing is emitted for a value that is already there, and nothing at all while the value is locked.
function setTo(value: number) {
  if (props.lockedReason || value === props.modelValue) return
  emit('update:modelValue', value)
}

function change(direction: 1 | -1) {
  if (direction === 1 ? atMax.value : atMin.value) return
  setTo(props.modelValue + direction * props.step)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault()
    setTo(event.key === 'Home' ? props.min : props.max)
    return
  }
  const direction = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[event.key] as 1 | -1 | undefined
  if (direction === undefined) return
  event.preventDefault()
  change(direction)
}

const BUTTON = { md: 'size-11', lg: 'size-14' }
const VALUE = { md: 'min-w-11 text-[28px]', lg: 'min-w-[90px] text-[72px]' }
</script>

<template>
  <div
    role="group"
    :aria-label="label"
    class="flex items-center gap-2.5"
  >
    <button
      type="button"
      :aria-label="t('stepper.number.less', { label })"
      :aria-disabled="atMin ? 'true' : undefined"
      :aria-describedby="atMin && minText ? minId : undefined"
      :title="atMin ? minText : undefined"
      class="grid flex-none place-items-center rounded-pill border-(length:--cp-bw) border-line bg-surface shadow-sm lift focus-visible:focus-ring aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0"
      :class="BUTTON[size]"
      @click="change(-1)"
    >
      <AppIcon
        :icon="Minus"
        :size="size === 'lg' ? 20 : 16"
      />
    </button>
    <span
      v-if="atMin && minText"
      :id="minId"
      class="sr-only"
    >{{ minText }}</span>
    <output
      role="spinbutton"
      :tabindex="lockedReason ? -1 : 0"
      :aria-label="label"
      :aria-valuenow="modelValue"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-valuetext="unit ? `${modelValue} ${unit}` : undefined"
      :aria-disabled="lockedReason ? 'true' : undefined"
      :aria-describedby="describedBy"
      class="inline-flex items-center justify-center rounded-xl text-center font-num leading-none focus-visible:focus-ring"
      :class="VALUE[size]"
      @keydown="onKeydown"
    >
      <span
        :key="modelValue"
        class="animate-tick"
      >{{ modelValue }}</span>
    </output>
    <span
      v-if="unit"
      class="text-small font-bold text-ink-2"
    >{{ unit }}</span>
    <button
      type="button"
      :aria-label="t('stepper.number.more', { label })"
      :aria-disabled="atMax ? 'true' : undefined"
      :aria-describedby="atMax && maxText ? maxId : undefined"
      :title="atMax ? maxText : undefined"
      class="grid flex-none place-items-center rounded-pill border-(length:--cp-bw) border-line bg-surface shadow-sm lift focus-visible:focus-ring aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0"
      :class="BUTTON[size]"
      @click="change(1)"
    >
      <AppIcon
        :icon="Plus"
        :size="size === 'lg' ? 20 : 16"
      />
    </button>
    <span
      v-if="atMax && maxText"
      :id="maxId"
      class="sr-only"
    >{{ maxText }}</span>
  </div>
</template>
