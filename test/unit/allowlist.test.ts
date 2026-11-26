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
  const admins = parseAllowlist('discord:operator,twitch:operator_tv')
  const discord = (accountId: string) => ({ providerId: 'discord', accountId })
  const twitch = (accountId: string) => ({ providerId: 'twitch', accountId })

  it('sets nothing for an account that is not on the admin list: the Host permission is stored, not computed (ADR 0002)', () => {
    expect(permissionsFor([discord('someone')], admins)).toEqual({ isAdmin: false })
  })

  it('makes the operator Platform admin and sets the Host permission with it', () => {
    expect(permissionsFor([discord('operator')], admins)).toEqual({ isAdmin: true, canHost: true })
  })

  it('matches provider and id together', () => {
    expect(permissionsFor([twitch('operator')], admins)).toEqual({ isAdmin: false })
  })

  it('makes a Platform admin when any linked account is listed', () => {
    expect(permissionsFor([twitch('nobody'), twitch('operator_tv')], admins)).toEqual({ isAdmin: true, canHost: true })
  })

  it('sets nothing without accounts', () => {
    expect(permissionsFor([], admins)).toEqual({ isAdmin: false })
  })
})
