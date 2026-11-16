import type { NotesDoc } from './notes-doc'

// The Events of a game on its page (#656, spec #717 § F).

/** One Event of the game's User that holds the game in its pool or played it, as the game's page lists it. */
export interface GameEventRow {
  /** The Event's slug: its page is `eventPath(slug)`. */
  slug: string
  name: string
  /**
   * The number of Rounds of the game with a Result in this Event; a put-back Round does not count. 0 means the game is in the
   * Event's pool and was not played: „im Pool“. A game that was played says „gespielt“ however it stands in the pool.
   */
  played: number
  /** The Host's Event notes for this game in this Event (GLOSSARY: Event notes), null when there are none. */
  notes: NotesDoc | null
}

/** The answer of `GET /api/games/:id/events`: newest Event first (by its creation). Deleted Events never appear. */
export interface GameEvents {
  events: GameEventRow[]
}
