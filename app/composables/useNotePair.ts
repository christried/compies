import { notesHasText, type NotesDoc } from '~~/shared/notes-doc'

/**
 * The pair of notes of a game, as every place that shows them reads it (#821, review 0.16 S5): the Game notes and the Host's Event notes (#732), each `null` where
 * it is absent or has no visible character (a document without one shows nothing, #728), and the rule that comes with two blocks: the Event block's sub is the Event's
 * name, the game block's „aus deiner Bibliothek“ (#729). With one block alone there is no sub. The Event's name and its finished state come from the Event page's
 * context (useEventNotes); where there is none the Event block keeps no sub and no chip.
 */
export function useNotePair(notes: () => NotesDoc | null | undefined, eventNotes: () => NotesDoc | null | undefined) {
  const { t } = useI18n()
  const { eventName, finished } = useEventNotes()
  const visible = (doc: NotesDoc | null | undefined) => (doc && notesHasText(doc) ? doc : null)
  const doc = computed(() => visible(notes()))
  const eventDoc = computed(() => visible(eventNotes()))
  const both = computed(() => doc.value !== null && eventDoc.value !== null)
  const eventSub = computed(() => (both.value ? eventName.value : undefined))
  const gameSub = computed(() => (both.value ? t('notes.from_library') : undefined))
  return { doc, eventDoc, both, eventSub, gameSub, finished }
}
