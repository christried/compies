import type { Ref } from 'vue'

// Focus handling for modal dialogs (02-components § Sheet, § ConfirmModal): focus moves in when the
// dialog opens, Tab stays inside it, and focus returns to the trigger when it closes. Escape is
// wired by the dialog itself through `onKeydown`.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialog(open: Ref<boolean>, container: Ref<HTMLElement | null>, onClose: () => void) {
  let returnFocus: HTMLElement | null = null

  function focusables(): HTMLElement[] {
    return [...(container.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
  }

  watch(open, async (isOpen) => {
    if (isOpen) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      const initial = container.value?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0]
      initial?.focus()
    }
    else {
      returnFocus?.focus()
      returnFocus = null
    }
  })

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) return
    const first = items[0]!
    const last = items[items.length - 1]!
    const active = document.activeElement
    if (event.shiftKey && (active === first || !container.value?.contains(active))) {
      event.preventDefault()
      last.focus()
    }
    else if (!event.shiftKey && (active === last || !container.value?.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  return { onKeydown }
}
