import { describe, expect, it } from 'vitest'
import { readPerson, shownName } from '../../shared/auth'

describe('shownName (D5)', () => {
  it('is the Display name once the User set one', () => {
    expect(shownName({ name: 'discord_dom', displayName: 'Dom' })).toBe('Dom')
  })

  it('falls back to the provider name before that', () => {
    expect(shownName({ name: 'discord_dom', displayName: null })).toBe('discord_dom')
    expect(shownName({ name: 'discord_dom' })).toBe('discord_dom')
  })
})

// What a read shows of a User (#915, ADR 0020): a Deleted User's name and picture are cut by the read itself, whatever the row still holds.
describe('readPerson', () => {
  it('gives a User who is not deleted the shown name and the picture, with no deleted key', () => {
    const person = readPerson({ name: 'discord_dom', displayName: 'Dom', image: 'https://example.com/dom.png', profileImageKey: null, deletedAt: null })

    expect(person).toEqual({ name: 'Dom', image: 'https://example.com/dom.png' })
    expect(person).not.toHaveProperty('deleted')
  })

  it('falls back to the provider name without a Display name, and to no picture when there is none', () => {
    expect(readPerson({ name: 'discord_dom', displayName: null, profileImageKey: null, deletedAt: null })).toEqual({ name: 'discord_dom', image: null })
    expect(readPerson({ name: 'discord_dom', image: null, profileImageKey: null, deletedAt: null })).toEqual({ name: 'discord_dom', image: null })
  })

  it('shows the uploaded picture of a User who is not deleted (#678)', () => {
    expect(readPerson({ name: 'discord_dom', image: 'https://example.com/dom.png', profileImageKey: 'profile-abc.webp', deletedAt: null })).toEqual({ name: 'discord_dom', image: '/api/images/profile-abc.webp' })
  })

  it('cuts the name, the Display name and the picture of a Deleted User, whatever the row holds, an uploaded picture\'s key included', () => {
    expect(readPerson({ name: 'discord_dom', displayName: 'Dom', image: 'https://example.com/dom.png', profileImageKey: 'profile-abc.webp', deletedAt: new Date('2090-10-30T18:00:00.000Z') })).toEqual({ name: '', image: null, deleted: true })
  })
})
