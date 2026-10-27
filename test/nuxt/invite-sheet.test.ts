import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import InviteSheet from '~/components/InviteSheet.vue'

// Each test gets its own slug: registerEndpoint keeps the first handler for a path.
let testNumber = 0
const url = (slug: string, token: string) => `http://localhost/e/${slug}-${token}`

function dialog() {
  return [...document.querySelectorAll('[role="dialog"]')].find(node => node.textContent?.includes('Leute einladen')) as HTMLElement | undefined
}

function button(label: string) {
  return [...(dialog()?.querySelectorAll('button') ?? [])].find(node => node.textContent?.includes(label)) as HTMLButtonElement | undefined
}

/** Holds the rotate button with the keyboard, which is how the hold is started and released in these tests. */
function press(target: HTMLElement) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

function release(target: HTMLElement) {
  target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
}

describe('InviteSheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useState('toasts').value = []
  })

  it('shows the Invite link in the sheet titled Leute einladen', async () => {
    testNumber += 1
    const link = url(`freitags-invite-${testNumber}`, 'AbCdEfGhIjKl')

    await mountSuspended(InviteSheet, { props: { open: true, slug: `freitags-invite-${testNumber}`, url: link } })

    expect(dialog()?.textContent).toContain('Leute einladen')
    expect(dialog()?.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(link)
  })

  it('renders nothing while closed', async () => {
    testNumber += 1

    await mountSuspended(InviteSheet, { props: { open: false, slug: `freitags-invite-${testNumber}`, url: url('x', 'AbCdEfGhIjKl') } })

    expect(dialog()).toBeUndefined()
  })

  it('asks for confirmation before rotating, and cancelling keeps the old link', async () => {
    testNumber += 1
    const slug = `freitags-invite-${testNumber}`
    const old = url(slug, 'AbCdEfGhIjKl')
    let rotations = 0
    registerEndpoint(`/api/e/${slug}/rotate`, {
      method: 'POST',
      handler: () => {
        rotations += 1
        return { inviteUrl: url(slug, 'ZzYyXxWwVvUu') }
      },
    })
    await mountSuspended(InviteSheet, { props: { open: true, slug, url: old } })

    button('Link erneuern')!.click()
    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Einladungslink erneuern?'))
    button('Abbrechen')!.click()

    await vi.waitFor(() => expect(dialog()?.textContent).not.toContain('Einladungslink erneuern?'))
    expect(dialog()?.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(old)
    expect(rotations).toBe(0)
  })

  it('rotates only after a one second hold, then shows the new link as Erneuert', async () => {
    testNumber += 1
    const slug = `freitags-invite-${testNumber}`
    const fresh = url(slug, 'ZzYyXxWwVvUu')
    let rotations = 0
    registerEndpoint(`/api/e/${slug}/rotate`, {
      method: 'POST',
      handler: () => {
        rotations += 1
        return { inviteUrl: fresh }
      },
    })
    const page = await mountSuspended(InviteSheet, { props: { open: true, slug, url: url(slug, 'AbCdEfGhIjKl') } })
    button('Link erneuern')!.click()
    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Einladungslink erneuern?'))

    press(button('Link erneuern')!)
    await new Promise(resolve => setTimeout(resolve, 500))
    release(button('Link erneuern')!)
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(rotations).toBe(0)

    press(button('Link erneuern')!)
    await vi.waitFor(() => expect(rotations).toBe(1), { timeout: 3000 })
    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Erneuert'))
    expect(dialog()?.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(fresh)
    expect(dialog()?.textContent).toContain('Neuer Link aktiv. Der alte führt jetzt ins Leere.')
    expect(page.emitted('changed')).toHaveLength(1)
  })

  it('keeps the old link and raises an error toast when rotating fails, and the hold can be held again', async () => {
    testNumber += 1
    const slug = `freitags-invite-${testNumber}`
    const old = url(slug, 'AbCdEfGhIjKl')
    let rotations = 0
    registerEndpoint(`/api/e/${slug}/rotate`, {
      method: 'POST',
      handler: () => {
        rotations += 1
        throw createError({ statusCode: 500, statusMessage: 'boom' })
      },
    })
    await mountSuspended(InviteSheet, { props: { open: true, slug, url: old } })
    button('Link erneuern')!.click()
    await vi.waitFor(() => expect(dialog()?.textContent).toContain('Einladungslink erneuern?'))
    const hold = button('Link erneuern')!

    press(hold)
    await vi.waitFor(() => expect(useState<{ text: string, tone: string }[]>('toasts').value.map(toast => toast.text)).toContain('Konnte nicht speichern. Nochmal versuchen?'), { timeout: 3000 })
    expect(dialog()?.textContent).not.toContain('Erneuert')

    // The same button, back to idle: the next hold rotates again.
    expect(button('Link erneuern')).toBe(hold)
    release(hold)
    press(hold)
    await vi.waitFor(() => expect(rotations).toBe(2), { timeout: 3000 })
    button('Abbrechen')!.click()
    await vi.waitFor(() => expect(dialog()?.querySelector<HTMLInputElement>('input[readonly]')?.value).toBe(old))
  })
})
