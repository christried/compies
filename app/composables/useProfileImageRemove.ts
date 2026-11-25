import type { RemovedProfileImage } from '~~/shared/auth'

// Takes the uploaded Profile picture away on the card „Profil“ (#911): `remove` sends `DELETE /api/me/image`, and the picture the provider gives (or the
// initial) shows at once, with no reload. It does nothing while the upload is busy (`busy`, from useProfileImageUpload) or a removal is on its way.
// Nothing is published; others read the change at their next load (ADR 0013).
export function useProfileImageRemove(busy: Readonly<Ref<boolean>>) {
  const user = useAuthUser()
  const removing = ref(false)
  /** The last removal failed; cleared by the next call. The own picture stays either way. */
  const failed = ref(false)

  async function remove() {
    if (removing.value || busy.value) return
    failed.value = false
    removing.value = true
    try {
      const response = await $fetch<RemovedProfileImage>('/api/me/image', { method: 'DELETE' })
      // Only these fields are taken: a snapshot of the whole User can carry an older Appearance (#404).
      if (user.value) user.value = { ...user.value, image: response.image, hasOwnImage: false }
    }
    catch {
      failed.value = true
    }
    finally {
      removing.value = false
    }
  }

  return { removing, failed, remove }
}
