<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

// One primary per view. MVP covers the variants and sizes the shell needs;
// loading and disabled-with-reason arrive with the first form (M2).
withDefaults(defineProps<{
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  /** Renders a NuxtLink instead of a button. */
  to?: RouteLocationRaw
}>(), { variant: 'primary', size: 'md', to: undefined })

const NuxtLink = resolveComponent('NuxtLink')

const SIZE = { sm: 'h-control-sm px-3.5 text-small', md: 'h-control-md px-4 text-small', lg: 'h-control-lg px-5 text-body' }
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
    class="outline-memphis inline-flex items-center justify-center gap-2 rounded-pill shadow-btn whitespace-nowrap no-underline transition-[translate,box-shadow] dur-instant ease-snap hover:-translate-y-0.5 hover:shadow-card active:translate-1 active:shadow-none reduced:transition-colors reduced:hover:translate-y-0 reduced:active:translate-0 motion-reduce:transition-colors motion-reduce:hover:translate-y-0 motion-reduce:active:translate-0"
    :class="[SIZE[size], VARIANT[variant]]"
  >
    <slot name="icon" />
    <slot />
  </component>
</template>
