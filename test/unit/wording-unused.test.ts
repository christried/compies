import { describe, expect, it } from 'vitest'
import { dataOf, formatReport, messagesOf, scanUnused } from '../../scripts/wording/unused-scan.mjs'

// scripts/wording/unused.mjs lists the texts of de.json that no code refers to (#626, spec #620). The real locale file
// and the real sources are no fixture here: a test on them would turn red the day a ticket builds one of the unused groups.

const vue = (text: string) => ({ file: 'app/pages/x.vue', text })
const keysOf = (result: { groups: { keys: { key: string }[] }[] }) => result.groups.flatMap(g => g.keys.map(k => k.key))

describe('messagesOf', () => {
  it('gives dotted keys for a nested tree, in file order', () => {
    expect(messagesOf({ home: { title: 'Start', sub: { a: 'A' } }, nav: { x: 'X' } })).toEqual([
      { key: 'home.title', text: 'Start' },
      { key: 'home.sub.a', text: 'A' },
      { key: 'nav.x', text: 'X' },
    ])
  })

  it('gives an array leaf one message per item, keyed by its index', () => {
    expect(messagesOf({ wheel: { placeholders: ['Eins', 'Zwei', 'Drei'] }, nav: { x: 'X' } })).toEqual([
      { key: 'wheel.placeholders.0', text: 'Eins' },
      { key: 'wheel.placeholders.1', text: 'Zwei' },
      { key: 'wheel.placeholders.2', text: 'Drei' },
      { key: 'nav.x', text: 'X' },
    ])
  })

  it('gives an empty array no message', () => {
    expect(messagesOf({ a: { list: [] } })).toEqual([])
  })

  it('keeps a plural string as one message', () => {
    expect(messagesOf({ board: { games: '{n} Spiel | {n} Spiele' } })).toEqual([
      { key: 'board.games', text: '{n} Spiel | {n} Spiele' },
    ])
  })

  it('throws, naming the key, on a number leaf', () => {
    expect(() => messagesOf({ a: { b: 3 } })).toThrow('a.b')
  })

  it('throws, naming the key, on a null leaf', () => {
    expect(() => messagesOf({ a: { b: null } })).toThrow('a.b')
  })

  it('throws, naming the key, on an array holding a non-string', () => {
    expect(() => messagesOf({ a: { b: ['x', 1] } })).toThrow('a.b')
  })
})

describe('scanUnused', () => {
  it('does not report a literal key', () => {
    const result = scanUnused(messagesOf({ home: { title: 'Start' } }), [vue(`t('home.title')`)])
    expect(result).toEqual({ groups: [], total: 0 })
  })

  it('does not report the items of an array or the keys of a group that a literal key names', () => {
    const messages = messagesOf({ a: { list: ['x', 'y'], listX: ['z'] }, legal: { impressum: { title: 'I' }, impressumX: { t: 't' } } })
    const result = scanUnused(messages, [vue(`const l = tm('a.list'); const i = tm('legal.impressum')`)])
    expect(keysOf(result)).toEqual(['a.listX.0', 'legal.impressumX.t'])
  })

  it('reports a key nothing names, with its text, under its top-level group', () => {
    const result = scanUnused(messagesOf({ home: { title: 'Start' } }), [vue(`t('other.thing')`)])
    expect(result.groups).toEqual([{ group: 'home', keys: [{ key: 'home.title', text: 'Start' }], total: 1 }])
  })

  it('does not report a key inside a double-quoted Vue attribute', () => {
    const result = scanUnused(messagesOf({ empty: { library: { title: 'Leer' } } }), [
      vue(`<Foo :title="t('empty.library.title')" />`),
    ])
    expect(keysOf(result)).toEqual([])
  })

  it('does not report a key under a template-literal prefix', () => {
    const result = scanUnused(messagesOf({ legal: { impressum: { title: 'I' } }, other: { a: 'A' } }), [
      vue('t(`legal.${doc}.${section}`)'),
    ])
    expect(keysOf(result)).toEqual(['other.a'])
  })

  it('treats a prefix without a trailing dot as a plain startsWith', () => {
    const messages = messagesOf({ ceremony: { tie: { subBoth: 'B', liveAll: 'L' } } })
    const result = scanUnused(messages, [{ file: 'app/utils/ceremony.ts', text: 'const k = `ceremony.tie.sub${variant}`' }])
    expect(keysOf(result)).toEqual(['ceremony.tie.liveAll'])
  })

  it('does not report a key under a concatenated prefix', () => {
    const result = scanUnused(messagesOf({ mvp: { site: { x: 'X' } } }), [vue(`t('mvp.site.' + area)`)])
    expect(keysOf(result)).toEqual([])
  })

  it('marks nothing for a template that is no message key', () => {
    const result = scanUnused(messagesOf({ api: { x: 'X' } }), [vue('fetch(`/api/${x}`)')])
    expect(keysOf(result)).toEqual(['api.x'])
  })

  it('does not report a key from a lookup table', () => {
    const result = scanUnused(messagesOf({ error: { forbidden: 'Nein' } }), [
      { file: 'app/utils/api-error.ts', text: `const MAP = { not_host: 'error.forbidden' }` },
    ])
    expect(keysOf(result)).toEqual([])
  })

  it('does not report the sub-tree a server file imports from the locale file', () => {
    const messages = messagesOf({ mvp: { ics: { alarm: 'A', summary: 'S' }, icsX: { a: 'a' }, other: 'o' } })
    const result = scanUnused(messages, [
      {
        file: 'server/api/ics.get.ts',
        text: `import de from '../../i18n/locales/de.json'\nconst copy = de.mvp.ics`,
      },
    ])
    expect(keysOf(result)).toEqual(['mvp.icsX.a', 'mvp.other'])
  })

  it('marks nothing for the same member chain in a file without the import', () => {
    const result = scanUnused(messagesOf({ mvp: { ics: { alarm: 'A' } } }), [
      { file: 'server/other.ts', text: `const copy = de.mvp.ics` },
    ])
    expect(keysOf(result)).toEqual(['mvp.ics.alarm'])
  })

  it('does not take the import line itself for a member chain', () => {
    const result = scanUnused(messagesOf({ json: { a: 'A' } }), [
      { file: 'server/x.ts', text: `import de from '../../i18n/locales/de.json'` },
    ])
    expect(keysOf(result)).toEqual(['json.a'])
  })

  it('does not count a key inside a longer string', () => {
    const messages = messagesOf({ error: { forbidden: 'Nein' } })
    expect(keysOf(scanUnused(messages, [vue(`'error.forbidden.more'`)]))).toEqual(['error.forbidden'])
    expect(keysOf(scanUnused(messages, [vue(`'see error.forbidden'`)]))).toEqual(['error.forbidden'])
  })

  it('lists groups in locale-file order and keys in file order, leaving out a fully used group', () => {
    const messages = messagesOf({ b: { y: 'Y', x: 'X' }, a: { z: 'Z' }, c: { used: 'U' }, d: { w: 'W' } })
    const result = scanUnused(messages, [vue(`t('c.used')`)])
    expect(result.groups.map(g => g.group)).toEqual(['b', 'a', 'd'])
    expect(result.groups[0]!.keys.map(k => k.key)).toEqual(['b.y', 'b.x'])
  })

  it('counts the messages of each group, used or not, for the count line', () => {
    const result = scanUnused(messagesOf({ a: { x: 'X', y: 'Y' } }), [vue(`t('a.x')`)])
    expect(result.groups).toEqual([{ group: 'a', keys: [{ key: 'a.y', text: 'Y' }], total: 2 }])
  })

  it('handles an empty locale', () => {
    expect(scanUnused([], [vue(`t('a.b')`)])).toEqual({ groups: [], total: 0 })
  })

  it('handles one unused key', () => {
    expect(keysOf(scanUnused(messagesOf({ a: { x: 'X' } }), []))).toEqual(['a.x'])
  })

  it('handles two unused keys in two groups', () => {
    const result = scanUnused(messagesOf({ a: { x: 'X' }, b: { y: 'Y' } }), [])
    expect(result.groups.map(g => g.group)).toEqual(['a', 'b'])
    expect(result.total).toBe(2)
  })
})

describe('formatReport', () => {
  const messages = messagesOf({ a: { x: 'Eins', y: 'Zwei' }, b: { z: 'Drei' } })

  it('names each unused key with its text under its group and ends with the counts and the total', () => {
    const lines = formatReport(scanUnused(messages, [vue(`t('a.y')`)]), messages.length).split('\n')
    expect(lines).toContain('a  1 of 2 unused')
    expect(lines).toContain('  a.x  Eins')
    expect(lines).toContain('b  1 of 1 unused')
    expect(lines).toContain('  b.z  Drei')
    expect(lines.slice(-3)).toEqual(['a  1 / 2', 'b  1 / 1', 'Total  2 of 3 messages unused in 2 groups'])
  })

  it('cuts a long text to one line on the screen', () => {
    const long = 'x'.repeat(300)
    const m = messagesOf({ a: { x: long } })
    const report = formatReport(scanUnused(m, []), m.length)
    const line = report.split('\n').find(l => l.startsWith('  a.x'))!
    expect(line.length).toBeLessThan(130)
    expect(line.endsWith('…')).toBe(true)
  })

  it('says so when nothing is unused', () => {
    const result = scanUnused(messages, [vue(`t('a.x') t('a.y') t('b.z')`)])
    expect(formatReport(result, messages.length)).toBe('No unused texts.')
  })
})

describe('dataOf', () => {
  it('has exactly the shape the review model reads, with the full text', () => {
    const long = 'y'.repeat(300)
    const m = messagesOf({ a: { x: 'X', n: long }, b: { z: 'Z' } })
    expect(dataOf(scanUnused(m, [vue(`t('a.x')`)]))).toEqual({
      groups: [
        { group: 'a', keys: [{ key: 'a.n', text: long }] },
        { group: 'b', keys: [{ key: 'b.z', text: 'Z' }] },
      ],
    })
  })

  it('is an empty group list when nothing is unused', () => {
    expect(dataOf({ groups: [], total: 0 })).toEqual({ groups: [] })
  })
})
