import type { Ref } from 'vue'

// What is open on the page (#647): the state of a sheet, a dialog or a menu is private to its component, and the Tour waits for a calm
// page (spec #622), so each of them adds itself to one count while it is open. `useDialog`, `useDropdownMenu` and MoveToMenu's popover
// call `track` (a new overlay that opens by a click must too, or the Tour starts over it, #785); hover and pin popovers are not tracked (the Tour's rule does not list them). The count is `useState`, so a server render shares none with the next.

/** `busy` is true while any tracked layer is open; `track(open)` (call it in `setup`) counts one layer, on the client only. */
export function useOpenLayers() {
  const count = useState('open-layers', () => 0)

  function track(open: Ref<boolean>) {
    if (!import.meta.client) return
    let held = false
    const set = (value: boolean) => {
      if (value === held) return
      held = value
      count.value += value ? 1 : -1
    }
    watch(open, set, { immediate: true })
    // A component removed while open never sees `open` turn false.
    onScopeDispose(() => set(false))
  }

  return { busy: computed(() => count.value > 0), track }
}
