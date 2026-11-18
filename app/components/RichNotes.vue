<script lang="ts">
import { ArrowUpRight } from '@lucide/vue'
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import { asRecord } from '~~/shared/record'
import { notesLinkHref, type NotesDoc } from '~~/shared/notes-doc'

// The renderer of a notes document (#728, ADR 0019): every place that shows notes calls it. It walks the document into the app's own elements and
// never builds HTML (ADR 0019): no raw-HTML directive or property, also not as a prop of h(), and no sanitiser. A text node's string is a child, so Vue escapes it.
// The server hands over a document parseNotes rebuilt (#727), and this walker still checks what it renders: a link whose address is not http or
// https shows its text only, a mark or node outside the list shows its text only.
//
// The look is the stylesheet's (#729, app/assets/css/notes.css): the root wears `cp-note` and the size's modifier, and every rule below it is
// the stylesheet's, not a class on an element. The caller sets only what is its own (a margin, a colour).

/** The text of a node and of everything below it: what a node outside the list is shown as. */
function textOf(node: unknown): string {
  const record = asRecord(node)
  if (typeof record.text === 'string') return record.text
  return Array.isArray(record.content) ? record.content.map(textOf).join('') : ''
}

function children(node: unknown): unknown[] {
  const content = asRecord(node).content
  return Array.isArray(content) ? content : []
}

/** The address of a text node's link mark when it has a valid one (http or https); null for none, or for a link outside the rule. */
function linkOf(node: unknown): string | null {
  const record = asRecord(node)
  if (record.type !== 'text' || !Array.isArray(record.marks)) return null
  const link = record.marks.map(asRecord).find(mark => mark.type === 'link')
  return link ? notesLinkHref(asRecord(link.attrs).href) : null
}

/** A text node with bold and italic around it. A mark outside the list changes nothing. */
function renderText(node: unknown, text: string): VNodeChild {
  const record = asRecord(node)
  const marks = Array.isArray(record.marks) ? record.marks.map(asRecord) : []
  let out: VNodeChild = text
  if (marks.some(mark => mark.type === 'italic')) out = h('em', out)
  if (marks.some(mark => mark.type === 'bold')) out = h('strong', out)
  return out
}

/** A link whose text is its own address shows it without the scheme and `www.`; the href stays whole (hand-off 18-notizen.md § NoteContent). */
const shortAddress = (address: string) => address.replace(/^https?:\/\//i, '').replace(/^www\./i, '')

/**
 * A link as one anchor around its text nodes (they differ only in bold or italic), then a word joiner and the arrow, so the arrow never wraps
 * alone, and the new-tab text for assistive technology. The title is the full address.
 */
function renderLink(nodes: unknown[], href: string, newTab: string): VNodeChild {
  const only = nodes.length === 1 ? nodes[0] : null
  const shown = only !== null && textOf(only) === href ? shortAddress(href) : null
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', title: href }, [
    ...nodes.map(node => renderText(node, shown ?? textOf(node))),
    '⁠',
    h(ArrowUpRight, { 'class': 'cp-note-arrow', 'aria-hidden': 'true' }),
    h('span', { class: 'cp-note-new-tab sr-only' }, ` ${newTab}`),
  ])
}

/** The inline nodes of a textblock: a text node with its marks, consecutive text nodes of one link in one anchor, any other node as the text below it. */
function renderInline(nodes: unknown[], newTab: string): VNodeChild[] {
  const out: VNodeChild[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const href = linkOf(node)
    if (href === null) {
      out.push(asRecord(node).type === 'text' ? renderText(node, textOf(node)) : textOf(node))
      continue
    }
    const run = [node]
    while (i + 1 < nodes.length && linkOf(nodes[i + 1]) === href) run.push(nodes[++i])
    out.push(renderLink(run, href, newTab))
  }
  return out
}

function renderBlock(node: unknown, headingLevel: 'h3' | 'h4', newTab: string): VNodeChild {
  const type = asRecord(node).type
  if (type === 'paragraph') {
    const inline = renderInline(children(node), newTab)
    // An empty paragraph (a converted blank line, migration 0038) stays one line high.
    return h('p', inline.length > 0 ? inline : [h('br')])
  }
  if (type === 'heading') {
    if (children(node).length === 0) return null
    return h(headingLevel, renderInline(children(node), newTab))
  }
  if (type === 'bulletList' || type === 'orderedList') {
    const items = children(node).map(item => h('li', children(item).map(block => renderBlock(block, headingLevel, newTab))))
    if (items.length === 0) return null
    return h(type === 'bulletList' ? 'ul' : 'ol', items)
  }
  const text = textOf(node)
  return text === '' ? null : h('p', text)
}

export default defineComponent({
  name: 'RichNotes',
  props: {
    doc: { type: Object as PropType<NotesDoc>, required: true },
    /** The place's size: sm (popover, Round card), md (sheet, dialog, library below 980), lg (library from 980). */
    size: { type: String as PropType<'sm' | 'md' | 'lg'>, default: 'md' },
    /** Where the place sits in the heading outline: the block's title is an h3 (h4 here), the library section's an h2 (h3 here). */
    headingLevel: { type: String as PropType<'h3' | 'h4'>, default: 'h3' },
  },
  setup(props) {
    const { t } = useI18n()
    // whitespace-pre-wrap keeps the leading and double spaces of a converted line (#728); the arrow of the long link wraps with its address.
    return () => h('div', { class: ['cp-note', `cp-note--${props.size}`, 'whitespace-pre-wrap [overflow-wrap:anywhere]'] }, children(props.doc).map(block => renderBlock(block, props.headingLevel, t('notes.link.new_tab'))))
  },
})
</script>
