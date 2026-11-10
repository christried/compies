<script setup lang="ts">
import { NotebookText, X } from '@lucide/vue'
import { MD_QUERY } from '~/composables/useMediaQuery'
import { placeNotePopover } from '~/utils/note-popover'

// The Notes of a game in a picker (#436, 02-components § GameCard, deviation 0.12): a Notes button that opens the game's notes read-only,
// line breaks kept. From md up a popover beside the button, below it a sheet from the bottom (the pattern of the Sessions card's „Mehr“,
// #349). It is not a menu: MoveToMenu holds menu targets, so it stays out. Esc, a press outside and a scroll that would move the popover
// away from its button close it; the focus goes back to the button. No notes, no button. The popover sits where placeNotePopover puts it
// (above or below the button, inside the window), measured once it is drawn (#488).
withDefaults(defineProps<{
  name: string
  notes: string | null
  /** The button's visual diameter: the picker's rows are 36, its cards 40. */
  size?: 36 | 40
}>(), { size: 40 })

const { t } = useI18n()
const wide = useMediaQuery(MD_QUERY)
const narrow = computed(() => wide.value === false)
const titleId = useId()
const open = ref(false)
const position = ref({ top: 0, left: 0 })
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger')
const popover = useTemplateRef<HTMLElement>('popover')
const closeButton = useTemplateRef<{ $el: HTMLElement }>('close')

function show() {
  open.value = true
}

// Measured once drawn, before the focus moves into it and before the browser paints.
function place() {
  const cell = trigger.value?.$el.getBoundingClientRect()
  const box = popover.value?.getBoundingClientRect()
  if (!cell || !box) return
  const { top, left } = placeNotePopover({
    cell,
    size: { width: box.width, height: box.height },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  })
  position.value = { top, left }
}

function close() {
  open.value = false
  trigger.value?.$el.focus()
}

watch(open, async (isOpen) => {
  if (!isOpen || narrow.value) return
  await nextTick()
  place()
  closeButton.value?.$el.focus({ preventScroll: true })
})

// A pointer down outside the popover and its button closes it; a sheet has its own overlay for that.
function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value || narrow.value) return
  const target = event.target as Node
  if (popover.value?.contains(target) || trigger.value?.$el.contains(target)) return
  close()
}

// The popover is fixed, so a scroll of the page or of the picker's sheet would leave it floating beside nothing: it closes instead. A
// scroll inside the popover itself (its long notes) is its own.
function onScroll(event: Event) {
  if (!open.value || narrow.value) return
  if (popover.value?.contains(event.target as Node)) return
  close()
}

watch(wide, () => {
  if (open.value) close()
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  window.addEventListener('scroll', onScroll, { capture: true, passive: true })
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('scroll', onScroll, { capture: true })
})
</script>

<template>
  <template v-if="notes?.trim()">
    <IconButton
      ref="trigger"
      :icon="NotebookText"
      :label="t('gameNotes.open')"
      :size="size"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="open ? close() : show()"
    />
    <AppSheet
      v-if="narrow"
      :open="open"
      :title="name"
      @close="close"
    >
      <p class="m-0 text-[14px] leading-[1.45] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {{ notes }}
      </p>
    </AppSheet>
    <Teleport
      v-else
      to="body"
    >
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Escape closes the popover -->
      <div
        v-if="open"
        ref="popover"
        role="dialog"
        :aria-labelledby="titleId"
        class="animate-enter layer-popover fixed flex max-h-[min(60vh,420px)] w-72 flex-col gap-2 overflow-y-auto rounded-[18px] border-(length:--cp-bw) border-line bg-surface p-3 text-ink shadow-modal"
        :style="{ top: `${position.top}px`, left: `${position.left}px` }"
        @keydown.esc.stop="close"
      >
        <header class="flex items-start gap-2">
          <h2
            :id="titleId"
            class="m-0 flex-1 font-display text-[18px] leading-tight font-normal [overflow-wrap:anywhere]"
          >
            {{ name }}
          </h2>
          <IconButton
            ref="close"
            :icon="X"
            :label="t('common.close')"
            :size="32"
            @click="close"
          />
        </header>
        <p class="m-0 text-[14px] leading-[1.45] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
          {{ notes }}
        </p>
      </div>
    </Teleport>
  </template>
</template>
