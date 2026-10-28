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
})
