import { ref } from 'vue'
import { eventNotesKey, type EventNotesContext } from '~/composables/useEventNotes'

/**
 * The Event page's Event notes context (#821) for a component that is mounted on its own: `global` goes into the mount options, and `context` is the one the page
 * would hold, so a test changes it later (`context.value!.finished = true`) like a refetch does. Without a context the component sits where a Member's page, or no Event
 * page, provides none.
 */
export function eventNotesContext(overrides: Partial<EventNotesContext> = {}) {
  const context = ref<EventNotesContext | null>({ notes: null, eventName: 'Spieleabend bei Sanne', finished: false, save: null, ...overrides })
  return { context, global: { provide: { [eventNotesKey as symbol]: context } } }
}
