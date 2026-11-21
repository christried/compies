import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, Suspense } from 'vue'
import { renderToString } from 'vue/server-renderer'
import ClipOverlay from '~/components/ClipOverlay.vue'
import HostDock from '~/components/HostDock.vue'
import VetoBar from '~/components/VetoBar.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { ClipView, WheelView } from '~~/shared/stage'
import type { RoundGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, viewWithSessions } from './event-page'

// The synced clip on the Event page (#230): the overlay is mounted when the Event read carries a clip, with the Host's
// „Clip überspringen“ for the Host only, which POSTs the skip. The overlay's own behaviour is in clip-overlay.test.ts.

const FIRST = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'

const kart: RoundGame = { id: 'g-kart', name: 'Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [], price: null }

/** A clip that is running now by the page's own clock (it is not synced in a test): started a second ago, 30 s long. */
function runningClip(): ClipView {
  const now = Date.now()
  return { drawId: 'd1', startAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 29_000).toISOString(), game: kart }
}

/** The Veto bar's wheel with no window and no own part: the bar is mounted, and it does not show itself (#584). */
const idleWheel: WheelView = { count: 2, slices: null, spin: null, vetoes: { left: [0, 0], own: null, revealed: null, draw: null } }

function serveRunning({ host, clip, wheel = null }: { host: boolean, clip: ClipView | null, wheel?: WheelView | null }) {
  return serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: host, phase: 'running' },
    settings: defaultSettings(),
    runningSessionId: `session-${slug}-0`,
    clip,
    wheel,
  }))
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined

beforeEach(() => {
  signInAs(kitty)
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
})

describe('the clip on the Event page', () => {
  it('shows the overlay to a Member while the Event read carries a clip, without the Host\'s skip', async () => {
    const { slug } = serveRunning({ host: false, clip: runningClip() })

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    const overlay = page.get('section[aria-label="Clip: Kart"]')
    expect(overlay.text()).toContain('Kart')
    expect(overlay.text()).not.toContain('Clip überspringen')
  })

  it('shows no overlay without a clip', async () => {
    const { slug } = serveRunning({ host: false, clip: null })

    page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(page.find('section[aria-label^="Clip"]').exists()).toBe(false)
  })

  it('sends the Host\'s skip to the clip route, and the Event is read again', async () => {
    const skips: string[] = []
    const served = serveRunning({ host: true, clip: runningClip() })
    registerEndpoint(`/api/e/${served.slug}/clip/skip`, { method: 'POST', handler: () => {
      skips.push('skip')
      served.set(viewWithSessions(served.slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
        event: { isHost: true, phase: 'running' }, settings: defaultSettings(), runningSessionId: `session-${served.slug}-0`, clip: null,
      }))
      return { drawId: 'd1' }
    } })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })

    const skip = [...page.element.querySelectorAll('section[aria-label="Clip: Kart"] button')].find((button: Element) => button.textContent?.trim() === 'Clip überspringen')
    expect(skip).toBeDefined()
    skip!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(skips).toEqual(['skip']))
    await flushPromises()

    await vi.waitFor(() => expect(page!.find('section[aria-label^="Clip"]').exists()).toBe(false))
  })

  // #261 (#230): the skip removes the whole overlay, so its own leave never runs; the Transition around it on the page runs it, on
  // every page. The Transition is stubbed in this environment, so the removal is instant here and the fade is the browser check's.
  it('wraps the overlay in a Transition with the closing fade, so a skip fades it out on every page', async () => {
    const served = serveRunning({ host: true, clip: runningClip() })
    registerEndpoint(`/api/e/${served.slug}/clip/skip`, { method: 'POST', handler: () => {
      served.set(viewWithSessions(served.slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
        event: { isHost: true, phase: 'running' }, settings: defaultSettings(), runningSessionId: `session-${served.slug}-0`, clip: null,
      }))
      return { drawId: 'd1' }
    } })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })

    const transitions: VueWrapper[] = page.findAllComponents({ name: 'Transition' })
    const fade = transitions.find(transition => transition.findComponent(ClipOverlay).exists())
    expect(fade?.props()).toMatchObject({ leaveActiveClass: 'transition-opacity dur-base ease-in', leaveToClass: 'opacity-0' })

    const skip = [...page.element.querySelectorAll('section[aria-label="Clip: Kart"] button')].find((button: Element) => button.textContent?.trim() === 'Clip überspringen')
    skip!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await vi.waitFor(() => expect(page!.find('section[aria-label^="Clip"]').exists()).toBe(false))
  })

  // #584: the Clip takes the left column (sideways) only while the Veto bar says it shows; the page passes that on as the flag.
  it('takes the left column beside the Veto bar only while the bar says it shows (#584)', async () => {
    const { slug } = serveRunning({ host: false, clip: runningClip(), wheel: idleWheel })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    const overlay = () => page!.element.querySelector('section[aria-label="Clip: Kart"]') as HTMLElement

    expect(page.findComponent(VetoBar).exists()).toBe(true)
    expect(overlay().classList.contains('sideways:left-2.5')).toBe(false)

    page.findComponent(VetoBar).vm.$emit('shown', true)
    await flushPromises()
    expect(overlay().classList.contains('sideways:left-2.5')).toBe(true)

    page.findComponent(VetoBar).vm.$emit('shown', false)
    await flushPromises()
    expect(overlay().classList.contains('sideways:left-2.5')).toBe(false)
  })
})

// #587: while a Clip shows on this device, the rest of the page is dark and takes no input. The seams are what happy-dom can observe: the
// backdrop's presence, what is `inert` (no click, tap, key or focus), and which elements stay outside it.
describe('the backdrop behind the clip (#587)', () => {
  const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'
  const backdrop = () => page!.element.querySelector('[data-testid="clip-backdrop"]')
  const html = () => document.documentElement.classList
  const covered = (element: Element | null) => element !== null && element.closest('[inert]') !== null
  const lit = () => [...page!.element.querySelectorAll(FOCUSABLE)].filter(element => element.closest('[inert]') === null)
  const header = () => page!.element.querySelector('header')
  const clipSection = () => page!.element.querySelector('section[aria-label="Clip: Kart"]')
  const veto = () => page!.element.querySelector('[data-testid="veto-bar"]')
  const dock = () => page!.findComponent(HostDock).element
  const buttonNamed = (root: Element | null, name: string) => [...(root?.querySelectorAll('button') ?? [])].find(button => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === name)
  /** A Player of a Party with an open Veto window (as veto-bar.test.ts builds one). */
  const openWindow = (): WheelView => {
    const now = Date.now()
    const halo = { ...kart, id: 'g1', name: 'Halo' }
    return {
      count: 3,
      slices: null,
      spin: null,
      vetoes: {
        left: [1, 1],
        own: { team: 1, cast: false, rejection: null },
        revealed: null,
        draw: { drawId: 'd1', kind: 'spin', stopAt: new Date(now - 1000).toISOString(), vetoEndsAt: new Date(now + 60_000).toISOString(), game: halo },
      },
    }
  }
  const serveWithSkip = (clip: ClipView) => {
    const served = serveRunning({ host: true, clip })
    registerEndpoint(`/api/e/${served.slug}/clip/skip`, { method: 'POST', handler: () => {
      served.set(viewWithSessions(served.slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
        event: { isHost: true, phase: 'running' }, settings: defaultSettings(), runningSessionId: `session-${served.slug}-0`, clip: null,
      }))
      return { drawId: 'd1' }
    } })
    return served
  }

  afterEach(() => {
    html().remove('overflow-hidden')
  })

  it('darkens the page for the Host and leaves the clip, its buttons and the dock usable', async () => {
    const { slug } = serveRunning({ host: true, clip: runningClip() })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(backdrop()).not.toBeNull()
    expect(html().contains('overflow-hidden')).toBe(true)
    for (const region of ['header', 'main', 'aside', 'nav[aria-label="Event"]', 'a[href="#stage"]']) {
      const element = page.element.querySelector(region)
      expect(element, region).not.toBeNull()
      expect(covered(element), region).toBe(true)
    }
    // The connection banner's wrapper sits right under the header and is covered too.
    expect(covered(header()!.nextElementSibling)).toBe(true)
    expect(covered(clipSection())).toBe(false)
    expect(covered(buttonNamed(clipSection(), 'Clip überspringen') ?? null)).toBe(false)
    expect(buttonNamed(clipSection(), 'Clip überspringen')).toBeDefined()
    expect(buttonNamed(clipSection(), 'Für mich schließen')).toBeDefined()
    expect(dock().querySelector('button')).not.toBeNull()
    expect(covered(dock())).toBe(false)

    const inside = lit()
    expect(inside.length).toBeGreaterThan(0)
    for (const element of inside) expect(clipSection()!.contains(element) || veto()?.contains(element) || dock().contains(element), element.outerHTML.slice(0, 80)).toBe(true)
    expect(inside).toContain(buttonNamed(clipSection(), 'Clip überspringen'))
    expect(inside).toContain(buttonNamed(clipSection(), 'Für mich schließen'))
    expect(inside.some(element => dock().contains(element) && element.tagName === 'BUTTON')).toBe(true)
  })

  it('leaves a Player of a Party the Veto bar and its hold button, and has no skip and no dock', async () => {
    const { slug } = serveRunning({ host: false, clip: runningClip(), wheel: openWindow() })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await flushPromises()

    expect(backdrop()).not.toBeNull()
    expect(veto()).not.toBeNull()
    expect(covered(veto())).toBe(false)
    const hold = veto()!.querySelector('[data-testid="veto-hold"]')
    expect(hold).not.toBeNull()
    expect(lit().some(element => hold!.contains(element) && element.tagName === 'BUTTON')).toBe(true)
    expect(covered(header())).toBe(true)
    expect(buttonNamed(clipSection(), 'Clip überspringen')).toBeUndefined()
    expect(page.findComponent(HostDock).exists()).toBe(false)
    for (const element of lit()) expect(clipSection()!.contains(element) || veto()!.contains(element), element.outerHTML.slice(0, 80)).toBe(true)
  })

  it('leaves a Member on the Stands, who has no Veto bar, only the clip\'s own button', async () => {
    const { slug } = serveRunning({ host: false, clip: runningClip(), wheel: idleWheel })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(backdrop()).not.toBeNull()
    expect(veto()).toBeNull()
    expect(covered(header())).toBe(true)
    expect(lit().map(element => element.getAttribute('aria-label') ?? element.textContent?.trim())).toEqual(['Für mich schließen'])
  })

  it('shows nothing of it without a clip: no backdrop, no scroll lock, nothing inert', async () => {
    const { slug } = serveRunning({ host: true, clip: null })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })

    expect(backdrop()).toBeNull()
    expect(html().contains('overflow-hidden')).toBe(false)
    expect(page.element.querySelectorAll('[inert]')).toHaveLength(0)
  })

  it('shows for a late joiner on the first read, with no further one', async () => {
    const now = Date.now()
    const clip: ClipView = { drawId: 'd1', startAt: new Date(now - 20_000).toISOString(), endsAt: new Date(now + 10_000).toISOString(), game: kart }
    const { slug } = serveRunning({ host: false, clip })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await flushPromises()

    expect(backdrop()).not.toBeNull()
    expect(covered(header())).toBe(true)
  })

  it('goes at once when this device closes the clip', async () => {
    const { slug } = serveRunning({ host: false, clip: runningClip() })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    expect(backdrop()).not.toBeNull()

    buttonNamed(clipSection(), 'Für mich schließen')!.click()
    await flushPromises()

    expect(backdrop()).toBeNull()
    expect(covered(header())).toBe(false)
    expect(html().contains('overflow-hidden')).toBe(false)
    expect(clipSection()).toBeNull()
  })

  // #959: the read carries a spin's Clip from the stop on, and the Clip starts 1.5 s later; the page stays as it is until then.
  it('waits for the clip\'s start: no overlay, no backdrop and nothing inert before it, then both at the start by the clock', async () => {
    const now = Date.now()
    const clip: ClipView = { drawId: 'd1', startAt: new Date(now + 700).toISOString(), endsAt: new Date(now + 30_700).toISOString(), game: kart }
    const { slug } = serveRunning({ host: false, clip })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    await flushPromises()

    expect(clipSection()).toBeNull()
    expect(backdrop()).toBeNull()
    expect(covered(header())).toBe(false)
    expect(html().contains('overflow-hidden')).toBe(false)

    await vi.waitFor(() => expect(backdrop()).not.toBeNull(), { timeout: 3000 })
    expect(clipSection()).not.toBeNull()
    expect(covered(header())).toBe(true)
  })

  it('goes with the clip\'s end by its own ticker', async () => {
    const now = Date.now()
    const clip: ClipView = { drawId: 'd1', startAt: new Date(now - 29_300).toISOString(), endsAt: new Date(now + 700).toISOString(), game: kart }
    const { slug } = serveRunning({ host: false, clip })
    page = await mountSuspended(EventPage, { route: `/e/${slug}` })
    expect(backdrop()).not.toBeNull()

    await vi.waitFor(() => expect(backdrop()).toBeNull(), { timeout: 3000 })
    expect(covered(header())).toBe(false)
  })

  it('goes with the Host\'s skip once the read after it carries no clip', async () => {
    const served = serveWithSkip(runningClip())
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    expect(backdrop()).not.toBeNull()

    buttonNamed(clipSection(), 'Clip überspringen')!.click()
    await vi.waitFor(() => expect(backdrop()).toBeNull())
    await flushPromises()

    expect(covered(header())).toBe(false)
    expect(html().contains('overflow-hidden')).toBe(false)
  })

  it('does not come back for the same draw after a close on this device, and is the same page again for the next draw\'s clip', async () => {
    const served = serveRunning({ host: false, clip: runningClip() })
    page = await mountSuspended(EventPage, { route: `/e/${served.slug}` })
    buttonNamed(clipSection(), 'Für mich schließen')!.click()
    await flushPromises()
    expect(backdrop()).toBeNull()

    const now = Date.now()
    const next: ClipView = { drawId: 'd2', startAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 29_000).toISOString(), game: kart }
    served.set(viewWithSessions(served.slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
      event: { isHost: false, phase: 'running' }, settings: defaultSettings(), runningSessionId: `session-${served.slug}-0`, clip: next,
    }))
    await refreshNuxtData()
    await flushPromises()

    await vi.waitFor(() => expect(backdrop()).not.toBeNull())
    expect(covered(header())).toBe(true)
  })

  // #699: a hard load paints the server's HTML. The tests above look at the page after the overlay has said it shows (its `shown` emit lands
  // after the first render), so they stayed green while the HTML had the Clip and neither the backdrop nor an `inert`. These render the page
  // to a string, as the server does (`renderToString` on an SSR app that carries the Nuxt test app's providers), and read that string.
  describe('on the first render, which is the server render (#699)', () => {
    async function renderOnServer(slug: string): Promise<HTMLElement> {
      const nuxtApp = useNuxtApp()
      const app = createSSRApp({ render: () => h(Suspense, null, { default: () => h(EventPage, { slug }) }) })
      const context = nuxtApp.vueApp
      Object.assign(app._context.provides, context._context.provides)
      Object.assign(app._context.components, context._context.components)
      Object.assign(app._context.directives, context._context.directives)
      app.config.globalProperties = context.config.globalProperties
      // The i18n plugin and the Nuxt app find themselves by properties of the app, which a new app does not have.
      for (const key of [...Object.getOwnPropertyNames(context), ...Object.getOwnPropertySymbols(context)]) {
        if (typeof key === 'symbol' || key.startsWith('__VUE_I18N') || key === '$nuxt') Object.assign(app, { [key]: (context as unknown as Record<string | symbol, unknown>)[key] })
      }
      const root = document.createElement('div')
      root.innerHTML = await renderToString(app)
      return root
    }
    const covers = (root: Element, selector: string) => {
      const element = root.querySelector(selector)
      expect(element, selector).not.toBeNull()
      return element!.closest('[inert]') !== null
    }
    const labelled = (element: Element) => element.getAttribute('aria-label') ?? element.textContent?.trim()
    const litIn = (root: Element) => [...root.querySelectorAll(FOCUSABLE)].filter(element => element.closest('[inert]') === null)

    /** The regions the backdrop covers (AppShell's `covered`), the banner's wrapper under the header included. */
    function expectCovered(root: HTMLElement) {
      expect(root.querySelectorAll('[data-testid="clip-backdrop"]')).toHaveLength(1)
      for (const region of ['a[href="#stage"]', 'header', 'main', 'aside', 'nav[aria-label="Event"]']) expect(covers(root, region), region).toBe(true)
      expect(root.querySelector('header')!.nextElementSibling!.closest('[inert]')).not.toBeNull()
    }

    it('has the backdrop and the covered regions inert for the Host, with the clip, its buttons and the dock lit', async () => {
      const { slug } = serveRunning({ host: true, clip: runningClip() })
      const root = await renderOnServer(slug)

      expectCovered(root)
      const section = root.querySelector('section[aria-label="Clip: Kart"]')
      expect(section).not.toBeNull()
      expect(section!.closest('[inert]')).toBeNull()
      const lit = litIn(root).map(labelled)
      expect(lit).toContain('Clip überspringen')
      expect(lit).toContain('Für mich schließen')
      const dock = root.querySelector('[role="toolbar"][aria-label="Host-Steuerung"]')
      expect(dock).not.toBeNull()
      expect(dock!.closest('[inert]')).toBeNull()
    })

    it('has the same for a Player of a Party, with no skip and no dock', async () => {
      const { slug } = serveRunning({ host: false, clip: runningClip(), wheel: openWindow() })
      const root = await renderOnServer(slug)

      expectCovered(root)
      expect(root.querySelector('section[aria-label="Clip: Kart"]')!.closest('[inert]')).toBeNull()
      // The Veto bar opens with the page's server clock, which the server's HTML does not have (useVetoClock): it comes in after the
      // first render, outside the covered regions (the Player's test above, on the mounted page). Whatever the HTML lights is the clip's.
      const lit = litIn(root).map(labelled)
      expect(lit).toContain('Für mich schließen')
      expect(lit).not.toContain('Clip überspringen')
      expect(root.querySelector('[role="toolbar"][aria-label="Host-Steuerung"]')).toBeNull()
    })

    it('has the same for a Member on the Stands, with only the clip\'s own button lit', async () => {
      const { slug } = serveRunning({ host: false, clip: runningClip(), wheel: idleWheel })
      const root = await renderOnServer(slug)

      expectCovered(root)
      expect(root.querySelector('[data-testid="veto-bar"]')).toBeNull()
      expect(litIn(root).map(labelled)).toEqual(['Für mich schließen'])
    })

    it('has no backdrop and nothing inert without a clip', async () => {
      for (const host of [true, false]) {
        const { slug } = serveRunning({ host, clip: null })
        const root = await renderOnServer(slug)

        expect(root.querySelector('[data-testid="clip-backdrop"]')).toBeNull()
        expect(root.querySelectorAll('[inert]')).toHaveLength(0)
      }
    })

    it('has the backdrop for a clip whose end has passed since the read, and the page lets it go at its first sample', async () => {
      const now = Date.now()
      const clip: ClipView = { drawId: 'd1', startAt: new Date(now - 30_000).toISOString(), endsAt: new Date(now - 200).toISOString(), game: kart }
      const { slug } = serveRunning({ host: false, clip })

      // The server never ends a clip by itself (ADR 0013): this read still carries it, so the HTML shows it with its backdrop.
      const root = await renderOnServer(slug)
      expectCovered(root)

      // The device that takes this HTML starts the same way and drops the backdrop with the clip, at the ticker's first sample.
      page = await mountSuspended(EventPage, { route: `/e/${slug}` })
      await vi.waitFor(() => expect(backdrop()).toBeNull(), { timeout: 3000 })
      expect(covered(header())).toBe(false)
    })
  })
})
