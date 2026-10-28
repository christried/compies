import { describe, expect, it } from 'vitest'
import { shownName } from '../../shared/auth'

describe('shownName (D5)', () => {
  it('is the Display name once the User set one', () => {
    expect(shownName({ name: 'discord_dom', displayName: 'Dom' })).toBe('Dom')
  })

  it('falls back to the provider name before that', () => {
    expect(shownName({ name: 'discord_dom', displayName: null })).toBe('discord_dom')
    expect(shownName({ name: 'discord_dom' })).toBe('discord_dom')
  })
})
