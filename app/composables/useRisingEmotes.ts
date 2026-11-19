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
 * read yet, the Event is finished) nothing is drawn, and nothing is said. Each Emote is its own element: no cap and no queue, the room's rules bound the rate.
 */
export function useRisingEmotes() {
  const rising = ref<RisingEmote[]>([])
  let counter = 0

  function rise(userId: string, emote: EmoteId): boolean {
    // Matched by the attribute's value, not spliced into a selector: the id comes off the wire.
    const anchor = [...document.querySelectorAll<HTMLElement>('[data-user-id]')].find(element => element.dataset.userId === userId)
    if (!anchor) return false
    counter += 1
    rising.value.push({ key: counter, emote, userId, anchor })
    return true
  }

  function done(key: number) {
    rising.value = rising.value.filter(entry => entry.key !== key)
  }

  return { rising, rise, done }
}
