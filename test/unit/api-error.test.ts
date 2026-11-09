import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { API_ERROR_STATUS, type ApiErrorCode } from '~~/shared/errors'
import { apiErrorKey, apiFailure, reasonKey, type ReasonPlace } from '../../app/utils/api-error'

// $fetch errors carry the server's statusMessage in data.statusMessage.
const refusal = (statusCode: number, code: string) => ({ statusCode, data: { statusMessage: code } })

describe('apiFailure', () => {
  it('reads the status and the code from a $fetch error', () => {
    expect(apiFailure(refusal(403, 'not_host'))).toEqual({ status: 403, code: 'not_host' })
    expect(apiFailure(new Error('offline'))).toEqual({ status: undefined, code: undefined })
  })

  it('hands on the payload the server sent with the refusal (#237)', () => {
    const lostRace = { statusCode: 409, data: { statusMessage: 'team_full', data: { winnerId: 'u-1' } } }

    expect(apiFailure(lostRace).data?.winnerId).toBe('u-1')
    expect(apiFailure(refusal(403, 'not_host')).data).toBeUndefined()
    expect(apiFailure({ statusCode: 500, data: { statusMessage: 'x', data: 'text' } }).data).toBeUndefined()
  })
})

// The ten codes the app deliberately has no words for (each falls back to the caller's line; why: SHARED in app/utils/api-error.ts).
const UNEXPLAINED: ApiErrorCode[] = ['invalid_name', 'invalid_mode', 'invalid_slots', 'invalid_time', 'invalid_value', 'invalid_settings', 'wheel_options_without_wheel', 'invalid_cursor', 'no_such_team', 'no_live_connection']
// Exhaustive: a new place fails typecheck until it is listed here.
const PLACES: Record<ReasonPlace, true> = { setGame: true, lastGame: true, deleteEvent: true, slotEditor: true, directDates: true, eventSettings: true }

const text = (key: string): string | undefined => {
  const found = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  return typeof found === 'string' ? found : undefined
}

describe('reasonKey', () => {
  const places = [undefined, ...(Object.keys(PLACES) as ReasonPlace[])]
  const codes = Object.keys(API_ERROR_STATUS) as ApiErrorCode[]

  it.each(places)('words every code, in place %s, or lists it as an intended fallback', (place) => {
    for (const code of codes) {
      const key = reasonKey(code, place)
      expect(text(key), `${place ?? 'shared'} × ${code}: ${key} is in de.json`).toBeTypeOf('string')
      if (!UNEXPLAINED.includes(code)) expect(key, `${place ?? 'shared'} × ${code} has words`).not.toBe('error.saveFailed')
    }
  })

  it('answers the generic line for each intended fallback, so a code that gets words leaves the list', () => {
    for (const code of UNEXPLAINED) expect(reasonKey(code), code).toBe('error.saveFailed')
  })
})

describe('apiErrorKey', () => {
  it('names the reason the server gives', () => {
    expect(apiErrorKey(refusal(409, 'round_not_open'))).toBe(reasonKey('round_not_open'))
    expect(apiErrorKey(refusal(403, 'not_host'))).toBe(reasonKey('not_host'))
  })

  it('falls back to the caller\'s line for a code it cannot explain and for an error without one', () => {
    expect(apiErrorKey(refusal(500, 'boom'), 'error.voteFailed')).toBe('error.voteFailed')
    expect(apiErrorKey(new Error('offline'), 'error.voteFailed')).toBe('error.voteFailed')
    expect(apiErrorKey(refusal(500, 'boom'))).toBe('error.saveFailed')
    expect(apiErrorKey(new Error('offline'))).toBe('error.saveFailed')
    expect(apiErrorKey(refusal(400, 'invalid_value'), 'error.voteFailed')).toBe('error.voteFailed')
  })

  it('lets a place say it its own way', () => {
    expect(apiErrorKey(refusal(409, 'wrong_phase'), 'error.saveFailed', 'slotEditor')).toBe('mvp.slots.locked')
    expect(apiErrorKey(refusal(409, 'wrong_phase'))).toBe('error.wrongPhase')
  })
})
