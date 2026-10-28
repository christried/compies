<script setup lang="ts">
import type { VoteValue } from '~~/shared/poll'
import { placeNotePopover, type NotePopoverPlacement } from '~/utils/note-popover'

// The Note of a matrix cell on hover or keyboard focus (02-components § NotePopover, Footer und Anmerkungen 4a).
// Visual only: the cell's own screen-reader text already says all of it, so it is hidden from the
// accessibility tree. Teleported and fixed, so the matrix's scroll box and the sticky column can't cut it.
const props = defineProps<{
  open: boolean
  anchor: HTMLElement | null
  name: string
  image: string | null
  value: VoteValue
  note: string
}>()

const emit = defineEmits<{ pointerenter: [], pointerleave: [] }>()

const box = useTemplateRef<HTMLElement>('box')
const placed = ref<NotePopoverPlacement | null>(null)
const shown = ref(false)

// Render hidden, measure, then place; the fade starts one frame later so the browser has seen the start state.
function place() {
  const el = box.value
  if (!props.open || !props.anchor || !el) return
  const { width, height } = el.getBoundingClientRect()
  placed.value = placeNotePopover({
    cell: props.anchor.getBoundingClientRect(),
    size: { width, height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  })
  requestAnimationFrame(() => {
    shown.value = true
  })
}

watch(() => [props.open, props.anchor, props.note] as const, ([open]) => {
  placed.value = null
  shown.value = false
  if (open) nextTick(place)
}, { flush: 'post' })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && anchor"
      ref="box"
      aria-hidden="true"
      class="fixed layer-sheet w-[min(280px,calc(100vw-24px))] rounded-[14px] border-(length:--cp-bw) border-line bg-surface px-3.5 pt-3 pb-3.5 text-ink shadow-soft transition-[opacity,translate] dur-fast ease-out"
      :class="[
        !shown && ['opacity-0 motion-reduce:translate-y-0 reduced:translate-y-0', placed?.side === 'below' ? '-translate-y-1' : 'translate-y-1'],
      ]"
      :style="{ top: `${placed?.top ?? 0}px`, left: `${placed?.left ?? 0}px`, visibility: placed ? 'visible' : 'hidden' }"
      @pointerenter="emit('pointerenter')"
      @pointerleave="emit('pointerleave')"
    >
      <span
        v-if="placed"
        class="absolute size-[14px] rotate-45 border-line bg-surface"
        :class="placed.side === 'above' ? '-bottom-[7px] border-r-(length:--cp-bw) border-b-(length:--cp-bw)' : '-top-[7px] border-t-(length:--cp-bw) border-l-(length:--cp-bw)'"
        :style="{ left: `${placed.arrowLeft - 7}px` }"
      />
      <div class="flex items-center gap-2">
        <UserAvatar
          :name="name"
          :image="image"
          :size="24"
        />
        <span class="min-w-0 flex-1 truncate text-[14px] font-extrabold">{{ name }}</span>
        <NoteVoteChip :value="value" />
      </div>
      <p class="m-0 mt-2 text-[14px] leading-[1.4] font-semibold text-pretty break-words">
        „{{ note }}“
      </p>
    </div>
  </Teleport>
</template>
