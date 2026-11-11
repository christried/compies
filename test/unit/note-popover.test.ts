import { describe, expect, it } from 'vitest'
import { placeNotePopover } from '../../app/utils/note-popover'

// Where the Note popover sits next to its cell (#125): above by default, below when there is no room,
// always on screen, with the arrow still pointing at the cell.

const viewport = { width: 400, height: 800 }
const size = { width: 280, height: 100 }
const cellAt = (left: number, top = 300) => ({ top, bottom: top + 44, left, right: left + 44 })

describe('placeNotePopover', () => {
  it('sits above the cell, centred, with a 12 px gap', () => {
    const placed = placeNotePopover({ cell: cellAt(178), size, viewport })

    expect(placed.side).toBe('above')
    expect(placed.top).toBe(300 - 12 - 100)
    expect(placed.left).toBe(200 - 140)
    expect(placed.arrowLeft).toBe(140)
  })

  it('flips below when there is no room above', () => {
    const placed = placeNotePopover({ cell: cellAt(178, 60), size, viewport })

    expect(placed.side).toBe('below')
    expect(placed.top).toBe(60 + 44 + 12)
  })

  it('stays 12 px inside the right edge and the arrow still points at the cell', () => {
    const placed = placeNotePopover({ cell: cellAt(300), size, viewport })

    expect(placed.left).toBe(400 - 12 - 280)
    expect(placed.arrowLeft).toBe(322 - placed.left)
  })

  it('keeps the arrow at least 20 px inside the box', () => {
    const placed = placeNotePopover({ cell: cellAt(380), size, viewport })

    expect(placed.arrowLeft).toBe(260)
  })

  it('stays 12 px inside the left edge', () => {
    const placed = placeNotePopover({ cell: cellAt(0), size, viewport })

    expect(placed.left).toBe(12)
    expect(placed.arrowLeft).toBe(20)
  })

  it('keeps today’s placement and no cap when the box fits above or below (#494)', () => {
    const above = placeNotePopover({ cell: cellAt(178), size, viewport })
    const below = placeNotePopover({ cell: cellAt(178, 60), size, viewport })

    expect(above.maxHeight).toBeUndefined()
    expect(below.maxHeight).toBeUndefined()
  })

  // 1440 × 900, the Notes button at 430 px (#494, #488 item 1): the box fits on neither side.
  it('goes to the roomier side and caps the box at its room less the gap and the edge (#494)', () => {
    const cell = { top: 430, bottom: 466, left: 400, right: 436 }
    const placed = placeNotePopover({ cell, size: { width: 288, height: 420 }, viewport: { width: 1440, height: 900 } })

    // Below has 900 − 466 = 434 px, above 430 px: below is roomier.
    expect(placed.side).toBe('below')
    expect(placed.maxHeight).toBe(434 - 12 - 12)
    expect(placed.top).toBe(466 + 12)
  })

  it('goes above when above is the roomier side, with the box inside the window (#494)', () => {
    const cell = { top: 430, bottom: 474, left: 178, right: 222 }
    const placed = placeNotePopover({ cell, size: { width: 280, height: 420 }, viewport: { width: 400, height: 800 } })

    // Above has 430 px, below 800 − 474 = 326 px.
    expect(placed.side).toBe('above')
    expect(placed.maxHeight).toBe(430 - 12 - 12)
    expect(placed.top).toBe(12)
    expect(placed.top + placed.maxHeight!).toBeLessThanOrEqual(430 - 12)
  })

  it('caps a box below its cell when below is the roomier side (#494)', () => {
    const cell = { top: 300, bottom: 344, left: 178, right: 222 }
    const placed = placeNotePopover({ cell, size: { width: 280, height: 600 }, viewport: { width: 400, height: 800 } })

    // Above has 300 px, below 800 − 344 = 456 px.
    expect(placed.side).toBe('below')
    expect(placed.maxHeight).toBe(456 - 12 - 12)
    expect(placed.top).toBe(344 + 12)
    expect(placed.top + placed.maxHeight!).toBeLessThanOrEqual(800 - 12)
  })
})
