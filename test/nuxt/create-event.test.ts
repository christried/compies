import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreatePage from '~/pages/neu.vue'
import { kitty, signInAs } from './auth'

const host = { ...kitty, canHost: true }
const created = { slug: 'freitags-zocken-k7q2', inviteUrl: 'http://localhost/e/freitags-zocken-k7q2-AbCdEfGhIjKl' }

// Each Slot is a DateTimeField group: its date input comes first, then its time input.
async function fillSlot(page: Awaited<ReturnType<typeof mountSuspended>>, index: number, date: string, time: string) {
  const [dateInput, timeInput] = page.findAll('[role="group"]')[index]!.findAll('input')
  const [year, month, day] = date.split('-')
  await dateInput!.setValue(`${day}.${month}.${year}`)
  await timeInput!.setValue(time.replace(':', ''))
}

describe('create an Event', () => {
  beforeEach(() => {
    useState('toasts').value = []
  })

  it('shows the generic Construction page to a User without the Host permission', async () => {
    signInAs(kitty)

    const page = await mountSuspended(CreatePage, { route: '/neu' })

    expect(page.get('h1').text()).toBe('Hier wird noch gebaut.')
    expect(page.find('input').exists()).toBe(false)
  })

  it('keeps the header navigation but leaves out the phone tab bar on the form (screen M2)', async () => {
    signInAs(host)

    const page = await mountSuspended(CreatePage, { route: '/neu' })

    expect(page.findAll('nav[aria-label="Hauptnavigation"]')).toHaveLength(1)
    expect(page.get('header').find('nav[aria-label="Hauptnavigation"]').exists()).toBe(true)
  })

  it('starts with one Slot in poll mode and offers to add more', async () => {
    signInAs(host)

    const page = await mountSuspended(CreatePage, { route: '/neu' })

    expect(page.get('h1').text()).toBe('Erst mal: Wann zocken wir?')
    expect(page.findAll('[role="group"]')).toHaveLength(1)
    expect(page.text()).toContain('Termin vorschlagen')
  })

  it('hides the add button at 8 Slots', async () => {
    signInAs(host)
    const page = await mountSuspended(CreatePage, { route: '/neu' })

    for (let i = 0; i < 7; i++) await page.findAll('button').find(button => button.text().includes('Termin vorschlagen'))!.trigger('click')

    expect(page.findAll('[role="group"]')).toHaveLength(8)
    expect(page.text()).not.toContain('Termin vorschlagen')
  })

  it('shows an inline error for a Slot in the past, and disables the CTA with its reason', async () => {
    signInAs(host)
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')

    await fillSlot(page, 0, '2001-01-01', '20:00')

    expect(page.get('[role="group"]').text()).toContain('Der Termin liegt in der Vergangenheit.')
    const cta = page.get('button[type="submit"]')
    expect(cta.attributes('aria-disabled')).toBe('true')
    expect(page.get(`[id="${cta.attributes('aria-describedby')}"]`).text()).toBe('Erst den Termin in der Vergangenheit ändern.')
  })

  it('rejects two Slots in the same minute', async () => {
    signInAs(host)
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.findAll('button').find(button => button.text().includes('Termin vorschlagen'))!.trigger('click')

    await fillSlot(page, 0, '2090-10-30', '20:30')
    await fillSlot(page, 1, '2090-10-30', '20:30')

    expect(page.findAll('[role="group"]')[1]!.text()).toContain('Diesen Termin gibt es schon.')
    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
  })

  it('posts the poll and shows the success card with the Invite link and the way to the poll', async () => {
    signInAs(host)
    const saved = vi.fn()
    registerEndpoint('/api/e', {
      method: 'POST',
      handler: async (event) => {
        saved(await readBody(event))
        return created
      },
    })
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    await fillSlot(page, 0, '2090-10-30', '20:30')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.text()).toContain('Umfrage für Freitags-Zocken läuft!'))
    expect(saved).toHaveBeenCalledWith({ name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: ['2090-10-30T20:30'] })
    expect((page.get('input[readonly]').element as HTMLInputElement).value).toBe(created.inviteUrl)
    expect(page.get('a[href="/e/freitags-zocken-k7q2"]').text()).toContain('Zur Umfrage')
  })

  it('posts a direct Date from the second mode', async () => {
    signInAs(host)
    const saved = vi.fn()
    registerEndpoint('/api/e', {
      method: 'POST',
      handler: async (event) => {
        saved(await readBody(event))
        return created
      },
    })
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    await page.findAll('[role="radio"]')[1]!.trigger('click')
    await fillSlot(page, 0, '2090-11-07', '20:00')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(saved).toHaveBeenCalled())
    expect(saved).toHaveBeenCalledWith({ name: 'Freitags-Zocken', dateMode: 'direct', sessions: 1, startsAt: ['2090-11-07T20:00'] })
  })

  it('starts with one Session and counts up to 8', async () => {
    signInAs(host)
    const page = await mountSuspended(CreatePage, { route: '/neu' })

    expect(page.get('output').text()).toBe('1')
    for (let i = 0; i < 9; i++) await page.findAll('button').find(button => button.attributes('aria-label') === 'Eine Session mehr')?.trigger('click')

    expect(page.get('output').text()).toBe('8')
    expect(page.get('button[aria-label="Eine Session mehr"]').attributes('disabled')).toBeDefined()
  })

  it('asks for at least as many Slots as Sessions in poll mode', async () => {
    signInAs(host)
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    await page.get('button[aria-label="Eine Session mehr"]').trigger('click')
    await fillSlot(page, 0, '2090-10-30', '20:30')

    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
    expect(page.text()).toContain('Schlag mindestens 2 Termine vor.')
  })

  it('shows one date and time row per Session in direct mode and posts them all', async () => {
    signInAs(host)
    const saved = vi.fn()
    registerEndpoint('/api/e', {
      method: 'POST',
      handler: async (event) => {
        saved(await readBody(event))
        return created
      },
    })
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    await page.findAll('[role="radio"]')[1]!.trigger('click')
    await page.get('button[aria-label="Eine Session mehr"]').trigger('click')
    expect(page.findAll('[role="group"]')).toHaveLength(2)
    expect(page.findAll('[role="group"]')[1]!.attributes('aria-label')).toBe('Termin 2')

    await fillSlot(page, 0, '2090-11-07', '20:00')
    await fillSlot(page, 1, '2090-11-08', '19:00')
    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(saved).toHaveBeenCalled())
    expect(saved).toHaveBeenCalledWith({ name: 'Freitags-Zocken', dateMode: 'direct', sessions: 2, startsAt: ['2090-11-07T20:00', '2090-11-08T19:00'] })
  })

  it('asks for a Date in every direct row, and says when two rows share one', async () => {
    signInAs(host)
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    await page.findAll('[role="radio"]')[1]!.trigger('click')
    await page.get('button[aria-label="Eine Session mehr"]').trigger('click')

    await fillSlot(page, 0, '2090-11-07', '20:00')
    expect(page.text()).toContain('Bitte Datum und Uhrzeit ausfüllen.')

    await fillSlot(page, 1, '2090-11-07', '20:00')
    expect(page.findAll('[role="group"]')[1]!.text()).toContain('Zwei Sessions können nicht am selben Termin sein.')
    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
  })

  it('says "steht" with the plural text after a direct Event with several Sessions', async () => {
    signInAs(host)
    registerEndpoint('/api/e', { method: 'POST', handler: () => created })
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    await page.findAll('[role="radio"]')[1]!.trigger('click')
    await page.get('button[aria-label="Eine Session mehr"]').trigger('click')
    await fillSlot(page, 0, '2090-11-07', '20:00')
    await fillSlot(page, 1, '2090-11-08', '19:00')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.text()).toContain('Freitags-Zocken steht!'))
    expect(page.text()).toContain('Die Termine stehen.')
    expect(page.get('a[href="/e/freitags-zocken-k7q2"]').text()).toContain('Zum Event')
  })

  it('disables the CTA while the Event is being saved', async () => {
    signInAs(host)
    let finish = () => {}
    registerEndpoint('/api/e', {
      method: 'POST',
      handler: () => new Promise((resolve) => {
        finish = () => resolve(created)
      }),
    })
    const page = await mountSuspended(CreatePage, { route: '/neu' })
    await page.get('input[type="text"]').setValue('Freitags-Zocken')
    await fillSlot(page, 0, '2090-10-30', '20:30')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(page.get('button[type="submit"]').text()).toContain('Speichert'))
    expect(page.get('button[type="submit"]').attributes('aria-disabled')).toBe('true')
    finish()
  })
})
