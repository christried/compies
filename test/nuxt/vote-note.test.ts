import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug].vue'
import { kitty, signInAs } from './auth'
import { clickButton, dialog, LARSI, radio, SANNE, serve, shownToasts, view, type Vote, type Wrapper } from './event-page'

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

    it('opens the field with the label and help, focused, from the button', async () => {
      const { slug } = serve(s => view(s, [kittyMaybe]))
      const page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')

      const field = card(page, 'fri')
      expect(field.text()).toContain('Sehen alle im Event. Zum Beispiel: kann maximal bis 20:30')
      expect(field.get('label').text()).toBe('Anmerkung')
      expect(field.get('input').attributes('maxlength')).toBeUndefined()
      await vi.waitFor(() => expect(document.activeElement).toBe(field.get('input').element))
    })

    it('opens the field by itself when Meh is chosen, without focusing it', async () => {
      const store = serve(s => view(s, []))
      registerEndpoint(`/api/e/${store.slug}/slots/sat/vote`, {
        method: 'PUT',
        handler: () => ({ slotId: 'sat', value: 'maybe', note: null }),
      })
      const page = await mountSuspended(EventPage, { route: `/e/${store.slug}`, attachTo: document.body })

      await radio(page, 'Sa 24.10. 20:00', 'Meh').trigger('click')

      await vi.waitFor(() => expect(card(page, 'sat').find('input').exists()).toBe(true))
      expect(document.activeElement).not.toBe(card(page, 'sat').get('input').element)
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
      expect(card(page, 'sat').find('input').exists()).toBe(false)
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
      await vi.waitFor(() => expect(card(page, 'sat').find('input').exists()).toBe(true))

      await radio(page, 'Sa 24.10. 20:00', 'Nein').trigger('click')
      await vi.waitFor(() => expect(card(page, 'sat').find('input').exists()).toBe(false))
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
      await vi.waitFor(() => expect(card(page, 'sat').find('input').exists()).toBe(true))
      await card(page, 'sat').get('input').setValue('halb')

      await radio(page, 'Sa 24.10. 20:00', 'Nein').trigger('click')
      await vi.waitFor(() => expect(sent).toEqual(['maybe', 'no']))
      expect(card(page, 'sat').get('input').element.value).toBe('halb')
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
      expect(card(page, 'fri').find('input').exists()).toBe(true)
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
      await card(page, 'fri').get('input').setValue(NOTE)
      await buttonLabelled(page, 'fri', 'Speichern')!.trigger('click')

      expect(card(page, 'fri').find('input').exists()).toBe(false)
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
      await card(page, 'fri').get('input').setValue('weg damit')
      await card(page, 'fri').get('input').trigger('keydown', { key: 'Escape' })
      expect(card(page, 'fri').find('input').exists()).toBe(false)
      expect(sent).toBeNull()

      await buttonLabelled(page, 'fri', 'Anmerkung')!.trigger('click')
      await card(page, 'fri').get('input').setValue('x')
      await card(page, 'fri').get('input').trigger('keydown', { key: 'Enter' })

      await vi.waitFor(() => expect(sent).toEqual({ value: 'maybe', note: 'x' }))
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
      expect(card(page, 'fri').get('input').element.value).toBe(NOTE)
      await card(page, 'fri').get('input').setValue('')
      await buttonLabelled(page, 'fri', 'Speichern')!.trigger('click')

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
      await card(page, 'fri').get('input').setValue(NOTE)
      await buttonLabelled(page, 'fri', 'Speichern')!.trigger('click')

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

      await clickButton(page.get('[role="toolbar"]').element, 'Termin festlegen')

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
