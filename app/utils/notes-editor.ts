import { asRecord } from '~~/shared/record'
import { notesLinkHref, type NotesDoc } from '~~/shared/notes-doc'

// The pure rules of the notes editor (#454, ADR 0019). No Tiptap in here, so a unit test runs them and the editor's lazy chunk stays the only place that
// imports the library.

function isEmptyParagraph(block: unknown): boolean {
  const node = asRecord(block)
  return node.type === 'paragraph' && (!Array.isArray(node.content) || node.content.length === 0)
}

/**
 * The editor's document as it is saved (18-notizen § Behaviour): the empty paragraphs at the end are dropped and a run of them in the middle is one.
 * A heading and a list are never touched. Returns a new document, the input stays as it is. It runs before `parseNotes`, which also keeps the JSON
 * under its cap.
 */
export function tidyNotes(doc: { type: string, content?: unknown[] }): { type: string, content: unknown[] } {
  const content: unknown[] = []
  for (const block of doc.content ?? []) {
    if (isEmptyParagraph(block) && isEmptyParagraph(content.at(-1))) continue
    content.push(block)
  }
  while (isEmptyParagraph(content.at(-1))) content.pop()
  return { ...doc, content }
}

/**
 * What the editor starts from: the stored document, or an empty paragraph for no notes. The API accepts bold text in a heading (the shared parser), the editor's schema
 * has no place for it (Lilita has one weight) and refuses every edit in such a heading, so the bold is taken off here. The stored document stays as it is until the
 * User changes something: the editor never emits on mount.
 */
export function editorContent(doc: NotesDoc | null): { type: string, content: unknown[] } {
  if (doc === null) return { type: 'doc', content: [{ type: 'paragraph' }] }
  return {
    ...doc,
    content: doc.content.map((block) => {
      if (block.type !== 'heading' || !block.content) return block
      return { ...block, content: block.content.map(({ marks, ...rest }) => {
        const kept = marks?.filter(mark => mark.type !== 'bold') ?? []
        return kept.length > 0 ? { ...rest, marks: kept } : rest
      }) }
    }),
  }
}

export type LinkAddress = { ok: true, href: string } | { ok: false, empty?: true }

/**
 * What the link control makes of the typed address (`validate` of `reference/notizen.js`): trimmed; a scheme other than http or https fails; a bare
 * domain gets `https://`; the result goes through `notesLinkHref`, the rule the server applies, so the control and the server cannot disagree. A
 * host without a dot (`localhost`, a plain word) is no address for a note.
 */
export function checkLinkAddress(raw: string): LinkAddress {
  let value = raw.trim()
  if (value === '') return { ok: false, empty: true }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)
  if (scheme) {
    const name = scheme[1]!.toLowerCase()
    if (name !== 'http' && name !== 'https') return { ok: false }
  }
  else if (/^(\/\/)?[^\s/]+\.[a-z]{2,}([/?#].*)?$/i.test(value)) {
    value = `https://${value.replace(/^\/\//, '')}`
  }
  else {
    return { ok: false }
  }
  const href = notesLinkHref(value)
  if (href === null || !new URL(href).hostname.includes('.')) return { ok: false }
  return { ok: true, href }
}

/** A toolbar button's shortcut as the tooltip writes it: „Strg+B“, „⌘B“ on an Apple platform. */
export function noteShortcutLabel(key: string, apple: boolean): string {
  return apple ? `⌘${key}` : `Strg+${key}`
}
