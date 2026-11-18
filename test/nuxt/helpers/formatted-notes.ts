import type { NotesDoc } from '~~/shared/notes-doc'

// A formatted notes document for the places that show Game notes (#728): a paragraph, a heading, a bullet list of two, a paragraph with bold and a link.
// Each place's test reads the same elements back, so the wiring of every place is pinned with one fixture.

export const FORMATTED_HREF = 'https://example.com/regeln'

export const FORMATTED_NOTES: NotesDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Vorab' }] },
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Regeln' }] },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Erstens' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zweitens' }] }] },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Wichtig', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' und ' },
        { type: 'text', text: 'nachlesen', marks: [{ type: 'link', attrs: { href: FORMATTED_HREF } }] },
      ],
    },
  ],
}

/** Documents without a visible character, built by hand: `notesFromLines` returns null for these, a stored document never is one (parseNotes). */
export const BLANK_NOTES: NotesDoc[] = [
  { type: 'doc', content: [{ type: 'paragraph' }] },
  { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '   ' }] }] },
]

/** What a place shows of FORMATTED_NOTES, as a list of the elements a User sees. */
export function readFormatted(root: ParentNode) {
  const link = root.querySelector('a')
  // A link's text is what comes before its arrow: the hidden „(öffnet in neuem Tab)“ is no part of it (#729).
  const linkText = link ? [...link.childNodes].filter(node => node.nodeType === Node.TEXT_NODE || (node as Element).tagName === 'STRONG' || (node as Element).tagName === 'EM').map(node => node.textContent).join('').replace('⁠', '') : undefined
  // The notes' own heading: a place's „Notizen“ or name heading is not it.
  const heading = [...root.querySelectorAll('h2, h3, h4')].find(el => el.textContent === 'Regeln')
  return {
    heading: heading?.tagName.toLowerCase(),
    headingText: heading?.textContent,
    items: [...root.querySelectorAll('ul > li')].map(li => li.textContent),
    bold: root.querySelector('strong')?.textContent,
    link: link ? { text: linkText, href: link.getAttribute('href'), target: link.getAttribute('target'), rel: link.getAttribute('rel') } : null,
  }
}
