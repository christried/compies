import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { events, pollSlots } from '../../server/db/schema'
import type { Db } from '../../server/utils/db'
import { ACTIVITY_TYPES, type ActivityEntry, type ActivityPage } from '../../shared/activity'
import type { Place } from '../../shared/board'
import type { CreatedEvent, EventView } from '../../shared/event'
import type { RoomMessageType } from '../../shared/realtime'
import { SPIN, WINDOW_MS } from '../draw-offsets'
import { sendVia } from './app'
import { hiddenWheelWorld } from './hidden-wheel-world'
import { hostPutsBack, hostSets, hostSpins, hostTossesCoin, playerVetoes, signInAs, type Signed } from './scenario'

// The room and the Activity feed under a Hidden wheel (#165): every message type and Activity type the lobby flow writes, and
// no pool game in any of them. Split out of hidden-wheel.test.ts in #418.

describe('Hidden wheel secrecy (#148)', () => {
  const world = hiddenWheelWorld()
  const { request, notifier, clock, newGame, rawRead, traces, second, rig, expectNone, LOBBY } = world
  let db: Db
  let hostSigned: Signed
  let hostCookie: string
  let playerCookie: string

  beforeEach(() => {
    db = world.db
    hostSigned = world.hostSigned
    hostCookie = world.hostCookie
    playerCookie = world.playerCookie
  })

  // Every message type Nuxt sends to the room must be produced by this flow (#165): the type check fails until a new
  // type is added to SERVER_SENT and to a step of lobbyFlow. The Worker sends its own types (presence, the clock).
  describe('the room and the Activity feed under a Hidden wheel (#165)', () => {
    const SERVER_SENT = ['event.changed', 'activity.added', 'member.moved', 'veto.cast'] as const satisfies readonly RoomMessageType[]
    type WorkerSent = 'presence.sync' | 'presence.join' | 'presence.leave' | 'clock.pong'
    const everyTypeListed: Exclude<RoomMessageType, (typeof SERVER_SENT)[number] | WorkerSent> extends never ? true : never = true

    const LOBBY_SLOTS = ['2090-10-30T20:30', '2090-10-31T19:00']
    const team = (position: number): Place => ({ zone: 'team', team: position })

    const send = sendVia(() => request)

    /** The Activity feed as a Member reads it: every page, following `next` until it is null (#159). */
    async function activityOf(cookie: string, slug: string) {
      let raw = ''
      const entries: ActivityEntry[] = []
      let before: string | null = null
      do {
        const query = before === null ? '' : `&before=${before}`
        const response = await request(`/api/e/${slug}/activity?limit=3${query}`, { headers: { cookie } })
        expect(response.status).toBe(200)
        const text = await response.text()
        raw += text
        const page = JSON.parse(text) as ActivityPage
        entries.push(...page.entries)
        before = page.next
      } while (before !== null)
      return { raw, entries }
    }

    /**
     * The lobby of 1.4 under a Hidden wheel: a Host, two Players in two teams of one, and every step a Player could see
     * through the room or the feed. Returns the Event and the four games that sit in its pools at some point (#165).
     */
    /** With `castVeto` Player 1 casts a Veto in the open window before the Session ends: a Veto is refused after it (F15). */
    async function lobbyFlow({ castVeto = false }: { castVeto?: boolean } = {}) {
      const a = await newGame('Alpha Arena', 'aaaaaaaaaaa')
      const b = await newGame('Beta Bowling', 'bbbbbbbbbbb')
      const c = await newGame('Gamma Garten', 'ccccccccccc')
      const created = await request('/api/e', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': hostCookie },
        body: JSON.stringify({
          name: 'Freitags-Zocken', dateMode: 'poll', sessions: 1, slots: LOBBY_SLOTS, settings: LOBBY,
          pool: [a.id, b.id],
        }),
      })
      expect(created.status).toBe(200)
      const { slug, inviteUrl } = await created.json() as CreatedEvent
      const token = new URL(inviteUrl).pathname.slice('/e/'.length)
      const [eventRow] = await db.select().from(events).where(eq(events.slug, slug))
      const eventId = eventRow!.id
      const slotIds = (await db.select().from(pollSlots).where(eq(pollSlots.eventId, eventId)).orderBy(pollSlots.startsAt)).map(row => row.id)
      const secondSigned = await signInAs(rig(), second)
      const player2Cookie = secondSigned.cookie
      const ids = { player: world.playerSigned.id, player2: secondSigned.id }

      // 1. Both Players join through the Invite link (member_joined).
      expect((await send('POST', `/api/invite/${token}`, playerCookie)).status).toBe(200)
      expect((await send('POST', `/api/invite/${token}`, player2Cookie)).status).toBe(200)

      // 2. Both vote while the Date poll is open (no Session has a Date yet); one Vote has a Note.
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, playerCookie, { value: 'yes', note: 'bis 20:30' })).status).toBe(200)
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[1]}/vote`, playerCookie, { value: 'no' })).status).toBe(200)
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[0]}/vote`, player2Cookie, { value: 'maybe' })).status).toBe(200)
      expect((await send('PUT', `/api/e/${slug}/slots/${slotIds[1]}/vote`, player2Cookie, { value: 'yes' })).status).toBe(200)

      // 3. The Host adds a third Slot.
      expect((await send('POST', `/api/e/${slug}/slots`, hostCookie, { startsAt: '2090-11-01T19:00' })).status).toBe(200)

      // 4. The Host sets the Date from the first Slot (date_set).
      expect((await send('POST', `/api/e/${slug}/confirm`, hostCookie, { slotId: slotIds[0] })).status).toBe(200)

      // 5. The Host adds a second Session with a Date, reschedules it, reopens it and removes it.
      const added = await send('POST', `/api/e/${slug}/sessions`, hostCookie, { startsAt: '2090-12-01T19:00' })
      expect(added.status).toBe(200)
      const { id: sessionId } = await added.json() as { id: string }
      expect((await send('POST', `/api/e/${slug}/sessions/${sessionId}/reschedule`, hostCookie, { startsAt: '2090-12-02T19:00' })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/sessions/${sessionId}/reopen`, hostCookie)).status).toBe(200)
      expect((await send('DELETE', `/api/e/${slug}/sessions/${sessionId}`, hostCookie)).status).toBe(200)

      // 6. Player 1 moves into team 1, Player 2 into team 2; the Host moves Player 2 to the Bench and back.
      expect((await send('POST', `/api/e/${slug}/move`, playerCookie, { userId: ids.player, to: team(1) })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/move`, player2Cookie, { userId: ids.player2, to: team(2) })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/move`, hostCookie, { userId: ids.player2, to: { zone: 'bench' } })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/move`, hostCookie, { userId: ids.player2, to: team(2) })).status).toBe(200)

      // 7. Both set a Team word; the Host resets team 2's name; Player 2 sets a word again.
      expect((await send('POST', `/api/e/${slug}/team-word`, playerCookie, { word: 'Wilde' })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/team-word`, player2Cookie, { word: 'Gurken' })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/teams/2/reset-name`, hostCookie)).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/team-word`, player2Cookie, { word: 'Rote' })).status).toBe(200)

      // 8. The Host changes the Game count and the Team size, and swaps Beta Bowling for Delta Dart in the Game pool.
      const d = await newGame('Delta Dart', 'ddddddddddd')
      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { gameCount: 6, teamSize: 2 }, pool: [a.id, d.id] })).status).toBe(200)

      // 9. The Host rotates the Invite link.
      expect((await send('POST', `/api/e/${slug}/rotate`, hostCookie)).status).toBe(200)

      // 10. The Host starts the Session, sets a game that is in no pool and puts it back (event.changed, activity.added), then ends
      // the Session. That game is everyone's from the moment it is set (#228).
      expect((await send('POST', `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
      const epsilon = await newGame('Epsilon Eck', 'eeeeeeeeeee')
      const roundId = await hostSets(rig(), { slug, host: hostSigned }, epsilon.id)
      await hostPutsBack(rig(), { slug, host: hostSigned }, roundId)
      // A library game that stays open: its Round gets its Result once the Session has ended (#273, between Sessions).
      const f = await newGame('Foxtrot Fest', 'fffffffffff')
      const openRound = await hostSets(rig(), { slug, host: hostSigned }, f.id)
      // The Host spins the wheel (event.changed; the feed entry game_drawn waits for the stop); the Session ends with that Round still being drawn.
      const { drawId } = await hostSpins(rig(), { slug, host: hostSigned })
      if (castVeto) {
        // The wheel stops (the clock moves past it) and Player 1 casts a Veto: veto.cast goes to Player 1's Party only (#231).
        clock.advance(SPIN.stop + 500)
        await playerVetoes(rig(), { slug }, drawId, world.playerSigned)
      }
      // The Host sets a Countdown and starts it (event.changed, #236); ending the Session clears it.
      expect((await send('PUT', `/api/e/${slug}/countdown`, hostCookie, { seconds: 60 })).status).toBe(200)
      expect((await send('POST', `/api/e/${slug}/countdown/start`, hostCookie)).status).toBe(200)
      // The Host tosses the coin (event.changed, #235); its feed entry waits for the landing, which the clock passes below.
      await hostTossesCoin(rig(), { slug, host: hostSigned })
      expect((await send('POST', `/api/e/${slug}/sessions/end`, hostCookie)).status).toBe(200)
      // Between Sessions the Host enters the Result of the open Round (#273): the feed names its game, and no game of the pools.
      expect((await send('PUT', `/api/e/${slug}/rounds/${openRound}/result`, hostCookie, { places: [{ team: 1, place: 1 }, { team: 2, place: 2 }] })).status).toBe(200)
      // The Host corrects that Result between Sessions too (#275): the Places swap, and the feed says so.
      expect((await send('PUT', `/api/e/${slug}/rounds/${openRound}/result`, hostCookie, { places: [{ team: 1, place: 2 }, { team: 2, place: 1 }] })).status).toBe(200)

      return { slug, eventId, games: [a, b, c, d] as const, set: f, player2Cookie }
    }

    it('produces every message type Nuxt sends to the room, and writes every Activity type', async () => {
      // The flow's leak tests below stay before the stop; this one casts a Veto after it, while the Session still runs.
      const { slug, eventId } = await lobbyFlow({ castVeto: true })

      expect(everyTypeListed).toBe(true)
      const sent = new Set(notifier.messages(eventId).map(message => message.type))
      for (const type of SERVER_SENT) expect(sent.has(type), `the flow sends no ${type}`).toBe(true)
      // The kinds of 0.7 and 0.8 (#226, #273) are in the enum; the flow writes the ones that exist so far (game_set and game_put_back, #228,
      // game_drawn, #229, which the feed shows from the stop on, vetoes_revealed, #231, from the end of the Veto window on, coin_tossed,
      // #235, from the landing on, result_entered, #273, and result_corrected, #275). The rest come with #233 (bonus_veto_granted) and
      // #277 (event_finished): the finish is written only by the case that finishes the flow's Event, below.
      const written = ACTIVITY_TYPES.filter(type => !['bonus_veto_granted', 'event_finished'].includes(type))
      clock.advance(WINDOW_MS + 10_000)
      expect(new Set((await activityOf(playerCookie, slug)).entries.map(entry => entry.type))).toEqual(new Set(written))
    })

    it('leaks no pool game through the room, the Activity feed or the Event read of either Player', async () => {
      const { slug, eventId, games, player2Cookie } = await lobbyFlow()
      const room = JSON.stringify(notifier.messages(eventId))
      const feed = (await activityOf(playerCookie, slug)).raw

      expectNone({ 'the room': room }, games)
      expectNone({ 'the Activity feed of Player 1': feed }, games)
      expectNone({ 'the Event read of Player 1': await rawRead(playerCookie, slug) }, games)
      expectNone({ 'the Event read of Player 2': await rawRead(player2Cookie, slug) }, games)
      // A Price is no part of the room or the feed, whoever reads them (#338).
      expect(room).not.toContain('"price"')
      expect(feed).not.toContain('"price"')
    })

    it('names only the set game in the Result entry a Player reads, while the wheel\'s draw is still unstopped (#273)', async () => {
      const { slug, eventId, games, set, player2Cookie } = await lobbyFlow()

      const entries = (await activityOf(playerCookie, slug)).entries.filter(entry => entry.type === 'result_entered')
      expect(entries).toMatchObject([{ type: 'result_entered', params: { gameId: set.id, number: 1, first: [1] }, games: { [set.id]: 'Foxtrot Fest' } }])
      expect(Object.keys(entries[0]!.games)).toEqual([set.id])
      expectNone({ 'the Activity feed entry of the Result': JSON.stringify(entries) }, games)
      expectNone({ 'the room\'s entry of the Result': JSON.stringify(notifier.messages(eventId).filter(message => message.type === 'activity.added' && message.entry.type === 'result_entered')) }, games)
      expectNone({ 'the Event read of Player 2': await rawRead(player2Cookie, slug) }, games)
    })

    it('names only the set game in the Correction a Player reads, and the Event read still names no pool game (#275)', async () => {
      const { slug, eventId, games, set, player2Cookie } = await lobbyFlow()

      const entries = (await activityOf(playerCookie, slug)).entries.filter(entry => entry.type === 'result_corrected')
      expect(entries).toMatchObject([{ type: 'result_corrected', params: { gameId: set.id, number: 1 }, games: { [set.id]: 'Foxtrot Fest' } }])
      expect(Object.keys(entries[0]!.games)).toEqual([set.id])
      expectNone({ 'the Activity feed entry of the Correction': JSON.stringify(entries) }, games)
      expectNone({ 'the room\'s entry of the Correction': JSON.stringify(notifier.messages(eventId).filter(message => message.type === 'activity.added' && message.entry.type === 'result_corrected')) }, games)
      expect((JSON.parse(await rawRead(player2Cookie, slug)) as EventView).results).toMatchObject([{ number: 1, corrected: true }])
      expectNone({ 'the Event read of Player 2': await rawRead(player2Cookie, slug) }, games)
    })

    it('names only the set game in the Results a Player reads (#274), and no pool game in the Standings or the end', async () => {
      const { slug, games, set, player2Cookie } = await lobbyFlow()
      const view = JSON.parse(await rawRead(player2Cookie, slug)) as EventView
      const raw = JSON.stringify({ results: view.results, standings: view.standings, end: view.end })

      expect(view.results).toMatchObject([{ number: 1, game: { id: set.id, name: 'Foxtrot Fest' } }])
      // The Correction swapped the Places: Party 2 leads the Standings now (#275).
      expect(view.standings?.map(row => row.team)).toEqual([2, 1])
      expect(view.end).toMatchObject({ played: 1, gameCount: 6, complete: false, tie: null, finish: null })
      // The Hidden wheel's spin is still unstopped for Player 2: its game is in none of the three fields.
      expectNone({ 'the results, the Standings and the end of Player 2': raw }, games)
    })

    it('keeps the pools hidden through the finish (#277): the room, the feed and the reads name no pool game after it', async () => {
      const { slug, eventId, games, player2Cookie } = await lobbyFlow()
      // One Result stands (Foxtrot Fest, between Sessions): the Game count drops to it, so the Event is complete and the Host may finish.
      await db.update(events).set({ gameCount: 1 }).where(eq(events.id, eventId))

      expect((await send('POST', `/api/e/${slug}/finish`, hostCookie, { outcome: 'winner', winners: [2] })).status).toBe(200)

      const feed = await activityOf(playerCookie, slug)
      // The lobby flow's Correction (#275) swapped the Places, so Party 2 wins.
      expect(feed.entries[0]).toMatchObject({ type: 'event_finished', params: { winners: [2] } })
      expectNone({ 'the room after the finish': JSON.stringify(notifier.messages(eventId)) }, games)
      expectNone({ 'the Activity feed of Player 1 after the finish': feed.raw }, games)
      expectNone({ 'the Event read of Player 2 after the finish': await rawRead(player2Cookie, slug) }, games)
    })

    it('shows the pools to a Player once the Hidden wheel is off and the Pool preview on, and the room still carries no game', async () => {
      const { slug, eventId, games } = await lobbyFlow()
      const [a, , , d] = games
      // The Session ended with a Round still being drawn; Rad verdecken is locked until its Veto window has run out (#231).
      clock.advance(WINDOW_MS + 10_000)

      expect((await send('PATCH', `/api/e/${slug}/settings`, hostCookie, { settings: { hiddenWheel: false, poolPreview: true } })).status).toBe(200)

      const open = await rawRead(playerCookie, slug)
      expect((JSON.parse(open) as EventView).pool).toMatchObject([{ name: 'Alpha Arena' }, { name: 'Delta Dart' }])
      // Picture and name only (#224): the notes stay the Host's.
      for (const game of [a, d]) {
        for (const trace of traces(game).filter(trace => trace !== game.notes)) expect(open, `the open Event read lacks ${trace}`).toContain(trace)
        expect(open).not.toContain(game.notes)
        expect(open).not.toContain(game.tag)
      }
      expectNone({ 'the room': JSON.stringify(notifier.messages(eventId)) }, games)

      const hostRaw = await rawRead(hostCookie, slug)
      for (const game of [a, d]) expect(hostRaw).toContain(game.name)
    })
  })
})
