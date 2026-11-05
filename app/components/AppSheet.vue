<script setup lang="ts">
import { X } from '@lucide/vue'

// A sheet that slides in from the right on desktop and from the bottom on phones
// (02-components § Sheet). Esc, the overlay and the close button close it; focus returns to the
// trigger. Motion collapses to a fade when reduced motion is on. `full` (#273, the result sheet) fills the screen on a phone: no handle bar,
// no rounded corners, the whole height; from md up it is the same side sheet.
const props = defineProps<{
  open: boolean
  title: string
  full?: boolean
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
        class="animate-enter relative flex flex-col gap-4 overflow-y-auto border-line bg-surface p-5 text-ink shadow-modal max-md:w-full max-md:border-t-(length:--cp-bw) md:h-full md:w-[400px] md:max-w-full md:border-l-(length:--cp-bw)"
        :class="full ? 'max-md:h-full max-md:max-h-none max-md:rounded-none' : 'max-md:max-h-[76%] max-md:rounded-t-[24px]'"
        @keydown="onKeydown"
      >
        <span
          v-if="!full"
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
        <!-- The footer sticks to the bottom of the sheet while the content scrolls above it (#218). -Mx-5 and -mb-5 take it to the
             sheet's edges, where its own padding puts the content back, so it is flush whether it sticks or follows the content. -->
        <footer
          v-if="$slots.footer"
          class="sticky -bottom-5 layer-sticky mt-auto -mx-5 -mb-5 border-t-(length:--cp-bw) border-line bg-surface px-5 pt-3 pb-5"
        >
          <slot name="footer" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>
