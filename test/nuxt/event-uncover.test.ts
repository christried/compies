import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventView } from '~~/shared/event'
import { defaultSettings } from '~~/shared/settings'
import type { EndView } from '~~/shared/stage'
import type { UncoverRejection } from '~~/shared/uncover'
import { kitty, signInAs } from './auth'
import { clickHostAction, hostActionElement, openHostMenu, stubScreen, viewWithSessions } from './event-page'
import { FIRST, mount, SESSION, STARTED, team, unmountPage } from './event-page-states'

// „Rad aufdecken“ on the Event page (#957, spec #961 § Host dock): a plain button, no confirm, only while the Host's uncover rule passes. It sits
// in the pill right after the „Event abschließen“ hold when the Game count is complete without a Tie, and in Mehr in the Tie layout. A tap posts
// the uncover; the refetch then reads the wheel uncovered and the button is gone. The Event is served by hand so the test sees what is posted.

let testNumber = 0

const complete = (fields: Partial<EndView> = {}): EndView => ({ played: 3, gameCount: 3, complete: true, tie: null, decided: true, finish: { rejection: null }, lastGame: { rejection: 'no_tie' }, ...fields })
const TIE = complete({ tie: [1, 2], decided: false, lastGame: { rejection: null } })

/** The Host's running Hidden wheel Event with this end and this answer of the uncover rule, served with what the uncover route was sent. */
function serveEvent(end: EndView, rejection: UncoverRejection | null = null) {
  testNumber += 1
  const slug = `freitags-uncover-${testNumber}`
  const build = (uncovered: boolean): EventView => viewWithSessions(slug, [SESSION(1, FIRST, { startedAt: STARTED })], 0, {
    event: { isHost: true, phase: 'running' },
    settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', hiddenWheel: true, poolPreview: false, vetoAllowance: 1 },
    teams: [team(1, 'Die Füchse'), team(2)],
    standings: [{ team: 1, rank: 1, points: 3 }, { team: 2, rank: end.tie ? 1 : 2, points: end.tie ? 3 : 0 }],
    end,
    slots: [],
    bestSlotId: null,
    runningSessionId: `session-${slug}-0`,
    wheelUncovered: uncovered,
    uncover: { rejection: uncovered ? 'wheel_uncovered' : rejection },
  }) as EventView
  let current = build(false)
  let posted = 0
  registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => current })
  registerEndpoint(`/api/e/${slug}/uncover`, {
    method: 'POST',
    handler: () => {
      posted += 1
      current = build(true)
      return { uncoveredAt: '2090-10-30T21:00:00.000Z' }
    },
  })
  return { slug, posted: () => posted }
}

const menuLabels = (menu: HTMLElement) => [...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())
const pill = (page: Awaited<ReturnType<typeof mount>>) => [...page.element.querySelectorAll('[role="toolbar"][aria-label="Host-Steuerung"] button')].map(button => button.textContent?.trim())

describe('Rad aufdecken in the Host dock (#957)', () => {
  beforeEach(() => {
    signInAs(kitty)
    stubScreen(true)
    useState('toasts').value = []
  })

  afterEach(() => {
    unmountPage()
  })

  it('sits in the pill right after Event abschließen when the Game count is complete without a Tie, as a plain button', async () => {
    const { slug } = serveEvent(complete())

    const page = await mount(slug)

    expect(pill(page)[0]).toBe('Event abschließen 1 s halten')
    expect(pill(page)[1]).toBe('Rad aufdecken')
    expect(pill(page)[2]).toMatch(/^Session 1 beenden/)
    expect((await hostActionElement(page, 'Rad aufdecken')).textContent?.trim()).toBe('Rad aufdecken')
    // Once only: Mehr does not repeat it while the pill holds it (#957, browser check c1).
    expect(menuLabels(await openHostMenu(page))).not.toContain('Rad aufdecken')
  })

  it('is in the phone\'s sheet wherever the pill holds it on a computer, and in the Tie layout too', async () => {
    stubScreen(false)
    for (const end of [complete(), TIE]) {
      const { slug } = serveEvent(end)
      const page = await mount(slug)

      const crown = page.element.querySelector('button[aria-label="Host-Steuerung"][aria-haspopup="dialog"]') as HTMLButtonElement
      crown.click()
      const sheet = () => [...document.querySelectorAll('[role="dialog"]')].find(node => node.querySelector('h2')?.textContent?.includes('Host-Steuerung'))
      await vi.waitFor(() => expect(sheet()).toBeDefined())

      expect([...sheet()!.querySelectorAll('button')].map(button => button.textContent?.trim())).toContain('Rad aufdecken')
      unmountPage()
    }
  })

  it('waits in Mehr in the Tie layout, where the pill keeps its holds and the last game', async () => {
    const { slug } = serveEvent(TIE)

    const page = await mount(slug)

    expect(pill(page)).not.toContain('Rad aufdecken')
    expect(pill(page)[0]).toBe('Unentschieden 1 s halten')
    expect(menuLabels(await openHostMenu(page))).toContain('Rad aufdecken')
  })

  it('is not offered while the rule refuses', async () => {
    const { slug } = serveEvent(complete(), 'no_running_session')

    const page = await mount(slug)

    expect(pill(page)).not.toContain('Rad aufdecken')
    expect(menuLabels(await openHostMenu(page))).not.toContain('Rad aufdecken')
  })

  it('posts the uncover on a tap, with no confirm, and is gone once the read says the wheel is uncovered', async () => {
    const { slug, posted } = serveEvent(complete())
    const page = await mount(slug)

    await clickHostAction(page, 'Rad aufdecken')

    await vi.waitFor(() => expect(posted()).toBe(1))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await vi.waitFor(() => expect(pill(page)).not.toContain('Rad aufdecken'))
  })
})
