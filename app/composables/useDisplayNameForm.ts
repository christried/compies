import type { MaybeRefOrGetter } from 'vue'
import { parseDisplayName, type SavedProfile } from '~~/shared/auth'

// The Display name's form, once for profile setup (einrichten.vue, screen 03) and the card „Profil“ (ProfileCard.vue, #399): the
// typed name, why it can't be sent, the save through `POST /api/profile/setup` and its failure. A page keeps its layout, its help
// text and its button; its template mounts a `TextField` with `ref="field"` and `v-model="displayName"`.
// `saved` is the name stored now: given, a save of the same name (after trimming) is not sent, as on Profil. Without it, any
// name that isn't empty is sent, as at setup.
export function useDisplayNameForm(options: { initial: string, saved?: MaybeRefOrGetter<string> }) {
  const user = useAuthUser()
  const displayName = ref(options.initial)
  const missing = computed(() => displayName.value.trim() === '')
  const parsed = computed(() => parseDisplayName(displayName.value))
  // Active only for a valid name that differs from the saved one after trimming (#399).
  const canSave = computed(() => parsed.value !== null && (options.saved === undefined || parsed.value !== toValue(options.saved)))
  const saving = ref(false)
  const saveFailed = ref(false)
  const field = useTemplateRef<{ focus: () => void }>('field')

  /**
   * Sends the name. An empty one focuses the field instead. `onSaved` runs inside the save, so `saving` holds until it is done
   * (setup navigates on). Resolves true when the name was stored; false when nothing was sent or the save failed.
   */
  async function save(onSaved?: () => unknown) {
    if (missing.value) {
      field.value?.focus()
      return false
    }
    if ((options.saved !== undefined && !canSave.value) || saving.value) return false
    saving.value = true
    saveFailed.value = false
    try {
      const response = await $fetch<SavedProfile>('/api/profile/setup', { method: 'POST', body: { displayName: displayName.value } })
      // Only the name is taken from the answer: its snapshot of the User can still carry the Appearance from before a choice
      // made while this save was on its way, and replacing the User would put that one back (#404).
      user.value = user.value ? { ...user.value, displayName: response.user.displayName } : response.user
      await onSaved?.()
      return true
    }
    catch {
      saveFailed.value = true
      return false
    }
    finally {
      saving.value = false
    }
  }

  return { displayName, missing, canSave, saving, saveFailed, field, save }
}
