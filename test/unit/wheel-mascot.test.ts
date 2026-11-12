import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mascotBox, mascotMoments, mascotPhase } from '../../app/utils/wheel-mascot'
import { revealStage, removalEnd, removalEase } from '../../app/utils/wheel'

// Compibert at the wheel (#526, hand-off note 16 § Lucky Wheel · Compibert): his place in a spin as a pure function of the server's time and the
// spin's two instants, so every device, a late joiner and a returning tab included, shows him in the same state at the same time (ADR 0013).
// The lengths are the spin's real ones (6 to 10 s, #520): the brake is at 0.6 of the length, never at a constant.

const START = Date.UTC(2090, 10, 7, 20, 0, 0)
const LENGTHS = [6000, 7000, 8500, 10_000]
const spinOf = (length: number) => ({ spinStartAt: START, stopAt: START + length })
const phase = (length: number, offset: number, hidden = false, reduced = false) => mascotPhase(spinOf(length), hidden, reduced, START + offset)

describe.each(LENGTHS)('a spin of %i ms', (length) => {
  const brake = (length * 3) / 5

  it('is absent before the spin starts and from the first millisecond on has Compibert excited', () => {
    expect(phase(length, -1)).toBeNull()
    expect(phase(length, -5000)).toBeNull()
    expect(phase(length, 0)).toEqual({ stage: 'in', state: 'excited' })
  })

  it('arrives in 0.45 s and is then simply there', () => {
    expect(phase(length, 449)?.stage).toBe('in')
    expect(phase(length, 450)).toEqual({ stage: 'on', state: 'excited' })
  })

  it('is excited until 0.6 of the length, then holds its breath', () => {
    expect(phase(length, brake - 1)?.state).toBe('excited')
    expect(phase(length, brake)?.state).toBe('suspense')
    expect(phase(length, length - 1)?.state).toBe('suspense')
  })

  it('cheers at the stop for 1.6 s, then is idle', () => {
    expect(phase(length, length)).toEqual({ stage: 'on', state: 'cheer' })
    expect(phase(length, length + 1599)?.state).toBe('cheer')
    expect(phase(length, length + 1600)).toEqual({ stage: 'on', state: 'idle' })
  })

  it('leaves with the slice at the stop + 2.2 s, in 0.4 s, and is gone after', () => {
    expect(phase(length, length + 2199)).toEqual({ stage: 'on', state: 'idle' })
    expect(phase(length, length + 2200)).toEqual({ stage: 'out', state: 'idle' })
    expect(phase(length, length + 2599)?.stage).toBe('out')
    expect(phase(length, length + 2600)).toBeNull()
    expect(phase(length, length + 60_000)).toBeNull()
  })

  it('under a Hidden wheel holds suspense until the stop + 0.5 s, then cheers, is idle at + 2.1 s and leaves at + 2.8 s', () => {
    expect(phase(length, length, true)).toEqual({ stage: 'on', state: 'suspense' })
    expect(phase(length, length + 499, true)?.state).toBe('suspense')
    expect(phase(length, length + 500, true)?.state).toBe('cheer')
    expect(phase(length, length + 2099, true)?.state).toBe('cheer')
    expect(phase(length, length + 2100, true)?.state).toBe('idle')
    expect(phase(length, length + 2799, true)?.stage).toBe('on')
    expect(phase(length, length + 2800, true)?.stage).toBe('out')
    expect(phase(length, length + 3199, true)?.stage).toBe('out')
    expect(phase(length, length + 3200, true)).toBeNull()
  })

  it('has the same times under reduced motion, which fades in 0.22 s and out in 0.22 s', () => {
    expect(phase(length, 0, false, true)).toEqual({ stage: 'in', state: 'excited' })
    expect(phase(length, 219, false, true)?.stage).toBe('in')
    expect(phase(length, 220, false, true)?.stage).toBe('on')
    expect(phase(length, brake, false, true)?.state).toBe('suspense')
    expect(phase(length, length, false, true)?.state).toBe('cheer')
    expect(phase(length, length + 2199, false, true)?.stage).toBe('on')
    expect(phase(length, length + 2200, false, true)?.stage).toBe('out')
    expect(phase(length, length + 2419, false, true)?.stage).toBe('out')
    expect(phase(length, length + 2420, false, true)).toBeNull()
  })

  it('has under a Hidden wheel and reduced motion the cheer at the stop + 0.5 s (the note), and the removal at + 2.8 s', () => {
    expect(phase(length, length + 499, true, true)?.state).toBe('suspense')
    expect(phase(length, length + 500, true, true)?.state).toBe('cheer')
    expect(phase(length, length + 2800, true, true)?.stage).toBe('out')
    expect(phase(length, length + 3019, true, true)?.stage).toBe('out')
    expect(phase(length, length + 3020, true, true)).toBeNull()
  })

  it('is, for a late joiner, simply there in the state of that moment: the entrance is over, nothing is replayed', () => {
    expect(phase(length, brake + 50)).toEqual({ stage: 'on', state: 'suspense' })
    expect(phase(length, length + 800)).toEqual({ stage: 'on', state: 'cheer' })
    expect(phase(length, length + 1700)).toEqual({ stage: 'on', state: 'idle' })
  })
})

describe('the moments', () => {
  it('put the brake at 3.6 s of a 6 s spin and at 6 s of a 10 s spin', () => {
    expect(mascotMoments(spinOf(6000), false, false).brakeAt - START).toBe(3600)
    expect(mascotMoments(spinOf(10_000), false, false).brakeAt - START).toBe(6000)
  })

  it('leave at the instant the drawn slice starts to leave, and are gone before the others have closed the gap', () => {
    for (const hidden of [false, true]) {
      const spin = spinOf(7000)
      const { leaveAt, goneAt } = mascotMoments(spin, hidden, false)
      expect(removalEase(spin, leaveAt, hidden, false)).toBe(0)
      expect(removalEase(spin, leaveAt + 1, hidden, false)).toBeGreaterThan(0)
      expect(goneAt).toBeLessThan(removalEnd(spin, hidden))
    }
  })

  it('cheer a Hidden wheel at the instant the drawn label turns into the game', () => {
    const spin = spinOf(8000)
    const { cheerAt } = mascotMoments(spin, true, false)
    expect(revealStage(spin, cheerAt - 1, false).stage).toBe('placeholder')
    expect(revealStage(spin, cheerAt, false).stage).toBe('morph')
  })
})

describe('what he is told', () => {
  it('is the two instants, whether the wheel is hidden, whether motion is reduced and the time: nothing of the draw', () => {
    // A slice, a result, a label or a name has no place in the arguments, so no draw can change the answer (CODING_STANDARDS § Secrecy).
    expect(mascotPhase.length).toBe(4)
    expect(mascotMoments.length).toBe(3)
    const spin = { spinStartAt: START, stopAt: START + 8000, slices: 30, resultIndex: 29, resultOffset: 0.9 }
    const bare = { spinStartAt: START, stopAt: START + 8000 }
    for (const offset of [0, 4000, 8000, 9000, 11_000]) {
      expect(mascotPhase(spin, false, false, START + offset)).toEqual(mascotPhase(bare, false, false, START + offset))
    }
  })
})

// How far past the wheel's right edge each width's box stands: `mascotBox` keeps it to itself, the tests pin the places it gives.
const OVERHANG = { md: 112, sm: 8 }

describe('mascotBox', () => {
  it('keeps the overhang to itself: the box is its size, top, travel and left', () => {
    for (const width of ['md', 'sm'] as const) expect(Object.keys(mascotBox(width)).sort()).toEqual(['left', 'size', 'top', 'travel'])
  })

  it('stands 232 px at the upper right of the wheel from md up: 300 px from the left of a 420 px wheel, 112 past its right edge', () => {
    const box = mascotBox('md')
    expect(box).toMatchObject({ size: 232, top: 18 })
    expect(box.left).toBe('max(50% + 24px, 100% - 120px)')
    expect(Math.max(420 / 2 + 24, 420 - (box.size - OVERHANG.md))).toBe(300)
  })

  it('stands 150 px, 20 px above the wheel and 8 px past its right edge below md: 190 px from the left of a 332 px wheel', () => {
    const box = mascotBox('sm')
    expect(box).toMatchObject({ size: 150, top: -20 })
    expect(box.left).toBe('max(50% + 24px, 100% - 142px)')
    expect(Math.max(332 / 2 + 24, 332 - (box.size - OVERHANG.sm))).toBe(190)
  })

  it('stays right of the flapper (the wheel\'s centre + 24 px) at every wheel width the card can give', () => {
    for (const [width, wheel] of [['md', 420], ['md', 300], ['sm', 340], ['sm', 240]] as const) {
      const box = mascotBox(width)
      expect(Math.max(wheel / 2 + 24, wheel - (box.size - OVERHANG[width]))).toBeGreaterThanOrEqual(wheel / 2 + 24)
    }
  })

  it('stays above the wheel\'s centre line on the wheels of the note (box bottom 250 of 420, 130 of 332)', () => {
    expect(mascotBox('md').top + mascotBox('md').size).toBe(250)
    expect(mascotBox('sm').top + mascotBox('sm').size).toBe(130)
    expect(250).toBeLessThanOrEqual(420 / 2 + 40)
    expect(130).toBeLessThanOrEqual(332 / 2)
  })

  it('travels along the radius from behind the rim: 130 left and 100 down from md up, 100 and 80 below', () => {
    expect(mascotBox('md').travel).toEqual({ x: -130, y: 100 })
    expect(mascotBox('sm').travel).toEqual({ x: -100, y: 80 })
  })
})

describe('LuckyWheelMascot.vue', () => {
  it('carries no stylesheet of its own: his left edge and his hiding are utilities on his box, not a global rule (#584)', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../../app/components/LuckyWheelMascot.vue'), 'utf8')

    expect(source).not.toContain('<style')
  })
})
