<script setup lang="ts">
import { CircleAlert, X } from '@lucide/vue'
import { TAG_MAX, TAGS_PER_GAME_MAX, normaliseTag, tagProblem, type GameTag } from '~~/shared/game'
import { fieldBox } from '~/utils/field-chrome'
import { colorTags } from '~~/shared/tag-colors'

// The Tag field of the game form (#335, GLOSSARY: Tag): the game's Tags as chips and a text field after them. Enter or a
// comma confirms the text, Backspace on the empty field takes the last chip back, and the Tags in use are offered as the
// User types (a combobox). One rule adds a Tag (`tryAdd`): the shared normalisation, the shared length limit, no key twice,
// at most TAGS_PER_GAME_MAX. `commit()` is for the form's submit, so a Tag typed and not yet confirmed (a phone has no
// comma key to hand) is not lost.
const model = defineModel<GameTag[]>({ required: true })
const props = defineProps<{
  /** The Tags in use (`/api/games/tags`, #365): offered while typing, and the spelling a typed Tag takes. */
  suggestions: GameTag[]
  label: string
}>()

const { t } = useI18n()
const inputId = useId()
const helpId = `${inputId}-help`
const errorId = `${inputId}-error`
const listId = `${inputId}-list`
const optionId = (index: number) => `${inputId}-option-${index}`

const MAX_SUGGESTIONS = 8

const text = ref('')
/** The index of the suggestion the arrow keys are on; -1 before one is chosen. */
const active = ref(-1)
/** Escape closes the list until the text changes. */
const dismissed = ref(false)
/** A Tag was refused because the game has TAGS_PER_GAME_MAX already; it shows on that attempt only. */
const tooMany = ref(false)
const inputEl = useTemplateRef<HTMLInputElement>('input')

// Too long shows live as the User types, like the notes (the shared rule counts characters as the User sees them).
const tooLong = computed(() => tagProblem(text.value) === 'too_long')
const error = computed(() => {
  if (tooLong.value) return t('gameEdit.tagTooLong', { max: TAG_MAX })
  if (tooMany.value) return t('gameEdit.tagsTooMany', { max: TAGS_PER_GAME_MAX })
  return undefined
})
const help = computed(() => (error.value ? undefined : t('gameEdit.tagsHelp')))
const describedBy = computed(() => (error.value ? errorId : helpId))

// Tags in use that contain the typed key and are no chip yet: those that start with it first, then the rest, each in the
// order of the list, at most MAX_SUGGESTIONS.
const options = computed(() => {
  const typed = normaliseTag(text.value)
  if (!typed) return []
  const taken = new Set(model.value.map(tag => tag.key))
  const matches = props.suggestions.filter(tag => !taken.has(tag.key) && tag.key.includes(typed.key))
  return [...matches.filter(tag => tag.key.startsWith(typed.key)), ...matches.filter(tag => !tag.key.startsWith(typed.key))].slice(0, MAX_SUGGESTIONS)
})
const listShown = computed(() => !dismissed.value && options.value.length > 0)

/**
 * Adds `raw` to `current`. Nothing left of the text, or a key that is a chip already, adds nothing and is no failure; a
 * Tag that is too long, or one more than TAGS_PER_GAME_MAX, is refused. A Tag in use takes the spelling in use.
 */
function tryAdd(raw: string, current: GameTag[]): { tags: GameTag[], outcome: 'added' | 'skipped' | 'too_long' | 'too_many' } {
  const tag = normaliseTag(raw)
  if (!tag) return { tags: current, outcome: 'skipped' }
  if (tagProblem(raw) === 'too_long') return { tags: current, outcome: 'too_long' }
  if (current.some(chip => chip.key === tag.key)) return { tags: current, outcome: 'skipped' }
  if (current.length >= TAGS_PER_GAME_MAX) return { tags: current, outcome: 'too_many' }
  const used = props.suggestions.find(suggestion => suggestion.key === tag.key)
  return { tags: [...current, used ?? tag], outcome: 'added' }
}

/** Adds the text of the field or a chosen suggestion; clears the field unless the Tag was refused. True unless refused. */
function add(raw: string): boolean {
  const { tags, outcome } = tryAdd(raw, model.value)
  if (outcome === 'too_long' || outcome === 'too_many') {
    tooMany.value = outcome === 'too_many'
    return false
  }
  if (outcome === 'added') model.value = tags
  tooMany.value = false
  setText('')
  return true
}

/** The field's text, written back to the input too: when the value equals the current one Vue would not patch it. */
function setText(value: string) {
  text.value = value
  if (inputEl.value) inputEl.value.value = value
  active.value = -1
  dismissed.value = false
}

function onInput(event: Event) {
  const value = (event.target as HTMLInputElement).value
  tooMany.value = false
  // The comma is handled here and not on keydown: Android keyboards send `key: 'Unidentified'`. A pasted list makes several Tags.
  if (!value.includes(',')) {
    setText(value)
    return
  }
  const parts = value.split(',')
  const rest = parts.pop()!
  let tags = model.value
  for (const [index, part] of parts.entries()) {
    const result = tryAdd(part, tags)
    if (result.outcome === 'too_long' || result.outcome === 'too_many') {
      tooMany.value = result.outcome === 'too_many'
      if (tags !== model.value) model.value = tags
      setText([...parts.slice(index), rest].join(','))
      return
    }
    tags = result.tags
  }
  if (tags !== model.value) model.value = tags
  setText(rest)
}

function pick(option: GameTag) {
  add(option.label)
  inputEl.value?.focus()
}

function move(step: 1 | -1) {
  const count = options.value.length
  dismissed.value = false
  active.value = active.value === -1 ? (step === 1 ? 0 : count - 1) : (active.value + step + count) % count
}

function onEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  // Always: Enter in a field of the game form would submit the form.
  event.preventDefault()
  const chosen = listShown.value ? options.value[active.value] : undefined
  if (chosen) pick(chosen)
  else add(text.value)
}

function onBackspace() {
  if (text.value === '' && model.value.length > 0) {
    tooMany.value = false
    model.value = model.value.slice(0, -1)
  }
}

function onEscape(event: KeyboardEvent) {
  if (!listShown.value) return
  // Only the list closes, not the sheet around the form.
  event.stopPropagation()
  dismissed.value = true
  active.value = -1
}

// The chips with their colours (#427), in chip order: adding or removing a chip recolours the ones after it as the game page will.
const chips = computed(() => colorTags(model.value))

function remove(index: number) {
  tooMany.value = false
  model.value = model.value.filter((_, position) => position !== index)
  inputEl.value?.focus()
}

/** For the form's submit: confirms the text that is still in the field. True when nothing is left in it. */
function commit(): boolean {
  return text.value.trim() === '' ? true : add(text.value)
}

defineExpose({ commit })
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label
      :for="inputId"
      class="text-[14px] font-bold"
    >{{ label }}</label>
    <!-- The box is the field to the eye: a tap anywhere in it lands in the input. -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions, vuejs-accessibility/click-events-have-key-events -- a click anywhere in the box focuses the input, which takes the keyboard -->
    <div
      class="focus-within:focus-ring relative flex min-h-control-lg cursor-text flex-wrap items-center gap-1.5 px-2.5 py-1.5"
      :class="fieldBox(Boolean(error))"
      @click="inputEl?.focus()"
    >
      <TagChip
        v-for="(tag, index) in chips"
        :key="tag.key"
        :color="tag.color"
        class="inline-flex h-8 items-center gap-1 pr-1 pl-3 text-small"
      >
        <span class="max-w-[16rem] truncate">{{ tag.label }}</span>
        <button
          type="button"
          :aria-label="t('gameEdit.tagRemove', { label: tag.label })"
          class="hit-44 grid size-6 place-items-center rounded-pill hover:bg-line-soft"
          @click.stop="remove(index)"
        >
          <AppIcon
            :icon="X"
            :size="14"
          />
        </button>
      </TagChip>
      <input
        :id="inputId"
        ref="input"
        :value="text"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        :aria-expanded="listShown ? 'true' : 'false'"
        :aria-controls="listId"
        :aria-activedescendant="listShown && active >= 0 ? optionId(active) : undefined"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="describedBy"
        class="h-8 min-w-[8ch] flex-1 border-0 bg-transparent text-[17px] text-ink outline-none"
        @input="onInput"
        @keydown.enter="onEnter"
        @keydown.backspace="onBackspace"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.esc="onEscape"
      >
    </div>
    <ul
      v-if="listShown"
      :id="listId"
      role="listbox"
      :aria-label="t('gameEdit.tagSuggestions')"
      class="m-0 flex list-none flex-col overflow-hidden rounded-[12px] border-(length:--cp-bw) border-line bg-surface p-0 shadow-card"
    >
      <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/interactive-supports-focus -- the options are reached with aria-activedescendant, and the input takes the keys; the click is for a tap -->
      <li
        v-for="(option, index) in options"
        :id="optionId(index)"
        :key="option.key"
        role="option"
        :aria-selected="index === active ? 'true' : 'false'"
        class="cursor-pointer truncate px-3.5 py-2 text-[15px] font-bold"
        :class="index === active ? 'bg-ink text-paper' : 'hover:bg-paper-2'"
        @mousedown.prevent
        @click="pick(option)"
      >
        {{ option.label }}
      </li>
    </ul>
    <div class="flex flex-col gap-0.5 text-small">
      <span
        v-if="error"
        :id="errorId"
        class="flex items-center gap-1.5 font-bold text-error-fg"
      >
        <AppIcon
          :icon="CircleAlert"
          :size="14"
        />
        {{ error }}
      </span>
      <span
        v-if="help"
        :id="helpId"
        class="text-ink-2"
      >{{ help }}</span>
    </div>
  </div>
</template>
