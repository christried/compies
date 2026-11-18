import { Editor } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { createNotesExtensions } from '~/utils/notes-extensions'
import { NOTES_LINK_REL, parseNotes } from '~~/shared/notes-doc'

// ADR 0019: the editor's schema is exactly the server's list (#820, review 0.16 F3). Every document `parseNotes` accepts must come back from the editor's Tiptap
// schema unchanged, so the editor never has to patch a stored document and never refuses an edit in one. The corpus holds every node and every mark the schema allows.

const MAX = 2000
const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const link = { type: 'link', attrs: { href: 'https://example.com/' } }
const paragraph = (...content: unknown[]) => (content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' })
const heading = (...content: unknown[]) => (content.length > 0 ? { type: 'heading', attrs: { level: 3 }, content } : { type: 'heading', attrs: { level: 3 } })
const item = (...content: unknown[]) => ({ type: 'listItem', content })
const doc = (...content: unknown[]) => ({ type: 'doc', content })

const corpus: [string, unknown][] = [
  ['a plain paragraph', doc(paragraph(text('Hallo')))],
  ['an empty paragraph between text', doc(paragraph(text('a')), paragraph(), paragraph(text('b')))],
  ['bold, italic and both in a paragraph', doc(paragraph(text('a', [{ type: 'bold' }]), text('b', [{ type: 'italic' }]), text('c', [{ type: 'bold' }, { type: 'italic' }])))],
  ['a link, also bold and italic', doc(paragraph(text('a', [link]), text('b', [{ type: 'bold' }, link]), text('c', [{ type: 'italic' }, link])))],
  ['a heading', doc(heading(text('Titel')))],
  ['an empty heading', doc(heading(), paragraph(text('a')))],
  ['italic and a link in a heading', doc(heading(text('a', [{ type: 'italic' }]), text('b', [link]), text('c', [{ type: 'italic' }, link])))],
  ['a bullet list of two items', doc({ type: 'bulletList', content: [item(paragraph(text('a'))), item(paragraph(text('b')))] })],
  ['an ordered list with marks and two paragraphs in an item', doc({ type: 'orderedList', content: [item(paragraph(text('a', [{ type: 'bold' }])), paragraph(text('b', [link])))] })],
  ['every block after another', doc(paragraph(text('a')), heading(text('b')), { type: 'bulletList', content: [item(paragraph(text('c')))] }, { type: 'orderedList', content: [item(paragraph(text('d')))] })],
]

/** What the editor hands back on a save: its JSON through the server's rebuild, which drops the rendering attributes Tiptap adds (a link's target and rel, a list's start). A node or mark the schema lacks is gone from it. */
function held(content: unknown): unknown {
  const editor = new Editor({ extensions: createNotesExtensions({ placeholder: () => '', onOpenLink: () => {} }), content: content as never })
  try {
    return parseNotes(editor.getJSON(), MAX)
  }
  finally {
    editor.destroy()
  }
}

/** The marks of a text node are a set: Tiptap writes them in its schema's order, which is no part of the document. */
function markOrderless(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(markOrderless)
  if (node === null || typeof node !== 'object') return node
  const record = node as Record<string, unknown>
  const out = Object.fromEntries(Object.entries(record).map(([key, value]) => [key, markOrderless(value)]))
  if (Array.isArray(out.marks)) out.marks = [...(out.marks as { type: string }[])].sort((a, b) => a.type.localeCompare(b.type))
  return out
}

describe('the editor\'s schema holds every document the server accepts, unchanged (#820)', () => {
  it.each(corpus)('%s', (_label, input) => {
    const accepted = parseNotes(input, MAX)
    expect(accepted, 'the corpus is a document the server accepts, as it is').toEqual(input)
    expect(markOrderless(held(accepted))).toEqual(markOrderless(input))
  })

  it('writes a link with the one rel of the shared module', () => {
    const editor = new Editor({ extensions: createNotesExtensions({ placeholder: () => '', onOpenLink: () => {} }), content: doc(paragraph(text('a', [link]))) as never })
    try {
      expect(editor.getHTML()).toContain(`rel="${NOTES_LINK_REL}"`)
    }
    finally {
      editor.destroy()
    }
  })
})
