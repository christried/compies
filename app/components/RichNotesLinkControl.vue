<script setup lang="ts">
import { getMarkRange } from '@tiptap/core'
import type { Editor } from '@tiptap/vue-3'
import { CircleAlert, Link, Unlink } from '@lucide/vue'
import { MD_QUERY } from '~/composables/useMediaQuery'
import { motionMs, motionToken, reducedMotion } from '~/utils/motion'
import { checkLinkAddress } from '~/utils/notes-editor'
import { setLinkTarget } from '~/utils/notes-extensions'

// The link control of the notes editor (#454, 18-notizen § NoteLinkControl): a popover under the selection from 980 px, a bar under the toolbar below.
// It opens from the toolbar's Link button or Strg/⌘ + K (the editor calls `open`), on the selection, on the whole link under the caret, or on the caret.
// It sits inside the game form, so two keys need care: Enter in the address applies the link and is prevented (the browser's implicit submit would save the game),
// and Esc closes this control only, never the sheet the form may sit in.
const props = defineProps<{ editor: Editor }>()

const emit = defineEmits<{ openChange: [open: boolean] }>()

const { t } = useI18n()
const id = useId()
const errorId = `${id}-error`
const wide = useMediaQuery(MD_QUERY)
// `null` until mounted: the bar renders then, since the server render has no popover.
const popover = computed(() => wide.value === true)

const isOpen = ref(false)
const address = ref('')
const error = ref(false)
/** Whether the target is a link already: its address is edited and „Link entfernen“ is offered. */
const editing = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const input = useTemplateRef<HTMLInputElement>('input')
const place = ref({ left: 8, top: 60 })

/** The selection when the control opened, put back when it is cancelled, and the range the link applies to (the whole link when editing). */
let selection = { from: 0, to: 0 }
let target = { from: 0, to: 0 }

function setOpen(open: boolean) {
  isOpen.value = open
  emit('openChange', open)
}

function placePopover() {
  const field = root.value?.parentElement
  if (!field) return
  const { view } = props.editor
  const start = view.coordsAtPos(target.from)
  const end = view.coordsAtPos(target.to)
  const box = field.getBoundingClientRect()
  // Under the selection's last line, 14 px left of its start, and inside the field: 8 px from the left edge to 328 px (the popover is 320 wide) from the right.
  const top = end.bottom - box.top - field.clientTop + 10
  const left = Math.max(8, Math.min(start.left - box.left - field.clientLeft - 14, field.clientWidth - 328))
  place.value = { left: Math.round(left), top: Math.round(top) }
}

async function open() {
  if (isOpen.value) return cancel()
  const { editor } = props
  const { state } = editor
  const { from, to } = state.selection
  selection = { from, to }
  const range = getMarkRange(state.selection.$from, state.schema.marks.link!)
  const href = range ? String(state.doc.nodeAt(range.from)?.marks.find(mark => mark.type.name === 'link')?.attrs.href ?? '') : ''
  if (range && range.from <= from && range.to >= to) {
    target = range
    editing.value = true
    address.value = href
  }
  else {
    target = { from, to }
    editing.value = false
    address.value = ''
  }
  error.value = false
  if (target.from < target.to) setLinkTarget(editor, target)
  setOpen(true)
  await nextTick()
  if (popover.value) placePopover()
  input.value?.focus()
}

function close() {
  setLinkTarget(props.editor, null)
  setOpen(false)
}

/** Back to the content with the selection as it was. */
function cancel() {
  close()
  props.editor.chain().focus().setTextSelection(selection).run()
}

function apply() {
  const result = checkLinkAddress(address.value)
  if (!result.ok) {
    error.value = true
    return
  }
  const { editor } = props
  const { href } = result
  const chain = editor.chain().focus()
  let end = target.to
  if (target.from < target.to) {
    chain.setTextSelection(target).setLink({ href })
  }
  else {
    // Nothing selected: the address becomes the text, carrying the link.
    chain.insertContentAt(target.from, { type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
    end = target.from + href.length
  }
  // The chain runs before the tint is cleared: both are transactions, and a chain holds the state it began with.
  chain.setTextSelection(end).run()
  close()
}

function remove() {
  props.editor.chain().focus().setTextSelection(target).unsetLink().setTextSelection(target.to).run()
  close()
}

function onAddressKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing) return
  // The control sits in the game form: without this the browser's implicit submit saves the game with the link unapplied.
  event.preventDefault()
  apply()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    // Closes this control only: the sheet around the form listens for Esc too.
    event.preventDefault()
    event.stopPropagation()
    cancel()
    return
  }
  if (event.key !== 'Tab' || !root.value) return
  // Tab cycles through the address and the buttons.
  const items = [...root.value.querySelectorAll<HTMLElement>('input, button')]
  const first = items[0]
  const last = items.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  }
  else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

// A click outside closes the control; the caret is wherever the click put it. The toolbar's Link button toggles it itself.
function onPointerdown(event: PointerEvent) {
  if (!isOpen.value || !(event.target instanceof Node) || root.value?.contains(event.target)) return
  if (event.target instanceof Element && event.target.closest('[role=toolbar]')) return
  close()
}
onMounted(() => document.addEventListener('pointerdown', onPointerdown, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerdown, true))

// Motion (04-motion § Notizen), Web Animations as everywhere but the ceremonies (ADR 0015). Under reduced motion the popover fades without moving and the bar is cut.
const EASE_OUT = 'cubic-bezier(.16,1,.3,1)'
const EASE_IN = 'cubic-bezier(.7,0,.84,0)'
function enter(element: Element, done: () => void) {
  if (typeof element.animate !== 'function') return done()
  const easing = motionToken('--cp-ease-out', EASE_OUT)
  let animation: Animation | undefined
  if (popover.value) {
    const keyframes = reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }]
    animation = element.animate(keyframes, { duration: motionMs('--cp-dur-fast', '140ms'), easing })
  }
  else if (!reducedMotion() && element instanceof HTMLElement) {
    const height = element.offsetHeight
    element.style.overflow = 'hidden'
    animation = element.animate([{ height: '0px' }, { height: `${height}px` }], { duration: motionMs('--cp-dur-base', '220ms'), easing })
  }
  if (!animation) return done()
  animation.onfinish = () => {
    if (element instanceof HTMLElement) element.style.overflow = ''
    done()
  }
}
function leave(element: Element, done: () => void) {
  if (typeof element.animate !== 'function' || (!popover.value && reducedMotion())) return done()
  const easing = motionToken('--cp-ease-in', EASE_IN)
  const keyframes = popover.value
    ? (reducedMotion() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px)' }])
    : [{ height: `${(element as HTMLElement).offsetHeight}px`, overflow: 'hidden' }, { height: '0px', overflow: 'hidden' }]
  element.animate(keyframes, { duration: motionMs('--cp-dur-fast', '140ms'), easing }).onfinish = done
}

defineExpose({ open })
</script>

<template>
  <Transition
    :css="false"
    @enter="enter"
    @leave="leave"
  >
    <div
      v-if="isOpen"
      ref="root"
      :role="popover ? 'dialog' : 'group'"
      :aria-label="t('notesEditor.link')"
      class="flex flex-col gap-2 bg-surface"
      :class="popover
        ? 'layer-popover absolute box-border w-80 rounded-[18px] border-(length:--cp-bw) border-line px-3.5 pt-3.5 pb-2.5 shadow-modal'
        : 'border-b-2 border-line-soft bg-paper-2 px-2.5 pt-2.5 pb-3'"
      :style="popover ? { left: `${place.left}px`, top: `${place.top}px` } : undefined"
      @keydown="onKeydown"
    >
      <label
        :for="`${id}-address`"
        class="text-[14px] font-bold"
      >{{ t('notesEditor.linkAddress') }}</label>
      <div
        class="flex h-12 items-center gap-2 rounded-md bg-surface px-3 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-focus"
        :class="error ? 'border-3 border-error-fg px-[10px]' : 'border-(length:--cp-bw) border-line'"
      >
        <AppIcon
          :icon="Link"
          :size="16"
          class="text-ink-2"
        />
        <input
          :id="`${id}-address`"
          ref="input"
          v-model="address"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://"
          :aria-invalid="error ? 'true' : 'false'"
          :aria-describedby="error ? errorId : undefined"
          class="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[16px] text-ink outline-none"
          @input="error = false"
          @keydown="onAddressKeydown"
        >
        <AppIcon
          v-if="error"
          :icon="CircleAlert"
          :size="18"
          class="text-error-fg"
        />
      </div>
      <span
        v-if="error"
        :id="errorId"
        role="alert"
        class="flex items-center gap-1.5 text-[13px] font-bold text-error-fg"
      >
        <AppIcon
          :icon="CircleAlert"
          :size="16"
        />
        {{ t('notesEditor.linkError') }}
      </span>
      <div class="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <button
          v-if="editing"
          type="button"
          class="mr-auto -ml-1.5 inline-flex h-11 items-center gap-1.5 border-0 bg-transparent px-2 text-[14px] font-bold text-ink"
          @click="remove"
        >
          <AppIcon
            :icon="Unlink"
            :size="16"
          />
          {{ t('notesEditor.unlink') }}
        </button>
        <button
          type="button"
          class="h-11 border-0 bg-transparent px-2.5 text-[14px] font-bold text-ink"
          @click="cancel"
        >
          {{ t('notesEditor.linkCancel') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center rounded-pill border-(length:--cp-bw) border-line bg-primary px-4 text-[14px] font-extrabold text-on-primary shadow-sm"
          :class="popover ? 'my-0.5 h-10' : 'h-11'"
          @click="apply"
        >
          {{ t('notesEditor.linkApply') }}
        </button>
      </div>
    </div>
  </Transition>
</template>
