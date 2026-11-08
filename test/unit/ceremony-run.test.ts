import { describe, expect, it } from 'vitest'
import { ceremonyRigState, runGeometry } from '../../app/utils/ceremony-run'
import { ceremonyTimeline } from '../../shared/ceremony'

// The Pokal-Lauf's pure parts (#312, spec #308, 04-motion § 6b): which pose Compibert's rig must hold at a moment of the run (what a late
// joiner, a returning tab and a skip set instead of the timeline's calls), and where the run's stops are on a stage.

describe('ceremonyRigState', () => {
  it('stands idle until the run starts, then runs for 700 ms', () => {
    for (const parties of [2, 8]) {
      const { runAtMs, runEndAtMs } = ceremonyTimeline({ partyCount: parties, gag: 'trip', winners: 1 })
      expect(ceremonyRigState(0, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('idle')
      expect(ceremonyRigState(runAtMs - 1, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('idle')
      expect(ceremonyRigState(runAtMs, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('run')
      expect(ceremonyRigState(runEndAtMs - 1, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('run')
    }
  })

  it('trips: suspense from the end of the run until he gets up, then laughs until the dance', () => {
    for (const parties of [2, 8]) {
      const { runEndAtMs, getUpAtMs, endMs } = ceremonyTimeline({ partyCount: parties, gag: 'trip', winners: 1 })
      expect(ceremonyRigState(runEndAtMs, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('suspense')
      expect(ceremonyRigState(getUpAtMs - 1, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('suspense')
      expect(ceremonyRigState(getUpAtMs, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('laugh')
      expect(ceremonyRigState(endMs - 1, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('laugh')
      expect(ceremonyRigState(endMs, { partyCount: parties, gag: 'trip', winners: 1, grid: false })).toBe('dance')
    }
  })

  it('bonks: cheers for 920 ms, then is confused until he gets up, then laughs until the dance', () => {
    for (const parties of [2, 8]) {
      const { runEndAtMs, getUpAtMs, endMs } = ceremonyTimeline({ partyCount: parties, gag: 'bonk', winners: 1 })
      expect(ceremonyRigState(runEndAtMs, { partyCount: parties, gag: 'bonk', winners: 1, grid: false })).toBe('cheer')
      expect(ceremonyRigState(runEndAtMs + 919, { partyCount: parties, gag: 'bonk', winners: 1, grid: false })).toBe('cheer')
      expect(ceremonyRigState(runEndAtMs + 920, { partyCount: parties, gag: 'bonk', winners: 1, grid: false })).toBe('confused')
      expect(ceremonyRigState(getUpAtMs - 1, { partyCount: parties, gag: 'bonk', winners: 1, grid: false })).toBe('confused')
      expect(ceremonyRigState(getUpAtMs, { partyCount: parties, gag: 'bonk', winners: 1, grid: false })).toBe('laugh')
      expect(ceremonyRigState(endMs - 1, { partyCount: parties, gag: 'bonk', winners: 1, grid: false })).toBe('laugh')
      expect(ceremonyRigState(endMs, { partyCount: parties, gag: 'bonk', winners: 1, grid: false })).toBe('dance')
    }
  })

  it('dances for good after the end', () => {
    expect(ceremonyRigState(1_000_000, { partyCount: 5, gag: 'trip', winners: 1, grid: false })).toBe('dance')
  })

  // A Tie (#315): the run starts later than a sole Winner's with the same rows, and he gets up 300 ms after the plate, not after the first landing.
  describe('in a Tie', () => {
    it('stands idle until the run starts at the Tie\'s own moment, then runs for 700 ms', () => {
      const { runAtMs, runEndAtMs } = ceremonyTimeline({ partyCount: 4, gag: 'trip', winners: 2 })
      expect(ceremonyRigState(runAtMs - 1, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('idle')
      expect(ceremonyRigState(runAtMs, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('run')
      expect(ceremonyRigState(runEndAtMs - 1, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('run')
    })

    it('stays in suspense through the hops of a chain and gets up 300 ms after the plate (trip)', () => {
      const { runEndAtMs, landAtMs, plateAtMs, getUpAtMs, endMs } = ceremonyTimeline({ partyCount: 4, gag: 'trip', winners: 2 })
      expect(ceremonyRigState(runEndAtMs, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('suspense')
      expect(ceremonyRigState(landAtMs + 600, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('suspense')
      expect(getUpAtMs).toBe(plateAtMs + 300)
      expect(ceremonyRigState(getUpAtMs - 1, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('suspense')
      expect(ceremonyRigState(getUpAtMs, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('laugh')
      expect(ceremonyRigState(endMs - 1, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('laugh')
      expect(ceremonyRigState(endMs, { partyCount: 4, gag: 'trip', winners: 2, grid: false })).toBe('dance')
    })

    it('cheers for 920 ms, is confused through the hops and laughs after the plate (bonk)', () => {
      const { runEndAtMs, landAtMs, getUpAtMs, endMs } = ceremonyTimeline({ partyCount: 3, gag: 'bonk', winners: 3 })
      expect(ceremonyRigState(runEndAtMs + 919, { partyCount: 3, gag: 'bonk', winners: 3, grid: false })).toBe('cheer')
      expect(ceremonyRigState(runEndAtMs + 920, { partyCount: 3, gag: 'bonk', winners: 3, grid: false })).toBe('confused')
      expect(ceremonyRigState(landAtMs + 1000, { partyCount: 3, gag: 'bonk', winners: 3, grid: false })).toBe('confused')
      expect(ceremonyRigState(getUpAtMs, { partyCount: 3, gag: 'bonk', winners: 3, grid: false })).toBe('laugh')
      expect(ceremonyRigState(endMs, { partyCount: 3, gag: 'bonk', winners: 3, grid: false })).toBe('dance')
    })

    it('follows the grid\'s own, shorter moments when the screen shows 3 Winners as a grid', () => {
      const grid = ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3, grid: true })
      const chain = ceremonyTimeline({ partyCount: 3, gag: 'trip', winners: 3 })
      expect(ceremonyRigState(grid.getUpAtMs, { partyCount: 3, gag: 'trip', winners: 3, grid: true })).toBe('laugh')
      expect(ceremonyRigState(grid.getUpAtMs, { partyCount: 3, gag: 'trip', winners: 3, grid: false })).toBe('suspense')
      expect(ceremonyRigState(grid.endMs, { partyCount: 3, gag: 'trip', winners: 3, grid: true })).toBe('dance')
      expect(grid.endMs).toBeLessThan(chain.endMs)
    })
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

  // A Tie (#315): two cards 240 x 160 side by side under a plate 536 wide, the first at 400 px from the left.
  describe('of a Tie', () => {
    const cards = [{ left: 400, top: 260, width: 240, height: 160 }, { left: 696, top: 260, width: 240, height: 160 }]
    const plate = { left: 400, top: 200, width: 536, height: 40 }

    it('lands the first hop on card 1 of a chain, 40 px above it, and has a stop on every card and on the plate', () => {
      const geometry = runGeometry({ ...desktop, card: cards[0]!, tie: { grid: false, cards, plate } })

      expect(geometry).toMatchObject({ cardX: 496, cardY: 220 })
      expect(geometry.tie!.cards).toEqual([{ x: 496, y: 220 }, { x: 792, y: 220 }])
      expect(geometry.tie!.plate).toEqual({ x: 668 - 24, y: 220 - 26 })
    })

    it('lands the first hop on the plate\'s centre in a grid, and ripples the cards from the one nearest its centre', () => {
      const grid = [
        { left: 400, top: 260, width: 236, height: 120 },
        { left: 650, top: 260, width: 236, height: 120 },
        { left: 400, top: 394, width: 236, height: 120 },
        { left: 650, top: 394, width: 236, height: 120 },
      ]
      const geometry = runGeometry({ ...desktop, card: grid[0]!, tie: { grid: true, cards: grid, plate: { left: 400, top: 200, width: 486, height: 40 } } })

      expect(geometry).toMatchObject({ cardX: 643 - 24, cardY: 220 - 26 })
      expect(geometry.tie!.ripple.slice(0, 2).sort()).toEqual([0, 1])
      expect(geometry.tie!.ripple.slice(2).sort()).toEqual([2, 3])
    })
  })
})
