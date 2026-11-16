import { describe, expect, it } from 'vitest'
import { canSeeImage, ownsImage } from '../../server/domain/image-access'
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
  const libraryViewer = { id: 'host-1', canHost: true }
  const nobody = { id: 'member-1', canHost: false }
  const hidden = { isHost: false, poolPreview: false, set: false }

  it('lets the owner with the Host permission see it, with no Event at all (#723)', () => {
    expect(canSeeImage({ viewer: libraryViewer, ownerIds: ['host-1'], gameEvents: [] })).toBe(true)
    expect(canSeeImage({ viewer: libraryViewer, ownerIds: ['host-1'], gameEvents: [hidden] })).toBe(true)
  })

  it('lets each owner of a key that copies share see it (#723)', () => {
    const ownerIds = ['host-1', 'host-3', 'host-4']

    for (const id of ownerIds) expect(canSeeImage({ viewer: { id, canHost: true }, ownerIds, gameEvents: [] })).toBe(true)
  })

  it('refuses a viewer with the Host permission who owns no game with the key, unless an Event lets them see it (#723)', () => {
    expect(canSeeImage({ viewer: libraryViewer, ownerIds: ['host-3'], gameEvents: [] })).toBe(false)
    expect(canSeeImage({ viewer: libraryViewer, ownerIds: ['host-3'], gameEvents: [hidden] })).toBe(false)
    expect(canSeeImage({ viewer: libraryViewer, ownerIds: ['host-3'], gameEvents: [{ isHost: false, poolPreview: true, set: false }] })).toBe(true)
  })

  it('refuses an owner who lost the Host permission, unless they host an Event that shows it (#723)', () => {
    expect(canSeeImage({ viewer: { id: 'host-1', canHost: false }, ownerIds: ['host-1'], gameEvents: [] })).toBe(false)
    expect(canSeeImage({ viewer: { id: 'host-1', canHost: false }, ownerIds: ['host-1'], gameEvents: [{ isHost: true, poolPreview: false, set: false }] })).toBe(true)
  })

  it('lets a Member of an Event whose pool holds the game see it while its Pool preview is on', () => {
    expect(canSeeImage({ viewer: nobody, ownerIds: [], gameEvents: [{ isHost: false, poolPreview: true, set: false }] })).toBe(true)
  })

  it('lets a Member see it when only one of several Events has its Pool preview on', () => {
    const gameEvents = [{ isHost: false, poolPreview: false, set: false }, { isHost: false, poolPreview: true, set: false }]

    expect(canSeeImage({ viewer: nobody, ownerIds: [], gameEvents })).toBe(true)
  })

  it('refuses a Member who is in Events with the Pool preview off only', () => {
    expect(canSeeImage({ viewer: nobody, ownerIds: [], gameEvents: [{ isHost: false, poolPreview: false, set: false }] })).toBe(false)
    expect(canSeeImage({ viewer: nobody, ownerIds: [], gameEvents: [{ isHost: false, poolPreview: false, set: false }, { isHost: false, poolPreview: false, set: false }] })).toBe(false)
  })

  it('lets the Host of an Event with the Pool preview off see it even without the library permission', () => {
    expect(canSeeImage({ viewer: nobody, ownerIds: [], gameEvents: [{ isHost: true, poolPreview: false, set: false }] })).toBe(true)
  })

  it('refuses everyone else: no pool Event, or signed out', () => {
    expect(canSeeImage({ viewer: nobody, ownerIds: [], gameEvents: [] })).toBe(false)
    expect(canSeeImage({ viewer: null, ownerIds: [], gameEvents: [] })).toBe(false)
  })

  it('lets a Member see a game that a Round has set, with the Pool preview off (#228)', () => {
    expect(canSeeImage({ viewer: nobody, ownerIds: [], gameEvents: [{ isHost: false, poolPreview: false, set: true }] })).toBe(true)
  })

  it('refuses a signed-out viewer whatever the Events say', () => {
    expect(canSeeImage({ viewer: null, ownerIds: [], gameEvents: [{ isHost: true, poolPreview: true, set: false }] })).toBe(false)
  })
})

describe('ownsImage (#723)', () => {
  it('is true for a viewer with the Host permission among the owners, false otherwise', () => {
    expect(ownsImage({ id: 'a', canHost: true }, ['b', 'a'])).toBe(true)
    expect(ownsImage({ id: 'a', canHost: true }, ['b'])).toBe(false)
    expect(ownsImage({ id: 'a', canHost: false }, ['a'])).toBe(false)
    expect(ownsImage(null, ['a'])).toBe(false)
  })
})
