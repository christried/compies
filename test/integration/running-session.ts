import { eq } from 'drizzle-orm'
import { expect } from 'vitest'
import { events, pollSlots, users } from '../../server/db/schema'
import type { Db } from '../../server/utils/db'
import type { createTestServer } from './harness'

// A Running Session for the secrecy tests of the Rounds (#228): an Event whose first Session has its Date, one Player in
// each of two teams, and the Session started. The request function must serve the confirm, move, start and rounds routes.

export type Request = ReturnType<typeof createTestServer>

/** A signed-in Player: their cookie and the email their user row was made with. */
export interface Seated { cookie: string, email: string }

function post(request: Request, path: string, cookie: string, body?: unknown) {
  return request(path, {
    method: 'POST',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** Sets the first Session's Date, seats the Players in teams 1, 2, … (one each) and starts the Session. */
export async function startRunningSession(request: Request, db: Db, { slug, hostCookie, seated }: { slug: string, hostCookie: string, seated: Seated[] }): Promise<void> {
  const [eventRow] = await db.select().from(events).where(eq(events.slug, slug))
  const [slot] = await db.select().from(pollSlots).where(eq(pollSlots.eventId, eventRow!.id)).orderBy(pollSlots.startsAt)
  expect((await post(request, `/api/e/${slug}/confirm`, hostCookie, { slotId: slot!.id })).status).toBe(200)
  for (const [index, player] of seated.entries()) {
    const [row] = await db.select().from(users).where(eq(users.email, player.email))
    const moved = await post(request, `/api/e/${slug}/move`, player.cookie, { userId: row!.id, to: { zone: 'team', team: index + 1 } })
    expect(moved.status).toBe(200)
  }
  expect((await post(request, `/api/e/${slug}/sessions/start`, hostCookie)).status).toBe(200)
}

/** The Host sets a game in the Running Session; answers the Round's id. */
export async function hostSets(request: Request, slug: string, hostCookie: string, gameId: string): Promise<string> {
  const response = await post(request, `/api/e/${slug}/rounds`, hostCookie, { gameId })
  expect(response.status).toBe(200)
  return (await response.json() as { roundId: string }).roundId
}

/** The Host puts a Round back. */
export async function hostPutsBack(request: Request, slug: string, hostCookie: string, roundId: string): Promise<void> {
  const response = await request(`/api/e/${slug}/rounds/${roundId}`, { method: 'DELETE', headers: { cookie: hostCookie } })
  expect(response.status).toBe(200)
}
