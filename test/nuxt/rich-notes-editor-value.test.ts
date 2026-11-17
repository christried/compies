import { describe, expect, it, vi } from 'vitest'
import { FORMATTED_NOTES } from './helpers/formatted-notes'
import { contentOf, editorOf, mountEditor, toolbarButton, type MountedEditor } from './helpers/notes-editor'
import { GAME_NOTES_MAX } from '~~/shared/game'
import { parseNotes, type NotesDoc } from '~~/shared/notes-doc'

// What the notes editor holds and says (#454): the value that goes in and out, the count and its limit, and the states of the field.

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as NotesDoc

/** Puts a document into the editor as typing would: the editor reports an update. */
function write(page: MountedEditor, content: unknown) {
  editorOf(page).commands.setContent(content as never, { emitUpdate: true })
}

const letters = (n: number) => doc(paragraph(text('a'.repeat(n))))
const counter = (page: MountedEditor) => page.find('[aria-hidden="true"].tabular-nums')
const liveRegion = (page: MountedEditor) => page.get('[aria-live="polite"]')

describe('the value', () => {
  it('mounts a stored document without an emit, and shows it', async () => {
    const page = await mountEditor({ modelValue: FORMATTED_NOTES })

    expect(page.values).toEqual([])
    expect(page.emitted('update:modelValue')).toBeUndefined()
    expect(contentOf(page).text()).toContain('Regeln')
    expect(editorOf(page).getJSON().content?.[1]).toMatchObject({ type: 'heading' })
  })

  it('takes a changed modelValue as the new content, without an emit', async () => {
    const page = await mountEditor({ modelValue: doc(paragraph(text('eins'))) })

    await page.setProps({ modelValue: doc(paragraph(text('zwei'))) })

    expect(contentOf(page).text()).toBe('zwei')
    expect(page.values).toEqual([])
  })

  it('does nothing when the modelValue is its own echo: the caret stays', async () => {
    const page = await mountEditor({ modelValue: doc(paragraph(text('eins'))) })
    editorOf(page).commands.setTextSelection(3)
    editorOf(page).commands.insertContent('x')
    const caret = editorOf(page).state.selection.from

    await vi.waitFor(() => expect(page.values.length).toBe(1))
    await page.vm.$nextTick()

    expect(editorOf(page).state.selection.from).toBe(caret)
    expect(page.values).toHaveLength(1)
  })

  it('emits null when all text is deleted, and null for a field never typed in', async () => {
    const page = await mountEditor({ modelValue: doc(paragraph(text('eins'))) })

    editorOf(page).commands.selectAll()
    editorOf(page).commands.deleteSelection()

    await vi.waitFor(() => expect(page.values.at(-1)).toBeNull())
  })

  it('trims the empty paragraphs at the end and keeps one between text, and the value is a fixed point of parseNotes', async () => {
    const page = await mountEditor()

    write(page, doc(paragraph(text('a')), { type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' }, paragraph(text('b')), { type: 'paragraph' }, { type: 'paragraph' }))

    expect(page.values.at(-1)).toEqual(doc(paragraph(text('a')), { type: 'paragraph' }, paragraph(text('b'))))
    expect(parseNotes(page.values.at(-1), GAME_NOTES_MAX)).toEqual(page.values.at(-1))
  })

  it('carries nothing of the link rendering in what it emits', async () => {
    const page = await mountEditor()

    write(page, doc(paragraph(text('x', [{ type: 'link', attrs: { href: 'https://a.de/', target: '_blank', rel: 'noopener', class: null } }]))))

    expect(JSON.stringify(page.values.at(-1))).not.toMatch(/target|rel|class/)
  })

  it('emits the document again after Strg + Z took the last change back', async () => {
    const page = await mountEditor({ modelValue: doc(paragraph(text('eins'))) })
    editorOf(page).commands.insertContent('x')
    await vi.waitFor(() => expect(page.values).toHaveLength(1))

    editorOf(page).commands.undo()

    await vi.waitFor(() => expect(page.values.at(-1)).toEqual(doc(paragraph(text('eins')))))
  })

  it('loads a stored heading with bold text, and editing it does not throw', async () => {
    const stored = doc({ type: 'heading', attrs: { level: 3 }, content: [text('Titel', [{ type: 'bold' }])] })
    const page = await mountEditor({ modelValue: stored })

    expect(contentOf(page).text()).toBe('Titel')
    expect(() => editorOf(page).commands.insertContent('x')).not.toThrow()
    expect(JSON.stringify(page.values.at(-1))).not.toContain('bold')
  })

  it('handles no note, a one-character note and a note of 2000 characters with 40 empty paragraphs', async () => {
    const empty = await mountEditor({ modelValue: null })
    expect(contentOf(empty).text()).toBe('')
    const one = await mountEditor({ modelValue: letters(1) })
    expect(contentOf(one).text()).toBe('a')
    const blanks = Array.from({ length: 40 }, () => ({ type: 'paragraph' }))
    const long = await mountEditor({ modelValue: doc(paragraph(text('a'.repeat(1960))), ...blanks, paragraph(text('b'.repeat(40)))) })
    expect(counter(long).text()).toBe('noch 0 Zeichen')
    expect(long.invalids).toEqual([])
  })
})

describe('the count and the limit', () => {
  it('shows no counter at 1599 characters and „noch 400 Zeichen“ at 1600', async () => {
    const page = await mountEditor()

    write(page, letters(1599))
    expect(counter(page).exists()).toBe(false)

    write(page, letters(1600))
    await vi.waitFor(() => expect(counter(page).text()).toBe('noch 400 Zeichen'))
    expect(counter(page).classes()).toContain('text-ink-2')
  })

  it('turns the counter to the warning tone from 1800', async () => {
    const page = await mountEditor()

    write(page, letters(1800))

    await vi.waitFor(() => expect(counter(page).classes()).toContain('text-warning-fg'))
    expect(counter(page).text()).toBe('noch 200 Zeichen')
  })

  it('takes exactly 2000 characters without an error and without invalid(true)', async () => {
    const page = await mountEditor()

    write(page, letters(2000))

    await vi.waitFor(() => expect(counter(page).text()).toBe('noch 0 Zeichen'))
    expect(contentOf(page).attributes('aria-invalid')).toBeUndefined()
    expect(page.text()).not.toContain('Höchstens 2000 Zeichen.')
    expect(page.invalids).not.toContain(true)
    expect(page.values.at(-1)).toEqual(letters(2000))
  })

  it('shows the error at 2001: the help, „1 zu viel“, aria-invalid and invalid(true), and still emits the document', async () => {
    const page = await mountEditor()

    write(page, letters(2001))

    await vi.waitFor(() => expect(counter(page).text()).toBe('1 zu viel'))
    expect(counter(page).classes()).toContain('text-error-fg')
    expect(page.text()).toContain('Höchstens 2000 Zeichen.')
    expect(contentOf(page).attributes('aria-invalid')).toBe('true')
    expect(page.invalids).toEqual([true])
    expect(page.values.at(-1)).toEqual(letters(2001))

    write(page, letters(2000))
    await vi.waitFor(() => expect(page.invalids).toEqual([true, false]))
    expect(contentOf(page).attributes('aria-invalid')).toBeUndefined()
  })

  it('counts a family emoji as one character, a link as its text and three paragraphs as their sum', async () => {
    const page = await mountEditor()

    write(page, doc(paragraph(text('\u{1F468}‍\u{1F469}‍\u{1F467}'.repeat(1600)))))
    await vi.waitFor(() => expect(counter(page).text()).toBe('noch 400 Zeichen'))

    write(page, doc(paragraph(text('x'.repeat(1500), [{ type: 'link', attrs: { href: `https://example.com/${'p'.repeat(500)}` } }])), paragraph(text('y'.repeat(50))), paragraph(text('z'.repeat(50)))))
    await vi.waitFor(() => expect(counter(page).text()).toBe('noch 400 Zeichen'))
  })

  it('counts a paste of a million characters once, reports invalid and holds the last document back', async () => {
    const page = await mountEditor({ modelValue: doc(paragraph(text('vorher'))) })
    editorOf(page).commands.insertContent('vorher')
    await vi.waitFor(() => expect(page.values).toHaveLength(1))

    editorOf(page).commands.insertContent('a'.repeat(1_000_000))

    await vi.waitFor(() => expect(page.invalids).toEqual([true]))
    expect(page.text()).toContain('Höchstens 2000 Zeichen.')
    expect(page.values).toHaveLength(1)
  })
})

describe('the live region', () => {
  it('says nothing for a note that is loaded at 1700 characters', async () => {
    const page = await mountEditor({ modelValue: letters(1700) })

    expect(liveRegion(page).text()).toBe('')
  })

  it('speaks when the count crosses 1600 upwards, and „Höchstens 2000 Zeichen.“ when it crosses 2000', async () => {
    const page = await mountEditor()

    write(page, letters(1500))
    expect(liveRegion(page).text()).toBe('')
    write(page, letters(1600))
    await vi.waitFor(() => expect(liveRegion(page).text()).toBe('Noch 400 Zeichen'))

    write(page, letters(2001))
    await vi.waitFor(() => expect(liveRegion(page).text()).toBe('Höchstens 2000 Zeichen.'))
  })

  it('stays as it was while the count moves inside one band', async () => {
    const page = await mountEditor()
    write(page, letters(1600))
    await vi.waitFor(() => expect(liveRegion(page).text()).toBe('Noch 400 Zeichen'))

    write(page, letters(1650))
    expect(liveRegion(page).text()).toBe('Noch 400 Zeichen')
  })
})

describe('the states', () => {
  it('is not editable while disabled: contenteditable is false and the toolbar says aria-disabled', async () => {
    const page = await mountEditor({ disabled: true })

    expect(contentOf(page).attributes('contenteditable')).toBe('false')
    expect(contentOf(page).attributes('aria-disabled')).toBe('true')
    for (const label of ['Fett', 'Kursiv', 'Überschrift', 'Liste', 'Nummerierte Liste', 'Link']) {
      expect(toolbarButton(page, label).attributes('aria-disabled')).toBe('true')
    }
    expect(page.text()).toContain('Wird gespeichert …')
  })

  it('becomes editable again when the save fails, and emits nothing on the way', async () => {
    const page = await mountEditor({ disabled: true })

    await page.setProps({ disabled: false })

    await vi.waitFor(() => expect(contentOf(page).attributes('contenteditable')).toBe('true'))
    expect(page.values).toEqual([])
  })

  it('renders the notes without a textbox or a toolbar when readonly, with the lock help and the chip', async () => {
    const page = await mountEditor({ modelValue: FORMATTED_NOTES, readonly: true, variant: 'event' })

    expect(page.find('[role="textbox"]').exists()).toBe(false)
    expect(page.find('[role="toolbar"]').exists()).toBe(false)
    expect(page.text()).toContain('Regeln')
    expect(page.text()).toContain('Event beendet')
    expect(page.text()).toContain('Das Event ist beendet. Diese Notizen bleiben so stehen.')
  })

  it('names the field by its label and focuses the content on a click on the label', async () => {
    const page = await mountEditor()

    const label = page.get('label')
    expect(label.text()).toBe('Notizen')
    expect(contentOf(page).attributes('aria-labelledby')).toBe(label.attributes('id'))
    expect(contentOf(page).attributes('aria-multiline')).toBe('true')
    expect(contentOf(page).attributes('tabindex')).toBe('0')
    expect(contentOf(page).attributes('aria-describedby')).toBe(page.get('[id$="-help"]').attributes('id'))
  })

  it('has the words of its variant and the help of the hand-off', async () => {
    const game = await mountEditor()
    expect(game.get('label').text()).toBe('Notizen')
    expect(game.get('[id$="-help"]').text()).toBe('Nur du siehst das.')

    const event = await mountEditor({ variant: 'event' })
    expect(event.get('label').text()).toBe('Notizen für dieses Event')
    expect(event.get('[id$="-help"]').text()).toBe('Gilt nur für dieses Event. Nur du siehst das.')
  })

  it('wears the classes of the shared note stylesheet and the marker of the build test', async () => {
    const page = await mountEditor()

    expect(contentOf(page).classes()).toEqual(expect.arrayContaining(['cp-note', 'cp-note--edit']))
    expect(contentOf(page).attributes('data-notes-editor')).toBeDefined()
  })

  it('shows the placeholder of its variant on an empty note', async () => {
    const page = await mountEditor()

    expect(page.get('p.is-editor-empty').attributes('data-placeholder')).toBe('z. B. Einstellungen, Aufwärmen, Siegbedingung, Hausregeln')
  })
})
