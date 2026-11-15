import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { decodeTags, stripTags, tagKey } from '~~/shared/key-tag'

// The development-only tag a translated text carries (shared/key-tag.ts, #627, spec #620 § Telling the texts apart): a script that
// reads a page back learns which message each text came from and sees the visible text unchanged. Each case pins what such a
// reader gets, not how the characters are laid out.
const TAG_CHARACTER = /[\u{E0000}-\u{E007F}]/u

function leaves(node: unknown, path: string[] = []): Array<{ key: string, value: string }> {
  if (typeof node === 'string') return [{ key: path.join('.'), value: node }]
  if (node && typeof node === 'object') return Object.entries(node).flatMap(([k, v]) => leaves(v, [...path, k]))
  return []
}

describe('a tagged text', () => {
  it('gives back its key and its visible text unchanged', () => {
    const raw = tagKey('auth.title', 'Anmelden')

    expect(decodeTags(raw).text).toBe('Anmelden')
    expect(decodeTags(raw).tags).toEqual([expect.objectContaining({ key: 'auth.title', text: 'Anmelden', partial: false })])
  })

  it('is invisible: nothing but the tag characters is added', () => {
    const raw = tagKey('auth.title', 'Anmelden')

    expect(raw.replace(new RegExp(TAG_CHARACTER, 'gu'), '')).toBe('Anmelden')
    expect(stripTags(raw)).toBe('Anmelden')
  })

  it.each([
    'Größe ändern: Ärger über „Öl“ und Füße',
    'Es ist ’ne Falle',
    'Los geht’s 🎉🎲',
    'Zero​width stays',
  ])('keeps %j as it is', (text) => {
    const decoded = decodeTags(tagKey('some.key', text))

    expect(decoded.text).toBe(text)
    expect(decoded.tags[0]?.text).toBe(text)
    expect(stripTags(tagKey('some.key', text))).toBe(text)
  })

  it('stripTags removes the tag characters only, other zero-width characters stay', () => {
    expect(stripTags(`${tagKey('a', 'x​y')}‍`)).toBe('x​y‍')
  })

  it('keeps the placeholder as rendered', () => {
    const decoded = decodeTags(tagKey('mvp.event.sessionRunning', 'Session 3 läuft'))

    expect(decoded.tags).toEqual([expect.objectContaining({ key: 'mvp.event.sessionRunning', text: 'Session 3 läuft' })])
    expect(decoded.text).toBe('Session 3 läuft')
  })

  it.each(['1 Spiel', '2 Spiele'])('keeps the plural form as rendered: %j', (text) => {
    const decoded = decodeTags(tagKey('mvp.games.count', text))

    expect(decoded.tags[0]).toMatchObject({ key: 'mvp.games.count', text })
  })

  it('reports where the visible text sits in the raw string, so a Range over it measures that segment', () => {
    const raw = `Vor ${tagKey('a.b', 'Mitte')} nach`
    const [tag] = decodeTags(raw).tags

    expect(stripTags(raw.slice(tag!.from, tag!.to))).toBe('Mitte')
    expect(raw.slice(tag!.from, tag!.to)).toBe('Mitte')
  })
})

describe('several tags in one string', () => {
  it('reads two tags in order, each with its text and its offsets', () => {
    const raw = `${tagKey('a.one', 'Eins')}, ${tagKey('b.two', 'Zwei')}`
    const decoded = decodeTags(raw)

    expect(decoded.text).toBe('Eins, Zwei')
    expect(decoded.tags.map(tag => [tag.key, tag.text])).toEqual([['a.one', 'Eins'], ['b.two', 'Zwei']])
    for (const tag of decoded.tags) expect(stripTags(raw.slice(tag.from, tag.to))).toBe(tag.text)
  })

  it('reports nested tags too, the outer one holding the inner one\'s visible text', () => {
    const raw = tagKey('outer', `Hallo ${tagKey('inner', 'Welt')}!`)
    const decoded = decodeTags(raw)

    expect(decoded.text).toBe('Hallo Welt!')
    expect(decoded.tags.map(tag => [tag.key, tag.text, tag.partial])).toEqual([['outer', 'Hallo Welt!', false], ['inner', 'Welt', false]])
    const [outer, inner] = decoded.tags
    expect(stripTags(raw.slice(outer!.from, outer!.to))).toBe('Hallo Welt!')
    expect(stripTags(raw.slice(inner!.from, inner!.to))).toBe('Welt')
  })
})

describe('edges', () => {
  it('leaves an empty text untagged', () => {
    expect(tagKey('some.key', '')).toBe('')
    expect(decodeTags('').tags).toHaveLength(0)
  })

  it.each([
    ['two words'],
    [''],
    ['x'.repeat(129)],
    ['schön'],
  ])('leaves the text untagged under the key %j', (key) => {
    expect(tagKey(key, 'Text')).toBe('Text')
  })

  it('tags the longest key of the locale file and a one-character key', () => {
    const longest = leaves(de).map(leaf => leaf.key).reduce((a, b) => (b.length > a.length ? b : a))

    expect(longest.length).toBe(38)
    expect(decodeTags(tagKey(longest, 'Text')).tags[0]?.key).toBe(longest)
    expect(decodeTags(tagKey('k', 'Text')).tags[0]?.key).toBe('k')
    expect(decodeTags(tagKey('x'.repeat(128), 'Text')).tags[0]?.key).toBe('x'.repeat(128))
  })

  it('a raw without tags decodes to itself', () => {
    expect(decodeTags('Nur Text')).toEqual({ text: 'Nur Text', tags: [] })
  })

  it('an open without a close is partial and runs to the end of the string', () => {
    const raw = tagKey('a.b', 'Absatz eins\n\nAbsatz zwei')
    const cut = raw.slice(0, raw.indexOf('\n\n'))
    const decoded = decodeTags(cut)

    expect(decoded.text).toBe('Absatz eins')
    expect(decoded.tags).toEqual([{ key: 'a.b', text: 'Absatz eins', from: expect.any(Number), to: cut.length, partial: true }])
  })

  it('a lone close is ignored and the visible text stays intact', () => {
    const lone = String.fromCodePoint(0xE007F)
    const decoded = decodeTags(`Ende${lone}`)

    expect(decoded).toEqual({ text: 'Ende', tags: [] })
  })

  it('a cut key is dropped without a throw and the visible text stays intact', () => {
    const raw = tagKey('auth.title', 'Anmelden')
    const cutInKey = raw.slice(0, 8)

    expect(() => decodeTags(cutInKey)).not.toThrow()
    expect(decodeTags(cutInKey)).toEqual({ text: '', tags: [] })
    expect(decodeTags(`${cutInKey}Rest`).text).toBe('Rest')
    expect(decodeTags(`${cutInKey}Rest`).tags).toEqual([])
  })
})

describe('the whole locale file', () => {
  const all = leaves(de)

  it('has the keys the tag accepts and no text that already holds a tag character', () => {
    expect(all.length).toBeGreaterThan(1400)
    for (const { key, value } of all) {
      expect(tagKey(key, 'x'), key).not.toBe('x')
      expect(TAG_CHARACTER.test(value), key).toBe(false)
    }
  })

  it('round-trips every message: its key and its text come back', () => {
    for (const { key, value } of all) {
      if (value === '') continue
      const decoded = decodeTags(tagKey(key, value))
      expect(decoded.tags, key).toHaveLength(1)
      expect(decoded.tags[0], key).toMatchObject({ key, text: value, partial: false })
      expect(decoded.text, key).toBe(value)
    }
  })
})
