<script setup lang="ts">
import { placeNotePopover } from '~/utils/note-popover'

// The box of a revealed popover (#616, 02-components § RevealPopover): teleported to the body, in the look and on the layer of the Notes
// popover (GameNotesButton), placed by placeNotePopover so it stays inside the window (#494). It knows no trigger behaviour: the caller binds
// useRevealPopover's `popoverAttrs` (id, the hover handlers) and gives it the trigger's element as `anchor`. A popover at every width (no
// sheet: the content is short).
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  open: boolean
  /** The trigger's element, the box sits above or below it. */
  anchor: HTMLElement | null
}>()

// Null until the drawn popover is measured: it stays hidden so long, as the Note popover does.
const placed = ref<{ top: number, left: number, maxHeight?: number } | null>(null)
const box = useTemplateRef<HTMLElement>('box')

function place() {
  const cell = props.anchor?.getBoundingClientRect()
  const size = box.value?.getBoundingClientRect()
  if (!cell || !size) return
  const { top, left, maxHeight } = placeNotePopover({
    cell,
    size: { width: size.width, height: size.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  })
  placed.value = { top, left, maxHeight }
}

watch(() => props.open, async (isOpen) => {
  placed.value = null
  if (!isOpen) return
  await nextTick()
  place()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      v-bind="$attrs"
      ref="box"
      role="note"
      class="animate-enter layer-popover fixed max-h-[min(60vh,420px)] w-max max-w-72 overflow-y-auto rounded-[18px] border-(length:--cp-bw) border-line bg-surface p-3 text-[14px] leading-[1.45] text-ink shadow-modal [overflow-wrap:anywhere]"
      :style="{
        top: `${placed?.top ?? 0}px`,
        left: `${placed?.left ?? 0}px`,
        maxHeight: placed?.maxHeight === undefined ? undefined : `${placed.maxHeight}px`,
        visibility: placed ? 'visible' : 'hidden',
      }"
    >
      <slot />
    </div>
  </Teleport>
</template>
