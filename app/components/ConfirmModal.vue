<script setup lang="ts">
import type { Component } from 'vue'

// Short confirmation for consequential but reversible actions (02-components § ConfirmModal). Centred
// on desktop, a bottom sheet on phones. Focus lands on the title; Esc cancels. Used by the date
// confirm (#13) and reschedule (#14) dialogs.
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  icon?: Component
  confirmLabel: string
  cancelLabel?: string
  loading?: boolean
}>(), { icon: undefined, cancelLabel: undefined, loading: false })

const emit = defineEmits<{ confirm: [], cancel: [] }>()

const { t } = useI18n()
const panel = useTemplateRef<HTMLElement>('panel')
const titleId = useId()
const { onKeydown } = useDialog(toRef(props, 'open'), panel, () => emit('cancel'))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 layer-modal flex items-end justify-center md:items-center md:p-6"
    >
      <div
        class="absolute inset-0 animate-enter bg-overlay"
        aria-hidden="true"
        @click="emit('cancel')"
      />
      <section
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="animate-enter relative flex w-full flex-col gap-4 border-(length:--cp-bw) border-line bg-surface p-5.5 text-ink shadow-modal max-md:rounded-t-[24px] md:max-w-[480px] md:rounded-[20px]"
        @keydown="onKeydown"
      >
        <header class="flex items-center gap-3">
          <span
            v-if="icon"
            class="grid size-12 flex-none place-items-center rounded-pill border-(length:--cp-bw) border-line bg-primary text-on-primary"
            aria-hidden="true"
          >
            <AppIcon
              :icon="icon"
              :size="22"
            />
          </span>
          <h2
            :id="titleId"
            data-autofocus
            tabindex="-1"
            class="m-0 flex-1 font-display text-[28px] leading-none font-normal outline-none"
          >
            {{ title }}
          </h2>
        </header>
        <div class="text-[14px] text-ink-2">
          <slot />
        </div>
        <slot name="summary" />
        <div class="flex flex-col gap-2 sm:flex-row">
          <AppButton
            size="lg"
            class="w-full"
            :aria-disabled="loading ? 'true' : undefined"
            @click="!loading && emit('confirm')"
          >
            {{ loading ? t('common.saving') : confirmLabel }}
          </AppButton>
          <button
            type="button"
            class="hit-44 mx-auto rounded-md px-3 font-bold underline-offset-4 hover:underline"
            @click="emit('cancel')"
          >
            {{ cancelLabel ?? t('common.cancel') }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
