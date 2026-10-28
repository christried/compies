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

  it('explains the settings refusals (#144)', () => {
    expect(apiErrorKey(refusal(400, 'too_many_players'))).toBe('error.tooManyPlayers')
    expect(apiErrorKey(refusal(400, 'points_rising'))).toBe('error.pointsOrder')
    expect(apiErrorKey(refusal(400, 'team_count_range'))).toBe('error.teamCountRange')
    expect(apiErrorKey(refusal(400, 'invalid_settings'))).toBe('error.saveFailed')
  })

  it('explains the refusals of the Game library (#141)', () => {
    expect(apiErrorKey(refusal(400, 'invalid_game_name'))).toBe('error.gameNameInvalid')
    expect(apiErrorKey(refusal(400, 'invalid_youtube'))).toBe('gameEdit.badLink')
    expect(apiErrorKey(refusal(400, 'invalid_clip'))).toBe('error.clipInvalid')
  })

  it('explains the player count, the Formats and the edit refusal (#142)', () => {
    expect(apiErrorKey(refusal(400, 'invalid_players'))).toBe('error.playersInvalid')
    expect(apiErrorKey(refusal(400, 'invalid_formats'))).toBe('error.formatsInvalid')
    expect(apiErrorKey(refusal(403, 'not_game_editor'))).toBe('error.notGameEditor')
  })

  it('explains the refusals of a game image (#143)', () => {
    expect(apiErrorKey(refusal(413, 'image_too_large'))).toBe('error.imageTooLarge')
    expect(apiErrorKey(refusal(415, 'image_not_webp'))).toBe('error.imageNotWebp')
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
