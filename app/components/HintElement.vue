<script setup lang="ts">
import { CircleHelp } from '@lucide/vue'
import { placeNotePopover } from '~/utils/note-popover'

// The hint element (#515, 02-components § HintElement): a small round „?“ that opens a popover with a short text or its slot. A click
// toggles it; Esc, a press outside, a scroll that would move the popover away from its button and a resize close it. Esc and a press
// outside return the focus to the button; a scroll or a resize leave it where it was, so the field the Host types in keeps it and the
// page does not jump to the „?“ (#573). A popover at every width (no sheet: the text is short), in the look and on the layer of the Notes popover
// (GameNotesButton), placed by placeNotePopover so it stays inside the window (#494). One root element, so the caller's class (where it
// sits, on which pointers it shows: #465) lands on it.
const props = withDefaults(defineProps<{
  /** The button's accessible name; „Hinweis anzeigen“ when left out. */
  label?: string
  /** The short text; a default slot replaces it. */
  text?: string
  /** The button's visual diameter. */
  size?: 32 | 36 | 40
}>(), { label: undefined, text: undefined, size: 32 })

const { t } = useI18n()
const popoverId = useId()
const open = ref(false)
// Null until the drawn popover is measured: it stays hidden so long, as the Note popover does.
const placed = ref<{ top: number, left: number, maxHeight?: number } | null>(null)
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger')
const popover = useTemplateRef<HTMLElement>('popover')

function place() {
  const cell = trigger.value?.$el.getBoundingClientRect()
  const box = popover.value?.getBoundingClientRect()
  if (!cell || !box) return
  const { top, left, maxHeight } = placeNotePopover({
    cell,
    size: { width: box.width, height: box.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  })
  placed.value = { top, left, maxHeight }
}

function close(returnFocus = true) {
  open.value = false
  if (returnFocus) trigger.value?.$el.focus()
}

// The focus stays on the button: the popover holds no control.
watch(open, async (isOpen) => {
  placed.value = null
  if (!isOpen) return
  await nextTick()
  place()
})

// On the document and in the capture phase: the game form lives in a sheet whose own Esc closes the sheet, so Esc stops here and closes
// only the hint. And a click on the popover's text moves the focus to the body, where a handler on the button would miss the key.
function onDocumentKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  close()
}

// The button is left out: its own click toggles, so a press on it would close here and reopen on the click.
function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (popover.value?.contains(target) || trigger.value?.$el.contains(target)) return
  close()
}

// The popover is fixed, so a scroll of the page or of a sheet would leave it floating beside nothing: it closes instead. A scroll inside
// the popover itself (a long slot) is its own.
function onScroll(event: Event) {
  if (!open.value) return
  if (popover.value?.contains(event.target as Node)) return
  close(false)
}

function onResize() {
  if (open.value) close(false)
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown, { capture: true })
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown, { capture: true })
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('scroll', onScroll, { capture: true })
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <span class="inline-flex">
    <IconButton
      ref="trigger"
      :icon="CircleHelp"
      :label="props.label ?? t('hint.open')"
      :size="size"
      :aria-expanded="open"
      :aria-controls="open ? popoverId : undefined"
      @click="open ? close() : open = true"
    />
    <Teleport to="body">
      <div
        v-if="open"
        :id="popoverId"
        ref="popover"
        role="note"
        class="animate-enter layer-popover fixed max-h-[min(60vh,420px)] w-max max-w-72 overflow-y-auto rounded-[18px] border-(length:--cp-bw) border-line bg-surface p-3 text-[14px] leading-[1.45] text-ink shadow-modal [overflow-wrap:anywhere]"
        :style="{
          top: `${placed?.top ?? 0}px`,
          left: `${placed?.left ?? 0}px`,
          maxHeight: placed?.maxHeight === undefined ? undefined : `${placed.maxHeight}px`,
          visibility: placed ? 'visible' : 'hidden',
        }"
      >
        <slot>{{ text }}</slot>
      </div>
    </Teleport>
  </span>
</template>
