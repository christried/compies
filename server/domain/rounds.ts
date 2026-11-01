import { asRecord } from '../../shared/record'
import { isUuid } from './uuid'

// What the Host sends to set the next game (#228): `{ gameId }`, the id of a game in the library. Whether the game exists
// is for the handler.

export function parseSetGame(body: unknown): { ok: true, gameId: string } | { ok: false, error: 'invalid_value' } {
  const { gameId } = asRecord(body)
  return isUuid(gameId) ? { ok: true, gameId: gameId.toLowerCase() } : { ok: false, error: 'invalid_value' }
}
