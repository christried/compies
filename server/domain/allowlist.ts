import { isSignInProvider } from '../../shared/auth'

// The Platform admin role comes from an env allowlist of provider account ids (ADR 0002), e.g.
// ADMIN_PROVIDER_IDS=discord:80351110224678912,twitch:141981764. The Host permission is stored and
// granted in the app (ADR 0002, amendment of 2026-11-20); the sign-in only adds it for a Platform admin.

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

/**
 * The columns a sign-in sets, from all of a User's linked accounts. The role is recomputed every time; the Host permission
 * is only ever switched on, for a Platform admin (who always hosts), and otherwise left as stored.
 */
export function permissionsFor(accounts: ProviderAccount[], admins: Set<string>): { isAdmin: boolean, canHost?: true } {
  const isAdmin = accounts.some(account => admins.has(`${account.providerId}:${account.accountId}`))
  return isAdmin ? { isAdmin, canHost: true } : { isAdmin }
}
