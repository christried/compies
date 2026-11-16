<script lang="ts">
import { defineComponent, h, type PropType, type VNodeChild } from 'vue'
import { asRecord } from '~~/shared/record'
import { notesLinkHref, type NotesDoc } from '~~/shared/notes-doc'

// The renderer of a notes document (#728, ADR 0019): every place that shows notes calls it. It walks the document into the app's own elements and
// never builds HTML (ADR 0019): no raw-HTML directive or property, also not as a prop of h(), and no sanitiser. A text node's string is a child, so Vue escapes it.
// The server hands over a document parseNotes rebuilt (#727), and this walker still checks what it renders: a link whose address is not http or
// https shows its text only, a mark or node outside the list shows its text only. The caller sets the text size and colour through its class
// (fallthrough), so each place keeps its own.
//
// The look is provisional, in today's text styles (#720 restyles it).

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

/** A text node with its marks: bold and italic inside, a valid link outside. A mark outside the list changes nothing. */
function renderText(node: unknown, title: string): VNodeChild {
  const record = asRecord(node)
  const marks = Array.isArray(record.marks) ? record.marks.map(asRecord) : []
  let out: VNodeChild = textOf(record)
  if (marks.some(mark => mark.type === 'italic')) out = h('em', out)
  if (marks.some(mark => mark.type === 'bold')) out = h('strong', out)
  const link = marks.find(mark => mark.type === 'link')
  const href = link ? notesLinkHref(asRecord(link.attrs).href) : null
  if (href !== null) {
    out = h('a', {
      href,
      target: '_blank',
      rel: 'noopener noreferrer',
      title,
      class: 'font-bold text-ink underline decoration-2 underline-offset-[3px] hover:text-focus focus-visible:focus-ring',
    }, [out])
  }
  return out
}

/** The inline nodes of a textblock: a text node with its marks, any other node as the text below it. */
function renderInline(node: unknown, title: string): VNodeChild {
  return asRecord(node).type === 'text' ? renderText(node, title) : textOf(node)
}

function renderBlock(node: unknown, headingLevel: 'h3' | 'h4', title: string): VNodeChild {
  const type = asRecord(node).type
  if (type === 'paragraph') {
    const inline = children(node).map(child => renderInline(child, title))
    // An empty paragraph (a converted blank line, migration 0037) stays one line high.
    return h('p', { class: 'm-0' }, inline.length > 0 ? inline : [h('br')])
  }
  if (type === 'heading') {
    if (children(node).length === 0) return null
    return h(headingLevel, { class: 'm-0 mt-2 mb-0.5 font-extrabold first:mt-0' }, children(node).map(child => renderInline(child, title)))
  }
  if (type === 'bulletList' || type === 'orderedList') {
    const items = children(node).map(item => h('li', children(item).map(block => renderBlock(block, headingLevel, title))))
    if (items.length === 0) return null
    // Tailwind's preflight strips list styles, so the marker and the indent are set here.
    return h(type === 'bulletList' ? 'ul' : 'ol', { class: `m-0 my-1 list-outside pl-5 ${type === 'bulletList' ? 'list-disc' : 'list-decimal'}` }, items)
  }
  const text = textOf(node)
  return text === '' ? null : h('p', { class: 'm-0' }, text)
}

export default defineComponent({
  name: 'RichNotes',
  props: {
    doc: { type: Object as PropType<NotesDoc>, required: true },
    /** Where the place sits in the heading outline: the page's notes section is an h2 (h3 here), the dialog's an h3 (h4). */
    headingLevel: { type: String as PropType<'h3' | 'h4'>, default: 'h3' },
  },
  setup(props) {
    const { t } = useI18n()
    return () => h('div', { class: 'whitespace-pre-wrap [overflow-wrap:anywhere]' }, children(props.doc).map(block => renderBlock(block, props.headingLevel, t('news.newTab'))))
  },
})
</script>
