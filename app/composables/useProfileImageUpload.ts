import { toCardWebp } from '~/utils/image-resize'
import type { SavedProfileImage } from '~~/shared/auth'
import { CENTRE_CROP, PROFILE_IMAGE_TARGET } from '~~/shared/image'

// The Profile picture's upload on the card „Profil“ (#678, #910): the picked file is cut to its centre and made a 256 × 256 WebP in the browser (`pick`; it
// tells the card the picture's size and fails early), the card's crop makes its own WebPs, and the one the User saves is sent through `PUT /api/me/image`
// (`send`). Nothing is published; the User's own picture follows `useAuthUser`, and others read the new one at their next load (ADR 0013).
export function useProfileImageUpload() {
  const user = useAuthUser()
  const converting = ref(false)
  const uploading = ref(false)
  /** What went wrong with the last pick or send; cleared by the next one. The old picture stays either way. */
  const failure = ref<'convert' | 'upload' | null>(null)
  const busy = computed(() => converting.value || uploading.value)

  /** True when the PUT answered; false (and `failure` set) when it did not, and false with no request while busy. */
  async function send(blob: Blob): Promise<boolean> {
    if (busy.value) return false
    failure.value = null
    uploading.value = true
    try {
      const response = await $fetch<SavedProfileImage>('/api/me/image', { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: blob })
      // Only the address is taken: a snapshot of the whole User can carry an older Appearance (#404).
      if (user.value) user.value = { ...user.value, image: response.image, hasOwnImage: true }
      failure.value = null
      return true
    }
    catch {
      failure.value = 'upload'
      return false
    }
    finally {
      uploading.value = false
    }
  }

  /** The file at the centre crop (its WebP and size), or null after `failure` is set to 'convert'. Sends nothing (#910). */
  async function pick(file: File): Promise<{ blob: Blob, width: number, height: number } | null> {
    if (busy.value) return null
    failure.value = null
    converting.value = true
    try {
      return await toCardWebp(file, CENTRE_CROP, PROFILE_IMAGE_TARGET)
    }
    catch {
      failure.value = 'convert'
      return null
    }
    finally {
      converting.value = false
    }
  }

  return { busy, converting, uploading, failure, pick, send }
}
