// The document of rich notes (#727, ADR 0019): the editor's own document format, stored as JSON, never as HTML. The server walks what arrives and rebuilds it
// from this short list, so what is stored holds nothing else: the editor (#454), the renderer (#728) and the limit all rest on that. Format-generic: Game
// notes use it now, Event notes (#731) with the same rules and their own limit. Pure, so the form and the server agree.

import { asRecord, isRecord } from './record'
import { characterCount } from './text'

/** The one heading level the notes know: the library page has its h1 and the notes section an h2, so a heading in a note is an h3. */
const NOTES_HEADING_LEVEL = 3

/** The longest a rebuilt document may be as JSON: block boundaries count no visible character, so the limit alone lets empty paragraphs pile up in a jsonb column. The worst honest case, `max` single-character bold nodes, is about half of it. */
const NOTES_JSON_MAX = 200_000

export type NotesMark = { type: 'bold' } | { type: 'italic' } | { type: 'link', attrs: { href: string } }
export interface NotesText { type: 'text', text: string, marks?: NotesMark[] }
/** An empty paragraph has no `content` key, as the editor writes it. */
export interface NotesParagraph { type: 'paragraph', content?: NotesText[] }
export interface NotesHeading { type: 'heading', attrs: { level: typeof NOTES_HEADING_LEVEL }, content?: NotesText[] }
/** One or more paragraphs, no nested list. */
export interface NotesListItem { type: 'listItem', content: NotesParagraph[] }
/** One or more items. */
export interface NotesList { type: 'bulletList' | 'orderedList', content: NotesListItem[] }
export type NotesBlock = NotesParagraph | NotesHeading | NotesList
export interface NotesDoc { type: 'doc', content: NotesBlock[] }

/** A link's address when it is an http or https one (the URL parser lowercases the scheme), as the parser writes it; null otherwise. */
export function notesLinkHref(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  }
  catch {
    return null
  }
}

function parseMarks(raw: unknown): NotesMark[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return null
  const marks: NotesMark[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const mark = asRecord(entry)
    if (mark.type === 'bold' || mark.type === 'italic') {
      if (seen.has(mark.type)) continue
      seen.add(mark.type)
      marks.push({ type: mark.type })
    }
    else if (mark.type === 'link') {
      const href = notesLinkHref(asRecord(mark.attrs).href)
      if (href === null) return null
      if (seen.has('link')) continue
      seen.add('link')
      marks.push({ type: 'link', attrs: { href } })
    }
    else {
      return null
    }
  }
  return marks
}

/** The text nodes of a paragraph or heading; none when it has no content. Null when anything in it is not a text node of the list. */
function parseTexts(raw: unknown): NotesText[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) return null
  const texts: NotesText[] = []
  for (const entry of raw) {
    const node = asRecord(entry)
    if (node.type !== 'text' || typeof node.text !== 'string' || node.text === '' || node.content !== undefined) return null
    const marks = parseMarks(node.marks)
    if (marks === null) return null
    texts.push(marks.length > 0 ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text })
  }
  return texts
}

function parseParagraph(raw: unknown): NotesParagraph | null {
  const node = asRecord(raw)
  if (node.type !== 'paragraph') return null
  const texts = parseTexts(node.content)
  if (texts === null) return null
  return texts.length > 0 ? { type: 'paragraph', content: texts } : { type: 'paragraph' }
}

function parseListItem(raw: unknown): NotesListItem | null {
  const node = asRecord(raw)
  if (node.type !== 'listItem' || !Array.isArray(node.content) || node.content.length === 0) return null
  const content: NotesParagraph[] = []
  for (const entry of node.content) {
    const paragraph = parseParagraph(entry)
    if (paragraph === null) return null
    content.push(paragraph)
  }
  return { type: 'listItem', content }
}

function parseBlock(raw: unknown): NotesBlock | null {
  const node = asRecord(raw)
  if (node.type === 'paragraph') return parseParagraph(node)
  if (node.type === 'heading') {
    if (asRecord(node.attrs).level !== NOTES_HEADING_LEVEL) return null
    const texts = parseTexts(node.content)
    if (texts === null) return null
    const attrs = { level: NOTES_HEADING_LEVEL } as const
    return texts.length > 0 ? { type: 'heading', attrs, content: texts } : { type: 'heading', attrs }
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    if (!Array.isArray(node.content) || node.content.length === 0) return null
    const items: NotesListItem[] = []
    for (const entry of node.content) {
      const item = parseListItem(entry)
      if (item === null) return null
      items.push(item)
    }
    return { type: node.type, content: items }
  }
  return null
}

function textOf(block: NotesParagraph | NotesHeading): string {
  return (block.content ?? []).map(node => node.text).join('')
}

function isList(block: NotesBlock): block is NotesList {
  return block.type === 'bulletList' || block.type === 'orderedList'
}

/** The textblocks of a block, in order: the block itself, or the paragraphs of a list's items. */
function textblocks(block: NotesBlock): (NotesParagraph | NotesHeading)[] {
  return isList(block) ? block.content.flatMap(item => item.content) : [block]
}

/** How many characters the document shows: per paragraph or heading its text nodes joined first (an emoji with a skin tone split over two marks is one character), then summed. Block, list and item boundaries, marks and a link's address count nothing; spaces count. */
export function notesLength(doc: NotesDoc): number {
  return doc.content.flatMap(textblocks).reduce((sum, block) => sum + characterCount(textOf(block)), 0)
}

/**
 * Notes as they arrive: absent, null or '' (what a 0.15 tab sends for an emptied textarea) is none, `null`; a document is walked and rebuilt, so only
 * the allowed nodes, marks and attrs are left (unknown keys are dropped, an unknown node or mark, a heading of another level and a link that is not
 * http or https refuse the whole document). A document without a visible character is none too. `undefined` for anything refused: not a document,
 * too big as JSON, or longer than `max` characters (notesLength).
 */
export function parseNotes(raw: unknown, max: number): NotesDoc | null | undefined {
  if (raw === undefined || raw === null || raw === '') return null
  if (!isRecord(raw) || raw.type !== 'doc') return undefined
  if (raw.content !== undefined && !Array.isArray(raw.content)) return undefined
  const content: NotesBlock[] = []
  for (const entry of raw.content ?? []) {
    const block = parseBlock(entry)
    if (block === null) return undefined
    content.push(block)
  }
  const doc: NotesDoc = { type: 'doc', content }
  if (JSON.stringify(doc).length > NOTES_JSON_MAX) return undefined
  if (!notesHasText(doc)) return null
  return notesLength(doc) > max ? undefined : doc
}

/** Whether the document shows a visible character (any textblock whose text has a non-space one); null has none. The one rule for „are there notes“: the parser, the renderer's callers (no button, no section for blank notes) (#728). */
export function notesHasText(doc: NotesDoc | null): boolean {
  return doc !== null && doc.content.flatMap(textblocks).some(block => /\S/.test(textOf(block)))
}

/** The notes as plain lines: a block per line, an empty paragraph an empty line, a list item `- ` or `1. ` before its text (the numbering restarts per list), the later paragraphs of an item without a prefix. Marks and links show their text only. */
export function notesPlainText(doc: NotesDoc | null): string {
  if (doc === null) return ''
  return doc.content.map((block) => {
    if (!isList(block)) return textOf(block)
    return block.content
      .map((item, index) => item.content.map((paragraph, at) => `${at === 0 ? (block.type === 'bulletList' ? '- ' : `${index + 1}. `) : ''}${textOf(paragraph)}`).join('\n'))
      .join('\n')
  }).join('\n')
}

/** One paragraph per line, an empty line an empty paragraph, a line one unmarked text node as it is (no trimming, no splitting: the caller splits). Null when no line has a visible character. */
export function notesFromLines(lines: string[]): NotesDoc | null {
  if (!lines.some(line => /\S/.test(line))) return null
  return {
    type: 'doc',
    content: lines.map((line): NotesParagraph => line === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text: line }] }),
  }
}
