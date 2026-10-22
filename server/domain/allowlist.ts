import { isSignInProvider } from '../../shared/auth'

// Host permission and Platform admin role from env allowlists of provider account ids (ADR 0002),
// e.g. HOST_PROVIDER_IDS=discord:80351110224678912,twitch:141981764.

export interface Allowlist {
  hosts: Set<string>
  admins: Set<string>
}

export interface ProviderAccount {
  providerId: string
  accountId: string
}

/** The `provider:id` keys in an allowlist variable. Malformed entries are skipped, never fatal. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  const keys = new Set<string>()
  for (const entry of (raw ?? '').split(',')) {
    const separator = entry.indexOf(':')
    const provider = entry.slice(0, separator).trim().toLowerCase()
    const id = entry.slice(separator + 1).trim()
    if (separator > 0 && id && isSignInProvider(provider)) keys.add(`${provider}:${id}`)
  }
  return keys
}

/** A User's rights from all of their linked accounts. The Platform admin can always host. */
export function permissionsFor(accounts: ProviderAccount[], allowlist: Allowlist) {
  const keys = accounts.map(account => `${account.providerId}:${account.accountId}`)
  const isAdmin = keys.some(key => allowlist.admins.has(key))
  const canHost = isAdmin || keys.some(key => allowlist.hosts.has(key))
  return { canHost, isAdmin }
}
