import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { API_ERROR_STATUS, type ApiErrorCode } from '~~/shared/errors'
import { reasonKey, type ReasonPlace } from '../../app/utils/api-error'
import golden from './reason-copy.golden.json'

const text = (key: string): string => {
  const found = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  if (typeof found !== 'string') throw new Error(`no German text for ${key}`)
  return found
}
// A place not in `golden.places` has no override today: it says the shared words. Typed so a new place fails typecheck until it is listed.
const PLACES: Record<ReasonPlace, true> = { setGame: true, lastGame: true, deleteEvent: true, slotEditor: true, directDates: true, eventSettings: true }

describe('reason copy is what it was before #417', () => {
  const places = [undefined, ...(Object.keys(PLACES) as ReasonPlace[])]
  it.each(places)('says the same German text for every code in place %s', (place) => {
    for (const code of Object.keys(API_ERROR_STATUS) as ApiErrorCode[]) {
      const before = (place && (golden.places as Record<string, Record<string, string>>)[place]?.[code]) ?? golden.shared[code as keyof typeof golden.shared]
      expect(text(reasonKey(code, place)), `${place ?? 'shared'} × ${code}`).toBe(before)
    }
  })
})
