import { DRAG_DISTANCE, LONG_PRESS_MS, SCROLL_DISTANCE } from './useBoardDrag'

// Picking up a row of a vertical list with pointer events (#273, the result sheet). useBoardDrag drops a person on a named zone and knows
// nothing of an ordered list; this one needs the index under the pointer. The rules are the same: a mouse or a pen picks up after a few
// pixels, a finger after a long press so that scrolling never drags (a finger that moves before that is scrolling and lets go), and
// Escape cancels. While held, the row follows the pointer (`dragging.dy`) and the list stays as it is; `dropIndex` is the row under the
// pointer, and letting go calls `move(from, dropIndex)`. There is no auto-scroll at the list's edge: the arrow buttons are the way there.

/** The row a point at `y` is over: how many row middles lie above it, clamped to the list (0 to the last row). */
export function rowIndexAt(y: number, middles: readonly number[]): number {
  const above = middles.filter(middle => middle < y).length
  return Math.min(above, Math.max(middles.length - 1, 0))
}

export interface RowDragOptions {
  /** How many rows the list has; with fewer than two there is nothing to move. */
  rowCount: () => number
  /** The vertical middle of each row on the screen, top to bottom, read once when a row is picked up (the rows stand still while one is held). */
  rowMiddles: () => number[]
  /** Let go over another row: row `from` goes to place `to`. */
  move: (from: number, to: number) => void
}

export function useRowDrag(options: RowDragOptions) {
  /** The row in the hand and how far the pointer has taken it down (negative: up). */
  const dragging = ref<{ index: number, dy: number } | null>(null)
  /** The row the held one would take the place of; null while nothing is held. */
  const dropIndex = ref<number | null>(null)

  let middles: number[] = []
  let press: { index: number, pointerId: number, x: number, y: number, touch: boolean, timer?: ReturnType<typeof setTimeout> } | null = null

  function listen() {
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    // Capture phase: Escape cancels the drag and must not also close the sheet the list sits in.
    window.addEventListener('keydown', onKeydown, true)
  }

  function unlisten() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKeydown, true)
  }

  function finish() {
    clearTimeout(press?.timer)
    press = null
    dragging.value = null
    dropIndex.value = null
    unlisten()
  }

  function start(event: PointerEvent, index: number) {
    if (event.button !== 0 || options.rowCount() < 2) return
    finish()
    const touch = event.pointerType === 'touch'
    press = { index, pointerId: event.pointerId, x: event.clientX, y: event.clientY, touch }
    if (touch) press.timer = setTimeout(pickUp, LONG_PRESS_MS)
    listen()
  }

  function pickUp() {
    if (!press) return
    middles = options.rowMiddles()
    dragging.value = { index: press.index, dy: 0 }
    dropIndex.value = press.index
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
    dragging.value = { index: press.index, dy }
    dropIndex.value = rowIndexAt(event.clientY, middles)
  }

  function end(drop: boolean) {
    const held = dragging.value
    const target = dropIndex.value
    finish()
    if (drop && held && target !== null && target !== held.index) options.move(held.index, target)
  }

  function onUp(event: PointerEvent) {
    if (press && event.pointerId === press.pointerId) end(true)
  }

  function onCancel(event: PointerEvent) {
    if (press && event.pointerId === press.pointerId) end(false)
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !dragging.value) return
    event.stopPropagation()
    end(false)
  }

  onBeforeUnmount(finish)

  return { dragging, dropIndex, start }
}
