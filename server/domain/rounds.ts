import { asRecord } from '../../shared/record'
import { isUuid } from './uuid'

// What the Host sends to set the next game (#228, #232): `{ gameId, vetoAllowed? }`, the id of a game in the library and whether the
// Parties may veto it (absent = no). Whether the game exists, and whether the Selection mode has Vetoes, is for the handler.

export function parseSetGame(body: unknown): { ok: true, gameId: string, vetoAllowed: boolean } | { ok: false, error: 'invalid_value' } {
  const { gameId, vetoAllowed = false } = asRecord(body)
  if (!isUuid(gameId) || typeof vetoAllowed !== 'boolean') return { ok: false, error: 'invalid_value' }
  return { ok: true, gameId: gameId.toLowerCase(), vetoAllowed }
}
