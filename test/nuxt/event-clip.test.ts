import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { ClipView } from '~~/shared/event'
import type { RoundGame } from '~~/shared/game'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, viewWithSessions } from './event-page'

// The synced clip on the Event page (#230): the overlay is mounted when the Event read carries a clip, with the Host's
// „Clip überspringen“ for the Host only, which POSTs the skip. The overlay's own behaviour is in clip-overlay.test.ts.

const FIRST = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'

const kart: RoundGame = { id: 'g-kart', name: 'Kart', imageUrl: null, youtubeId: null, clipStart: 0, clipLength: 30, playersMin: 2, playersMax: 4, suitabilities: [] }

/** A clip that is running now by the page's own clock (it is not synced in a test): started a second ago, 30 s long. */
function runningClip(): ClipView {
  const now = Date.now()
  return { drawId: 'd1', startAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 29_000).toISOString(), game: kart }
}

function serveRunning({ host, clip }: { host: boolean, clip: ClipView | null }) {
  return serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: host, phase: 'running' },
    settings: defaultSettings(),
    runningSessionId: `session-${slug}-0`,
    clip,
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
})
