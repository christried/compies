export interface EmoteSight {
  /** The Clip or the Tour is up: the page behind it is inert (`covered` of `EventPage.vue`). */
  covered: boolean
  /** The tab is hidden (`document.visibilityState`). */
  hidden: boolean
  /** The avatar button's box in window coordinates (`getBoundingClientRect`). */
  box: { left: number, top: number, right: number, bottom: number }
  /** The window's size (`window.innerWidth`, `window.innerHeight`). */
  view: { width: number, height: number }
}

/**
 * Whether an Emote that arrives is drawn (#769, spec #719 § C): only where the Game board is seen, that is with no cover up, the tab visible and the sender's avatar inside
 * the window. It is decided on arrival and never queued: an Emote that is not seen is dropped, and is not drawn late when the cover leaves, the avatar returns or the tab
 * comes back. A box with no size is an element with no layout, and one that only touches the window's edge shows nothing of it.
 */
export function emoteSeen({ covered, hidden, box, view }: EmoteSight): boolean {
  if (covered || hidden) return false
  if (!(box.right > box.left && box.bottom > box.top)) return false
  return box.right > 0 && box.left < view.width && box.bottom > 0 && box.top < view.height
}
