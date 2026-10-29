/**
 * Keeps a wizard step's `v-model:blocker` current (N1): `rule` returns why Weiter is blocked, or null / nothing when the
 * step can go on. Without a rule the step never blocks. The rule runs in a watchEffect, so it follows whatever it reads.
 * `defineModel` is a compiler macro and cannot live here, so the step passes its blocker model in.
 */
export function useStepBlocker(blocker: Ref<string | null>, rule?: () => string | null | undefined) {
  watchEffect(() => {
    blocker.value = rule?.() ?? null
  })
}
