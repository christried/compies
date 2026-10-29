# Realtime hosting for COMPIES: Nuxt on Vercel + PartyServer Worker vs. Nuxt on Cloudflare Workers

Research date: 2026-10-28.
Versions checked: **partyserver 0.5.10** and **partysocket 1.3.0** (npm `latest`; source read from `cloudflare/partykit` `main`); **wrangler 4.154.0** / **workerd 1.20261023.1** (npm `latest`, used for a local spike); **nuxt 4.6.2 with nitropack 2.13.5** (the versions installed in this repo; npm `latest` is nuxt 4.6.3, nitropack 2.13.5, `nitro` 3.0.260903-beta); `@neondatabase/serverless` 1.2.0; better-auth 1.7.12; drizzle-orm 0.45.4.
Docs sources are **branch heads read on 2026-10-28, not pinned to a commit**: `cloudflare/cloudflare-docs` `production`, `nitrojs/nitro` `v2`, `neondatabase/website` `main`, `better-auth/better-auth` tag `v1.7.12`, `mdn/content` `main`, `cloudflare/partykit` `main`.

Citation keys are in the **Source index** at the bottom. Anything I could not confirm from a primary source is marked **UNVERIFIED** and collected in the last section.

**Method caveats (read these first)**
- `developers.cloudflare.com`, `nuxt.com`, `nitro.build`, `vercel.com`, `developer.mozilla.org`, `developers.google.com` and the RFC sites are **blocked** from this session's network. I read the *source repositories of those docs* on GitHub instead (same text, different host), plus the installed `nitropack` code in `node_modules`.
- Vercel's WebSocket documentation could only be reached through the Vercel MCP `search_vercel_documentation` tool, which says its results come from a **third-party index (Context7)**. Treat the Vercel claims in section 1g as secondary until checked on vercel.com.
- The YouTube IFrame API docs and RFC 5905 (NTP) were unreachable. Statements about them are from general knowledge and marked UNVERIFIED.
- I ran one **spike** (section 2a): built this repo with the Nitro `cloudflare_module` preset and booted the output in `workerd` through `wrangler dev`. No live Neon database, no OAuth round trip, no Durable Object.
- Terminology follows `GLOSSARY.md`: the room belongs to an **Event**; a **Session** is one sitting with a Date (ADR 0011). ADR 0001 still says "one room per Session"; it predates the rename. The brief and this task say one room per Event, and I use that.

---

## TL;DR and recommendation

1. **Both options need a separate PartyServer Worker.** Nitro's built-in Cloudflare Durable Object support is a single object named `server` for all websockets, not one object per room, and Nitro exports no other Durable Object class [N3]. So "move Nuxt to Cloudflare" does not remove the second deploy; it only changes how the browser reaches it (same origin via a route or service binding, instead of a second hostname) [N3][W6][W12].
2. **Nuxt 4 on Workers works today for this repo, at the level I tested.** With `nitro.preset = 'cloudflare_module'` the app builds (2.11 MB total, 603 kB gzip, limit 64 MiB uncompressed [W1]) and boots in workerd: SSR redirect, Better Auth construction, API routes, and the Neon `Pool` attempting its WebSocket all ran. **Not tested:** a live Neon query, OAuth, PWA, a real Cloudflare deploy (section 2a).
3. **One real code change is needed on Workers:** `server/plugins/db.ts` ends the Pool in the `afterResponse` hook. On Workers, work after the response may be cancelled unless it goes through `waitUntil` [W1][NEON-README]. Nitro exposes `event.context.waitUntil` on Cloudflare [N3].
4. **Custom domains need a Cloudflare zone.** A Worker Custom Domain and an R2 public-bucket custom domain both require an active zone on the account; a partial (CNAME) setup is Business/Enterprise only [W5][R2-PUB][W13]. If `christried.me` stays on its current DNS, Option B can only serve from `*.workers.dev`, which breaks the `compies.christried.me` / `staging.compies.christried.me` plan in ADR 0007. Option A is unaffected, because the Worker only needs a URL and the room token works cross-site.
5. **Auth for the room: a short-lived signed room token minted by Nuxt, not a shared cookie.** The browser cannot set headers on a WebSocket, so the token goes in the query string; `partysocket` accepts an async `query` function, so every reconnect can mint a fresh token [PS4 L23,L117-119]. Sharing the Better Auth cookie needs `crossSubDomainCookies` on a shared parent domain and a Postgres session lookup from the Worker [BA-COOKIES]; with the ADR 0007 hostnames (`staging.compies.christried.me` is a subdomain of `compies.christried.me`) a cookie scoped to prod would also be sent to staging (my inference).
6. **A game night fits the free tiers.** My arithmetic from the published rates [D5]: 10 clients, 4 h, one message every 10 s each = 14,400 messages, billed as 720 requests (20:1 ratio); even if the room never hibernates, 4 h x 3,600 s x 0.128 GB = 1,843 GB-s against 13,000 GB-s/day free. Option B probably needs Workers Paid ($5/month minimum) because the Free plan allows 10 ms CPU per request and SSR + auth typically use 10-20 ms [W1][W2].
7. **Timers and hibernation:** any `setTimeout`/`setInterval` blocks hibernation and bills duration [D3]; use Durable Object alarms (one alarm slot per object, at-least-once, retried 6 times with backoff) and persist all room state in storage, because in-memory state is reset on hibernation and WebSockets are terminated on code deploys [D2][D3]. Do not deploy the Worker during a game night.
8. **Clock sync:** NTP-style ping/pong over the room socket, keep the lowest-RTT sample, use `performance.now()` locally (monotonic, but it does not tick during OS sleep outside Windows, so resync on `visibilitychange`/`online`) [MDN-NOW]. `setWebSocketAutoResponse` only returns a fixed string, so it cannot carry server time [D6]. A simultaneous reveal needs no clock sync if the server's broadcast triggers it (my reasoning).
9. **R2:** presigned PUT/GET URLs work from either host but must be signed with an S3 client (`aws4fetch` is fetch-based); the Worker binding cannot presign [R2-PRE]. Presigned URLs do not work on custom domains [R2-PRE]. On Workers, the R2 binding (`env.BUCKET.put`) avoids S3 keys entirely [R2-WK][N1].
10. **My recommendation (mine, not a finding): Option A for T6.** Stay on Vercel, add one PartyServer Worker with room tokens, keep Postgres writes in Nuxt (the room calls a signed internal endpoint), deploy staging and production Workers separately. Reasons: smallest blast radius while the date poll is live, no DNS move, free-tier cost, and the spike shows the Cloudflare move stays available (ADR 0005's promise holds). Revisit Option B if you move DNS to Cloudflare anyway or want R2 bindings and Hyperdrive.

---

## 0. What the repo does today (facts from the checkout)

- `nuxt.config.ts`: Nuxt 4.6.2, compatibility date `2026-10-22`, modules `@nuxt/eslint`, `@nuxtjs/i18n`, `@nuxt/fonts`, `@vite-pwa/nuxt`. No `nitro.preset` set; Vercel is auto-detected.
- `vercel.json`: `buildCommand: "pnpm db:migrate && pnpm build"`; only `main` and `staging` deploy (ADR 0007).
- `server/utils/db.ts`: `new Pool({ connectionString: process.env.DATABASE_URL })` per request, `drizzle-orm/neon-serverless`. `server/plugins/db.ts`: `await pool.end()` in Nitro's `afterResponse` and `error` hooks.
- `server/utils/auth.ts`: Better Auth built per request on that DB, `transaction: true`, `process.env` read inside `createAuth` (not at module scope).
- Node-only API scan of `server/` and `shared/` (grep for `node:`, `fs`, `Buffer`, `crypto`, `require(`, timers): the only hit is the global `crypto.getRandomValues` in `server/domain/slug.ts`, which workerd provides. No `node:*` imports.
- No Vercel-only runtime imports (ADR 0005 held): no `@vercel/*` in `package.json`.

---

## 1. Option A: Nuxt stays on Vercel, separate PartyServer Worker

### 1a. Shape

```
Browser --HTTPS--> Vercel (Nuxt/Nitro)      POST /api/e/:slug/room-token  -> signed token
Browser --WSS----> Cloudflare Worker        /parties/room/<eventId>?token=...
                     routePartykitRequest -> onBeforeConnect (verify token)
                       -> Durable Object `Room extends Server` (one per Event, idFromName(eventId))
Room --signed HTTPS--> Vercel  POST /api/internal/...   (persist results)   [or Neon directly, 1c]
```

- `routePartykitRequest(request, env, { onBeforeConnect })` matches `/parties/:server/:name`, calls `onBeforeConnect(req, lobby)` for WebSocket upgrades, and forwards to `env[Binding].idFromName(name)` [PS1][PS2 L529-583]. `onBeforeConnect` may return a `Response` (reject) or a modified `Request` (forward with extra headers) [PS1][PS2 L548-557].
- Room identity: `this.name` comes from `ctx.id.name`, populated when addressed via `idFromName()`/`getByName()` [PS1]. Use the Event id as the room name.
- Hibernation is opt-in: `static options = { hibernate: true }` [PS1][PS2 L589-614]. Default is `hibernate: false`, which uses the standard WebSocket API and bills duration for the whole connection [D5 footnote 4][D1].
- Wrangler needs a binding and a `new_sqlite_classes` migration for the class [PS1][D1].

### 1b. Authenticating a User at the Worker

**Recommended: room token.**
1. Signed-in browser calls a Nuxt endpoint (reuses the existing Member check in `server/utils/event-access.ts`). Nuxt signs `{ sub: userId, evt: eventId, role, exp: now + 60 s, jti }` with HS256 (`jose`, or Web Crypto) using `ROOM_TOKEN_SECRET`.
2. Browser connects with `new PartySocket({ host, party, room: eventId, query: async () => ({ token: await mint() }) })`. `query` may be a function returning a promise, so each reconnect fetches a new token [PS4 L23, L117-119]; `PartySocket` reuses a `_pk` query param as the connection id [PS2 L700-703] (read from source; the client side of `_pk` I did not trace).
3. Worker `onBeforeConnect` verifies signature, expiry, and that `evt` equals the room name, checks the `Origin` header against an allowlist (browsers do not apply CORS to WebSocket handshakes; general web-platform knowledge, not looked up), and forwards identity as headers on a new `Request`. The Durable Object trusts those headers only because it is reachable solely through the Worker (no public route to the DO class).
4. Secret lives in Vercel env and as a `wrangler secret` per Worker. Support two keys for rotation.
5. Token is checked only at connect. Revocation (Host removes a Member) needs an authenticated HTTP call from Nuxt to the Worker (`onBeforeRequest`/`onRequest` [PS1]) that closes that user's sockets.

Why not tokens in headers: the browser WebSocket API cannot set `Authorization` (platform knowledge). Query string it is; keep the TTL short because URLs end up in logs.

**Alternative: Better Auth JWT plugin.** It exposes `/api/auth/token` and a JWKS endpoint; the Worker verifies with `jose`'s remote JWKS [BA-JWT]. It adds a `jwks` table and exposes more Better Auth surface; `server/api/auth/[...all].ts` currently allowlists only four paths on purpose. A hand-rolled 60 s HMAC token is smaller and needs no table. (My judgement.)

**Alternative: share the session cookie.** Possible only if the Worker is on a hostname under the same parent domain: `advanced.crossSubDomainCookies = { enabled: true, domain: ... }` and `trustedOrigins` [BA-COOKIES]. Better Auth's own warning: use the most specific domain and be wary of untrusted subdomains [BA-COOKIES]. Costs: (a) the Worker must validate the session in Postgres on every connect, so it needs a DB driver and secret; (b) it needs a Cloudflare zone for a custom hostname [W5]; (c) on `*.workers.dev` the cookie is cross-site, which Safari treats as third-party [BA-COOKIES]; (d) staging/prod cookie overlap described in TL;DR 5 (my inference from ADR 0007 hostnames).

### 1c. How the room reads and writes Postgres

Two designs; the second is the one I would avoid.

1. **Room never touches Postgres (recommended).** The room holds live state in Durable Object SQLite storage and, at durable moments (game drawn, vetoes revealed, result entered), calls a signed internal Nuxt endpoint. Domain rules and the Drizzle schema stay in one codebase; the Worker holds no DB credentials. Cost: one HTTPS hop to a Vercel function (possible cold start) and a retry policy. (My design suggestion.)
2. **Room writes Neon directly.**
   - One-shot statements and non-interactive transactions: `neon()` over HTTP, or `drizzle-orm/neon-http` with `db.batch()`, which runs `client.transaction(queries)` [NEON-DRV][DRIZ-HTTP L117-131]. `neon-http` throws on `db.transaction()` [DRIZ-HTTP L151-158].
   - Interactive transactions or `pg` compatibility: `Pool`/`Client` over WebSockets, which on Workers must be connected, used and closed within one request handler [NEON-README L129-137][NEON-DRV]. A `webSocketMessage` handler is a handler, so open and close inside it.
   - Neon's own Cloudflare guide recommends **Hyperdrive with node-postgres** instead of the Neon serverless driver, with the direct (non-pooled) connection string and a dedicated role [NEON-CF]. Hyperdrive pools in transaction mode, so a transaction holds one connection and long transactions hurt scaling [HD-POOL]. Free plan: 100,000 queries/day, about 20 origin connections per configuration [HD-PRICE][HD-LIM].
   - Neon Free: compute suspends after 5 minutes idle and wakes in "a few hundred milliseconds"; cannot be disabled on Free [NEON-S2Z][NEON-PLANS]. The first write of a game night pays that once. Warm it when the room opens.

### 1d. CORS and cookies

- The WebSocket handshake needs no CORS headers; PartyServer's `cors` option applies to the HTTP routes it serves [PS2 L355-381, L496-505]. For the browser-callable token endpoint nothing changes (same-origin to Vercel).
- Cookies: none cross the boundary with the token design. The Better Auth cookie stays host-only on the Vercel origin.
- Browser calls from Nuxt to the Worker's HTTP routes (if any) need explicit CORS (`cors: { "Access-Control-Allow-Origin": "https://compies.christried.me", ... }`) [PS2 L362-376]. Prefer server-to-server for those.

### 1e. Deploy story (two deploys, staging)

- Worker URL: `*.workers.dev` works without any zone. A branded hostname (`rt.compies.christried.me`) needs the zone on Cloudflare [W5][W13].
- Staging mirrors ADR 0007: two Workers (for example `compies-rt-staging`, `compies-rt`), each with its own secrets and its own Durable Object namespace (state is not shared). Vercel staging points at the staging Worker URL through an env var.
- CI: GitHub Actions running `wrangler deploy` per branch, or Cloudflare Workers Builds, which has a configurable production branch and preview builds for other branches [W7]. Workers Builds limits: 3,000 build minutes/month on Free, 1 concurrent build [W8]. Per-version preview URLs change, so OAuth cannot use them; the staging Worker is a normal Worker with a fixed URL (same reasoning as ADR 0007).
- The Worker is its own deploy unit; it can ship without a Vercel release and vice versa. Protocol changes need both sides compatible (version the message envelope).
- Deploys terminate every WebSocket (see section 3). Freeze Worker deploys during a game night.

### 1f. Costs (Option A)

| Item | Free | Paid |
|---|---|---|
| Workers requests | 100,000/day; 10 ms CPU/request [W1] | $5/month minimum, 10 M requests + 30 M CPU-ms included [W2] |
| Durable Objects | SQLite-backed only; 100,000 requests/day, 13,000 GB-s/day, 5 GB storage [D5][D4] | 1 M requests + 400,000 GB-s/month included, then $0.15/M and $12.50/M GB-s [D5] |
| WebSocket billing | 20 incoming messages = 1 request; outgoing free; pings free [D5 footnote 2] | same |
| Hyperdrive (if used) | 100,000 queries/day [HD-PRICE] | unlimited [HD-PRICE] |
| Vercel | unchanged | unchanged |

DO duration is billed at 128 MB regardless of use [D5 footnote 5]. Game-night arithmetic is in TL;DR 6.

### 1g. Vercel's own WebSocket support (secondary source only)

Via the Vercel MCP documentation search (third-party index): Vercel Functions now document WebSockets, with `upgradeWebSocket()` from `@vercel/functions` >= 3.10.0 plus `ws`, a 256 KiB default `maxPayload`, and a note that connections close when the Function reaches its maximum duration, so clients must reconnect, resubscribe and reload state [VERCEL-WS]. The Nitro snippet shown (`features: { websocket: true }` from `'nitro'`) is **Nitro 3 syntax**; this repo is on Nitro 2.13.5 (Nuxt 4.6) where the flag is `experimental.websocket` [N2][N3]. I did not find, and did not verify, any cross-instance state sharing or room-pinning on Vercel. Without a single authoritative owner per Event, the wheel, vetoes and alarms have no home. This reasoning is mine; it is why I treat Vercel WebSockets as not a substitute for a Durable Object. **UNVERIFIED** against vercel.com.

---

## 2. Option B: Nuxt moves to Cloudflare Workers

### 2a. Does it run today? What I did and saw

Commands (in a throwaway state; `git status` clean afterwards, `.output` removed):
- `NITRO_PRESET=cloudflare_module nuxt build` with dummy `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`: **succeeded**, log says "Nuxt 4.6.2 (with Nitro 2.13.5, Vite 8.3.5 and Vue 3.5.44)", "Nitro preset: cloudflare-module", "Σ Total size: 2.11 MB (603 kB gzip)", biggest server chunk `nitro.mjs` 1.42 MB (388 kB gzip).
- `wrangler dev .output/server/index.mjs --assets .output/public --compatibility-date 2026-10-22` (wrangler 4.154.0, workerd 1.20261023.1), with dummy vars:
  - `GET /` returned 302 to `/anmelden` (SSR route guard ran).
  - `GET /api/me` returned `{"user":null}` (200).
  - `GET /api/auth/sign-in/social` returned 404 (GET is not allowed by the repo's allowlist, as designed).
  - `GET /api/health` returned 503, and the log shows `DrizzleQueryError` with `Network connection lost` on a `WebSocket`: the Neon `Pool` path executed inside workerd and failed only because no database was reachable.
  - Better Auth constructed inside workerd (its two "missing clientId" warnings came from the worker log).
- **Not tested:** a successful Neon query on Workers, transactions, an OAuth callback, the PWA service worker, i18n beyond the redirect, a real `wrangler deploy`, any Durable Object. The spike proves build, boot and driver start, not end-to-end behavior. This leaves ADR 0005's "unverified until T6" partly open.

### 2b. How Nitro exposes Durable Objects, websockets and bindings (installed `nitropack@2.13.5`)

- Presets: `cloudflare-module` (stdName `cloudflare_workers`, needs compat date >= 2024-09-19, uses Workers Static Assets), `cloudflare-durable`, `cloudflare-pages`; `cloudflare-dev` emulates bindings in `nuxt dev` from compat date 2025-07-15 [N3 preset.mjs][N1]. In this version the bare aliases `cloudflare` and `cloudflare-module` also exist as legacy presets [N3 preset-legacy.mjs]. Use the explicit stdName `cloudflare_module` as Nitro's docs show [N1].
- Bindings: `event.context.cloudflare.env.<BINDING>`, `.context`, `.request` [N1][N3 `_module-handler.mjs`]. Extra wrangler config goes under `nitro.cloudflare.wrangler` or your own `wrangler.json`; with `deployConfig: true` Nitro writes a generated `wrangler.json` [N1].
- Websockets: `nitro.experimental.websocket` sets `import.meta._websocket` [N3]; Nitro's `cloudflare-module` entry wires the crossws Cloudflare adapter, and `cloudflare-durable` wires `crossws/adapters/cloudflare-durable` [N3 runtime files].
- **The `cloudflare-durable` entry hardcodes one object:** `DURABLE_BINDING = "$DurableObject"`, `DURABLE_INSTANCE = "server"`, resolved with `binding.idFromName("server")`. It accepts websockets with `ctx.acceptWebSocket(server)` (hibernation API), stores peer state with `serializeAttachment`, and its `alarm()` only fires the `cloudflare:durable:alarm` hook [N3][N4 cloudflare-durable.mjs]. There is no per-room routing, and nothing in Nitro's entry exports another class [N3]. The crossws adapter does take a `resolveDurableStub` option [N4], but Nitro does not pass one.
- Consequence: a PartyServer `Room` class cannot live in the Nuxt Worker without a custom entry. The documented ways to combine are:
  - a second Worker that defines `Room`, bound from the Nuxt Worker by `durable_objects.bindings[].script_name` (external class) [W6], or called through a service binding (`env.REALTIME.fetch(request)`) [W12];
  - a Cloudflare route pattern sending `/parties/*` to the PartyServer Worker and everything else to Nuxt (routes are documented as a per-zone feature, up to 1,000 per zone [W1]; I did not read the routing page).
  Whether a WebSocket upgrade passes cleanly through a service binding is **UNVERIFIED** (not stated on the page I read [W12]).
- Nitro runtime hooks `cloudflare:scheduled`, `:queue`, `:email`, `:tail`, `:trace` exist on the Worker [N1]; none helps with room timing.
- Nitro 3 is beta (`3.0.260903-beta` on npm `latest`); Nuxt 4.6 uses Nitro 2 [NPM].

### 2c. Limits that matter

| Limit | Value | Source |
|---|---|---|
| Worker size (uncompressed) | 64 MiB; ours is 2.11 MB | [W1] + spike |
| Startup time | 1 second for global scope | [W1] |
| CPU time per request | Free 10 ms; Paid 30 s default, up to 5 min | [W1] |
| Typical SSR/auth CPU | "10-20 ms" per Cloudflare | [W1] |
| Memory | 128 MB per isolate | [W1] |
| Subrequests | Free 50, Paid 10,000 per request | [W1] |
| Simultaneous outgoing connections | 6 per request | [W1] |
| Env vars | 64 (Free) / 128 (Paid), 5 KB each | [W1] |
| Static assets | 25 MiB per file; 20,000 (Free) / 100,000 (Paid) files | [W1] |

- Free-plan 10 ms CPU is the main risk for SSR. I have not measured this app's CPU time on Workers (the spike does not report it). Budget for Workers Paid.
- Node compat: compatibility dates on or after `2026-08-04` enable `nodejs_compat` by default [W9]; the repo's date is `2026-10-22`. Nitro's own check uses the same cutoff (`NODEJS_COMPAT_DEFAULT_ON_DATE = "2026-08-04"`) [N3 utils.mjs]. `process.env` is populated from vars and secrets when `nodejs_compat` is on and the date is >= `2025-04-01` [W10]. Nitro's docs also say to read env only inside the request lifecycle [N1]; the repo does.
- Better Auth on Workers needs `nodejs_compat` (AsyncLocalStorage) [BA-FAQ]; it also warns about duplicate `better-auth`/`@better-auth/core` copies ("dual module hazard"), including on Workers and Nuxt [BA-FAQ].

### 2d. What in this repo would change

1. **`server/plugins/db.ts`:** replace `await pool.end()` in `afterResponse` with `event.context.waitUntil(pool.end())` on Cloudflare. Reason: tasks may be cancelled once the response completes unless passed to `waitUntil` [W1 "Duration"]; Neon's README says the same for Workers ("`ctx.waitUntil(pool.end())`") [NEON-README L209-239]. Nitro sets `context.waitUntil` in the Cloudflare fetch handler [N3 `_module-handler.mjs`].
2. **Driver:** `neon-serverless` Pool per request stays valid [NEON-README L133-137][NEON-DRV]. Neon's Cloudflare guide marks Hyperdrive + `pg` as the recommended path and says to use native drivers with Hyperdrive instead of the Neon serverless driver [NEON-CF]. Moving to Hyperdrive means `drizzle-orm/node-postgres`, a `hyperdrive` binding (`env.HYPERDRIVE.connectionString`), and keeping tests on PGlite as now. Not required for the move; a latency choice.
3. **`vercel.json` goes away;** its `buildCommand` (`pnpm db:migrate && pnpm build`) and branch filter move to Workers Builds settings or a GitHub Action [W7][W8]. `drizzle-kit migrate` runs in Node at build time, not in the Worker, so it is unaffected; the build environment needs `DATABASE_URL`.
4. **Preset selection:** set `nitro.preset: 'cloudflare_module'` explicitly (or per environment); Vercel is auto-detected today. A `wrangler.jsonc` with a name, compat date, `nodejs_compat` if the date is older, and later the bindings [N1][W6].
5. **`BETTER_AUTH_URL`, `trustedOrigins`, and the Discord/Twitch redirect URIs** change to the new hostnames (see 2e) [better-auth research note, TL;DR 10].
6. Nothing else in `server/` uses Node-only APIs (section 0 scan).

### 2e. Staging branch deploys and custom domain (ADR 0007)

- ADR 0007 needs fixed hostnames for OAuth. On Cloudflare, Workers Builds treats one branch as production and builds other branches as **previews** (`npx wrangler preview` by default) [W7]; preview URLs are per version, not fixed, so they cannot hold OAuth redirect URIs (same reason ADR 0007 rejected Vercel previews). **UNVERIFIED:** whether a stable per-branch alias exists (not on the pages I read).
- Workable shape (mine): two Workers from the same repo, `compies` (production branch `main`) and `compies-staging` (production branch `staging`), each with its own custom domain, secrets, Neon branch, and Durable Object namespaces. Workers Builds lets each connected Worker pick its production branch [W7].
- **Custom domain requires an active Cloudflare zone** and refuses hostnames with an existing CNAME [W5]. Today's hosts (`compies.christried.me`, `staging.compies.christried.me`) are subdomains of a domain whose DNS I do not control. Options: move `christried.me` DNS to Cloudflare (full setup), use a partial CNAME setup (Business or Enterprise only, not for Cloudflare Registrar domains) [W13], or use `*.workers.dev`. This is the biggest non-technical cost of Option B.
- Workers Builds is limited to 3,000 build minutes/month on Free and 1 concurrent build [W8]; the spike's build took about 70 s locally.

### 2f. Costs (Option B)

Workers Paid ($5/month) is the realistic floor for SSR (section 2c). Included: 10 M requests, 30 M CPU-ms, then $0.30/M requests and $0.02/M CPU-ms [W2]. Static asset requests are free [W2]. The room costs are as in 1f. A Vercel bill (unknown plan) would disappear. Hyperdrive is free of extra charge on Paid [HD-PRICE].

---

## 3. Clock sync and server-dictated timing with Durable Objects

### 3a. What the platform guarantees

- **One authoritative instance:** a Durable Object addressed by `idFromName(eventId)` is the single owner of that Event's room; Cloudflare states each object is globally unique and storage access from a stale instance is stopped [D3 "Shutdown behavior"].
- **Server time:** `Date.now()` inside Workers/DOs is frozen while code runs and advances only after I/O [W3][W4]. Stamp each dictated message once, at handler start. Do not measure durations inside the object with it.
- **Alarms:** one alarm per object (`setAlarm(epochMs)` replaces an existing one); at-least-once; retried with exponential backoff from 2 s, up to 6 retries, only for the most recent `setAlarm`; `alarm()` never runs concurrently with itself; 15 min wall-clock limit [D2][W1]. To run many deadlines, store the schedule in storage and make `alarm()` process what is due, then re-arm [D2 example]. Catch exceptions and re-arm, otherwise six failures end the chain [D2]. Billing: each `setAlarm()` is one row written; alarm invocations count as requests [D5]. **UNVERIFIED:** any latency guarantee for when an alarm fires after its time (the docs I read give none). Do not assume millisecond accuracy.
- **Hibernation** [D1][D3][D6]:
  - After 10 s of no events, with no `setTimeout`/`setInterval`, no pending I/O or `waitUntil`, no outbound connection, and only the hibernation API in use, the object is removed from memory; clients stay connected; in-memory state is lost; the constructor runs again on the next event.
  - Any pending timer keeps the object in memory, billed, for up to 15 minutes per operation [D3]. A 60 s `setTimeout` for the veto window would therefore also keep the room awake. Use an alarm.
  - A non-hibernateable idle object is evicted after 70-140 s [D3].
  - Per-socket attachment (`serializeAttachment`) survives hibernation, up to 16,384 bytes; it is lost when the socket closes [D1]. PartyServer's `connection.state` is documented as up to 2 KB [PS1].
  - Ping/pong control frames are answered by the runtime without waking the object [D1]. `setWebSocketAutoResponse(request, response)` answers a fixed string pair (each up to 2,048 chars) without waking it [D6]. It cannot include a timestamp, so clock-sync probes must be real messages (a billed wake-up each, cheap per [D5]).
  - Up to 32,768 hibernatable sockets per object [D6]. No concern at game-night size.
  - Deploys, runtime updates and placement moves terminate WebSockets; the new instance takes over [D3]. Runtime updates give existing connections up to 20 minutes to drain [W1]. Design reconnect as the normal path.

### 3b. Suggested protocol (my design, built on the facts above)

- **Clock sync.** On connect, the client sends 5-10 probes `{t0 = performance.now()}`; the server replies `{t0, ts = Date.now()}`; client records `t3 = performance.now()`. Per sample: `rtt = t3 - t0`, `offset = ts + rtt/2 - t3` (the standard NTP/Cristian estimate; RFC 5905 §8, **UNVERIFIED**, host blocked). Keep the sample with the smallest RTT. The error of one sample is bounded by half the path asymmetry, so at most `rtt/2`. For a 50 ms spread between any two clients, `rtt_min` should be below roughly 50 ms or the lead time must absorb it (see below).
- **Local clock.** Use `performance.now()`: monotonic and not changed by system clock adjustments; resolution 100 microseconds (5 microseconds if cross-origin isolated) [MDN-NOW]. It "may not tick" during OS sleep or browser freeze except on Windows (Chromium, Firefox and WebKit bugs linked from MDN), so **resync after `visibilitychange`, `online`, and every reconnect** [MDN-NOW][MDN-ORIGIN]. Piggyback `serverNow` on every dictated message so clients can detect drift for free.
- **Wheel.** The room draws the result (`crypto.getRandomValues`), then broadcasts `{ resultId, startAt, durationMs, serverNow }` with `startAt = serverNow + lead` (lead 1.5-2 s to absorb the offset error and one frame). The animation is a pure function of `(localNow + offset - startAt)`, so clients stop together to within offset error plus one frame (about 16 ms). A client that joins late gets the same record in its snapshot and renders mid-spin or the final state.
- **60 s veto countdown and simultaneous reveal.** Store `{ gameId, endsAt, vetoes }` in storage; `setAlarm(endsAt)`; `alarm()` marks the window closed, broadcasts the full reveal once (idempotent: guard on a stored `revealed` flag, because alarms are at-least-once [D2]). Other parties' vetoes (`brief §8: "Other parties only see who vetoed when the countdown ends"`) never leave the room before then; each client receives only its own team's veto. Simultaneity comes from one broadcast; spread is network jitter, not clock error. If you want the reveal animation timed rather than message-triggered, add `revealAt = endsAt + 300 ms` and use the offset.
- **Synced YouTube clip start.** Preload paused, then call play at `startAt`; I could not reach the YouTube IFrame docs, so API behavior (`cueVideoById`, `playVideo`, buffering and start latency, no guarantee of frame-accurate start) is **UNVERIFIED**. Expect spread above the 50 ms target for video; consider treating the clip as best-effort and syncing everything else.
- **Presence from the connection.** `onConnect`/`onClose` update the roster; key presence by user id, not connection id (several tabs). The docs I read do not say how quickly a dead TCP connection (phone leaves Wi-Fi) is noticed by a hibernated object, so add an app heartbeat answered by `setWebSocketAutoResponse` and sweep stale users in an alarm using `getWebSocketAutoResponseTimestamp(ws)` [D6]. **UNVERIFIED:** dead-peer detection latency.
- **Reconnect and late joiners.** `partysocket` reconnects by default with min delay 1-5 s (random), growth factor 1.3, max 10 s, `maxRetries` infinite, 5 s `minUptime` [PS3]. On each (re)connect the server sends one snapshot built from storage: phase, wheel record, countdown `endsAt`, own veto, roster.
- **Room lifetime.** An Event spans several Sessions (ADR 0011), possibly days apart; an idle Durable Object costs no duration [D5], so keep one room per Event with state in storage (10 GB per object [D4]) and archive on Event finish.
- **Placement and GDPR.** An object is created near the first `get()` and never moves; `locationHint` (for example `weur`) applies to the first call only and is best effort; `jurisdiction: "eu"` is enforced but the object id is still logged outside the jurisdiction [D7]. `nuxt.config.ts` self-hosts fonts for GDPR reasons, so decide whether `eu` is wanted.

---

## 4. R2 uploads from either host

| | Presigned URLs (S3 API) | Worker binding |
|---|---|---|
| Works from | Vercel and Workers (any runtime that can sign SigV4) | Workers only (`env.BUCKET`) |
| Credentials | R2 API token (Access Key ID/Secret) stored as env secrets | none; bucket binding in wrangler |
| Signing | S3 client; the binding cannot presign; in Workers use `aws4fetch` (fetch + SubtleCrypto) or the AWS SDK v3 with `nodejs_compat` | n/a |
| Expiry | 1 s to 7 days; reusable until expiry | n/a |
| Browser use | Needs bucket CORS (`AllowedOrigins`, `AllowedMethods`, `AllowedHeaders`) | goes through your own endpoint, no bucket CORS |
| Controls | Sign `Content-Type` to restrict the type; treat the URL as a bearer token | validate type/size in your handler before `put()` |
| Constraint | Does not work on custom domains; `POST` form uploads unsupported | request body limit follows the Cloudflare plan (100 MB on Free/Pro) |
| Sources | [R2-PRE][R2-CORS] | [R2-WK][W1] |

- Dev note: presigning from Vercel needs the Cloudflare account id and S3 keys in Vercel env, and `*.r2.cloudflarestorage.com` as the upload host [R2-PRE]. On Workers in `nuxt dev`, Nitro's `cloudflare-dev` preset emulates bindings (compat date >= 2025-07-15) [N1].
- Serving images: a public bucket is reachable only via an `r2.dev` URL (documented as not for production, throttled at hundreds of requests per second) or a **custom domain, which needs the domain as a zone in the same Cloudflare account** (partial CNAME setup allowed) [R2-PUB][R2-LIM][W13]. Alternatives are presigned GET URLs, or proxying `get()` through a Nuxt/Worker route. Cache and WAF features exist only on custom domains [R2-PUB].
- Not documented on the pages I read: a way to cap upload size inside a presigned PUT. **UNVERIFIED**; if size limits matter, upload through your endpoint, or validate and delete after the fact.
- Pricing: Standard storage $0.015/GB-month, Class A $4.50/M, Class B $0.36/M, egress free; free tier 10 GB-month, 1 M Class A, 10 M Class B per month [R2-PRICE]. Avatars from Discord/Twitch are provider CDN URLs mirrored by Better Auth (`image`), so R2 mainly holds game images and any custom avatars.

---

## 5. Comparison

| Criterion | A: Nuxt on Vercel + PartyServer Worker | B: Nuxt on Workers (+ PartyServer Worker) |
|---|---|---|
| Separate PartyServer Worker needed? | Yes [N3][PS1] | **Yes**, Nitro's DO preset is one object named `server` [N3] |
| Browser reaches rooms via | second origin (`workers.dev` or `rt.` host) | same origin via route/service binding (UNVERIFIED for WS) [W12] |
| User auth to room | room token minted by Nuxt (60 s, query param) [PS4] | same token; or cookie + `env.NUXT.fetch('/api/me')` check (my idea) |
| Cookies / CORS | none cross the boundary with tokens | none needed |
| Postgres access | room calls Nuxt, or Neon HTTP/`batch`, or Hyperdrive [NEON-DRV][NEON-CF] | same; Hyperdrive binding is natural [NEON-CF] |
| Nuxt runtime verified here | already in production | builds and boots in workerd; DB/OAuth untested (2a) |
| Repo changes | none to Nuxt | preset, `waitUntil(pool.end())`, build/deploy config (2d) |
| Custom domain | unchanged | needs Cloudflare zone for `christried.me` or `workers.dev` [W5][W13] |
| Staging (ADR 0007) | Vercel branch domain + a staging Worker | second Worker + domain; previews not fixed URLs [W7] |
| R2 | S3 presigned URLs [R2-PRE] | binding or presigned [R2-WK] |
| Cost floor | $0 extra (free tiers cover a game night) [D5][W1] | about $5/month (Workers Paid) [W1][W2] |
| Deploy units | Vercel + Worker | Worker(s) only; one vendor |
| Risk | two vendors, two consoles, token plumbing | SSR CPU unmeasured; DNS move; Nuxt-on-Workers less proven here |

---

## 6. Open trade-offs a human must decide

1. **DNS for `christried.me`.** Is moving it to Cloudflare acceptable? It unlocks Worker custom domains and an R2 public bucket on `assets.compies.christried.me`, and is a precondition for Option B on the planned hostnames [W5][R2-PUB][W13]. If not, Option B is off the table and R2 images go through presigned GET or an app proxy.
2. **Who writes Postgres: the room or Nuxt.** Nuxt-only keeps one schema and no DB secret in the Worker; direct writes remove a hop but need a driver choice (Neon HTTP + `batch`, or Hyperdrive + `pg`) [1c].
3. **Paid Cloudflare plan.** Free covers Option A. Option B probably needs $5/month for SSR CPU (measure first) [W1].
4. **Token vs cookie** for the room. I recommend tokens; cookies force a shared parent domain and DB lookups [1b].
5. **Deploy freeze on game nights.** Deploys drop every socket [D3]. Is a "no deploys on event day" rule acceptable? ADR 0007's release flow does not currently say so.
6. **Region/jurisdiction.** `jurisdiction: "eu"` (GDPR posture) vs lowest latency via hints [D7]; also where Neon lives.
7. **Video sync ambition.** The 50 ms target is realistic for wheel and countdown, unproven for the YouTube clip (UNVERIFIED). Decide whether the clip is best-effort.
8. **One room per Event, not per Session.** ADR 0001's wording ("per Session") should be updated to match ADR 0011 when T6 starts.
9. **Vercel WebSockets** (secondary source only) as a no-Cloudflare alternative: I dismissed it for lack of a room owner; confirm on vercel.com if someone wants to revisit [1g].

---

## UNVERIFIED list (consolidated)

1. Anything from `vercel.com` docs (section 1g): read through a third-party index, not the primary page.
2. Whether a WebSocket upgrade passes through a service binding [W12 silent].
3. Whether Cloudflare offers a stable per-branch preview alias usable for OAuth redirect URIs.
4. Alarm firing latency; dead-peer detection latency for hibernated sockets [D2, D1 silent].
5. YouTube IFrame behavior for synchronized starts; RFC 5905 formulas (hosts blocked).
6. This app's CPU time per SSR request on Workers (not measured; Free limit is 10 ms [W1]).
7. A successful Neon query, interactive transaction, Better Auth sign-in, PWA service worker and i18n on Workers (spike stopped at boot and driver start).
8. Whether the `partysocket` client sends `_pk` on reconnect (I only read the server side [PS2 L700-703]).
9. That presigned PUTs cannot cap object size (docs silent).
10. That DO hosts keep their wall clocks tightly synchronized across restarts (not documented in the pages read; mitigated by sending `serverNow` with each message).
11. Which `crossws` version Nitro 2.13.5 bundles at build time; I read `crossws@0.3.5` from the pnpm store (the lockfile's version for the Nitro 2 line).
12. Doc branch heads were not pinned to commit SHAs (hosts unreachable for `api.github.com` metadata).

---

## Source index

**PartyServer / PartySocket** (`cloudflare/partykit` `main`; `https://raw.githubusercontent.com/cloudflare/partykit/main/...`)
- [PS1] `packages/partyserver/README.md`: lifecycle hooks, `routePartykitRequest`, `onBeforeConnect`, hibernation, `onAlarm`, `connection.state` 2 KB, `ctx.id.name`.
- [PS2] `packages/partyserver/src/index.ts` (partyserver 0.5.10): L355-381 cors option, L496-505 CORS on HTTP, L529-583 routing and `onBeforeConnect`, L589-614 `static options.hibernate`, L700-703 `_pk`, L1253-1261 `onAlarm`/`alarm`.
- [PS3] `packages/partysocket/README.md`: reconnect defaults (min 1000+random 4000 ms, max 10000, factor 1.3, `minUptime` 5000, `maxRetries` Infinity), async URL provider.
- [PS4] `packages/partysocket/src/index.ts` (partysocket 1.3.0): L23, L36 `query?: Params | (() => Params | Promise<Params>)`, L117-119.
- [NPM] `https://registry.npmjs.org/<pkg>/latest` for partyserver, partysocket, nitropack, nitro, nuxt, wrangler, `@neondatabase/serverless`, crossws (fetched 2026-10-28).

**Cloudflare docs** (`cloudflare/cloudflare-docs` `production`, `src/content/docs/...`; live at `https://developers.cloudflare.com/...` without `.mdx`)
- [D1] `durable-objects/best-practices/websockets.mdx`: hibernation, ping/pong, attachments 16,384 bytes, timers prevent hibernation.
- [D2] `durable-objects/api/alarms.mdx`: single alarm, at-least-once, 2 s backoff x 6, scheduling many events.
- [D3] `durable-objects/concepts/durable-object-lifecycle.mdx` hibernation conditions, 10 s, 70-140 s, 15 min pending I/O, shutdown behavior.
- [D4] `durable-objects/platform/limits.mdx`: 10 GB/object, 32 MiB message, 30 s CPU, class limits.
- [D5] `durable-objects/platform/pricing.mdx` plus partials `src/content/partials/durable-objects/durable-objects-pricing.mdx`, `do-faq-pricing.mdx`, `do-plans-note.mdx`: rates, 20:1 WebSocket ratio, footnotes 2-5, Free allowances.
- [D6] `durable-objects/api/state.mdx`: `acceptWebSocket`, `getWebSockets`, `setWebSocketAutoResponse`, `getWebSocketAutoResponseTimestamp`, 32,768 sockets.
- [D7] `durable-objects/reference/data-location.mdx`: jurisdictions, location hints.
- [W1] `workers/platform/limits.mdx`: CPU 10 ms/5 min, 64 MiB, startup 1 s, memory, subrequests, duration, waitUntil, routes per zone.
- [W2] `workers/platform/pricing.mdx`: Free and Standard rates.
- [W3] `workers/runtime-apis/performance.mdx`: timers advance only after I/O.
- [W4] `workers/reference/security-model.mdx`: `Date.now()` locked while code executes.
- [W5] `workers/configuration/routing/custom-domains.mdx`: needs an active zone; no existing CNAME.
- [W6] `workers/wrangler/configuration.mdx` (Durable Objects section ~L598-620): `script_name`, `class_name`.
- [W7] `workers/ci-cd/builds/build-branches.mdx`: production branch, preview builds, `wrangler preview`.
- [W8] `workers/ci-cd/builds/limits-and-pricing.mdx`.
- [W9] `workers/runtime-apis/nodejs/index.mdx` (L23-40): `nodejs_compat` default from 2026-08-04.
- [W10] `src/content/compatibility-flags/nodejs-compat-populate-process-env.md`.
- [W11] `workers/framework-guides/web-apps/more-web-frameworks/nuxt.mdx`.
- [W12] `workers/runtime-apis/bindings/service-bindings/index.mdx`.
- [W13] `dns/zone-setups/partial-setup/index.mdx` (L17): partial setup is Business/Enterprise.
- [HD-PRICE] `hyperdrive/platform/pricing.mdx` + partial `workers/hyperdrive_pricing.mdx`; [HD-LIM] `hyperdrive/platform/limits.mdx`; [HD-POOL] `hyperdrive/concepts/connection-pooling.mdx` + partial `hyperdrive/pooling-mode.mdx`.
- [R2-PRE] `r2/api/s3/presigned-urls.mdx`; [R2-CORS] `r2/buckets/cors.mdx`; [R2-PUB] `r2/buckets/public-buckets.mdx`; [R2-LIM] `r2/platform/limits.mdx`; [R2-PRICE] `r2/pricing.mdx`; [R2-WK] `r2/api/workers/workers-api-usage.mdx`.

**Nitro / Nuxt**
- [N1] Nitro v2 docs `docs/2.deploy/20.providers/cloudflare.md` (`nitrojs/nitro` branch `v2`): presets, `deployConfig`, `nodeCompat`, `context.cloudflare.env`, dev emulation, env var rules.
- [N2] `docs/3.config/0.index.md` (v2): `experimental`, `cloudflare` option.
- [N3] Installed `nitropack@2.13.5` (`node_modules/.pnpm/nitropack@2.13.5_.../node_modules/nitropack/dist/presets/cloudflare/`): `preset.mjs`, `preset-legacy.mjs`, `utils.mjs` (`NODEJS_COMPAT_DEFAULT_ON_DATE`, `writeWranglerConfig`), `runtime/cloudflare-module.mjs`, `runtime/cloudflare-durable.mjs`, `runtime/_module-handler.mjs`; `dist/types/index.d.ts` L205 `_websocket`.
- [N4] Installed `crossws@0.3.5` `dist/adapters/cloudflare-durable.mjs`.
- Nuxt's Cloudflare deploy page: `nuxt/nuxt.com` `content/deploy/cloudflare.md` (points to Nitro docs; no extra facts used).

**Neon / Drizzle / Better Auth**
- [NEON-README] `neondatabase/serverless` `main` `README.md` L96-137 (Pool/Client lifetime), L209-239 (`waitUntil`).
- [NEON-DRV] `neondatabase/website` `content/docs/serverless/serverless-driver.md`; [NEON-CF] `content/docs/guides/cloudflare-workers.md` (updated 2026-10-09); [NEON-S2Z] `content/docs/introduction/scale-to-zero.md`; [NEON-PLANS] `content/docs/introduction/plans.md`.
- [DRIZ-HTTP] installed `drizzle-orm@0.45.4` `neon-http/session.js` L117-131 (`batch`), L151-158 (no transactions).
- [BA-COOKIES] `better-auth` tag `v1.7.12` `docs/content/docs/concepts/cookies.mdx` (cross-subdomain cookies, Safari note); [BA-JWT] `docs/content/docs/plugins/jwt.mdx`; [BA-FAQ] `docs/content/docs/reference/faq.mdx` (L138, L232 Workers notes).
- Earlier repo notes: `docs/research/better-auth-discord-twitch.md`; ADRs 0001, 0005, 0007, 0011; brief §8 and §19.

**Other**
- [MDN-NOW] `mdn/content` `files/en-us/web/api/performance/now/index.md` (resolution, monotonic, ticking during sleep); [MDN-ORIGIN] `.../performance/timeorigin/index.md` (L16, L37).
- [VERCEL-WS] Vercel MCP `search_vercel_documentation` (third-party Context7 index), pages `vercel.com/docs/functions/websockets` and `.../functions-api-reference/vercel-functions-package`. Secondary source.
- Spike artifacts: build log and wrangler dev log in the session scratchpad (not committed).
