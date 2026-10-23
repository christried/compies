<script setup lang="ts">
import type { Component } from 'vue'
import { Check } from '@lucide/vue'

// Hold to confirm (02-components § HoldToConfirmButton, handoff 1 s). For irreversible actions:
// the User holds the button, or Space/Enter, for one second. Releasing early does nothing. The fill
// is information, so reduced motion keeps it and only drops the button's press scale.
// Once confirmed it stays in the done state; the parent removes or replaces it.
const props = withDefaults(defineProps<{
  label: string
  holdingLabel?: string
  doneLabel?: string
  /** Hold time in milliseconds. */
  duration?: number
  /** `secondary` is for a hold next to a primary action (#14 "Neue Terminsuche"). */
  variant?: 'hot' | 'primary' | 'secondary'
  disabled?: boolean
  /** Shown with aria-describedby when disabled. */
  disabledReason?: string
  icon?: Component
}>(), {
  holdingLabel: undefined,
  doneLabel: undefined,
  duration: 1000,
  variant: 'primary',
  disabled: false,
  disabledReason: undefined,
  icon: undefined,
})

const emit = defineEmits<{ confirm: [] }>()

const { t } = useI18n()
const holding = ref(false)
const done = ref(false)
const announcement = ref('')
const reasonId = useId()
let timer: ReturnType<typeof setTimeout> | undefined

function start() {
  if (props.disabled || done.value || timer !== undefined) return
  holding.value = true
  timer = setTimeout(complete, props.duration)
}

function cancel() {
  if (timer === undefined) return
  clearTimeout(timer)
  timer = undefined
  holding.value = false
}

function complete() {
  timer = undefined
  holding.value = false
  done.value = true
  announcement.value = props.doneLabel ?? props.label
  emit('confirm')
}

function onPointerDown(event: PointerEvent) {
  // Only the main button starts a hold; undefined (synthetic events) counts as main.
  if (event.button > 0) return
  start()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== ' ' && event.key !== 'Enter') return
  // Stops the native click, so a key press never confirms by itself.
  event.preventDefault()
  if (!event.repeat) start()
}

function onKeyup(event: KeyboardEvent) {
  if (event.key !== ' ' && event.key !== 'Enter') return
  event.preventDefault()
  cancel()
}

const visibleLabel = computed(() => {
  if (done.value) return props.doneLabel ?? props.label
  if (holding.value) return props.holdingLabel ?? props.label
  return props.label
})
</script>

<template>
  <div class="flex flex-col items-center gap-1.5">
    <button
      type="button"
      class="outline-memphis hit-44 relative inline-flex h-control-lg cursor-pointer touch-none items-center justify-center gap-2 overflow-hidden rounded-pill border-(length:--cp-bw) border-line px-5 font-extrabold whitespace-nowrap shadow-btn transition-[transform,translate,box-shadow] dur-instant ease-snap select-none hover:-translate-y-0.5 hover:shadow-card reduced:hover:translate-y-0 reduced:hover:tint motion-reduce:hover:translate-y-0 motion-reduce:hover:tint active:scale-[0.97] reduced:active:scale-100 motion-reduce:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:hover:bg-none"
      :class="{ 'bg-hot text-ink': variant === 'hot', 'bg-primary text-on-primary': variant === 'primary', 'bg-surface text-ink': variant === 'secondary' }"
      :aria-disabled="disabled ? 'true' : undefined"
      :aria-describedby="disabled && disabledReason ? reasonId : undefined"
      @pointerdown="onPointerDown"
      @pointerup="cancel"
      @pointerleave="cancel"
      @pointercancel="cancel"
      @keydown="onKeydown"
      @keyup="onKeyup"
      @blur="cancel"
    >
      <span
        aria-hidden="true"
        class="absolute inset-0 origin-left bg-ink/25"
        :style="{
          transform: holding || done ? 'scaleX(1)' : 'scaleX(0)',
          transitionProperty: 'transform',
          transitionDuration: holding ? `${duration}ms` : 'var(--cp-dur-base)',
          transitionTimingFunction: holding ? 'var(--cp-ease-linear)' : 'var(--cp-ease-out)',
        }"
      />
      <span class="relative flex items-center gap-2">
        <AppIcon
          v-if="done"
          :icon="Check"
          :size="18"
        />
        <AppIcon
          v-else-if="icon"
          :icon="icon"
          :size="18"
        />
        {{ visibleLabel }}
      </span>
    </button>
    <span
      v-if="!disabled"
      class="px-1 text-center text-[12px] text-ink-2"
    >{{ t('common.holdFor1s') }}</span>
    <span
      v-if="disabled && disabledReason"
      :id="reasonId"
      class="px-1 text-center text-[12px] font-bold text-ink-2"
    >{{ disabledReason }}</span>
    <span
      role="status"
      class="sr-only"
    >{{ announcement }}</span>
  </div>
</template>
