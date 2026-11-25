import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { clickIconButton, LARSI, memberView, SANNE, shownToasts, viewWithSessions } from './event-page'
import { FIRST, mount, mountedPage, SESSION, team, unmountPage } from './event-page-states'

// „Aus dem Event entfernen“ on the Event page (#896, spec #894): the person leaves the board and the Host's Invite link, new or unchanged, shows
// without a reload, because the send refetches the Event afterwards (ADR 0001) and only the Host's read carries the link (ADR 0006). The Event is
// served by hand so the test can change it behind the POST and count the reads. Kitty is the Host here: the fixture's viewer is Kitty.

const OLD_LINK = 'https://compies.test/e/x-OldToken'
const NEW_LINK = 'https://compies.test/e/x-NewToken'

let testNumber = 0

const everybody = () => [
  memberView({ id: kitty.id, name: 'Kitty', isHost: true }),
  memberView({ id: SANNE, name: 'Sanne' }),
  memberView({ id: LARSI, name: 'Larsi', zone: 'team', team: 1 }),
]

/** The Host's Event; its POST drops Larsi and answers with `answerLink` as the new Invite link (null: not rotated), and the next read carries what changed. */
function serveHostEvent(answerLink: string | null) {
  testNumber += 1
  const slug = `freitags-remove-${testNumber}`
  const build = (members: ReturnType<typeof everybody>, inviteUrl: string) => viewWithSessions(slug, [SESSION(1, FIRST)], 0, {
    event: { isHost: true, phase: 'date_set' },
    settings: defaultSettings(),
    teams: [team(1), team(2)],
    teamChoiceOpen: true,
    members,
    inviteUrl,
  })
  let current = build(everybody(), OLD_LINK)
  const counts = { reads: 0 }
  const posted: unknown[] = []
  registerEndpoint(`/api/e/${slug}`, { method: 'GET', handler: () => {
    counts.reads += 1
    return current
  } })
  registerEndpoint(`/api/e/${slug}/remove-member`, {
    method: 'POST',
    handler: async (event) => {
      posted.push(await readBody(event))
      current = build(everybody().filter(member => member.id !== LARSI), answerLink ?? OLD_LINK)
      return { userId: LARSI, inviteUrl: answerLink }
    },
  })
  return { slug, counts, posted }
}

// The page is not in the document (mountSuspended), its dialogs are: the board's person is looked for in the page.
const larsi = () => (mountedPage()!.element as Element).querySelector<HTMLElement>(`[data-user-id="${LARSI}"]`)
const removeDialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.textContent?.includes('aus dem Event entfernen?'))
const inviteInput = () => document.querySelector<HTMLInputElement>('[role="dialog"] input[readonly]')

/** Holds the sheet's „Entfernen“ with the keyboard for a second on fake timers, then releases it. */
async function holdRemove() {
  const button = [...removeDialog()!.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim().startsWith('Entfernen'))!
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  vi.advanceTimersByTime(1000)
  button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  vi.useRealTimers()
  await new Promise(resolve => setTimeout(resolve, 100))
  await flushPromises()
}

/** Larsi's menu, the entry, the sheet. */
async function openRemoveSheet() {
  larsi()!.click()
  await new Promise(resolve => setTimeout(resolve))
  const entry = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('Aus dem Event entfernen'))
  expect(entry, 'Aus dem Event entfernen').toBeDefined()
  entry!.click()
  await flushPromises()
}

describe('the Host removes somebody on the Event page', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    unmountPage()
    vi.useRealTimers()
  })

  it('takes the person off the board and shows the new Invite link without a reload', async () => {
    const { slug, counts, posted } = serveHostEvent(NEW_LINK)
    const page = await mount(slug)
    expect(larsi()).not.toBeNull()
    await openRemoveSheet()
    const readsBefore = counts.reads

    await holdRemove()

    expect(posted).toEqual([{ userId: LARSI, rotateInvite: true }])
    expect(counts.reads).toBeGreaterThan(readsBefore)
    await vi.waitFor(() => expect(larsi()).toBeNull())
    expect(shownToasts()).toContainEqual(expect.objectContaining({ text: 'Larsi ist nicht mehr im Event. Der Einladungslink ist neu.', tone: 'success' }))
    await clickIconButton(page.get('header').element, 'Einladen')
    await vi.waitFor(() => expect(inviteInput()?.value).toBe(NEW_LINK))
  })

  it('leaves the Invite link as it was when the removal did not rotate it', async () => {
    const { slug, posted } = serveHostEvent(null)
    const page = await mount(slug)
    await openRemoveSheet()
    document.querySelector<HTMLElement>('[role="dialog"] [role="switch"]')!.click()
    await nextTick()

    await holdRemove()

    expect(posted).toEqual([{ userId: LARSI, rotateInvite: false }])
    await vi.waitFor(() => expect(larsi()).toBeNull())
    expect(shownToasts()).toContainEqual(expect.objectContaining({ text: 'Larsi ist nicht mehr im Event.', tone: 'success' }))
    await clickIconButton(page.get('header').element, 'Einladen')
    await vi.waitFor(() => expect(inviteInput()?.value).toBe(OLD_LINK))
  })
})
