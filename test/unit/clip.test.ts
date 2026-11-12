import { describe, expect, it } from 'vitest'
import { clipPosition } from '../../shared/clip'
import { clipWindow } from '../../shared/draw-timeline'

// The clip's rule (#230, spec #218 § Clip): it starts at the draw's stop and runs for the game's clip length; the second of the
// video to play now follows from the start second and the time since the start.

const STOP = Date.parse('2090-10-30T10:00:07.500Z')

describe('clipPosition', () => {
  const clip = { ...clipWindow({ stopAt: STOP }, { youtubeId: 'aaaaaaaaaaa', clipLength: 30 }), game: { clipStart: 90 } }

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

  it('decides the start and the end the same for a number, a Date and an ISO string', () => {
    const at = (ms: number) => [ms, new Date(ms), new Date(ms).toISOString()]
    for (const now of at(STOP - 1)) expect(clipPosition(clip, now)).toBeNull()
    for (const now of at(STOP)) expect(clipPosition(clip, now)).toBe(90)
    for (const now of at(STOP + 30_000 - 1)) expect(clipPosition(clip, now)).toBeCloseTo(119.999, 3)
    for (const now of at(STOP + 30_000)) expect(clipPosition(clip, now)).toBeNull()
  })
})
