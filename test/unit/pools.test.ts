import { describe, expect, it } from 'vitest'
import { POOL_GAMES_MAX, parsePoolChange, parsePools } from '../../server/domain/pools'

// The Game pool of a request as the create and settings requests send it (#146, #286). One pool since 0.8 (ADR 0014, #279).

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('parsePoolChange (#183)', () => {
  it('returns the list that was given, and undefined when none was', () => {
    expect(parsePoolChange(undefined)).toEqual({ ok: true, pool: undefined })
    expect(parsePoolChange([A])).toEqual({ ok: true, pool: [A] })
    expect(parsePoolChange([])).toEqual({ ok: true, pool: [] })
  })

  it('refuses what parsePools refuses', () => {
    expect(parsePoolChange('nope')).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePoolChange([A, A])).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePoolChange(['nope'])).toEqual({ ok: false, error: 'invalid_pools' })
  })
})

describe('parsePools', () => {
  it('takes an absent list as an empty Game pool', () => {
    expect(parsePools(undefined)).toEqual({ ok: true, pool: [] })
  })

  it('allows an empty list and keeps the order', () => {
    expect(parsePools([])).toEqual({ ok: true, pool: [] })
    expect(parsePools([B, A])).toEqual({ ok: true, pool: [B, A] })
  })

  it('refuses a game twice in the list', () => {
    expect(parsePools([A, A])).toEqual({ ok: false, error: 'invalid_pools' })
  })

  it('refuses ids that are no uuid', () => {
    expect(parsePools(['nope'])).toEqual({ ok: false, error: 'invalid_pools' })
    expect(parsePools([42])).toEqual({ ok: false, error: 'invalid_pools' })
  })

  it('refuses anything but a list', () => {
    for (const input of [null, 'main', 5, { main: [A] }, { 0: A }]) {
      expect(parsePools(input)).toEqual({ ok: false, error: 'invalid_pools' })
    }
  })

  it('allows 200 games in the list and refuses 201', () => {
    const ids = (count: number) => Array.from({ length: count }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)

    expect(POOL_GAMES_MAX).toBe(200)
    expect(parsePools(ids(200)).ok).toBe(true)
    expect(parsePools(ids(201))).toEqual({ ok: false, error: 'invalid_pools' })
  })
})
