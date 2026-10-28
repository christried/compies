// Where the Note popover sits next to its cell (02-components § NotePopover, #125). Pure, so it can be tested
// without a layout engine: the caller measures the rects.
interface Rect { top: number, bottom: number, left: number, right: number }

export interface NotePopoverPlacement {
  top: number
  left: number
  side: 'above' | 'below'
  /** The arrow's centre, in px from the box's left edge. */
  arrowLeft: number
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
  const above = cell.top - GAP - size.height
  const side = above < EDGE ? 'below' : 'above'
  const centre = (cell.left + cell.right) / 2
  const left = clamp(centre - size.width / 2, EDGE, Math.max(EDGE, viewport.width - EDGE - size.width))
  return {
    top: side === 'above' ? above : cell.bottom + GAP,
    left,
    side,
    arrowLeft: clamp(centre - left, ARROW_INSET, size.width - ARROW_INSET),
  }
}
