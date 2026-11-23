// The Round card's „Notizen“ remember on this device whether the Host left them open or closed (#838, spec #856): one entry in the browser's local
// storage, `compies-round-notes`, `open` or `closed`, for every Round card of every Event, read by the Round card's notes alone. Without the entry,
// with anything else in it, or with storage blocked, the notes are open, as they were before. Sound's setting (`useSound`) is the prior art.
const STORAGE_KEY = 'compies-round-notes'
/** The attribute on <html> that holds the stored choice from before the first paint until the page has taken it over. */
const ATTRIBUTE = 'data-round-notes'

// The server has no local storage, so it renders the notes open, and a Host who closed them would see them open until hydration, then flip. This
// script in the <head> runs before the body is parsed, so before the first paint: it puts the stored `closed` on <html>, and the `round-notes-closed`
// variant (compies-theme.css) hides the panel and turns the chevron back by that attribute alone. Once the page has taken the choice over
// (`onMounted` below) the attribute goes and the state itself shows it. The script only reads; a blocked storage throws and is ignored.
const FIRST_PAINT_SCRIPT = `try{if(localStorage.getItem('${STORAGE_KEY}')==='closed')document.documentElement.setAttribute('${ATTRIBUTE}','closed')}catch(e){}`

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'closed'
  }
  catch {
    // Storage blocked: open, as without an entry.
    return true
  }
}

/**
 * Whether the Round card's notes are open, one state for every Round card on the page, and `set` to change it and keep it on this device. On the
 * server and while the page hydrates it is open, the markup the server wrote; the stored choice is taken over once mounted, and the head script has
 * hidden the panel in the meantime, so nothing flips. A card created after hydration reads the entry in its setup, before its first render.
 */
export function useRoundNotesMemory() {
  const open = useState('round-notes-open', () => true)
  const nuxtApp = useNuxtApp()
  const hydrating = import.meta.server || nuxtApp.isHydrating

  if (import.meta.server) {
    useHead({ script: [{ key: 'round-notes-first-paint', innerHTML: FIRST_PAINT_SCRIPT }] })
  }
  else if (!hydrating) {
    open.value = read()
  }

  onMounted(async () => {
    if (!hydrating) return
    open.value = read()
    // The leave of the panel is cut while the attribute still hides it (GameNotesDisclosure); one tick later the render is done.
    await nextTick()
    document.documentElement.removeAttribute(ATTRIBUTE)
  })

  function set(value: boolean) {
    open.value = value
    try {
      localStorage.setItem(STORAGE_KEY, value ? 'open' : 'closed')
    }
    catch {
      // Storage blocked: the choice lasts until reload.
    }
  }

  /** True while the head script's `closed` still hides the panel: a panel that goes now has nothing to animate. */
  const hiddenByScript = () => import.meta.client && document.documentElement.getAttribute(ATTRIBUTE) === 'closed'

  return { open: readonly(open), set, hiddenByScript }
}
