import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BonusVetoSheet from '~/components/BonusVetoSheet.vue'
import EventPage from '~/pages/e/[slug]/index.vue'
import type { BoardTeam } from '~~/shared/event'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickHostAction, dialog, openHostMenu, serve, viewWithSessions } from './event-page'

// The Bonus Veto (#233, spec #218 § Bonus Vetoes): the sheet lists the Parties with their counts, holds each grant to confirm, and
// disables a Party's button at 9 with the reason. The Host's dock action opens it; a Member has neither.

const teams: BoardTeam[] = [
  { position: 1, name: null },
  { position: 2, name: 'Die Füchse' },
]

const rows = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"] li')]
const buttonOf = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('button')!

/** Holds the row's button with the keyboard, as the hold is started in these tests (keyup is never sent, so the hold completes). */
function hold(row: HTMLElement) {
  buttonOf(row).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('the Bonus Veto sheet', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useState('toasts').value = []
  })

  it('has one row per Party, in its Team colour, with its count', async () => {
    await mountSuspended(BonusVetoSheet, { props: { open: true, teams, granted: [0, 2], grant: async () => true } })

    expect(dialog()?.querySelector('h2')?.textContent).toBe('Bonus-Veto geben')
    expect(dialog()?.textContent).toContain('Die Partei kann es sofort einsetzen, auch in einem laufenden Veto-Fenster.')
    expect(rows()).toHaveLength(2)
    expect(rows()[0]!.textContent).toContain('Rot')
    expect(rows()[0]!.textContent).toContain('Noch kein Bonus-Veto')
    expect(rows()[0]!.querySelector('[style*="--cp-team-1"]')).not.toBeNull()
    expect(rows()[1]!.textContent).toContain('Die Füchse')
    expect(rows()[1]!.textContent).toContain('2 Bonus-Vetos')
    expect(rows()[1]!.querySelector('[style*="--cp-team-2"]')).not.toBeNull()
  })

  it('disables the button of a Party with 9 Bonus Vetoes, with the reason, and not the other Party’s', async () => {
    await mountSuspended(BonusVetoSheet, { props: { open: true, teams, granted: [9, 1], grant: async () => true } })

    expect(buttonOf(rows()[0]!).getAttribute('aria-disabled')).toBe('true')
    const reason = document.getElementById(buttonOf(rows()[0]!).getAttribute('aria-describedby') ?? '')
    expect(reason?.textContent).toBe('Diese Partei hat schon 9 Bonus-Vetos.')
    expect(buttonOf(rows()[1]!).getAttribute('aria-disabled')).toBeNull()
  })

  it('grants the Party whose hold completed, and the sheet stays open with the button done', async () => {
    const grant = vi.fn(async (_team: number) => true)
    await mountSuspended(BonusVetoSheet, { props: { open: true, teams, granted: [0, 0], grant } })

    hold(rows()[1]!)

    await vi.waitFor(() => expect(grant).toHaveBeenCalledWith(2), { timeout: 3000 })
    await vi.waitFor(() => expect(buttonOf(rows()[1]!).textContent).toContain('Gegeben'))
    expect(dialog()).not.toBeNull()
    expect(grant).toHaveBeenCalledTimes(1)
  })

  it('keeps „Gegeben“ on the button when the refetch raises the count, then readies it for the next grant, which needs its own hold (F7)', async () => {
    const grant = vi.fn(async (_team: number) => true)
    const sheet = await mountSuspended(BonusVetoSheet, { props: { open: true, teams, granted: [0, 0], grant } })

    hold(rows()[1]!)
    await vi.waitFor(() => expect(grant).toHaveBeenCalledWith(2), { timeout: 3000 })
    // The page reads the Event again and the count follows, before the done state has painted for long.
    await sheet.setProps({ granted: [0, 1] })

    await vi.waitFor(() => expect(buttonOf(rows()[1]!).textContent).toContain('Gegeben'))
    expect(rows()[1]!.textContent).toContain('1 Bonus-Veto')
    await vi.waitFor(() => expect(buttonOf(rows()[1]!).textContent).not.toContain('Gegeben'), { timeout: 3000 })
    expect(buttonOf(rows()[1]!).textContent).toContain('Bonus-Veto geben')
    expect(grant).toHaveBeenCalledTimes(1)

    hold(rows()[1]!)
    await vi.waitFor(() => expect(grant).toHaveBeenCalledTimes(2), { timeout: 3000 })
  })

  it('leaves the button idle when the server refuses the grant', async () => {
    const grant = vi.fn(async (_team: number) => false)
    await mountSuspended(BonusVetoSheet, { props: { open: true, teams, granted: [0, 0], grant } })

    hold(rows()[0]!)

    await vi.waitFor(() => expect(grant).toHaveBeenCalledWith(1), { timeout: 3000 })
    expect(buttonOf(rows()[0]!).textContent).not.toContain('Gegeben')
  })
})

describe('the Bonus Veto on the Event page', () => {
  const now = new Date().toISOString()

  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** The Event of a running Lucky Wheel, with the Host's Bonus Veto read (`granted`, `rejection`) or a Member's read without one. */
  function serveWheel({ host = true, granted = [0, 0], rejection = null }: { host?: boolean, granted?: number[], rejection?: 'wrong_phase' | null } = {}) {
    return serve(slug => viewWithSessions(slug, [{ number: null, startsAt: now, startedAt: now }], 0, {
      event: { isHost: host, phase: 'running' },
      settings: { ...defaultSettings(), selectionMode: 'lucky_wheel', vetoAllowance: 1 },
      runningSessionId: `session-${slug}-0`,
      teams,
      bonusVetoes: host ? { granted, rejection } : null,
      setGame: host ? { rejection: null, spinRejection: null, respin: false, left: [], poolWarning: null } : null,
    }))
  }

  async function mount(slug: string) {
    return await mountSuspended(EventPage, { route: `/e/${slug}` })
  }

  it('lists Bonus-Veto geben in Mehr of the Host, and the action opens the sheet with a row per Party', async () => {
    const { slug } = serveWheel()
    const stage = await mount(slug)

    const menu = await openHostMenu(stage)
    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).toContain('Bonus-Veto geben')

    await clickHostAction(stage, 'Bonus-Veto geben')

    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(dialog()!.querySelector('h2')?.textContent).toBe('Bonus-Veto geben')
    expect(rows()).toHaveLength(2)
  })

  it('is not in the dock of a Member, who gets no Bonus Veto read', async () => {
    const { slug } = serveWheel({ host: false })
    const stage = await mount(slug)

    expect(stage.element.textContent).not.toContain('Bonus-Veto geben')
  })

  it('is not in the dock once the read refuses a grant, and the sheet is never opened for it', async () => {
    const { slug } = serveWheel({ rejection: 'wrong_phase' })
    const stage = await mount(slug)

    const menu = await openHostMenu(stage)

    expect([...menu.querySelectorAll('[role="menuitem"]')].map(item => item.textContent?.trim())).not.toContain('Bonus-Veto geben')
  })

  it('sends the grant of the Party whose hold completed to the Event', async () => {
    const { slug } = serveWheel()
    const posted: unknown[] = []
    registerEndpoint(`/api/e/${slug}/bonus-vetoes`, { method: 'POST', handler: async (event) => {
      posted.push(await readBody(event))
      return { team: 2, granted: 1 }
    } })
    const stage = await mount(slug)
    await clickHostAction(stage, 'Bonus-Veto geben')
    await vi.waitFor(() => expect(dialog()).not.toBeNull())

    hold(rows()[1]!)

    await vi.waitFor(() => expect(posted).toEqual([{ team: 2 }]), { timeout: 3000 })
  })
})
