# Better Auth + Discord/Twitch + Drizzle + Neon: research notes for COMPIES

Research date: 2026-10-22.
Library checked: **better-auth v1.7.12** (GitHub release `v1.7.12`, published 2026-10-20; npm `latest` = 1.7.12). Source was read at git tag `v1.7.12` (commit `f4260a95`).
Other versions checked: drizzle-orm `0.45.4` (drizzle-team/drizzle-orm `main` @ `eab8bed`, not a tag); `@neondatabase/serverless` `1.2.0` (neondatabase/serverless `main` @ `54d963f`); discord-api-docs `main` @ `fd75e22`.

Citation keys are in the **Source index** at the bottom. `[S#]` = Better Auth docs/source, `[C#]` = Better Auth source file (tag v1.7.12, with line numbers), `[P#]` = provider / ORM / Neon primary docs. Anything I could not confirm from a primary source is marked **UNVERIFIED**.

---

## TL;DR and recommendations

1. **Mount:** `server/api/auth/[...all].ts` calls `auth.handler(toWebRequest(event))`; client is `createAuthClient` from `better-auth/vue`. This is the documented Nuxt setup [S1]. Keep the default `/api/auth` base path.
2. **Discord:** Better Auth requests `identify` + `email` by default [C2 L93]. **Twitch:** requests `user:read:email` + `openid` by default [C1 L47-49] and asks for the `email`, `email_verified`, `preferred_username`, `picture` claims [C1 L59-64]. Twitch's docs say the email claims require `user:read:email` [P1]. Twitch returns `email: null` when `email_verified` is false [P1], and Better Auth then fails sign-in with `email_not_found` [C3 L206-209]. Discord returns no email unless the `email` scope is granted [P4] and can be null for phone-only accounts [S2].
3. **Email is required today.** Better Auth still requires `email` on every user (TODO for v2 at [C4 L158-160]). Use a `mapProfileToUser` placeholder for accounts without email [S4]. Do not rely on provider email for authorization.
4. **Role sync hook:** use `databaseHooks.account.update.after` (plus `create.after` and `delete.after`). It fires on every sign-in with the provider `providerId` and `accountId`, and the `userId` [C4 L397-426, C7, C8 L1583-1650]. Recompute `canHost` / `isAdmin` from **all** linked accounts of that user, not just the one that just signed in. Do not use `mapProfileToUser` for roles: fields with `input: false` are dropped there [S4][C4 L474-478, L527-531]. Use `user.validateUserInfo` only for hard deny rules [S4][C9].
5. **Schema:** set `user.modelName: "users"`, `session.modelName: "auth_sessions"`, `account.modelName: "auth_accounts"`, `verification.modelName: "auth_verifications"`. The Drizzle adapter looks tables up by the **custom model name**, so the keys of the `schema` object must equal those names [C13 L884-890][C12 L215-232]. Generate with `npx auth@latest generate --output ...` [S9]. Do not combine `usePlural: true` with explicit plural names (see section 4).
6. **Extra user fields:** add `canHost` and `isAdmin` as `boolean`, `input: false`, `defaultValue: false` [S5]. Reuse core `name` and `image` instead of adding `displayName` / `avatarUrl`, which duplicate core fields.
7. **IDs:** `advanced.database.generateId: "uuid"`. On Postgres the database generates the UUID (`gen_random_uuid()`) [C8 L454-459][C11 L76-95][C16 L239-240].
8. **Linking:** implicit linking is allowed only when the provider reports the email as verified, or the provider is in `trustedProviders`, and the local user is also verified [C4 L282-296]. For Discord + Twitch, consider `account.accountLinking.disableImplicitLinking: true` and link with `linkSocial` while signed in [S7]. Avoid `allowDifferentEmails` unless you accept the takeover warning [C8 L1280-1294].
9. **Driver:** Better Auth's Drizzle adapter defaults to `transaction: false` (no interactive transactions) [C12 L157-167][C13 L860-873]. Drizzle's `neon-http` throws on `db.transaction()` [P6 L248-254]. Use **`drizzle-orm/neon-serverless` with `Pool`** for both Vercel Node and Cloudflare Workers, create it per request on Workers, and then `transaction: true` is available [P7][P9]. Hyperdrive + `pg` is the Cloudflare-recommended alternative [P10]. **UNVERIFIED end-to-end** on both runtimes (no spike run).
10. **Cookies / URLs:** set `BETTER_AUTH_URL` per deployment (localhost, staging, prod). An `https://` base URL makes cookies `Secure` automatically [C10 L57-75]. Add all three origins to `trustedOrigins` if the frontend ever differs from `baseURL` [S10]. Register `<origin>/api/auth/callback/discord` and `.../twitch` for each origin in each provider console [S2][S3][P3].

---

## 1. Mounting Better Auth in Nuxt 4 (officially documented)

**Documented steps** [S1]:

- Server handler at `server/api/auth/[...all].ts`:
  ```ts
  import { auth } from "~~/lib/auth";
  export default defineEventHandler((event) => {
    return auth.handler(toWebRequest(event));
  });
  ```
  Source of the snippet: `docs/content/docs/integrations/nuxt.mdx` (live: https://better-auth.com/docs/integrations/nuxt).
- Auth instance in `lib/auth.ts` (imported as `~~/lib/auth`).
- Client at `lib/auth-client.ts`:
  ```ts
  import { createAuthClient } from "better-auth/vue";
  export const authClient = createAuthClient();
  export const { signIn, signUp, signOut, useSession } = authClient;
  ```
  The docs say the Vue client makes `useSession` return Vue refs [S1]. The `./vue` export exists in the package [C19 `packages/better-auth/package.json` exports `./vue`].
- Keep the catch-all path `/api/auth/[...all]` (docs recommend it; it can be changed in config) [S1].
- Server-side session check: `auth.api.getSession({ headers: event.headers })` [S1].
- Docs show `authClient.useSession(useFetch)` in pages for SSR hydration [S1].

**Notes / gotchas**

- `toWebRequest` is used without an import in the docs example [S1]. I did not check whether Nitro auto-imports it from h3. **UNVERIFIED**: if the auto-import is missing, import it from `h3`.
- The docs' `createAuthClient()` call has no `baseURL` [S1]. The docs do not say what the default is; the `useAuth` composable in S1 sets `baseURL` to the request origin only for SSR cookie forwarding. **UNVERIFIED:** the client's default base URL behavior in v1.7.12 (not checked).
- Cloudflare Workers needs the `nodejs_compat` flag (Better Auth uses AsyncLocalStorage) [S12][S13].

---

## 2. Discord and Twitch providers

### 2a. Discord

**Config** [S2]: `socialProviders.discord = { clientId, clientSecret }` (plus optional `prompt`, `permissions`, `mapProfileToUser`, `disableSignUp`, etc. [S4]).
Redirect URI: `http://localhost:3000/api/auth/callback/discord` for local dev, your app URL for production [S2].

**Scopes** [C2 L92-96]: defaults are `identify` and `email`. Extra scopes can be added with `scope`. Better Auth also sends `prompt` defaulting to `"none"` [C2 L104]. Note: `prompt: "none"` skips the consent screen when the user already authorized those scopes; new scopes may then be granted silently. (Behavior from Discord's docs: "If set to `none`, it will skip the authorization screen" [P3].)

**Profile fields returned** [P4] (Discord `GET /users/@me`):
- Always with `identify`: `id`, `username`, `discriminator`, `global_name`, `avatar`, `locale`, `flags`, `premium_type`, `public_flags`, `avatar_decoration_data`, etc.
- Only with `email` scope: `email` (may be null) and `verified` (whether the email is verified) [P4 table rows `verified?`, `email?`]. `/users/@me` "requires the `identify` scope, which will return the object _without_ an email, and optionally the `email` scope, which returns the object _with_ an email if the user has one" [P4].
- Better Auth's `DiscordProfile` type lists these fields [C2 L8-78].

**Mapping to Better Auth user** [C2 L134-171]:
- `name` = `global_name || username` [C2 L163].
- `email` = `profile.email` [C2 L164] (may be null/undefined).
- `emailVerified` = `profile.verified` [C2 L165].
- `image` = CDN avatar URL built from `avatar` (or default avatar) [C2 L150-159].
- `accountId` = `profile.id` (`accountSubject`) [C2 L91].
- `mapProfileToUser` output is spread last, so it can override `email` [C2 L160-168].

**Does Discord return an email?** Only with the `email` scope, and only if the account has one [P4]. Better Auth's docs say Discord returns `email: null` for phone-only accounts even with `email` granted [S2]. The docs recommend a placeholder fallback with `mapProfileToUser` [S4]:
```ts
mapProfileToUser: (profile) => ({
  email: profile.email ?? `${profile.id}@discord.placeholder.invalid`,
}),
```

### 2b. Twitch

**Config** [S3]: `socialProviders.twitch = { clientId, clientSecret }`. Redirect URI `http://localhost:3000/api/auth/callback/twitch` for local dev [S3]. The docs warn: "Twitch users who do not have an email address will not be able to sign in" [S3].

**Scopes** [C1 L46-51]: defaults are `["user:read:email", "openid"]` unless `disableDefaultScope: true`. Extra scopes via `scope`.
- Twitch docs: "If you specify the `email` or `email_verified` claims, you must include the `user:read:email` scope in your list of scopes." [P1]
- `user:read:email` = "View a user's email address." [P2]
- **Does Better Auth request it by default?** Yes [C1 L47-49]. If you set `disableDefaultScope: true`, the scope is dropped while the email claims are still requested [C1 L59-64] (Twitch's rule then applies).
- **UNVERIFIED:** what Twitch does when the scope is missing (error vs. silently omitted claim). The docs require the scope but do not say.

**Claims requested** [C1 L59-64][C18 L93-104]: `email`, `email_verified`, `preferred_username`, `picture` (passed as the OIDC `claims` parameter). The default claims JSON also includes `id_token: { email: null, email_verified: null, ...}` [C18 L104].

**Profile fields returned** [P1][C1 L13-34]: ID token claims. `sub` ("The ID of the user that authorized the app" [P1]), `preferred_username` ("The user's display name" [P1]), `email` ("The email address of the user that authorized the app" [P1]), `email_verified`, `picture`, `aud`.
- Twitch docs: "Note: If `email_verified` is false, then this field will return `null`." [P1]
- So an unverified Twitch email arrives as `null`.

**Mapping** [C1 L98-109]:
- `name` = `preferred_username`; `email` = `profile.email`; `emailVerified` = `profile.email_verified`; `image` = `picture`.
- `accountId` = `profile.sub` [C1 L45].
- `getUserInfo` decodes the ID token with `jose`'s `decodeJwt` [C1 L98] and does not verify the signature, issuer, or audience in that function [C1 L89-109]. The spec allows TLS server validation instead of a signature check for an ID token received directly from the token endpoint, for the **issuer** only; the client MUST validate signatures of other ID tokens [P5 §3.1.3.7 step 6]. **Observation for review, not a confirmed bug:** `aud` and `exp` are not checked by this code path. The token is received over TLS from the token endpoint in the callback [C1 L93].

### 2c. "What if the provider returns no email?"

- The callback rejects sign-in when `userInfo.email` is falsy, with redirect error `email_not_found` [C3 L206-209][C-oauth2/errors.ts L23 `EMAIL_NOT_FOUND: "email_not_found"`].
- Better Auth requires `email` on users: "Better Auth currently requires an email address on every user record" [S4]. The source has `TODO(#9124): v2 widens User.email to nullable` [C4 L158-160].
- Fallback: `mapProfileToUser` placeholder [S4]. For Twitch, the same pattern works, because `...userMap` is spread after the email field [C1 L100-107]: `email: profile.email ?? \`${profile.sub}@twitch.placeholder.invalid\`` (my extension of the documented pattern; placeholder addresses cannot receive mail [S4]).
- Linking an account that has no email to an existing user needs `account.accountLinking.allowDifferentEmails: true` [S7][C4 L105-112]. (The email-match check uses `userInfo.email?.toLowerCase()` [C4 L105-106].)

### 2d. Account identity

- Better Auth identifies an OAuth account by `(providerId, accountId)`. `accountId` = `String(accountSubject(profile))` [C5 L21-41]. Discord: `profile.id`; Twitch: `profile.sub` [C1 L45][C2 L91].
- So `HOST_PROVIDER_IDS=discord:<id>,twitch:<sub>` maps directly onto `providerId:accountId`.
- Docs: "Built-in providers derive identity from their documented immutable profile field" [S4].

---

## 3. Hooks: where to read `accountId` on every sign-in

### 3a. Comparison

| Hook | Fires on every sign-in? | Has provider accountId? | Verdict |
|---|---|---|---|
| `databaseHooks.user.create` | No, only when a new user is created [C4 L510-589] | No | Not for roles |
| `databaseHooks.session.create` | Yes: `createSession` runs on each OAuth sign-in [C4 L632-638] | No, session has only `userId` [S5] | Needs a lookup; weak |
| `databaseHooks.account.create` | First link only [C4 L555-558] | Yes (`providerId`, `accountId`, `userId`) [C17 L318-333] | Use with update |
| `databaseHooks.account.update` | Yes on sign-in when `account.updateAccountOnSignIn !== false`; the update always contains `providerId`, so the update is never empty [C4 L397-426][C8 L1208] | Yes (full updated Account row) [C8 L1606-1630][C7 L158-175] | **Recommended** |
| `databaseHooks.account.delete` | On unlink [C8 L1635-1650] | Yes | Needed to recompute roles on unlink |
| `hooks.after` on `/callback/:id` | Yes, every callback [C6 L225-265, L395-440], but no accountId, so you need a DB lookup | Only via lookup | Works, more code |
| `mapProfileToUser` | Runs on every callback [C1 L99][C2 L160], but the output is persisted only at create, or on sign-in with `overrideUserInfoOnSignIn: true` [S4][C3 L224][C4 L461-478]. Only `input`-allowed fields are written [C4 L474-478, L527-531][S5] | Profile has `id`/`sub`, but output can't write `input: false` fields | Not for roles |
| `user.validateUserInfo` | Yes on every OAuth sign-in (`action: "sign-in"`) and can reject before the session is created [S4][C9 L35-70] | `source.oauth.providerId` and the raw profile; no account row | Use for deny rules only |

Notes:
- `account.update.after` also fires on token refresh (`getAccessToken` / `refreshToken` call `updateAccount`) [C20 L700-715, L905-920]. The handler must be idempotent. This is useful: it re-syncs roles on refresh.
- Database hook after-callbacks run after the transaction commits, or immediately when there is no transaction. Queueing: [C15 L207-230]. Without `transaction: true`, a hook can run even if a later step of the same request fails [S5].
- **Cookie-cache gotcha:** the session cookie is built from the `user` object returned by `handleOAuthUserInfo` [C3 L243-246], which is loaded **before** `account.update.after` writes the flags [C4 L272-279, L397-426]. If `session.cookieCache` is on, the first response can carry stale `canHost`/`isAdmin`. Read roles from the DB in authorization checks, or accept one refresh. **UNVERIFIED:** whether `cookieCache` is enabled by default in v1.7.12 (not checked).

### 3b. Recommended snippet

```ts
// lib/auth.ts (Nitro server code)
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "./db";
import * as schema from "./auth-schema"; // generated: `npx auth@latest generate --output ./lib/auth-schema.ts`

const ids = (raw?: string) =>
  new Set((raw ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const HOST_IDS = ids(process.env.HOST_PROVIDER_IDS);   // "discord:1234,twitch:5678"
const ADMIN_IDS = ids(process.env.ADMIN_PROVIDER_IDS);

// Recompute from ALL linked accounts so signing in with one provider
// cannot remove rights granted through another linked provider.
async function syncRoles(userId: string) {
  const rows = await db
    .select({ providerId: schema.auth_accounts.providerId, accountId: schema.auth_accounts.accountId })
    .from(schema.auth_accounts)
    .where(eq(schema.auth_accounts.userId, userId));
  const keys = rows.map((r) => `${r.providerId}:${r.accountId}`);
  const isAdmin = keys.some((k) => ADMIN_IDS.has(k));
  const canHost = isAdmin || keys.some((k) => HOST_IDS.has(k)); // product choice: admins can host
  await db.update(schema.users).set({ canHost, isAdmin }).where(eq(schema.users.id, userId));
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }), // see section 7
  user: {
    modelName: "users",
    additionalFields: {
      canHost: { type: "boolean", required: false, defaultValue: false, input: false },
      isAdmin: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  session: { modelName: "auth_sessions" },
  account: { modelName: "auth_accounts" },
  verification: { modelName: "auth_verifications" },
  advanced: { database: { generateId: "uuid" } },
  databaseHooks: {
    account: {
      create: { after: async (account) => { await syncRoles(account.userId); } },
      update: { after: async (account) => { await syncRoles(account.userId); } },
      delete: { after: async (account) => { await syncRoles(account.userId); } },
    },
  },
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      mapProfileToUser: (p) => ({ email: p.email ?? `${p.id}@discord.placeholder.invalid` }),
    },
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      mapProfileToUser: (p) => ({ email: p.email ?? `${p.sub}@twitch.placeholder.invalid` }),
    },
  },
});
```

Caveats for the snippet:
- The `schema` keys (`users`, `auth_accounts`, ...) must match the generated export names (section 4) [C13 L884-890][C12 L215-232].
- Hooks use `db` directly. They do not go through Better Auth's adapter, so they cannot recurse into account hooks.
- `delete.after` is in the type [C8 L1635-1650]; the snippet assumes `userId` is still on the deleted row (**UNVERIFIED** that it is passed to `delete.after`; the type says it receives the `Account` row).
- Discord `global_name`/`username` in `name`, Twitch `picture` in `image` come from core mapping [C1 L100-107][C2 L160-168].

---

## 4. Renaming tables and fields, `additionalFields`, CLI output

### 4a. `modelName` and `fields`

- `user: { modelName: "users", fields: { name: "full_name" } }` is documented; `session: { modelName: "user_sessions", fields: { userId: "user_id" } }` too. "Type inference in your code will still use the original field names" [S5].
- The Drizzle adapter docs describe two ways: either map schema keys (`user: schema.users`) or set `user.modelName` [S8].

### 4b. Key point: the adapter looks up tables by the custom model name

- The factory passes `model = getModelName(modelKey)` (the custom name) to the adapter's `create`/`update`/`findMany` [C13 L884-890, L930-945].
- The Drizzle adapter then does `getSchema(model)` → `schema[model]` [C12 L215-232, L793-794].
- So with `user.modelName: "users"`, the `schema` object key must be `users`. Without `modelName`, the key must be `user`.
- The doc example `schema: { ...schema, user: schema.users }` [S8] is for the case where you do **not** set `modelName`. Mixing the two breaks lookup. Pick one approach. The CLI generator uses the custom name as the export name (next).

### 4c. `usePlural`

- `usePlural` defaults to `false` [C12 L146, L1232]. The docs recommend it only when **all** tables are plural [S8].
- `getModelName` returns `${modelName}s` when `usePlural` is true and a custom `modelName` is set [C14 L20-34]. Read literally, `usePlural: true` plus `modelName: "users"` yields `"userss"`. **UNVERIFIED** by running the CLI; derived from `get-model-name.ts`. Avoid combining them.

### 4d. How `auth generate` writes the Drizzle schema (CLI)

From `packages/cli/src/generators/drizzle.ts` [C16]:
- Table **export variable** = `getModelName(tableKey)`, i.e. the custom name (`export const users = pgTable("users", ...)`) [C16 L114, L297-300].
- **SQL table name** = `convertToSnakeCase(modelName)` (unchanged unless `camelCase: true`) [C16 L297-300].
- **Column names** = snake_case of field name (unless `camelCase: true`) [C16 L129]. Drizzle **property keys** = the raw field name, e.g. `canHost: boolean("can_host")` [C16 L302-305].
- `camelCase` is a Drizzle adapter option [C12 L150-156] and is read by the CLI from the adapter options [C16 L129, L297-300].
- Foreign keys point to the custom export names (`.references(()=> users.id)`) [C16 L374-385].
- Command and flags: `npx auth@latest generate --output <file>` (`--output` default for Drizzle is `schema.ts` in project root; `--config` for the auth file) [S9]. Run `npx drizzle-kit generate` afterwards [S8].
- Schema validation: at init, Better Auth compares the schema with the tables it writes. Requests fail if it does not match. Disable with `advanced.database.validateSchema: false` [S5].

### 4e. `additionalFields`

- Declared under `user.additionalFields` with `type`, `required`, `defaultValue`, `input`, `returned` [S5].
- `input` defaults to `true`. Set `input: false` on server-owned fields [S5]. "Keep security-sensitive fields such as roles, bans, internal flags, and organization membership at `input: false`" [S4].
- `defaultValue` applies to new OAuth users, even with `input: false` [S5].
- The table in S5: `{ input: false, returned: true }` is readable and server-owned [S5]. Use `returned: true` if the client needs `canHost` / `isAdmin`.
- Core `user` already has `name` and `image` [S5]. Reuse them for display name and avatar; avoid `displayName` / `avatarUrl` duplicates unless you need values distinct from the provider's (`name` is overwritten on sign-in only if `overrideUserInfoOnSignIn` is true [S4]).

### 4f. Field renames

- Two ways: change the Drizzle property/column name, or set `user.fields` [S8]. With `fields`, the generator uses the mapped name as the Drizzle property key [C16 L302-305], so regenerate after renaming.

---

## 5. ID generation: Postgres uuid

- Option: `advanced.database.generateId: "uuid"` [C8 L454-459][S5].
- Behavior: with `"uuid"`, JS-side generation is skipped when the adapter supports UUIDs (`supportsUUIDs`); Drizzle sets it to `true` for `pg` [C11 L81-90][C12 L1234]. The database default is then used: CLI emits `uuid("id").default(sql\`pg_catalog.gen_random_uuid()\`).primaryKey()` [C16 L239-240] and `uuid('userId')` for foreign keys [C16 L143-145].
- Without the option, Better Auth generates base64url-style string IDs, not UUIDs [C11 L36-50, L110-125]. The docs say "By default... adapters that use PostgreSQL where we allow the database to generate the UUID automatically" [S5]; the code above shows the default is an app-generated string, so set `"uuid"` explicitly.
- Per-table alternative: a `generateId(options)` function that returns `false` for some models [S5].
- Do not use `generateId: "serial"` for this app. It disables Better Auth's ID generation for all tables and assumes numeric ids [S5].
- `uuid` columns are a schema change: regenerate and migrate (`drizzle-kit`) [S8].

---

## 6. Account linking (for later)

**Configuration** [S7][C8 L1212-1294]:
- `account.accountLinking.enabled` (default true).
- `disableImplicitLinking` (default false): no auto-link on sign-in; users link via `linkSocial` while signed in [S7][C8 L1219-1226].
- `trustedProviders: ["discord", "twitch"]`: links even if the provider does not confirm the email [S7][C4 L282-285]. Trusted providers still require the local user to be verified unless `requireLocalEmailVerified: false` (deprecated) [C4 L288-296][C8 L1236-1248].
- `allowDifferentEmails` (default false): allows linking an account with a different email, or without an email. "Enabling this might lead to account takeovers" [C8 L1287-1294][S7].
- `updateUserInfoOnLink`: copies profile name/image to the user on link; email and emailVerified never change [S7].

**How it works**

- Sign-in, existing user found by email (`findUserByEmail`) with no linked account [C4 L249-253]:
  - Rejected with `account not linked` unless `trustedProvider` or `userInfo.emailVerified`, **and** (`requireLocalEmailVerified` → local `emailVerified`), and implicit linking is not disabled [C4 L282-296].
  - When allowed, the account is linked and, if the provider's email is verified and the local user isn't, the local user becomes verified [C4 L365-374].
- Sign-in with no email: rejected at the callback with `email_not_found` [C3 L206-209], before any linking.
- Explicit linking (`linkSocial`, signed in): `linkOAuthAccount` requires `userInfo.email` to match the session user's email, unless `allowDifferentEmails` [C4 L105-112]. Existing account linked to another user → `ACCOUNT_ALREADY_LINKED_TO_DIFFERENT_USER` [C4 L117-122].
- Scopes can be added later with `linkSocial({ provider, scopes })` [S4][S7].

**Recommendation for Discord + Twitch:** keep implicit linking only if you accept email-based auto-merge. Otherwise set `disableImplicitLinking: true` and link from a signed-in settings page [S7]. Do not set `trustedProviders` for these two unless you accept the takeover warning [S7]. Note Twitch never returns an unverified email (it returns null) [P1], so Twitch emails are effectively verified when present.

---

## 7. Neon driver: transactions and runtimes

### 7a. Does Better Auth use interactive transactions?

- Adapter option `transaction` (Drizzle adapter), default **`false`** [C12 L157-167]. With `false`, Better Auth uses `createAsIsTransaction`, i.e. runs the callback without a DB transaction [C13 L860-873][C15 L136-160].
- With `transaction: true`, the adapter wraps work in `db.transaction(...)` [C12 L1256-1268].
- Where it matters: OAuth user creation runs user + account inserts in `runWithTransaction` [C4 L542-561]. Sign-up, update-user, and internal adapter also use it [C-grep: 12 call sites].
- The docs do not document the Drizzle `transaction` option [S8]; this is from source only.
- Without transactions, a failure between user and account insert can leave an orphan. Better Auth detects "orphaned" accounts and errors [C4 L205-214].

### 7b. Driver behavior

- **`neon-http`:** `transaction()` throws `No transactions support in neon-http driver` [P6 L248-254, L263-264]. Drizzle's own docs: HTTP is "faster for single, non-interactive transactions" [P8].
  - So `transaction: true` + `neon-http` = runtime error. With `transaction: false` it works but non-atomically.
- **`neon-serverless` (Pool / WebSocket):** `transaction()` on `NeonDatabase` checks out a pool client, runs `begin` / `commit` / `rollback`, and releases the client [P7 L260-280]. Drizzle's docs: WebSocket driver for "session or interactive transaction support" [P8].
  - Neon's README: sessions and transactions are not supported over HTTP; use `Pool`/`Client` over WebSockets [P9 L96-104]. "In Node.js v21 and earlier... supply a WebSocket constructor" [P9 L131] (Node 22+ has built-in WebSocket [P9 via Neon docs]).
  - Serverless lifecycle: "WebSocket connections can't outlive a single request... `Pool` or `Client` objects must be connected, used and closed within a single request handler" (Vercel Edge, Cloudflare Workers) [P9 L133-135].
  - Neon docs: "Use the driver over HTTP by default." and "Node.js 22 and later include a built-in WebSocket" [P9 via neon.com/docs/serverless/serverless-driver — summary by fetch].
  - Cloudflare: Neon README suggests Hyperdrive instead of this driver on Workers [P9 L137].
- **node-postgres (`pg`) via Hyperdrive:** Cloudflare's Drizzle page says "Use node-postgres with Drizzle ORM when connecting through Hyperdrive"; `postgres.js` is not supported with Drizzle over Hyperdrive; `nodejs_compat` is required; create the client per request [P10]. No transaction statement on that page [P10].
- **Drizzle `neon-serverless` import**: `drizzle()` builds `new Pool(...)` from a connection string or `PoolConfig` [P7 driver.ts L91-141]. I did not verify the full signature for passing an existing `Pool`. **UNVERIFIED** (read the `drizzle` overloads before coding).

### 7c. Recommendation: one driver for Vercel (Node) and Workers

- Use **`drizzle-orm/neon-serverless` + `@neondatabase/serverless`** [P7][P9]. It supports interactive transactions (so `transaction: true` works) and runs in Node 22+ and on Workers within a request.
- On Workers, construct the Pool inside the request, which means constructing `betterAuth` per request (a factory taking `env`). Neon's rule is "don't create them outside a request handler" [P9 L135].
- On Vercel Node functions, a module-level Pool is fine per Neon's rules for Node. **UNVERIFIED** how Nitro's Vercel preset handles it.
- Fallback for Workers if the WebSocket path misbehaves: Hyperdrive + `pg` [P10] (different config, same Drizzle schema).
- **UNVERIFIED end-to-end:** no spike was run on either runtime. Test `transaction: true` against Neon on Vercel preview and on `wrangler dev` before committing.

---

## 8. Other things that matter for this setup

### 8a. Cookies and `secure`

- Resolution order: explicit `advanced.useSecureCookies` wins; else dynamic `baseURL.protocol`; else `baseURL` starts with `https://`; else `NODE_ENV === "production"` [C10 L57-75].
- So a `https://` `BETTER_AUTH_URL` gives `Secure` cookies (`__Secure-` prefix) automatically [C10 L57-75]. `http://localhost:3000` gives non-secure cookies, which is what local dev needs [C10].
- Cookies are host-only by default; staging and prod are separate sessions unless `crossSubDomainCookies` is enabled [S10][S11]. Do not enable it for this app.

### 8b. `baseURL` and `trustedOrigins`

- `baseURL` is a string, or `{ allowedHosts, fallback }` for multi-domain [C8 L540-572][S11]. If unset, Better Auth reads `BETTER_AUTH_URL` (and `NEXT_PUBLIC_BETTER_AUTH_URL`, etc.) [C8 L548-552][C-create-context L157].
- Recommended: one static `BETTER_AUTH_URL` per deployment (localhost, staging, prod). Do not enable `trustedProxyHeaders` for this setup; it lets `X-Forwarded-Host` decide the base URL [S10 L194-220].
- `trustedOrigins` (static list or function) [C8 L1383-1413][S10]. The docs say the base URL is trusted by default [C8 L1386-1388]. Still list all three to be explicit:
  ```ts
  trustedOrigins: [
    "http://localhost:3000",
    "https://staging.compies.christried.me",
    "https://compies.christried.me",
  ],
  ```
  Requests with an `Origin` not in this list are rejected [S10 L45, L61].
- Provider redirect URIs must be registered exactly. Discord: "`redirect_uri` is whatever URL you registered when creating your application" [P3]. Twitch: the docs say to use `http://localhost:3000` as the redirect URI when registering [P1]; the exact-match rule is not stated. **Register all three callback URLs in each provider console:** `http://localhost:3000/api/auth/callback/{discord|twitch}`, `https://staging.compies.christried.me/api/auth/callback/{...}`, `https://compies.christried.me/api/auth/callback/{...}` [S2][S3].
- **UNVERIFIED:** whether Discord accepts `http://localhost` redirect URIs in production apps (not checked).

### 8c. Other surprises

- `BETTER_AUTH_SECRET` must be set. Missing or default secret is an error; short secrets log a warning [C-create-context L73-93].
- Schema validation at init means a mismatched DB schema makes requests fail (not just log) [S5]. Run `npx auth@latest generate` and `drizzle-kit` migrations before deploying renamed tables.
- Discord `prompt` defaults to `none` [C2 L104] (see 2a).
- Cloudflare Workers: `nodejs_compat` (or `nodejs_als`) for AsyncLocalStorage [S12][S13].
- `user.validateUserInfo` fails closed: if the callback throws, sign-in is rejected [C9 L48-62].
- Discord `verified` / Twitch `email_verified` drive `emailVerified`; a verified provider email can also flip the local user to verified during linking [C4 L365-374].
- Providers that return no email can still be signed in with the placeholder pattern; the placeholder user cannot receive mail [S4].

---

## Source index

**Better Auth docs (repo, tag v1.7.12; live URL pattern `https://better-auth.com/docs/<path>` without `.mdx`)**
- [S1] docs/content/docs/integrations/nuxt.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/integrations/nuxt.mdx — live https://better-auth.com/docs/integrations/nuxt
- [S2] docs/content/docs/authentication/discord.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/authentication/discord.mdx — live https://better-auth.com/docs/authentication/discord
- [S3] docs/content/docs/authentication/twitch.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/authentication/twitch.mdx — live https://better-auth.com/docs/authentication/twitch
- [S4] docs/content/docs/concepts/oauth.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/concepts/oauth.mdx — live https://better-auth.com/docs/concepts/oauth
- [S5] docs/content/docs/concepts/database.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/concepts/database.mdx — live https://better-auth.com/docs/concepts/database
- [S6] docs/content/docs/concepts/hooks.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/concepts/hooks.mdx — live https://better-auth.com/docs/concepts/hooks
- [S7] docs/content/docs/concepts/users-accounts.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/concepts/users-accounts.mdx — live https://better-auth.com/docs/concepts/users-accounts
- [S8] docs/content/docs/adapters/drizzle.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/adapters/drizzle.mdx — live https://better-auth.com/docs/adapters/drizzle
- [S9] docs/content/docs/concepts/cli.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/concepts/cli.mdx — live https://better-auth.com/docs/concepts/cli
- [S10] docs/content/docs/reference/security.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/reference/security.mdx — live https://better-auth.com/docs/reference/security
- [S11] docs/content/docs/guides/dynamic-base-url.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/guides/dynamic-base-url.mdx — live https://better-auth.com/docs/guides/dynamic-base-url
- [S12] docs/content/docs/installation.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/installation.mdx
- [S13] docs/content/docs/reference/faq.mdx — https://github.com/better-auth/better-auth/blob/v1.7.12/docs/content/docs/reference/faq.mdx

**Better Auth source (repo, tag v1.7.12; base `https://github.com/better-auth/better-auth/blob/v1.7.12/`)**
- [C1] packages/core/src/social-providers/twitch.ts — L13-34 profile, L45 accountSubject, L46-51 scopes, L59-64 claims, L89-109 getUserInfo.
- [C2] packages/core/src/social-providers/discord.ts — L8-78 profile, L91 accountSubject, L92-111 scopes/prompt, L134-171 getUserInfo.
- [C3] packages/better-auth/src/api/routes/callback.ts — L168-179 token exchange, L192-204 link branch, L206-209 email check, L210-229 handleOAuthUserInfo call, L243-246 setSessionCookie.
- [C4] packages/better-auth/src/oauth2/link-account.ts — L105-112 link email check, L158-160 TODO #9124, L191-214 account owner / orphaned, L249-253 email lookup, L272-306 linking gate, L317-327 linkAccount, L365-374 verified promotion, L382-431 sign-in branch (freshTokens L397-412, updateAccount L423-426), L461-478 overrideUserInfo, L510-589 create branch (L527-531 additional fields, L542-561 runWithTransaction), L598-630 email verification gate, L632-638 createSession.
- [C5] packages/better-auth/src/oauth2/account-key.ts — L21-41.
- [C6] packages/better-auth/src/api/dispatch.ts — L225-265 runAfterHooks, L395-440 endpoint + after hooks.
- [C7] packages/better-auth/src/db/with-hooks.ts — L156-175 update.after queued.
- [C8] packages/core/src/types/init-options.ts — L346-350 useSecureCookies, L444-459 generateId, L540-572 baseURL, L977-986 validateUserInfo, L1208 updateAccountOnSignIn, L1212-1294 accountLinking, L1383-1413 trustedOrigins, L1435 databaseHooks, L1510 session hooks, L1583-1650 account hooks (create, update, delete).
- [C9] packages/better-auth/src/utils/validate-user-info.ts — L35-70.
- [C10] packages/better-auth/src/cookies/index.ts — L45-90 secure resolution.
- [C11] packages/core/src/db/adapter/get-id-field.ts — L36-50 default vs uuid format, L76-130 generation rules.
- [C12] packages/drizzle-adapter/src/drizzle-adapter.ts — L138-170 config (usePlural, camelCase, transaction, default false), L215-232 getSchema, L793-794 create, L1232-1268 adapter options and transaction wiring.
- [C13] packages/core/src/db/adapter/factory.ts — L860-873 transaction fallback, L884-945 create calls adapter with `model` (custom name).
- [C14] packages/core/src/db/adapter/get-model-name.ts — L20-34.
- [C15] packages/core/src/context/transaction.ts — L111-200 runWithTransaction, L207-230 queueAfterTransactionHook.
- [C16] packages/cli/src/generators/drizzle.ts — L114 modelName, L129 snake_case columns, L130-152 reference types, L239-240 uuid PK default, L297-305 table export and property keys, L374-385 references.
- [C17] packages/better-auth/src/db/internal-adapter.ts — L318-333 createAccount, L1108-1123 linkAccount, L1265-1272 updateAccount.
- [C18] packages/core/src/oauth2/create-authorization-url.ts — L93-104 claims parameter.
- [C19] packages/better-auth/package.json — exports `./vue` (around L124).
- [C20] packages/better-auth/src/api/routes/account.ts — L700-715, L905-920 updateAccount in token refresh.
- oauth2 errors: packages/better-auth/src/oauth2/errors.ts L23 `EMAIL_NOT_FOUND: "email_not_found"`.
- create-context: packages/better-auth/src/context/create-context.ts L73-93 (secret warnings), L157 (baseURL warning).

**Provider docs**
- [P1] Twitch OIDC claims: https://dev.twitch.tv/docs/authentication/getting-tokens-oidc/ (fetched 2026-10-22; quotes from fetch summary, check wording against page).
- [P2] Twitch scopes: https://dev.twitch.tv/docs/authentication/scopes/ (fetched).
- [P3] Discord OAuth2: https://docs.discord.com/developers/topics/oauth2 (redirected from discord.com; source `developers/topics/oauth2.mdx` in https://github.com/discord/discord-api-docs @ fd75e22, lines 53-58 scope table, L102 redirect_uri).
- [P4] Discord User object: https://docs.discord.com/developers/resources/user (source `developers/resources/user.mdx` @ fd75e22 L38-49, L248).
- [P5] OpenID Connect Core 1.0 §3.1.3.7 step 6: https://openid.net/specs/openid-connect-core-1_0.html (fetched summary).

**ORM and database**
- [P6] drizzle-orm `neon-http` session: https://github.com/drizzle-team/drizzle-orm/blob/eab8bed/drizzle-orm/src/neon-http/session.ts L248-254, L263-264 (version 0.45.4 in package.json).
- [P7] drizzle-orm `neon-serverless`: https://github.com/drizzle-team/drizzle-orm/blob/eab8bed/drizzle-orm/src/neon-serverless/session.ts L260-280; driver.ts L91-141.
- [P8] Drizzle docs, Neon connection: https://orm.drizzle.team/docs/connect-neon (fetched summary).
- [P9] Neon serverless driver: https://github.com/neondatabase/serverless/blob/54d963f/README.md L96-137 (v1.2.0); Neon docs https://neon.com/docs/serverless/serverless-driver (fetched summary).
- [P10] Cloudflare Hyperdrive + Drizzle: https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/drizzle-orm/ (fetched summary).

---

## UNVERIFIED list (consolidated)

1. Twitch behavior when `user:read:email` is absent (error vs. omitted claim) [P1].
2. Whether `c.redirect()` thrown in the callback is an `APIError` instance, so `hooks.after` runs on callback redirects [C6 L404-420] (better-call is outside this repo).
3. `toWebRequest` auto-import in Nitro/Nuxt [S1].
4. Whether `account.delete.after` receives `userId` on the deleted row [C8 L1635-1650].
5. `usePlural: true` + explicit `modelName` yields `"userss"` (derived from source, not run through the CLI) [C14].
6. Default `session.cookieCache` state in v1.7.12 [C8 L1114-1145].
7. End-to-end behavior of `neon-serverless` + Better Auth on Vercel (Nitro preset) and Cloudflare Workers (no spike run).
8. Discord `http://localhost` redirect URIs in a production app.
9. Full `drizzle()` signature for passing an existing `Pool` [P7 driver.ts].
10. Twitch `aud` / `iss` / `exp` validation: not found in the Twitch `getUserInfo` path [C1 L89-109]; may be done elsewhere (not checked).
11. Neon and Drizzle statements are from fetched summaries; wording may differ from the live pages.
