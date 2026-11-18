import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import RichNotesEditor from '~/components/RichNotesEditor.vue'
import type { NotesDoc } from '~~/shared/notes-doc'
import { contentOf, editorOf, mountEditor, toolbarButton, type, type MountedEditor } from './helpers/notes-editor'

// The link control of the notes editor (#454, 18-notizen § NoteLinkControl). It sits in the game form: Enter must not submit it and Esc must not close the sheet.

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as NotesDoc
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })
const link = (href: string) => ({ type: 'link', attrs: { href } })

/** `matchMedia` that says whether the md query (980 px) matches. */
function viewport(wide: boolean) {
  vi.stubGlobal('matchMedia', () => ({ matches: wide, addEventListener: () => {}, removeEventListener: () => {} }))
}

const addressInput = (page: MountedEditor) => page.get('input[type="url"]')

async function openOn(content: unknown, select: [number, number] | number) {
  const page = await mountEditor({ modelValue: content as NotesDoc })
  const range = typeof select === 'number' ? { from: select, to: select } : { from: select[0], to: select[1] }
  editorOf(page).commands.setTextSelection(range)
  await toolbarButton(page, 'Link').trigger('click')
  await vi.waitFor(() => expect(page.find('input[type="url"]').exists()).toBe(true))
  return page
}

async function enter(page: MountedEditor, address: string) {
  await addressInput(page).setValue(address)
  await addressInput(page).trigger('keydown', { key: 'Enter' })
}

const firstMarks = (page: MountedEditor) => editorOf(page).getJSON().content?.[0]?.content?.map(node => node.marks)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the link control', () => {
  it('refuses javascript: with the message, marks the field and keeps the control open', async () => {
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])

    await enter(page, 'javascript:alert(1)')

    const alert = page.get('[role="alert"]')
    expect(alert.text()).toBe('Nur Adressen mit http oder https.')
    expect(addressInput(page).attributes('aria-invalid')).toBe('true')
    expect(addressInput(page).attributes('aria-describedby')).toBe(alert.attributes('id'))
    expect(firstMarks(page)).toEqual([undefined])

    await addressInput(page).setValue('a.de')
    expect(page.find('[role="alert"]').exists()).toBe(false)
  })

  it('refuses an empty address with the message too', async () => {
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])

    await enter(page, '  ')

    expect(page.get('[role="alert"]').text()).toBe('Nur Adressen mit http oder https.')
  })

  it('links the selection to a bare domain with https:// and closes with the caret after the link', async () => {
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])

    await enter(page, 'a.de')

    // The editor's own mark carries the rendering attributes; they are gone from what the form gets, below.
    expect(firstMarks(page)?.[0]?.[0]).toMatchObject({ type: 'link', attrs: { href: 'https://a.de/', target: '_blank', rel: 'noopener noreferrer' } })
    expect(page.find('input[type="url"]').exists()).toBe(false)
    expect(editorOf(page).state.selection.from).toBe(7)
    // What the form gets carries the address and nothing of the link's rendering.
    expect(page.values.at(-1)).toEqual(doc(paragraph(text('Regeln', [link('https://a.de/')]))))
  })

  it('inserts the address as linked text when nothing is selected', async () => {
    const page = await openOn(doc(paragraph(text('vor'))), 4)

    await enter(page, 'https://example.com/x')

    expect(page.values.at(-1)).toEqual(doc(paragraph(text('vor'), text('https://example.com/x', [link('https://example.com/x')]))))
  })

  it('opens on the whole link under the caret and changes its address, never its text', async () => {
    const page = await openOn(doc(paragraph(text('lies '), text('Regeln', [link('https://a.de/')]), text(' nach'))), 8)

    expect(addressInput(page).element).toHaveProperty('value', 'https://a.de/')
    await enter(page, 'https://b.de/')

    expect(page.values.at(-1)).toEqual(doc(paragraph(text('lies '), text('Regeln', [link('https://b.de/')]), text(' nach'))))
  })

  it('removes the link with „Link entfernen“ and keeps its text', async () => {
    const page = await openOn(doc(paragraph(text('lies '), text('Regeln', [link('https://a.de/')]), text(' nach'))), 8)

    const remove = page.findAll('button').find(button => button.text() === 'Link entfernen')
    expect(remove).toBeDefined()
    await remove!.trigger('click')

    expect(page.values.at(-1)).toEqual(doc(paragraph(text('lies Regeln nach'))))
    expect(page.find('input[type="url"]').exists()).toBe(false)
  })

  it('offers „Link entfernen“ only when it edits a link', async () => {
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])

    expect(page.findAll('button').some(button => button.text() === 'Link entfernen')).toBe(false)
  })

  it('cancels with „Abbrechen“ and leaves the text as it was', async () => {
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])
    await addressInput(page).setValue('a.de')

    await page.findAll('button').find(button => button.text() === 'Abbrechen')!.trigger('click')

    expect(page.find('input[type="url"]').exists()).toBe(false)
    expect(page.values).toEqual([])
    expect(editorOf(page).state.selection).toMatchObject({ from: 1, to: 7 })
  })

  it('tints the target while the control is open, with a decoration and not a mark', async () => {
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])

    expect(page.find('.cp-note-link-target').exists()).toBe(true)
    expect(JSON.stringify(editorOf(page).getJSON())).not.toContain('cp-note-link-target')
    await page.findAll('button').find(button => button.text() === 'Abbrechen')!.trigger('click')
    expect(page.find('.cp-note-link-target').exists()).toBe(false)
  })

  it('does not submit the form around it when Enter applies the link', async () => {
    const submitted = vi.fn()
    const Host = defineComponent({
      setup: () => () => h('form', { onSubmit: (event: Event) => {
        event.preventDefault()
        submitted()
      } }, [h(RichNotesEditor, { modelValue: doc(paragraph(text('Regeln'))) })]),
    })
    const page = await mountSuspended(Host)
    await vi.waitFor(() => expect(page.find('[role="toolbar"]').exists()).toBe(true))
    const inner = page.findComponent(RichNotesEditor)
    editorOf(inner).commands.setTextSelection({ from: 1, to: 7 })
    await toolbarButton(inner, 'Link').trigger('click')
    await vi.waitFor(() => expect(page.find('input[type="url"]').exists()).toBe(true))

    const keydown = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    ;(page.get('input[type="url"]').element as HTMLInputElement).value = 'a.de'
    await page.get('input[type="url"]').trigger('input')
    page.get('input[type="url"]').element.dispatchEvent(keydown)

    expect(keydown.defaultPrevented).toBe(true)
    expect(submitted).not.toHaveBeenCalled()
  })

  it('closes on Esc and the key goes no further, so a sheet around the form stays open', async () => {
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])
    const outer = vi.fn()
    document.addEventListener('keydown', outer)

    await addressInput(page).trigger('keydown', { key: 'Escape' })

    document.removeEventListener('keydown', outer)
    expect(page.find('input[type="url"]').exists()).toBe(false)
    expect(outer).not.toHaveBeenCalled()
  })

  it('opens with Strg + K, and the editor prevents the browser\'s own Strg + K', async () => {
    const page = await mountEditor({ modelValue: doc(paragraph(text('Regeln'))) })
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true })

    contentOf(page).element.dispatchEvent(event)

    await vi.waitFor(() => expect(page.find('input[type="url"]').exists()).toBe(true))
    expect(event.defaultPrevented).toBe(true)
    expect(toolbarButton(page, 'Link').attributes('aria-expanded')).toBe('true')
  })

  it('is a bar under the toolbar below 980 px', async () => {
    viewport(false)
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])

    expect(page.find('[role="dialog"]').exists()).toBe(false)
    expect(page.find('[role="group"][aria-label="Link"]').exists()).toBe(true)
  })

  it('is a popover with role dialog from 980 px', async () => {
    viewport(true)
    const page = await openOn(doc(paragraph(text('Regeln'))), [1, 7])

    expect(page.get('[role="dialog"]').attributes('aria-label')).toBe('Link')
    expect(page.find('[role="group"][aria-label="Link"]').exists()).toBe(false)
  })

  it('refuses a link on paste even when the control is not used', async () => {
    const page = await mountEditor()
    type(page, '<p><a href="javascript:alert(1)">x</a></p>')

    expect(page.values.at(-1)).toEqual(doc(paragraph(text('x'))))
  })
})
