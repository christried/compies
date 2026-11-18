<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { riseFade } from '~/utils/motion'
import { EVENT_NOTES_MAX } from '~~/shared/event'
import { canSeeLibrary, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import type { NotesDoc } from '~~/shared/notes-doc'

// The game dialog (#443, 02-components § GameCard, deviation 0.12): a game tile's details in the sheet shell (a sheet below md, a dialog from md up),
// built from the library entry's parts (GameCover, GameFacts, GameNotes). It plays no Clip. The Host's audience has the picture, the facts (players, Suitabilities, Price
// with the day it was checked), every Tag, the Notes and „In der Bibliothek öffnen“ (for a viewer who may see the library: a Host whose permission was withdrawn would
// meet a construction page). A Member's audience (#444) has the picture, the facts (players, Suitabilities) and the Price, and never Tags, Notes or the link,
// whatever `facts` it is handed: the guard is this component's, not the caller's.
// The Host writes the game's Event notes here (#464, 18-notizen § GameDialog): the pencil on the Event block, or „Notizen für dieses Event hinzufügen“ where a game has
// none, opens the designed editor in place of the cover, the facts and the block, with the Game notes read-only below it (the game's own notes are edited in the
// library). The game's Event notes, the Event's name and whether it is finished and the page's `PUT` (`save`, which resolves to whether the server took it, after the Event was
// refetched) are the Event page's context's (useEventNotes, #821), not props. The guard is again this component's: a Member's audience, a page that provides no save and a
// finished Event have no entry, whatever they are handed.
const props = withDefaults(defineProps<{
  open: boolean
  game: PoolGameFace
  audience: 'host' | 'member'
  /** The Tags and Notes of the game, from the Host's read (`hostGames`); null where the read has none. */
  facts?: HostGameFacts | null
}>(), { facts: null })

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
const canEdit = computed(() => isHost.value && saveEventNotes.value != null && !finished.value)

// The edit: `initial` is the document at its start, `draft` what the editor holds. Both are shallow so that an editor that emitted nothing leaves `draft === initial`:
// that is „nothing typed“, and saving it sends no request.
const editing = ref(false)
const draft = shallowRef<NotesDoc | null>(null)
const initial = shallowRef<NotesDoc | null>(null)
const over = ref(false)
const saving = ref(false)
const body = useTemplateRef<HTMLElement>('body')
const blockerId = useId()

function startEdit() {
  if (!canEdit.value) return
  initial.value = draft.value = hostEventNotes.value
  over.value = false
  editing.value = true
}

/** The edit button (or the add button, after a clear) takes the focus back: the one that opened the edit is gone while it runs. */
async function focusEntry() {
  await nextTick()
  body.value?.querySelector<HTMLElement>('[data-event-notes-edit]')?.focus()
}

function cancel() {
  if (saving.value) return
  editing.value = false
  draft.value = null
  void focusEntry()
}

async function save() {
  if (over.value || saving.value || !editing.value) return
  const send = saveEventNotes.value
  if (!send) return
  if (draft.value === initial.value) return cancel()
  saving.value = true
  const taken = await send(props.game.id, draft.value)
  saving.value = false
  // A refusal keeps the edit and the draft (`send` toasted it). A dialog that closed or an Event that finished meanwhile has ended the edit already.
  if (!taken || !editing.value) return
  editing.value = false
  void focusEntry()
}

// Esc, ✗ and the scrim cancel the edit and only then close the dialog: a 2000-character note is not lost to a stray tap on the scrim.
function onClose() {
  if (editing.value) cancel()
  else emit('close')
}

// A closed dialog forgets its draft, and an edit ends when nothing may edit any more: the Event finished in another tab (the save would be `wrong_phase`),
// the Host's function gone. A refetch that brings other notes changes the context's `notes` only: the draft is local and is never overwritten, the last save wins.
watch(() => props.open, (isOpen) => {
  if (isOpen) return
  editing.value = false
  draft.value = null
})
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
          <!-- The Event block first, the game block below it, 20 px apart (#729); their subs only while both show. Where a game has no Event notes the Host's add button sits in its place. -->
          <div
            v-if="eventBlock || gameBlock || canEdit"
            class="flex min-w-0 flex-col gap-5"
          >
            <EventNotes
              v-if="eventBlock"
              :notes="eventBlock"
              :sub="eventSub"
              :finished="finished"
              :editable="canEdit"
              @edit="startEdit"
            />
            <button
              v-else-if="canEdit"
              type="button"
              data-event-notes-edit
              class="hit-44 inline-flex h-8 items-center gap-1 self-start rounded-md px-1 text-[13px] font-bold text-ink underline-offset-4 hover:underline"
              @click="startEdit"
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
            />
          </div>
        </div>
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Strg + Enter saves from inside the editor (#465) -->
        <div
          v-else
          key="edit"
          class="flex min-w-0 flex-col gap-5"
          @keydown.capture="onShortcut"
        >
          <!-- The editor is a lazy chunk and client only (#454, ADR 0019): nothing loads before the Host presses the pencil. Until it mounts the field's chrome holds its place, and a chunk that fails to load shows a retry (#822). -->
          <!-- The Host pressed the pencil: the caret belongs in the editor that just opened (#464). -->
          <!-- eslint-disable vuejs-accessibility/no-autofocus -- the Host pressed the pencil for this editor, so the caret belongs in it (#464) -->
          <RichNotesEditorLoader
            v-model="draft"
            variant="event"
            :max="EVENT_NOTES_MAX"
            :disabled="saving"
            autofocus
            @invalid="over = $event"
          />
          <!-- eslint-enable vuejs-accessibility/no-autofocus -->
          <GameNotes
            v-if="notes"
            :notes="notes"
            level="h3"
          />
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
