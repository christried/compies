import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DRAG_DISTANCE } from '~/composables/useBoardDrag'
import { refreshEvent } from '~/composables/useEventView'
import { CUE_GROUPS, CUE_IDS, cueFilesOf, type CueGroup, type CueId } from '~/utils/sound-cues'
import type { Place } from '~~/shared/board'
import type { MemberView } from '~~/shared/event'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { FakeAudioContext } from '../fake-audio'
import { kitty, signInAs } from './auth'
import { LARSI, memberView, SANNE, stubScreen, viewWithSessions, type EventOverrides } from './event-page'
import { FIRST, halo, mount, mountedPage, SESSION, serveState, team, unmountPage } from './event-page-states'

// The Game board's sounds on the Event page (#742, spec #718): the viewer's own pick-up, snap and bounce through the page's player, the files an
// Event that is set up and not finished requests, and the silence for somebody else's move. The board's calls are test/nuxt/game-board-cues.test.ts
// (a spy under the hand-down), the group's rule test/unit/board-cues.test.ts; the audio context is the fake of test/fake-audio.ts and the
// cue log is the staging build's.

const BOARD_FILES = cueFilesOf(['board'])
const SETTINGS: EventSettings = { ...defaultSettings(), teamCount: 2, teamSize: 2 }
const STANDS: Place = { zone: 'stands' }
const place = (n: number): Place => ({ zone: 'team', team: n })

/** The requests each cue file got. The handlers answer with the cue id as bytes, which the fake decodes back to `{ id }`. */
const requests: Record<string, number> = {}
for (const id of CUE_IDS) {
  registerEndpoint(`/sounds/cues/${id}.wav`, () => {
    requests[id] = (requests[id] ?? 0) + 1
    return new TextEncoder().encode(id)
  })
}
const requested = () => Object.keys(requests).filter(id => requests[id]).sort()
/** The requested files of these groups: an assertion names the groups it is about, so another moment's files never break it (#718). */
const requestedOf = (...groups: CueGroup[]) => requested().filter(id => CUE_GROUPS[id as CueId].some(group => groups.includes(group)))

const context = () => FakeAudioContext.instances.at(-1)
/** The Game board's sounds that started, in order. */
const dragSounds = () => (context()?.started() ?? []).map(source => String(source.id)).filter(id => id.startsWith('drag-'))
const log = () => ((globalThis as { __compiesCueLog?: () => { id: CueId, outcome: string }[] }).__compiesCueLog?.() ?? []).filter(entry => entry.id.startsWith('drag-'))
const logged = () => log().map(entry => entry.id)

const standings = [{ team: 1, rank: 1, points: 0 }, { team: 2, rank: 1, points: 0 }]
const end = { played: 0, gameCount: 6, complete: false, tie: null, finish: null, lastGame: null }

/** What the Event read holds while Team choice is open: Kitty (the viewer), Larsi and Sanne (the Host), seated as the test says. */
const readOf = (slug: string, { host = false, seats = [STANDS, STANDS, STANDS], settings = SETTINGS as EventSettings | null, phase = 'poll', overrides = {} }: { host?: boolean, seats?: Place[], settings?: EventSettings | null, phase?: string, overrides?: EventOverrides } = {}) => {
  const seat = (id: string, name: string, isHost: boolean, at: Place): MemberView => memberView({ id, name, isHost, zone: at.zone, team: at.zone === 'team' ? at.team : null })
  return viewWithSessions(slug, [SESSION(1, FIRST)], 0, {
    event: { phase, isHost: host },
    settings,
    teams: settings ? [team(1), team(2)] : [],
    teamChoiceOpen: true,
    members: [seat(kitty.id, 'Kitty', false, seats[0]!), seat(LARSI, 'Larsi', false, seats[1]!), seat(SANNE, 'Sanne', true, seats[2]!)],
    standings: settings ? standings : null,
    end: settings ? end : null,
    ...overrides,
  })
}

interface Served { slug: string, set: (next: ReturnType<typeof readOf>) => void, posted: { userId: string, to: Place }[], answer: { current: (body: { userId: string, to: Place }) => unknown } }

function serveBoard(options: { host?: boolean, seats?: Place[], settings?: EventSettings | null, phase?: string, overrides?: EventOverrides } = {}): Served {
  const served = serveState({ sessions: [SESSION(1, FIRST)], missing: 0 })
  served.set(readOf(served.slug, options))
  const posted: Served['posted'] = []
  const answer: Served['answer'] = { current: body => ({ userId: body.userId, to: body.to }) }
  registerEndpoint(`/api/e/${served.slug}/move`, {
    method: 'POST',
    handler: async (event) => {
      const body = await readBody(event) as { userId: string, to: Place }
      posted.push(body)
      return answer.current(body)
    },
  })
  return { ...served, posted, answer }
}

const ZONES: Record<string, { left: number, top: number }> = {
  'team-1': { left: 0, top: 0 },
  'team-2': { left: 300, top: 0 },
  'stands': { left: 0, top: 300 },
}
const rectAt = (left: number, top: number, size = 200) => ({ left, top, right: left + size, bottom: top + size, x: left, y: top, width: size, height: size, toJSON: () => ({}) }) as DOMRect

/** Gives every zone a place on the page and every person the place of their zone, as a browser would lay them out. */
function layOutBoard() {
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const zone = this.getAttribute('data-drop-zone') ?? this.closest('[data-drop-zone]')?.getAttribute('data-drop-zone')
    const at = zone ? ZONES[zone] : undefined
    if (!at) return rectAt(0, 0, 0)
    return this.hasAttribute('data-user-id') ? rectAt(at.left + 20, at.top + 40, 40) : rectAt(at.left, at.top)
  })
}

const pointer = (type: 'pointermove' | 'pointerup', x: number, y: number) => window.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, bubbles: true }))
const person = (userId: string) => mountedPage()!.get(`[data-user-id="${userId}"]`)
const press = (userId: string, x = 20, y = 340) => person(userId).trigger('pointerdown', { button: 0, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y })
const TEAM_ORANGE = [350, 50] as const
const NOWHERE = [900, 900] as const
const menu = () => document.querySelector<HTMLElement>('[role="menu"]')
const menuItem = (label: string) => [...(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])].find(item => item.textContent?.includes(label))!

/** The page has asked for the three files, decoded them and is ready to play. */
async function filesReady() {
  await vi.waitFor(() => expect(requestedOf('board')).toHaveLength(BOARD_FILES.length))
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 20))
}
const settle = () => new Promise(resolve => setTimeout(resolve, 60))
function reduced() {
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: (name: string) => (name === '--cp-motion' ? 'reduced' : '') } as CSSStyleDeclaration)
}

async function open(served: Served) {
  await mount(served.slug)
  await filesReady()
}

beforeEach(() => {
  signInAs(kitty)
  stubScreen(true)
  layOutBoard()
  FakeAudioContext.instances = []
  FakeAudioContext.follows = true
  for (const id of CUE_IDS) requests[id] = 0
  vi.stubGlobal('AudioContext', FakeAudioContext)
  useRuntimeConfig().public.staging = true
})

afterEach(() => {
  unmountPage()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  FakeAudioContext.follows = false
  localStorage.removeItem('compies-sound')
  useRuntimeConfig().public.staging = false
  Reflect.deleteProperty(globalThis, '__compiesCueLog')
})

for (const host of [true, false]) {
  const who = host ? 'the Host' : 'a Member'
  const own = host ? LARSI : kitty.id

  describe(`the Game board's sounds for ${who}`, () => {
    it('request the three files once for an Event that is set up and not finished', async () => {
      const served = serveBoard({ host })

      await open(served)

      expect(requestedOf('board')).toEqual([...BOARD_FILES].sort())
      for (const id of BOARD_FILES) expect(requests[id], id).toBe(1)
    })

    it('request no board file for an Event without settings, and none for a finished Event', async () => {
      const unset = serveBoard({ host, settings: null })
      await mount(unset.slug)
      await settle()
      expect(requestedOf('board')).toEqual([])
      unmountPage()

      stubScreen(true)
      const finished = serveBoard({ host, phase: 'finished' })
      await mount(finished.slug)
      await settle()
      expect(requestedOf('board')).toEqual([])
    })

    it('lift and snap for a drop the server takes, once each and in that order', async () => {
      const served = serveBoard({ host })
      await open(served)

      await press(own)
      pointer('pointermove', 20 + DRAG_DISTANCE + 1, 340)
      pointer('pointermove', ...TEAM_ORANGE)
      pointer('pointerup', ...TEAM_ORANGE)
      await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-pick', 'drag-snap']))
      await settle()

      expect(dragSounds()).toEqual(['drag-pick', 'drag-snap'])
      expect(logged()).toEqual(['drag-pick', 'drag-snap'])
      expect(log().every(entry => entry.outcome !== 'skipped')).toBe(true)
    })

    it('lift and bounce for a refusal', async () => {
      const served = serveBoard({ host })
      served.answer.current = () => {
        throw createError({ statusCode: 409, statusMessage: 'team_choice_closed' })
      }
      await open(served)

      await press(own)
      pointer('pointermove', ...TEAM_ORANGE)
      pointer('pointerup', ...TEAM_ORANGE)

      await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-pick', 'drag-reject']))
      expect(logged()).toEqual(['drag-pick', 'drag-reject'])
    })

    it('lift and bounce for a release over no place', async () => {
      const served = serveBoard({ host })
      await open(served)

      await press(own)
      pointer('pointermove', ...NOWHERE)
      pointer('pointerup', ...NOWHERE)
      await settle()

      expect(dragSounds()).toEqual(['drag-pick', 'drag-reject'])
      expect(served.posted).toEqual([])
    })

    it('snap, with no lift, for a pick in the MoveToMenu, and bounce for one the server refuses', async () => {
      const served = serveBoard({ host })
      await open(served)

      await person(own).trigger('click')
      menuItem('Nach Team Orange').click()
      await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-snap']))
      served.answer.current = () => {
        throw createError({ statusCode: 409, statusMessage: 'team_choice_closed' })
      }
      await settle()
      await person(own).trigger('click')
      menuItem('Nach Team Rot').click()

      await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-snap', 'drag-reject']))
    })

    it('play nothing for another Member\'s move, which the next read of the Event holds, nor for a read that confirms the own move', async () => {
      const served = serveBoard({ host })
      await open(served)

      served.set(readOf(served.slug, { host, seats: [STANDS, place(2), STANDS] }))
      await refreshEvent(served.slug)
      await flushPromises()
      await settle()
      expect(person(LARSI).attributes('aria-label')).toBe('Larsi, Team Orange')
      expect(dragSounds()).toEqual([])
      expect(logged()).toEqual([])

      // The own move, which the read the move itself refetches already holds, and one more read afterwards.
      served.set(readOf(served.slug, { host, seats: [place(1), place(2), STANDS] }))
      await press(own === LARSI ? kitty.id : own)
      pointer('pointermove', 50, 50)
      pointer('pointerup', 50, 50)
      await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-pick', 'drag-snap']))
      await refreshEvent(served.slug)
      await flushPromises()
      await settle()

      expect(dragSounds()).toEqual(['drag-pick', 'drag-snap'])
    })

    it('keep all three sounding under reduced motion', async () => {
      const served = serveBoard({ host })
      await open(served)
      reduced()

      await press(own)
      pointer('pointermove', ...TEAM_ORANGE)
      pointer('pointerup', ...TEAM_ORANGE)
      await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-pick', 'drag-snap']))

      await press(own, 350, 50)
      pointer('pointermove', ...NOWHERE)
      pointer('pointerup', ...NOWHERE)
      await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-pick', 'drag-snap', 'drag-pick', 'drag-reject']))
    })

    it('request no file and play nothing with Ton off, and log nothing', async () => {
      localStorage.setItem('compies-sound', 'off')
      const served = serveBoard({ host })
      await mount(served.slug)
      await flushPromises()

      await press(own)
      pointer('pointermove', ...TEAM_ORANGE)
      pointer('pointerup', ...TEAM_ORANGE)
      await vi.waitFor(() => expect(served.posted).toHaveLength(1))
      await settle()

      expect(requested()).toEqual([])
      expect(dragSounds()).toEqual([])
      expect(log()).toEqual([])
    })
  })
}

// Secrecy (CODING_STANDARDS § Secrecy): the group's rule reads `standings` and the phase, never the wheel, the Round's game or the settings'
// secrets. The same own drop with a Hidden wheel setting and a drawn game, and with no wheel, requests and sounds the same.
describe('the Game board\'s sounds and Secrecy', () => {
  async function dropWith(overrides: EventOverrides, settings: EventSettings) {
    for (const id of CUE_IDS) requests[id] = 0
    FakeAudioContext.instances = []
    const served = serveBoard({ settings, overrides })
    await open(served)
    await press(kitty.id)
    pointer('pointermove', ...TEAM_ORANGE)
    pointer('pointerup', ...TEAM_ORANGE)
    await vi.waitFor(() => expect(dragSounds()).toEqual(['drag-pick', 'drag-snap']))
    const result = { files: requestedOf('board'), started: dragSounds(), logged: logged() }
    unmountPage()
    stubScreen(true)
    return result
  }

  it('are the same with a Hidden wheel setting and a drawn game as with no wheel', async () => {
    const plain = await dropWith({}, SETTINGS)
    const hidden = await dropWith({ rounds: [{ id: 'r1', startedAt: FIRST, setAt: FIRST, game: halo }] }, { ...SETTINGS, hiddenWheel: true })

    expect(hidden).toEqual(plain)
    expect(plain.files).toEqual([...BOARD_FILES].sort())
  })
})
