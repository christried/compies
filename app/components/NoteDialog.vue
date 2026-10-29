<script setup lang="ts">
import { X } from '@lucide/vue'
import type { VoteValue } from '~~/shared/poll'

// The Note of a matrix cell for touch (02-components § NoteDialog, Footer und Anmerkungen 4a): a small centred
// dialog, since a tap has no hover. Focus lands on „Schließen“; Esc, the ✗ and a tap outside close it and focus
// goes back to the cell.
const props = defineProps<{
  open: boolean
  name: string
  image: string | null
  value: VoteValue
  note: string
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
      class="fixed inset-0 layer-modal flex items-center justify-center p-6"
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
        class="relative w-full max-w-[320px] animate-enter rounded-[20px] border-(length:--cp-bw) border-line bg-surface pt-3.5 pr-3 pb-5 pl-[18px] text-ink shadow-modal"
        @keydown="onKeydown"
      >
        <header class="flex items-center gap-3">
          <UserAvatar
            :name="name"
            :image="image"
            :size="32"
          />
          <h2
            :id="titleId"
            class="m-0 min-w-0 flex-1 truncate font-display text-[26px] leading-none font-normal"
          >
            {{ name }}
          </h2>
          <IconButton
            :icon="X"
            :label="t('common.close')"
            data-autofocus
            @click="emit('close')"
          />
        </header>
        <NoteVoteChip
          :value="value"
          large
          class="mt-3"
        />
        <p class="m-0 mt-2.5 text-[16px] leading-[1.4] font-semibold text-pretty break-words">
          {{ note }}
        </p>
      </section>
    </div>
  </Teleport>
</template>
