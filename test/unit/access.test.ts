import { describe, expect, it } from 'vitest'
import { eventAccessRejection } from '../../server/domain/access'

const live = { hostId: 'host', deletedAt: null }
const deleted = { hostId: 'host', deletedAt: new Date('2026-10-01T10:00:00Z') }

describe('eventAccessRejection', () => {
  it('lets a Member in, and the Host into host-only requests', () => {
    expect(eventAccessRejection({ event: live, isMember: true, userId: 'member', hostOnly: false })).toBeNull()
    expect(eventAccessRejection({ event: live, isMember: true, userId: 'host', hostOnly: true })).toBeNull()
  })

  it('answers an unknown slug and a non-Member the same, so Events cannot be probed', () => {
    expect(eventAccessRejection({ event: null, isMember: false, userId: 'member', hostOnly: false })).toBe('not_found')
    expect(eventAccessRejection({ event: live, isMember: false, userId: 'member', hostOnly: false })).toBe('not_found')
    expect(eventAccessRejection({ event: deleted, isMember: false, userId: 'member', hostOnly: true })).toBe('not_found')
  })

  it('tells only a former Member that the Event was deleted, before any Host check', () => {
    expect(eventAccessRejection({ event: deleted, isMember: true, userId: 'member', hostOnly: true })).toBe('deleted')
  })

  it('refuses host-only requests by other Members', () => {
    expect(eventAccessRejection({ event: live, isMember: true, userId: 'member', hostOnly: true })).toBe('not_host')
  })
})
