<script setup lang="ts">
import { X } from '@lucide/vue'

// A sheet that slides in from the right on desktop and from the bottom on phones
// (02-components § Sheet). Esc, the overlay and the close button close it; focus returns to the
// trigger. Motion collapses to a fade when reduced motion is on.
const props = defineProps<{
  open: boolean
  title: string
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const panel = useTemplateRef<HTMLElement>('panel')
const titleId = useId()
const { onKeydown } = useDialog(toRef(props, 'open'), panel, () => emit('close'))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 layer-modal flex max-md:items-end md:justify-end"
    >
      <div
        class="absolute inset-0 animate-enter bg-overlay"
        aria-hidden="true"
        @click="emit('close')"
      />
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Escape and the focus trap of the dialog -->
      <section
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="animate-enter relative flex flex-col gap-4 overflow-y-auto border-line bg-surface p-5 text-ink shadow-modal max-md:max-h-[76%] max-md:w-full max-md:rounded-t-[24px] max-md:border-t-(length:--cp-bw) md:h-full md:w-[400px] md:max-w-full md:border-l-(length:--cp-bw)"
        @keydown="onKeydown"
      >
        <span
          class="mx-auto h-1.5 w-10 flex-none rounded-pill bg-line-soft md:hidden"
          aria-hidden="true"
        />
        <header class="flex items-center gap-3">
          <h2
            :id="titleId"
            class="m-0 flex-1 font-display text-[26px] leading-none font-normal"
          >
            {{ title }}
          </h2>
          <IconButton
            :icon="X"
            :label="t('common.close')"
            @click="emit('close')"
          />
        </header>
        <slot />
        <footer v-if="$slots.footer">
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
