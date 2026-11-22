import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameNotesDisclosure from '~/components/GameNotesDisclosure.vue'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { eventNotesContext } from './helpers/event-notes-context'
import { BLANK_NOTES, FORMATTED_HREF, FORMATTED_NOTES, readFormatted } from './helpers/formatted-notes'
import { motion } from './motion'

// The Game notes under a game in „So wird gespielt“ (#224): a disclosure that starts collapsed, announces whether it is
// open, and shows the notes formatted, a line per paragraph (#728).

const NOTES = 'Settings: 3 Runden\nWarmup: Lobby'
const lines = (root: { findAll: (selector: string) => { element: Element }[] }) => root.findAll('p').map(p => p.element.textContent)

describe('GameNotesDisclosure (#224)', () => {
  it('shows a Notizen button that starts collapsed, with no panel', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })

    const button = disclosure.get('button')
    expect(button.text()).toBe('Notizen')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-expanded')).toBe('false')
    // No panel, so nothing to control: aria-controls would point at an id that is not in the page.
    expect(button.attributes('aria-controls')).toBeUndefined()
    expect(disclosure.find('p').exists()).toBe(false)
    expect(disclosure.text()).not.toContain('Warmup')
  })

  it('is plain underlined text like Bearbeiten, with no outline-memphis box around it', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })

    expect(disclosure.get('button').classes()).not.toContain('outline-memphis')
    expect(disclosure.get('button').classes()).toContain('underline')
  })

  it('opens on a click, shows the notes with their line breaks, and names its panel', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })
    const button = disclosure.get('button')

    await button.trigger('click')

    expect(button.attributes('aria-expanded')).toBe('true')
    const panelId = button.attributes('aria-controls')
    expect(panelId).toBeTruthy()
    const panel = disclosure.get(`[id="${panelId}"]`)
    expect(lines(panel)).toEqual(NOTES.split('\n'))
  })

  it.each(BLANK_NOTES)('renders no button for a document without a visible character (#728)', async (blank) => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: blank } })

    expect(disclosure.find('button').exists()).toBe(false)
  })

  it('closes again on the second click, and the panel goes', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')) } })
    const button = disclosure.get('button')

    await button.trigger('click')
    await button.trigger('click')

    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.attributes('aria-controls')).toBeUndefined()
    expect(disclosure.find('p').exists()).toBe(false)
  })

  it('starts open on the Round card, with its panel and the notes (#228)', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(NOTES.split('\n')), startOpen: true } })

    const button = disclosure.get('button')
    expect(button.attributes('aria-expanded')).toBe('true')
    expect(lines(disclosure.get(`[id="${button.attributes('aria-controls')}"]`))).toEqual(NOTES.split('\n'))

    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('shows its slot instead of the notes, with its own label: the Vote notes of a Slot (#349) take no document', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { label: '2 Notizen' }, slots: { default: '<ul><li>Eine Stimme</li></ul>' } })

    expect(disclosure.get('button').text()).toContain('2 Notizen')
    await disclosure.get('button').trigger('click')

    expect(disclosure.get('li').text()).toBe('Eine Stimme')
    expect(disclosure.find('p').exists()).toBe(false)
  })

  describe('with Event notes (#732)', () => {
    const EVENT_LABEL = 'Notizen für dieses Event'
    const opened = async (props: { notes: NotesDoc | null, eventNotes: NotesDoc | null }) => {
      const disclosure = await mountSuspended(GameNotesDisclosure, { props: { ...props, startOpen: true } })
      return disclosure.get(`[id="${disclosure.get('button').attributes('aria-controls')}"]`)
    }

    it('shows the label and the Event notes above the Game notes, in the opened panel', async () => {
      const panel = await opened({ notes: notesFromLines(['Game-Zeile']), eventNotes: notesFromLines(['Heute nur Bo1']) })

      const label = panel.findAll('h3').find(h => h.text() === EVENT_LABEL)!.element
      const eventText = panel.findAll('p').find(p => p.text() === 'Heute nur Bo1')!.element
      const gameText = panel.findAll('p').find(p => p.text() === 'Game-Zeile')!.element
      expect(label.compareDocumentPosition(eventText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(eventText.compareDocumentPosition(gameText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(panel.text().split(EVENT_LABEL)).toHaveLength(2)
    })

    it('shows its button for a game with only Event notes, and no Game notes block', async () => {
      const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: null, eventNotes: notesFromLines(['Heute nur Bo1']), startOpen: true } })

      expect(disclosure.get('button').text()).toBe('Notizen')
      expect(lines(disclosure)).toEqual(['Heute nur Bo1'])
    })

    it('shows the Event notes only when the Game notes are blank', async () => {
      const panel = await opened({ notes: BLANK_NOTES[0]!, eventNotes: notesFromLines(['Heute nur Bo1']) })

      expect(lines(panel)).toEqual(['Heute nur Bo1'])
    })

    it('renders no button for blank Event notes beside no Game notes: that is not the slot use', async () => {
      const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: null, eventNotes: BLANK_NOTES[0]! } })

      expect(disclosure.find('button').exists()).toBe(false)
    })

    it('reads the formatted Event notes back', async () => {
      const panel = await opened({ notes: null, eventNotes: FORMATTED_NOTES })

      expect(readFormatted(panel.element)).toEqual({
        heading: 'h4',
        headingText: 'Regeln',
        items: ['Erstens', 'Zweitens'],
        bold: 'Wichtig',
        link: { text: 'nachlesen', href: FORMATTED_HREF, target: '_blank', rel: 'noopener noreferrer' },
      })
    })
  })

  describe('the Round card variant (#729)', () => {
    // The Event's name and whether it is finished are the Event page's context's (#821), not props.
    const round = ({ eventName, eventFinished, ...props }: Record<string, unknown> = {}) => mountSuspended(GameNotesDisclosure, {
      props: { notes: notesFromLines(['Game-Zeile']), eventNotes: notesFromLines(['Heute nur Bo1']), variant: 'round', startOpen: true, ...props },
      global: eventNotesContext({ ...(eventName === undefined ? {} : { eventName: eventName as string }), finished: eventFinished === true }).global,
    })

    it('is a 44 px button with a sticky note, „Notizen“, the lock with „Nur du siehst das“ and a chevron at the right', async () => {
      const disclosure = await round()

      const button = disclosure.get('button')
      expect(button.classes()).toContain('h-11')
      expect(button.find('svg[class*="sticky-note"]').exists()).toBe(true)
      expect(button.text()).toContain('Notizen')
      expect(button.text()).toContain('Nur du siehst das')
      expect(button.find('svg[class*="lock"]').exists()).toBe(true)
      expect(button.get('svg[class*="chevron-down"]').element.parentElement!.className).toContain('ml-auto')
      expect(button.attributes('aria-expanded')).toBe('true')
      expect(button.attributes('aria-controls')).toBeTruthy()
    })

    it('turns the chevron a half circle when open, and back when closed', async () => {
      const disclosure = await round()
      const chevron = () => disclosure.get('svg[class*="chevron-down"]').element.parentElement!

      expect(chevron().classList).toContain('rotate-180')
      await disclosure.get('button').trigger('click')
      expect(chevron().classList).not.toContain('rotate-180')
      expect(disclosure.get('button').attributes('aria-expanded')).toBe('false')
    })

    it('holds the panel on paper-2: the Event block at sm framed, a 2 px line-soft rule, the game block without a panel of its own', async () => {
      const disclosure = await round()

      const panel = disclosure.get(`[id="${disclosure.get('button').attributes('aria-controls')}"]`)
      const blocks = panel.findAll('.cp-note')
      expect(blocks.map(block => block.text())).toEqual(['Heute nur Bo1', 'Game-Zeile'])
      expect(blocks.every(block => block.classes().includes('cp-note--sm'))).toBe(true)
      expect(blocks[0]!.element.parentElement!.className).toContain('border-2')
      expect(blocks[1]!.element.parentElement!.className).not.toContain('bg-paper-2')
      expect(panel.find('hr, [data-notes-rule]').exists()).toBe(true)
      expect(panel.get('[data-notes-rule]').classes()).toEqual(expect.arrayContaining(['h-0.5', 'bg-line-soft']))
      expect(panel.classes()).toContain('bg-paper-2')
      expect(panel.classes()).toContain('rounded-[12px]')
      expect(panel.text()).toContain('aus deiner Bibliothek')
    })

    it('shows no rule and no sub when only one block is there', async () => {
      const gameOnly = await round({ eventNotes: null })
      const eventOnly = await round({ notes: null, eventName: 'Spieleabend bei Sanne' })

      expect(gameOnly.find('[data-notes-rule]').exists()).toBe(false)
      expect(gameOnly.text()).not.toContain('aus deiner Bibliothek')
      expect(eventOnly.find('[data-notes-rule]').exists()).toBe(false)
      expect(eventOnly.text()).not.toContain('Spieleabend bei Sanne')
    })

    it('gives the Event its name as the sub and the finished look when both blocks show', async () => {
      const disclosure = await round({ eventName: 'Spieleabend bei Sanne', eventFinished: true })

      expect(disclosure.text()).toContain('Spieleabend bei Sanne')
      expect(disclosure.text()).toContain('Event beendet')
    })

    it('keeps the default look for every other place: no lock line, no sticky note, no chevron of 20 px', async () => {
      const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(['Zeile']) } })

      expect(disclosure.get('button').text()).toBe('Notizen')
      expect(disclosure.find('svg[class*="sticky-note"]').exists()).toBe(false)
      expect(disclosure.find('svg[class*="lock"]').exists()).toBe(false)
    })
  })

  describe('the height run of the Round variant (#729)', () => {
    interface Call { el: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions, finish: () => void }
    let calls: Call[]
    const realAnimate = Element.prototype.animate
    beforeEach(() => {
      calls = []
      Element.prototype.animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
        let finish: () => void = () => {}
        const finished = new Promise<void>((resolve) => {
          finish = resolve
        })
        calls.push({ el: this, keyframes, options, finish })
        return { finished, cancel() {} }
      } as unknown as typeof Element.prototype.animate
    })
    afterEach(() => {
      Element.prototype.animate = realAnimate
      vi.restoreAllMocks()
    })
    const mountClosed = () => mountSuspended(GameNotesDisclosure, {
      props: { notes: notesFromLines(['Game-Zeile']), variant: 'round' },
      global: { stubs: { Transition: false } },
      attachTo: document.body,
    })

    it('opens from height 0 in 220 ms on ease-out, and closes in 140 ms on ease-in', async () => {
      motion('full')
      const disclosure = await mountClosed()

      await disclosure.get('button').trigger('click')
      await flushPromises()
      const open = calls.find(call => call.keyframes.some(frame => 'height' in frame))!
      expect(open.keyframes[0]!.height).toBe('0px')
      expect(open.options.duration).toBe(220)
      expect(open.options.easing).toBe('cubic-bezier(.16,1,.3,1)')
      open.finish()
      await flushPromises()

      calls.length = 0
      await disclosure.get('button').trigger('click')
      await flushPromises()
      const close = calls.find(call => call.keyframes.some(frame => 'height' in frame))!
      expect(close.keyframes.at(-1)!.height).toBe('0px')
      expect(close.options.duration).toBe(140)
      expect(close.options.easing).toBe('cubic-bezier(.7,0,.84,0)')
    })

    it('cuts under reduced motion: no height run', async () => {
      motion('reduced')
      const disclosure = await mountClosed()

      await disclosure.get('button').trigger('click')
      await flushPromises()

      expect(calls.filter(call => call.keyframes.some(frame => 'height' in frame))).toHaveLength(0)
      expect(disclosure.find('[id]').exists()).toBe(true)
    })
  })

  describe('the Round card remembers open or closed on this device (#838, spec #856)', () => {
    const KEY = 'compies-round-notes'
    const card = (props: Record<string, unknown> = {}) => mountSuspended(GameNotesDisclosure, {
      props: { notes: notesFromLines(['Game-Zeile']), variant: 'round', remember: true, ...props },
    })
    const expanded = (disclosure: Awaited<ReturnType<typeof card>>) => disclosure.get('button').attributes('aria-expanded')
    beforeEach(() => {
      localStorage.clear()
      motion('reduced')
    })
    afterEach(() => {
      localStorage.clear()
      vi.restoreAllMocks()
    })

    it('is open without an entry, as it was before', async () => {
      const disclosure = await card()

      expect(expanded(disclosure)).toBe('true')
      expect(lines(disclosure)).toEqual(['Game-Zeile'])
    })

    it('stays closed after a remount once the Host closed it, and the entry is the only thing stored', async () => {
      const first = await card()
      await first.get('button').trigger('click')
      expect(expanded(first)).toBe('false')
      first.unmount()

      const again = await card()

      expect(expanded(again)).toBe('false')
      expect(again.find('p').exists()).toBe(false)
      expect(localStorage.length).toBe(1)
      expect(localStorage.getItem(KEY)).toBe('closed')
    })

    it('stays open after a remount once the Host opened it again', async () => {
      const first = await card()
      await first.get('button').trigger('click')
      await first.get('button').trigger('click')
      first.unmount()

      const again = await card()

      expect(expanded(again)).toBe('true')
      expect(localStorage.getItem(KEY)).toBe('open')
    })

    it('holds one memory for every Round card: closing one closes the next that shows', async () => {
      const first = await card()
      const second = await card({ notes: notesFromLines(['Andere Zeile']) })

      expect(expanded(second)).toBe('true')
      await first.get('button').trigger('click')

      expect(expanded(second)).toBe('false')
      const third = await card({ notes: notesFromLines(['Dritte Zeile']) })
      expect(expanded(third)).toBe('false')
    })

    it('shows the notes open, and no error, when the storage is blocked', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError')
      })
      const disclosure = await card()

      expect(expanded(disclosure)).toBe('true')
      await disclosure.get('button').trigger('click')
      expect(expanded(disclosure)).toBe('false')
    })

    it('reads an entry that is neither open nor closed as open', async () => {
      localStorage.setItem(KEY, 'banana')

      expect(expanded(await card())).toBe('true')
    })

    it('leaves the library page\'s disclosure alone: it starts closed and neither reads nor writes the entry', async () => {
      localStorage.setItem(KEY, 'open')
      const read = vi.spyOn(Storage.prototype, 'getItem')
      const written = vi.spyOn(Storage.prototype, 'setItem')
      const disclosure = await mountSuspended(GameNotesDisclosure, { props: { eventNotes: notesFromLines(['Heute nur Bo1']), variant: 'round' } })

      expect(expanded(disclosure)).toBe('false')
      await disclosure.get('button').trigger('click')
      await disclosure.get('button').trigger('click')

      expect(read.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0)
      expect(written.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0)
      expect(localStorage.getItem(KEY)).toBe('open')
    })
  })

  it('shows markup in the notes as text, never as an element or a link', async () => {
    const disclosure = await mountSuspended(GameNotesDisclosure, { props: { notes: notesFromLines(['<b>x</b> https://example.com']) } })

    await disclosure.get('button').trigger('click')

    expect(disclosure.find('b').exists()).toBe(false)
    expect(disclosure.find('a').exists()).toBe(false)
    expect(lines(disclosure)).toEqual(['<b>x</b> https://example.com'])
  })
})
