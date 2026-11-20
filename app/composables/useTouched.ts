/**
 * When a field's message shows (#797): once the User edited the field (`input`) or left it (`blur`), whichever
 * comes first, and for good; or once the form tried to submit. Takes the field's problem as a getter and returns the
 * message as it shows (undefined until then) and `touch`, which a field calls on `input` and `blur`. `override`
 * replaces the form's flag where one component holds two forms (the Slot editor).
 */
export function useTouched(error: () => string | undefined, override?: () => boolean | undefined) {
  const attempted = useFormAttempt()
  const touched = ref(false)
  const message = computed(() => (touched.value || (override?.() ?? attempted.value) ? error() : undefined))
  return {
    message,
    touch() {
      touched.value = true
    },
  }
}
