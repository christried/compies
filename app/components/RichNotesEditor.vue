<script setup lang="ts">
import { CircleAlert, Lock, LoaderCircle } from '@lucide/vue'
import { Editor, EditorContent } from '@tiptap/vue-3'
import { fieldBox } from '~/utils/field-chrome'
import { editorContent, tidyNotes } from '~/utils/notes-editor'
import { createNotesExtensions } from '~/utils/notes-extensions'
import { GAME_NOTES_MAX } from '~~/shared/game'
import { notesLength, parseNotes, type NotesDoc } from '~~/shared/notes-doc'
import { characterCount } from '~~/shared/text'

// The notes editor (#454, 18-notizen § NoteEditor, ADR 0019): a Tiptap WYSIWYG restricted to the nodes and marks of `shared/notes-doc.ts`, in the chrome of a
// TextField. It is loaded by a dynamic import where a note is edited (`LazyRichNotesEditor` under `ClientOnly`), so no page's first load grows. It never emits on
// mount, so a form opened and saved untouched sends the document as it is stored; every emitted value went through `parseNotes`, so it is a document the
// server accepts unless it is over `max`: the over-limit document is emitted too (a paste must not lose text) and `invalid` says why. The count is `notesLength`,
// the function the server counts with. `readonly` (a finished Event, #464) renders the notes in the field's chrome and creates no editor.
const props = withDefaults(defineProps<{
  modelValue: NotesDoc | null
  variant?: 'game' | 'event'
  label?: string
  help?: string
  placeholder?: string
  max?: number
  /** The notes cannot change (a finished Event): the document is rendered, with no toolbar and no editor. */
  readonly?: boolean
  /** A save runs: the editor is not editable. */
  disabled?: boolean
}>(), { variant: 'game', label: undefined, help: undefined, placeholder: undefined, max: GAME_NOTES_MAX, readonly: false, disabled: false })

const emit = defineEmits<{ 'update:modelValue': [value: NotesDoc | null], 'invalid': [over: boolean] }>()

const { t } = useI18n()
const id = useId()
const labelId = `${id}-label`
const contentId = `${id}-content`
const helpId = `${id}-help`

const labelText = computed(() => props.label ?? t(props.variant === 'event' ? 'notesEditor.eventLabel' : 'notesEditor.label'))
const placeholderText = computed(() => props.placeholder ?? t(props.variant === 'event' ? 'notesEditor.eventPlaceholder' : 'notesEditor.placeholder'))

const editor = shallowRef<Editor | null>(null)
const field = useTemplateRef<HTMLElement>('field')
const linkControl = useTemplateRef<{ open: () => void }>('linkControl')
const linkOpen = ref(false)

// The count of what the editor shows, in the characters the server counts. A document too big for `parseNotes` (a paste of hundreds of thousands of
// characters) is counted from its text and is over the limit whatever `max` is.
const count = ref(props.modelValue ? notesLength(props.modelValue) : 0)
const tooBig = ref(false)
const over = computed(() => tooBig.value || count.value > props.max)
const showCounter = computed(() => !props.readonly && count.value >= props.max * 0.8)
const warning = computed(() => count.value >= props.max * 0.9)
const counterText = computed(() => (over.value ? t('notesEditor.over', { n: count.value - props.max }) : t('notesEditor.counter', { n: props.max - count.value })))

watch(over, value => emit('invalid', value))

// The live region speaks when the count crosses a threshold upwards, never by value: a note loaded at 1700 characters says nothing.
const SAY_AT = [0.8, 0.9, 0.95, 0.975]
const say = ref('')
let counted = count.value
watch(count, (now) => {
  const before = counted
  counted = now
  if (now <= before || silent) return
  if (before <= props.max && now > props.max) say.value = t('notesEditor.errorMax', { max: props.max })
  else {
    const crossed = SAY_AT.map(share => props.max * share).filter(at => before < at && now >= at)
    if (crossed.length > 0) say.value = t('notesEditor.liveRemaining', { n: props.max - now })
  }
})
// Set while the editor takes over a value from the parent: that is no typing.
let silent = false

/** The value the parent holds when it is the editor's own echo: it changes nothing, so the caret stays. */
let lastEmitted: NotesDoc | null = props.modelValue ? toRaw(props.modelValue) : null

function onUpdate(instance: Editor) {
  const parsed = parseNotes(tidyNotes(instance.getJSON()), Number.POSITIVE_INFINITY)
  if (parsed === undefined) {
    // Too big even as JSON: nothing new is emitted, the form keeps the last document and `invalid` blocks the save.
    tooBig.value = true
    count.value = characterCount(instance.state.doc.textBetween(0, instance.state.doc.content.size, '', ''))
    return
  }
  tooBig.value = false
  count.value = parsed === null ? 0 : notesLength(parsed)
  lastEmitted = parsed
  emit('update:modelValue', parsed)
}

watch(() => props.modelValue, (proxied) => {
  // A parent that holds the value in a `ref` hands back a reactive proxy of what was emitted: it is the same document.
  const value = proxied ? toRaw(proxied) : proxied
  if (!editor.value || value === lastEmitted) return
  lastEmitted = value
  silent = true
  tooBig.value = false
  count.value = value ? notesLength(value) : 0
  editor.value.commands.setContent(editorContent(value) as never, { emitUpdate: false })
  silent = false
})

const attributes = computed(() => ({
  'role': 'textbox',
  'aria-multiline': 'true',
  'aria-labelledby': labelId,
  'aria-describedby': helpId,
  ...(over.value ? { 'aria-invalid': 'true' } : {}),
  ...(props.disabled ? { 'aria-disabled': 'true' } : {}),
  'id': contentId,
  // The dialog trap of `useDialog` finds what takes the focus by `[tabindex]`; a bare contenteditable is not in its list.
  'tabindex': '0',
  'class': 'cp-note cp-note--edit',
  'data-notes-editor': '',
}))
watch(attributes, value => editor.value?.setOptions({ editorProps: { attributes: value } }))

watch(() => props.disabled, disabled => editor.value?.setEditable(!disabled, false))

onMounted(() => {
  if (props.readonly) return
  editor.value = new Editor({
    extensions: createNotesExtensions({ placeholder: () => placeholderText.value, onOpenLink: () => linkControl.value?.open() }),
    content: editorContent(props.modelValue) as never,
    editable: !props.disabled,
    editorProps: { attributes: attributes.value },
    onUpdate: ({ editor: instance }) => onUpdate(instance as Editor),
    onFocus: onFocus,
  })
})
onBeforeUnmount(() => {
  stopKeyboard?.()
  editor.value?.destroy()
})

// A phone's keyboard covers the lower half of the screen: the field scrolls so the toolbar and the caret stay above it (`scrollIntoView` on the field only, never on
// the page shell), and the content's height follows the visual viewport. `visualViewport` can be absent, so everything here is guarded; happy-dom has none.
let stopKeyboard: (() => void) | undefined
function fitKeyboard() {
  const viewport = window.visualViewport
  if (!viewport || !field.value) return
  const keyboardUp = window.innerHeight - viewport.height > 120
  if (keyboardUp) field.value.style.setProperty('--cp-notes-max', `min(300px, ${Math.max(120, viewport.height - 200)}px)`)
  else field.value.style.removeProperty('--cp-notes-max')
  if (keyboardUp && typeof field.value.scrollIntoView === 'function') field.value.scrollIntoView({ block: 'nearest' })
}
function onFocus() {
  stopKeyboard?.()
  const viewport = window.visualViewport
  if (!viewport) return
  fitKeyboard()
  viewport.addEventListener('resize', fitKeyboard)
  stopKeyboard = () => {
    viewport.removeEventListener('resize', fitKeyboard)
    field.value?.style.removeProperty('--cp-notes-max')
    stopKeyboard = undefined
  }
  editor.value?.once('blur', () => stopKeyboard?.())
}

function focus() {
  editor.value?.commands.focus()
}

defineExpose({ focus, editor })

const fieldClass = computed(() => {
  if (props.readonly) return 'rounded-md border-(length:--cp-bw) border-dashed border-line bg-surface'
  if (props.disabled) return 'rounded-md border-(length:--cp-bw) border-dashed border-ink-3 bg-paper-2'
  return fieldBox(over.value)
})
const helpLine = computed(() => {
  if (props.readonly) return { text: t('notesEditor.finishedHelp'), icon: Lock, tone: 'text-ink-2 font-medium' }
  if (props.disabled) return { text: t('notesEditor.saving'), icon: LoaderCircle, tone: 'text-ink-2 font-medium' }
  if (over.value) return { text: t('notesEditor.errorMax', { max: props.max }), icon: CircleAlert, tone: 'text-error-fg font-bold' }
  return { text: props.help ?? t(props.variant === 'event' ? 'notesEditor.eventHelp' : 'notesEditor.help'), icon: undefined, tone: 'text-ink-2 font-medium' }
})
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1.5"
    :data-variant="variant"
  >
    <div class="flex min-h-[26px] items-center gap-2">
      <NoteDisc
        :kind="variant"
        :finished="readonly"
      />
      <!-- eslint-disable-next-line vuejs-accessibility/label-has-for, vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -- the content is a textbox, not a labelable control: a click on the label focuses it -->
      <label
        :id="labelId"
        class="text-[14px] leading-[1.2] font-bold"
        :class="disabled ? 'text-ink-3' : 'text-ink'"
        @click="focus"
      >{{ labelText }}</label>
      <span
        v-if="readonly"
        class="inline-flex h-6 items-center gap-1 rounded-pill border-2 border-line bg-paper-2 px-2 text-[12px] font-bold text-ink"
      >
        <AppIcon
          :icon="Lock"
          :size="12"
        />
        {{ t('notes.finished.chip') }}
      </span>
    </div>
    <div
      ref="field"
      class="cp-notes-field relative"
      :class="fieldClass"
      :data-readonly="readonly || undefined"
    >
      <template v-if="!readonly">
        <RichNotesToolbar
          v-if="editor"
          :editor="editor"
          :controls="contentId"
          :disabled="disabled"
          :link-open="linkOpen"
          @open-link="linkControl?.open()"
        />
        <RichNotesLinkControl
          v-if="editor"
          ref="linkControl"
          :editor="editor"
          @open-change="linkOpen = $event"
        />
      </template>
      <div
        v-if="readonly"
        class="px-3.5 pt-3 pb-3.5 text-[16px] leading-normal text-ink"
      >
        <RichNotes
          v-if="modelValue"
          :doc="modelValue"
        />
      </div>
      <div
        v-else
        class="cp-notes-content relative px-3.5 pt-3 pb-3.5 text-[16px] leading-normal"
        :class="disabled ? 'text-ink-3' : 'text-ink'"
      >
        <EditorContent :editor="editor ?? undefined" />
      </div>
    </div>
    <div
      :id="helpId"
      class="flex items-start justify-between gap-3 text-[13px] leading-[1.35]"
    >
      <span
        class="inline-flex items-start gap-1.5 text-pretty"
        :class="helpLine.tone"
      >
        <AppIcon
          v-if="helpLine.icon"
          :icon="helpLine.icon"
          :size="16"
          class="-mt-px"
          :class="{ 'animate-spin motion-reduce:animate-none': disabled && !readonly }"
        />
        {{ helpLine.text }}
      </span>
      <span
        v-if="showCounter"
        aria-hidden="true"
        class="flex-none text-[13px] whitespace-nowrap tabular-nums"
        :class="over ? 'font-bold text-error-fg' : warning ? 'font-bold text-warning-fg' : 'font-medium text-ink-2'"
      >{{ counterText }}</span>
    </div>
    <span
      aria-live="polite"
      class="sr-only"
    >{{ say }}</span>
  </div>
</template>

<style>
/* The field's focus ring: 3 px on the field while the caret is in the content. Focus in the link control or on a toolbar button has its own ring, so the field's goes off. */
.cp-notes-field {
  transition: outline-color var(--cp-dur-fast) var(--cp-ease-snap), border-color var(--cp-dur-fast) var(--cp-ease-snap);
}
.cp-notes-field:has(.ProseMirror-focused) {
  outline: 3px solid var(--cp-focus);
  outline-offset: 2px;
}

/* The heights of 18-notizen § NoteEditor: min 132 below 600 px, 168 from it (96 for an Event's note); max 300 / 400 (200), the keyboard's value on a phone sets --cp-notes-max. */
.cp-notes-content {
  --cp-notes-min: 132px;
  min-height: var(--cp-notes-min);
  max-height: var(--cp-notes-max, 300px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  cursor: text;
}
@media (min-width: 37.5rem) {
  .cp-notes-content {
    --cp-notes-min: 168px;
    max-height: var(--cp-notes-max, 400px);
  }
}
[data-variant=event] .cp-notes-content {
  --cp-notes-min: 96px;
  max-height: var(--cp-notes-max, 200px);
}
/* The ProseMirror root fills the box (the box's padding is 12 + 14), so a click below the last line puts the caret there. */
.cp-notes-content .ProseMirror {
  min-height: calc(var(--cp-notes-min) - 26px);
  outline: none;
  overflow-wrap: break-word;
}
.cp-notes-content .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: var(--cp-ink-2);
  pointer-events: none;
  text-wrap: pretty;
}
/* A link is not clickable while editing (Strg or ⌘ + click opens it), so it keeps the text cursor. */
.cp-notes-content .ProseMirror a {
  cursor: text;
}
/* The target of the link control while focus is in it: a decoration, not a mark (18-notizen § NoteLinkControl). */
.cp-note-link-target {
  background: color-mix(in srgb, var(--cp-primary) 62%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cp-primary) 62%, transparent);
  border-radius: 2px;
}
</style>
