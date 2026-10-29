import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameBoard from '~/components/GameBoard.vue'
import type { Place } from '~~/shared/board'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import EventPage from '~/pages/e/[slug]/index.vue'
import { kitty, signInAs } from './auth'
import { LARSI, SANNE, serve, shownToasts, view } from './event-page'

// The Game board (#160, spec #153 § Game board): the three phases, moving by drag and by keyboard, the MoveToMenu with
// the reasons, the own move that shows at once and comes back with a toast, the Host's uneven notice, and the glide of
// somebody else's move. The room is a fake the test plays messages on; the move endpoint records what is posted.
const settings: EventSettings = { ...defaultSettings(), teamCount: 2, teamSize: 2 }
const teams: BoardTeam[] = [{ position: 1 }, { position: 2 }]
const BENCH: Place = { zone: 'bench' }
const team = (n: number): Place => ({ zone: 'team', team: n })

function member(id: string, name: string, place: Place = BENCH, isHost = false): MemberView {
  return { id, name, image: null, isHost, zone: place.zone, team: place.zone === 'team' ? place.team : null }
}

const kittyAt = (place: Place = BENCH) => member(kitty.id, 'Kitty', place)
const larsiAt = (place: Place = BENCH) => member(LARSI, 'Larsi', place)
const sanneAt = (place: Place = BENCH) => member(SANNE, 'Sanne', place, true)

function fakeRoom() {
  const handlers = new Map<string, ((message: unknown) => void)[]>()
  return {
    room: {
      on: (type: string, handler: (message: never) => void) => {
        handlers.set(type, [...(handlers.get(type) ?? []), handler as (message: unknown) => void])
        return () => undefined
      },
    },
    send(message: RoomMessage) {
      for (const handler of handlers.get(message.type) ?? []) handler(envelope(message, Date.now()))
    },
  }
}

let testNumber = 0

interface Options {
  members?: MemberView[]
  settings?: EventSettings | null
  teamChoiceOpen?: boolean
  viewerId?: string
  isHost?: boolean
  /** What the move endpoint answers; it may wait and throw. */
  answer?: (body: { userId: string, to: Place }) => Promise<unknown> | unknown
}

/** A board for one test, with a move endpoint that records every body posted to it. */
async function mountBoard(options: Options = {}) {
  testNumber += 1
  const slug = `board-${testNumber}`
  const posted: { userId: string, to: Place }[] = []
  registerEndpoint(`/api/e/${slug}/move`, {
    method: 'POST',
    handler: async (event) => {
      const body = await readBody(event) as { userId: string, to: Place }
      posted.push(body)
      return options.answer ? await options.answer(body) : { userId: body.userId, to: body.to }
    },
  })
  const live = fakeRoom()
  const resolvedSettings = options.settings === undefined ? settings : options.settings
  const page = await mountSuspended(GameBoard, {
    props: {
      slug,
      members: options.members ?? [kittyAt(), larsiAt(), sanneAt()],
      teams: resolvedSettings ? teams : [],
      settings: resolvedSettings,
      teamChoiceOpen: options.teamChoiceOpen ?? true,
      viewerId: options.viewerId ?? kitty.id,
      isHost: options.isHost ?? false,
      room: live.room,
    },
  })
  return { page, posted, ...live }
}

type Board = Awaited<ReturnType<typeof mountBoard>>['page']

const settle = () => new Promise(resolve => setTimeout(resolve))
const person = (page: Board, userId: string) => page.get(`[data-user-id="${userId}"]`)
const group = (page: Board, label: string) => page.get(`[role="group"][aria-label="${label}"]`)
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')
const menuItem = (label: string) => [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(item => item.textContent?.includes(label))!

/** Where each zone sits on the page, for the drop: team 1 at the left, team 2 in the middle, Bench and Stands below. */
const ZONES: Record<string, { left: number, top: number }> = {
  'team-1': { left: 0, top: 0 },
  'team-2': { left: 300, top: 0 },
  'bench': { left: 0, top: 300 },
  'stands': { left: 300, top: 300 },
}

function rectAt(left: number, top: number, size = 200): DOMRect {
  return { left, top, right: left + size, bottom: top + size, x: left, y: top, width: size, height: size, toJSON: () => ({}) }
}

/** Gives every zone a place on the page and every person the place of their zone, as a browser would lay them out. */
function layOutBoard() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const zone = this.getAttribute('data-drop-zone') ?? this.closest('[data-drop-zone]')?.getAttribute('data-drop-zone')
    const at = zone ? ZONES[zone] : undefined
    if (!at) return rectAt(0, 0, 0)
    return this.hasAttribute('data-user-id') ? rectAt(at.left + 20, at.top + 40, 40) : rectAt(at.left, at.top)
  })
}

function pointer(type: 'pointermove' | 'pointerup', x: number, y: number) {
  window.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true }))
}

describe('GameBoard', () => {
  beforeEach(() => {
    signInAs(kitty)
    useState('toasts').value = []
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe('the phases', () => {
    it('shows only the Bench and the Stands, and says why, for an Event that was never set up', async () => {
      const { page } = await mountBoard({ settings: null, teamChoiceOpen: false })

      expect(page.text()).toContain('Teams gibt es, sobald das Event eingerichtet ist. Bis dahin: Bench oder Tribüne.')
      expect(group(page, 'Bench').text()).toContain('Larsi')
      expect(group(page, 'Tribüne').text()).toContain('Die Tribüne ist leer.')
      expect(page.findAll('[role="group"]').map(element => element.attributes('aria-label'))).toEqual(['Bench', 'Tribüne'])
    })

    it('locks the free slots with the reason for a Player while no Session has a Date', async () => {
      const { page } = await mountBoard({ teamChoiceOpen: false })

      expect(page.text()).toContain('Teamwahl öffnet, sobald der Termin steht. Bis dahin: Bench oder Tribüne.')
      const locked = page.findAll('[role="img"]')
      expect(locked).toHaveLength(4)
      expect(locked[0]!.attributes('aria-label')).toBe('Zu. Teamwahl öffnet, sobald der Termin steht.')
      expect(locked[0]!.text()).toBe('Zu')
      expect(page.text()).not.toContain('Frei')
    })

    it('leaves the free slots open for the Host in the poll, who may move anyone any time', async () => {
      const { page } = await mountBoard({ teamChoiceOpen: false, viewerId: SANNE, isHost: true })

      expect(page.findAll('[role="img"]')).toHaveLength(0)
      expect(page.text()).toContain('Frei')
    })

    it('shows the free slots up to the Team size when Team choice is open, and names them in the zone', async () => {
      const { page } = await mountBoard({ members: [kittyAt(), larsiAt(team(1)), sanneAt()] })

      expect(group(page, 'Team Rot, 1 von 2 frei').text()).toContain('Larsi')
      expect(group(page, 'Team Rot, 1 von 2 frei').text()).toContain('Frei')
      expect(group(page, 'Team Orange, 2 von 2 frei').text().match(/Frei/g)).toHaveLength(2)
      expect(page.findAll('[role="img"]')).toHaveLength(0)
    })
  })

  describe('moving from the keyboard', () => {
    it('opens the MoveToMenu from a person and moves them to the place picked', async () => {
      const { page, posted } = await mountBoard()
      const button = person(page, kitty.id)

      await button.trigger('click')

      expect(button.attributes('aria-expanded')).toBe('true')
      expect(menu()).not.toBeNull()
      expect(menu()!.getAttribute('role')).toBe('menu')
      expect(document.body.textContent).toContain('Wohin, Kitty?')
      expect(document.activeElement?.getAttribute('role')).toBe('menuitem')
      menuItem('Nach Team Orange').click()
      await vi.waitFor(() => expect(posted).toEqual([{ userId: kitty.id, to: team(2) }]))
      await settle()
      expect(menu()).toBeNull()
    })

    it('moves to the Stands the same way', async () => {
      const { page, posted } = await mountBoard()

      await person(page, kitty.id).trigger('click')
      menuItem('Auf die Tribüne').click()

      await vi.waitFor(() => expect(posted).toEqual([{ userId: kitty.id, to: { zone: 'stands' } }]))
    })
  })

  describe('the MoveToMenu reasons', () => {
    it('disables a full team, the place the person is in, and says why', async () => {
      const { page, posted } = await mountBoard({ members: [kittyAt(), larsiAt(team(1)), sanneAt(team(1))] })

      await person(page, kitty.id).trigger('click')

      const full = menuItem('Nach Team Rot')
      expect(full.getAttribute('aria-disabled')).toBe('true')
      expect(full.textContent).toContain('Team ist voll.')
      expect(menuItem('Auf die Bench').textContent).toContain('Ist schon hier.')
      expect(menuItem('Nach Team Orange').getAttribute('aria-disabled')).toBeNull()
      full.click()
      await settle()
      expect(posted).toEqual([])
    })

    it('disables the teams in the poll with the reason but keeps the Stands open', async () => {
      const { page } = await mountBoard({ teamChoiceOpen: false })

      await person(page, kitty.id).trigger('click')

      expect(menuItem('Nach Team Rot').getAttribute('aria-disabled')).toBe('true')
      expect(menuItem('Nach Team Rot').textContent).toContain('Teamwahl öffnet, sobald der Termin steht.')
      expect(menuItem('Auf die Tribüne').getAttribute('aria-disabled')).toBeNull()
    })

    it('lets a Player see that only the Host moves somebody else', async () => {
      const { page } = await mountBoard()

      await person(page, LARSI).trigger('click')

      expect(document.body.textContent).toContain('Wohin, Larsi?')
      const items = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      expect(items).toHaveLength(4)
      expect(items.every(item => item.getAttribute('aria-disabled') === 'true')).toBe(true)
      expect(items[0]!.textContent).toContain('Nur der Host kann andere verschieben.')
    })

    it('lets the Host move somebody else into a team', async () => {
      const { page, posted } = await mountBoard({ viewerId: SANNE, isHost: true, teamChoiceOpen: false })

      await person(page, LARSI).trigger('click')
      expect(menuItem('Nach Team Rot').getAttribute('aria-disabled')).toBeNull()
      menuItem('Nach Team Rot').click()

      await vi.waitFor(() => expect(posted).toEqual([{ userId: LARSI, to: team(1) }]))
    })
  })

  describe('dragging', () => {
    it('moves a Player who drops their own avatar on a team, and lights the team up on the way', async () => {
      layOutBoard()
      const { page, posted } = await mountBoard()

      await person(page, kitty.id).trigger('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 340 })
      pointer('pointermove', 350, 50)
      await nextTick()

      expect(group(page, 'Team Orange, 2 von 2 frei').text()).toContain('Hier rein')
      expect(page.get('[role="status"]').text()).toBe('Team Orange, 2 von 2 frei')
      pointer('pointerup', 350, 50)

      await vi.waitFor(() => expect(posted).toEqual([{ userId: kitty.id, to: team(2) }]))
    })

    it('does not move anyone who lets go over a place that does not take them', async () => {
      layOutBoard()
      const { page, posted } = await mountBoard({ members: [kittyAt(), larsiAt(team(1)), sanneAt(team(1))] })

      await person(page, kitty.id).trigger('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 340 })
      pointer('pointermove', 50, 50)
      pointer('pointerup', 50, 50)
      await settle()

      expect(posted).toEqual([])
      expect(person(page, kitty.id).attributes('aria-label')).toBe('Kitty, Bench')
    })

    it('does not let a Player pick somebody else up, but the Host may', async () => {
      layOutBoard()
      const player = await mountBoard()
      await person(player.page, LARSI).trigger('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 340 })
      pointer('pointermove', 350, 50)
      pointer('pointerup', 350, 50)
      await settle()
      expect(player.posted).toEqual([])

      const host = await mountBoard({ viewerId: SANNE, isHost: true })
      await person(host.page, LARSI).trigger('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', clientX: 20, clientY: 340 })
      pointer('pointermove', 50, 50)
      pointer('pointerup', 50, 50)
      await vi.waitFor(() => expect(host.posted).toEqual([{ userId: LARSI, to: team(1) }]))
    })

    it('picks a finger up only after a long press of 300 ms', async () => {
      layOutBoard()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { page, posted } = await mountBoard()

      await person(page, kitty.id).trigger('pointerdown', { button: 0, pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 340 })
      vi.advanceTimersByTime(300)
      pointer('pointermove', 350, 50)
      pointer('pointerup', 350, 50)
      vi.useRealTimers()

      await vi.waitFor(() => expect(posted).toEqual([{ userId: kitty.id, to: team(2) }]))
    })

    it('lets a finger that moves before the long press scroll instead of dragging', async () => {
      layOutBoard()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const { page, posted } = await mountBoard()

      await person(page, kitty.id).trigger('pointerdown', { button: 0, pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 340 })
      pointer('pointermove', 20, 300)
      vi.advanceTimersByTime(400)
      pointer('pointermove', 350, 50)
      pointer('pointerup', 350, 50)
      vi.useRealTimers()
      await settle()

      expect(posted).toEqual([])
    })
  })

  describe('an own move', () => {
    it('shows at once, before the server has answered', async () => {
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const { page, posted } = await mountBoard({ answer: async (body) => {
        await gate
        return { userId: body.userId, to: body.to }
      } })

      await person(page, kitty.id).trigger('click')
      menuItem('Nach Team Rot').click()
      await vi.waitFor(() => expect(posted).toHaveLength(1))
      await nextTick()

      expect(person(page, kitty.id).attributes('aria-label')).toBe('Kitty, Team Rot')
      expect(group(page, 'Team Rot, 1 von 2 frei').text()).toContain('Du')
      release()
      await settle()
    })

    it('goes back to where it was with a toast when the server refuses', async () => {
      const { page } = await mountBoard({ answer: () => {
        throw createError({ statusCode: 409, statusMessage: 'team_choice_closed' })
      } })

      await person(page, kitty.id).trigger('click')
      menuItem('Nach Team Rot').click()

      await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Teamwahl öffnet, sobald der Termin steht.'))
      expect(person(page, kitty.id).attributes('aria-label')).toBe('Kitty, Bench')
    })

    it('names the winner when it lost the race for the last place', async () => {
      let refuse: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        refuse = resolve
      })
      const { page } = await mountBoard({
        members: [kittyAt(), larsiAt(), sanneAt(team(1))],
        answer: async () => {
          await gate
          throw createError({ statusCode: 409, statusMessage: 'team_full', data: { winnerId: LARSI } })
        },
      })

      await person(page, kitty.id).trigger('click')
      menuItem('Nach Team Rot').click()
      await vi.waitFor(() => expect(person(page, kitty.id).attributes('aria-label')).toBe('Kitty, Team Rot'))
      refuse()

      await vi.waitFor(() => expect(shownToasts().map(toast => toast.text)).toContain('Larsi war schneller. Der letzte Platz in Team Rot ist weg.'))
      expect(person(page, kitty.id).attributes('aria-label')).toBe('Kitty, Bench')
    })
  })

  describe('somebody else\'s move', () => {
    it('moves their avatar as soon as the room says so', async () => {
      const { page, send } = await mountBoard()
      expect(person(page, LARSI).attributes('aria-label')).toBe('Larsi, Bench')

      send({ type: 'member.moved', userId: LARSI, from: BENCH, to: team(2), by: SANNE })
      await nextTick()

      expect(person(page, LARSI).attributes('aria-label')).toBe('Larsi, Team Orange')
      expect(group(page, 'Team Orange, 1 von 2 frei').text()).toContain('Larsi')
    })

    it('glides the avatar from its old slot to the new one', async () => {
      layOutBoard()
      const animate = vi.fn()
      Element.prototype.animate = animate
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? 'full' : '') } as CSSStyleDeclaration)
      const { page, send } = await mountBoard()

      send({ type: 'member.moved', userId: LARSI, from: BENCH, to: team(2), by: SANNE })
      await nextTick()
      await nextTick()

      expect(animate).toHaveBeenCalled()
      const [keyframes] = animate.mock.calls[0] as [{ transform: string }[]]
      expect(keyframes[0]!.transform).toBe('translate(-300px, 300px)')
      expect(person(page, LARSI).attributes('aria-label')).toBe('Larsi, Team Orange')
    })

    it('places the avatar without any animation when motion is reduced', async () => {
      layOutBoard()
      const animate = vi.fn()
      Element.prototype.animate = animate
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? 'reduced' : '') } as CSSStyleDeclaration)
      const { page, send } = await mountBoard()

      send({ type: 'member.moved', userId: LARSI, from: BENCH, to: team(2), by: SANNE })
      await nextTick()
      await nextTick()

      expect(animate).not.toHaveBeenCalled()
      expect(person(page, LARSI).attributes('aria-label')).toBe('Larsi, Team Orange')
    })
  })

  describe('on the Event page', () => {
    it('shows the board where the Baustelle was, with the Members from the Event read', async () => {
      signInAs(kitty)
      const { slug } = serve(s => view(s, [], {
        settings,
        teams,
        teamChoiceOpen: true,
        members: [kittyAt(), larsiAt(team(1)), sanneAt()],
      }))

      const page = await mountSuspended(EventPage, { route: `/e/${slug}` })

      expect(page.text()).toContain('Spielbrett')
      expect(page.text()).not.toContain('Spielbrett im Rohbau')
      expect(page.get('[role="group"][aria-label="Team Rot, 1 von 2 frei"]').text()).toContain('Larsi')
      expect(page.get('[role="group"][aria-label="Bench"]').text()).toContain('Sanne')
    })
  })

  describe('the uneven notice', () => {
    const uneven = [kittyAt(), larsiAt(team(1)), sanneAt(team(1))]

    it('tells the Host which team is short', async () => {
      const { page } = await mountBoard({ members: uneven, viewerId: SANNE, isHost: true })

      expect(page.text()).toContain('Team Orange hat 0, die anderen haben 2. Das Spiel startet erst, wenn alle Teams gleich groß sind.')
      expect(page.text()).toContain('Nur du siehst das')
    })

    it('does not tell a Player', async () => {
      const { page } = await mountBoard({ members: uneven })

      expect(page.text()).not.toContain('Das Spiel startet erst')
    })

    it('stays away when the teams are the same size, and for an Event without teams', async () => {
      const even = await mountBoard({ members: [kittyAt(team(1)), larsiAt(team(2)), sanneAt()], viewerId: SANNE, isHost: true })
      expect(even.page.text()).not.toContain('Das Spiel startet erst')

      const none = await mountBoard({ settings: null, teamChoiceOpen: false, viewerId: SANNE, isHost: true })
      expect(none.page.text()).not.toContain('Das Spiel startet erst')
    })
  })
})
