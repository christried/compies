<script setup lang="ts">
import { Pencil, StickyNote, X } from '@lucide/vue'
import type { RouteLocationRaw } from 'vue-router'
import { MD_QUERY } from '~/composables/useMediaQuery'
import { placeNotePopover } from '~/utils/note-popover'
import type { NotesDoc } from '~~/shared/notes-doc'

// The Notes of a game in a picker (#436, 02-components § GameCard, deviation 0.12): a Notes button that opens the game's notes read-only,
// formatted (#728). From md up a popover beside the button, below it a sheet from the bottom (the pattern of the Sessions card's „Mehr“,
// #349). It is not a menu: MoveToMenu holds menu targets, so it stays out. Esc, a press outside and a scroll that would move the popover
// away from its button close it; the focus goes back to the button. No notes, no button (a document without a visible character is none). The popover sits where placeNotePopover puts it
// (above or below the button, inside the window), measured once it is drawn (#488). When it fits on neither side it is capped to the
// roomier one and scrolls (#494). The button is a sticky note, labelled „Notizen zu {game}“ like the dialog, and wears the ink fill while its notes are open (#837). With `editTo`
// (the library's cards) a footer „Bearbeiten“ leads to the game's form; the pickers give none.
const props = withDefaults(defineProps<{
  name: string
  /** The game's notes as a document (#727); null = none, and then there is no button (a document is never an empty one, parseNotes makes those null). */
  notes: NotesDoc | null
  /** The Host's Event notes of the game (#732, GLOSSARY: Event notes); null = none. A game with only these still has the button. */
  eventNotes?: NotesDoc | null
  /** The button's visual diameter: the picker's rows are 36, its cards 40, the library's covers 32. */
  size?: 32 | 36 | 40
  /** The game's form (#837): with it the popover and the sheet end in a footer „Bearbeiten“; without it they have none. */
  editTo?: RouteLocationRaw
}>(), { size: 40, eventNotes: null, editTo: undefined })

const { t } = useI18n()
const NuxtLink = resolveComponent('NuxtLink')
// The documents to show: null for none or for blank notes, so the template narrows on them. The Event's name and finished state (the Event block's sub and chip, #729)
// are the Event page's context's, read by the pair (#821).
const { doc, eventDoc } = useNotePair(() => props.notes, () => props.eventNotes)
const wide = useMediaQuery(MD_QUERY)
const narrow = computed(() => wide.value === false)
const open = ref(false)
// The footer's link: a text button with the pencil, 44 px high; the text size is the container's (14 in the popover, 15 in the sheet, 18-notizen).
const EDIT_LINK = 'inline-flex h-11 items-center gap-1.5 rounded-pill px-2 font-bold text-ink no-underline hover:tint focus-visible:focus-ring'
const position = ref<{ top: number, left: number, maxHeight?: number, origin?: string }>({ top: 0, left: 0 })
// The body scrolls under a header that stays; a 2 px rule shows under the header once it has (#729). Nothing is kept: it is the scroll position, read.
const scrolled = ref(false)
const trigger = useTemplateRef<{ $el: HTMLElement }>('trigger')
const popover = useTemplateRef<HTMLElement>('popover')
const closeButton = useTemplateRef<{ $el: HTMLElement }>('close')

function show() {
  scrolled.value = false
  open.value = true
}

// Measured once drawn, before the focus moves into it and before the browser paints. The size is the layout size, not the drawn box: the
// opening's scale(.96) (.cp-note-pop) shrinks the box a rect reads, and the clamp must keep the 320 px the popover really has (#824).
function place() {
  const cell = trigger.value?.$el.getBoundingClientRect()
  const pop = popover.value
  if (!cell || !pop) return
  const { top, left, maxHeight, side, arrowLeft } = placeNotePopover({
    cell,
    size: { width: pop.offsetWidth, height: pop.offsetHeight },
    viewport: { width: window.innerWidth, height: window.innerHeight },
  })
  // The opening grows from the corner of the button's side (04-motion § Notizen): the arrow's foot, on the edge facing the button.
  position.value = { top, left, maxHeight, origin: `${arrowLeft}px ${side === 'above' ? '100%' : '0'}` }
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
  <template v-if="doc || eventDoc">
    <IconButton
      ref="trigger"
      :icon="StickyNote"
      :label="t('notes.open_a11y', { game: name })"
      :size="size"
      :expanded="open"
      class="shadow-sm"
      aria-haspopup="dialog"
      @click="open ? close() : show()"
    />
    <AppSheet
      v-if="narrow"
      :open="open"
      :title="name"
      @close="close"
    >
      <GameNotesStack
        :notes="doc"
        :event-notes="eventDoc"
        size="md"
      />
      <template
        v-if="editTo"
        #footer
      >
        <component
          :is="NuxtLink"
          :to="editTo"
          :class="[EDIT_LINK, 'text-[15px]']"
          @click="open = false"
        >
          <AppIcon
            :icon="Pencil"
            :size="16"
          />
          {{ t('library.edit') }}
        </component>
      </template>
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
        :aria-label="t('notes.open_a11y', { game: name })"
        class="cp-note-pop layer-popover fixed flex w-80 flex-col overflow-hidden rounded-[18px] border-(length:--cp-bw) border-line bg-surface text-ink shadow-modal"
        :class="eventDoc && doc ? 'max-h-[min(80vh,520px)]' : 'max-h-[min(70vh,440px)]'"
        :style="{ top: `${position.top}px`, left: `${position.left}px`, maxHeight: position.maxHeight === undefined ? undefined : `${position.maxHeight}px`, transformOrigin: position.origin }"
        @keydown.esc.stop="close"
      >
        <header
          class="flex flex-none items-start gap-2 border-b-2 pt-3 pr-2 pb-2 pl-4"
          :class="scrolled ? 'border-line-soft' : 'border-transparent'"
        >
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-[12px] leading-tight font-bold text-ink-2 [overflow-wrap:anywhere]">{{ name }}</span>
            <h2 class="m-0 font-display text-[22px] leading-tight font-normal">
              {{ t('library.notes') }}
            </h2>
          </div>
          <IconButton
            ref="close"
            :icon="X"
            :label="t('common.close')"
            :size="36"
            @click="close"
          />
        </header>
        <div
          data-notes-body
          class="min-h-0 overflow-y-auto px-4 pt-1 pb-4"
          @scroll.passive="scrolled = ($event.currentTarget as HTMLElement).scrollTop > 0"
        >
          <GameNotesStack
            :notes="doc"
            :event-notes="eventDoc"
            size="sm"
          />
        </div>
        <!-- Outside the scrolling body, so it stays while the text scrolls (#837). -->
        <footer
          v-if="editTo"
          class="flex flex-none border-t-2 border-line-soft px-2 py-0.5"
        >
          <component
            :is="NuxtLink"
            :to="editTo"
            :class="[EDIT_LINK, 'text-[14px]']"
            @click="open = false"
          >
            <AppIcon
              :icon="Pencil"
              :size="16"
            />
            {{ t('library.edit') }}
          </component>
        </footer>
      </div>
    </Teleport>
  </template>
</template>
