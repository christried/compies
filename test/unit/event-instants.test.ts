import { describe, expect, it } from 'vitest'
import { waitsForSettle } from '../../app/utils/event-instants'
import type { EventView, RoundGame, SpinView, VetoView } from '../../shared/event'

// When a read still misses what a passed instant decides (review 0.7, F13): the page reads again while this holds.

const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const game = { id: 'g1', name: 'Halo' } as RoundGame

const spin = (stopOffset: number, withGame: boolean): SpinView => ({
  roundId: 'r1', drawId: 'd1', spinStartAt: iso(stopOffset - 6000), stopAt: iso(stopOffset), slices: 4, resultIndex: 1, resultOffset: 0.5, labels: null, game: withGame ? game : null,
})
const vetoes = (draw: { endsOffset: number } | null, revealed: VetoView['revealed']): VetoView => ({
  left: [1, 1], own: null, revealed, draw: draw && { drawId: 'd1', kind: 'spin', stopAt: iso(draw.endsOffset - 60_000), vetoEndsAt: iso(draw.endsOffset), game },
})
const view = (wheel: { spin?: SpinView | null, vetoes?: VetoView } | null): Pick<EventView, 'wheel'> => ({
  wheel: wheel && { count: 3, slices: null, spin: wheel.spin ?? null, vetoes: wheel.vetoes ?? vetoes(null, null) },
})

describe('waitsForSettle', () => {
  it('waits for a spin whose stop has passed but which carries no game for this viewer', () => {
    expect(waitsForSettle(view({ spin: spin(-1, false) }), NOW)).toBe(true)
    expect(waitsForSettle(view({ spin: spin(0, false) }), NOW)).toBe(true)
  })

  it('is settled before the stop, and once the spin carries its game (the Host has it from the start)', () => {
    expect(waitsForSettle(view({ spin: spin(1, false) }), NOW)).toBe(false)
    expect(waitsForSettle(view({ spin: spin(-1, true) }), NOW)).toBe(false)
    expect(waitsForSettle(view({ spin: spin(5000, true) }), NOW)).toBe(false)
  })

  it('waits for a Veto window whose end has passed but whose Vetoes are not revealed', () => {
    expect(waitsForSettle(view({ vetoes: vetoes({ endsOffset: -1 }, null) }), NOW)).toBe(true)
    expect(waitsForSettle(view({ vetoes: vetoes({ endsOffset: 0 }, null) }), NOW)).toBe(true)
  })

  it('is settled while the window runs, once the Vetoes are revealed (also none), and without a window', () => {
    expect(waitsForSettle(view({ vetoes: vetoes({ endsOffset: 1 }, null) }), NOW)).toBe(false)
    expect(waitsForSettle(view({ vetoes: vetoes({ endsOffset: -1 }, []) }), NOW)).toBe(false)
    expect(waitsForSettle(view({ vetoes: vetoes({ endsOffset: -1 }, [{ team: 1, userId: 'u1' }]) }), NOW)).toBe(false)
    expect(waitsForSettle(view({}), NOW)).toBe(false)
  })

  it('is settled without a wheel', () => {
    expect(waitsForSettle(view(null), NOW)).toBe(false)
  })
})
