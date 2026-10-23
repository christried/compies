import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreatePage from '~/pages/neu.vue'
import { kitty, signInAs } from './auth'

const host = { ...kitty, canHost: true }
const created = { slug: 'freitags-zocken-k7q2', inviteUrl: 'http://localhost/s/freitags-zocken-k7q2-AbCdEfGhIjKl' }

// Each Slot is a DateTimeField group: its date input comes first, then its time input.
async function fillSlot(page: Awaited<ReturnType<typeof mountSuspended>>, index: number, date: string, time: string) {
  const [dateInput, timeInput] = page.findAll('[role="group"]')[index]!.findAll('input')
  const [year, month, day] = date.split('-')
  await dateInput!.setValue(`${day}.${month}.${year}`)
  await timeInput!.setValue(time.replace(':', ''))
}

describe('create a Session', () => {
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
    registerEndpoint('/api/s', {
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

    await vi.waitFor(() => expect(page.text()).toContain('Freitags-Zocken steht!'))
    expect(saved).toHaveBeenCalledWith({ name: 'Freitags-Zocken', dateMode: 'poll', slots: ['2090-10-30T20:30'] })
    expect((page.get('input[readonly]').element as HTMLInputElement).value).toBe(created.inviteUrl)
    expect(page.get('a[href="/s/freitags-zocken-k7q2"]').text()).toContain('Zur Umfrage')
  })

  it('posts a direct Date from the second mode', async () => {
    signInAs(host)
    const saved = vi.fn()
    registerEndpoint('/api/s', {
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
    expect(saved).toHaveBeenCalledWith({ name: 'Freitags-Zocken', dateMode: 'direct', startsAt: '2090-11-07T20:00' })
  })

  it('disables the CTA while the Session is being saved', async () => {
    signInAs(host)
    let finish = () => {}
    registerEndpoint('/api/s', {
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
