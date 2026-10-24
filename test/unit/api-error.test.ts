import { describe, expect, it } from 'vitest'
import { apiErrorKey, apiFailure } from '../../app/utils/api-error'

// $fetch errors carry the server's statusMessage in data.statusMessage.
const refusal = (statusCode: number, code: string) => ({ statusCode, data: { statusMessage: code } })

describe('apiFailure', () => {
  it('reads the status and the code from a $fetch error', () => {
    expect(apiFailure(refusal(403, 'not_host'))).toEqual({ status: 403, code: 'not_host' })
    expect(apiFailure(new Error('offline'))).toEqual({ status: undefined, code: undefined })
  })
})

describe('apiErrorKey', () => {
  it('names the reason the server gives', () => {
    expect(apiErrorKey(refusal(400, 'in_past'))).toBe('error.slotPast')
    expect(apiErrorKey(refusal(400, 'duplicate_slot'))).toBe('error.slotDuplicate')
    expect(apiErrorKey(refusal(403, 'not_host'))).toBe('error.forbidden')
    expect(apiErrorKey(refusal(403, 'no_host_permission'))).toBe('error.noHostRight')
    expect(apiErrorKey(refusal(429, 'rate_limited'))).toBe('error.rateLimited')
  })

  it('falls back for reasons it cannot explain, so a 400 is not always a past Slot', () => {
    expect(apiErrorKey(refusal(400, 'invalid_time'))).toBe('error.saveFailed')
    expect(apiErrorKey(refusal(500, 'boom'), 'error.voteFailed')).toBe('error.voteFailed')
    expect(apiErrorKey(new Error('offline'))).toBe('error.saveFailed')
  })

  it('lets a screen say it its own way', () => {
    expect(apiErrorKey(refusal(409, 'wrong_phase'), 'error.saveFailed', { wrong_phase: 'mvp.slots.locked' })).toBe('mvp.slots.locked')
  })
})
