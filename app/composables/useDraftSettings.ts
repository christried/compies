import type { EventDraft } from '~/utils/event-draft'

/** The draft's settings as a writable ref, for the steps that edit them (Format, Game count, points table): assigning replaces them in the draft. */
export function useDraftSettings(draft: Ref<EventDraft>) {
  return computed({
    get: () => draft.value.settings,
    set: (settings) => {
      draft.value = { ...draft.value, settings }
    },
  })
}
