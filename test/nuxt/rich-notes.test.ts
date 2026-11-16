import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import RichNotes from '~/components/RichNotes.vue'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'

// The renderer of the notes document (#728, ADR 0019): the document's nodes become the app's own elements, never HTML. What the page shows is
// pinned here; the places that use it (library page, dialog, pickers, Round) pin their own wiring in their tests.

const text = (value: string, marks?: unknown[]) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) })
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content })
const item = (...content: unknown[]) => ({ type: 'listItem', content })
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as unknown as NotesDoc

async function render(notes: NotesDoc, props: { headingLevel?: 'h3' | 'h4' } = {}) {
  return mountSuspended(RichNotes, { props: { doc: notes, ...props } })
}

describe('RichNotes (#728)', () => {
  it('renders a paragraph as a p inside one div', async () => {
    const page = await render(doc(paragraph(text('Hallo'))))

    expect(page.element.tagName).toBe('DIV')
    expect(page.findAll('p').map(p => p.text())).toEqual(['Hallo'])
  })

  it('renders a heading as h3, or as the level the place asks for', async () => {
    const heading = { type: 'heading', attrs: { level: 3 }, content: [text('Titel')] }

    expect((await render(doc(heading))).get('h3').text()).toBe('Titel')
    const four = await render(doc(heading), { headingLevel: 'h4' })
    expect(four.get('h4').text()).toBe('Titel')
    expect(four.find('h3').exists()).toBe(false)
  })

  it('renders no heading for a heading without content', async () => {
    const page = await render(doc({ type: 'heading', attrs: { level: 3 } }, paragraph(text('a'))))

    expect(page.find('h3').exists()).toBe(false)
    expect(page.findAll('p')).toHaveLength(1)
  })

  it.each([['bulletList', 'ul'], ['orderedList', 'ol']] as const)('renders a %s as %s > li > p, at 1 and at 2 items', async (type, tag) => {
    const one = await render(doc({ type, content: [item(paragraph(text('a')))] }))
    expect(one.findAll(`${tag} > li > p`).map(p => p.text())).toEqual(['a'])

    const two = await render(doc({ type, content: [item(paragraph(text('a'))), item(paragraph(text('b')))] }))
    expect(two.findAll(`${tag} > li > p`).map(p => p.text())).toEqual(['a', 'b'])
  })

  it('renders a list item of two paragraphs as two p in one li', async () => {
    const page = await render(doc({ type: 'bulletList', content: [item(paragraph(text('a')), paragraph(text('b')))] }))

    expect(page.findAll('li')).toHaveLength(1)
    expect(page.findAll('li > p').map(p => p.text())).toEqual(['a', 'b'])
  })

  it('renders no list for a document without one', async () => {
    const page = await render(doc(paragraph(text('a'))))

    expect(page.find('ul').exists()).toBe(false)
    expect(page.find('ol').exists()).toBe(false)
  })

  it('renders bold as strong and italic as em, both on one text node nest and keep the text', async () => {
    const page = await render(doc(paragraph(text('fett', [{ type: 'bold' }]), text(' '), text('schief', [{ type: 'italic' }]), text(' beides', [{ type: 'bold' }, { type: 'italic' }]))))

    expect(page.findAll('strong').map(e => e.text())).toEqual(['fett', 'beides'])
    expect(page.findAll('em').map(e => e.text())).toEqual(['schief', 'beides'])
    expect(page.get('p').text()).toBe('fett schief beides')
    expect(page.find('strong em, em strong').text()).toBe('beides')
  })

  it('renders a link as a new-tab anchor with its address', async () => {
    const page = await render(doc(paragraph(text('Regeln', [{ type: 'link', attrs: { href: 'https://example.com/regeln' } }]))))

    const link = page.get('a')
    expect(link.text()).toBe('Regeln')
    expect(link.attributes('href')).toBe('https://example.com/regeln')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  it('keeps a link whose text is a 120-character address in one piece', async () => {
    const url = `https://example.com/${'a'.repeat(100)}`
    const page = await render(doc(paragraph(text(url, [{ type: 'link', attrs: { href: url } }]))))

    expect(page.get('a').text()).toBe(url)
    expect(page.element.className).toContain('[overflow-wrap:anywhere]')
  })

  it('shows markup in a text node as characters, never as an element', async () => {
    const page = await render(doc(paragraph(text('<script>alert(1)</script>')), paragraph(text('<b>x</b>'))))

    expect(page.find('script').exists()).toBe(false)
    expect(page.find('b').exists()).toBe(false)
    expect(page.findAll('p').map(p => p.text())).toEqual(['<script>alert(1)</script>', '<b>x</b>'])
  })

  it('shows only the text of a link with a javascript: address, or with none', async () => {
    const page = await render(doc(paragraph(
      text('böse', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]),
      text(' leer', [{ type: 'link' }]),
    )))

    expect(page.find('a').exists()).toBe(false)
    expect(page.get('p').text()).toBe('böse leer')
  })

  it('shows the text of an unknown mark plain', async () => {
    const page = await render(doc(paragraph(text('x', [{ type: 'code' }]))))

    expect(page.get('p').text()).toBe('x')
    expect(page.find('code').exists()).toBe(false)
  })

  it('shows an unknown block as a p with the text of its descendants', async () => {
    const page = await render(doc({ type: 'blockquote', content: [paragraph(text('Zitat'))] }))

    expect(page.find('blockquote').exists()).toBe(false)
    expect(page.findAll('p').map(p => p.text())).toEqual(['Zitat'])
  })

  it('shows nothing for an unknown block without text', async () => {
    const page = await render(doc({ type: 'horizontalRule' }, paragraph(text('a'))))

    expect(page.findAll('p').map(p => p.text())).toEqual(['a'])
  })

  it('shows the text of an unknown inline node and of its descendants only', async () => {
    const page = await render(doc(paragraph(text('a '), { type: 'mention', content: [text('Max')] }, text(' b'), { type: 'hardBreak' })))

    expect(page.findAll('p')).toHaveLength(1)
    expect(page.get('p').text()).toBe('a Max b')
  })

  it('renders a converted note as one p per line, the blank line as an empty p', async () => {
    const page = await render(notesFromLines(['a', '', 'b'])!)

    expect(page.findAll('p').map(p => p.text())).toEqual(['a', '', 'b'])
  })

  it('keeps leading and double spaces of a line, the root preserving white space', async () => {
    const page = await render(notesFromLines(['  a  b'])!)

    expect(page.get('p').element.textContent).toBe('  a  b')
    expect(page.element.className).toContain('whitespace-pre-wrap')
  })

  it('keeps all of a 2000-character word', async () => {
    const word = 'W'.repeat(2000)
    const page = await render(doc(paragraph(text(word))))

    expect(page.get('p').element.textContent).toBe(word)
    expect(page.element.className).toContain('[overflow-wrap:anywhere]')
  })
})
