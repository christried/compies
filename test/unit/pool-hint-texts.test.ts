import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'

// What the Host reads under the pool step when the pool is too small (#796): the eight hints name the
// numbers only. „Blockiert nichts, nur damit du’s weißt.“ is gone from every form, and the word for the
// last game is „Gleichstand“, never „Tiebreaker“ (ADR 0014). The count of forms is pinned too: the
// plural form is picked by `have`, so a lost bar would read „im Pool sind 1“.
const pool = de.stepper.pool as Record<string, string>

const TWO_FORMS = [
  'hintWheel',
  'hintWheelOne',
  'hintAdmin',
  'hintWheelLast',
  'hintWheelOneLast',
  'hintAdminLast',
  'hintAdminOneLast',
]
const ALL = [...TWO_FORMS, 'hintAdminOne']
const forms = (key: string) => pool[key]!.split('|').map(f => f.trim())

describe('pool hint texts (#796)', () => {
  it.each(ALL)('%s holds no „Blockiert nichts“ and no Tiebreaker', (key) => {
    expect(pool[key]).toBeTypeOf('string')
    expect(pool[key]).not.toContain('Blockiert nichts')
    expect(pool[key]).not.toMatch(/tiebr/i)
  })

  it.each(TWO_FORMS)('%s keeps its two forms, the second one naming „sind {have}“', (key) => {
    const f = forms(key)
    expect(f).toHaveLength(2)
    expect(f[0]).toContain('ist {have}')
    expect(f[1]).toContain('sind {have}')
  })

  it('hintAdminOne keeps its one form', () => {
    expect(forms('hintAdminOne')).toEqual(['Für 1 Spiel brauchst du 1 Spiel im Pool, im Pool sind {have}.'])
  })

  it.each(['hintAdminLast', 'hintAdminOneLast'])('%s names the one extra game for a possible Gleichstand in every form', (key) => {
    for (const f of forms(key)) expect(f).toContain('plus 1 Spiel für einen möglichen Gleichstand')
  })
})
