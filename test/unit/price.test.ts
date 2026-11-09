import { describe, expect, it } from 'vitest'
import { priceLine, priceSourceLabel } from '../../app/utils/price'
import type { GamePrice } from '../../shared/game'
import de from '~~/i18n/locales/de.json'

// The words of a game's Price (#337, #338): the Price line of the cards, the history and the game page, and the source
// names of the form. They live in the locale file and this util since #332 (S3), not in shared/game.ts.

/** vue-i18n's `t` for the real copy, with `{name}` placeholders. */
function t(key: string, named: Record<string, unknown> = {}): string {
  const text = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], de) as string
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name]))
}

describe('priceSourceLabel (#337)', () => {
  it.each<[GamePrice['source'], string]>([
    ['steam', 'Steam'],
    ['epic', 'Epic Games Store'],
    ['gog', 'GOG'],
    ['publisher', 'Publisher-Website'],
    ['steam_key', 'Steam-Key'],
    ['free_to_play', 'Free-to-play'],
    ['subscription', 'Abo'],
  ])('names %s „%s“', (source, label) => {
    expect(priceSourceLabel(source, t)).toBe(label)
  })
})

describe('priceLine (#337)', () => {
  const now = new Date('2026-11-09T12:00:00.000Z')
  const checkedAt = '2026-11-03T10:00:00.000Z'

  it.each<[GamePrice['cents'], GamePrice['source'], string]>([
    [1999, 'steam', '19,99 € bei Steam · Stand 3. Nov.'],
    [2000, 'epic', '20,00 € bei Epic Games Store · Stand 3. Nov.'],
    [1999, 'gog', '19,99 € bei GOG · Stand 3. Nov.'],
    [1999, 'publisher', '19,99 € bei Publisher-Website · Stand 3. Nov.'],
    [1999, 'steam_key', '19,99 € bei Steam-Key · Stand 3. Nov.'],
    [null, 'free_to_play', 'Free-to-play · Stand 3. Nov.'],
    [null, 'subscription', 'Abo · Stand 3. Nov.'],
  ])('writes %s with the amount %s', (cents, source, text) => {
    expect(priceLine({ cents, source, checkedAt }, now, t)).toBe(text)
  })

  it('writes the largest Price, 999,99 €, with the year of another year', () => {
    expect(priceLine({ cents: 99_999, source: 'epic', checkedAt: '2025-11-03T10:00:00.000Z' }, now, t)).toBe('999,99 € bei Epic Games Store · Stand 3. Nov. 2025')
  })

  it('appends the year when the day was checked in another year', () => {
    expect(priceLine({ cents: 1999, source: 'steam', checkedAt: '2025-11-03T10:00:00.000Z' }, now, t)).toBe('19,99 € bei Steam · Stand 3. Nov. 2025')
  })

  it('takes the Berlin day, so an instant just before midnight UTC is the next day', () => {
    expect(priceLine({ cents: 1999, source: 'steam', checkedAt: '2026-11-02T23:30:00.000Z' }, now, t)).toBe('19,99 € bei Steam · Stand 3. Nov.')
  })

  it('compares the Berlin years: New Year in Berlin is the new year, whatever UTC says', () => {
    const newYear = '2025-12-31T23:30:00.000Z'
    expect(priceLine({ cents: null, source: 'subscription', checkedAt: newYear }, new Date('2026-06-01T10:00:00.000Z'), t)).toBe('Abo · Stand 1. Jan.')
    expect(priceLine({ cents: null, source: 'subscription', checkedAt: newYear }, new Date('2025-12-31T12:00:00.000Z'), t)).toBe('Abo · Stand 1. Jan. 2026')
  })
})
