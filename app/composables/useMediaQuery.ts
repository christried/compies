import { onBeforeUnmount, onMounted, readonly, ref } from 'vue'

/** The md breakpoint, `--breakpoint-md` in `app/assets/css/compies-theme.css` (980 px): the desktop shell. Pinned by test/unit/md-query.test.ts (#368). */
export const MD_QUERY = '(min-width: 61.25rem)'

/** A pointer that is a mouse or a trackpad, not a finger: the hint for a keyboard shortcut shows only there (#465). */
export const FINE_POINTER_QUERY = '(pointer: fine)'

/**
 * Whether a media query matches, kept up to date. `null` until the browser has been asked (the server render and the first
 * client render), so a caller can leave out what depends on it instead of rendering the wrong layout and swapping it.
 * Where there is no `matchMedia` it settles on `false`.
 */
export function useMediaQuery(query: string) {
  const matches = ref<boolean | null>(null)
  let list: MediaQueryList | undefined
  const update = (event: { matches: boolean }) => void (matches.value = event.matches)

  onMounted(() => {
    list = typeof window.matchMedia === 'function' ? window.matchMedia(query) : undefined
    matches.value = list?.matches ?? false
    list?.addEventListener('change', update)
  })
  onBeforeUnmount(() => list?.removeEventListener('change', update))

  return readonly(matches)
}
