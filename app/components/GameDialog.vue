<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { riseFade } from '~/utils/motion'
import { EVENT_NOTES_MAX, type EventNotesChange } from '~~/shared/event'
import { canSeeLibrary, GAME_NOTES_MAX, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import type { NotesDoc } from '~~/shared/notes-doc'

// The game dialog (#443, 02-components § GameCard, deviation 0.12): a game tile's details in the sheet shell (a sheet below md, a dialog from md up),
// built from the library entry's parts (GameCover, GameFacts, GameNotes). It plays no Clip. The Host's audience has the picture, the facts (players, Suitabilities, Price
// with the day it was checked), every Tag, the Notes and „In der Bibliothek öffnen“ (for a viewer who may see the library: a Host whose permission was withdrawn would
// meet a construction page). A Member's audience (#444) has the picture, the facts (players, Suitabilities) and the Price, and never Tags, Notes or the link,
// whatever `facts` it is handed: the guard is this component's, not the caller's.
// The Host writes the game's notes here (#464, #835, 18-notizen § GameDialog): the pencil on a block, „Notizen für dieses Event hinzufügen“ where a game has Game notes and
// no Event notes, or „Notizen hinzufügen“ where it has neither, opens the designed editors in place of the cover, the facts and the blocks: the Event notes first, the Game
// notes under them, with one „Speichern“ that sends only what changed in one request. The game's Event notes, the Event's name and whether it is finished and the page's `PUT`
// (`save`, which resolves to whether the server took it, after the Event was refetched) are the Event page's context's (useEventNotes, #821), not props. The guard is again
// this component's, per field (`canEditEvent`, `canEditGame`): a Member's audience and a page that provides no save have no entry and no edit, a finished Event has them for the Game
// notes alone (#857: the Event notes show as their frozen block, in the edit mode too, and are never sent), whatever they are handed, and `edit` (the tiles' and the Round
// card's way into the edit mode) opens no editor the dialog would not allow.
const props = withDefaults(defineProps<{
  open: boolean
  game: PoolGameFace
  audience: 'host' | 'member'
  /** The Tags and Notes of the game, from the Host's read (`hostGames`); null where the read has none. */
  facts?: HostGameFacts | null
  /** Open straight into the edit mode with this field focused (#835): read each time `open` turns true, never while the dialog stays open; null opens the view mode. */
  edit?: 'event' | 'game' | null
}>(), { facts: null, edit: null })

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const user = useAuthUser()
const isHost = computed(() => props.audience === 'host')
const tags = computed(() => (isHost.value ? props.facts?.tags ?? [] : []))
const notes = computed(() => (isHost.value ? props.facts?.notes ?? null : null))
const { notesOf, finished, save: saveEventNotes } = useEventNotes()
const hostEventNotes = computed(() => (isHost.value ? notesOf(props.game.id) : null))
// The Game notes and the Event notes as a pair (the blank rule and the subs of two blocks are useNotePair's); the dialog lays them out itself: the pencil, the add button and the edit swap are its own.
const { doc: gameBlock, eventDoc: eventBlock, eventSub, gameSub } = useNotePair(() => notes.value, () => hostEventNotes.value)
const library = computed(() => isHost.value && canSeeLibrary(user.value))
// Who may edit what, per field: a finished Event freezes the Event notes alone (#857), the Game notes are the game's own in the library and stay editable.
const canEditGame = computed(() => isHost.value && saveEventNotes.value != null)
const canEditEvent = computed(() => canEditGame.value && !finished.value)
const canEdit = computed(() => canEditGame.value)
// Where no pencil is on screen the Host gets „Notizen hinzufügen“: neither block is there to edit (no notes at all, or a finished Event with no Game notes).
const noPencil = computed(() => canEdit.value && !(eventBlock.value && canEditEvent.value) && !gameBlock.value)

// The edit: `initial*` is the document at its start, `draft*` what the editor holds, one pair per field. Both are shallow so that an editor that emitted nothing leaves
// `draft === initial`: that is „nothing typed“, and a field nobody typed in is not sent. The documents are the blocks' (a blank one counts as none).
const editing = ref(false)
const draftEvent = shallowRef<NotesDoc | null>(null)
const initialEvent = shallowRef<NotesDoc | null>(null)
const draftGame = shallowRef<NotesDoc | null>(null)
const initialGame = shallowRef<NotesDoc | null>(null)
const overEvent = ref(false)
const overGame = ref(false)
const over = computed(() => overEvent.value || overGame.value)
// The field of the entry that opened the edit: its editor gets the caret and its entry takes the focus back.
const focusField = ref<'event' | 'game'>('event')
const saving = ref(false)
const body = useTemplateRef<HTMLElement>('body')
const blockerId = useId()

function startEdit(field: 'event' | 'game') {
  if (!canEdit.value) return
  initialEvent.value = draftEvent.value = eventBlock.value
  initialGame.value = draftGame.value = gameBlock.value
  overEvent.value = overGame.value = false
  focusField.value = field === 'event' && !canEditEvent.value ? 'game' : field
  editing.value = true
}

/** The entry that opened the edit takes the focus back, else the first one there: the add button is gone after a first save, and a pencil after a clear. */
async function focusEntry() {
  await nextTick()
  const entries = [...(body.value?.querySelectorAll<HTMLElement>('[data-notes-edit]') ?? [])]
  const entry = entries.find(candidate => candidate.dataset.notesEdit === focusField.value) ?? entries[0]
  entry?.focus()
}

function forgetDrafts() {
  editing.value = false
  draftEvent.value = draftGame.value = null
}

function cancel() {
  if (saving.value) return
  forgetDrafts()
  void focusEntry()
}

async function save() {
  if (over.value || saving.value || !editing.value) return
  const send = saveEventNotes.value
  if (!send) return
  // Only what changed goes out: one request for both fields, none when neither changed.
  const change: EventNotesChange = {}
  if (canEditEvent.value && draftEvent.value !== initialEvent.value) change.notes = draftEvent.value
  if (canEditGame.value && draftGame.value !== initialGame.value) change.gameNotes = draftGame.value
  if (Object.keys(change).length === 0) return cancel()
  saving.value = true
  const taken = await send(props.game.id, change)
  saving.value = false
  // A refusal keeps the edit and both drafts (`send` toasted it). A dialog that closed or an Event that finished meanwhile has ended the edit already.
  if (!taken || !editing.value) return
  editing.value = false
  void focusEntry()
}

// Esc, ✗ and the scrim cancel the edit and only then close the dialog: a 2000-character note is not lost to a stray tap on the scrim.
function onClose() {
  if (editing.value) cancel()
  else emit('close')
}

// A closed dialog forgets its drafts, and an edit ends when nothing may edit any more: the Event finished in another tab (the save would be `wrong_phase`),
// the Host's function gone. A refetch that brings other notes changes the context's `notes` and the `facts` only: the drafts are local and are never overwritten, the last save wins.
// `edit` is read each time the dialog opens (#835, the seam of the tiles and the Round card): it opens the field it names, or the Game field where the Event field may not be
// edited, and nothing where no field may be.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return forgetDrafts()
  if (props.edit) startEdit(props.edit)
}, { immediate: true })
watch(canEdit, (allowed) => {
  if (!allowed) editing.value = false
})

// Strg + Enter, and ⌘ + Enter on a Mac, saves from inside the editor, as the game form does (#465, GameForm.vue): the capture listener runs before the editor's own
// Enter. `save` itself saves nothing while the limit blocks it or a save runs, and a held key is swallowed.
function onShortcut(event: KeyboardEvent) {
  if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.isComposing) return
  event.preventDefault()
  event.stopPropagation()
  if (event.repeat) return
  void save()
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="game.name"
    :tall="editing"
    @close="onClose"
  >
    <div
      ref="body"
      class="flex min-w-0 flex-col gap-3"
    >
      <!-- The swap fades its entering content (04-motion § Notizen, deviation: no height Flip, which needs GSAP, and GSAP loads on the Event page only before a run, ADR 0015). -->
      <Transition
        :css="false"
        @enter="riseFade"
      >
        <div
          v-if="!editing"
          key="view"
          class="flex min-w-0 flex-col gap-3"
        >
          <GameCover :game="game" />
          <GameFacts
            :game="game"
            :tags="tags"
          />
          <!-- The Event block first, the game block below it, 20 px apart (#729); their subs only while both show, a pencil on each block for the Host (#835). Where a game has Game notes and no Event notes the Host's add button sits above the game block, where it has neither one button „Notizen hinzufügen“ stands alone. -->
          <div
            v-if="eventBlock || gameBlock || canEdit"
            class="flex min-w-0 flex-col gap-5"
          >
            <EventNotes
              v-if="eventBlock"
              :notes="eventBlock"
              :sub="eventSub"
              :finished="finished"
              :editable="canEditEvent"
              @edit="startEdit('event')"
            />
            <button
              v-else-if="gameBlock && canEditEvent"
              type="button"
              data-notes-edit="event"
              class="hit-44 inline-flex h-8 items-center gap-1 self-start rounded-md px-1 text-[13px] font-bold text-ink underline-offset-4 hover:underline"
              @click="startEdit('event')"
            >
              <AppIcon
                :icon="Plus"
                :size="14"
              />
              {{ t('eventNotes.add') }}
            </button>
            <GameNotes
              v-if="gameBlock"
              :notes="gameBlock"
              level="h3"
              :sub="gameSub"
              :editable="canEditGame"
              :edit-label="t('notes.edit_a11y')"
              @edit="startEdit('game')"
            />
            <button
              v-if="noPencil"
              type="button"
              data-notes-edit="both"
              class="hit-44 inline-flex h-8 items-center gap-1 self-start rounded-md px-1 text-[13px] font-bold text-ink underline-offset-4 hover:underline"
              @click="startEdit('event')"
            >
              <AppIcon
                :icon="Plus"
                :size="14"
              />
              {{ t('notes.add') }}
            </button>
          </div>
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Strg + Enter saves from inside the editor (#465) -->
        <div
          v-else
          key="edit"
          class="flex min-w-0 flex-col gap-5"
          @keydown.capture="onShortcut"
        >
          <!-- The editors are lazy chunks and client only (#454, ADR 0019): nothing loads before the Host presses an entry. Until one mounts the field's chrome holds its place, and a chunk that fails to load shows a retry (#822). -->
          <!-- The Host pressed an entry: the caret belongs in the editor of its field (#464, #835), the other one is left alone. -->
          <!-- eslint-disable vuejs-accessibility/no-autofocus -- the Host pressed the entry for this editor, so the caret belongs in it (#464) -->
          <RichNotesEditorLoader
            v-if="canEditEvent"
            v-model="draftEvent"
            variant="event"
            :max="EVENT_NOTES_MAX"
            :disabled="saving"
            :autofocus="focusField === 'event'"
            @invalid="overEvent = $event"
          />
          <!-- A finished Event's Event notes stay what they are in the view, the frozen block with its chip (#857): they are shown, where the game has some, and never edited. -->
          <EventNotes
            v-else-if="eventBlock"
            :notes="eventBlock"
            :finished="finished"
          />
          <RichNotesEditorLoader
            v-if="canEditGame"
            v-model="draftGame"
            variant="game"
            :max="GAME_NOTES_MAX"
            :disabled="saving"
            :autofocus="focusField === 'game'"
            @invalid="overGame = $event"
          />
          <!-- eslint-enable vuejs-accessibility/no-autofocus -->
        </div>
      </Transition>
    </div>
    <template
      v-if="editing || library"
      #footer
    >
      <div
        v-if="editing"
        class="flex flex-col gap-2"
      >
        <div class="flex gap-3 md:justify-end">
          <AppButton
            variant="secondary"
            size="lg"
            class="max-md:hidden"
            @click="cancel"
          >
            {{ t('common.cancel') }}
          </AppButton>
          <AppButton
            size="lg"
            class="max-md:w-full"
            :aria-disabled="over || saving"
            :aria-describedby="over ? blockerId : undefined"
            @click="save"
          >
            {{ t('common.save') }}
          </AppButton>
        </div>
        <span
          v-if="over"
          :id="blockerId"
          class="text-small font-bold text-error-fg"
        >{{ t('notesEditor.saveBlocked') }}</span>
      </div>
      <AppButton
        v-else
        :to="`/bibliothek/${game.id}`"
        variant="secondary"
      >
        {{ t('gameDialog.openLibrary') }}
      </AppButton>
    </template>
  </AppSheet>
</template>
