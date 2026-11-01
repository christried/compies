import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import WhatsNewDialog from '~/components/WhatsNewDialog.vue'
import ImpressumPage from '~/pages/impressum.vue'
import type { AuthUser } from '~~/shared/auth'
import { kitty, signInAs } from './auth'

// „Was ist neu“ after a new Release (#184). A fixture changelog instead of the real CHANGELOG.md, so the
// assertions don't move with every Release.
const { fixture } = vi.hoisted(() => ({
  fixture: `# Changelog

## [Unreleased]

## [1.4.0] - 2026-11-20 – Teams

### Neu

- Teams auf dem Spielbrett.

## [1.3.0] - 2026-11-02 – Spielvorbereitung

### Neu

- Spiele für den Abend auswählen.

## [1.2.0] - 2026-10-24 – Mehr Termine

### Neu

- Mehr Termine.
`,
}))

vi.mock('~/utils/changelog', async (importOriginal) => {
  const { parseChangelog } = await import('~~/shared/changelog')
  return { ...await importOriginal<object>(), RELEASES: parseChangelog(fixture).releases }
})

const posted: unknown[] = []
registerEndpoint('/api/me/news-seen', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody<{ version: string }>(event)
    posted.push(body)
    return { newsSeen: body.version }
  },
})

// The dialog next to a page with a footer, as app.vue mounts them.
const App = defineComponent({ render: () => [h(ImpressumPage), h(WhatsNewDialog)] })

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
const closeButton = () => [...dialog()?.querySelectorAll('button') ?? []].find(button => button.textContent?.includes('Schließen'))
const settle = async () => {
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 20))
}

const mounted: { unmount: () => void }[] = []
async function visit(user: Partial<AuthUser>, route = '/impressum') {
  signInAs({ ...kitty, ...user })
  const page = await mountSuspended(App, { route })
  mounted.push(page)
  return page
}

describe('Was ist neu', () => {
  beforeEach(() => {
    posted.length = 0
    // Run the "when idle" callback at once, so the tests don't wait for the browser.
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => setTimeout(callback, 0))
  })

  afterEach(() => {
    // Teleported content outlives its test unless it is unmounted.
    for (const page of mounted.splice(0)) page.unmount()
  })

  it('shows a User who saw 1.2.0 the Releases since, newest first', async () => {
    await visit({ newsSeen: '1.2.0' })

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.getAttribute('aria-modal')).toBe('true')
    expect(dialog()!.querySelector('h2')!.textContent).toBe('Was ist neu')
    const headings = [...dialog()!.querySelectorAll('section[id] h2')].map(h2 => h2.textContent)
    expect(headings).toEqual([expect.stringMatching(/1\.4\.0.*Teams/), expect.stringMatching(/1\.3\.0.*Spielvorbereitung/)])
    expect(dialog()!.querySelector('a[href="/neuigkeiten"]')!.textContent).toContain('Alle Neuigkeiten')
  })

  it('shows a User who has seen nothing only the newest Release', async () => {
    await visit({ newsSeen: null })

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect([...dialog()!.querySelectorAll('section[id] h2')]).toHaveLength(1)
    expect(dialog()!.textContent).toContain('Teams')
  })

  it('shows nothing to a User at the newest Release', async () => {
    await visit({ newsSeen: '1.4.0' })
    await settle()

    expect(dialog()).toBeNull()
  })

  it('shows nothing signed out', async () => {
    signInAs(null)
    mounted.push(await mountSuspended(App, { route: '/impressum' }))
    await settle()

    expect(dialog()).toBeNull()
  })

  it('stays away from Neuigkeiten itself', async () => {
    signInAs({ ...kitty, newsSeen: '1.2.0' })
    mounted.push(await mountSuspended(WhatsNewDialog, { route: '/neuigkeiten' }))
    await settle()

    expect(dialog()).toBeNull()
  })

  it('stays away from profile setup', async () => {
    signInAs({ ...kitty, displayName: null, newsSeen: '1.2.0' })
    mounted.push(await mountSuspended(WhatsNewDialog, { route: '/einrichten' }))
    await settle()

    expect(useRoute().path).toBe('/einrichten')
    expect(dialog()).toBeNull()
  })

  it('shows only the newest Release to a User whose stored version is above every Release (#242)', async () => {
    await visit({ newsSeen: '2.0.0' })

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect([...dialog()!.querySelectorAll('section[id] h2')]).toHaveLength(1)
    expect(dialog()!.textContent).toContain('Teams')
  })

  it('replaces that version with the newest Release when the pop-up is closed (#242)', async () => {
    await visit({ newsSeen: '2.0.0' })
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    closeButton()!.click()
    await settle()

    expect(dialog()).toBeNull()
    expect(posted).toEqual([{ version: '1.4.0' }])
    expect(useAuthUser().value?.newsSeen).toBe('1.4.0')
  })

  it('tells the server the newest Release is seen when the close button is pressed', async () => {
    await visit({ newsSeen: '1.2.0' })
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    closeButton()!.click()
    await settle()

    expect(dialog()).toBeNull()
    expect(posted).toEqual([{ version: '1.4.0' }])
  })

  it('does the same on Escape', async () => {
    await visit({ newsSeen: '1.2.0' })
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()

    expect(dialog()).toBeNull()
    expect(posted).toEqual([{ version: '1.4.0' }])
  })

  it('does the same on the link to all news', async () => {
    await visit({ newsSeen: '1.2.0' })
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    dialog()!.querySelector<HTMLElement>('a[href="/neuigkeiten"]')!.click()
    await settle()

    expect(dialog()).toBeNull()
    expect(posted).toEqual([{ version: '1.4.0' }])
  })

  it('does the same on a click on the dimmed page behind it', async () => {
    await visit({ newsSeen: '1.2.0' })
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    dialog()!.previousElementSibling!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()

    expect(dialog()).toBeNull()
    expect(posted).toEqual([{ version: '1.4.0' }])
  })

  it('takes the NEU chip off the footer once the dialog is closed', async () => {
    const page = await visit({ newsSeen: '1.2.0' })
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    const link = () => page.get('footer a[href="/neuigkeiten"]')
    expect(link().attributes('aria-label')).toBe('Version 1.4.0, neu')

    closeButton()!.click()
    await settle()

    expect(link().attributes('aria-label')).toBeUndefined()
  })
})
