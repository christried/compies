<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

// One primary per view. MVP covers the variants and sizes the shell needs;
// disabled-with-reason is aria-disabled (still focusable, reason linked via aria-describedby).
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary'
  size?: 'md' | 'lg' | 'xl'
  /** Renders a NuxtLink instead of a button. */
  to?: RouteLocationRaw
}>(), { variant: 'primary', size: 'md', to: undefined })

const NuxtLink = resolveComponent('NuxtLink')

// No 36 px size: it would fall under the 44 px hit-target rule. xl = sign-in buttons.
const SIZE = { md: 'h-control-md px-4 text-small', lg: 'h-control-lg px-5 text-body', xl: 'h-14 px-6 text-[16px]' }
const VARIANT = {
  primary: 'bg-primary text-on-primary font-extrabold',
  secondary: 'bg-surface text-ink font-bold',
}
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="outline-memphis inline-flex items-center justify-center gap-2 rounded-pill shadow-btn whitespace-nowrap no-underline transition-[translate,box-shadow] dur-instant ease-snap hover:-translate-y-0.5 hover:shadow-card active:translate-1 active:shadow-none reduced:transition-colors reduced:hover:translate-y-0 reduced:hover:tint reduced:active:translate-0 motion-reduce:transition-colors motion-reduce:hover:translate-y-0 motion-reduce:hover:tint motion-reduce:active:translate-0 disabled:pointer-events-none aria-disabled:border-dashed aria-disabled:border-ink-3 aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none aria-disabled:hover:translate-y-0 aria-disabled:hover:shadow-none aria-disabled:hover:bg-none aria-disabled:active:translate-0"
    :class="[SIZE[size], VARIANT[variant]]"
  >
    <slot name="icon" />
    <slot />
  </component>
</template>
