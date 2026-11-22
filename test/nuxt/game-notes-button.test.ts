import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameNotesButton from '~/components/GameNotesButton.vue'
import { notesFromLines, type NotesDoc } from '~~/shared/notes-doc'
import { GAME_NAME_MAX } from '~~/shared/game'
import { restoreScreen, stubScreen } from './event-page'
import { eventNotesContext } from './helpers/event-notes-context'
import { BLANK_NOTES, FORMATTED_HREF, FORMATTED_NOTES, readFormatted } from './helpers/formatted-notes'

// The Notes button of a game in the pickers (#436, 02-components § GameCard, deviation 0.12): a read-only popover from md up, a
// sheet below, the notes with their line breaks. Escape or a press outside closes the popover and focus goes back to the button.

const TRIGGER = 'button[aria-label^="Notizen zu "]'
const NOTES = 'Zeile eins\n\nZeile drei'

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
let setWide: (next: boolean) => void

// The Event's name and whether it is finished are the Event page's context's (#821), not props.
async function mount({ eventName, eventFinished, ...props }: { name?: string, notes: NotesDoc | null, eventNotes?: NotesDoc | null, eventName?: string, eventFinished?: boolean, editTo?: string, editable?: boolean, onEdit?: () => void }) {
  const { global } = eventNotesContext({ ...(eventName === undefined ? {} : { eventName }), finished: eventFinished ?? false })
  page = await mountSuspended(GameNotesButton, { props: { name: 'Mario Kart', ...props }, attachTo: document.body, global })
  await flushPromises()
  return page
}

const trigger = () => document.querySelector<HTMLButtonElement>(TRIGGER)!
const popover = () => document.querySelector<HTMLElement>('[role="dialog"]:not([data-sheet])')
const sheet = () => document.querySelector<HTMLElement>('[data-sheet="panel"]')
const lines = (within: Element | null) => [...within!.querySelectorAll('p')].map(p => p.textContent)
const open = async () => {
  trigger().click()
  await flushPromises()
}

// The popover's layout size (#824): offsetWidth and offsetHeight, which the opening's transform does not change. happy-dom has no layout,
// so the test sets them for the popover only; the returned function puts the prototype back.
function stubPopoverSize(width: number, height: number) {
  const sizes = { offsetWidth: width, offsetHeight: height }
  const saved = (['offsetWidth', 'offsetHeight'] as const).map(key => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const)
  for (const key of ['offsetWidth', 'offsetHeight'] as const) {
    Object.defineProperty(HTMLElement.prototype, key, {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute('role') === 'dialog' ? sizes[key] : 0
      },
    })
  }
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor)
      else Reflect.deleteProperty(HTMLElement.prototype, key)
    }
  }
}

beforeEach(() => {
  document.body.innerHTML = ''
  setWide = stubScreen(true)
})

afterEach(() => {
  page?.unmount()
  page = undefined
  restoreScreen()
})

describe('the Notes button of a game (#436)', () => {
  it('renders nothing for a game without Notes, null or blank', async () => {
    await mount({ notes: null })
    expect(document.querySelector(TRIGGER)).toBeNull()
    page!.unmount()

    await mount({ notes: notesFromLines(['  ']) })
    expect(document.querySelector(TRIGGER)).toBeNull()
  })

  it.each(BLANK_NOTES)('renders no button for a document without a visible character (#728)', async (blank) => {
    await mount({ notes: blank })

    expect(document.querySelector(TRIGGER)).toBeNull()
  })

  it('shows formatted notes in the popover from md up, the heading as h3 under the game name (#728)', async () => {
    await mount({ notes: FORMATTED_NOTES })
    await open()

    expect(readFormatted(popover()!)).toEqual({
      heading: 'h3',
      headingText: 'Regeln',
      items: ['Erstens', 'Zweitens'],
      bold: 'Wichtig',
      link: { text: 'nachlesen', href: FORMATTED_HREF, target: '_blank', rel: 'noopener noreferrer' },
    })
  })

  it('shows formatted notes in the sheet below md (#728)', async () => {
    setWide(false)
    await mount({ notes: FORMATTED_NOTES })
    await open()

    expect(readFormatted(sheet()!)).toEqual({
      heading: 'h3',
      headingText: 'Regeln',
      items: ['Erstens', 'Zweitens'],
      bold: 'Wichtig',
      link: { text: 'nachlesen', href: FORMATTED_HREF, target: '_blank', rel: 'noopener noreferrer' },
    })
  })

  describe('with Event notes (#732)', () => {
    const LABEL = 'Notizen für dieses Event'
    const before = (first: Element, second: Element) => !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)
    const label = (within: Element) => [...within.querySelectorAll('h3')].find(h => h.textContent === LABEL)!
    const paragraph = (within: Element, text: string) => [...within.querySelectorAll('p')].find(p => p.textContent === text)!

    it('shows the button for a game with only Event notes, the label above the text in the popover', async () => {
      await mount({ notes: null, eventNotes: notesFromLines(['Heute nur Bo1']) })

      expect(document.querySelector(TRIGGER)).not.toBeNull()
      await open()

      expect(before(label(popover()!), paragraph(popover()!, 'Heute nur Bo1'))).toBe(true)
      expect(lines(popover())).toEqual(['Heute nur Bo1'])
    })

    it('shows the label above the text in the sheet below md', async () => {
      setWide(false)
      await mount({ notes: null, eventNotes: notesFromLines(['Heute nur Bo1']) })
      await open()

      expect(before(label(sheet()!), paragraph(sheet()!, 'Heute nur Bo1'))).toBe(true)
      expect(sheet()!.querySelector('h2')!.textContent).toBe('Mario Kart')
    })

    it.each([true, false])('puts the Event notes above the Game notes, the label once (wide %s)', async (wide) => {
      setWide(wide)
      await mount({ notes: notesFromLines(['Game-Zeile']), eventNotes: notesFromLines(['Heute nur Bo1']) })
      await open()

      const within = (wide ? popover() : sheet())!
      expect(before(paragraph(within, 'Heute nur Bo1'), paragraph(within, 'Game-Zeile'))).toBe(true)
      expect([...within.querySelectorAll('h3')].filter(h => h.textContent === LABEL)).toHaveLength(1)
    })

    it('shows the Game notes alone as it does today, with no label', async () => {
      await mount({ notes: notesFromLines(['Game-Zeile']), eventNotes: null })
      await open()

      expect(popover()!.textContent).not.toContain(LABEL)
      expect(lines(popover())).toEqual(['Game-Zeile'])
    })

    it.each(BLANK_NOTES)('renders no button for blank Event notes beside no Game notes', async (blank) => {
      await mount({ notes: null, eventNotes: blank })

      expect(document.querySelector(TRIGGER)).toBeNull()
    })

    it('reads the formatted Event notes back in the popover, their heading an h4', async () => {
      await mount({ notes: null, eventNotes: FORMATTED_NOTES })
      await open()

      expect(readFormatted(popover()!)).toEqual({
        heading: 'h4',
        headingText: 'Regeln',
        items: ['Erstens', 'Zweitens'],
        bold: 'Wichtig',
        link: { text: 'nachlesen', href: FORMATTED_HREF, target: '_blank', rel: 'noopener noreferrer' },
      })
    })
  })

  it('is a button named „Notizen zu {game}“ that starts closed', async () => {
    await mount({ notes: notesFromLines(NOTES.split('\n')) })

    expect(trigger().getAttribute('aria-label')).toBe('Notizen zu Mario Kart')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog')
    expect(popover()).toBeNull()
    expect(sheet()).toBeNull()
  })

  // The look of the button (#837, design 18-notizen): the sticky note, a shadow, and an ink fill while its notes are open.
  describe('the look of the button (#837)', () => {
    it('is a surface button while closed and an ink one while its notes are open, in the popover and in the sheet', async () => {
      for (const wide of [true, false]) {
        setWide(wide)
        await mount({ notes: notesFromLines(NOTES.split('\n')) })

        expect(trigger().classList).toContain('bg-surface')
        expect(trigger().classList).not.toContain('bg-ink')
        expect(trigger().classList).toContain('shadow-sm')

        await open()

        expect(trigger().getAttribute('aria-expanded')).toBe('true')
        expect(trigger().classList).toContain('bg-ink')
        expect(trigger().classList).toContain('text-paper')
        expect(trigger().classList).not.toContain('bg-surface')
        expect(trigger().hasAttribute('aria-pressed')).toBe(false)

        page!.unmount()
        document.body.innerHTML = ''
      }
    })

    it('leaves the popover’s own close button without aria-expanded and on the surface look (IconButton `expanded` unset)', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()

      const close = popover()!.querySelector('button[aria-label="Schließen"]')!
      expect(close.hasAttribute('aria-expanded')).toBe(false)
      expect(close.classList).toContain('bg-surface')
      expect(close.classList).not.toContain('bg-ink')
    })

    it('goes back to the surface look when the popover closes', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()

      trigger().click()
      await flushPromises()

      expect(popover()).toBeNull()
      expect(trigger().getAttribute('aria-expanded')).toBe('false')
      expect(trigger().classList).toContain('bg-surface')
      expect(trigger().classList).not.toContain('bg-ink')
    })
  })

  // The footer „Bearbeiten“ (#837): with `editTo`, a text button with the pencil in a footer under the notes; without it, none (the pickers).
  describe('the footer „Bearbeiten“ (#837)', () => {
    const EDIT = '/bibliothek/g-1/bearbeiten'
    const editLink = (within: Element | null) => [...within!.querySelectorAll('a')].find(link => link.textContent!.includes('Bearbeiten'))

    it('is a link to the game’s form in a footer outside the scrolling body, in the popover', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')), editTo: EDIT })
      await open()

      const link = editLink(popover())!
      expect(link.getAttribute('href')).toBe(EDIT)
      expect(link.closest('footer')).not.toBeNull()
      expect(popover()!.lastElementChild).toBe(link.closest('footer'))
      expect(popover()!.querySelector('[data-notes-body]')!.contains(link)).toBe(false)
      expect(link.querySelector('svg')).not.toBeNull()
    })

    it('is a link to the game’s form in the sheet’s footer, below md', async () => {
      setWide(false)
      await mount({ notes: notesFromLines(NOTES.split('\n')), editTo: EDIT })
      await open()

      const link = editLink(sheet())!
      expect(link.getAttribute('href')).toBe(EDIT)
      expect(link.closest('footer')).not.toBeNull()
      expect(link.closest('[data-notes-body]')).toBeNull()
    })

    it('has no footer without editTo, in either container', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()
      expect(popover()!.querySelector('footer')).toBeNull()
      page!.unmount()

      setWide(false)
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()
      expect(sheet()!.querySelector('footer')).toBeNull()
    })

    it('closes the notes when it is used, and leaves the focus to the page it leads to', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')), editTo: EDIT })
      await open()
      const link = editLink(popover())!
      // The router's own navigation is not under test: a capture listener marks the click as handled before RouterLink sees it.
      document.addEventListener('click', event => event.preventDefault(), { capture: true, once: true })

      link.click()
      await flushPromises()

      expect(popover()).toBeNull()
      expect(document.activeElement).not.toBe(trigger())
    })

    // `editable` (#858): the Event page's tiles have no page to lead to, so the footer is a button that asks the tile for its dialog.
    describe('as a button with `editable` (#858)', () => {
      const editButton = (within: Element | null) => [...within!.querySelectorAll('button')].find(button => button.textContent!.includes('Bearbeiten'))

      it('is a button in a footer outside the scrolling body, in the popover, with the pencil', async () => {
        await mount({ notes: notesFromLines(NOTES.split('\n')), editable: true })
        await open()

        const button = editButton(popover())!
        expect(button.getAttribute('type')).toBe('button')
        expect(button.closest('footer')).not.toBeNull()
        expect(popover()!.lastElementChild).toBe(button.closest('footer'))
        expect(popover()!.querySelector('[data-notes-body]')!.contains(button)).toBe(false)
        expect(button.querySelector('svg')).not.toBeNull()
        expect(popover()!.querySelector('footer a')).toBeNull()
      })

      it('is a button in the sheet’s footer, below md', async () => {
        setWide(false)
        await mount({ notes: notesFromLines(NOTES.split('\n')), editable: true })
        await open()

        const button = editButton(sheet())!
        expect(button.closest('footer')).not.toBeNull()
        expect(button.closest('[data-notes-body]')).toBeNull()
      })

      it('closes the popover, emits `edit` once and leaves the focus on the Notes button', async () => {
        const onEdit = vi.fn()
        await mount({ notes: notesFromLines(NOTES.split('\n')), editable: true, onEdit })
        await open()

        editButton(popover())!.click()
        await flushPromises()

        expect(popover()).toBeNull()
        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(document.activeElement).toBe(trigger())
      })

      it('closes the sheet, emits `edit` once and leaves the focus on the Notes button, below md', async () => {
        setWide(false)
        const onEdit = vi.fn()
        await mount({ notes: notesFromLines(NOTES.split('\n')), editable: true, onEdit })
        // A real tap focuses the button before it opens the sheet, which is where the sheet returns the focus to; `click()` alone does not.
        trigger().focus()
        await open()

        editButton(sheet())!.click()
        await flushPromises()

        expect(trigger().getAttribute('aria-expanded')).toBe('false')
        expect(onEdit).toHaveBeenCalledTimes(1)
        expect(document.activeElement).toBe(trigger())
      })

      it('has the Event notes first and the button under them, for a game with both', async () => {
        await mount({ notes: notesFromLines(['Game-Zeile']), eventNotes: notesFromLines(['Heute nur Bo1']), editable: true })
        await open()

        expect(popover()!.textContent!.indexOf('Heute nur Bo1')).toBeLessThan(popover()!.textContent!.indexOf('Game-Zeile'))
        expect(editButton(popover())).toBeDefined()
      })

      it('stays a link with `editTo`, even when `editable` is set too', async () => {
        await mount({ notes: notesFromLines(NOTES.split('\n')), editTo: EDIT, editable: true })
        await open()

        expect(editLink(popover())!.getAttribute('href')).toBe(EDIT)
        expect(editButton(popover())).toBeUndefined()
      })
    })

    it('stays in view while a 1000-character note scrolls above it', async () => {
      const long = `${'a'.repeat(495)}\n${'b'.repeat(495)}`
      await mount({ notes: notesFromLines(long.split('\n')), editTo: EDIT })
      await open()

      expect(popover()!.querySelector('[data-notes-body]')!.classList).toContain('overflow-y-auto')
      expect(popover()!.querySelector('footer')!.classList).toContain('flex-none')
      expect(lines(popover())).toEqual(long.split('\n'))
    })
  })

  it('opens a sheet below md, with the notes exactly as stored, line breaks included', async () => {
    setWide(false)
    await mount({ notes: notesFromLines(NOTES.split('\n')) })

    await open()

    expect(sheet()).not.toBeNull()
    expect(sheet()!.getAttribute('role')).toBe('dialog')
    expect(sheet()!.querySelector('h2')!.textContent).toBe('Mario Kart')
    expect(lines(sheet())).toEqual(NOTES.split('\n'))
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
  })

  it('opens a popover from md up, fixed and 320 px wide, with focus on its close button (#729)', async () => {
    await mount({ notes: notesFromLines(NOTES.split('\n')) })

    await open()

    expect(sheet()).toBeNull()
    expect(popover()).not.toBeNull()
    expect(popover()!.classList).toContain('fixed')
    expect(popover()!.classList).toContain('w-80')
    expect(lines(popover())).toEqual(NOTES.split('\n'))
    expect(document.activeElement).toBe(popover()!.querySelector('button[aria-label="Schließen"]'))
  })

  it('heads the popover with the game name as the kicker and „Notizen“ as its h2, and stays labelled „Notizen zu {game}“ (#729)', async () => {
    await mount({ notes: notesFromLines(NOTES.split('\n')) })

    await open()

    const title = popover()!.querySelector('h2')!
    expect(title.textContent).toBe('Notizen')
    expect(title.className).toContain('font-display')
    expect(title.className).toContain('text-[22px]')
    const kicker = [...popover()!.querySelectorAll('header span')].find(span => span.textContent === 'Mario Kart')!
    expect(kicker.className).toContain('text-[12px]')
    expect(kicker.className).toContain('font-bold')
    expect(kicker.className).toContain('text-ink-2')
    expect(popover()!.getAttribute('aria-label')).toBe('Notizen zu Mario Kart')
    expect(popover()!.hasAttribute('aria-labelledby')).toBe(false)
  })

  it('shows the notes at sm in the popover and at md in the sheet, with no „Bearbeiten“ footer (#729)', async () => {
    await mount({ notes: FORMATTED_NOTES })
    await open()
    expect(popover()!.querySelector('.cp-note')!.classList).toContain('cp-note--sm')
    expect(popover()!.querySelector('.cp-note--md')).toBeNull()
    expect(popover()!.textContent).not.toContain('Bearbeiten')
    page!.unmount()

    setWide(false)
    await mount({ notes: FORMATTED_NOTES })
    await open()
    expect(sheet()!.querySelector('.cp-note')!.classList).toContain('cp-note--md')
    expect(sheet()!.textContent).not.toContain('Bearbeiten')
  })

  it('shows the Event block and the game block with their subs when both are there, at sm in the popover (#729)', async () => {
    await mount({ notes: notesFromLines(['Game-Zeile']), eventNotes: notesFromLines(['Heute nur Bo1']), eventName: 'Spieleabend bei Sanne' })
    await open()

    const blocks = [...popover()!.querySelectorAll('.cp-note')]
    expect(blocks.map(block => block.textContent)).toEqual(['Heute nur Bo1', 'Game-Zeile'])
    expect(blocks.every(block => block.classList.contains('cp-note--sm'))).toBe(true)
    expect(popover()!.textContent).toContain('Spieleabend bei Sanne')
    expect(popover()!.textContent).toContain('aus deiner Bibliothek')
    // The game block has its title: „Notizen“ as an h3 below the popover's h2.
    expect([...popover()!.querySelectorAll('h3')].map(h => h.textContent)).toEqual(['Notizen für dieses Event', 'Notizen'])
  })

  it('shows a finished Event block with the chip in the popover (#729)', async () => {
    await mount({ notes: null, eventNotes: notesFromLines(['Heute nur Bo1']), eventFinished: true })
    await open()

    expect(popover()!.textContent).toContain('Event beendet')
    expect(popover()!.querySelector('.border-dashed')).not.toBeNull()
  })

  it('draws a 2 px line-soft rule under the header once the body has scrolled, and not before (#729)', async () => {
    await mount({ notes: FORMATTED_NOTES })
    await open()
    const header = popover()!.querySelector('header')!
    const body = popover()!.querySelector<HTMLElement>('[data-notes-body]')!

    expect(header.className).toContain('border-transparent')
    expect(header.className).not.toContain('border-line-soft')

    body.scrollTop = 30
    body.dispatchEvent(new Event('scroll'))
    await flushPromises()

    expect(header.className).toContain('border-line-soft')
    expect(header.className).not.toContain('border-transparent')
    expect(popover()).not.toBeNull()
  })

  it('closes on Escape and gives the focus back to the button', async () => {
    await mount({ notes: notesFromLines(NOTES.split('\n')) })
    await open()

    popover()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a press outside and gives the focus back to the button', async () => {
    await mount({ notes: notesFromLines(NOTES.split('\n')) })
    await open()

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()

    expect(popover()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  // A scroll closes the popover only when it moved the button (#974): the Event page's first press removes „Ton aktivieren“, the document gets
  // shorter and the browser clamps the scroll position, a scroll that leaves the button where it was. happy-dom has no layout, so the
  // button's rect is a variable the test moves.
  describe('on a scroll (#974)', () => {
    let buttonTop = 100
    let measure: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      buttonTop = 100
      measure = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        const at = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect
        return this.matches(TRIGGER) ? at(buttonTop, 400, 40, 36) : at(0, 0, 0, 0)
      })
    })
    afterEach(() => measure.mockRestore())

    it('keeps the popover open when the page scrolls and the button stays where it was', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()

      window.dispatchEvent(new Event('scroll'))
      document.body.dispatchEvent(new Event('scroll'))
      await flushPromises()

      expect(popover()).not.toBeNull()
    })

    it('keeps the popover open when the button moved by 1 px or less', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()

      buttonTop = 101
      window.dispatchEvent(new Event('scroll'))
      await flushPromises()

      expect(popover()).not.toBeNull()
    })

    it('closes the popover and gives the focus back to the button when the scroll moved the button by more than 1 px', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()

      buttonTop = 160
      window.dispatchEvent(new Event('scroll'))
      await flushPromises()

      expect(popover()).toBeNull()
      expect(document.activeElement).toBe(trigger())
    })

    it('keeps the popover open on a scroll inside it, even when the button moved', async () => {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })
      await open()

      buttonTop = 160
      popover()!.querySelector('p')!.dispatchEvent(new Event('scroll', { bubbles: false }))
      await flushPromises()

      expect(popover()).not.toBeNull()
    })
  })

  it('keeps all of a 1000-character note, line breaks included, inside a scrolling popover', async () => {
    const long = `${'a'.repeat(495)}\n${'b'.repeat(495)}\n\n`
    expect(long.length).toBeLessThanOrEqual(1000)
    await mount({ notes: notesFromLines(long.split('\n')) })
    await open()

    expect(lines(popover())).toEqual(long.split('\n'))
    // The body scrolls under a header that stays; two blocks get more height (#729).
    expect(popover()!.querySelector('[data-notes-body]')!.classList).toContain('overflow-y-auto')
    expect(popover()!.className).toContain('max-h-[min(70vh,440px)]')
  })

  it('lets two blocks have a taller popover (#729)', async () => {
    await mount({ notes: notesFromLines(['a']), eventNotes: notesFromLines(['b']) })
    await open()

    expect(popover()!.className).toContain('max-h-[min(80vh,520px)]')
  })

  it('keeps a game name of the longest allowed length in full, in the kicker', async () => {
    const name = 'W'.repeat(GAME_NAME_MAX)
    await mount({ name, notes: notesFromLines(NOTES.split('\n')) })
    await open()

    const kicker = [...popover()!.querySelectorAll('header span')].find(span => span.textContent === name)!
    expect(kicker).toBeDefined()
    expect(kicker.className).toContain('[overflow-wrap:anywhere]')
  })
  it('stays inside the window for a button low in the picker (#488)', async () => {
    const realHeight = window.innerHeight
    window.innerHeight = 800
    const unsize = stubPopoverSize(288, 300)
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.matches(TRIGGER)) return at(650, 400, 40, 36)
      if (this.getAttribute('role') === 'dialog') return at(0, 0, 288, 300)
      return at(0, 0, 0, 0)
    })
    try {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })

      await open()

      const style = popover()!.style
      const top = Number.parseFloat(style.top)
      const left = Number.parseFloat(style.left)
      expect(top).toBeGreaterThanOrEqual(0)
      expect(top + 300).toBeLessThanOrEqual(800)
      expect(left).toBeGreaterThanOrEqual(0)
      expect(left + 288).toBeLessThanOrEqual(window.innerWidth)
    }
    finally {
      unsize()
      measure.mockRestore()
      window.innerHeight = realHeight
    }
  })

  it('caps a popover that fits on neither side, so it scrolls inside the window (#494)', async () => {
    const realHeight = window.innerHeight
    window.innerHeight = 900
    const unsize = stubPopoverSize(288, 420)
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.matches(TRIGGER)) return at(430, 400, 40, 36)
      if (this.getAttribute('role') === 'dialog') return at(0, 0, 288, 420)
      return at(0, 0, 0, 0)
    })
    try {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })

      await open()

      // Below the button there are 900 − 466 = 434 px, above it 430 px: below is the roomier side, capped at 434 − 12 − 12.
      expect(Number.parseFloat(popover()!.style.top)).toBe(478)
      expect(popover()!.style.maxHeight).toBe('410px')
    }
    finally {
      unsize()
      measure.mockRestore()
      window.innerHeight = realHeight
    }
  })

  // The opening's scale(.96) draws the box 307.2 px wide (#824); the clamp must still use its layout width, 320, so the right edge stays
  // 12 px inside a 1440 px window.
  it('places the popover by its layout size, not by the drawn box the opening shrinks it to, at 1440 px (#824)', async () => {
    const realWidth = window.innerWidth
    const realHeight = window.innerHeight
    window.innerWidth = 1440
    window.innerHeight = 900
    const unsize = stubPopoverSize(320, 300)
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const at = (top: number, left: number, width: number, height: number) => ({ top, left, width, height, bottom: top + height, right: left + width, x: left, y: top, toJSON: () => ({}) }) as DOMRect
      if (this.matches(TRIGGER)) return at(400, 1250, 40, 36)
      if (this.getAttribute('role') === 'dialog') return at(0, 0, 307.2, 288)
      return at(0, 0, 0, 0)
    })
    try {
      await mount({ notes: notesFromLines(NOTES.split('\n')) })

      await open()

      const left = Number.parseFloat(popover()!.style.left)
      expect(left + 320).toBeLessThanOrEqual(1440 - 12)
    }
    finally {
      unsize()
      measure.mockRestore()
      window.innerWidth = realWidth
      window.innerHeight = realHeight
    }
  })
})
