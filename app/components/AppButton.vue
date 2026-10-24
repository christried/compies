<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

// One primary per view. MVP covers the variants and sizes the shell needs;
// disabled-with-reason is aria-disabled (still focusable, reason linked via aria-describedby).
const props = withDefaults(defineProps<{
  variant?: 'primary' | 'secondary'
  /** card = 48 px, the buttons of the Event page's Session cards and its calendar and invite row (#49). */
  size?: 'md' | 'card' | 'lg' | 'xl'
  /** Renders a NuxtLink instead of a button. */
  to?: RouteLocationRaw
}>(), { variant: 'primary', size: 'md', to: undefined })

const NuxtLink = resolveComponent('NuxtLink')

// No 36 px size: it would fall under the 44 px hit-target rule. xl = sign-in buttons. The card size is one
// set with its siblings on a Session card (#49): same text size and weight whatever the variant.
const SIZE = { md: 'h-control-md px-4 text-small', card: 'h-12 px-4.5 text-body', lg: 'h-control-lg px-5 text-body', xl: 'h-14 px-6 text-[16px]' }
const VARIANT = {
  primary: 'bg-primary text-on-primary',
  secondary: 'bg-surface text-ink',
}

// Primary weighs 800 except on a card, where it matches the secondary 700.
const weight = computed(() => (props.variant === 'primary' && props.size !== 'card' ? 'font-extrabold' : 'font-bold'))
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="outline-memphis inline-flex items-center justify-center gap-2 rounded-pill shadow-btn whitespace-nowrap no-underline lift reduced:transition-colors reduced:active:translate-0 motion-reduce:transition-colors motion-reduce:active:translate-0 disabled:pointer-events-none aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:hover:bg-none aria-disabled:active:translate-0"
    :class="[SIZE[size], VARIANT[variant], weight]"
  >
    <slot name="icon" />
    <slot />
  </component>
</template>
