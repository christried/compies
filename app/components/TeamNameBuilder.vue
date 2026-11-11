<script setup lang="ts">
import { Pencil, RotateCcw } from '@lucide/vue'
import { teamName } from '~/utils/board'
import { joinNames } from '~/utils/list'
import { namePop } from '~/utils/motion'
import { characterCount, cutToCharacters } from '~~/shared/text'
import { hasSpace, stripSpaces, TEAM_WORD_MAX } from '~~/shared/team-word'

// The Team word in the band under a team's header (#161, #439, 02-components § TeamNameBuilder, App Lobby 09 „Teamwahl offen + Teamwort“).
// A Player in a team with no name yet sees „Dein Wort“ with a counter: spaces are stripped as they type with a hint, Enter or leaving the
// field saves, an empty save removes the word, Escape drops the draft. Once the team has a word the band folds to the composed name with a
// pencil that opens the field again for the Player's own word; Enter and Escape fold it again and give the focus back to the pencil (#439).
// The Host sees the name and a reset once the team has a name from words; it asks first (screen 10 „Teamnamen zurücksetzen?“) and deletes
// the words. The Host never writes a word, seated in a team or not. A new name pops in, and a polite live region announces the composed name
// when it changes. Everyone else sees only the name, in the header. The refetch after a save brings the truth.
const props = defineProps<{
  slug: string
  /** The team's position, which is its Team colour index. */
  team: number
  /** The name shown in the header: the Team name, else the colour's name. */
  name: string
  /** The team has a Team name (from words); the Host can reset only then. */
  named: boolean
  /** The viewer is a Player in this team and gives a word. */
  mine: boolean
  /** The viewer's saved word. */
  myWord: string | null
  /** The viewer is the Host. */
  isHost: boolean
  /** Who gave a word, for the reset's question. */
  authors: string[]
}>()

const { t } = useI18n()
const { toast } = useToast()
const { send } = useEventMutation(() => props.slug, () => refreshEvent(props.slug))
const fieldId = useId()
const helpId = `${fieldId}-help`

const draft = ref(props.myWord ?? '')
/** What the server has (or is about to have): a save is needed only when the draft differs from it. */
const saved = ref(props.myWord ?? '')
const focused = ref(false)
const stripped = ref(false)
/** The Player opened the field with the pencil in a named team (#439). A team without a name always shows the field. */
const editing = ref(false)
/** Enter or Escape folded the field: the focus goes back to the pencil once it is drawn (#439). */
const returnFocus = ref(false)
const count = computed(() => characterCount(draft.value))

const canWrite = computed(() => props.mine && !props.isHost)
const canReset = computed(() => props.isHost && props.named)
/**
 * The composed name shows folded once the team has a word, unless the Player's field is in use: opened with the pencil, or the Player is
 * in it (focus) or holds an unsaved draft. Another Player's word naming the team never takes the field away mid-typing (#488).
 */
const showName = computed(() => props.named && !(canWrite.value && (editing.value || focused.value || draft.value !== saved.value)))

const inputEl = useTemplateRef<HTMLInputElement>('input')
const pencil = useTemplateRef<{ $el: HTMLElement }>('pencil')
const nameEl = useTemplateRef<HTMLElement>('nameEl')

watch(() => props.myWord, (word) => {
  saved.value = word ?? ''
  if (!focused.value) draft.value = saved.value
})

function onInput(event: Event) {
  const input = event.target as HTMLInputElement
  const clean = cutToCharacters(stripSpaces(input.value), TEAM_WORD_MAX)
  stripped.value = hasSpace(input.value)
  // Written back directly: when the cleaned value equals the current model, Vue would not patch the input.
  input.value = clean
  draft.value = clean
}

async function save() {
  const word = draft.value
  if (word === saved.value) return
  const before = saved.value
  saved.value = word
  await send('POST', 'team-word', {
    body: { word },
    refused: () => {
      saved.value = before
      draft.value = before
    },
  })
}

// The pencil opens the field on the viewer's own word, with the focus in it (#439).
async function openField() {
  draft.value = saved.value
  editing.value = true
  await nextTick()
  inputEl.value?.focus()
}

// Leaving the field saves it; the focus stays where the Player moved it.
function onBlur() {
  focused.value = false
  stripped.value = false
  returnFocus.value = false
  editing.value = false
  void save()
}

// Enter saves; Escape only drops the draft (no request). Both fold the field again in a named team (#439). The field is left first,
// so that it counts as unused and the focus can go to the pencil (#488); leaving runs onBlur, which clears the return flag.
function fold() {
  inputEl.value?.blur()
  stripped.value = false
  editing.value = false
  returnFocus.value = true
}

function submit() {
  void save()
  fold()
}

function cancel() {
  draft.value = saved.value
  fold()
}

// The focus goes back to the pencil once the name is drawn again.
watch(showName, (folded) => {
  if (!folded || !returnFocus.value) return
  returnFocus.value = false
  pencil.value?.$el.focus()
}, { flush: 'post' })

// The composed name, announced when it changes (not when the board first draws). A word that arrives or changes pops in while the
// name is folded; a reset to the colour name does not (#439).
const announced = ref('')
watch(() => props.name, (name, before) => {
  if (name === before) return
  announced.value = t('team.word.announce', { name })
  if (props.named && nameEl.value) namePop(nameEl.value)
}, { flush: 'post' })

const asking = ref(false)
const resetting = ref(false)
const authorList = computed(() => joinNames(props.authors))

async function reset() {
  await send('POST', `teams/${props.team}/reset-name`, {
    busy: resetting,
    done: () => toast({ tone: 'success', text: t('team.word.resetDone', { name: teamName(props.team, t) }) }),
  })
  asking.value = false
}
</script>

<template>
  <div
    v-if="canWrite || canReset"
    class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-2 border-line-soft bg-surface-2 px-2.5 py-2"
  >
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="showName"
        key="name"
        class="flex min-w-0 flex-1 items-center gap-2 transition-opacity dur-fast ease-out motion-reduce:transition-none reduced:transition-none"
      >
        <p
          ref="nameEl"
          class="m-0 min-w-0 flex-1 break-words text-[15px] font-extrabold text-ink"
        >
          {{ name }}
        </p>
        <IconButton
          v-if="canWrite"
          ref="pencil"
          :icon="Pencil"
          :label="t('team.word.change')"
          :size="32"
          @click="openField"
        />
        <button
          v-if="canReset"
          type="button"
          class="hit-44 inline-flex items-center gap-1.5 rounded-md text-[13px] font-bold underline-offset-4 hover:underline"
          @click="asking = true"
        >
          <AppIcon
            :icon="RotateCcw"
            :size="14"
          />
          {{ t('team.word.reset') }}
        </button>
      </div>
      <div
        v-else-if="canWrite"
        key="field"
        class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 transition-opacity dur-fast ease-out motion-reduce:transition-none reduced:transition-none"
      >
        <label
          :for="fieldId"
          class="flex-[1_0_100%] text-[12px] font-extrabold text-ink-2"
        >{{ t('team.word.label') }}</label>
        <input
          :id="fieldId"
          ref="input"
          :value="draft"
          type="text"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :aria-describedby="helpId"
          class="h-9 min-w-0 flex-1 rounded-[10px] border-[2.5px] border-line bg-surface px-2.5 font-bold text-ink"
          @focus="focused = true"
          @input="onInput"
          @keydown.enter.prevent="submit"
          @keydown.esc="cancel"
          @blur="onBlur"
        >
        <span class="font-mono text-[11px] text-ink-2">{{ t('common.counter', { n: count, max: TEAM_WORD_MAX }) }}</span>
        <p
          :id="helpId"
          class="m-0 flex-[1_0_100%] text-[12px]"
          :class="stripped ? 'font-bold text-error-fg' : 'text-ink-2'"
          :aria-live="stripped ? 'polite' : undefined"
        >
          {{ stripped ? t('team.word.noSpaces') : t('team.word.help') }}
        </p>
      </div>
    </Transition>
    <div
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ announced }}
    </div>
  </div>
  <ConfirmModal
    :open="asking"
    :title="t('team.word.resetTitle')"
    :icon="RotateCcw"
    :confirm-label="t('team.word.resetConfirm')"
    :loading="resetting"
    @confirm="reset"
    @cancel="asking = false"
  >
    <p class="m-0">
      {{ t('team.word.resetText', { name, color: teamName(team, t) }) }}
      <template v-if="authors.length > 0">
        {{ t('team.word.resetWords', { people: authorList }) }}
      </template>
    </p>
  </ConfirmModal>
</template>
