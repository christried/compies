import { Editor, getSchema } from '@tiptap/core'
import { afterEach, describe, expect, it } from 'vitest'
import { createNotesExtensions } from '~/utils/notes-extensions'
import { parseNotes } from '~~/shared/notes-doc'

// The notes editor (#454, ADR 0019): the extension list's schema is the shared module's list, what is pasted is narrowed to it, and the component
// around it emits only documents `parseNotes` accepts.

const MAX = 2000

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })
const doc = (...content: unknown[]) => ({ type: 'doc', content })
const item = (...content: unknown[]) => ({ type: 'listItem', content })

describe('the extensions', () => {
  const extensions = createNotesExtensions({ placeholder: () => '', onOpenLink: () => {} })
  const schema = getSchema(extensions)
  const editors: Editor[] = []

  function editorWith(content: unknown = doc(paragraph())) {
    const editor = new Editor({ element: document.createElement('div'), extensions, content: content as never })
    editors.push(editor)
    return editor
  }

  afterEach(() => {
    for (const editor of editors.splice(0)) editor.destroy()
  })

  it('has exactly the nodes and marks of the shared module', () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(['bulletList', 'doc', 'heading', 'listItem', 'orderedList', 'paragraph', 'text'])
    expect(Object.keys(schema.marks).sort()).toEqual(['bold', 'italic', 'link'])
  })

  it.each([
    ['a paragraph', doc(paragraph(text('Hallo')))],
    ['a heading', doc({ type: 'heading', attrs: { level: 3 }, content: [text('Titel')] })],
    ['both lists', doc({ type: 'bulletList', content: [item(paragraph(text('a')))] }, { type: 'orderedList', content: [item(paragraph(text('a')), paragraph(text('b')))] })],
    ['every mark', doc(paragraph(text('x', [{ type: 'bold' }, { type: 'italic' }, { type: 'link', attrs: { href: 'https://example.com/' } }])))],
    ['an empty paragraph between text', doc(paragraph(text('a')), { type: 'paragraph' }, paragraph(text('b')))],
  ])('holds %s of a document the shared module accepts', (_name, input) => {
    expect(parseNotes(input, MAX)).not.toBeNull()
    expect(() => schema.nodeFromJSON(input).check()).not.toThrow()
  })

  it('turns a pasted h1 to h6 into a heading of level 3', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const editor = editorWith()
      editor.commands.insertContent(`<h${level}>Titel</h${level}>`)
      expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
    }
  })

  it('keeps the text of what the schema has no place for', () => {
    const editor = editorWith()
    editor.commands.insertContent('<p>vor <img src="https://example.com/a.png" alt="x"> <span style="color: red">rot</span> <table><tr><td>Zelle</td></tr></table></p>')
    const shown = editor.state.doc.textContent
    expect(shown).toContain('rot')
    expect(shown).toContain('Zelle')
    expect(JSON.stringify(editor.getJSON())).not.toMatch(/image|table|color/)
  })

  it('reads <b> and <i> as bold and italic', () => {
    const editor = editorWith()
    editor.commands.insertContent('<p><b>fett</b> <i>schief</i></p>')
    const marks = (editor.getJSON().content?.[0]?.content ?? []).map(node => node.marks?.map(mark => mark.type))
    expect(marks).toEqual([['bold'], undefined, ['italic']])
  })

  it.each(['javascript:alert(1)', 'data:text/html,x'])('keeps the text of a pasted link to %s and drops the mark', (href) => {
    const editor = editorWith()
    editor.commands.insertContent(`<p><a href="${href}">x</a></p>`)
    expect(editor.getJSON().content?.[0]?.content).toEqual([{ type: 'text', text: 'x' }])
  })

  it('keeps a pasted https link', () => {
    const editor = editorWith()
    editor.commands.insertContent('<p><a href="https://example.com/a">x</a></p>')
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks?.[0]).toMatchObject({ type: 'link', attrs: { href: 'https://example.com/a' } })
  })

  it('allows no bold inside a heading', () => {
    const editor = editorWith(doc({ type: 'heading', attrs: { level: 3 }, content: [text('Titel')] }))
    editor.commands.selectAll()
    expect(editor.can().toggleBold()).toBe(false)
    editor.commands.toggleBold()
    expect(JSON.stringify(editor.getJSON())).not.toContain('bold')
  })

  it('nests nothing on Tab: the key is left to the browser and the document stays', () => {
    const stored = doc({ type: 'bulletList', content: [item(paragraph(text('a'))), item(paragraph(text('b')))] })
    const editor = editorWith(stored)
    editor.commands.setTextSelection(editor.state.doc.content.size - 4)
    const handled = editor.view.someProp('handleKeyDown', handle => handle(editor.view, new KeyboardEvent('keydown', { key: 'Tab' })))
    expect(handled).toBeFalsy()
    expect(editor.getJSON()).toEqual(stored)
  })

  it('writes `## ` as a heading of level 3', () => {
    const editor = editorWith()
    editor.commands.insertContent('##')
    const at = editor.state.selection.from
    // The input rules run on the text input handler: the space is the one that makes the heading.
    editor.view.someProp('handleTextInput', handle => handle(editor.view, at, at, ' '))
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
  })
})
