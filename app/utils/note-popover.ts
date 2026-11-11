// Where the Note popover sits next to its cell (02-components § NotePopover, #125). Pure, so it can be tested
// without a layout engine: the caller measures the rects.
interface Rect { top: number, bottom: number, left: number, right: number }

export interface NotePopoverPlacement {
  top: number
  left: number
  side: 'above' | 'below'
  /** The arrow's centre, in px from the box's left edge. */
  arrowLeft: number
  /**
   * Set only when the box fits on neither side (#494): the room of the roomier side less the gap and the edge. The caller caps the
   * box at it, so the box scrolls and stays inside the window.
   */
  maxHeight?: number
}

const GAP = 12
const EDGE = 12
const ARROW_INSET = 20

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function placeNotePopover({ cell, size, viewport }: {
  cell: Rect
  size: { width: number, height: number }
  viewport: { width: number, height: number }
}): NotePopoverPlacement {
  // Above first, as before; below when the box does not fit above. Fits neither (#494): the roomier side, capped.
  const roomAbove = cell.top
  const roomBelow = viewport.height - cell.bottom
  const fitsAbove = roomAbove - GAP - size.height >= EDGE
  const fitsBelow = roomBelow - GAP - size.height >= EDGE
  let side: NotePopoverPlacement['side'] = 'above'
  let maxHeight: number | undefined
  if (!fitsAbove) {
    side = fitsBelow || roomBelow > roomAbove ? 'below' : 'above'
    if (!fitsBelow) maxHeight = (side === 'above' ? roomAbove : roomBelow) - GAP - EDGE
  }
  const height = maxHeight ?? size.height
  const centre = (cell.left + cell.right) / 2
  const left = clamp(centre - size.width / 2, EDGE, Math.max(EDGE, viewport.width - EDGE - size.width))
  return {
    top: side === 'above' ? cell.top - GAP - height : cell.bottom + GAP,
    left,
    side,
    arrowLeft: clamp(centre - left, ARROW_INSET, size.width - ARROW_INSET),
    maxHeight,
  }
}
