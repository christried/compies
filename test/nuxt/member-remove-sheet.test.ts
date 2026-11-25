import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameBoard from '~/components/GameBoard.vue'
import { DISPLAY_NAME_MAX } from '~~/shared/auth'
import type { BoardTeam, MemberView, RemovedMember } from '~~/shared/event'
import { defaultSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { LARSI, memberView, SANNE, shownToasts } from './event-page'

// „Aus dem Event entfernen“ (#896, spec #894): the sheet the Host's menu entry opens, with the Invite link's switch and the one second hold,
// through the mounted board as the Host. The remove endpoint records every body posted to it and answers what the test says.
const teams: BoardTeam[] = [{ position: 1, name: null }, { position: 2, name: null }]
const NEW_LINK = 'http://localhost/e/x-NewToken'
const LONG_NAME = 'W'.repeat(DISPLAY_NAME_MAX)

let testNumber = 0

function members(larsiName = 'Larsi'): MemberView[] {
  return [memberView({ id: kitty.id, name: 'Kitty' }), memberView({ id: LARSI, name: larsiName }), memberView({ id: SANNE, name: 'Sanne', isHost: true })]
}

/** The Host's board with a remove endpoint; `answer` is what the endpoint does with a body (it may throw). */
async function mountHostBoard(answer: (body: { userId: string, rotateInvite: boolean }) => RemovedMember = ({ userId }) => ({ userId, inviteUrl: null }), larsiName = 'Larsi') {
  testNumber += 1
  const slug = `remove-sheet-${testNumber}`
  const posted: { userId: string, rotateInvite: boolean }[] = []
  registerEndpoint(`/api/e/${slug}/remove-member`, {
    method: 'POST',
    handler: async (event) => {
      const body = await readBody(event) as { userId: string, rotateInvite: boolean }
      posted.push(body)
      return answer(body)
    },
  })
  const page = await mountSuspended(GameBoard, {
    props: {
      slug,
      members: members(larsiName),
      teams,
      settings: { ...defaultSettings(), teamCount: 2, teamSize: 2 },
      teamChoiceOpen: true,
      pageKind: 'teams',
      viewerId: SANNE,
      isHost: true,
      room: { on: () => () => undefined },
    },
    // In the document, so the focus the sheet gives back can be read.
    attachTo: document.body,
  })
  return { page, posted }
}

const larsiButton = () => document.querySelector<HTMLElement>(`[data-user-id="${LARSI}"]`)
const dialog = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].find(node => node.textContent?.includes('aus dem Event entfernen?'))
const sheetButton = (label: string) => [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(button => button.textContent?.trim().startsWith(label))
const rotateSwitch = () => dialog()!.querySelector<HTMLElement>('[role="switch"]')!
const switchHelp = () => rotateSwitch().getAttribute('aria-describedby') ? document.getElementById(rotateSwitch().getAttribute('aria-describedby')!)?.textContent?.trim() : undefined
const ROTATE_ON = 'Der alte Link wird sofort ungültig. Wer schon drin ist, bleibt drin.'
const ROTATE_OFF = 'Larsi kann mit dem aktuellen Link wiederkommen.'

/** Opens the sheet: a click on Larsi, then the menu's last row. */
async function openSheet() {
  larsiButton()!.click()
  // The menu moves the focus to its first row a tick after it opens; a person picks only after that.
  await new Promise(resolve => setTimeout(resolve))
  const entry = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent?.includes('Aus dem Event entfernen'))
  entry!.click()
  await flushPromises()
}

/** Holds the sheet's button with the keyboard for `ms` on fake timers, then releases it. */
async function hold(button: HTMLElement, ms = 1000) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  vi.advanceTimersByTime(ms)
  button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
  vi.useRealTimers()
  await new Promise(resolve => setTimeout(resolve, 100))
  await flushPromises()
}

describe('MemberRemoveSheet', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('asks about the person by name, in the longest name allowed too, and says what is deleted and what stays', async () => {
    await mountHostBoard(undefined, LONG_NAME)
    await openSheet()

    expect(dialog()?.querySelector('h2')?.textContent?.trim()).toBe(`${LONG_NAME} aus dem Event entfernen?`)
    expect(dialog()?.textContent).toContain('Gelöscht werden der Platz im Team, das Teamwort und die Stimmen in der Terminumfrage. Die Nachrichten im Chat bleiben.')
    expect(dialog()?.textContent).toContain('1 Sekunde halten')
  })

  it('has the Invite link\'s switch on, and describes both of its states', async () => {
    await mountHostBoard()
    await openSheet()

    expect(rotateSwitch().getAttribute('aria-checked')).toBe('true')
    expect(dialog()?.textContent).toContain('Einladungslink erneuern')
    expect(switchHelp()).toBe(ROTATE_ON)

    rotateSwitch().click()
    await nextTick()
    expect(rotateSwitch().getAttribute('aria-checked')).toBe('false')
    expect(switchHelp()).toBe(ROTATE_OFF)

    rotateSwitch().click()
    await nextTick()
    expect(rotateSwitch().getAttribute('aria-checked')).toBe('true')
    expect(switchHelp()).toBe(ROTATE_ON)
  })

  it('sends nothing for a hold of 999 ms, and one request with the person and the switch for a hold of a second', async () => {
    const { posted } = await mountHostBoard()
    await openSheet()

    await hold(sheetButton('Entfernen')!, 999)
    expect(posted).toEqual([])

    await hold(sheetButton('Entfernen')!)
    expect(posted).toEqual([{ userId: LARSI, rotateInvite: true }])
  })

  it('sends rotateInvite false when the switch is off', async () => {
    const { posted } = await mountHostBoard()
    await openSheet()
    rotateSwitch().click()
    await nextTick()

    await hold(sheetButton('Entfernen')!)

    expect(posted).toEqual([{ userId: LARSI, rotateInvite: false }])
  })

  it('toasts that the Invite link is new when the answer carries one, closes, and never shows the link', async () => {
    await mountHostBoard(({ userId }) => ({ userId, inviteUrl: NEW_LINK }))
    await openSheet()

    await hold(sheetButton('Entfernen')!)

    expect(shownToasts()).toEqual([expect.objectContaining({ text: 'Larsi ist nicht mehr im Event. Der Einladungslink ist neu.', tone: 'success' })])
    expect(JSON.stringify(shownToasts())).not.toContain('NewToken')
    expect(dialog()).toBeUndefined()
  })

  it('toasts without the link when the answer has none, even though the switch was on', async () => {
    await mountHostBoard(({ userId }) => ({ userId, inviteUrl: null }))
    await openSheet()

    await hold(sheetButton('Entfernen')!)

    expect(shownToasts()).toEqual([expect.objectContaining({ text: 'Larsi ist nicht mehr im Event.', tone: 'success' })])
    expect(dialog()).toBeUndefined()
  })

  it.each([
    ['member_not_found', 404, 'Diese Person ist nicht mehr im Event.'],
    ['wrong_phase', 409, 'Das geht nicht mehr. Die Seite zeigt den neuen Stand.'],
  ])('keeps the sheet open and says why when the server refuses with %s, and the hold takes a second try', async (code, statusCode, text) => {
    let refuse = true
    const { posted } = await mountHostBoard(({ userId }) => {
      if (refuse) throw createError({ statusCode, statusMessage: code })
      return { userId, inviteUrl: null }
    })
    await openSheet()

    await hold(sheetButton('Entfernen')!)

    expect(shownToasts()).toEqual([expect.objectContaining({ text, tone: 'error' })])
    expect(dialog()).toBeDefined()

    refuse = false
    await hold(sheetButton('Entfernen')!)
    expect(posted).toHaveLength(2)
    expect(dialog()).toBeUndefined()
  })

  it('closes with Esc and sends nothing, and the focus is back on the person', async () => {
    const { posted } = await mountHostBoard()
    await openSheet()

    dialog()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()

    expect(dialog()).toBeUndefined()
    expect(document.activeElement).toBe(larsiButton())
    expect(posted).toEqual([])
  })

  it('closes with Abbrechen and sends nothing, and the focus is back on the person', async () => {
    const { posted } = await mountHostBoard()
    await openSheet()

    sheetButton('Abbrechen')!.click()
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()

    expect(dialog()).toBeUndefined()
    expect(document.activeElement).toBe(larsiButton())
    expect(posted).toEqual([])
  })

  it('shows the switch on again when the sheet is opened after a removal with it off was cancelled', async () => {
    await mountHostBoard()
    await openSheet()
    rotateSwitch().click()
    await nextTick()
    expect(rotateSwitch().getAttribute('aria-checked')).toBe('false')
    sheetButton('Abbrechen')!.click()
    await new Promise(resolve => setTimeout(resolve, 50))
    await flushPromises()

    await openSheet()

    expect(rotateSwitch().getAttribute('aria-checked')).toBe('true')
    expect(switchHelp()).toBe(ROTATE_ON)
  })
})
