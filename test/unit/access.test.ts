import { describe, expect, it } from 'vitest'
import { sessionAccessRejection } from '../../server/domain/access'

const live = { hostId: 'host', deletedAt: null }
const deleted = { hostId: 'host', deletedAt: new Date('2026-10-01T10:00:00Z') }

describe('sessionAccessRejection', () => {
  it('lets a Member in, and the Host into host-only requests', () => {
    expect(sessionAccessRejection({ session: live, isMember: true, userId: 'guest', hostOnly: false })).toBeNull()
    expect(sessionAccessRejection({ session: live, isMember: true, userId: 'host', hostOnly: true })).toBeNull()
  })

  it('answers an unknown slug and a non-Member the same, so Sessions cannot be probed', () => {
    expect(sessionAccessRejection({ session: null, isMember: false, userId: 'guest', hostOnly: false })).toBe('not_found')
    expect(sessionAccessRejection({ session: live, isMember: false, userId: 'guest', hostOnly: false })).toBe('not_found')
    expect(sessionAccessRejection({ session: deleted, isMember: false, userId: 'guest', hostOnly: true })).toBe('not_found')
  })

  it('tells only a former Member that the Session was deleted, before any Host check', () => {
    expect(sessionAccessRejection({ session: deleted, isMember: true, userId: 'guest', hostOnly: true })).toBe('deleted')
  })

  it('refuses host-only requests by other Members', () => {
    expect(sessionAccessRejection({ session: live, isMember: true, userId: 'guest', hostOnly: true })).toBe('not_host')
  })
})
