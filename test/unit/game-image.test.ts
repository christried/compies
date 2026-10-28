import { describe, expect, it } from 'vitest'
import { canSeeImage } from '../../server/domain/image-access'
import { imageKey, isWebp } from '../../server/domain/image'

const bytes = (text: string) => Uint8Array.from(text.split('').map(char => char.charCodeAt(0)))
const webp = Uint8Array.from([...bytes('RIFF'), 0x1a, 0, 0, 0, ...bytes('WEBPVP8 ')])

describe('isWebp (#143)', () => {
  it('accepts the RIFF and WEBP marks', () => {
    expect(isWebp(webp)).toBe(true)
  })

  it('refuses a PNG, a JPEG, other RIFF files and anything too short', () => {
    expect(isWebp(Uint8Array.from([0x89, ...bytes('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe(false)
    expect(isWebp(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...bytes('JFIF'), 0, 1, 1, 0]))).toBe(false)
    expect(isWebp(Uint8Array.from([...bytes('RIFF'), 0, 0, 0, 0, ...bytes('WAVEfmt ')]))).toBe(false)
    expect(isWebp(bytes('RIFF'))).toBe(false)
    expect(isWebp(new Uint8Array())).toBe(false)
  })
})

describe('imageKey', () => {
  it('starts with the game id, ends in .webp and is new every time', () => {
    const a = imageKey('game-1')
    const b = imageKey('game-1')

    expect(a).toMatch(/^game-1-[A-Za-z0-9_-]{12,}\.webp$/)
    expect(a).not.toBe(b)
  })
})

describe('canSeeImage (#143, #148)', () => {
  const game = { id: 'g1', createdBy: 'u1' }
  const libraryViewer = { canHost: true, isAdmin: false }
  const nobody = { canHost: false, isAdmin: false }

  it('lets library viewers see it', () => {
    expect(canSeeImage({ viewer: libraryViewer, game, poolEvents: [] })).toBe(true)
    expect(canSeeImage({ viewer: { canHost: false, isAdmin: true }, game, poolEvents: [] })).toBe(true)
    expect(canSeeImage({ viewer: libraryViewer, game, poolEvents: [{ isHost: false, hiddenWheel: true }] })).toBe(true)
  })

  it('lets a Member of an Event whose pool holds the game see it while that wheel is not hidden', () => {
    expect(canSeeImage({ viewer: nobody, game, poolEvents: [{ isHost: false, hiddenWheel: false }] })).toBe(true)
  })

  it('lets a Member see it when only one of several Events has a visible wheel', () => {
    const poolEvents = [{ isHost: false, hiddenWheel: true }, { isHost: false, hiddenWheel: false }]

    expect(canSeeImage({ viewer: nobody, game, poolEvents })).toBe(true)
  })

  it('refuses a Member who is in hidden-wheel Events only', () => {
    expect(canSeeImage({ viewer: nobody, game, poolEvents: [{ isHost: false, hiddenWheel: true }] })).toBe(false)
    expect(canSeeImage({ viewer: nobody, game, poolEvents: [{ isHost: false, hiddenWheel: true }, { isHost: false, hiddenWheel: true }] })).toBe(false)
  })

  it('lets the Host of a hidden-wheel Event see it even without the library permission', () => {
    expect(canSeeImage({ viewer: nobody, game, poolEvents: [{ isHost: true, hiddenWheel: true }] })).toBe(true)
  })

  it('refuses everyone else: no pool Event, or signed out', () => {
    expect(canSeeImage({ viewer: nobody, game, poolEvents: [] })).toBe(false)
    expect(canSeeImage({ viewer: null, game, poolEvents: [] })).toBe(false)
  })

  it('refuses a signed-out viewer whatever the Events say', () => {
    expect(canSeeImage({ viewer: null, game, poolEvents: [{ isHost: true, hiddenWheel: false }] })).toBe(false)
  })
})
