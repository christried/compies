import type { Ref } from 'vue'

/**
 * A list page's filters kept in the address (#885; first written for the game browser's, #142, #173): reload and back keep them. The state is local, so the
 * list follows every keystroke and every chip at once; the address follows it: a chip writes it at once (push), the search `q` after a short pause (replace, no
 * history entry per letter). Back and forward change the address, and the state follows it. The rule lives here once; what differs between pages is
 * `read` (the state an address holds, the page's own parameters; `q` is the search's) and `changes` (the parameters a new state changes against the old one,
 * `undefined` takes a parameter out).
 */
export function useAddressState<S extends { q: string }>(
  read: (param: (name: string) => string) => S,
  changes: (next: S, was: S) => Record<string, string | undefined>,
) {
  const route = useRoute()
  const router = useRouter()

  function param(name: string): string {
    const value = route.query[name]
    return typeof value === 'string' ? value : ''
  }
  const fromAddress = () => read(param)

  const state = ref(fromAddress()) as Ref<S>
  const addressKey = computed(() => JSON.stringify(fromAddress()))
  watch(addressKey, () => {
    const address = fromAddress()
    // Only what the address says differently: the search text keeps its spaces while the address holds it trimmed.
    state.value = { ...address, q: address.q === state.value.q.trim() ? state.value.q : address.q }
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  onBeforeUnmount(() => clearTimeout(timer))

  function write(changed: Record<string, string | undefined>, mode: 'push' | 'replace') {
    const next = { query: { ...route.query, ...changed } }
    if (mode === 'replace') router.replace(next)
    else router.push(next)
  }

  return computed<S>({
    get: () => state.value,
    set: (next) => {
      const was = state.value
      state.value = next
      clearTimeout(timer)

      const changed = changes(next, was)
      const q = next.q.trim() || undefined

      if (Object.keys(changed).length > 0) {
        // The search goes along (it may still be waiting for its pause, and „Alle“ clears it too): one history entry.
        write({ ...changed, q }, 'push')
      }
      else if (next.q !== was.q) {
        timer = setTimeout(() => write({ q }, 'replace'), 250)
      }
    },
  })
}
