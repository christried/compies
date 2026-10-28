import type { Ref } from 'vue'
import type { VoteValue } from '~~/shared/poll'

// How a Note in the matrix is revealed (#125). The input type decides, not the width: a mouse gets the popover
// (hover or focus), touch and pen get the dialog from the tap, the keyboard gets the popover on focus and the
// dialog on Enter or Space. Only the last input counts: a document-level capture listener remembers whether
// the last event was a pointer (and which kind) or a key.
export interface RevealPerson {
  id: string
  name: string
  image: string | null
}

export interface RevealEntry {
  key: string
  person: RevealPerson
  vote: VoteValue
  note: string
  el: HTMLElement
}

type InputKind = 'mouse' | 'touch' | 'pen' | 'keyboard'

export function useNoteReveal(scrollBox: Ref<HTMLElement | null>) {
  const active = ref<RevealEntry | null>(null)
  const mode = ref<'popover' | 'dialog' | null>(null)

  let lastInput: InputKind = 'keyboard'
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  let ignoreScroll = false
  let skipNextFocus = false

  function cancelClose() {
    clearTimeout(closeTimer)
  }

  function openPopover(next: RevealEntry) {
    cancelClose()
    active.value = next
    mode.value = 'popover'
  }

  function closePopover() {
    cancelClose()
    if (mode.value !== 'popover') return
    mode.value = null
    active.value = null
  }

  // The pointer may move from the cell onto the popover (WCAG 1.4.13), so closing waits a moment. Focus still holds
  // the popover, though: blur or Esc close it then.
  function closePopoverSoon() {
    cancelClose()
    closeTimer = setTimeout(() => {
      if (active.value?.el === document.activeElement) return
      closePopover()
    }, 120)
  }

  // Focus goes back to the cell then, which must not open its popover again.
  function closeDialog() {
    skipNextFocus = true
    mode.value = null
    active.value = null
  }

  // Scrolling closes the popover, except for the scroll that comes with opening it: focus (ours or the browser's own,
  // which scrolls the box before the handler runs) fires its scroll event up to a frame later. Two frames cover it.
  function ignoreScrollForAWhile() {
    ignoreScroll = true
    requestAnimationFrame(() => requestAnimationFrame(() => {
      ignoreScroll = false
    }))
  }

  // A cell partly under the sticky name column or past the right edge is scrolled into view first.
  function scrollIntoReach(el: HTMLElement) {
    const box = scrollBox.value
    const rowHeader = el.closest('tr')?.querySelector('th')
    if (!box || !rowHeader) return
    const hidden = box.getBoundingClientRect().left + rowHeader.getBoundingClientRect().width - el.getBoundingClientRect().left
    const cut = el.getBoundingClientRect().right - box.getBoundingClientRect().right
    const by = hidden > 0 ? -(hidden + 8) : cut > 0 ? cut + 8 : 0
    if (by === 0) return
    box.scrollLeft += by
  }

  function handlersFor(person: RevealPerson, slotId: string, vote: VoteValue, note: string) {
    const entryFor = (el: EventTarget | null): RevealEntry => ({ key: `${person.id}|${slotId}`, person, vote, note, el: el as HTMLElement })
    return {
      pointerenter: (event: PointerEvent) => {
        if (event.pointerType === 'mouse') openPopover(entryFor(event.currentTarget))
      },
      pointerleave: (event: PointerEvent) => {
        if (event.pointerType === 'mouse') closePopoverSoon()
      },
      focus: (event: FocusEvent) => {
        if (skipNextFocus) {
          skipNextFocus = false
          return
        }
        if (lastInput === 'touch' || lastInput === 'pen') return
        const el = event.currentTarget as HTMLElement
        ignoreScrollForAWhile()
        scrollIntoReach(el)
        openPopover(entryFor(el))
      },
      blur: closePopover,
      keydown: (event: KeyboardEvent) => {
        if (event.key === 'Escape') closePopover()
      },
      click: (event: MouseEvent) => {
        if (lastInput === 'mouse') return
        const el = event.currentTarget as HTMLElement
        closePopover()
        // A tap doesn't focus a button on iOS; the dialog returns focus to whatever had it.
        el.focus({ preventScroll: true })
        active.value = entryFor(el)
        mode.value = 'dialog'
      },
    }
  }

  function onPointerDown(event: PointerEvent) {
    lastInput = event.pointerType === 'touch' || event.pointerType === 'pen' ? event.pointerType : 'mouse'
    skipNextFocus = false
  }
  function onKeyDown() {
    lastInput = 'keyboard'
    skipNextFocus = false
  }
  function onScroll() {
    if (!ignoreScroll) closePopover()
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    // Capture: it also hears the matrix's own scroll box.
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', onScroll, { capture: true })
    cancelClose()
  })

  return { active, mode, handlersFor, cancelClose, closePopoverSoon, closeDialog }
}
