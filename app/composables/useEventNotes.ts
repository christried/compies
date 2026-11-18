import type { ComputedRef, InjectionKey } from 'vue'
import type { NotesDoc } from '~~/shared/notes-doc'

/** Saves one game's Event notes, `null` clears them (#464); resolves to whether the server took it. */
export type SaveEventNotes = (gameId: string, notes: NotesDoc | null) => Promise<boolean>

/**
 * What the Host's Event page knows about the Event notes (#732, GLOSSARY: Event notes): the map by game id, the Event's name and whether it is finished (the
 * notes blocks' sub and frozen look, #729) and the page's `PUT` (#464). One object, so the tiles and the dialogs that show or edit the notes read it where they
 * need it and no component between the page and them carries four props (#821, review 0.16 S6).
 */
export interface EventNotesContext {
  notes: Record<string, NotesDoc> | null
  eventName: string
  finished: boolean
  save: SaveEventNotes | null
}

export const eventNotesKey: InjectionKey<ComputedRef<EventNotesContext | null>> = Symbol('eventNotes')

/** The Event page provides the context for the Host and `null` for a Member (nothing of the Event notes reaches a Member's page). */
export function provideEventNotes(source: () => EventNotesContext | null) {
  provide(eventNotesKey, computed(source))
}

/** Reads the Event page's context; outside an Event page, or on a Member's, there are no notes, no name, no finished state and no save. */
export function useEventNotes() {
  const context = inject(eventNotesKey, null)
  return {
    /** The Host's Event notes of a game, `null` where there are none. */
    notesOf: (gameId: string): NotesDoc | null => context?.value?.notes?.[gameId] ?? null,
    eventName: computed(() => context?.value?.eventName),
    finished: computed(() => context?.value?.finished ?? false),
    save: computed(() => context?.value?.save ?? null),
  }
}
