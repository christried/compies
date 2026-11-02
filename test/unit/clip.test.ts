import { describe, expect, it } from 'vitest'
import { clipPosition, clipWindow } from '../../shared/clip'

// The clip's rule (#230, spec #218 § Clip): it starts at the draw's stop and runs for the game's clip length; the second of the
// video to play now follows from the start second and the time since the start.

const STOP = Date.parse('2090-10-30T10:00:07.500Z')

describe('clipWindow', () => {
  it('starts at the stop and ends the clip length later', () => {
    expect(clipWindow({ stopAt: STOP }, { clipLength: 30 })).toEqual({ startAt: STOP, endsAt: STOP + 30_000 })
  })

  it('takes an instant as a Date or an ISO string too', () => {
    expect(clipWindow({ stopAt: new Date(STOP) }, { clipLength: 5 })).toEqual({ startAt: STOP, endsAt: STOP + 5_000 })
    expect(clipWindow({ stopAt: '2090-10-30T10:00:07.500Z' }, { clipLength: 60 })).toEqual({ startAt: STOP, endsAt: STOP + 60_000 })
  })
})

describe('clipPosition', () => {
  const clip = { ...clipWindow({ stopAt: STOP }, { clipLength: 30 }), game: { clipStart: 90 } }

  it('is null before the clip starts', () => {
    expect(clipPosition(clip, STOP - 1)).toBeNull()
  })

  it('is the start second at the start', () => {
    expect(clipPosition(clip, STOP)).toBe(90)
  })

  it('moves on with the time: a late joiner lands on the second everybody else is at', () => {
    expect(clipPosition(clip, STOP + 12_500)).toBe(102.5)
    expect(clipPosition(clip, STOP + 29_999)).toBeCloseTo(119.999, 3)
  })

  it('is null from the end on', () => {
    expect(clipPosition(clip, STOP + 30_000)).toBeNull()
    expect(clipPosition(clip, STOP + 45_000)).toBeNull()
  })
})
