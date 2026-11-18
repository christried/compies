import { Extension, textblockTypeInputRule, type Editor, type Extensions } from '@tiptap/core'
import { Bold } from '@tiptap/extension-bold'
import { Document } from '@tiptap/extension-document'
import { Heading } from '@tiptap/extension-heading'
import { Italic } from '@tiptap/extension-italic'
import { Link } from '@tiptap/extension-link'
import { BulletList, ListItem, OrderedList } from '@tiptap/extension-list'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Text } from '@tiptap/extension-text'
import { Placeholder, UndoRedo } from '@tiptap/extensions'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { NOTES_LINK_REL, notesLinkHref } from '~~/shared/notes-doc'

// The one list of Tiptap extensions of the notes editor (#454, ADR 0019). Its schema is exactly the list of `shared/notes-doc.ts`: the nodes doc,
// paragraph, text, heading (level 3), bulletList, orderedList, listItem (paragraphs only) and the marks bold, italic and link (http or https). Where a
// Tiptap default is wider it is narrowed here. Imported by the editor component only, so Tiptap sits in the editor's lazy chunk (ADR 0015's neighbour:
// no page's first load grows).

/** The class of the inline decoration that keeps the link target visible while focus is in the link control (18-notizen § NoteLinkControl). */
export const LINK_TARGET_CLASS = 'cp-note-link-target'

const linkTargetKey = new PluginKey<{ from: number, to: number } | null>('notesLinkTarget')

/** Tints the range the link control works on, or clears the tint (`null`). A decoration through plugin state, never a mark: nothing leaks into the document. */
export function setLinkTarget(editor: Editor, range: { from: number, to: number } | null): void {
  editor.view.dispatch(editor.state.tr.setMeta(linkTargetKey, range))
}

/** A heading in a note is an h3 whatever level a paste brings (h1 to h6), and its input rule takes `# `, `## ` and `### `. Bold is off in it (Lilita has one weight). */
const NotesHeading = Heading.configure({ levels: [3] }).extend({
  marks: 'italic link',
  parseHTML() {
    return [1, 2, 3, 4, 5, 6].map(level => ({ tag: `h${level}`, attrs: { level: 3 } }))
  },
  addInputRules() {
    return [textblockTypeInputRule({ find: /^#{1,3}\s$/, type: this.type, getAttributes: { level: 3 } })]
  },
})

/**
 * Paragraphs only: the shared module accepts nothing else in an item. Tiptap's Tab (sink) and Shift-Tab (lift) are gone: sinking into a list the item cannot hold
 * throws a TransformError, and a Tab the editor swallowed would trap the keyboard. Both keys move the focus as in any form (the lists have one level, 18-notizen).
 */
const NotesListItem = ListItem.extend({
  content: 'paragraph+',
  addKeyboardShortcuts() {
    return { Enter: () => this.editor.commands.splitListItem(this.name) }
  },
})

/** What the editor adds to the schema's own behaviour: Strg/⌘ + K opens the link control, Strg/⌘ + click opens a link, the link control's target tint. */
function notesExtras(onOpenLink: () => void) {
  return Extension.create({
    name: 'notesExtras',
    addKeyboardShortcuts() {
      // `true` makes the editor call preventDefault, so the browser's own Strg + K does not run.
      return { 'Mod-k': () => {
        onOpenLink()
        return true
      } }
    },
    addProseMirrorPlugins() {
      return [
        new Plugin<{ from: number, to: number } | null>({
          key: linkTargetKey,
          state: {
            init: () => null,
            apply(transaction, range) {
              const set = transaction.getMeta(linkTargetKey) as { from: number, to: number } | null | undefined
              if (set !== undefined) return set
              if (range && transaction.docChanged) return { from: transaction.mapping.map(range.from), to: transaction.mapping.map(range.to) }
              return range
            },
          },
          props: {
            decorations(state) {
              const range = linkTargetKey.getState(state)
              return range && range.from < range.to ? DecorationSet.create(state.doc, [Decoration.inline(range.from, range.to, { class: LINK_TARGET_CLASS })]) : null
            },
            handleDOMEvents: {
              // A click on a link while editing only places the caret; with Strg or ⌘ it opens the link in a new tab.
              click(_view, event) {
                if (!(event.ctrlKey || event.metaKey) || !(event.target instanceof Element)) return false
                const href = notesLinkHref(event.target.closest('a[href]')?.getAttribute('href'))
                if (href === null) return false
                event.preventDefault()
                window.open(href, '_blank', 'noopener,noreferrer')
                return true
              },
            },
          },
        }),
      ]
    },
  })
}

export function createNotesExtensions({ placeholder, onOpenLink }: { placeholder: () => string, onOpenLink: () => void }): Extensions {
  return [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    NotesHeading,
    BulletList,
    OrderedList,
    NotesListItem,
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      protocols: ['http', 'https'],
      // The shared rule: a pasted `javascript:` or `data:` link keeps its text and loses the mark.
      isAllowedUri: uri => notesLinkHref(uri) !== null,
      HTMLAttributes: { target: '_blank', rel: NOTES_LINK_REL },
    }),
    Placeholder.configure({ placeholder: () => placeholder() }),
    UndoRedo,
    notesExtras(onOpenLink),
  ]
}
