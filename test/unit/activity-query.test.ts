import { describe, expect, it } from 'vitest'
import { parseActivityQuery } from '../../server/domain/activity'
import { ACTIVITY_PAGE_DEFAULT, ACTIVITY_PAGE_MAX } from '../../shared/activity'

// The Activity feed's query (#159, N5 of review 1.4): a bad cursor is invalid_cursor, a bad limit invalid_value.
const ID = '00000000-0000-4000-8000-000000000000'

describe('parseActivityQuery', () => {
  it('takes no query as the first page of the default size', () => {
    expect(parseActivityQuery({})).toEqual({ ok: true, before: undefined, limit: ACTIVITY_PAGE_DEFAULT })
  })

  it('reads a cursor that is an id and a limit that is a whole number from 1 to the maximum', () => {
    expect(parseActivityQuery({ before: ID, limit: '2' })).toEqual({ ok: true, before: ID, limit: 2 })
    expect(parseActivityQuery({ limit: '1' })).toEqual({ ok: true, before: undefined, limit: 1 })
    expect(parseActivityQuery({ limit: String(ACTIVITY_PAGE_MAX) })).toEqual({ ok: true, before: undefined, limit: ACTIVITY_PAGE_MAX })
  })

  it('refuses a cursor that is not an id with invalid_cursor', () => {
    expect(parseActivityQuery({ before: 'nope' })).toEqual({ ok: false, error: 'invalid_cursor' })
    expect(parseActivityQuery({ before: ['a', 'b'] })).toEqual({ ok: false, error: 'invalid_cursor' })
  })

  it('refuses a limit it cannot use with invalid_value, whatever the cursor', () => {
    for (const limit of ['0', 'abc', '-1', '1.5', `${ACTIVITY_PAGE_MAX + 1}`, '', ['2']]) {
      expect(parseActivityQuery({ limit }), String(limit)).toEqual({ ok: false, error: 'invalid_value' })
    }
    expect(parseActivityQuery({ before: 'nope', limit: '0' })).toEqual({ ok: false, error: 'invalid_cursor' })
    expect(parseActivityQuery({ before: ID, limit: '0' })).toEqual({ ok: false, error: 'invalid_value' })
  })
})
