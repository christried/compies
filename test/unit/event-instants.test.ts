import { describe, expect, it } from 'vitest'
import { viewInstants, waitsForSettle } from '../../app/utils/event-instants'
import type { EventView } from '../../shared/event'
import type { SpinView, VetoView } from '../../shared/stage'

// When a read still misses what a passed instant decides (review 0.7, F13): the page reads again while this holds.

const NOW = Date.UTC(2090, 10, 7, 20, 0, 0)
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const game = { id: 'g1', name: 'Halo' } as NonNullable<SpinView['game']>

const spin = (stopOffset: number, withGame: boolean): SpinView => ({
  roundId: 'r1', drawId: 'd1', spinStartAt: iso(stopOffset - 6000), stopAt: iso(stopOffset), slices: 4, resultIndex: 1, resultOffset: 0.5, labels: null, game: withGame ? game : null, current: true,
})
const vetoes = (draw: { endsOffset: number } | null, revealed: VetoView['revealed']): VetoView => ({
  left: [1, 1], own: null, revealed, draw: draw && { drawId: 'd1', kind: 'spin', stopAt: iso(draw.endsOffset - 60_000), vetoEndsAt: iso(draw.endsOffset), game },
})
const view = (wheel: { spin?: SpinView | null, vetoes?: VetoView } | null): Pick<EventView, 'wheel'> => ({
  wheel: wheel && { count: 3, slices: null, spin: wheel.spin ?? null, vetoes: wheel.vetoes ?? vetoes(null, null) },
})

const coinOf = (landOffset: number): NonNullable<EventView['coin']> => ({ id: 'toss-1', side: 'heads', startedAt: iso(landOffset - 2000), landsAt: iso(landOffset) })
const ceremonyOf = (endOffset: number): NonNullable<EventView['ceremony']> => ({ startsAt: iso(endOffset - 5050), endsAt: iso(endOffset), gag: 'trip' })
const clipOf = (endOffset: number): NonNullable<EventView['clip']> => ({ drawId: 'd1', startAt: iso(endOffset - 60_000), endsAt: iso(endOffset), game })

describe('viewInstants', () => {
  it('has the spin\'s stop as an instant (#256)', () => {
    expect(viewInstants(view({ spin: spin(1000, true) }))).toEqual([NOW + 1000])
  })

  it('has the Veto window\'s end as an instant (#256)', () => {
    expect(viewInstants(view({ vetoes: vetoes({ endsOffset: 2000 }, null) }))).toEqual([NOW + 2000])
  })

  it('has the coin\'s landing as an instant (#256)', () => {
    expect(viewInstants({ coin: coinOf(3000) })).toEqual([NOW + 3000])
  })

  it('has the clip\'s end as an instant (#256)', () => {
    expect(viewInstants({ clip: clipOf(4000) })).toEqual([NOW + 4000])
  })

  it('has the end of the ceremony as an instant, so the dock reads again when it is free (#309)', () => {
    expect(viewInstants({ ceremony: ceremonyOf(5000) })).toEqual([NOW + 5000])
    expect(viewInstants({ ceremony: null })).toEqual([])
  })

  it('has one instant per piece that has one, in the order the page had them', () => {
    const wheel = view({ spin: spin(1000, true), vetoes: vetoes({ endsOffset: 2000 }, null) })
    expect(viewInstants({ ...wheel, coin: coinOf(3000), clip: clipOf(4000) })).toEqual([NOW + 1000, NOW + 2000, NOW + 3000, NOW + 4000])
  })

  it('has none without a wheel, a toss or a clip, and none for a wheel without a spin or a window', () => {
    expect(viewInstants({})).toEqual([])
    expect(viewInstants({ wheel: null, coin: null, clip: null })).toEqual([])
    expect(viewInstants(view({ spin: null, vetoes: vetoes(null, null) }))).toEqual([])
  })
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
