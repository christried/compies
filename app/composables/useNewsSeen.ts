import { compareVersions } from '~~/shared/changelog'

// The newest Release the viewer has seen: the „Neu“ stamp on Neuigkeiten celebrates once per Release, the NewChip
// on the PageFooter's version link shows until then (10 § NewChip), and „Was ist neu“ (#184) shows what came after.
// A signed-in User's value lives on the User, so every device agrees; signed out, it is this device's localStorage.
const STORAGE_KEY = 'compies.news.seen'

/**
 * Returns the newest Release the viewer has seen (`seen`: undefined until read, then its version or null) and
 * `markSeen`. Signed in, both read and write the User's server value; signed out, localStorage `compies.news.seen`.
 */
export function useNewsSeen() {
  const user = useAuthUser()
  // Undefined until read: storage exists only in the browser, so it is read after mount.
  const device = useState<string | null | undefined>('news-seen', () => undefined)

  onMounted(() => {
    if (device.value !== undefined) return
    try {
      device.value = localStorage.getItem(STORAGE_KEY)
    }
    catch {
      // Storage blocked: nothing was seen.
      device.value = null
    }
  })

  const seen = computed(() => user.value ? user.value.newsSeen : device.value)

  async function markSeen(version: string) {
    if (user.value) {
      // Shown at once and never lowered, like the server; a failed save is only seen again after a reload.
      if (user.value.newsSeen !== null && compareVersions(version, user.value.newsSeen) <= 0) return
      user.value = { ...user.value, newsSeen: version }
      try {
        await $fetch('/api/me/news-seen', { method: 'POST', body: { version } })
      }
      catch {
        // The pop-up may show again on the next visit.
      }
      return
    }
    device.value = version
    try {
      localStorage.setItem(STORAGE_KEY, version)
    }
    catch {
      // Storage blocked: the stamp celebrates again after a reload.
    }
  }

  return { seen, markSeen }
}
