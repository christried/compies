import type { EventView } from '~~/shared/event'

/**
 * The viewer's hold on the finished page (#445): a viewer who saw the page waiting for the Award ceremony keeps it waiting while the first run plays for them, so the
 * side panel does not spoil the ceremony on a desktop, until their run is over (`release`, from the layer's `over`: its end frame, a skip or a close). The read alone cannot
 * say whether a viewer saw the page pending, so the latch lives in the page's session: `sawPending` is set by a read of a finished Event that has not been shown and never
 * resets. A page that loads with the ceremony stored (a late joiner, a reload, a missed start) never saw it pending and shows everything at once, as does the page after a
 * restart: the release stays. Client-only state, nothing is sent.
 */
export function useCeremonyHold(view: Readonly<Ref<Pick<EventView, 'ceremonyShown'> & { event: Pick<EventView['event'], 'phase'> } | null | undefined>>) {
  const sawPending = ref(false)
  const released = ref(false)
  watch(() => view.value, (read) => {
    if (read?.event.phase === 'finished' && !read.ceremonyShown) sawPending.value = true
  }, { immediate: true })
  const held = computed(() => sawPending.value && !released.value && view.value?.ceremonyShown === true)
  function release() {
    released.value = true
  }
  return { held: readonly(held), release }
}
