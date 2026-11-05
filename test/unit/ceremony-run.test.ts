import { describe, expect, it } from 'vitest'
import { ceremonyRigState, runGeometry } from '../../app/utils/ceremony-run'
import { ceremonyTimeline } from '../../shared/ceremony'

// The Pokal-Lauf's pure parts (#312, spec #308, 04-motion § 6b): which pose Compibert's rig must hold at a moment of the run (what a late
// joiner, a returning tab and a skip set instead of the timeline's calls), and where the run's stops are on a stage.

describe('ceremonyRigState', () => {
  it('stands idle until the run starts, then runs for 700 ms', () => {
    for (const parties of [2, 8]) {
      const { runAtMs, runEndAtMs } = ceremonyTimeline(parties, 'trip')
      expect(ceremonyRigState(0, parties, 'trip')).toBe('idle')
      expect(ceremonyRigState(runAtMs - 1, parties, 'trip')).toBe('idle')
      expect(ceremonyRigState(runAtMs, parties, 'trip')).toBe('run')
      expect(ceremonyRigState(runEndAtMs - 1, parties, 'trip')).toBe('run')
    }
  })

  it('trips: suspense from the end of the run until he gets up, then laughs until the dance', () => {
    for (const parties of [2, 8]) {
      const { runEndAtMs, getUpAtMs, endMs } = ceremonyTimeline(parties, 'trip')
      expect(ceremonyRigState(runEndAtMs, parties, 'trip')).toBe('suspense')
      expect(ceremonyRigState(getUpAtMs - 1, parties, 'trip')).toBe('suspense')
      expect(ceremonyRigState(getUpAtMs, parties, 'trip')).toBe('laugh')
      expect(ceremonyRigState(endMs - 1, parties, 'trip')).toBe('laugh')
      expect(ceremonyRigState(endMs, parties, 'trip')).toBe('dance')
    }
  })

  it('bonks: cheers for 920 ms, then is confused until he gets up, then laughs until the dance', () => {
    for (const parties of [2, 8]) {
      const { runEndAtMs, getUpAtMs, endMs } = ceremonyTimeline(parties, 'bonk')
      expect(ceremonyRigState(runEndAtMs, parties, 'bonk')).toBe('cheer')
      expect(ceremonyRigState(runEndAtMs + 919, parties, 'bonk')).toBe('cheer')
      expect(ceremonyRigState(runEndAtMs + 920, parties, 'bonk')).toBe('confused')
      expect(ceremonyRigState(getUpAtMs - 1, parties, 'bonk')).toBe('confused')
      expect(ceremonyRigState(getUpAtMs, parties, 'bonk')).toBe('laugh')
      expect(ceremonyRigState(endMs - 1, parties, 'bonk')).toBe('laugh')
      expect(ceremonyRigState(endMs, parties, 'bonk')).toBe('dance')
    }
  })

  it('dances for good after the end', () => {
    expect(ceremonyRigState(1_000_000, 5, 'trip')).toBe('dance')
  })
})

describe('runGeometry', () => {
  // A phone: a 390 px wide stage, Compibert 120 x 102, the winner card centred (240 wide) 200 px from the top.
  const phone = { stage: { width: 390, height: 800 }, card: { left: 75, top: 200, width: 240 }, compibert: { width: 120, height: 102 } }
  // A desktop: 1440 px wide, Compibert 150 x 128, the card 400 px from the left.
  const desktop = { stage: { width: 1440, height: 700 }, card: { left: 400, top: 220, width: 240 }, compibert: { width: 150, height: 128 } }

  it('centres the trophy on the card and puts it 40 px above it', () => {
    expect(runGeometry(phone)).toMatchObject({ cardX: 171, cardY: 160 })
    expect(runGeometry(desktop)).toMatchObject({ cardX: 496, cardY: 180 })
  })

  it('puts the ground 16 px under Compibert, and the hand at 62% of his width and 30% of his height', () => {
    const geometry = runGeometry(phone)
    expect(geometry.groundY).toBe(682)
    expect(geometry.handX(100)).toBeCloseTo(174.4)
    expect(geometry.handY).toBeCloseTo(712.6)
    expect(runGeometry(desktop).groundY).toBe(556)
  })

  it('stops Compibert 0.9 of his width before the trophy lands, on a desktop', () => {
    expect(runGeometry(desktop).stopX).toBe(361)
  })

  it('stops him at 45% of the stage less half his width at the latest, on a phone', () => {
    // The card's bound is 171 - 108 = 63, 45% of 390 less 60 is 115.5: the card wins; moved right, the stage's bound wins.
    expect(runGeometry(phone).stopX).toBe(63)
    expect(runGeometry({ ...phone, card: { left: 150, top: 200, width: 240 } }).stopX).toBe(115.5)
  })

  it('keeps him 10 px inside the stage on the left, and on the right', () => {
    expect(runGeometry({ ...desktop, card: { left: 20, top: 220, width: 240 } }).stopX).toBe(10)
    expect(runGeometry({ stage: { width: 140, height: 400 }, card: { left: 0, top: 100, width: 240 }, compibert: { width: 120, height: 102 } }).stopX).toBe(10)
  })
})
