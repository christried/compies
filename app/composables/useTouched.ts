/**
 * Whether a field's message may show (#797): once the User edited the field (`input`) or left it (`blur`), whichever
 * comes first, and for good; or once the form tried to submit. `override` replaces the form's flag where one
 * component holds two forms (the Slot editor). A field calls `touch()` on `input` and `blur`.
 */
export function useTouched(override?: () => boolean | undefined) {
  const attempted = useFormAttempt()
  const touched = ref(false)
  const shown = computed(() => touched.value || (override?.() ?? attempted.value))
  return {
    touched,
    shown,
    touch() {
      touched.value = true
    },
  }
}
