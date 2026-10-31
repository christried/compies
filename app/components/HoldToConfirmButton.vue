<script setup lang="ts">
import type { Component } from 'vue'
import { Check } from '@lucide/vue'

// Hold to confirm (02-components § HoldToConfirmButton, handoff 1 s). For irreversible actions:
// the User holds the button, or Space/Enter, for one second. Releasing early does nothing. The fill
// is information, so reduced motion keeps it and only drops the button's press scale.
// With an `action`, the button runs it after the hold and keeps the fill while it runs: it shows done when the
// action resolves to true and goes back to idle on false, so a refused request can be held again (#74). Without
// one, it is done at once and the parent acts on `confirm`.
// The hint „1 Sekunde halten“ is a line below the button, or with `hint="badge"` a small „1 s halten“ badge inside it
// (the HostDock, #164); the badge is hidden from screen readers, which hear the full hint through aria-describedby.
const props = withDefaults(defineProps<{
  label: string
  holdingLabel?: string
  doneLabel?: string
  /** Hold time in milliseconds. */
  duration?: number
  /** `secondary` is for a hold next to a primary action (#14 "Neue Terminsuche"). */
  variant?: 'hot' | 'primary' | 'secondary'
  /** card = 48 px, the buttons of a Session card (#55, #49: same text as its siblings); lg = 52 px; dock = 44 px, the HostDock pill's buttons; row = a 56 px row of the phone sheet (#164). */
  size?: 'card' | 'lg' | 'dock' | 'row'
  /** Where the hint „1 Sekunde halten“ shows: a line `below` the button, or a `badge` inside it (#164). */
  hint?: 'below' | 'badge'
  /** Full width, label and icon left-aligned (the badge goes to the end). */
  block?: boolean
  disabled?: boolean
  /** Shown with aria-describedby when disabled. */
  disabledReason?: string
  icon?: Component
  /** Runs after the hold; resolves to whether it worked (e.g. the server took it). */
  action?: () => Promise<boolean>
}>(), {
  holdingLabel: undefined,
  doneLabel: undefined,
  duration: 1000,
  variant: 'primary',
  size: 'lg',
  hint: 'below',
  block: false,
  disabled: false,
  disabledReason: undefined,
  icon: undefined,
  action: undefined,
})

const emit = defineEmits<{ confirm: [] }>()

const { t } = useI18n()
const holding = ref(false)
/** The action is running: the fill stays full and a new hold waits. */
const running = ref(false)
const done = ref(false)
const announcement = ref('')
const reasonId = useId()
const hintId = useId()
let timer: ReturnType<typeof setTimeout> | undefined

function start() {
  if (props.disabled || running.value || done.value || timer !== undefined) return
  holding.value = true
  timer = setTimeout(complete, props.duration)
}

function cancel() {
  if (timer === undefined) return
  clearTimeout(timer)
  timer = undefined
  holding.value = false
}

async function complete() {
  timer = undefined
  holding.value = false
  emit('confirm')
  let worked = true
  if (props.action) {
    running.value = true
    try {
      worked = await props.action()
    }
    finally {
      running.value = false
    }
  }
  if (!worked) return
  done.value = true
  announcement.value = props.doneLabel ?? props.label
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
  if (holding.value || running.value) return props.holdingLabel ?? props.label
  return props.label
})
</script>

<template>
  <div
    class="flex flex-col items-center gap-1.5"
    :class="{ 'w-full': block }"
  >
    <button
      type="button"
      class="outline-memphis hit-44 relative inline-flex cursor-pointer touch-none items-center justify-center gap-2 overflow-hidden rounded-pill border-(length:--cp-bw) border-line whitespace-nowrap shadow-btn transition-[transform,translate,box-shadow] dur-instant ease-snap select-none hover:-translate-y-0.5 hover:shadow-card reduced:hover:translate-y-0 reduced:hover:tint motion-reduce:hover:translate-y-0 motion-reduce:hover:tint active:scale-[0.97] reduced:active:scale-100 motion-reduce:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:hover:bg-none"
      :class="{ 'bg-hot text-ink': variant === 'hot', 'bg-primary text-on-primary': variant === 'primary', 'bg-surface text-ink': variant === 'secondary', 'h-12 px-5 text-body font-bold': size === 'card', 'h-control-lg px-5 font-extrabold': size === 'lg', 'h-11 px-4 text-[14px] font-bold': size === 'dock', 'min-h-14 px-5 text-body font-bold': size === 'row', 'w-full justify-start': block }"
      :aria-disabled="disabled ? 'true' : undefined"
      :aria-describedby="disabled && disabledReason ? reasonId : (!disabled && hint === 'badge' ? hintId : undefined)"
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
          transform: holding || running || done ? 'scaleX(1)' : 'scaleX(0)',
          transitionProperty: 'transform',
          transitionDuration: holding ? `${duration}ms` : 'var(--cp-dur-base)',
          transitionTimingFunction: holding ? 'var(--cp-ease-linear)' : 'var(--cp-ease-out)',
        }"
      />
      <span
        class="relative flex items-center gap-2"
        :class="{ 'w-full': block }"
      >
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
        <span
          v-if="hint === 'badge' && !disabled"
          aria-hidden="true"
          class="rounded-[6px] border-[1.5px] border-current px-1.5 py-px text-[11px] font-extrabold"
          :class="block ? 'ml-auto' : ''"
        >{{ t('common.holdBadge') }}</span>
      </span>
    </button>
    <span
      v-if="!disabled && hint === 'below'"
      class="px-1 text-center text-[12px] text-ink-2"
    >{{ t('common.holdFor1s') }}</span>
    <span
      v-if="!disabled && hint === 'badge'"
      :id="hintId"
      class="sr-only"
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
