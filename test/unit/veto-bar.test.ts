import { describe, expect, it } from 'vitest'
import { clockText } from '../../app/utils/veto-bar'

// The Veto window's clock as `m:ss` wherever its time is shown (#505): the inline window and the fixed bar.

describe('clockText', () => {
  it.each([
    [0, '0:00'],
    [1, '0:01'],
    [59, '0:59'],
    [60, '1:00'],
    [61, '1:01'],
    [150, '2:30'],
    [0.2, '0:01'],
    [-5, '0:00'],
  ])('shows %s seconds as %s', (seconds, expected) => {
    expect(clockText(seconds)).toBe(expected)
  })
})
