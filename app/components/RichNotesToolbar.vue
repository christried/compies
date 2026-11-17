<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { Bold, Heading, Italic, Link, List, ListOrdered } from '@lucide/vue'
import type { Component } from 'vue'
import { noteShortcutLabel } from '~/utils/notes-editor'
import { isApplePlatform } from '~/utils/platform'

// The formatting toolbar of the notes editor (#454, 18-notizen § NoteToolbar): inside the field's border, always visible, one tab stop with the arrow keys
// moving between its buttons (roving tabindex). A button's mousedown is prevented, so the text selection survives a click. Its buttons are `type="button"`:
// the toolbar sits in the game form, and a click here must not submit it. Responsive by container query on the toolbar's own width.
const props = defineProps<{
  editor: Editor
  /** The id of the content the toolbar controls. */
  controls: string
  /** The field is disabled (a save runs). */
  disabled: boolean
  /** The link control is open: the Link button says so and wears its pressed look. */
  linkOpen: boolean
}>()

const emit = defineEmits<{ openLink: [] }>()

const { t } = useI18n()
const apple = isApplePlatform(typeof navigator === 'undefined' ? '' : navigator.userAgent)

type Key = 'bold' | 'italic' | 'heading' | 'bulletList' | 'orderedList' | 'link'
interface ToolbarButton { key: Key, label: string, icon: Component, shortcut?: string }

const groups: ToolbarButton[][] = [
  [
    { key: 'bold', label: t('notesEditor.bold'), icon: Bold, shortcut: 'B' },
    { key: 'italic', label: t('notesEditor.italic'), icon: Italic, shortcut: 'I' },
  ],
  [{ key: 'heading', label: t('notesEditor.heading'), icon: Heading }],
  [
    { key: 'bulletList', label: t('notesEditor.bulletList'), icon: List },
    { key: 'orderedList', label: t('notesEditor.orderedList'), icon: ListOrdered },
  ],
  [{ key: 'link', label: t('notesEditor.link'), icon: Link, shortcut: 'K' }],
]
const order = groups.flat().map(button => button.key)

// The editor's state is read again after each transaction (a selection move included): the buttons' pressed look follows the caret.
const revision = ref(0)
const refresh = () => void revision.value++
props.editor.on('transaction', refresh)
onBeforeUnmount(() => props.editor.off('transaction', refresh))

const active = computed(() => {
  void revision.value
  const { editor } = props
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    heading: editor.isActive('heading'),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    link: editor.isActive('link'),
  }
})
// Bold is off in a heading: Lilita has one weight. The button stays focusable and its tooltip says why.
const unavailable = (key: Key) => props.disabled || (key === 'bold' && active.value.heading)

function run(key: Key) {
  if (unavailable(key)) return
  const { editor } = props
  if (key === 'link') return emit('openLink')
  const chain = editor.chain().focus()
  if (key === 'bold') chain.toggleBold()
  else if (key === 'italic') chain.toggleItalic()
  else if (key === 'heading') {
    // An item of a list is lifted out first: the list item holds paragraphs only.
    if (active.value.heading) chain.setParagraph()
    else if (editor.isActive('listItem')) chain.liftListItem('listItem').setNode('heading', { level: 3 })
    else chain.setNode('heading', { level: 3 })
  }
  else {
    // A heading cannot sit in a list item either: it becomes a paragraph on the way in.
    if (active.value.heading) chain.setParagraph()
    chain[key === 'bulletList' ? 'toggleBulletList' : 'toggleOrderedList']()
  }
  chain.run()
}

// Roving tabindex: the button that was reached last is the tab stop.
const stop = ref<Key>('bold')
const buttons = useTemplateRef<HTMLButtonElement[]>('buttons')

function onKeydown(event: KeyboardEvent) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const at = order.indexOf(stop.value)
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? order.length - 1
      : (at + (event.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length
  stop.value = order[next]!
  buttons.value?.[next]?.focus()
}
</script>

<template>
  <div class="@container">
    <!-- eslint-disable-next-line vuejs-accessibility/interactive-supports-focus, vuejs-accessibility/no-static-element-interactions -- the buttons inside carry the focus (roving tabindex); the arrow keys move it -->
    <div
      role="toolbar"
      :aria-label="t('notesEditor.toolbar')"
      :aria-controls="controls"
      class="flex flex-wrap items-center rounded-t-[9px] border-b-2 border-line-soft p-1"
      :class="disabled ? 'bg-paper-2' : 'bg-surface'"
      @keydown="onKeydown"
    >
      <div
        v-for="(group, groupIndex) in groups"
        :key="groupIndex"
        role="group"
        class="flex items-center"
      >
        <span
          v-if="groupIndex > 0"
          aria-hidden="true"
          class="mx-[3px] h-6 w-0.5 flex-none rounded-[1px] bg-line-soft @max-[296px]:hidden"
        />
        <button
          v-for="button in group"
          :key="button.key"
          ref="buttons"
          type="button"
          class="cp-note-tb relative grid size-11 flex-none place-items-center p-0"
          :class="unavailable(button.key) ? 'text-ink-3' : 'text-ink'"
          :aria-label="button.label"
          :aria-pressed="button.key === 'link' ? undefined : active[button.key]"
          :aria-disabled="unavailable(button.key)"
          :aria-expanded="button.key === 'link' ? linkOpen : undefined"
          :aria-haspopup="button.key === 'link' ? 'dialog' : undefined"
          :aria-keyshortcuts="button.shortcut ? `${apple ? 'Meta' : 'Control'}+${button.shortcut}` : undefined"
          :data-on="button.key === 'link' ? (active.link || linkOpen) : undefined"
          :tabindex="stop === button.key ? 0 : -1"
          @mousedown.prevent
          @focus="stop = button.key"
          @click="run(button.key)"
        >
          <span class="cp-note-tb-square grid size-9 place-items-center rounded-[8px]">
            <AppIcon
              :icon="button.icon"
              :size="20"
            />
          </span>
          <span
            aria-hidden="true"
            class="cp-note-tip"
            :class="{ 'cp-note-tip--end': button.key === 'link' }"
          >
            {{ button.label }}
            <span
              v-if="button.shortcut"
              class="font-mono text-[12px] opacity-80"
            >{{ noteShortcutLabel(button.shortcut, apple) }}</span>
            <span
              v-if="button.key === 'bold' && active.heading"
              class="font-medium opacity-85"
            >· {{ t('notesEditor.boldInHeading') }}</span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* The toolbar buttons (18-notizen § NoteToolbar): a 44 px hit area over a 36 px square; the focus ring sits on the square, so the field never clips it. */
.cp-note-tb {
  outline: none;
}
.cp-note-tb-square {
  transition: background-color var(--cp-dur-instant) var(--cp-ease-snap), color var(--cp-dur-instant) var(--cp-ease-snap);
}
.cp-note-tb:focus-visible .cp-note-tb-square {
  outline: 3px solid var(--cp-focus);
  outline-offset: 0;
}
.cp-note-tb[aria-pressed=true] .cp-note-tb-square,
.cp-note-tb[data-on=true] .cp-note-tb-square {
  background: var(--cp-ink);
  color: var(--cp-paper);
}
@media (hover: hover) {
  .cp-note-tb[aria-disabled=false]:not([aria-pressed=true], [data-on=true]):hover .cp-note-tb-square {
    background: var(--cp-paper-2);
  }
}

/* The tooltip is CSS only: 500 ms after the pointer arrives, at once on keyboard focus, never on touch. Opacity and 4 px; reduced motion keeps the opacity. */
.cp-note-tip {
  position: absolute;
  top: 44px;
  left: 50%;
  --tip-x: -50%;
  z-index: var(--cp-z-popover);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  background: var(--cp-ink);
  color: var(--cp-paper);
  box-shadow: var(--cp-shadow-soft);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(var(--tip-x), 4px);
  transition: opacity var(--cp-dur-instant) var(--cp-ease-in), transform var(--cp-dur-instant) var(--cp-ease-in);
}
/* The last button's tooltip ends at its right edge: centred it would reach past the field and could widen the page on a phone. */
.cp-note-tip--end {
  left: auto;
  right: 0;
  --tip-x: 0px;
}
.cp-note-tb:focus-visible .cp-note-tip {
  opacity: 1;
  transform: translate(var(--tip-x), 0);
  transition: opacity var(--cp-dur-fast) var(--cp-ease-out), transform var(--cp-dur-fast) var(--cp-ease-out);
}
@media (hover: hover) and (pointer: fine) {
  .cp-note-tb:hover .cp-note-tip {
    opacity: 1;
    transform: translate(var(--tip-x), 0);
    transition: opacity var(--cp-dur-fast) var(--cp-ease-out) 500ms, transform var(--cp-dur-fast) var(--cp-ease-out) 500ms;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cp-note-tip { transform: translate(var(--tip-x), 0); }
}
[data-motion=reduced] .cp-note-tip { transform: translate(var(--tip-x), 0); }
</style>
