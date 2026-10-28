// The newest Release this device has seen on Neuigkeiten (09 § NewStamp): the „Neu“ stamp celebrates once per
// Release, and the NewChip on the PageFooter's version link (in the footer and the phone menu) shows until then (10 § NewChip).
const STORAGE_KEY = 'compies.news.seen'

/** Returns the newest Release this device has seen on Neuigkeiten (`seen`: undefined until read, then its version or null) and `markSeen`, stored in localStorage under `compies.news.seen`. */
export function useNewsSeen() {
  // Undefined until read: storage exists only in the browser, so it is read after mount.
  const seen = useState<string | null | undefined>('news-seen', () => undefined)

  onMounted(() => {
    try {
      seen.value = localStorage.getItem(STORAGE_KEY)
    }
    catch {
      // Storage blocked: nothing was seen.
      seen.value = null
    }
  })

  function markSeen(version: string) {
    seen.value = version
    try {
      localStorage.setItem(STORAGE_KEY, version)
    }
    catch {
      // Storage blocked: the stamp celebrates again after a reload.
    }
  }

  return { seen: readonly(seen), markSeen }
}
