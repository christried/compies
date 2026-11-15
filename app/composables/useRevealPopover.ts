import type { ComputedRef, Ref } from 'vue'

// „A trigger opens a popover“ (#616, 02-components § RevealPopover): one behaviour for the hint (#515) and the game card's Tags popover (#614).
// A mouse resting on the trigger opens it, and leaving trigger and popover closes it 120 ms later; the focus opens it too, also for a tap; a
// click pins it, until a click outside, a second click on the trigger or Esc. Esc, a press outside, a scroll that would move the popover away
// from its trigger and a resize close it. The caller binds `triggerAttrs` to the trigger and `popoverAttrs` to <RevealPopover>; this knows no
// placement and no markup. It stands beside useNoteReveal (the Notes' rules differ in kind: the input type decides there, and one popover
// serves a whole matrix) and imports nothing from it.
//
// Esc closes and returns the focus to the trigger, so does a press outside that puts the focus on nothing (the page background) when the
// popover was pinned: the browser moves the focus after the press starts, so the press's click decides it (#578). A press on a field or a
// button keeps the focus there, and so do a scroll and a resize (#573). A hover-opened popover must not steal the focus from a field the
// Host types in: Esc leaves it there too.

const CLOSE_DELAY = 120

export function useRevealPopover(trigger: Ref<HTMLElement | null>): {
  open: Ref<boolean>
  popoverId: string
  triggerAttrs: ComputedRef<Record<string, unknown>>
  popoverAttrs: ComputedRef<Record<string, unknown>>
  close: () => void
} {
  const popoverId = useId()
  const open = ref(false)
  let pinned = false
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  // The focus the composable itself gives the trigger (Esc, #578) must not open the popover again.
  let programmaticFocus = false
  let ignoreScroll = false
  // The click that follows a press outside, which decides where the focus goes; armed only when that press closed a pinned popover.
  let returnFocusArmed = false

  const popoverEl = () => document.querySelector<HTMLElement>(`[data-reveal-popover="${popoverId}"]`)
  const isMouse = (event: Event) => (event as PointerEvent).pointerType === 'mouse'
  const holdsFocus = () => !!trigger.value && document.activeElement === trigger.value

  function focusTrigger() {
    programmaticFocus = true
    try {
      trigger.value?.focus()
    }
    finally {
      programmaticFocus = false
    }
  }

  function cancelClose() {
    clearTimeout(closeTimer)
    closeTimer = undefined
  }

  // The popover is fixed, so a scroll of the page or of a sheet would leave it floating beside nothing. A scroll inside the popover itself
  // (a long slot) is its own.
  function onScroll(event: Event) {
    if (ignoreScroll) return
    if (popoverEl()?.contains(event.target as Node)) return
    hide()
  }

  // On the document and in the capture phase: the game form lives in a sheet whose own Esc closes the sheet, so Esc stops here and closes
  // only the popover. And a click on the popover's text moves the focus to the body, where a handler on the trigger would miss the key.
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    const active = document.activeElement
    const keepsFocus = !!active && active !== document.body && active !== trigger.value && !popoverEl()?.contains(active)
    hide()
    if (!keepsFocus) focusTrigger()
  }

  // The trigger is left out: its own click decides (pin or close), so a press on it would close here and reopen on the click. The focus is
  // not set here: the browser moves it after this pointerdown, so a focus set now would be lost to a press on the background (#578).
  function onPointerDown(event: PointerEvent) {
    const target = event.target as Node
    if (popoverEl()?.contains(target) || trigger.value?.contains(target)) return
    const wasPinned = pinned
    hide()
    if (wasPinned) armFocusReturn()
  }

  function armFocusReturn() {
    returnFocusArmed = true
    document.addEventListener('click', onFocusReturnClick, { capture: true, once: true })
    // A press that ends without a click leaves nothing behind: the next press starts without the memory.
    document.addEventListener('pointerdown', disarmFocusReturn, { capture: true, once: true })
  }

  function disarmFocusReturn() {
    if (!returnFocusArmed) return
    returnFocusArmed = false
    document.removeEventListener('click', onFocusReturnClick, { capture: true })
    document.removeEventListener('pointerdown', disarmFocusReturn, { capture: true })
  }

  // In the capture phase, so it runs before the click reaches the field or the button the press landed on. The focus is then where the press
  // put it; if that is the body, nothing took it, and the trigger gets it back.
  function onFocusReturnClick() {
    disarmFocusReturn()
    const active = document.activeElement
    if (!active || active === document.body) focusTrigger()
  }

  function onResize() {
    hide()
  }

  // The listeners live only while it is open: a page of cards mounts dozens of these.
  function attach() {
    document.addEventListener('keydown', onKeydown, { capture: true })
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    window.addEventListener('resize', onResize)
  }

  function detach() {
    document.removeEventListener('keydown', onKeydown, { capture: true })
    document.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('scroll', onScroll, { capture: true })
    window.removeEventListener('resize', onResize)
  }

  // Scrolling closes it, except for the scroll that comes with opening it by focus: the browser scrolls a focused element into view and
  // fires that scroll event up to a frame after the handler. Two frames cover it (as useNoteReveal does).
  function ignoreScrollForAWhile() {
    ignoreScroll = true
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ignoreScroll = false
    }))
  }

  function show() {
    cancelClose()
    if (open.value) return
    disarmFocusReturn()
    open.value = true
    attach()
  }

  function hide() {
    cancelClose()
    pinned = false
    if (!open.value) return
    open.value = false
    detach()
  }

  function closeSoon() {
    cancelClose()
    closeTimer = setTimeout(() => {
      closeTimer = undefined
      if (!pinned && !holdsFocus()) hide()
    }, CLOSE_DELAY)
  }

  const onPointerenter = (event: Event) => {
    if (isMouse(event)) show()
  }
  const onPointerleave = (event: Event) => {
    if (isMouse(event) && !pinned) closeSoon()
  }

  const triggerAttrs = computed<Record<string, unknown>>(() => ({
    onPointerenter,
    onPointerleave,
    'onFocus': () => {
      if (programmaticFocus) return
      if (!open.value) ignoreScrollForAWhile()
      show()
    },
    'onBlur': () => {
      if (!pinned) hide()
    },
    'onClick': () => {
      // Unpinned (opened by hover or focus) to pinned; pinned to closed. A click on a closed trigger opens and pins it.
      if (open.value && pinned) {
        hide()
        focusTrigger()
        return
      }
      show()
      pinned = true
    },
    'aria-expanded': open.value,
    'aria-controls': open.value ? popoverId : undefined,
  }))

  const popoverAttrs = computed<Record<string, unknown>>(() => ({
    'id': popoverId,
    'data-reveal-popover': popoverId,
    onPointerenter,
    onPointerleave,
  }))

  onBeforeUnmount(() => {
    cancelClose()
    disarmFocusReturn()
    detach()
  })

  return { open, popoverId, triggerAttrs, popoverAttrs, close: hide }
}
