<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { teamName } from '~/utils/board'
import { eventDataKey } from '~/utils/event-data'
import { characterCount, cutToCharacters } from '~~/shared/text'
import { hasSpace, stripSpaces, TEAM_WORD_MAX } from '~~/shared/team-word'

// The Team word field and the Host's reset in the band under a team's header (#161, 02-components § TeamNameBuilder,
// App Lobby 09 „Teamwahl offen + Teamwort“). A Player in this team sees „Dein Wort“ with a counter: spaces are stripped
// as they type with a hint, Enter or leaving the field saves, an empty save removes the word. The Host sees a reset
// when the team has a name from words; it asks first (screen 10 „Teamnamen zurücksetzen?“). Once the first Session
// has started (#164) the name is frozen: there is no word field, and the Host's reset gives the colour name while the
// words stay. A polite live region announces the composed name when it changes. Everyone else sees only the name, in
// the header. The refetch after a save brings the truth.
const props = withDefaults(defineProps<{
  slug: string
  /** The team's position, which is its Team colour index. */
  team: number
  /** The name shown in the header: the Team name, else the colour's name. */
  name: string
  /** The team has a Team name (from words); the Host can reset only then. */
  named: boolean
  /** The viewer is a Player in this team and gives a word. */
  mine: boolean
  /** The name is frozen since the first Session started (#164): no word field, and a reset keeps the words. */
  frozen?: boolean
  /** The viewer's saved word. */
  myWord: string | null
  /** The viewer is the Host. */
  isHost: boolean
  /** Who gave a word, for the reset's question. */
  authors: string[]
}>(), { frozen: false })

const { t } = useI18n()
const { toast } = useToast()
const { send } = useEventMutation(() => props.slug, () => refreshNuxtData(eventDataKey(props.slug)))
const fieldId = useId()
const helpId = `${fieldId}-help`

const draft = ref(props.myWord ?? '')
/** What the server has (or is about to have): a save is needed only when the draft differs from it. */
const saved = ref(props.myWord ?? '')
const focused = ref(false)
const stripped = ref(false)
const count = computed(() => characterCount(draft.value))

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

function onBlur() {
  focused.value = false
  stripped.value = false
  void save()
}

// The composed name, announced when it changes (not when the board first draws).
const announced = ref('')
watch(() => props.name, (name, before) => {
  if (name !== before) announced.value = t('team.word.announce', { name })
})

const canReset = computed(() => props.isHost && props.named)
const asking = ref(false)
const resetting = ref(false)
const authorList = computed(() => new Intl.ListFormat('de', { style: 'long', type: 'conjunction' }).format(props.authors))

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
    v-if="(mine && !frozen) || canReset"
    class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-2 border-line-soft bg-surface-2 px-2.5 py-2"
  >
    <template v-if="mine && !frozen">
      <label
        :for="fieldId"
        class="flex-[1_0_100%] text-[12px] font-extrabold text-ink-2"
      >{{ t('team.word.label') }}</label>
      <input
        :id="fieldId"
        :value="draft"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :aria-describedby="helpId"
        class="h-9 min-w-0 flex-1 rounded-[10px] border-[2.5px] border-line bg-surface px-2.5 font-bold text-ink"
        @focus="focused = true"
        @input="onInput"
        @keydown.enter.prevent="save"
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
    </template>
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
      <template v-if="authors.length > 0 && !frozen">
        {{ t('team.word.resetWords', { people: authorList }) }}
      </template>
    </p>
  </ConfirmModal>
</template>
