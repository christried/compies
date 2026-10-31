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
