import { describe, expect, it } from 'vitest'
import type { EventView } from '../../shared/event'
import { bodiesOf, hiddenWheelWorld, LOBBY, OTHER_PARTY, OUTSIDER, PLAYER, type Secret } from './hidden-wheel-world'
import { playersJoin, readFeedText, signInAs } from './scenario'

// No Member's read, count, feed entry or room message names or counts an Archived game (#725, spec #717 § B „What each viewer reads“, CODING_STANDARDS § Secrecy):
// an undrawn Archived pool game with a name, an id and an image key of its own, read as a Player in a Party, a Player on the Stands, the other Party and a
// non-Member, over the Event read, the feed, every GET route and the room. The Pool preview on with a Hidden wheel is not a setting (#225), so the matrix has three cells.

const STANDS_PLAYER = { provider: 'twitch', id: '6', name: 'Zuschauer', email: 'stands@example.com', image: undefined } as const

describe('an Archived pool game is nobody\'s secret to keep: no Member learns it', () => {
  const world = hiddenWheelWorld()
  // The cookies are assigned in the world's hooks: read them inside a case.
  const { rig, runningEvent, rawRead, expectNone, notifier, sweepGets, request, stranger } = world

  const cells = [
    ['a visible wheel with the Pool preview on', { ...LOBBY, hiddenWheel: false, poolPreview: true }],
    ['a visible wheel with the Pool preview off', { ...LOBBY, hiddenWheel: false, poolPreview: false }],
    ['a Hidden wheel', { ...LOBBY, hiddenWheel: true }],
  ] as const

  it.each(cells)('%s: after the archive no Member\'s read, feed, GET route or room message has a trace, and the counts are the unarchived games\'', async (_name, settings) => {
    // Alpha, Beta and Zusatz 0 in the pool; Beta is the one that is archived and was never drawn.
    const party = await runningEvent(settings, 1)
    const hostCookie = world.hostCookie
    const secret: Secret = party.b
    const standsSigned = await signInAs(rig(), STANDS_PLAYER)
    await playersJoin(rig(), { inviteToken: party.inviteToken }, [standsSigned])
    const members = { [PLAYER]: world.playerCookie, [OTHER_PARTY]: party.secondCookie, 'the Stands': standsSigned.cookie }
    const preview = 'poolPreview' in settings && settings.poolPreview
    const nameOfPool = (raw: string) => (JSON.parse(raw) as EventView).pool?.map(game => game.name)

    // Control: the Host's read carries the game, and so does a Member's pool list while the Pool preview is on; a test that never saw it could not fail.
    expect(await rawRead(hostCookie, party.slug)).toContain(secret.name)
    if (preview) for (const cookie of Object.values(members)) expect(nameOfPool(await rawRead(cookie, party.slug))).toContain(secret.name)
    notifier.clear()

    expect((await request(`/api/games/${secret.id}/archived`, { method: 'PUT', headers: { 'content-type': 'application/json', 'cookie': hostCookie }, body: JSON.stringify({ archived: true }) })).status).toBe(200)

    const sweep = await sweepGets({
      viewers: [...Object.entries(members).map(([who, cookie]) => ({ who, cookie })), { who: OUTSIDER, cookie: (await signInAs(rig(), stranger)).cookie }],
      event: { slug: party.slug, inviteToken: party.inviteToken },
      games: [party.a, secret, party.more[0]!, party.c, party.epsilon],
    })
    const places: Record<string, string> = { 'the room': JSON.stringify(notifier.messages(party.eventId)), ...bodiesOf(sweep) }
    for (const [who, cookie] of Object.entries(members)) {
      places[`the Event read as ${who}`] = await rawRead(cookie, party.slug)
      places[`the feed as ${who}`] = await readFeedText(rig(), cookie, party.slug, 'limit=100')
    }
    // Not the Host's own: the Host's read keeps the game by design, and so do its library routes.
    expectNone(Object.fromEntries(Object.entries(places).filter(([place]) => !place.includes('the Host'))), [secret])
    // Its picture is no Member's either, on any route.
    for (const entry of sweep.filter(swept => swept.path.endsWith(secret.imageKey))) expect(entry.status, `${entry.label} as ${entry.who}`).toBe(404)

    // The counts a Member sees are the unarchived games' (Alpha and Zusatz 0).
    for (const cookie of Object.values(members)) {
      const view = JSON.parse(await rawRead(cookie, party.slug)) as EventView
      expect(view.wheel?.count).toBe(2)
      expect(view.pool?.length ?? 2).toBe(2)
      expect(view.pool === null).toBe(!preview)
      if (settings.hiddenWheel) expect(view.wheel?.slices).toBeNull()
    }
    // The Host's own pool still lists it.
    expect(await rawRead(hostCookie, party.slug)).toContain(secret.name)
  })
})
