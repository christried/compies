import { and, eq } from 'drizzle-orm'
import { eventGameNotes, games } from '../db/schema'
import { isUuid } from '../domain/uuid'
import { EVENT_NOTES_MAX, type EventNotesSaved } from '../../shared/event'
import { GAME_NOTES_MAX } from '../../shared/game'
import { parseNotes, type NotesDoc } from '../../shared/notes-doc'
import { asRecord } from '../../shared/record'
import type { Db } from './db'
import type { EventChange } from './event-access'
import { apiError } from './errors'
import { assertGamesExist } from './pools'

// The Host's Event notes (#731, spec #717 § E, GLOSSARY: Event notes): one document per Event and game, kept in `event_game_notes`. A save is an
// ordinary Event change (ADR 0013): the instants come from `EventChange.now`, an `event.changed` to the Host alone follows after the commit (#820), and it writes no
// Activity entry, so nothing but the Host's own read ever carries a note.

/**
 * Sets or clears one game's Event notes and Game notes in one request (#731, #835). The body is `{ notes?, gameNotes? }`: `notes` are the Event notes, `gameNotes` the game's own
 * (`games.notes`, the library's column). A key that is absent stays as it is, a body with neither is `invalid_value`; `null`, `''` and a document with no visible text clear (no row is
 * left for the Event notes), a refused document is `invalid_game_notes`. Both are parsed before either is written, so a refused one refuses both, and both writes run in
 * `changeEvent`'s transaction. The game must be in the Event's Host's library, archived or not (#722); another Host's game and an unknown id answer alike. The Host permission is not
 * asked for: only the Host of this Event gets here (`hostOnly`), and the Host reads these notes in this Event without it. The answer names each field the request carried.
 */
export async function saveEventNotes({ tx, eventRow, user, now, body, publishTo }: Pick<EventChange, 'tx' | 'eventRow' | 'user' | 'now' | 'body' | 'publishTo'>, rawGameId: string): Promise<EventNotesSaved> {
  if (!isUuid(rawGameId)) throw apiError('invalid_value')
  const gameId = rawGameId.toLowerCase()
  // A stray request that carries neither key must never clear a note.
  const fields = asRecord(body)
  const hasEvent = Object.hasOwn(fields, 'notes')
  const hasGame = Object.hasOwn(fields, 'gameNotes')
  if (!hasEvent && !hasGame) throw apiError('invalid_value')
  const notes = hasEvent ? parseNotes(fields.notes, EVENT_NOTES_MAX) : null
  const gameNotes = hasGame ? parseNotes(fields.gameNotes, GAME_NOTES_MAX) : null
  if (notes === undefined || gameNotes === undefined) throw apiError('invalid_game_notes')

  await assertGamesExist(tx, eventRow.hostId, [gameId])

  // A save wakes the Host's own tabs only (#820): a Member's Event read does not change, so no Member refetches it or learns that the Host edits notes.
  publishTo([user.id], { type: 'event.changed' })

  const saved: EventNotesSaved = { gameId }
  if (hasEvent) {
    if (notes === null) {
      await tx.delete(eventGameNotes).where(and(eq(eventGameNotes.eventId, eventRow.id), eq(eventGameNotes.gameId, gameId)))
    }
    else {
      await tx
        .insert(eventGameNotes)
        .values({ eventId: eventRow.id, gameId, notes, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({ target: [eventGameNotes.eventId, eventGameNotes.gameId], set: { notes, updatedAt: now } })
    }
    saved.notes = notes
  }
  if (hasGame) {
    // `now` is passed: `games.updatedAt`'s `$onUpdate` would read the real clock (ADR 0013).
    await tx.update(games).set({ notes: gameNotes, updatedAt: now }).where(eq(games.id, gameId))
    saved.gameNotes = gameNotes
  }
  return saved
}

/** The Event's notes by game id, for the Host's read: one select, no lock, no join. Every stored document has visible text (a clear deletes the row). */
export async function readEventNotes(db: Db, eventId: string): Promise<Record<string, NotesDoc>> {
  const rows = await db.select({ gameId: eventGameNotes.gameId, notes: eventGameNotes.notes }).from(eventGameNotes).where(eq(eventGameNotes.eventId, eventId))
  return Object.fromEntries(rows.map(row => [row.gameId, row.notes]))
}
