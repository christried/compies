// The behaviour of a header dropdown (UserMenu, AppearanceMenu; #617): open state, arrow-key walk over the visible items, Esc, an outside
// pointerdown, and the focus going back to the trigger. The component's root binds `ref="root"` and `@keydown.esc / .down / .up`.
// `itemSelector` picks the items in the walk; `initialFocus` picks the one a freshly opened menu focuses (default: the first).
export function useDropdownMenu(options: { itemSelector: string, initialFocus?: () => HTMLElement | undefined }) {
  const open = ref(false)
  const root = useTemplateRef<HTMLElement>('root')

  // Items hidden by CSS (the footer links below md, on desktop) are skipped.
  function menuItems() {
    return [...(root.value?.querySelectorAll<HTMLElement>(options.itemSelector) ?? [])]
      .filter(item => item.checkVisibility?.() ?? true)
  }

  async function toggle() {
    open.value = !open.value
    if (open.value) {
      await nextTick()
      ;(options.initialFocus?.() ?? menuItems()[0])?.focus()
    }
  }

  /** Closes and gives the focus back to the trigger: the element with `aria-haspopup="menu"` in the root. */
  function close() {
    open.value = false
    root.value?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus()
  }

  function move(step: 1 | -1, event: KeyboardEvent) {
    const items = menuItems()
    if (!items.length) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length
    items[next]!.focus()
  }

  function closeOnOutside(event: Event) {
    if (open.value && !root.value?.contains(event.target as Node)) open.value = false
  }

  onMounted(() => document.addEventListener('pointerdown', closeOnOutside))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutside))

  return { open, toggle, close, move, menuItems }
}
