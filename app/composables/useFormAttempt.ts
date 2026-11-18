import type { InjectionKey, Ref } from 'vue'

/**
 * A form's „a submit was tried“ flag (#797). The component that owns the form calls `provideFormAttempt()` in its setup
 * and `attempt()` where its blocked submit is swallowed; every field below it reads the flag through `useTouched`, so a
 * message that stands on a field shows red after a try. `reset()` clears it (a wizard step change).
 */
const FORM_ATTEMPT: InjectionKey<Readonly<Ref<boolean>>> = Symbol('formAttempt')

export function provideFormAttempt() {
  const attempted = ref(false)
  provide(FORM_ATTEMPT, readonly(attempted))
  return {
    attempted: readonly(attempted),
    attempt() {
      attempted.value = true
    },
    reset() {
      attempted.value = false
    },
  }
}

/** The flag of the form above, or a flag that never turns on outside a form. */
export function useFormAttempt(): Readonly<Ref<boolean>> {
  return inject(FORM_ATTEMPT, null) ?? readonly(ref(false))
}
