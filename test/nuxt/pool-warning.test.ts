import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { SetGameView } from '~~/shared/stage'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { serve, viewWithSessions } from './event-page'

// The Host's pool warning on the stage of a running Event (#234, spec #218 § Pool warning): a notice that shows the numbers of the
// rule to the Host only, above the open Rounds, and never blocks anything. A Member never sees it, not even as a hint.

const FIRST = '2026-10-30T19:00:00.000Z'
const STARTED = '2026-10-30T19:30:00.000Z'

const setGameOf = (poolWarning: SetGameView['poolWarning']): SetGameView => ({ rejection: null, spinRejection: null, respin: false, left: [], poolWarning })

/** A running Event with the Host's or a Member's read of it. */
function serveRunning({ host, setGame }: { host: boolean, setGame: SetGameView | null }) {
  return serve(slug => viewWithSessions(slug, [{ number: null, startsAt: FIRST, startedAt: STARTED }], 0, {
    event: { isHost: host, phase: 'running' },
    settings: defaultSettings(),
    runningSessionId: `session-${slug}-0`,
    setGame,
  }))
}

let page: Awaited<ReturnType<typeof mountSuspended>> | undefined
async function mount(slug: string) {
  page = await mountSuspended(EventPage, { route: `/e/${slug}` })
  return page
}

/** The notice of the pool warning on the page, or undefined. */
const warningOf = (stage: VueWrapper) => stage.findAll('[role="status"]').find(element => element.text().includes('Wird knapp.'))

beforeEach(() => {
  signInAs(kitty)
  useState('toasts').value = []
  document.body.innerHTML = ''
})

afterEach(() => {
  page?.unmount()
  page = undefined
  vi.useRealTimers()
})

describe('the pool warning on the stage (#234)', () => {
  it('shows the Host the notice with the numbers of the rule, marked as seen by the Host only', async () => {
    const { slug } = serveRunning({ host: true, setGame: setGameOf({ needed: 14, have: 4 }) })

    const stage = await mount(slug)

    const notice = warningOf(stage)
    expect(notice?.text()).toContain('Wird knapp.')
    expect(notice?.text()).toContain('Im schlimmsten Fall brauchst du noch 14 Spiele, übrig sind 4.')
    expect(notice?.text()).toContain('Nur du siehst das')
    expect(notice?.text()).toContain('Blockiert nichts')
  })

  it('says „noch 1 Spiel“ in the singular (F22)', async () => {
    const { slug } = serveRunning({ host: true, setGame: setGameOf({ needed: 1, have: 0 }) })

    const stage = await mount(slug)

    expect(warningOf(stage)?.text()).toContain('Im schlimmsten Fall brauchst du noch 1 Spiel, übrig sind 0.')
  })

  it('shows no notice to the Host while the games left cover the worst case', async () => {
    const { slug } = serveRunning({ host: true, setGame: setGameOf(null) })

    const stage = await mount(slug)

    expect(warningOf(stage)).toBeUndefined()
    expect(stage.text()).not.toContain('Wird knapp.')
  })

  it('never shows a Member the notice, nor any hint of the pool', async () => {
    const { slug } = serveRunning({ host: false, setGame: null })

    const stage = await mount(slug)

    expect(warningOf(stage)).toBeUndefined()
    expect(stage.text()).not.toContain('Wird knapp.')
    expect(stage.text()).not.toContain('übrig')
  })
})
