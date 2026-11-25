import { describe, expect, it } from 'vitest'
import { imageKey, isProfileImageKey, profileImageKey, webpInfo } from '../../server/domain/image'
import { webpOf } from '../webp-fixtures'

// The WebP header reader behind the profile picture upload (#678): size and animation from the first bytes, no decoding.

describe('webpInfo', () => {
  it('reads a lossy 256 × 256 file', () => {
    expect(webpInfo(webpOf({ form: 'lossy', width: 256, height: 256 }))).toEqual({ width: 256, height: 256, animated: false })
  })

  it('reads a lossless 256 × 256 file, whose size fields hold the size minus one', () => {
    expect(webpInfo(webpOf({ form: 'lossless', width: 256, height: 256 }))).toEqual({ width: 256, height: 256, animated: false })
  })

  it('reads an extended still of 256 × 256', () => {
    expect(webpInfo(webpOf({ form: 'extended', width: 256, height: 256 }))).toEqual({ width: 256, height: 256, animated: false })
  })

  it('reads an extended file with the animation flag as animated', () => {
    expect(webpInfo(webpOf({ form: 'extended', width: 256, height: 256, animated: true }))).toEqual({ width: 256, height: 256, animated: true })
  })

  it('reads an extended file with an ANMF chunk and no flag as animated', () => {
    expect(webpInfo(webpOf({ form: 'extended', width: 256, height: 256, anim: 'ANMF' }))?.animated).toBe(true)
  })

  it('reads an extended file with an ANIM chunk and no flag as animated', () => {
    expect(webpInfo(webpOf({ form: 'extended', width: 256, height: 256, anim: 'ANIM' }))?.animated).toBe(true)
  })

  it.each([
    ['lossy', 255, 256],
    ['lossy', 256, 255],
    ['lossy', 512, 512],
    ['lossless', 255, 256],
    ['lossless', 256, 255],
    ['extended', 512, 512],
  ] as const)('reads a %s %i × %i file as its own size', (form, width, height) => {
    expect(webpInfo(webpOf({ form, width, height }))).toMatchObject({ width, height })
  })

  it('answers null for a header that is cut short', () => {
    for (const form of ['lossy', 'lossless', 'extended'] as const) {
      expect(webpInfo(webpOf({ form, width: 256, height: 256 }).subarray(0, 24))).toBeNull()
    }
  })

  it('answers null for an unknown first chunk', () => {
    const bytes = webpOf({ form: 'lossy', width: 256, height: 256 })
    bytes.set(Array.from('ABCD', char => char.charCodeAt(0)), 12)
    expect(webpInfo(bytes)).toBeNull()
  })

  it('answers null for RIFF and WEBP with nothing after, and for empty input', () => {
    expect(webpInfo(webpOf({ form: 'lossy', width: 256, height: 256 }).subarray(0, 12))).toBeNull()
    expect(webpInfo(new Uint8Array())).toBeNull()
  })
})

describe('profileImageKey', () => {
  it('starts with profile-, ends with .webp, and differs per call', () => {
    const first = profileImageKey()
    expect(first).toMatch(/^profile-[A-Za-z0-9_-]{16}\.webp$/)
    expect(profileImageKey()).not.toBe(first)
  })

  it('holds no UUID shape, so no User id', () => {
    expect(profileImageKey()).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  it('is told apart from a game\'s key by its prefix', () => {
    expect(isProfileImageKey(profileImageKey())).toBe(true)
    expect(isProfileImageKey(imageKey('3f2b8c1e-9a4d-4e6b-8c7a-1d2e3f4a5b6c'))).toBe(false)
    expect(isProfileImageKey('nope.webp')).toBe(false)
  })

  it('leaves a game\'s key as it was', () => {
    expect(imageKey('g')).toMatch(/^g-[A-Za-z0-9_-]{12,}\.webp$/)
  })
})
