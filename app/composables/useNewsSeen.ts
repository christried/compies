// The newest Release this device has seen on Neuigkeiten (09 § NewStamp, § VersionLabel): the „Neu“ stamp
// celebrates once per Release, and the version label in the user menu carries a dot until then.
const STORAGE_KEY = 'compies.news.seen'

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
