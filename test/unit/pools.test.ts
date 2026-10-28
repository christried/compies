import { describe, expect, it } from 'vitest'
import { POOL_GAMES_MAX, parsePools } from '../../server/domain/pools'

// The pools of a new Event as the create request sends them (#146).

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('parsePools', () => {
  it('takes absent pools as two empty ones', () => {
    expect(parsePools(undefined)).toEqual({ ok: true, pools: { main: [], tiebreaker: [] } })
  })

  it('takes a missing list as empty', () => {
    expect(parsePools({ main: [A] })).toEqual({ ok: true, pools: { main: [A], tiebreaker: [] } })
    expect(parsePools({ tiebreaker: [B] })).toEqual({ ok: true, pools: { main: [], tiebreaker: [B] } })
    expect(parsePools({})).toEqual({ ok: true, pools: { main: [], tiebreaker: [] } })
  })

  it('allows empty lists', () => {
    expect(parsePools({ main: [], tiebreaker: [] })).toEqual({ ok: true, pools: { main: [], tiebreaker: [] } })
  })

  it('allows one game in both pools and keeps the order', () => {
    expect(parsePools({ main: [B, A], tiebreaker: [A] })).toEqual({ ok: true, pools: { main: [B, A], tiebreaker: [A] } })
  })

  it('refuses a game twice in one list', () => {
    expect(parsePools({ main: [A, A] })).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePools({ tiebreaker: [A, B, A] })).toEqual({ ok: false, error: 'invalid_pools' })
  })

  it('refuses ids that are no uuid', () => {
    expect(parsePools({ main: ['nope'] })).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePools({ main: [42] })).toEqual({ ok: false, error: 'invalid_pools' })
  })

  it('refuses anything but an object with lists', () => {
    for (const input of [null, 'main', 5, [A], { main: A }, { main: null }, { tiebreaker: { 0: A } }]) {
      expect(parsePools(input)).toEqual({ ok: false, error: 'invalid_pools' })
    }
  })

  it('allows 200 games per list and refuses 201', () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)

    expect(POOL_GAMES_MAX).toBe(200)
    expect(parsePools({ main: ids(200), tiebreaker: ids(200) }).ok).toBe(true)
    expect(parsePools({ main: ids(201) })).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePools({ tiebreaker: ids(201) })).toEqual({ ok: false, error: 'invalid_pools' })
  })
})
