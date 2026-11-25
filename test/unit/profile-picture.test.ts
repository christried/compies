import { describe, expect, it } from 'vitest'
import { profilePicture } from '../../shared/auth'

// Shown is the uploaded picture, else the provider's, else nothing (#678, GLOSSARY: Profile picture).

describe('profilePicture', () => {
  it('prefers the uploaded picture over the provider\'s', () => {
    expect(profilePicture({ image: 'https://cdn.example.com/a.png', profileImageKey: 'profile-abc.webp' })).toBe('/api/images/profile-abc.webp')
  })

  it('falls back to the provider\'s picture without an upload', () => {
    expect(profilePicture({ image: 'https://cdn.example.com/a.png', profileImageKey: null })).toBe('https://cdn.example.com/a.png')
  })

  it('shows the upload when the provider has none', () => {
    expect(profilePicture({ image: null, profileImageKey: 'profile-abc.webp' })).toBe('/api/images/profile-abc.webp')
  })

  it('is null with neither', () => {
    expect(profilePicture({ image: null, profileImageKey: null })).toBeNull()
  })

  it('reads absent fields as none', () => {
    expect(profilePicture({})).toBeNull()
    expect(profilePicture({ image: undefined, profileImageKey: undefined })).toBeNull()
    expect(profilePicture({ image: 'https://cdn.example.com/a.png' })).toBe('https://cdn.example.com/a.png')
  })
})
