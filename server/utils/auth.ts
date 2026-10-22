import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { parseAllowlist, permissionsFor } from '../domain/allowlist'
import * as schema from '../db/schema'
import { useDb, type Db } from './db'

export type Auth = ReturnType<typeof createAuth>

declare module 'h3' {
  interface H3EventContext {
    auth?: Auth
  }
}

/**
 * Better Auth on the given database. Built per request, because the database is (ADR 0005).
 * The allowlist is read at each sign-in, so a change takes effect at the User's next sign-in.
 */
export function createAuth(db: Db) {
  const env = process.env

  // Recomputed from all linked accounts, so signing in with one provider never drops a right
  // that another linked provider grants (ADR 0002).
  async function syncPermissions(userId: string) {
    const accounts = await db
      .select({ providerId: schema.authAccounts.providerId, accountId: schema.authAccounts.accountId })
      .from(schema.authAccounts)
      .where(eq(schema.authAccounts.userId, userId))
    const allowlist = { hosts: parseAllowlist(env.HOST_PROVIDER_IDS), admins: parseAllowlist(env.ADMIN_PROVIDER_IDS) }
    await db.update(schema.users).set(permissionsFor(accounts, allowlist)).where(eq(schema.users.id, userId))
  }
  const sync = { after: async (account: { userId: string }) => syncPermissions(account.userId) }

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    // The adapter looks tables up by model name (ADR 0004).
    database: drizzleAdapter(db, {
      provider: 'pg',
      transaction: true,
      schema: {
        users: schema.users,
        auth_sessions: schema.authSessions,
        auth_accounts: schema.authAccounts,
        auth_verifications: schema.authVerifications,
      },
    }),
    user: { modelName: 'users' },
    // Permission checks read the database, so a cached session must never stand in for it.
    session: { modelName: 'auth_sessions', cookieCache: { enabled: false } },
    account: {
      modelName: 'auth_accounts',
      // Signing in with a second provider joins the existing User when both providers report the
      // same email as verified (ADR 0009). Never add trustedProviders or allowDifferentEmails:
      // either would let an unverified email take over someone else's User.
      accountLinking: { enabled: true },
    },
    verification: { modelName: 'auth_verifications' },
    advanced: { database: { generateId: 'uuid' } },
    databaseHooks: { account: { create: sync, update: sync, delete: sync } },
    // `name` and `image` mirror the provider at every sign-in. A missing email gets a placeholder,
    // since Better Auth requires one; it is never shown or used (ADR 0008).
    socialProviders: {
      discord: {
        clientId: env.DISCORD_CLIENT_ID ?? '',
        clientSecret: env.DISCORD_CLIENT_SECRET ?? '',
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: profile => ({ email: profile.email || `${profile.id}@discord.placeholder.invalid` }),
      },
      twitch: {
        clientId: env.TWITCH_CLIENT_ID ?? '',
        clientSecret: env.TWITCH_CLIENT_SECRET ?? '',
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: profile => ({ email: profile.email || `${profile.sub}@twitch.placeholder.invalid` }),
      },
    },
  })
}

/** Better Auth for this request, on the request's database. */
export function useAuth(event: H3Event): Auth {
  event.context.auth ??= createAuth(useDb(event))
  return event.context.auth
}
