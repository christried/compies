import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import { kitty, signInAs } from './auth'
import { clickHostAction, dialog, LARSI, radio, SANNE, serve, shownToasts, view, type Vote, type Wrapper } from './event-page'

// The Note on a Vote (#102) on the Event page: the Slot card's button and field, the matrix marker, the lists in
// „Termin festlegen“ and on the DateSetCard.

const NOTE = 'kann maximal bis 20:30'
const kittyMaybe: Vote = { slotId: 'fri', userId: kitty.id, value: 'maybe', note: null }
const larsiNote: Vote = { slotId: 'fri', userId: LARSI, value: 'no', note: 'lass 14:30 anfangen' }

type Page = Awaited<ReturnType<typeof mountSuspended>>

describe('Notes on Votes', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  const card = (page: Page, slotId: string) => page.get(`[data-slot="${slotId}"]`)
  const buttonLabelled = (page: Page, slotId: string, label: string) => card(page, slotId).findAll('button').find((button: Wrapper) => button.text() === label || button.attributes('aria-label') === label)

  describe('the Slot card', () => {
    it('offers the Anmerkung button once voted on a future Slot, and not before, nor on a past Slot', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe, { slotId: 'old', userId: kitty.id, value: 'yes' }]))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      expect(buttonLabelled(page, 'fri', 'Anmerkung')).toBeDefined()
      expect(buttonLabelled(page, 'sat', 'Anmerkung')).toBeUndefined()
      expect(buttonLabelled(page, 'old', 'Anmerkung')).toBeUndefined()
    })

    it('opens the editor with the label on the text area, the audience, the placeholder and the counter, focused', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe]))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')

      const field = card(page, 'fri')
      const textarea = field.get('textarea')
      expect(field.get(`label[for="${textarea.attributes('id')}"]`).text()).toBe('Anmerkung')
      const audience = field.findAll('span').find((span: Wrapper) => span.text() === 'sehen alle')!
      expect(textarea.attributes('aria-describedby')).toBe(audience.attributes('id'))
      expect(textarea.attributes('placeholder')).toBe('z. B. kann maximal bis 20:30')
      expect(field.text()).toContain('0/80')
      expect(field.text()).not.toContain('Sehen alle im Event')
      expect(textarea.attributes('maxlength')).toBeUndefined()
      await vi.waitFor(() => expect(document.activeElement).toBe(textarea.element))
    })

    it('keeps the caret where it was when a pasted line break is turned into a space', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe]))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      const textarea = card(page, 'fri').get('textarea')
      const el = textarea.element as HTMLTextAreaElement

      await textarea.setValue('ab')
      el.setSelectionRange(1, 1)
      el.value = 'a\nXb'
      el.setSelectionRange(3, 3)
      await textarea.trigger('input')

      expect(el.value).toBe('a Xb')
      expect(el.selectionStart).toBe(3)
    })

    it('opens the field by itself when Meh is chosen, without focusing it', async () => {
      const store = serve(s => view(s, []))
      registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
        method: 'PUT',
        handler: () => ({ slotId: 'sat', value: 'maybe', note: null }),
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })

      await radio(page, 'Sa 24.10. 20:00', 'Meh').trigger('click')

      await vi.waitFor(() => expect(card(page, 'sat').find('textarea').exists()).toBe(true))
      expect(document.activeElement).not.toBe(card(page, 'sat').get('textarea').element)
    })

    it('does not open the field for Ja', async () => {
      const store = serve(s => view(s, []))
      registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
        method: 'PUT',
        handler: () => ({ slotId: 'sat', value: 'yes', note: null }),
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

      await radio(page, 'Sa 24.10. 20:00', 'Ja').trigger('click')

      await vi.waitFor(() => expect(buttonLabelled(page, 'sat', 'Anmerkung')).toBeDefined())
      expect(card(page, 'sat').find('textarea').exists()).toBe(false)
    })

    it('closes the field Meh opened when the Vote moves on to Nein, if nothing was typed into it', async () => {
      const store = serve(s => view(s, []))
      registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
        method: 'PUT',
        handler: async (event) => {
          const { value } = await readBody<{ value: Vote['value'] }>(event)
          store.set(view(store.slug, [{ slotId: 'sat', userId: kitty.id, value }]))
          return { slotId: 'sat', value, note: null }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })

      await radio(page, 'Sa 24.10. 20:00', 'Meh').trigger('click')
      await vi.waitFor(() => expect(card(page, 'sat').find('textarea').exists()).toBe(true))

      await radio(page, 'Sa 24.10. 20:00', 'Nein').trigger('click')
      await vi.waitFor(() => expect(card(page, 'sat').find('textarea').exists()).toBe(false))
    })

    it('leaves the field Meh opened open once something was typed into it', async () => {
      const sent: string[] = []
      const store = serve(s => view(s, []))
      registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
        method: 'PUT',
        handler: async (event) => {
          const { value } = await readBody<{ value: Vote['value'] }>(event)
          sent.push(value)
          store.set(view(store.slug, [{ slotId: 'sat', userId: kitty.id, value }]))
          return { slotId: 'sat', value, note: null }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })

      await radio(page, 'Sa 24.10. 20:00', 'Meh').trigger('click')
      await vi.waitFor(() => expect(card(page, 'sat').find('textarea').exists()).toBe(true))
      await card(page, 'sat').get('textarea').setValue('halb')

      await radio(page, 'Sa 24.10. 20:00', 'Nein').trigger('click')
      await vi.waitFor(() => expect(sent).toEqual(['maybe', 'no']))
      expect(card(page, 'sat').get('textarea').element.value).toBe('halb')
    })

    it('keeps a field opened with the Anmerkung button open when the Vote changes', async () => {
      const sent: string[] = []
      const store = serve(s => view(s, [kittyMaybe]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: async (event) => {
          const { value } = await readBody<{ value: Vote['value'] }>(event)
          sent.push(value)
          store.set(view(store.slug, [{ slotId: 'fri', userId: kitty.id, value }]))
          return { slotId: 'fri', value, note: null }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await radio(page, 'Fr 23.10. 20:00', 'Nein').trigger('click')

      await vi.waitFor(() => expect(sent).toEqual(['no']))
      expect(card(page, 'fri').find('textarea').exists()).toBe(true)
    })

    it('saves a Note with the Vote, shows it at once and lists it under Anmerkungen', async () => {
      let sent: unknown = null
      const store = serve(s => view(s, [kittyMaybe]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: async (event) => {
          sent = await readBody(event)
          store.set(view(store.slug, [{ ...kittyMaybe, note: NOTE }]))
          return { slotId: 'fri', value: 'maybe', note: NOTE }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue(NOTE)
      await buttonLabelled(page, 'fri', 'Anmerkung speichern')!.trigger('click')

      expect(card(page, 'fri').find('textarea').exists()).toBe(false)
      expect(card(page, 'fri').text()).toContain(NOTE)
      expect(card(page, 'fri').text()).toContain('Anmerkungen')
      expect(card(page, 'fri').text()).toContain('Kitty (du)')
      await vi.waitFor(() => expect(sent).toEqual({ value: 'maybe', note: NOTE }))
    })

    it('saves with Enter and cancels with Escape', async () => {
      let sent: unknown = null
      const store = serve(s => view(s, [kittyMaybe]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: async (event) => {
          sent = await readBody(event)
          return { slotId: 'fri', value: 'maybe', note: 'x' }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue('weg damit')
      await card(page, 'fri').get('textarea').trigger('keydown', { key: 'Escape' })
      expect(card(page, 'fri').find('textarea').exists()).toBe(false)
      expect(sent).toBeNull()

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue('x')
      const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true })
      card(page, 'fri').get('textarea').element.dispatchEvent(enter)

      expect(enter.defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(sent).toEqual({ value: 'maybe', note: 'x' }))
    })

    it('saves with the ✓ and cancels with the ✗, which sends nothing', async () => {
      const sent: unknown[] = []
      const store = serve(s => view(s, [kittyMaybe]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: async (event) => {
          sent.push(await readBody(event))
          return { slotId: 'fri', value: 'maybe', note: NOTE }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue('weg damit')
      await buttonLabelled(page, 'fri', 'Abbrechen')!.trigger('click')
      expect(card(page, 'fri').find('textarea').exists()).toBe(false)

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue(NOTE)
      await buttonLabelled(page, 'fri', 'Anmerkung speichern')!.trigger('click')

      await vi.waitFor(() => expect(sent).toEqual([{ value: 'maybe', note: NOTE }]))
    })

    it('turns a pasted line break into a space, in the field and in the saved Note', async () => {
      let sent: unknown = null
      const store = serve(s => view(s, [kittyMaybe]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: async (event) => {
          sent = await readBody(event)
          return { slotId: 'fri', value: 'maybe', note: NOTE }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue('kann bis\n20:30')

      expect(card(page, 'fri').get('textarea').element.value).toBe('kann bis 20:30')
      await buttonLabelled(page, 'fri', 'Anmerkung speichern')!.trigger('click')
      await vi.waitFor(() => expect(sent).toEqual({ value: 'maybe', note: 'kann bis 20:30' }))
    })

    it('stops the input at 80 characters as the User sees them, with the counter in the warning colour', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe]))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue('👍🏽'.repeat(81))

      const field = card(page, 'fri')
      expect(field.get('textarea').element.value).toBe('👍🏽'.repeat(80))
      const counter = field.findAll('span').find((span: Wrapper) => span.text() === '80/80')!
      expect(counter.classes()).toContain('text-warning-fg')
    })

    it('announces the characters left from 64 characters on', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe]))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      const live = () => card(page, 'fri').get('[aria-live="polite"]').text()

      await card(page, 'fri').get('textarea').setValue('a'.repeat(63))
      expect(live()).toBe('')
      await card(page, 'fri').get('textarea').setValue('a'.repeat(64))
      expect(live()).toBe('Noch 16 Zeichen')
    })

    it('moves the focus to the pencil after a saved Note', async () => {
      const store = serve(s => view(s, [kittyMaybe]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: async (event) => {
          const { note } = await readBody<{ note: string }>(event)
          store.set(view(store.slug, [{ ...kittyMaybe, note: note || null }]))
          return { slotId: 'fri', value: 'maybe', note: note || null }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue(NOTE)
      await buttonLabelled(page, 'fri', 'Anmerkung speichern')!.trigger('click')

      const pencil = buttonLabelled(page, 'fri', 'Anmerkung bearbeiten')!
      await vi.waitFor(() => expect(document.activeElement).toBe(pencil.element))
    })

    it('moves the focus to „Anmerkung“ after the ✗ on an empty Note', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe]))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await buttonLabelled(page, 'fri', 'Abbrechen')!.trigger('click')

      const add = buttonLabelled(page, 'fri', 'Anmerkung')!
      await vi.waitFor(() => expect(document.activeElement).toBe(add.element))
    })

    it('styles the ✓ as success and the ✗ as error', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe]))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')

      expect(buttonLabelled(page, 'fri', 'Anmerkung speichern')!.classes()).toContain('bg-success')
      expect(buttonLabelled(page, 'fri', 'Abbrechen')!.classes()).toContain('bg-error')
    })

    it('shows an existing Note as text with a pencil, edits it, and removes it with an empty field', async () => {
      const sent: unknown[] = []
      const store = serve(s => view(s, [{ ...kittyMaybe, note: NOTE }]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: async (event) => {
          sent.push(await readBody(event))
          return { slotId: 'fri', value: 'maybe', note: null }
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })
      expect(buttonLabelled(page, 'fri', 'Anmerkung')).toBeUndefined()

      await buttonLabelled(page, 'fri', 'Anmerkung bearbeiten')!.trigger('click')
      expect(card(page, 'fri').get('textarea').element.value).toBe(NOTE)
      await card(page, 'fri').get('textarea').setValue('')
      await buttonLabelled(page, 'fri', 'Anmerkung speichern')!.trigger('click')

      expect(buttonLabelled(page, 'fri', 'Anmerkung')).toBeDefined()
      expect(card(page, 'fri').text()).not.toContain(NOTE)
      await vi.waitFor(() => expect(sent).toEqual([{ value: 'maybe', note: '' }]))
    })

    it('rolls a Note back with the failed-vote toast', async () => {
      const store = serve(s => view(s, [kittyMaybe]))
      registerEndpoint(`/api/e/${store.slug}/slots/fri/vote`, {
        method: 'PUT',
        handler: () => {
          throw createError({ statusCode: 500, statusMessage: 'boom' })
        },
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}` })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('textarea').setValue(NOTE)
      await buttonLabelled(page, 'fri', 'Anmerkung speichern')!.trigger('click')

      await vi.waitFor(() => expect(shownToasts()).toEqual([expect.objectContaining({ tone: 'error', text: 'Deine Stimme ist nicht angekommen' })]))
      expect(card(page, 'fri').text()).not.toContain(NOTE)
    })

    it('lists the Notes of others in the matrix order, also on a past Slot, which has no button', async () => {
      const { slug } = serve(s => view(s, [
        { slotId: 'old', userId: SANNE, value: 'yes', note: 'war schön' },
        { slotId: 'old', userId: kitty.id, value: 'no', note: 'ich nicht' },
        { slotId: 'old', userId: LARSI, value: 'maybe', note: 'halb' },
      ]))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      const items = card(page, 'old').findAll('li').map((item: Wrapper) => item.text())
      expect(items).toEqual([expect.stringContaining('Kitty (du)'), expect.stringContaining('Larsi'), expect.stringContaining('Sanne')])
      expect(items[0]).toContain('Nein')
      expect(items[0]).toContain('ich nicht')
      expect(buttonLabelled(page, 'old', 'Anmerkung')).toBeUndefined()
      expect(buttonLabelled(page, 'old', 'Anmerkung bearbeiten')).toBeUndefined()
    })
  })

  describe('„Wer kann wann?“', () => {
    it('marks a cell with a Note and puts it in the screen-reader text', async () => {
      const { slug } = serve(s => view(s, [larsiNote, { slotId: 'fri', userId: SANNE, value: 'yes' }]))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      const cells = page.findAll('tbody tr').find(row => row.text().includes('Larsi'))!.findAll('td')
      expect(page.find('table [title]').exists()).toBe(false)
      expect(cells[0]!.get('button .sr-only').text()).toBe('Nein: lass 14:30 anfangen')
      expect(cells[0]!.find('span[aria-hidden="true"].bg-primary').exists()).toBe(true)
      const withoutNote = page.findAll('tbody tr').find(row => row.text().includes('Sanne'))!.findAll('td')[0]!
      expect(withoutNote.find('button').exists()).toBe(false)
      expect(withoutNote.find('span.bg-primary').exists()).toBe(false)
    })
  })

  describe('„Termin festlegen“ and the DateSetCard', () => {
    it('lists the Notes of each option in the dialog', async () => {
      const { slug } = serve(s => view(s, [larsiNote], { event: { isHost: true } }))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      await clickHostAction(page, 'Termin festlegen')

      const option = dialog()!.querySelector('[data-slot="fri"]')!.parentElement!
      expect(option.textContent).toContain('Anmerkungen')
      expect(option.textContent).toContain('Larsi')
      expect(option.textContent).toContain('lass 14:30 anfangen')
      expect(dialog()!.querySelector('[data-slot="sat"]')!.parentElement!.textContent).not.toContain('Anmerkungen')
    })

    it('lists the Notes of the Slot on a dated Session, read-only', async () => {
      const { slug } = serve(s => ({
        ...view(s, [], { event: { phase: 'date_set', startsAt: '2026-10-24T18:00:00.000Z' }, slots: [], bestSlotId: null }),
        sessions: [{ id: 's1', number: null, startsAt: '2026-10-24T18:00:00.000Z', previousStartsAt: null, notes: [{ userId: LARSI, value: 'maybe' as const, note: NOTE }] }],
      }))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      const list = page.get('section li')
      expect(list.text()).toContain('Larsi')
      expect(list.text()).toContain(NOTE)
      expect(page.text()).toContain('Anmerkungen')
      expect(page.findAll('section button').some(button => button.text() === 'Anmerkung')).toBe(false)
    })
  })
})
