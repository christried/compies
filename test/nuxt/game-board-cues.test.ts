import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GameBoard from '~/components/GameBoard.vue'
import { immediateCueKey } from '~/composables/useImmediateCue'
import { DRAG_DISTANCE, LONG_PRESS_MS, SCROLL_DISTANCE } from '~/composables/useBoardDrag'
import type { Place } from '~~/shared/board'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { envelope, type RoomMessage } from '~~/shared/realtime'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty, signInAs } from './auth'
import { LARSI, memberView, SANNE } from './event-page'

// The Game board's sounds (#742, spec #718): which cue the board asks the player (handed down by the Event page, here a spy) for, and when. The
// pick-up, the answer the move awaits and the release are the three places that ask; an avatar that moves because of somebody else's move, or
// because a refetch confirms the own one, asks for nothing. What the cues are is test/unit/board-cues.test.ts, which files an Event page
// requests and how the player gates them is test/nuxt/event-cues-board.test.ts. The board's own motion and moves are test/nuxt/game-board.test.ts.
const settings: EventSettings = { ...defaultSettings(), teamCount: 2, teamSize: 2 }
const teams: BoardTeam[] = [{ position: 1, name: null }, { position: 2, name: null }]
const STANDS: Place = { zone: 'stands' }
const team = (n: number): Place => ({ zone: 'team', team: n })

function member(id: string, name: string, place: Place = STANDS, isHost = false): MemberView {
  return memberView({ id, name, isHost, zone: place.zone, team: place.zone === 'team' ? place.team : null })
}

const kittyAt = (place: Place = STANDS) => member(kitty.id, 'Kitty', place)
const larsiAt = (place: Place = STANDS) => member(LARSI, 'Larsi', place)
const sanneAt = (place: Place = STANDS) => member(SANNE, 'Sanne', place, true)

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
let played: ReturnType<typeof vi.fn>

interface Options {
  members?: MemberView[]
  teamChoiceOpen?: boolean
  viewerId?: string
  isHost?: boolean
  /** What the move endpoint answers; it may wait and throw. */
  answer?: (body: { userId: string, to: Place }) => Promise<unknown> | unknown
  /** Whether the Event page hands the player down: without it the board is alone, as in test/nuxt/game-board.test.ts. */
  provided?: boolean
}

async function mountBoard(options: Options = {}) {
  testNumber += 1
  const slug = `board-cues-${testNumber}`
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
  const page = await mountSuspended(GameBoard, {
    props: {
      slug,
      members: options.members ?? [kittyAt(), larsiAt(), sanneAt()],
      teams,
      settings,
      teamChoiceOpen: options.teamChoiceOpen ?? true,
      pageKind: options.teamChoiceOpen === false ? 'running' : 'teams',
      viewerId: options.viewerId ?? kitty.id,
      isHost: options.isHost ?? false,
      room: live.room,
    },
    global: { provide: options.provided === false ? {} : { [immediateCueKey as symbol]: played } },
  })
  return { page, posted, ...live }
}

type Board = Awaited<ReturnType<typeof mountBoard>>['page']

const settle = () => new Promise(resolve => setTimeout(resolve))
const person = (page: Board, userId: string) => page.get(`[data-user-id="${userId}"]`)
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')
const menuItem = (label: string) => [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(item => item.textContent?.includes(label))!

/** What the spy was asked for, as ids, in order. */
const heard = () => played.mock.calls.map(call => call[0] as string)

/** Where each zone sits on the page, for the drop: team 1 at the left, team 2 in the middle, the Tribüne below. */
const ZONES: Record<string, { left: number, top: number }> = {
  'team-1': { left: 0, top: 0 },
  'team-2': { left: 300, top: 0 },
  'stands': { left: 0, top: 300 },
}

function rectAt(left: number, top: number, size = 200): DOMRect {
  return { left, top, right: left + size, bottom: top + size, x: left, y: top, width: size, height: size, toJSON: () => ({}) }
}

function layOutBoard() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const zone = this.getAttribute('data-drop-zone') ?? this.closest('[data-drop-zone]')?.getAttribute('data-drop-zone')
    const at = zone ? ZONES[zone] : undefined
    if (!at) return rectAt(0, 0, 0)
    return this.hasAttribute('data-user-id') ? rectAt(at.left + 20, at.top + 40, 40) : rectAt(at.left, at.top)
  })
}

function pointer(type: 'pointermove' | 'pointerup' | 'pointercancel', x: number, y: number) {
  window.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true }))
}

/** A press on a person standing on the Tribüne, where the board lays them out (20, 340). */
const press = (page: Board, userId: string, pointerType: 'mouse' | 'touch' = 'mouse', at = { clientX: 20, clientY: 340 }) =>
  person(page, userId).trigger('pointerdown', { button: 0, pointerId: 1, pointerType, ...at })

const TEAM_ORANGE = [350, 50] as const
const NOWHERE = [900, 900] as const

beforeEach(() => {
  signInAs(kitty)
  useState('toasts').value = []
  played = vi.fn()
  layOutBoard()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the Game board\'s sounds, by mouse', () => {
  it('lifts once, past the drag distance and not before, and snaps when the server took the move', async () => {
    const { page } = await mountBoard()

    await press(page, kitty.id)
    expect(heard()).toEqual([])
    pointer('pointermove', 20 + DRAG_DISTANCE, 340)
    expect(heard()).toEqual([])
    pointer('pointermove', 20 + DRAG_DISTANCE + 1, 340)
    expect(heard()).toEqual(['drag-pick'])
    pointer('pointermove', 100, 340)
    pointer('pointermove', ...TEAM_ORANGE)
    expect(heard()).toEqual(['drag-pick'])
    pointer('pointerup', ...TEAM_ORANGE)

    await vi.waitFor(() => expect(heard()).toEqual(['drag-pick', 'drag-snap']))
  })

  it('asks for the cues at once, without a delay or a rate', async () => {
    const { page } = await mountBoard()

    await press(page, kitty.id)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)
    await vi.waitFor(() => expect(played).toHaveBeenCalledTimes(2))

    expect(played.mock.calls).toEqual([['drag-pick'], ['drag-snap']])
  })

  it('plays nothing for a press and a release without a move, which opens the menu', async () => {
    const { page } = await mountBoard()

    await press(page, kitty.id)
    pointer('pointerup', 20, 340)
    await person(page, kitty.id).trigger('click')
    await settle()

    expect(menu()).not.toBeNull()
    expect(heard()).toEqual([])
  })

  it('plays nothing for two presses in a row, the second finishing the first', async () => {
    const { page } = await mountBoard()

    await press(page, kitty.id)
    await press(page, kitty.id)
    pointer('pointerup', 20, 340)
    await settle()

    expect(heard()).toEqual([])
  })
})

describe('the Game board\'s sounds, by finger', () => {
  it('lifts when the long press arms, not at the first touch', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { page } = await mountBoard()

    await press(page, kitty.id, 'touch')
    expect(heard()).toEqual([])
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)
    expect(heard()).toEqual([])
    vi.advanceTimersByTime(1)
    expect(heard()).toEqual(['drag-pick'])
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)
    vi.useRealTimers()

    await vi.waitFor(() => expect(heard()).toEqual(['drag-pick', 'drag-snap']))
  })

  it('plays nothing for a finger that moves past the scroll distance before the long press', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { page } = await mountBoard()

    await press(page, kitty.id, 'touch')
    pointer('pointermove', 20, 340 - SCROLL_DISTANCE - 1)
    vi.advanceTimersByTime(LONG_PRESS_MS + 100)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)
    vi.useRealTimers()
    await settle()

    expect(heard()).toEqual([])
  })
})

describe('the Game board\'s sounds, when the move does not happen', () => {
  const lifted = async (board: Awaited<ReturnType<typeof mountBoard>>) => {
    await press(board.page, kitty.id)
    pointer('pointermove', 20 + DRAG_DISTANCE + 1, 340)
  }

  it('bounces when the server refuses with a 409', async () => {
    const board = await mountBoard({ answer: () => {
      throw createError({ statusCode: 409, statusMessage: 'team_choice_closed' })
    } })

    await lifted(board)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)

    await vi.waitFor(() => expect(heard()).toEqual(['drag-pick', 'drag-reject']))
  })

  it('bounces when the request fails with a 500', async () => {
    const board = await mountBoard({ answer: () => {
      throw createError({ statusCode: 500, statusMessage: 'boom' })
    } })

    await lifted(board)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)

    await vi.waitFor(() => expect(heard()).toEqual(['drag-pick', 'drag-reject']))
  })

  it('bounces for a release over no place', async () => {
    const board = await mountBoard()

    await lifted(board)
    pointer('pointermove', ...NOWHERE)
    pointer('pointerup', ...NOWHERE)
    await settle()

    expect(heard()).toEqual(['drag-pick', 'drag-reject'])
    expect(board.posted).toEqual([])
  })

  it('bounces for Escape', async () => {
    const board = await mountBoard()

    await lifted(board)
    pointer('pointermove', ...TEAM_ORANGE)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await settle()

    expect(heard()).toEqual(['drag-pick', 'drag-reject'])
  })

  it('bounces for a cancelled pointer', async () => {
    const board = await mountBoard()

    await lifted(board)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointercancel', ...TEAM_ORANGE)
    await settle()

    expect(heard()).toEqual(['drag-pick', 'drag-reject'])
  })

  it('bounces for a drop on the person\'s own place', async () => {
    const board = await mountBoard()

    await lifted(board)
    pointer('pointermove', 50, 340)
    pointer('pointerup', 50, 340)
    await settle()

    expect(heard()).toEqual(['drag-pick', 'drag-reject'])
    expect(board.posted).toEqual([])
  })
})

describe('the Game board\'s sounds, from the keyboard route', () => {
  it('snaps for a pick in the MoveToMenu, with no lift', async () => {
    const { page } = await mountBoard()

    await person(page, kitty.id).trigger('click')
    menuItem('Nach Team Orange').click()

    await vi.waitFor(() => expect(heard()).toEqual(['drag-snap']))
  })

  it('bounces for a pick the server refuses, with no lift', async () => {
    const { page } = await mountBoard({
      members: [kittyAt(), larsiAt(), sanneAt(team(1))],
      answer: () => {
        throw createError({ statusCode: 409, statusMessage: 'team_full', data: { winnerId: LARSI } })
      },
    })

    await person(page, kitty.id).trigger('click')
    menuItem('Nach Team Rot').click()

    await vi.waitFor(() => expect(heard()).toEqual(['drag-reject']))
  })

  it('plays nothing for a target with a reason, which cannot be picked', async () => {
    const { page } = await mountBoard({ teamChoiceOpen: false })

    await person(page, kitty.id).trigger('click')
    expect(menuItem('Nach Team Orange').getAttribute('aria-disabled')).toBe('true')
    menuItem('Nach Team Orange').click()
    await settle()

    expect(heard()).toEqual([])
  })
})

describe('the Game board\'s sounds for a Host', () => {
  it('lifts and snaps for the Member the Host drags', async () => {
    const { page, posted } = await mountBoard({ viewerId: SANNE, isHost: true })

    await press(page, LARSI)
    pointer('pointermove', 50, 50)
    pointer('pointerup', 50, 50)

    await vi.waitFor(() => expect(heard()).toEqual(['drag-pick', 'drag-snap']))
    expect(posted).toEqual([{ userId: LARSI, to: team(1) }])
  })

  it('snaps for the Member the Host moves through the menu', async () => {
    const { page } = await mountBoard({ viewerId: SANNE, isHost: true })

    await person(page, LARSI).trigger('click')
    menuItem('Nach Team Rot').click()

    await vi.waitFor(() => expect(heard()).toEqual(['drag-snap']))
  })

  it('plays nothing for a Player who presses somebody else\'s avatar', async () => {
    const { page, posted } = await mountBoard()

    await press(page, LARSI)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)
    await settle()

    expect(heard()).toEqual([])
    expect(posted).toEqual([])
  })
})

describe('the Game board\'s silence for moves that are not the User\'s own', () => {
  it('plays nothing for another Member\'s move, nor for the refetch that confirms it', async () => {
    const { page, send } = await mountBoard()

    send({ type: 'member.moved', userId: LARSI, from: STANDS, to: team(2), by: SANNE })
    await nextTick()
    await page.setProps({ members: [kittyAt(), larsiAt(team(2)), sanneAt()] })
    await settle()

    expect(person(page, LARSI).attributes('aria-label')).toBe('Larsi, Team Orange')
    expect(heard()).toEqual([])
  })

  it('plays nothing more when the refetch confirms the own move: one snap, no second', async () => {
    const { page } = await mountBoard()

    await press(page, kitty.id)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)
    await vi.waitFor(() => expect(heard()).toEqual(['drag-pick', 'drag-snap']))
    await page.setProps({ members: [kittyAt(team(2)), larsiAt(), sanneAt()] })
    await nextTick()
    await settle()

    expect(heard()).toEqual(['drag-pick', 'drag-snap'])
  })

  it('asks for nothing, and throws nothing, where the Event page handed no player down', async () => {
    const { page, posted } = await mountBoard({ provided: false })

    await press(page, kitty.id)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)
    await settle()

    expect(posted).toEqual([{ userId: kitty.id, to: team(2) }])
    expect(heard()).toEqual([])
  })
})
