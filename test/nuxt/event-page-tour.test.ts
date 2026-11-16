import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppSheet from '~/components/AppSheet.vue'
import { refreshEvent } from '~/composables/useEventView'
import EventPage from '~/pages/e/[slug]/index.vue'
import { defaultSettings } from '~~/shared/settings'
import { TOUR_CALM_MS, TOUR_VERSION } from '~~/shared/tour'
import { kitty, signInAs } from './auth'
import { stubScreen, restoreScreen, view, viewWithSessions } from './event-page'
import { members, team } from './event-page-states'

// The Tour on the Event page (#647, spec #622, ADR 0017): it starts for a Member who has not seen it, after the page has been calm for a second,
// and ends unseen when the page stops being calm. The page behind takes no input while it shows. Finishing or skipping counts as seen at once
// and is saved in the background. The calm second is a real one.

const FIRST = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:34:00.000Z'

/** What `POST /api/me/tour-seen` received; one endpoint for the file, because the first handler registered for a path stays. */
const saves = { posts: [] as unknown[], fail: false }
registerEndpoint('/api/me/tour-seen', {
  method: 'POST',
  handler: async (event) => {
    const body = await readBody(event)
    saves.posts.push(body)
    if (saves.fail) throw createError({ statusCode: 500, statusMessage: 'Nope' })
    return { tourSeen: body.version }
  },
})

type Read = ReturnType<typeof view>
const poll = (slug: string, isHost = false, phase = 'poll'): Read => view(slug, [], { event: { phase, isHost }, inviteUrl: isHost ? null : `https://compies.test/join/${slug}` })
const running = (slug: string): Read => viewWithSessions(slug, [{ number: 1, startsAt: FIRST, startedAt: STARTED }], 0, {
  event: { phase: 'running', isHost: false },
  settings: defaultSettings(),
  teams: [team(1), team(2)],
  members: members(),
  runningSessionId: `session-${slug}-0`,
})

let testNumber = 0
/** An Event link whose read the test changes: `set` swaps the body, `gone` makes the next read answer 410. */
function serveEvent(build: (slug: string) => Read = slug => poll(slug)) {
  testNumber += 1
  const slug = `rundgang-${testNumber}`
  const state = { body: build(slug), gone: false }
  registerEndpoint(`/api/e/${slug}`, {
    method: 'GET',
    handler: () => {
      if (state.gone) throw createError({ statusCode: 410, statusMessage: 'Event deleted' })
      return state.body
    },
  })
  registerEndpoint(`/api/e/${slug}/activity`, { method: 'GET', handler: () => ({ entries: [], next: null }) })
  return {
    slug,
    set: (next: Read) => void (state.body = next),
    gone: () => void (state.gone = true),
    async read() {
      await refreshEvent(slug)
      await flushPromises()
    },
  }
}

type Page = Awaited<ReturnType<typeof mountSuspended>>
let page: Page | undefined

async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}`, attachTo: document.body })
  await flushPromises()
  return page
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Waits for the Tour to open: the page's calm second is a real one (fake timers hold `mountSuspended` up). */
async function shown() {
  await vi.waitFor(() => expect(tour()).not.toBeNull(), { timeout: 4000, interval: 50 })
}

/** Lets the page stay calm for longer than the calm second, so a Tour that was going to open has opened. */
async function past() {
  await sleep(TOUR_CALM_MS + 400)
  await flushPromises()
}

/** The Tour's box: the dialog on the popover layer (a sheet's dialog is teleported and has no such layer). */
const tour = () => document.querySelector<HTMLElement>('.layer-popover [role="dialog"]')
const tourTitle = () => tour()?.querySelector('h2')?.textContent?.trim()
const button = (label: string) => [...(tour()?.querySelectorAll('button') ?? [])].find(element => element.textContent?.trim() === label)!
async function click(label: string) {
  button(label).click()
  await flushPromises()
}
const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
const stored = () => useAuthUser().value?.tourSeen

beforeEach(() => {
  signInAs({ ...kitty, tourSeen: 0 })
  stubScreen(true)
  saves.posts = []
  saves.fail = false
  useState('open-layers').value = 0
})

afterEach(() => {
  page?.unmount()
  page = undefined
  restoreScreen()
  document.body.innerHTML = ''
})

describe('the start', () => {
  it('shows nothing before the calm second and the greeting after it', async () => {
    const { slug } = serveEvent()
    await mount(slug)

    expect(tour()).toBeNull()
    await sleep(TOUR_CALM_MS / 2)
    expect(tour()).toBeNull()

    await shown()
    expect(tourTitle()).toBe('Willkommen!')
    expect(tour()!.getAttribute('aria-modal')).toBe('true')
  })

  it('goes on to the end with „Weiter“ and is over with „Fertig“: seen at once, saved in the background', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    await shown()

    await click('Weiter')
    expect(tourTitle()).toBe('Das war’s')
    await click('Fertig')

    expect(tour()).toBeNull()
    expect(stored()).toBe(TOUR_VERSION)
    await vi.waitFor(() => expect(saves.posts).toEqual([{ version: TOUR_VERSION }]))
  })

  it.each([
    ['„Überspringen“', async () => click('Überspringen')],
    ['Escape', async () => {
      pressEscape()
      await flushPromises()
    }],
  ])('counts %s as seen the same way', async (_how, end) => {
    const { slug } = serveEvent()
    await mount(slug)
    await shown()

    await end()

    expect(tour()).toBeNull()
    expect(stored()).toBe(TOUR_VERSION)
    await vi.waitFor(() => expect(saves.posts).toEqual([{ version: TOUR_VERSION }]))
  })

  it('does not show again after a read of the Event or the calm second again', async () => {
    const served = serveEvent()
    await mount(served.slug)
    await shown()
    await click('Überspringen')

    await served.read()
    await past()

    expect(tour()).toBeNull()
  })

  it('closes at once when the save fails, and the client stays seen until the next page load', async () => {
    saves.fail = true
    const { slug } = serveEvent()
    await mount(slug)
    await shown()

    await click('Überspringen')

    expect(tour()).toBeNull()
    expect(stored()).toBe(TOUR_VERSION)
    await vi.waitFor(() => expect(saves.posts).toHaveLength(1))
    await flushPromises()
    expect(tour()).toBeNull()
  })

  it('never shows for a User who has seen this version', async () => {
    signInAs(kitty)
    const { slug } = serveEvent()
    await mount(slug)

    await past()

    expect(tour()).toBeNull()
  })

  it('starts for a Member whose number was set back to 0 by a reset', async () => {
    signInAs(kitty)
    const { slug } = serveEvent()
    useAuthUser().value = { ...useAuthUser().value!, tourSeen: 0 }
    await mount(slug)

    await shown()

    expect(tourTitle()).toBe('Willkommen!')
  })
})

describe('the page behind', () => {
  it('takes no input while it shows: header and main are inert, the dialog is not, and nothing is dimmed', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    await shown()

    expect(page!.get('header').element.closest('[inert]')).not.toBeNull()
    expect(page!.get('main').element.closest('[inert]')).not.toBeNull()
    expect(tour()!.closest('[inert]')).toBeNull()
    expect(document.querySelector('[data-testid="clip-backdrop"]')).toBeNull()
  })

  it('has the phone\'s tab bar inert as well', async () => {
    stubScreen(false)
    const { slug } = serveEvent()
    await mount(slug)
    await shown()

    expect(page!.get('nav[aria-label="Event"]').element.closest('[inert]')).not.toBeNull()
  })

  it('takes input again after it ended', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    await shown()
    await click('Überspringen')
    await flushPromises()

    expect(document.querySelectorAll('[inert]')).toHaveLength(0)
  })

  it('gives the focus back to where it was at the start, once the page takes input again', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    const avatar = page!.get('button[aria-label="Konto von Kitty"]').element as HTMLElement
    avatar.focus()
    await shown()
    expect(tour()!.contains(document.activeElement)).toBe(true)

    await click('Überspringen')
    await flushPromises()

    expect(document.activeElement).toBe(avatar)
  })
})

describe('when it does not start', () => {
  it('never shows for the Host', async () => {
    const { slug } = serveEvent(s => poll(s, true))
    await mount(slug)

    await past()

    expect(tour()).toBeNull()
  })

  it('does not show while a Session runs', async () => {
    const { slug } = serveEvent(running)
    await mount(slug)

    await past()

    expect(tour()).toBeNull()
  })

  it.each(['finished', 'archived'])('does not show in a %s Event', async (phase) => {
    const { slug } = serveEvent(s => poll(s, false, phase))
    await mount(slug)

    await past()

    expect(tour()).toBeNull()
  })

  it('waits while a sheet is open and starts one calm second after it closes', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    const invite = [...page!.element.querySelectorAll('button')].find(element => element.textContent?.trim() === 'Einladen')!
    invite.click()
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    await past()
    expect(tour()).toBeNull()

    document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    // The wait starts again at the close: half a calm second later it has not run out, which the first sheet's two seconds would have.
    await sleep(TOUR_CALM_MS / 2)
    expect(tour()).toBeNull()

    await shown()
    expect(tourTitle()).toBe('Willkommen!')
  })

  it('waits while the avatar menu is open', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    page!.get('button[aria-label="Konto von Kitty"]').element.click()
    await flushPromises()

    await past()

    expect(tour()).toBeNull()
  })

  it('does not show while the read has not arrived, or has failed', async () => {
    const served = serveEvent()
    served.gone()
    await mount(served.slug)

    await past()

    expect(tour()).toBeNull()
    expect(saves.posts).toEqual([])
  })

  it('starts after a Session that ran in this mount has ended, when it never started before', async () => {
    const served = serveEvent(running)
    await mount(served.slug)
    await past()
    expect(tour()).toBeNull()

    served.set(poll(served.slug))
    await served.read()
    await shown()

    expect(tourTitle()).toBe('Willkommen!')
  })
})

describe('when it ends by itself, unseen', () => {
  it('closes when a Session starts, saves nothing, and does not come back when the Session ends in this mount', async () => {
    const served = serveEvent()
    await mount(served.slug)
    await shown()
    expect(tourTitle()).toBe('Willkommen!')

    served.set(running(served.slug))
    await served.read()
    expect(tour()).toBeNull()
    expect(document.querySelectorAll('[inert]')).toHaveLength(0)

    served.set(poll(served.slug))
    await served.read()
    await past()

    expect(tour()).toBeNull()
    expect(saves.posts).toEqual([])
    expect(stored()).toBe(0)
  })

  it('closes when the Event is deleted, and saves nothing', async () => {
    const served = serveEvent()
    await mount(served.slug)
    await shown()
    expect(tour()).not.toBeNull()

    served.gone()
    await served.read()

    expect(tour()).toBeNull()
    expect(saves.posts).toEqual([])
    expect(stored()).toBe(0)
  })

  it('closes when the Event is finished', async () => {
    const served = serveEvent()
    await mount(served.slug)
    await shown()

    served.set(poll(served.slug, false, 'finished'))
    await served.read()

    expect(tour()).toBeNull()
    expect(saves.posts).toEqual([])
  })

  it('closes when a layer opens, as „Was ist neu“ or the Clip do, and saves nothing', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    await shown()
    // Any tracked layer opening counts, and the page behind is inert, so no User can open one: a sheet mounted open stands for them.
    const sheet = await mountSuspended(AppSheet, { props: { open: true, title: 'Irgendein Sheet' } })
    await flushPromises()

    expect(tour()).toBeNull()
    expect(saves.posts).toEqual([])
    expect(stored()).toBe(0)
    sheet.unmount()
  })

  it('saves nothing when the page is left with it open', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    await shown()
    expect(tour()).not.toBeNull()

    page!.unmount()
    page = undefined
    await flushPromises()

    expect(saves.posts).toEqual([])
    expect(stored()).toBe(0)
  })
})

describe('after it was over in this mount', () => {
  it('does not start again when the number is set back to 0, but does on a fresh mount', async () => {
    const served = serveEvent()
    await mount(served.slug)
    await shown()
    await click('Überspringen')
    expect(stored()).toBe(TOUR_VERSION)

    // What „Rundgang zurücksetzen“ does (#649): the same User, number 0 again.
    useAuthUser().value = { ...useAuthUser().value!, tourSeen: 0 }
    await past()
    expect(tour()).toBeNull()

    page!.unmount()
    await mount(served.slug)
    await shown()
    expect(tourTitle()).toBe('Willkommen!')
  })
})
