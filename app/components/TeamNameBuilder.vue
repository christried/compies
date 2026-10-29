<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import { apiErrorKey } from '~/utils/api-error'
import { teamName } from '~/utils/board'
import { eventDataKey } from '~/utils/event-data'
import { characterCount, cutToCharacters } from '~~/shared/text'
import { TEAM_WORD_MAX } from '~~/shared/team-word'

// The Team word field and the Host's reset in the band under a team's header (#161, 02-components § TeamNameBuilder,
// App Lobby 09 „Teamwahl offen + Teamwort“). A Player in this team sees „Dein Wort“ with a counter: spaces are stripped
// as they type with a hint, Enter or leaving the field saves, an empty save removes the word. The Host sees a reset
// when the team has a name from words; it asks first (screen 10 „Teamnamen zurücksetzen?“). A polite live region
// announces the composed name when it changes. Everyone else sees only the name, in the header. The word shown
// under each avatar is the BoardPerson's. The refetch after a save brings the truth.
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
  const clean = cutToCharacters(input.value.replace(/\s/g, ''), TEAM_WORD_MAX)
  stripped.value = /\s/.test(input.value)
  // Written back directly: when the cleaned value equals the current model, Vue would not patch the input.
  input.value = clean
  draft.value = clean
}

async function save() {
  const word = draft.value
  if (word === saved.value) return
  const before = saved.value
  saved.value = word
  try {
    await $fetch(`/api/e/${props.slug}/team-word`, { method: 'POST', body: { word } })
  }
  catch (failure) {
    saved.value = before
    draft.value = before
    toast({ tone: 'error', text: t(apiErrorKey(failure)) })
  }
  finally {
    await refreshNuxtData(eventDataKey(props.slug))
  }
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
  resetting.value = true
  try {
    await $fetch(`/api/e/${props.slug}/teams/${props.team}/reset-name`, { method: 'POST' })
    toast({ tone: 'success', text: t('team.word.resetDone', { name: teamName(props.team, t) }) })
  }
  catch (failure) {
    toast({ tone: 'error', text: t(apiErrorKey(failure)) })
  }
  finally {
    resetting.value = false
    asking.value = false
    await refreshNuxtData(eventDataKey(props.slug))
  }
}
</script>

<template>
  <div
    v-if="mine || canReset"
    class="flex flex-wrap items-center gap-x-2 gap-y-1 border-b-2 border-line-soft bg-surface-2 px-2.5 py-2"
  >
    <template v-if="mine">
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
      <template v-if="authors.length > 0">
        {{ t('team.word.resetWords', { people: authorList }) }}
      </template>
    </p>
  </ConfirmModal>
</template>
