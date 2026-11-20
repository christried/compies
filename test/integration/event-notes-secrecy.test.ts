import { describe, expect, it } from 'vitest'
import type { EventView } from '../../shared/event'
import { notesFromLines } from '../../shared/notes-doc'
import { fileShareAssets } from '../../server/utils/share-assets'
import { createTestApp, sendVia } from './app'
import { bodiesOf, expectStatuses, HOST, hiddenWheelWorld, LOBBY, OUTSIDER, PLAYER, sweepGets as sweepGetsOn, type Secret } from './hidden-wheel-world'
import { clockToEnd, clockToStop, hostEntersResult, hostFinishes, hostPutsBack, hostSets, hostSpins, hostStartsCeremony, playersJoin, readFeedText, signInAs } from './scenario'
import { setAllowlist } from './sign-in'

// The Host's Event notes stay the Host's (#731, spec #717 § E, CODING_STANDARDS § Secrecy): through the HTTP API as every viewer, a search of the raw responses for a
// note's text, and the feed, the room and every GET route, in the pattern of veto-allowance-secrecy.test.ts. The save's own rules are in event-notes.test.ts.

// A text no other string of the app holds: it names a note wherever it shows.
const TRACE = 'Geheimnotiz-731'
const REPLACED = 'Ersatznotiz-731'
const trace = notesFromLines([TRACE])!

const fan = { provider: 'discord', id: '8', name: 'Zuschauer', email: 'fan@example.com', image: undefined } as const
const otherHost = { provider: 'discord', id: '9', name: 'Andere', email: 'otherhost@example.com', image: undefined } as const

describe('Event notes are in no read but the Host\'s (#731)', () => {
  const world = hiddenWheelWorld()
  const { request, notifier, clock, rawRead, runningEvent, setUp, expectNone, rig, host, stranger, playerTraces } = world
  // The world's app has no share assets: the sweep of a finished Event asks the same database through an app that renders the Share image.
  const sweepGets = (options: Parameters<typeof sweepGetsOn>[1]) => sweepGetsOn(createTestApp(world.db, { imageStore: world.store, roomNotifier: notifier, clock, shareAssets: fileShareAssets() }), options)
  const send = sendVia(() => request)

  const save = async (slug: string, game: Secret, notes: unknown) => {
    const response = await send('PUT', `/api/e/${slug}/games/${game.id}/notes`, world.hostCookie, { notes })
    expect(response.status, `saving the note of ${game.name}`).toBe(200)
  }
  const mapOf = (raw: string) => (JSON.parse(raw) as EventView).eventNotes

  /** The Members who are no Player of a team and the non-Member, signed in. */
  async function bystanders(event: { inviteToken: string } | null) {
    const fanSigned = await signInAs(rig(), fan)
    if (event) await playersJoin(rig(), event, [fanSigned])
    const strangerSigned = await signInAs(rig(), stranger)
    return { fan: fanSigned.cookie, stranger: strangerSigned.cookie }
  }

  /**
   * Every viewer's raw Event read holds no trace and a Member's `eventNotes` is null; a non-Member's read is the missing-route answer. Gamma, whose note was
   * saved though it is in no pool and no Round, is in no Member's read by name, id or image key.
   */
  async function expectSealed(stage: string, slug: string, cookies: Record<string, string>, strangerCookie: string, gamma: Secret) {
    for (const [who, cookie] of Object.entries(cookies)) {
      const raw = await rawRead(cookie, slug)
      expect(raw, `${who} ${stage}`).not.toContain(TRACE)
      expect(raw, `${who} ${stage}`).not.toContain(REPLACED)
      expect(raw, `${who} ${stage}`).not.toContain('eventNotes":{')
      expect(mapOf(raw), `${who} ${stage}`).toBeNull()
      expectNone({ [`${who} ${stage}`]: raw }, [gamma])
    }
    const outsider = await request(`/api/e/${slug}`, { headers: { cookie: strangerCookie } })
    expect(outsider.status).toBe(404)
    expect(await outsider.text()).not.toContain(TRACE)
  }

  it('control: the Host\'s read holds the text under eventNotes and nowhere else', async () => {
    const { slug, a, c } = await runningEvent()
    await save(slug, a, trace)
    await save(slug, c, trace)

    const raw = await rawRead(world.hostCookie, slug)
    expect(mapOf(raw)).toEqual({ [a.id]: trace, [c.id]: trace })
    expect(raw).toContain(TRACE)
    const view = JSON.parse(raw) as Record<string, unknown>
    delete view.eventNotes
    expect(JSON.stringify(view)).not.toContain(TRACE)
  })

  it('shows no Player, Fan or non-Member a note: before the start, running, with a game set, at the stop and after the Finish', async () => {
    // Before the start: the Event is set up, the Player has joined.
    const early = await setUp()
    const [a1, , c1] = early.secrets as [Secret, Secret, Secret]
    const earlyOthers = await bystanders(null)
    await save(early.slug, a1, trace)
    await save(early.slug, c1, trace)
    await expectSealed('before the start', early.slug, { Player: world.playerCookie }, earlyOthers.stranger, c1)
  })

  it('holds on through a running Event, a game the Host sets, the Hidden wheel\'s stop and the Finish', async () => {
    const running = await runningEvent({ ...LOBBY, gameCount: 1 })
    const { slug, a, c, secondCookie } = running
    const others = await bystanders(running)
    const cookies = { 'Player': world.playerCookie, 'second Player': secondCookie, 'Fan': others.fan }
    const hostRef = { slug, host: world.hostSigned }
    await save(slug, a, trace)
    await save(slug, c, trace)

    await expectSealed('running', slug, cookies, others.stranger, c)

    // Alpha is set: every Member reads the game, still not its Event note.
    const round = await hostSets(rig(), hostRef, a.id)
    expect(await rawRead(world.playerCookie, slug)).toContain('Alpha Arena')
    await expectSealed('with Alpha set', slug, cookies, others.stranger, c)
    await hostPutsBack(rig(), hostRef, round)

    // The Hidden wheel: before and at the stop, and at the end of the Veto window.
    const { roundId, drawId } = await hostSpins(rig(), hostRef)
    await expectSealed('before the stop', slug, cookies, others.stranger, c)
    await clockToStop(rig(), drawId)
    await expectSealed('at the stop', slug, cookies, others.stranger, c)
    await clockToEnd(rig(), drawId)
    await expectSealed('after the window', slug, cookies, others.stranger, c)

    await hostEntersResult(rig(), hostRef, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    await hostFinishes(rig(), hostRef, { outcome: 'winner', winners: [1] })
    await expectSealed('after the Finish', slug, cookies, others.stranger, c)
    // The Host's read of the finished Event still has them.
    expect(mapOf(await rawRead(world.hostCookie, slug))).toEqual({ [a.id]: trace, [c.id]: trace })
  })

  it('writes no Activity entry for a save, a replace or a clear, and the feed holds no text', async () => {
    const { slug, a, c } = await runningEvent()
    const feedOf = async (cookie: string) => await readFeedText(rig(), cookie, slug, 'limit=100')
    const before = { host: await feedOf(world.hostCookie), player: await feedOf(world.playerCookie) }

    await save(slug, a, trace)
    expect(await feedOf(world.hostCookie)).toBe(before.host)
    await save(slug, a, notesFromLines([REPLACED]))
    await save(slug, c, trace)
    await save(slug, a, null)
    await save(slug, c, null)

    const after = { host: await feedOf(world.hostCookie), player: await feedOf(world.playerCookie) }
    expect(after).toEqual(before)
    for (const feed of Object.values(after)) {
      expect(feed).not.toContain(TRACE)
      expect(feed).not.toContain(REPLACED)
    }
  })

  it('tells the room only that the Event changed after a save, a replace and a clear, and no message holds the text or the game', async () => {
    const { slug, eventId, a } = await runningEvent()

    for (const [step, notes] of [['save', trace], ['replace', notesFromLines([REPLACED])], ['clear', null]] as const) {
      notifier.clear()
      await save(slug, a, notes)
      const messages = notifier.messages(eventId)
      expect(messages.map(message => message.type), step).toEqual(['event.changed'])
      // Named to the Host alone (#820): the Host's other tabs refresh, no Member's channel hears of a save or learns that the Host edits notes.
      expect(notifier.sends(eventId).map(send => send.to), step).toEqual([[world.hostSigned.id]])
      const sent = JSON.stringify(messages)
      expect(sent, step).not.toContain(TRACE)
      expect(sent, step).not.toContain(REPLACED)
      expect(sent, step).not.toContain(a.id)
      expect(sent, step).not.toContain(a.name)
    }
  })

  it('has the text in no GET route but the Host\'s Event read, while the Event runs and after the Finish', async () => {
    const running = await runningEvent({ ...LOBBY, gameCount: 1 })
    const { slug, inviteToken, a, b, c, epsilon } = running
    const others = await bystanders(null)
    setAllowlist({ hosts: `${host.provider}:${host.id},${otherHost.provider}:${otherHost.id}`, admins: 'discord:99' })
    const otherHostSigned = await signInAs(rig(), otherHost)
    const hostRef = { slug, host: world.hostSigned }
    const games = [a, b, c, epsilon]
    await save(slug, a, trace)
    await save(slug, c, trace)
    await save(slug, epsilon, trace)

    const sweeps = async () => {
      const viewers = [{ who: PLAYER, cookie: world.playerCookie }, { who: OUTSIDER, cookie: others.stranger }, { who: HOST, cookie: world.hostCookie }]
      const members = await sweepGets({ viewers, event: { slug, inviteToken }, games })
      // The other Host reads the same routes as a library owner of their own (no game of this Event) and a non-Member of the Event.
      const other = await sweepGets({ viewers: [{ who: 'the other Host', cookie: otherHostSigned.cookie }], event: { slug, inviteToken }, games })
      return { members, other }
    }
    const expectOnlyHostEventRead = (swept: Awaited<ReturnType<typeof sweeps>>) => {
      expect(swept.members.length).toBeGreaterThan(20)
      for (const [place, body] of Object.entries(bodiesOf(swept.members, HOST))) {
        if (place === 'GET /api/e/:slug as the Host') expect(body, place).toContain(TRACE)
        // The second read of the Host's notes (#656): the game's page lists the Events of its owner, here the Host, with the note of each game that has one.
        // A game that is neither in the pool nor played has no row there, so only Alpha's note (a pool game) is asserted.
        else if (place.startsWith('GET /api/games/:id/events ')) {
          if (place.includes(a.id)) expect(body, place).toContain(TRACE)
        }
        else expect(body, place).not.toContain(TRACE)
      }
      expect(Object.keys(bodiesOf(swept.members, HOST)), 'the Host\'s sweep reads the Event').toContain('GET /api/e/:slug as the Host')
      for (const who of [PLAYER, OUTSIDER]) for (const [place, body] of Object.entries(bodiesOf(swept.members, who))) expect(body, place).not.toContain(TRACE)
      for (const [place, body] of Object.entries(bodiesOf(swept.other))) expect(body, place).not.toContain(TRACE)
    }

    const running_ = await sweeps()
    expectStatuses(running_.members)
    expectOnlyHostEventRead(running_)

    const { roundId } = await hostSpins(rig(), hostRef)
    await clockToStopAndEnd(roundId)
    await hostEntersResult(rig(), hostRef, roundId, [{ team: 1, place: 1 }, { team: 2, place: 2 }])
    await hostFinishes(rig(), hostRef, { outcome: 'winner', winners: [1] })
    // The Share image waits for the Award ceremony (#445).
    await hostStartsCeremony(rig(), hostRef)

    const finished = await sweeps()
    expectOnlyHostEventRead(finished)
    // The share image of a finished Event answers now.
    expect(finished.members.find(entry => entry.route === '/api/e/:slug/share-image' && entry.who === PLAYER)?.status).toBe(200)
    expect(finished.members.find(entry => entry.route === '/api/e/:slug/share-image' && entry.who === HOST)?.status).toBe(200)
    // No Member's body names a library game that was never set (Gamma and Epsilon hold notes the Host wrote).
    expectNone({ ...bodiesOf(finished.members, PLAYER), ...bodiesOf(finished.members, OUTSIDER) }, [c, epsilon], playerTraces)
  })

  /** The spin's draw settles at its stop, and a Veto window ends at its end: move the server's clock past both. */
  async function clockToStopAndEnd(roundId: string) {
    const [draw] = await world.db.query.draws.findMany({ where: (draws, { eq }) => eq(draws.roundId, roundId) })
    await clockToStop(rig(), draw!.id)
    await clockToEnd(rig(), draw!.id)
    void clock
  }
})
