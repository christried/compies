<script setup lang="ts">
import { canSeeLibrary, type HostGameFacts, type PoolGameFace } from '~~/shared/game'
import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

// The game dialog (#443, 02-components § GameCard, deviation 0.12): a game tile's details in the sheet shell (a sheet below md, a dialog from md up), read-only,
// built from the library entry's parts (GameCover, GameFacts, GameNotes). It plays no Clip. The Host's audience has the picture, the facts (players, Suitabilities, Price
// with the day it was checked), every Tag, the Notes and „In der Bibliothek öffnen“ (for a viewer who may see the library: a Host whose permission was withdrawn would
// meet a construction page). A Member's audience (#444) has the picture, the facts (players, Suitabilities) and the Price, and never Tags, Notes or the link,
// whatever `facts` it is handed: the guard is this component's, not the caller's.
const props = withDefaults(defineProps<{
  open: boolean
  game: PoolGameFace
  audience: 'host' | 'member'
  /** The Tags and Notes of the game, from the Host's read (`hostGames`); null where the read has none. */
  facts?: HostGameFacts | null
  /** The Host's Event notes of this game (#732), above the Game notes; the Host's audience only, like `facts`. */
  eventNotes?: NotesDoc | null
  /** The Event's name, the sub of the game block's neighbour (#729); given by the page that holds it, and shown only where both blocks do. */
  eventName?: string
  /** The Event is finished (#729): its notes block shows the dashed frame and the chip. */
  eventFinished?: boolean
}>(), { facts: null, eventNotes: null, eventName: undefined, eventFinished: false })

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const user = useAuthUser()
const isHost = computed(() => props.audience === 'host')
const tags = computed(() => (isHost.value ? props.facts?.tags ?? [] : []))
const notes = computed(() => (isHost.value ? props.facts?.notes ?? null : null))
const hostEventNotes = computed(() => (isHost.value ? props.eventNotes ?? null : null))
const bothBlocks = computed(() => notesHasText(hostEventNotes.value) && notesHasText(notes.value))
const library = computed(() => isHost.value && canSeeLibrary(user.value))
</script>

<template>
  <AppSheet
    :open="open"
    :title="game.name"
    @close="emit('close')"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <GameCover :game="game" />
      <GameFacts
        :game="game"
        :tags="tags"
      />
      <!-- The Event block first, the game block below it, 20 px apart (#729); their subs only while both show. -->
      <div
        v-if="notesHasText(hostEventNotes) || notesHasText(notes)"
        class="flex min-w-0 flex-col gap-5"
      >
        <EventNotes
          v-if="hostEventNotes"
          :notes="hostEventNotes"
          :sub="bothBlocks ? eventName : undefined"
          :finished="eventFinished"
        />
        <GameNotes
          v-if="notes"
          :notes="notes"
          level="h3"
          :sub="bothBlocks ? t('notes.from_library') : undefined"
        />
      </div>
    </div>
    <template
      v-if="library"
      #footer
    >
      <AppButton
        :to="`/bibliothek/${game.id}`"
        variant="secondary"
      >
        {{ t('gameDialog.openLibrary') }}
      </AppButton>
    </template>
  </AppSheet>
</template>
