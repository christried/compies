import { describe, expect, it } from 'vitest'
import { notesFromLines, notesLength, notesPlainText, parseNotes, type NotesDoc } from '../../shared/notes-doc'

// The document of the Game notes (#727, ADR 0019): what the server accepts, how long it is, how it reads as plain text.

const MAX = 2000

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })
const doc = (...content: unknown[]) => ({ type: 'doc', content })
const item = (...content: unknown[]) => ({ type: 'listItem', content })

describe('parseNotes: what is accepted', () => {
  it('takes a paragraph of text', () => {
    const input = doc(paragraph(text('Hallo')))
    expect(parseNotes(input, MAX)).toEqual(input)
  })

  it('takes a heading of level 3', () => {
    const input = doc({ type: 'heading', attrs: { level: 3 }, content: [text('Titel')] })
    expect(parseNotes(input, MAX)).toEqual(input)
  })

  it.each(['bulletList', 'orderedList'] as const)('takes a %s with 1 and with 2 items', (type) => {
    const one = doc({ type, content: [item(paragraph(text('a')))] })
    const two = doc({ type, content: [item(paragraph(text('a'))), item(paragraph(text('b')))] })
    expect(parseNotes(one, MAX)).toEqual(one)
    expect(parseNotes(two, MAX)).toEqual(two)
  })

  it.each(['bulletList', 'orderedList'] as const)('refuses a %s without items', (type) => {
    expect(parseNotes(doc({ type, content: [] }), MAX)).toBeUndefined()
    expect(parseNotes(doc({ type }), MAX)).toBeUndefined()
  })

  it('takes a list item of two paragraphs', () => {
    const input = doc({ type: 'bulletList', content: [item(paragraph(text('a')), paragraph(text('b')))] })
    expect(parseNotes(input, MAX)).toEqual(input)
  })

  it('drops the attrs Tiptap writes on an orderedList', () => {
    const input = doc({ type: 'orderedList', attrs: { start: 1, type: null }, content: [item(paragraph(text('a')))] })
    expect(parseNotes(input, MAX)).toEqual(doc({ type: 'orderedList', content: [item(paragraph(text('a')))] }))
  })

  it.each([
    [[{ type: 'bold' }]],
    [[{ type: 'italic' }]],
    [[{ type: 'link', attrs: { href: 'https://example.com/' } }]],
    [[{ type: 'bold' }, { type: 'italic' }, { type: 'link', attrs: { href: 'https://example.com/' } }]],
  ])('takes the marks %j on a text node', (marks) => {
    const input = doc(paragraph(text('x', marks)))
    expect(parseNotes(input, MAX)).toEqual(input)
  })

  it('collapses a mark of one type that comes twice to the first', () => {
    const input = doc(paragraph(text('x', [{ type: 'bold' }, { type: 'bold' }])))
    expect(parseNotes(input, MAX)).toEqual(doc(paragraph(text('x', [{ type: 'bold' }]))))
  })

  it('takes a paragraph without content and keeps it in a document with text', () => {
    const input = doc(paragraph(text('a')), { type: 'paragraph' }, paragraph(text('b')))
    expect(parseNotes(input, MAX)).toEqual(input)
  })

  it('treats an empty paragraph with content [] as one without content', () => {
    const input = doc(paragraph(text('a')), { type: 'paragraph', content: [] })
    expect(parseNotes(input, MAX)).toEqual(doc(paragraph(text('a')), { type: 'paragraph' }))
  })
})

describe('parseNotes: what is refused', () => {
  const refused: [string, unknown][] = [
    ['a hardBreak', doc(paragraph(text('a'), { type: 'hardBreak' }))],
    ['an image', doc({ type: 'image', attrs: { src: 'https://example.com/a.png' } })],
    ['a blockquote', doc({ type: 'blockquote', content: [paragraph(text('a'))] })],
    ['a codeBlock', doc({ type: 'codeBlock', content: [text('a')] })],
    ['a horizontalRule', doc({ type: 'horizontalRule' })],
    ['a table', doc({ type: 'table', content: [] })],
    ['the mark code', doc(paragraph(text('a', [{ type: 'code' }])))],
    ['the mark underline', doc(paragraph(text('a', [{ type: 'underline' }])))],
    ['the mark strike', doc(paragraph(text('a', [{ type: 'strike' }])))],
    ['the mark textStyle', doc(paragraph(text('a', [{ type: 'textStyle', attrs: { color: 'red' } }])))],
    ['a list inside a listItem', doc({ type: 'bulletList', content: [item(paragraph(text('a')), { type: 'bulletList', content: [item(paragraph(text('b')))] })] })],
    ['a listItem outside a list', doc(item(paragraph(text('a'))))],
    ['a listItem without a paragraph', doc({ type: 'bulletList', content: [item()] })],
    ['a text outside a paragraph', doc(text('a'))],
    ['a heading of level 1', doc({ type: 'heading', attrs: { level: 1 }, content: [text('a')] })],
    ['a heading of level 2', doc({ type: 'heading', attrs: { level: 2 }, content: [text('a')] })],
    ['a heading of level 4', doc({ type: 'heading', attrs: { level: 4 }, content: [text('a')] })],
    ['a heading without a level', doc({ type: 'heading', content: [text('a')] })],
    ['the root type paragraph', paragraph(text('a'))],
    ['content that is not an array', { type: 'doc', content: 'a' }],
    ['an empty text', doc(paragraph(text('')))],
    ['a text node with content', doc(paragraph({ type: 'text', text: 'a', content: [] }))],
    ['a plain non-empty string', 'Notiz'],
    ['a number', 5],
    ['an array', [doc(paragraph(text('a')))]],
    ['a mark without a type', doc(paragraph(text('a', [{}])))],
  ]
  it.each(refused)('refuses %s', (_label, input) => {
    expect(parseNotes(input, MAX)).toBeUndefined()
  })
})

describe('parseNotes: links', () => {
  const link = (href: unknown, extra: Record<string, unknown> = {}) => doc(paragraph(text('x', [{ type: 'link', attrs: { href, ...extra } }])))

  it.each([
    ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
    ['http://example.com', 'http://example.com/'],
    ['HTTP://Example.com/X', 'http://example.com/X'],
  ])('takes %s and stores %s', (href, stored) => {
    expect(parseNotes(link(href), MAX)).toEqual(link(stored))
  })

  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'mailto:a@b.de', 'ftp://x', '//example.com', '/pfad', '', 'http://', 42, undefined])(
    'refuses the href %j',
    (href) => {
      expect(parseNotes(link(href), MAX)).toBeUndefined()
    },
  )

  it('refuses a link without attrs', () => {
    expect(parseNotes(doc(paragraph(text('x', [{ type: 'link' }]))), MAX)).toBeUndefined()
  })

  it('drops target, rel and class from the link', () => {
    const parsed = parseNotes(link('https://example.com/', { target: '_blank', rel: 'noopener', class: 'x' }), MAX)
    expect(parsed).toEqual(link('https://example.com/'))
  })
})

describe('parseNotes: the length', () => {
  const lines = (...parts: string[]) => doc(...parts.map(part => paragraph(text(part))))

  it('takes 2000 characters and refuses 2001', () => {
    expect(parseNotes(lines('a'.repeat(2000)), MAX)).not.toBeUndefined()
    expect(parseNotes(lines('a'.repeat(2001)), MAX)).toBeUndefined()
  })

  it('counts the limit it is given', () => {
    expect(parseNotes(lines('abcd'), 3)).toBeUndefined()
    expect(parseNotes(lines('abc'), 3)).not.toBeUndefined()
  })

  it('counts a family emoji as one character', () => {
    expect(parseNotes(lines(`${'a'.repeat(1999)}👨‍👩‍👧`), MAX)).not.toBeUndefined()
    expect(parseNotes(lines(`${'a'.repeat(2000)}👨‍👩‍👧`), MAX)).toBeUndefined()
  })

  it('counts nothing for block boundaries: 2000 characters over two paragraphs', () => {
    expect(parseNotes(lines('a'.repeat(1000), 'a'.repeat(1000)), MAX)).not.toBeUndefined()
  })

  it('counts nothing for list and item boundaries: 2000 characters over two items', () => {
    const input = doc({ type: 'bulletList', content: [item(paragraph(text('a'.repeat(1000)))), item(paragraph(text('a'.repeat(1000))))] })
    expect(parseNotes(input, MAX)).not.toBeUndefined()
  })

  it('counts nothing for a mark in the middle', () => {
    const input = doc(paragraph(text('a'.repeat(1000)), text('b'.repeat(1000), [{ type: 'bold' }])))
    expect(parseNotes(input, MAX)).not.toBeUndefined()
  })

  it('counts an emoji with a skin tone split over two marked nodes as one', () => {
    const input = doc(paragraph(text('a'.repeat(1999)), text('👍', [{ type: 'bold' }]), text('🏽', [{ type: 'italic' }])))
    expect(parseNotes(input, MAX)).not.toBeUndefined()
  })

  it('refuses 2001 characters across blocks', () => {
    expect(parseNotes(lines('a'.repeat(1000), 'a'.repeat(1001)), MAX)).toBeUndefined()
  })

  it('counts spaces', () => {
    expect(parseNotes(lines(`${' '.repeat(1000)}${'a'.repeat(1001)}`), MAX)).toBeUndefined()
  })

  it('does not count the link address', () => {
    const input = doc(paragraph(text('a'.repeat(2000), [{ type: 'link', attrs: { href: `https://example.com/${'p'.repeat(500)}` } }])))
    expect(parseNotes(input, MAX)).not.toBeUndefined()
  })
})

describe('parseNotes: none', () => {
  it.each([
    ['an empty content', { type: 'doc', content: [] }],
    ['no content', { type: 'doc' }],
    ['one empty paragraph', doc({ type: 'paragraph' })],
    ['three empty paragraphs', doc({ type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' })],
    ['a paragraph of spaces', doc(paragraph(text('   ')))],
    ['a list of spaces', doc({ type: 'bulletList', content: [item(paragraph(text(' ')))] })],
    ['undefined', undefined],
    ['null', null],
    ['the empty string', ''],
  ])('%s is null', (_label, input) => {
    expect(parseNotes(input, MAX)).toBeNull()
  })
})

describe('parseNotes: the size cap', () => {
  it('takes 2000 single-character bold nodes (104 000 characters of JSON)', () => {
    const nodes = Array.from({ length: 2000 }, () => text('a', [{ type: 'bold' }]))
    expect(JSON.stringify(doc(paragraph(...nodes))).length).toBeGreaterThan(100_000)
    expect(parseNotes(doc(paragraph(...nodes)), MAX)).not.toBeUndefined()
  })

  it('refuses empty paragraphs that add up to over 200 000 characters', () => {
    const empty = Array.from({ length: 20_000 }, () => ({ type: 'paragraph' }))
    expect(parseNotes(doc(paragraph(text('a')), ...empty), MAX)).toBeUndefined()
  })
})

describe('notesLength', () => {
  it('is 0 for an empty paragraph and sums the textblocks', () => {
    const parsed = parseNotes(doc({ type: 'paragraph' }, paragraph(text('ab')), { type: 'heading', attrs: { level: 3 }, content: [text('c')] }), MAX) as NotesDoc
    expect(notesLength(parsed)).toBe(3)
  })
})

describe('notesPlainText', () => {
  const parsed = (input: unknown) => parseNotes(input, MAX) as NotesDoc

  it('is empty for none', () => {
    expect(notesPlainText(null)).toBe('')
  })

  it('writes 1 and 2 paragraphs', () => {
    expect(notesPlainText(parsed(doc(paragraph(text('a')))))).toBe('a')
    expect(notesPlainText(parsed(doc(paragraph(text('a')), paragraph(text('b')))))).toBe('a\nb')
  })

  it('writes an empty paragraph between two as an empty line', () => {
    expect(notesPlainText(parsed(doc(paragraph(text('a')), { type: 'paragraph' }, paragraph(text('b')))))).toBe('a\n\nb')
  })

  it('writes a heading as its text', () => {
    expect(notesPlainText(parsed(doc({ type: 'heading', attrs: { level: 3 }, content: [text('Titel')] }, paragraph(text('a')))))).toBe('Titel\na')
  })

  it('writes a bullet list with 1 and 2 items', () => {
    expect(notesPlainText(parsed(doc({ type: 'bulletList', content: [item(paragraph(text('a')))] })))).toBe('- a')
    expect(notesPlainText(parsed(doc({ type: 'bulletList', content: [item(paragraph(text('a'))), item(paragraph(text('b')))] })))).toBe('- a\n- b')
  })

  it('writes an ordered list with 1 and 2 items and restarts the numbering in a second list', () => {
    const one = { type: 'orderedList', content: [item(paragraph(text('a')))] }
    const two = { type: 'orderedList', content: [item(paragraph(text('a'))), item(paragraph(text('b')))] }
    expect(notesPlainText(parsed(doc(one)))).toBe('1. a')
    expect(notesPlainText(parsed(doc(two)))).toBe('1. a\n2. b')
    expect(notesPlainText(parsed(doc(two, paragraph(text('x')), two)))).toBe('1. a\n2. b\nx\n1. a\n2. b')
  })

  it('joins the paragraphs of one item with a line break and no prefix on the later ones', () => {
    expect(notesPlainText(parsed(doc({ type: 'bulletList', content: [item(paragraph(text('a')), paragraph(text('b')))] })))).toBe('- a\nb')
  })

  it('writes bold and a link as their text only', () => {
    const input = doc(paragraph(text('a', [{ type: 'bold' }]), text(' b ', [{ type: 'link', attrs: { href: 'https://example.com/' } }]), text('c')))
    expect(notesPlainText(parsed(input))).toBe('a b c')
  })

  it('is the way back of notesFromLines', () => {
    const lines = ['Settings: 3 Runden', '', 'Win: Punkte']
    expect(notesPlainText(notesFromLines(lines))).toBe(lines.join('\n'))
  })
})

describe('notesFromLines', () => {
  it.each([[[]], [['']], [['  ']], [['', ' ', '']]])('gives null for no visible text %j', (lines) => {
    expect(notesFromLines(lines)).toBeNull()
  })

  it('makes one paragraph of one line', () => {
    expect(notesFromLines(['Hallo'])).toEqual(doc(paragraph(text('Hallo'))))
  })

  it('makes an empty line an empty paragraph without content', () => {
    expect(notesFromLines(['a', '', 'b'])).toEqual(doc(paragraph(text('a')), { type: 'paragraph' }, paragraph(text('b'))))
  })

  it('keeps leading spaces', () => {
    expect(notesFromLines(['  a'])).toEqual(doc(paragraph(text('  a'))))
  })

  it.each([[['a']], [['a', '', 'b']], [['  a ', 'b  ']]])('passes parseNotes unchanged for %j', (lines) => {
    expect(parseNotes(notesFromLines(lines), MAX)).toEqual(notesFromLines(lines))
  })
})
