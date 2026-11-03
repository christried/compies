import { describe, expect, it } from 'vitest'
import { POOL_GAMES_MAX, parsePoolChange, parsePools } from '../../server/domain/pools'

// The pools of a new Event as the create request sends them (#146). One pool since 0.8 (ADR 0014, #279).

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('parsePoolChange (#183)', () => {
  it('returns only the list that was given', () => {
    expect(parsePoolChange(undefined)).toEqual({ ok: true, pools: {} })
    expect(parsePoolChange({})).toEqual({ ok: true, pools: {} })
    expect(parsePoolChange({ main: [A] })).toEqual({ ok: true, pools: { main: [A] } })
    expect(parsePoolChange({ main: [] })).toEqual({ ok: true, pools: { main: [] } })
  })

  it('ignores a tiebreaker list, whatever it holds (#279)', () => {
    expect(parsePoolChange({ tiebreaker: [] })).toEqual({ ok: true, pools: {} })
    expect(parsePoolChange({ tiebreaker: [1] })).toEqual({ ok: true, pools: {} })
    expect(parsePoolChange({ main: [A], tiebreaker: [A, A, 'nope'] })).toEqual({ ok: true, pools: { main: [A] } })
  })

  it('refuses what parsePools refuses', () => {
    expect(parsePoolChange('nope')).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePoolChange({ main: [A, A] })).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePoolChange({ main: ['nope'] })).toEqual({ ok: false, error: 'invalid_pools' })
  })
})

describe('parsePools', () => {
  it('takes absent pools as an empty Game pool', () => {
    expect(parsePools(undefined)).toEqual({ ok: true, pools: { main: [] } })
  })

  it('takes a missing list as empty', () => {
    expect(parsePools({})).toEqual({ ok: true, pools: { main: [] } })
  })

  it('allows an empty list and keeps the order', () => {
    expect(parsePools({ main: [] })).toEqual({ ok: true, pools: { main: [] } })
    expect(parsePools({ main: [B, A] })).toEqual({ ok: true, pools: { main: [B, A] } })
  })

  it('ignores a tiebreaker list, even one that would be invalid (#279)', () => {
    expect(parsePools({ main: [A], tiebreaker: [A] })).toEqual({ ok: true, pools: { main: [A] } })
    expect(parsePools({ tiebreaker: [B] })).toEqual({ ok: true, pools: { main: [] } })
    expect(parsePools({ tiebreaker: [A, B, A] })).toEqual({ ok: true, pools: { main: [] } })
    expect(parsePools({ main: [], tiebreaker: 'nope' })).toEqual({ ok: true, pools: { main: [] } })
  })

  it('refuses a game twice in the list', () => {
    expect(parsePools({ main: [A, A] })).toEqual({ ok: false, error: 'invalid_pools' })
  })

  it('refuses ids that are no uuid', () => {
    expect(parsePools({ main: ['nope'] })).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePools({ main: [42] })).toEqual({ ok: false, error: 'invalid_pools' })
  })

  it('refuses anything but an object with a list', () => {
    for (const input of [null, 'main', 5, [A], { main: A }, { main: null }, { main: { 0: A } }]) {
      expect(parsePools(input)).toEqual({ ok: false, error: 'invalid_pools' })
    }
  })

  it('allows 200 games in the list and refuses 201', () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)

    expect(POOL_GAMES_MAX).toBe(200)
    expect(parsePools({ main: ids(200) }).ok).toBe(true)
    expect(parsePools({ main: ids(201) })).toEqual({ ok: false, error: 'invalid_pools' })
  })
})
