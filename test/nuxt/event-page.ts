import { registerEndpoint, type mountSuspended } from '@nuxt/test-utils/runtime'
import { expect } from 'vitest'
import type { BoardTeam, EventPools, MemberView, SessionNote } from '~~/shared/event'
import type { EventSettings, SettingsFloors } from '~~/shared/settings'
import { kitty } from './auth'

// Fixtures for the Event page tests (event-*.test.ts): the `GET /api/e/:slug` body and a fresh Event link per test.

let testNumber = 0
export const SANNE = '00000000-0000-4000-8000-000000000003'
export const LARSI = '00000000-0000-4000-8000-000000000002'

export type Vote = { slotId: string, userId: string, value: 'yes' | 'maybe' | 'no', note?: string | null }
/** The Date fields of the Event's one Session (#48); the view puts them on a Session, not on the Event. */
type SessionDates = { startsAt?: string | null, previousStartsAt?: string | null }
export type EventOverrides = { event?: Partial<ReturnType<typeof eventOf>> & SessionDates, slots?: unknown[], bestSlotId?: string | null, progress?: { voted: number, total: number }, inviteUrl?: string | null, settings?: EventSettings | null, settingsFloors?: SettingsFloors | null, pools?: EventPools, removedSessions?: { id: string, previousStartsAt: string }[], members?: MemberView[], teams?: BoardTeam[], teamChoiceOpen?: boolean }

function eventOf(slug: string, phase = 'poll', isHost = false): { slug: string, name: string, phase: string, isHost: boolean } {
  return { slug, name: 'Freitags-Zocken', phase, isHost }
}

/** The `GET /api/e/:slug` body for a Member (Kitty) in a poll with Slots Fr, Sa and a past Di. */
export function view(slug: string, votes: Vote[], overrides: EventOverrides = {}) {
  const { startsAt = null, previousStartsAt = null, ...event } = { ...eventOf(slug), ...overrides.event }
  return {
    event,
    // An Event that was never set up (#144) unless a test says otherwise: no settings, hidden empty pools (#148, #147).
    settings: overrides.settings === undefined ? null as EventSettings | null : overrides.settings,
    settingsFloors: overrides.settingsFloors === undefined ? (event.isHost ? { teamSize: 1, vetoAllowance: 0 } : null) : overrides.settingsFloors,
    pools: overrides.pools ?? { hidden: true, mainCount: 0, tiebreakerCount: 0 } as EventPools,
    // The Event's one Session, which the server sends without a number (#70).
    sessions: [{ id: `session-${slug}`, number: null, startsAt, previousStartsAt, notes: [] as SessionNote[] }],
    removedSessions: overrides.removedSessions ?? [],
    viewerId: kitty.id,
    slots: overrides.slots ?? [
      { id: 'fri', startsAt: '2026-10-23T18:00:00.000Z', past: false },
      { id: 'sat', startsAt: '2026-10-24T18:00:00.000Z', past: false },
      { id: 'old', startsAt: '2026-10-20T18:00:00.000Z', past: true },
    ],
    votes: votes.map(vote => ({ note: null, ...vote })),
    // Everyone on the Bench, no teams and Team choice closed, unless a test says otherwise (#160).
    members: overrides.members ?? [
      { id: kitty.id, name: 'Kitty', image: null, isHost: false, zone: 'bench', team: null },
      { id: LARSI, name: 'Larsi', image: null, isHost: false, zone: 'bench', team: null },
      { id: SANNE, name: 'Sanne', image: null, isHost: true, zone: 'bench', team: null },
    ] satisfies MemberView[],
    teams: overrides.teams ?? [] as BoardTeam[],
    teamChoiceOpen: overrides.teamChoiceOpen ?? false,
    bestSlotId: overrides.bestSlotId === undefined ? 'sat' : overrides.bestSlotId,
    progress: overrides.progress ?? { voted: 2, total: 3 },
    inviteUrl: overrides.inviteUrl ?? null,
  }
}

/** The `GET /api/e/:slug` body of an Event with several Sessions (#49): the Sessions come as the server numbers them. */
export function viewWithSessions(slug: string, sessions: { startsAt: string | null, number: number | null }[], missingDates: number, overrides: EventOverrides = {}) {
  return {
    ...view(slug, [], overrides),
    sessions: sessions.map((session, index) => ({ id: `session-${slug}-${index}`, previousStartsAt: null, notes: [], ...session })),
    missingDates,
  } as ReturnType<typeof view>
}

export const sanneAndLarsi: Vote[] = [
  { slotId: 'fri', userId: SANNE, value: 'yes' },
  { slotId: 'sat', userId: SANNE, value: 'yes' },
  { slotId: 'old', userId: SANNE, value: 'yes' },
  { slotId: 'fri', userId: LARSI, value: 'maybe' },
  { slotId: 'sat', userId: LARSI, value: 'yes' },
]

/**
 * A fresh Event link for one test, with its read endpoint registered to a mutable view. Each test gets its own
 * slug: registerEndpoint keeps the first handler for a path, so tests must not share one.
 */
export function serve(initial: (slug: string) => ReturnType<typeof view>) {
  testNumber += 1
  const slug = `freitags-zocken-${testNumber}`
  let current = initial(slug)
  registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => current })
  return {
    slug,
    set(next: ReturnType<typeof view>) {
      current = next
    },
  }
}

export type Wrapper = { text: () => string, attributes: (name: string) => string | undefined }
type Page = Awaited<ReturnType<typeof mountSuspended>>

export function shownToasts() {
  return useState<{ text: string, tone: string }[]>('toasts').value
}

export function radio(page: Page, slotLabel: string, option: string) {
  return page.get(`[role="radiogroup"][aria-label="${slotLabel}"]`).findAll('[role="radio"]').find((button: Wrapper) => button.text() === option)!
}

/** Presses the ✕ of the notice that shows `text`. */
export function closeNotice(page: Page, text: string) {
  const notice = page.findAll('[role="status"]').find((element: Wrapper) => element.text().includes(text))!
  return notice.get('button[aria-label="Schließen"]').trigger('click')
}

/** The open dialog, which is teleported to the body. */
export function dialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]')
}

/** Clicks the button with this label inside `root` and lets Vue run the handler. */
export async function clickButton(root: ParentNode | null | undefined, label: string) {
  const button = [...(root?.querySelectorAll('button') ?? [])].find(element => element.textContent?.trim() === label)
  expect(button, label).toBeDefined()
  button!.click()
  await new Promise(resolve => setTimeout(resolve))
}

/** A mounted page, as far as the Host dock helpers read it. */
export type Mounted = { element: Element }

function hostButtons(page: Mounted) {
  return [...page.element.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')]
}

/** Opens „Mehr“ of the Host dock (once) and returns its menu. The header's user menu is a menu too, so the label scopes it. */
export async function openHostMenu(page: Mounted): Promise<HTMLElement> {
  const scope = '[role="menu"][aria-label="Host-Steuerung"]'
  if (!page.element.querySelector(scope)) {
    const more = hostButtons(page).find(button => button.textContent?.trim() === 'Mehr')
    expect(more, 'Mehr').toBeDefined()
    more!.click()
    await new Promise(resolve => setTimeout(resolve))
  }
  const menu = page.element.querySelector<HTMLElement>(scope)
  expect(menu, 'Host-Steuerung').not.toBeNull()
  return menu!
}

/** The Host dock action with this label: its pill button, or its item in „Mehr“ (which is opened first). */
export async function hostActionElement(page: Mounted, label: string): Promise<HTMLButtonElement> {
  const pill = hostButtons(page).find(button => button.textContent?.trim() === label)
  if (pill) return pill
  // A disabled item carries its reason after its label, so the label is only a prefix there.
  const items = [...(await openHostMenu(page)).querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
  const item = items.find(node => node.textContent?.trim().startsWith(label))
  expect(item, label).toBeDefined()
  return item!
}

/** Clicks the Host dock action with this label, from the pill or from „Mehr“, and lets Vue run the handler. */
export async function clickHostAction(page: Mounted, label: string) {
  const element = await hostActionElement(page, label)
  element.click()
  await new Promise(resolve => setTimeout(resolve))
}
