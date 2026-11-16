import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
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
// and is saved in the background. The calm second is a real one. A Member's run is the greeting, the head of the page and the end (#460); the phone's
// Standings view has no head, and Compibert's face loads GSAP only while the Tour shows (ADR 0015, ADR 0017).

// GSAP is requested through `loadGsap` (its own chunk): the request is what the page is pinned to, not what the rig does with it.
const gsapRequests = vi.hoisted(() => ({ asked: vi.fn() }))
mockNuxtImport('loadGsap', async () => {
  const { loadGsap: real } = await vi.importActual<typeof import('~/utils/gsap')>('~/utils/gsap')
  return async () => {
    gsapRequests.asked()
    return real()
  }
})

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

/** The Tour's box: the dialog in the Tour's layer (a sheet's dialog is teleported and is not in it). */
const tour = () => document.querySelector<HTMLElement>('[data-tour-layer] [role="dialog"]')
const tourTitle = () => tour()?.querySelector('h2')?.textContent?.trim()
const button = (label: string) => [...(tour()?.querySelectorAll('button') ?? [])].find(element => element.textContent?.trim() === label)!
async function click(label: string) {
  button(label).click()
  await flushPromises()
}
/** The texts of the step shown: its title and its text. */
const stepText = () => ({ title: tourTitle(), text: tour()?.querySelector('p')?.textContent?.trim() ?? '' })
/** Goes on with „Weiter“ to the last step. */
async function walk() {
  while (button('Weiter')) await click('Weiter')
}
/** The titles of the whole run, from the step shown, walked with „Weiter“; the texts of each in `seen`. */
async function titles(seen: { title?: string, text: string }[] = []) {
  seen.push(stepText())
  while (button('Weiter')) {
    await click('Weiter')
    seen.push(stepText())
  }
  return seen.map(step => step.title)
}
/** The step's count, „3 von 8“. */
const count = () => [...tour()!.querySelectorAll('span')].map(element => element.textContent?.trim()).find(text => /^\d+ von \d+$/.test(text ?? ''))
/** The window's width as `documentElement.clientWidth` says it (happy-dom has no layout). */
const windowWidth = (width: number) => Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => width })
const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
const stored = () => useAuthUser().value?.tourSeen

const realWidth = Object.getOwnPropertyDescriptor(document.documentElement, 'clientWidth')
const ownAnimate = Element.prototype.animate

beforeEach(() => {
  signInAs({ ...kitty, tourSeen: 0 })
  stubScreen(true)
  saves.posts = []
  saves.fail = false
  gsapRequests.asked.mockClear()
  useState('open-layers').value = 0
  // The motion is pinned in tour-layer.test.ts: without `Element.animate` (happy-dom has one of its own, with real durations) a step changes at once and
  // the layer is gone as soon as the page closes it.
  Reflect.deleteProperty(Element.prototype, 'animate')
  // happy-dom has no layout: a window 1024 px wide, as `innerWidth` says.
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, get: () => 1024 })
})

afterEach(() => {
  Element.prototype.animate = ownAnimate
  vi.restoreAllMocks()
  if (realWidth) Object.defineProperty(document.documentElement, 'clientWidth', realWidth)
  else Reflect.deleteProperty(document.documentElement, 'clientWidth')
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
    expect(tourTitle()).toBe('Das Event')
    await walk()
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

describe('the run on the page (#460)', () => {
  const spotlight = () => document.querySelector<HTMLElement>('[data-tour-spotlight]')!

  it('points at the head of the page on its second step: the hole is its rect plus 8 px, and the page is dark on the greeting', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    await shown()
    expect([spotlight().style.width, spotlight().style.height]).toEqual(['2px', '2px'])

    // From md up the phone's tab bar is `display: none`: happy-dom has no CSS to say so.
    ;(page!.get('[data-tour-edge="tabs"]').element as HTMLElement).checkVisibility = () => false
    const head = page!.get('[data-tour="head"]').element as HTMLElement
    head.getBoundingClientRect = () => ({ left: 40, top: 20, width: 300, height: 80, x: 40, y: 20, right: 340, bottom: 100, toJSON() {} }) as DOMRect
    await click('Weiter')

    await vi.waitFor(() => expect(spotlight().style.width).toBe('316px'))
    expect([spotlight().style.left, spotlight().style.top, spotlight().style.height]).toEqual(['32px', '12px', '96px'])
    expect(tourTitle()).toBe('Das Event')
    await walk()
    expect(tourTitle()).toBe('Das war’s')
    await vi.waitFor(() => expect(spotlight().style.width).toBe('2px'))
  })

  it('has no head step on the phone\'s Standings view: the run is the greeting, the tab bar, the sound button and the end (#648)', async () => {
    windowWidth(390)
    stubScreen(false)
    const { slug } = serveEvent()
    await mount(slug)
    const tabs = [...page!.get('nav[aria-label="Event"]').element.querySelectorAll('button')]
    tabs.find(item => item.textContent?.trim() === 'Tabelle')!.click()
    await flushPromises()
    expect(page!.find('[data-tour="head"]').exists()).toBe(false)

    await shown()

    expect(await titles()).toEqual(['Willkommen!', 'Aktivität', 'Ton', 'Das war’s'])
  })

  it('marks the Host\'s head the same way, so the marker is the page\'s and not the Tour\'s', async () => {
    const { slug } = serveEvent(s => poll(s, true))
    await mount(slug)

    expect(page!.find('[data-tour="head"]').exists()).toBe(true)
  })

  it('requests GSAP only once the Tour shows: not before the calm second, not at all for a Member who has seen it', async () => {
    const { slug } = serveEvent()
    await mount(slug)
    await sleep(TOUR_CALM_MS / 2)
    expect(gsapRequests.asked).not.toHaveBeenCalled()

    await shown()
    await vi.waitFor(() => expect(gsapRequests.asked).toHaveBeenCalled())
  })

  it('requests no GSAP on a page whose Member has seen the Tour', async () => {
    signInAs(kitty)
    const { slug } = serveEvent()
    await mount(slug)

    await past()

    expect(tour()).toBeNull()
    expect(gsapRequests.asked).not.toHaveBeenCalled()
  })
})

// The steps after the head (#648): the Date poll, the Game board with its three texts, „So wird gespielt“, the Aktivität panel (the tab on a phone) and the
// sound button. Each Phase of the Event has its own run, walked with „Weiter“ as a Member reads it.
describe('the stations of the run (#648)', () => {
  const ENDED = '2026-10-30T22:12:00.000Z'
  const joined = (slug: string) => `https://compies.test/join/${slug}`
  /** An Event with its settings and two teams, as a set-up Event reads. */
  const setUp = { settings: defaultSettings(), teams: [team(1), team(2)], members: members() }
  const pollSetUp = (slug: string, overrides: Parameters<typeof view>[2] = {}): Read => view(slug, [], { event: { phase: 'poll', isHost: false }, inviteUrl: joined(slug), ...setUp, ...overrides })
  const dateSet = (slug: string): Read => viewWithSessions(slug, [{ number: 1, startsAt: FIRST }], 0, { event: { phase: 'date_set', isHost: false }, teamChoiceOpen: true, ...setUp })
  const between = (slug: string, more: { number: number | null, startsAt: string | null }[] = []): Read => viewWithSessions(slug, [{ number: 1, startsAt: FIRST, startedAt: STARTED, endedAt: ENDED }, ...more], more.length, {
    event: { phase: 'running', isHost: false },
    runningSessionId: null,
    ...setUp,
  })

  async function run(build: (slug: string) => Read) {
    const { slug } = serveEvent(build)
    await mount(slug)
    await shown()
    const seen: { title?: string, text: string }[] = []
    const found = await titles(seen)
    return { titles: found, texts: seen.map(step => step.text) }
  }

  it('walks the poll Phase: the poll, the Game board, „So wird gespielt“, the panel and the sound button, eight steps in all', async () => {
    const { slug } = serveEvent(pollSetUp)
    await mount(slug)
    await shown()
    expect(count()).toBe('1 von 8')
    const seen: { title?: string, text: string }[] = []
    const found = await titles(seen)
    const texts = seen.map(step => step.text)

    expect(found).toEqual(['Willkommen!', 'Das Event', 'Terminumfrage', 'Spielbrett', 'So wird gespielt', 'Aktivität', 'Ton', 'Das war’s'])
    expect(texts[2]).toContain('Ja, Meh oder Nein')
    expect(texts[3]).toContain('Dein Team wählst du')
    expect(texts[4]).not.toMatch(/\d/)
    expect(texts[5]).toBe('Hier steht, was im Event passiert: wer beigetreten ist, welche Spiele drankommen und wie sie ausgehen.')
    expect(texts[6]).toBe('Hier schaltest du den Ton an oder aus.')
    expect(count()).toBe('8 von 8')
  })

  it('has no „So wird gespielt“ step for an Event without settings', async () => {
    const { titles: found } = await run(slug => poll(slug))

    expect(found).toEqual(['Willkommen!', 'Das Event', 'Terminumfrage', 'Spielbrett', 'Aktivität', 'Ton', 'Das war’s'])
  })

  it('has no poll step for an Event without an open Slot', async () => {
    const { titles: found } = await run(slug => pollSetUp(slug, { slots: [] }))

    expect(found).not.toContain('Terminumfrage')
    expect(found).toContain('Spielbrett')
  })

  it('has no poll step once the Date is set, and the Game board then says the choice is open', async () => {
    const { titles: found, texts } = await run(dateSet)

    expect(found).toEqual(['Willkommen!', 'Das Event', 'Spielbrett', 'So wird gespielt', 'Aktivität', 'Ton', 'Das war’s'])
    expect(texts[2]).toContain('Such dir jetzt ein Team aus')
  })

  it('says between two Sessions that the teams are fixed since the start', async () => {
    const { titles: found, texts } = await run(slug => between(slug))

    expect(found).toContain('Spielbrett')
    expect(texts[found.indexOf('Spielbrett')]).toContain('Die Teams stehen seit dem Start fest')
    expect(found).not.toContain('Terminumfrage')
  })

  it('keeps the poll step between two Sessions while another Session waits for its Date', async () => {
    const { titles: found } = await run(slug => between(slug, [{ number: null, startsAt: null }]))

    expect(found).toContain('Terminumfrage')
    expect(found).toContain('Spielbrett')
  })

  it('has the tab bar\'s step on a phone in place of the panel\'s', async () => {
    windowWidth(390)
    stubScreen(false)
    const { titles: found, texts } = await run(pollSetUp)

    expect(found).toEqual(['Willkommen!', 'Das Event', 'Terminumfrage', 'Spielbrett', 'So wird gespielt', 'Aktivität', 'Ton', 'Das war’s'])
    expect(texts[5]).toContain('Unten findest du den Reiter')
  })

  it('points the phone\'s poll step at the first card: the hole is its rect plus 6 px', async () => {
    windowWidth(390)
    stubScreen(false)
    const { slug } = serveEvent(pollSetUp)
    await mount(slug)
    await shown()
    // happy-dom has no layout: the tab bar stands at the window's bottom, so the hole is not clipped to nothing.
    ;(page!.get('[data-tour-edge="tabs"]').element as HTMLElement).getBoundingClientRect = () => ({ left: 0, top: 700, width: 390, height: 68, x: 0, y: 700, right: 390, bottom: 768, toJSON() {} }) as DOMRect
    const card = page!.get('[data-tour="poll-card"]').element as HTMLElement
    card.getBoundingClientRect = () => ({ left: 14, top: 300, width: 200, height: 100, x: 14, y: 300, right: 214, bottom: 400, toJSON() {} }) as DOMRect

    await click('Weiter')
    await click('Weiter')

    expect(tourTitle()).toBe('Terminumfrage')
    const hole = document.querySelector<HTMLElement>('[data-tour-spotlight]')!
    await vi.waitFor(() => expect([hole.style.left, hole.style.width, hole.style.height]).toEqual(['8px', '212px', '112px']))
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
