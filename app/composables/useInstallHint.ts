import { computed, onMounted, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { installHint, laterEntry, parseEntry, platformOf, PWA_STORAGE_KEY, type Platform, type PwaEntry } from '~/utils/install-hint'

/** What the browser tells about the device, read once the page is mounted. */
interface Device {
  platform: Platform
  installed: boolean
  entry: PwaEntry
  /** The device's own clock: this is a hint on a device, not a Session rule (ADR 0013 does not apply). */
  now: Date
}

/** Safari's own flag for a page opened from the Home screen; not in the DOM typings. */
type StandaloneNavigator = Navigator & { standalone?: boolean }

/** The stored entry; blocked or broken storage reads as no entry (the banner shows). */
function readEntry(): PwaEntry {
  try {
    return parseEntry(localStorage.getItem(PWA_STORAGE_KEY))
  }
  catch {
    return { kind: 'none' }
  }
}

/**
 * Home's install hint (#676, spec #927 § The install hint): the one home of the device facts and the stored entry `compies-pwa`; the rule is the pure
 * `installHint`. The facts are read after mount (`null` until then, so the server render and the first client render show nothing and hydration
 * never mismatches). `accepted` lives with this component: „Installiert“ lasts until the User leaves Home, then the browser's prompt is used up and
 * nothing is stored for it.
 *
 * On iPhone and iPad (#929) „Installieren“ opens the three steps in a sheet (`sheet`), and closing it, however it is closed, is `done()`.
 */
export function useInstallHint(hasPlayed: MaybeRefOrGetter<boolean>) {
  const device = ref<Device | null>(null)
  const accepted = ref(false)
  const sheet = ref(false)
  const installPrompt = useInstallPrompt()

  onMounted(() => {
    const standaloneFlag = (navigator as StandaloneNavigator).standalone === true
    const query = (text: string) => typeof window.matchMedia === 'function' && window.matchMedia(text).matches
    device.value = {
      platform: platformOf({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, coarsePointer: query('(pointer: coarse)') }),
      installed: query('(display-mode: standalone)') || standaloneFlag,
      entry: readEntry(),
      now: new Date(),
    }
  })

  const hint = computed(() => {
    const facts = device.value
    if (!facts) return { kind: 'none' } as const
    return installHint({ ...facts, promptHeld: installPrompt.held.value, accepted: accepted.value, hasPlayed: toValue(hasPlayed) })
  })

  /** „Installieren“: opens the browser's prompt (Android) or the iOS steps (iPhone and iPad, #929); an accepted install says „Installiert“. */
  async function install() {
    if (hint.value.kind !== 'banner') return
    if (hint.value.via === 'sheet') sheet.value = true
    else accepted.value = (await installPrompt.prompt()) === 'accepted'
  }

  /** Stores the entry for this device and hides the banner at once; blocked storage keeps it for this page view only. */
  function remember(entry: string) {
    const facts = device.value
    if (!facts) return
    device.value = { ...facts, entry: parseEntry(entry) }
    try {
      localStorage.setItem(PWA_STORAGE_KEY, entry)
    }
    catch {
      // Nothing is stored: the banner shows again on the next load.
    }
  }

  /** „Später“: the banner hides at once and the day is stored. */
  function later() {
    const facts = device.value
    if (!facts) return
    remember(laterEntry(facts.now))
  }

  /** Closing the iOS sheet, however it is closed: `done` is stored, so the banner does not come back on this device (#929). */
  function done() {
    sheet.value = false
    remember('done')
  }

  return { hint, sheet, install, later, done }
}
