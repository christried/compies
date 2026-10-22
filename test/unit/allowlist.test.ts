import { describe, expect, it } from 'vitest'
import { parseAllowlist, permissionsFor } from '../../server/domain/allowlist'

describe('parseAllowlist', () => {
  it('reads comma-separated provider:id entries', () => {
    expect(parseAllowlist('discord:80351110224678912,twitch:141981764')).toEqual(
      new Set(['discord:80351110224678912', 'twitch:141981764']),
    )
  })

  it('ignores whitespace around entries and empty entries', () => {
    expect(parseAllowlist(' discord:1 , ,twitch:2 ,')).toEqual(new Set(['discord:1', 'twitch:2']))
  })

  it('treats a missing or empty variable as nobody', () => {
    expect(parseAllowlist(undefined)).toEqual(new Set())
    expect(parseAllowlist('')).toEqual(new Set())
  })

  it('reads the provider case-insensitively but keeps the id as it is', () => {
    expect(parseAllowlist('Discord:Ab1')).toEqual(new Set(['discord:Ab1']))
  })

  it('skips entries without an id or with an unknown provider', () => {
    expect(parseAllowlist('discord:,1234,github:5,:6,twitch:7')).toEqual(new Set(['twitch:7']))
  })
})

describe('permissionsFor', () => {
  const allowlist = {
    hosts: parseAllowlist('discord:host,twitch:streamer'),
    admins: parseAllowlist('discord:operator'),
  }
  const discord = (accountId: string) => ({ providerId: 'discord', accountId })
  const twitch = (accountId: string) => ({ providerId: 'twitch', accountId })

  it('grants nothing to an account on neither list', () => {
    expect(permissionsFor([discord('someone')], allowlist)).toEqual({ canHost: false, isAdmin: false })
  })

  it('grants the Host permission to a listed Host', () => {
    expect(permissionsFor([twitch('streamer')], allowlist)).toEqual({ canHost: true, isAdmin: false })
  })

  it('makes the operator Platform admin and Host', () => {
    expect(permissionsFor([discord('operator')], allowlist)).toEqual({ canHost: true, isAdmin: true })
  })

  it('matches provider and id together', () => {
    expect(permissionsFor([twitch('host')], allowlist)).toEqual({ canHost: false, isAdmin: false })
  })

  it('grants a right when any linked account is listed', () => {
    expect(permissionsFor([twitch('nobody'), discord('host')], allowlist)).toEqual({ canHost: true, isAdmin: false })
  })

  it('grants nothing without accounts', () => {
    expect(permissionsFor([], allowlist)).toEqual({ canHost: false, isAdmin: false })
  })
})
