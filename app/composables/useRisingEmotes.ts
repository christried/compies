import { emoteSeen } from '~/utils/emote-seen'
import type { EmoteId } from '~~/shared/emote'

/** One Emote on its way up: where it rises from is the sender's avatar button, found when it arrived. */
export interface RisingEmote {
  key: number
  emote: EmoteId
  userId: string
  anchor: HTMLElement
}

/**
 * The Emotes the page is drawing (#668): `rise` puts one above its sender's avatar, `done` takes it away when its animation ends. The avatar is found in the document
 * (`[data-user-id]`, which only the Game board's person carries, as `GameBoard.personEl` finds it); with none there (the board is not mounted, the Member is not in the
 * read yet, the Event is finished, a phone's other view) nothing is drawn, and nothing is said. Nothing is drawn either where the board is not seen (#769, `emoteSeen`): with a
 * cover up (`options.covered`), the tab hidden or the avatar outside the window. Each Emote is its own element: no cap and no queue, the room's rules bound the rate, and an
 * Emote that is not seen is dropped, never held for later.
 */
export function useRisingEmotes(options: { covered: () => boolean }) {
  const rising = ref<RisingEmote[]>([])
  let counter = 0

  /** Puts the Emote above its sender's avatar, or drops it (false) when there is no avatar or the board is not seen: decided now, never queued (#769). */
  function rise(userId: string, emote: EmoteId): boolean {
    // Matched by the attribute's value, not spliced into a selector: the id comes off the wire.
    const anchor = [...document.querySelectorAll<HTMLElement>('[data-user-id]')].find(element => element.dataset.userId === userId)
    if (!anchor) return false
    const { left, top, right, bottom } = anchor.getBoundingClientRect()
    const seen = emoteSeen({
      covered: options.covered(),
      hidden: document.visibilityState === 'hidden',
      box: { left, top, right, bottom },
      view: { width: window.innerWidth, height: window.innerHeight },
    })
    if (!seen) return false
    counter += 1
    rising.value.push({ key: counter, emote, userId, anchor })
    return true
  }

  function done(key: number) {
    rising.value = rising.value.filter(entry => entry.key !== key)
  }

  return { rising, rise, done }
}
