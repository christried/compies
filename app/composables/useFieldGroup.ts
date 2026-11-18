import type { InjectionKey } from 'vue'

/**
 * Inputs that form a group share one message line under the group, as wide as the group (#797). `FieldGroup` calls
 * `provideFieldGroup()`; a member calls `useGroupMember(message)` with a function that returns its message while that
 * message shows (touched or a submit tried). Members register in mount order, which is the visual order, and the line
 * shows the first message that is shown, once.
 */
interface FieldGroupContext {
  errorId: string
  register: (message: () => string | undefined) => void
}

const FIELD_GROUP: InjectionKey<FieldGroupContext> = Symbol('fieldGroup')

export function provideFieldGroup() {
  const errorId = `${useId()}-error`
  const members = shallowReactive<(() => string | undefined)[]>([])
  const error = computed(() => members.map(message => message()).find(Boolean))
  provide(FIELD_GROUP, {
    errorId,
    register(message) {
      members.push(message)
      onScopeDispose(() => {
        members.splice(members.indexOf(message), 1)
      })
    },
  })
  return { errorId, error }
}

/** Registers a field in the group above it, if there is one; returns the id of the group's line, or null outside a group. */
export function useGroupMember(message: () => string | undefined): string | null {
  const group = inject(FIELD_GROUP, null)
  group?.register(message)
  return group?.errorId ?? null
}
