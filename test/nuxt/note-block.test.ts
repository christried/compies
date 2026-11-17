import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import EventNotes from '~/components/EventNotes.vue'
import NoteBlock from '~/components/NoteBlock.vue'
import { notesFromLines } from '~~/shared/notes-doc'
import { BLANK_NOTES, FORMATTED_NOTES } from './helpers/formatted-notes'

// The read-only block around a notes document (#729, hand-off 18-notizen.md § NoteBlock): disc, title, optional sub, finished chip, panel. The
// Event block is EventNotes, the game block is NoteBlock itself (GameNotes, the popover, the Round card).

const doc = notesFromLines(['Heute nur Bo1'])!

describe('NoteBlock (#729)', () => {
  it('shows the game block with its disc, the title „Notizen“ as an h3 and the notes in a paper-2 panel without a border', async () => {
    const block = await mountSuspended(NoteBlock, { props: { kind: 'game', doc, size: 'md' } })

    expect(block.get('h3').text()).toBe('Notizen')
    expect(block.get('h3').classes()).toEqual(expect.arrayContaining(['text-[13px]', 'font-extrabold']))
    expect(block.find('svg.lucide-sticky-note, svg[class*="sticky-note"]').exists()).toBe(true)
    const panel = block.get('.cp-note').element.parentElement!
    expect(panel.classList).toContain('bg-paper-2')
    expect(panel.classList).toContain('rounded-[12px]')
    expect(panel.className).not.toContain('border-2')
    expect(panel.className).toContain('px-3.5')
    expect(block.get('.cp-note').classes()).toContain('cp-note--md')
  })

  it('titles the block with the level the place asks for and the notes one level below', async () => {
    const block = await mountSuspended(NoteBlock, { props: { kind: 'game', doc: FORMATTED_NOTES, size: 'md', level: 'h2' } })

    expect(block.get('h2').text()).toBe('Notizen')
    expect(block.find('h3').text()).toBe('Regeln')
  })

  it('shows the Event block as a framed surface panel, the title „Notizen für dieses Event“, the notes at the size asked for', async () => {
    const block = await mountSuspended(EventNotes, { props: { notes: doc, size: 'sm' } })

    expect(block.get('h3').text()).toBe('Notizen für dieses Event')
    expect(block.find('svg[class*="calendar"]').exists()).toBe(true)
    const panel = block.get('.cp-note').element.parentElement!
    expect(panel.classList).toContain('bg-surface')
    expect(panel.className).toContain('border-2')
    expect(panel.className).toContain('border-line')
    expect(panel.className).not.toContain('border-dashed')
    expect(panel.className).toContain('px-3')
    expect(block.get('.cp-note').classes()).toContain('cp-note--sm')
  })

  it('pads the panel 12 14 at md and wider, 10 12 at sm', async () => {
    const sm = await mountSuspended(NoteBlock, { props: { kind: 'event', doc, size: 'sm' } })
    const md = await mountSuspended(NoteBlock, { props: { kind: 'event', doc, size: 'md' } })

    expect(sm.get('.cp-note').element.parentElement!.className).toContain('px-3 py-2.5')
    expect(md.get('.cp-note').element.parentElement!.className).toContain('px-3.5 py-3')
  })

  it('shows the sub only when it is given, under the title', async () => {
    const without = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md' } })
    const withSub = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md', sub: 'Spieleabend bei Sanne' } })

    expect(without.text()).not.toContain('Spieleabend')
    expect(withSub.text()).toContain('Spieleabend bei Sanne')
    expect(withSub.find('.text-ink-2').text()).toBe('Spieleabend bei Sanne')
  })

  it('shows a finished Event block with a dashed frame, the lock chip „Event beendet“ and a paper-2 disc', async () => {
    const block = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md', finished: true } })

    const panel = block.get('.cp-note').element.parentElement!
    expect(panel.className).toContain('border-dashed')
    expect(block.text()).toContain('Event beendet')
    expect(block.find('span.bg-paper-2 svg[class*="calendar"]').exists()).toBe(true)
    expect(block.find('svg[class*="lock"]').exists()).toBe(true)
  })

  it('shows no chip for an Event that is not finished, and none on a game block', async () => {
    const open = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md' } })
    const game = await mountSuspended(NoteBlock, { props: { kind: 'game', doc, size: 'md', finished: true } })

    expect(open.text()).not.toContain('Event beendet')
    expect(game.text()).not.toContain('Event beendet')
  })

  it('has no panel of its own when bare (the Round card holds it in its own)', async () => {
    const block = await mountSuspended(NoteBlock, { props: { kind: 'game', doc, size: 'sm', bare: true } })

    const panel = block.get('.cp-note').element.parentElement!
    expect(panel.className).not.toContain('bg-paper-2')
    expect(panel.className).not.toContain('px-3')
  })

  it('names its section by its title', async () => {
    const block = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md' } })

    const section = block.get('section')
    expect(section.attributes('aria-labelledby')).toBe(block.get('h3').attributes('id'))
  })

  it.each(BLANK_NOTES)('shows nothing for a document without a visible character', async (blank) => {
    const block = await mountSuspended(EventNotes, { props: { notes: blank, size: 'md' } })

    expect(block.find('section').exists()).toBe(false)
  })
})

describe('the Host\'s edit button (#464)', () => {
  const EDIT = 'Notizen für dieses Event bearbeiten'

  it('ends the header of an Event block with a pencil named by editLabel, and a click says so', async () => {
    const block = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md', editable: true } })

    const button = block.get(`button[aria-label="${EDIT}"]`)
    expect(button.classes()).toEqual(expect.arrayContaining(['hit-44', 'size-9', 'border-2', 'border-line', 'bg-surface']))
    expect(button.find('svg[class*="pencil"]').exists()).toBe(true)
    // The title block keeps the room: the pencil sits at the end of the header.
    expect(block.get('h3').element.parentElement!.classList).toContain('flex-1')
    expect(button.element.parentElement!.lastElementChild).toBe(button.element)

    await button.trigger('click')

    expect(block.findComponent(NoteBlock).emitted('edit')).toHaveLength(1)
    expect(block.emitted('edit')).toHaveLength(1)
  })

  it('has none unless the block is editable, on a finished Event\'s block, or without a label', async () => {
    const plain = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md' } })
    const finished = await mountSuspended(EventNotes, { props: { notes: doc, size: 'md', editable: true, finished: true } })
    const unlabelled = await mountSuspended(NoteBlock, { props: { kind: 'event', doc, size: 'md', editable: true } })
    const game = await mountSuspended(NoteBlock, { props: { kind: 'game', doc, size: 'md', editable: true } })

    expect(plain.find('button').exists()).toBe(false)
    expect(finished.find('button').exists()).toBe(false)
    expect(finished.text()).toContain('Event beendet')
    expect(unlabelled.find('button').exists()).toBe(false)
    expect(game.find('button').exists()).toBe(false)
  })
})
