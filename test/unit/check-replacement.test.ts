import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { checkReplacement } from '../../scripts/wording/check-replacement.mjs'
import { flattenMessages, formsOf, placeholdersOf } from '../../scripts/wording/messages.mjs'
import { RETIRED } from '../../scripts/wording/retired-words.mjs'

// The check of a typed replacement (#628, spec #620 § The review page): a refusal is a replacement the app would break on
// (a lost placeholder, a lost plural form), a warning is a copy rule the user may overrule (06-copy § Rules for developers).
const codes = (issues: { code: string }[]) => issues.map(issue => issue.code)

describe('placeholdersOf and formsOf', () => {
  it('reads the names of {placeholders}, sorted, once each, over all forms', () => {
    expect(placeholdersOf('{n} Spiel | {n} Spiele von {name} und {name}')).toEqual(['n', 'name'])
    expect(placeholdersOf('Kein Platzhalter')).toEqual([])
    expect(placeholdersOf('{ time } Uhr')).toEqual(['time'])
  })

  it('does not count the literal {\'@\'} as a placeholder', () => {
    expect(placeholdersOf('Schreib an compies{\'@\'}example.invalid')).toEqual([])
  })

  it('counts the |-separated forms, and a message without | is one form', () => {
    expect(formsOf('Ein Spiel')).toBe(1)
    expect(formsOf('Ein Spiel | {n} Spiele')).toBe(2)
    expect(formsOf('Keins | Ein Spiel | {n} Spiele')).toBe(3)
    expect(formsOf('Das Zeichen {\'|\'} bleibt eine Form')).toBe(1)
  })
})

describe('flattenMessages', () => {
  it('lists the strings in file order under their dotted path, and array items under their index', () => {
    expect(flattenMessages({ a: { b: 'eins', c: ['x', 'y'] }, d: 'zwei', e: 3, f: null })).toEqual([
      { key: 'a.b', text: 'eins' },
      { key: 'a.c.0', text: 'x' },
      { key: 'a.c.1', text: 'y' },
      { key: 'd', text: 'zwei' },
    ])
  })
})

describe('checkReplacement: refusals', () => {
  it('passes a clean replacement without warnings', () => {
    expect(checkReplacement('Du hast {n} Stimmen', 'Es sind {n} Stimmen')).toEqual({ ok: true, refusals: [], warnings: [] })
  })

  it('refuses an empty replacement', () => {
    const result = checkReplacement('Speichern', '   ')
    expect(result.ok).toBe(false)
    expect(codes(result.refusals)).toEqual(['empty'])
  })

  it('refuses a dropped placeholder, one issue per name, with the reason', () => {
    const result = checkReplacement('{name} hat {n} Stimmen', 'Alle haben Stimmen')
    expect(result.ok).toBe(false)
    expect(result.refusals).toEqual([
      { code: 'placeholder-dropped', reason: '{n} fehlt' },
      { code: 'placeholder-dropped', reason: '{name} fehlt' },
    ])
  })

  it('refuses an added placeholder', () => {
    const result = checkReplacement('Speichern', 'Speichern, {name}')
    expect(result.refusals).toEqual([{ code: 'placeholder-added', reason: '{name} gibt es in der Nachricht nicht' }])
  })

  it('accepts a placeholder used once where the message used it twice, and the other way round', () => {
    expect(checkReplacement('{n} von {n}', '{n} Stück').ok).toBe(true)
    expect(checkReplacement('{n} Stück', '{n} von {n}').ok).toBe(true)
  })

  it('refuses a dropped plural form, with the counts', () => {
    const result = checkReplacement('{n} Spiel | {n} Spiele', '{n} Spiele')
    expect(result.ok).toBe(false)
    expect(result.refusals).toEqual([{ code: 'forms', reason: '1 Form statt 2' }])
  })

  it('refuses a three-form message answered with two forms', () => {
    const result = checkReplacement('Niemand | Einer | {n} Leute', 'Niemand | {n} Leute')
    expect(result.refusals).toEqual([{ code: 'forms', reason: '2 Formen statt 3' }])
  })

  it('refuses an added form', () => {
    expect(codes(checkReplacement('Speichern', 'Speichern | Sichern').refusals)).toEqual(['forms'])
  })

  it('keeps all forms and a placeholder that only the last form carries', () => {
    expect(checkReplacement('Nichts | Einer | {n} sind weg', 'Keiner | Einer | {n} sind weg').ok).toBe(true)
  })

  it('refuses an empty form', () => {
    const result = checkReplacement('Ein Spiel | {n} Spiele', '{n} Spiel |')
    expect(codes(result.refusals)).toEqual(['empty-form'])
  })

  it('does not take spaces around | for a difference', () => {
    expect(checkReplacement('Ein Spiel|{n} Spiele', 'Ein Spiel  |   {n} Spiele').ok).toBe(true)
  })

  it('keeps the escape {\'@\'} (passes) and refuses a bare @', () => {
    expect(checkReplacement('Schreib an {\'@\'}', 'Mail an {\'@\'}-Adresse').ok).toBe(true)
    const result = checkReplacement('Schreib an {\'@\'}', 'Mail an @ Adresse')
    expect(codes(result.refusals)).toEqual(['syntax'])
  })

  it('refuses a brace that is no placeholder', () => {
    expect(codes(checkReplacement('Speichern', 'Speichern {').refusals)).toEqual(['syntax'])
    expect(codes(checkReplacement('Speichern', '} Speichern').refusals)).toEqual(['syntax'])
    expect(codes(checkReplacement('Speichern', 'Speichern { n').refusals)).toEqual(['syntax'])
  })

  it('trims the replacement first', () => {
    expect(checkReplacement('Speichern', '  Sichern \n').ok).toBe(true)
  })
})

describe('checkReplacement: warnings', () => {
  const warned = (replacement: string, message = 'Speichern') => {
    const result = checkReplacement(message, replacement)
    expect(result.ok).toBe(true)
    return codes(result.warnings)
  }

  it('warns of a straight quote', () => {
    expect(warned('Das "Wort" zählt')).toEqual(['straight-quote'])
  })

  it('warns of a straight apostrophe outside the literal', () => {
    expect(warned('Hol\'s dir')).toEqual(['straight-apostrophe'])
    expect(warned('Mail an {\'@\'}-Adresse', 'Mail')).toEqual([])
  })

  it('warns of a middle dot', () => {
    expect(warned('Eins · Zwei')).toEqual(['middot'])
  })

  it('warns of every retired word once, naming the successor', () => {
    const result = checkReplacement('Speichern', 'Zurück in die Lobby und auf die Bench')
    expect(result.ok).toBe(true)
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'retired', reason: expect.stringContaining('Event') }),
      expect.objectContaining({ code: 'retired', reason: expect.stringContaining('Tribüne') }),
    ])
    for (const word of Object.keys(RETIRED)) expect(codes(checkReplacement('x', `Ein ${word} hier`).warnings)).toEqual(['retired'])
  })

  it('warns of Compibert in any case and of COMPIES in capitals', () => {
    expect(warned('Compibert sagt Hallo')).toEqual(['compibert'])
    expect(warned('der compibert')).toEqual(['compibert'])
    expect(warned('Willkommen bei COMPIES')).toEqual(['compies-caps'])
    expect(warned('Willkommen bei Compies')).toEqual([])
  })

  it('warns of a formal address in the middle of a sentence', () => {
    expect(warned('Sehen Sie nach')).toEqual(['formal-address'])
    expect(warned('Das ist Ihre Wahl')).toEqual(['formal-address'])
    expect(warned('Wir helfen Ihnen')).toEqual(['formal-address'])
    expect(warned('Ihnen helfen wir')).toEqual(['formal-address'])
  })

  it('does not warn of a capital Sie or Ihr that starts the text, a sentence or a form', () => {
    expect(warned('Sie bleibt, wie sie ist')).toEqual([])
    expect(warned('Fertig. Sie bleibt')).toEqual([])
    expect(warned('Wirklich? Ihr seid dran')).toEqual([])
    expect(warned('Eins:\nSie bleibt')).toEqual([])
    expect(warned('Er sagt „Ihr seid dran“')).toEqual([])
    expect(warned('Keiner | Sie bleibt', 'Nichts | Es bleibt')).toEqual([])
  })

  // Two real messages the rule must leave alone: „Ihr seid“ is the informal plural, a sentence-initial „Sie“ is the feminine (#628).
  it('stays quiet on „Ihr seid“ and „Sie bleibt“ as the app writes them', () => {
    expect(codes(checkReplacement('Ihr seid jetzt {place}. {session}, Spiel {next} kommt gleich.', 'Ihr seid jetzt {place}. {session}, Spiel {next} kommt gleich.').warnings)).toEqual([])
    expect(codes(checkReplacement('Diese Session hat schon begonnen. Sie bleibt, wie sie ist.', 'Diese Session hat schon begonnen. Sie bleibt, wie sie ist.').warnings)).toEqual([])
  })

  it('collects several warnings together without changing ok', () => {
    const result = checkReplacement('Speichern', 'Compibert · "Lobby"')
    expect(result.ok).toBe(true)
    expect(codes(result.warnings).sort()).toEqual(['compibert', 'middot', 'retired', 'straight-quote'])
  })
})

describe('checkReplacement against the real locale file', () => {
  // The rules must agree with what the file already does: a message offered as its own replacement is never refused.
  it('refuses no message of de.json when it is its own replacement', () => {
    const refused = flattenMessages(de)
      .map(({ key, text }) => ({ key, result: checkReplacement(text, text) }))
      .filter(({ result }) => !result.ok)
      .map(({ key, result }) => ({ key, refusals: result.refusals }))
    expect(refused).toEqual([])
  })
})
