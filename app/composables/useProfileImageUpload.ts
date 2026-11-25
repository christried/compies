import { toCardWebp } from '~/utils/image-resize'
import type { SavedProfileImage } from '~~/shared/auth'
import { CENTRE_CROP, PROFILE_IMAGE_TARGET } from '~~/shared/image'

// The Profile picture's upload on the card „Profil“ (#678): the picked file is cut to its centre and made a 256 × 256 WebP in the browser (`pick`), then
// sent through `PUT /api/me/image` (`send`). `send` stands apart from `pick` so the crop by hand can send its own blob (#910). Nothing is published; the
// User's own picture follows `useAuthUser`, and others read the new one at their next load (ADR 0013).
export function useProfileImageUpload() {
  const user = useAuthUser()
  const converting = ref(false)
  const uploading = ref(false)
  /** What went wrong with the last pick or send; cleared by the next one. The old picture stays either way. */
  const failure = ref<'convert' | 'upload' | null>(null)
  const busy = computed(() => converting.value || uploading.value)

  async function send(blob: Blob) {
    if (busy.value) return
    failure.value = null
    uploading.value = true
    try {
      const response = await $fetch<SavedProfileImage>('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: blob })
      // Only the address is taken: a snapshot of the whole User can carry an older Appearance (#404).
      if (user.value) user.value = { ...user.value, image: response.image, hasOwnImage: true }
      failure.value = null
    }
    catch {
      failure.value = 'upload'
    }
    finally {
      uploading.value = false
    }
  }

  async function pick(file: File) {
    if (busy.value) return
    failure.value = null
    converting.value = true
    let blob: Blob
    try {
      blob = (await toCardWebp(file, CENTRE_CROP, PROFILE_IMAGE_TARGET)).blob
    }
    catch {
      failure.value = 'convert'
      return
    }
    finally {
      converting.value = false
    }
    await send(blob)
  }

  return { busy, converting, uploading, failure, pick, send }
}
