import { describe, expect, it } from 'vitest'
import { checkLinkAddress, editorContent, noteShortcutLabel, tidyNotes } from '~/utils/notes-editor'
import { notesLinkHref } from '~~/shared/notes-doc'

// The pure rules of the notes editor (#454): what the editor emits is tidied before the shared parser rebuilds it, and the link control checks an address
// with the rule the server applies.

const text = (value: string) => ({ type: 'text', text: value })
const paragraph = (value?: string) => (value === undefined ? { type: 'paragraph' } : { type: 'paragraph', content: [text(value)] })

describe('tidyNotes', () => {
  it('drops the empty paragraphs at the end', () => {
    expect(tidyNotes({ type: 'doc', content: [paragraph('a'), paragraph(), paragraph()] })).toEqual({ type: 'doc', content: [paragraph('a')] })
  })

  it('collapses a run of empty paragraphs between text to one', () => {
    expect(tidyNotes({ type: 'doc', content: [paragraph('a'), paragraph(), paragraph(), paragraph(), paragraph('b')] }))
      .toEqual({ type: 'doc', content: [paragraph('a'), paragraph(), paragraph('b')] })
  })

  it('leaves a document of empty paragraphs with no content at all', () => {
    expect(tidyNotes({ type: 'doc', content: [paragraph(), paragraph()] })).toEqual({ type: 'doc', content: [] })
  })

  it('treats a paragraph with an empty content array as empty', () => {
    expect(tidyNotes({ type: 'doc', content: [paragraph('a'), { type: 'paragraph', content: [] }] })).toEqual({ type: 'doc', content: [paragraph('a')] })
  })

  it('never touches a heading or a list, an empty item included', () => {
    const content = [
      { type: 'heading', attrs: { level: 3 }, content: [text('H')] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph()] }, { type: 'listItem', content: [paragraph('x')] }] },
    ]
    expect(tidyNotes({ type: 'doc', content })).toEqual({ type: 'doc', content })
  })

  it('does not mutate its input', () => {
    const input = { type: 'doc', content: [paragraph('a'), paragraph(), paragraph()] }
    const before = JSON.stringify(input)
    tidyNotes(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('keeps a document without a content key as it is', () => {
    expect(tidyNotes({ type: 'doc' })).toEqual({ type: 'doc', content: [] })
  })
})

describe('editorContent', () => {
  it('is an empty paragraph for no notes', () => {
    expect(editorContent(null)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })

  it('hands a document over as it is', () => {
    const doc = { type: 'doc', content: [paragraph('a'), { type: 'paragraph', content: [{ type: 'text', text: 'b', marks: [{ type: 'bold' }] }] }] } as const
    expect(editorContent(doc as never)).toEqual(doc)
  })

  it('takes bold off the text of a heading, which the editor has no place for, and keeps its other marks', () => {
    const marks = [{ type: 'bold' }, { type: 'italic' }]
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Titel', marks }] }] }
    expect(editorContent(doc as never)).toEqual({ type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Titel', marks: [{ type: 'italic' }] }] }] })
    // The stored document is not touched.
    expect(doc.content[0]!.content![0]!.marks).toEqual(marks)
  })

  it('leaves a text node without a mark in a heading without a marks key', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'T', marks: [{ type: 'bold' }] }] }] }
    expect(editorContent(doc as never).content[0]).toEqual({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'T' }] })
  })
})

describe('checkLinkAddress', () => {
  it.each(['https://a.de', 'http://a.de/x?y=1', 'HTTP://A.DE', '  https://a.de  '])('accepts %s', (raw) => {
    const result = checkLinkAddress(raw)
    expect(result.ok).toBe(true)
  })

  it('gives a bare domain https://', () => {
    expect(checkLinkAddress('a.de')).toEqual({ ok: true, href: 'https://a.de/' })
    expect(checkLinkAddress('www.a.de/x')).toEqual({ ok: true, href: 'https://www.a.de/x' })
  })

  it('writes an address the way the shared parser does', () => {
    expect(checkLinkAddress('HTTP://Example.com')).toEqual({ ok: true, href: 'http://example.com/' })
  })

  it.each(['javascript:alert(1)', 'data:text/html,x', 'ftp://a.de', 'mailto:a@b.de', 'Hausregeln', 'https://localhost'])('refuses %s', (raw) => {
    expect(checkLinkAddress(raw)).toEqual({ ok: false })
  })

  it('says an empty address is empty', () => {
    expect(checkLinkAddress('')).toEqual({ ok: false, empty: true })
    expect(checkLinkAddress('   ')).toEqual({ ok: false, empty: true })
  })

  it('returns only hrefs the shared rule accepts unchanged', () => {
    for (const raw of ['https://a.de', 'a.de', 'HTTP://A.DE/Pfad', 'www.a.de/x?y=1#z']) {
      const result = checkLinkAddress(raw)
      expect(result.ok && result.href === notesLinkHref(result.href)).toBe(true)
    }
  })
})

describe('noteShortcutLabel', () => {
  it('writes Strg+B, and ⌘B on an Apple platform', () => {
    expect(noteShortcutLabel('B', false)).toBe('Strg+B')
    expect(noteShortcutLabel('B', true)).toBe('⌘B')
  })
})
