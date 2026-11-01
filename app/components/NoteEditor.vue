<script setup lang="ts">
import { Check, Pencil, Plus, X } from '@lucide/vue'
import { NOTE_MAX } from '~~/shared/poll'
import { characterCount, cutToCharacters } from '~~/shared/text'

// The Note on this User's Vote, inside a Slot card (#102, #124; 02-components § NoteEditor). Once voted and not past:
// an „Anmerkung“ button, or the Note as text with a pencil. Opening shows a text area that grows with its text. Enter
// or ✓ saves, Escape or ✗ cancels, and saving an empty field removes the Note. Line breaks become spaces; the input
// stops at NOTE_MAX characters. `open(focus)` lets the card open it for Meh without taking the focus.
const props = defineProps<{
  /** This User's saved Note on the Slot. */
  note: string | null
  /** Whether this User has a Vote on the Slot: no Vote, no Note. */
  voted: boolean
  past: boolean
}>()

const emit = defineEmits<{ save: [text: string] }>()

const { t } = useI18n()
const fieldId = useId()
const audienceId = useId()
const root = useTemplateRef<HTMLElement>('root')
const field = useTemplateRef<HTMLTextAreaElement>('field')
const editing = ref(false)
const draft = ref('')
const { resize } = useAutoHeight(field, () => draft.value)
const openedByMeh = ref(false)
const count = computed(() => characterCount(draft.value))
const nearLimit = computed(() => count.value >= NOTE_MAX * 0.8)

async function open(focus = true) {
  draft.value = props.note ?? ''
  editing.value = true
  openedByMeh.value = !focus
  await nextTick()
  resize()
  if (focus) field.value?.focus()
}

// Closes the editor. When the User closed it from inside (✓, ✗, Escape), the focus moves to the trigger shown then:
// the pencil after a Note, „+ Anmerkung“ without one.
async function finish(text?: string) {
  const hadFocus = root.value?.contains(document.activeElement) ?? false
  editing.value = false
  if (text !== undefined) emit('save', text)
  if (!hadFocus) return
  await nextTick()
  root.value?.querySelector<HTMLElement>('[data-note-trigger]')?.focus()
}

function save() {
  void finish(draft.value)
}

function cancel() {
  void finish()
}

function onInput(event: Event) {
  const el = event.target as HTMLTextAreaElement
  let value = el.value.replace(/\r\n|[\r\n]/g, ' ')
  if (characterCount(value) > NOTE_MAX) value = cutToCharacters(value, NOTE_MAX)
  // Written back directly: when the cut value equals the draft, Vue would not patch the text area. Rewriting
  // sends the caret to the end, so it goes back to where it was (a pasted line break keeps the length).
  if (value !== el.value) {
    const caret = Math.min(el.selectionStart, value.length)
    el.value = value
    el.setSelectionRange(caret, caret)
  }
  draft.value = value
  resize()
}

// Enter saves; the text area never gets a line break. Not while an IME is composing.
function onEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  save()
}

// A Vote that did not arrive takes the open field with it.
watch(() => props.voted, (voted) => {
  if (!voted) editing.value = false
})

/** Closes the field Meh opened, if nothing was typed into it, when the Vote moves on from Meh. */
function closeIfUntouched() {
  if (editing.value && openedByMeh.value && draft.value === (props.note ?? '')) editing.value = false
}

defineExpose({ open, closeIfUntouched })
</script>

<template>
  <div
    v-if="!past"
    ref="root"
    :class="voted || editing ? 'flex flex-col gap-2 border-t-2 border-dashed border-line-soft pt-2.5' : undefined"
  >
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Escape cancels the edit from any control inside -->
    <div
      v-if="editing"
      class="flex flex-col gap-1.5"
      @keydown.esc.stop="cancel"
    >
      <div class="flex items-baseline gap-1.5">
        <label
          :for="fieldId"
          class="text-[13px] font-extrabold"
        >{{ t('mvp.notes.label') }}</label>
        <span
          :id="audienceId"
          class="text-[12px] font-semibold text-ink-2"
        >{{ t('mvp.notes.audience') }}</span>
        <span
          aria-hidden="true"
          class="ml-auto font-mono text-[12px] font-bold"
          :class="count >= NOTE_MAX - 8 ? 'text-warning-fg' : 'text-ink-2'"
        >{{ t('common.counter', { n: count, max: NOTE_MAX }) }}</span>
      </div>
      <textarea
        :id="fieldId"
        ref="field"
        :value="draft"
        rows="1"
        enterkeyhint="done"
        :placeholder="t('mvp.notes.placeholder')"
        :aria-describedby="audienceId"
        class="field-sizing-content block w-full resize-none overflow-hidden rounded-[10px] border-2 border-line bg-surface-2 px-[11px] py-[9px] text-[13px] leading-[1.4] font-semibold text-ink placeholder:text-ink-2"
        @input="onInput"
        @keydown.enter="onEnter"
      />
      <span
        class="sr-only"
        aria-live="polite"
      >{{ nearLimit ? t('mvp.notes.remaining', { n: NOTE_MAX - count }) : '' }}</span>
      <div class="flex justify-end gap-2">
        <IconButton
          :icon="Check"
          tone="success"
          :size="36"
          :label="t('mvp.notes.save')"
          @click="save"
        />
        <IconButton
          :icon="X"
          tone="error"
          :size="36"
          :label="t('common.cancel')"
          @click="cancel"
        />
      </div>
    </div>
    <div
      v-else-if="voted && note"
      class="flex items-start gap-2"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-[12px] font-bold text-ink-2">{{ t('mvp.notes.savedLabel') }}</span>
        <p class="m-0 text-[13px] leading-[1.4] font-semibold text-pretty break-words">
          {{ note }}
        </p>
      </div>
      <IconButton
        data-note-trigger
        :icon="Pencil"
        :label="t('mvp.notes.edit')"
        :size="32"
        @click="open()"
      />
    </div>
    <button
      v-else-if="voted"
      type="button"
      data-note-trigger
      class="hit-44 inline-flex h-8 items-center gap-1 self-start rounded-md px-1 text-[13px] font-bold text-ink hover:underline underline-offset-4"
      :aria-label="t('mvp.notes.addA11y')"
      @click="open()"
    >
      <AppIcon
        :icon="Plus"
        :size="14"
      />
      {{ t('mvp.notes.add') }}
    </button>
  </div>
</template>
