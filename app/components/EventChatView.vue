<script setup lang="ts">
// A phone's third view of the Event page (11-event-seite § TabBar, #765): the Chat alone, under its title, with the place of the page's Head taken by that title, as
// EventActivityView does for the feed. The page's tab bar switches to it (useEventTabs) and puts the Chat in the slot: the view is the frame, the Chat is the side panel's.
const { t } = useI18n()

const card = ref<HTMLElement>()

// A phone's keyboard does not resize the layout viewport everywhere, so the composer would sit under it. While a field of the view has focus the card follows the visual
// viewport, as RichNotesEditor does: the room below the card's top, and `scrollIntoView` brings it into sight. `visualViewport` can be absent, so everything is guarded.
let stopKeyboard: (() => void) | undefined
function fitKeyboard() {
  const viewport = window.visualViewport
  const el = card.value
  if (!viewport || !el) return
  const keyboardUp = window.innerHeight - viewport.height > 120
  if (!keyboardUp) {
    el.style.removeProperty('height')
    el.style.removeProperty('min-height')
    return
  }
  const room = Math.max(160, viewport.height - (el.getBoundingClientRect().top - viewport.offsetTop) - 8)
  el.style.setProperty('height', `${room}px`)
  el.style.setProperty('min-height', `${room}px`)
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' })
}
function onFocusIn() {
  stopKeyboard?.()
  const viewport = window.visualViewport
  if (!viewport) return
  fitKeyboard()
  viewport.addEventListener('resize', fitKeyboard)
  stopKeyboard = () => {
    viewport.removeEventListener('resize', fitKeyboard)
    card.value?.style.removeProperty('height')
    card.value?.style.removeProperty('min-height')
    stopKeyboard = undefined
  }
}
function onFocusOut(event: FocusEvent) {
  // From the field to the send button the keyboard stays, and the card must not jump under the finger.
  if (event.relatedTarget instanceof Node && card.value?.contains(event.relatedTarget)) return
  stopKeyboard?.()
}
onBeforeUnmount(() => stopKeyboard?.())
</script>

<template>
  <section
    aria-labelledby="chat-title"
    class="flex flex-col gap-3"
  >
    <h1
      id="chat-title"
      class="m-0 font-display text-[34px] leading-none font-normal"
    >
      {{ t('nav.tabs.chat') }}
    </h1>
    <div
      ref="card"
      class="flex h-[calc(100dvh-17rem)] min-h-72 flex-col rounded-[16px] border-(length:--cp-bw) border-line bg-surface"
      @focusin="onFocusIn"
      @focusout="onFocusOut"
    >
      <slot />
    </div>
  </section>
</template>
