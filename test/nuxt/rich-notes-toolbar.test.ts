import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import RichNotesEditor from '~/components/RichNotesEditor.vue'
import { parseNotes, type NotesDoc } from '~~/shared/notes-doc'
import { contentOf, editorOf, mountEditor, toolbarButton, type } from './helpers/notes-editor'

// The toolbar of the notes editor (#454, 18-notizen § NoteToolbar): each format through its button, as a User clicks it.

const MAX = 2000

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })
const doc = (...content: unknown[]) => ({ type: 'doc', content })
const item = (...content: unknown[]) => ({ type: 'listItem', content })

async function selected(content: string) {
  const page = await mountEditor()
  type(page, content)
  editorOf(page).commands.selectAll()
  return page
}

describe('the formats', () => {
  it.each([
    ['Fett', 'bold'],
    ['Kursiv', 'italic'],
  ])('%s through its button marks the selection and the button says so', async (label, mark) => {
    const page = await selected('Hallo')
    await toolbarButton(page, label).trigger('click')

    expect(editorOf(page).getJSON().content?.[0]?.content?.[0]?.marks).toEqual([{ type: mark }])
    await vi.waitFor(() => expect(toolbarButton(page, label).attributes('aria-pressed')).toBe('true'))
    expect(page.values.at(-1)).toEqual(doc(paragraph(text('Hallo', [{ type: mark }]))))

    await toolbarButton(page, label).trigger('click')
    expect(editorOf(page).getJSON().content?.[0]?.content?.[0]?.marks).toBeUndefined()
    await vi.waitFor(() => expect(toolbarButton(page, label).attributes('aria-pressed')).toBe('false'))
  })

  it.each([
    ['Liste', 'bulletList'],
    ['Nummerierte Liste', 'orderedList'],
  ])('%s through its button wraps the paragraph in a list, and a second click takes it out', async (label, kind) => {
    const page = await selected('Hallo')
    await toolbarButton(page, label).trigger('click')

    expect(editorOf(page).getJSON().content?.[0]?.type).toBe(kind)
    await vi.waitFor(() => expect(toolbarButton(page, label).attributes('aria-pressed')).toBe('true'))
    expect(page.values.at(-1)).toEqual(doc({ type: kind, content: [item(paragraph(text('Hallo')))] }))

    await toolbarButton(page, label).trigger('click')
    expect(editorOf(page).getJSON().content?.[0]?.type).toBe('paragraph')
    await vi.waitFor(() => expect(toolbarButton(page, label).attributes('aria-pressed')).toBe('false'))
  })

  it('Überschrift through its button makes a heading of level 3, and a second click a paragraph', async () => {
    const page = await selected('Titel')
    await toolbarButton(page, 'Überschrift').trigger('click')

    expect(editorOf(page).getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
    await vi.waitFor(() => expect(toolbarButton(page, 'Überschrift').attributes('aria-pressed')).toBe('true'))
    expect(parseNotes(page.values.at(-1), MAX)).toEqual(page.values.at(-1))

    await toolbarButton(page, 'Überschrift').trigger('click')
    expect(editorOf(page).getJSON().content?.[0]?.type).toBe('paragraph')
  })

  it('has no bold in a heading: the button is aria-disabled but focusable, and Strg + B changes nothing', async () => {
    const page = await selected('Titel')
    await toolbarButton(page, 'Überschrift').trigger('click')
    editorOf(page).commands.selectAll()

    await vi.waitFor(() => expect(toolbarButton(page, 'Fett').attributes('aria-disabled')).toBe('true'))
    expect(toolbarButton(page, 'Fett').attributes('disabled')).toBeUndefined()
    await toolbarButton(page, 'Fett').trigger('click')
    const { view } = editorOf(page)
    view.someProp('handleKeyDown', handle => handle(view, new KeyboardEvent('keydown', { key: 'b', ctrlKey: true })))
    expect(JSON.stringify(editorOf(page).getJSON())).not.toContain('bold')
  })

  it('lifts a list item out of its list when the heading button is used on it', async () => {
    const page = await mountEditor({ modelValue: doc({ type: 'bulletList', content: [item(paragraph(text('eins'))), item(paragraph(text('zwei')))] }) as NotesDoc })
    editorOf(page).commands.setTextSelection(editorOf(page).state.doc.content.size - 3)
    await toolbarButton(page, 'Überschrift').trigger('click')

    expect(editorOf(page).getJSON().content?.map(block => block.type)).toEqual(['bulletList', 'heading'])
    expect(editorOf(page).getJSON().content?.[1]?.content?.[0]?.text).toBe('zwei')
  })

  it('turns a heading into a list item when the list button is used on it', async () => {
    const page = await selected('Titel')
    await toolbarButton(page, 'Überschrift').trigger('click')
    await toolbarButton(page, 'Liste').trigger('click')

    expect(editorOf(page).getJSON().content?.[0]?.type).toBe('bulletList')
  })

  it('does not submit a form the editor sits in when a toolbar button is clicked', async () => {
    const submitted = vi.fn()
    const Host = defineComponent({
      setup: () => () => h('form', { onSubmit: (event: Event) => {
        event.preventDefault()
        submitted()
      } }, [h(RichNotesEditor, { modelValue: null })]),
    })
    const page = await mountSuspended(Host)
    await vi.waitFor(() => expect(page.find('[role="toolbar"]').exists()).toBe(true))
    for (const button of page.findAll('[role="toolbar"] button')) await button.trigger('click')

    expect(submitted).not.toHaveBeenCalled()
  })
})

describe('the toolbar', () => {
  it('moves between the buttons with the arrow keys and has one tab stop', async () => {
    const page = await mountEditor()
    const stops = () => page.findAll('[role="toolbar"] button').filter(button => button.attributes('tabindex') === '0').map(button => button.attributes('aria-label'))

    expect(stops()).toEqual(['Fett'])
    await toolbarButton(page, 'Fett').trigger('keydown', { key: 'ArrowRight' })
    expect(stops()).toEqual(['Kursiv'])
    await toolbarButton(page, 'Kursiv').trigger('keydown', { key: 'End' })
    expect(stops()).toEqual(['Link'])
    await toolbarButton(page, 'Link').trigger('keydown', { key: 'ArrowRight' })
    expect(stops()).toEqual(['Fett'])
    await toolbarButton(page, 'Fett').trigger('keydown', { key: 'ArrowLeft' })
    expect(stops()).toEqual(['Link'])
  })

  it('wears the toolbar role, the shortcuts and the dialog hint', async () => {
    const page = await mountEditor()
    const toolbar = page.get('[role="toolbar"]')

    expect(toolbar.attributes('aria-label')).toBe('Formatierung')
    expect(toolbar.attributes('aria-controls')).toBe(contentOf(page).attributes('id'))
    expect(toolbarButton(page, 'Fett').attributes('aria-keyshortcuts')).toBe('Control+B')
    expect(toolbarButton(page, 'Link').attributes('aria-keyshortcuts')).toBe('Control+K')
    expect(toolbarButton(page, 'Link').attributes('aria-haspopup')).toBe('dialog')
    expect(toolbarButton(page, 'Link').attributes('aria-pressed')).toBeUndefined()
    expect(toolbarButton(page, 'Link').attributes('aria-expanded')).toBe('false')
  })

  it('makes every button a type="button" one', async () => {
    const page = await mountEditor()

    expect(page.findAll('[role="toolbar"] button').every(button => button.attributes('type') === 'button')).toBe(true)
  })
})
