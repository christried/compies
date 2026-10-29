// Picking a person up on the Game board with pointer events (#160, 02-components § GameBoard): a mouse or a pen picks
// up after a few pixels, a finger after a long press of 300 ms so that scrolling the page never drags (a finger that
// moves before that is scrolling and lets go). While held, the person follows the pointer, the places that take them
// light up, and letting go over one moves them. The board decides what takes whom (`accepts`) and what a drop does;
// this only follows the pointer. No library: the rest of the move is the same code the MoveToMenu uses.

/** How long a finger rests on a person before it picks them up. */
export const LONG_PRESS_MS = 300
/** How far a mouse moves before a press becomes a drag. */
const DRAG_DISTANCE = 4
/** How far a finger may move during the long press before it counts as scrolling. */
const SCROLL_DISTANCE = 10

export interface DragOptions {
  /** Whether the viewer may pick this person up. */
  canDrag: (userId: string) => boolean
  /** The key of the place under the point, or null. */
  zoneAt: (x: number, y: number) => string | null
  /** Whether this person may go to that place. */
  accepts: (userId: string, zoneKey: string) => boolean
  /** Let go over a place that takes the person. */
  drop: (userId: string, zoneKey: string) => void
  /** Let go anywhere else (or cancelled): the person is `dx`, `dy` away from where they stood and goes home. */
  release: (userId: string, dx: number, dy: number) => void
}

export function useBoardDrag(options: DragOptions) {
  /** The person in the hand and how far the pointer has taken them. */
  const dragging = ref<{ userId: string, dx: number, dy: number } | null>(null)
  /** The key of the place the person is held over, if it takes them. */
  const overZone = ref<string | null>(null)

  let press: { userId: string, pointerId: number, x: number, y: number, touch: boolean, timer?: ReturnType<typeof setTimeout> } | null = null
  let justDragged = false

  /** True right after a drag ended, so the click that follows the pointer going up does not open the menu. */
  const wasDragged = () => justDragged

  function listen() {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeydown)
  }

  function unlisten() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKeydown)
  }

  function finish() {
    clearTimeout(press?.timer)
    press = null
    dragging.value = null
    overZone.value = null
    unlisten()
  }

  function start(event: PointerEvent, userId: string) {
    if (event.button !== 0 || !options.canDrag(userId)) return
    finish()
    const touch = event.pointerType === 'touch'
    press = { userId, pointerId: event.pointerId, x: event.clientX, y: event.clientY, touch }
    if (touch) press.timer = setTimeout(pickUp, LONG_PRESS_MS)
    listen()
  }

  function pickUp() {
    if (press) dragging.value = { userId: press.userId, dx: 0, dy: 0 }
  }

  function onMove(event: PointerEvent) {
    if (!press || event.pointerId !== press.pointerId) return
    const dx = event.clientX - press.x
    const dy = event.clientY - press.y
    const distance = Math.hypot(dx, dy)
    if (!dragging.value) {
      if (press.touch && distance > SCROLL_DISTANCE) finish()
      else if (!press.touch && distance > DRAG_DISTANCE) pickUp()
      if (!dragging.value) return
    }
    dragging.value = { userId: press.userId, dx, dy }
    const key = options.zoneAt(event.clientX, event.clientY)
    overZone.value = key !== null && options.accepts(press.userId, key) ? key : null
  }

  function end(drop: boolean) {
    const held = dragging.value
    const target = overZone.value
    finish()
    if (!held) return
    justDragged = true
    setTimeout(() => (justDragged = false))
    if (drop && target !== null) options.drop(held.userId, target)
    else options.release(held.userId, held.dx, held.dy)
  }

  function onUp(event: PointerEvent) {
    if (press && event.pointerId === press.pointerId) end(true)
  }

  function onCancel(event: PointerEvent) {
    if (press && event.pointerId === press.pointerId) end(false)
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') end(false)
  }

  // A finger that has picked someone up must not scroll the page with it. The listener has to be non-passive to be
  // allowed to stop the scroll, and it is on from the start because a browser decides at the first touch.
  function onTouchMove(event: TouchEvent) {
    if (dragging.value && event.cancelable) event.preventDefault()
  }

  onMounted(() => window.addEventListener('touchmove', onTouchMove, { passive: false }))
  onBeforeUnmount(() => {
    window.removeEventListener('touchmove', onTouchMove)
    finish()
  })

  return { dragging, overZone, start, wasDragged }
}
