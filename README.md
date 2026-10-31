# COMPIES

Game nights for groups of friends. The MVP covers date coordination only; see issue #1 for the spec, `GLOSSARY.md` for the terms and `docs/adr/` for the decisions.

Stack: Nuxt 4, Tailwind v4, Drizzle on Neon Postgres, Vitest. Details in `docs/research/`.

## Run locally

Requirements: Node 24 (`.nvmrc`) and pnpm (the version is pinned in `package.json`; `corepack enable` picks it up).

1. Install: `pnpm install`
2. Create your own Neon dev branch, so you never touch staging or production data. In the Neon console open the COMPIES project, go to **Branches → New branch**, branch from `main` and name it `dev-<your name>`. Copy its connection string.
3. Copy `.env.example` to `.env` and set the env vars:

   | Variable | What |
   |---|---|
   | `DATABASE_URL` | Connection string of your Neon dev branch |
   | `BETTER_AUTH_URL` | Origin the app runs on: `http://localhost:3000` locally |
   | `BETTER_AUTH_SECRET` | Random string, at least 32 characters (`openssl rand -base64 32`) |
   | `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord OAuth app; its redirect URIs include `<origin>/api/auth/callback/discord` |
   | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | Twitch OAuth app; its redirect URIs include `<origin>/api/auth/callback/twitch` |
   | `HOST_PROVIDER_IDS` | Who has the Host permission: `discord:<user id>,twitch:<user id>` (ADR 0002) |
   | `ADMIN_PROVIDER_IDS` | The Platform admin, same format; also gets the Host permission |
   | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Cloudflare account id and R2 API token (object read and write) for game images |
   | `R2_BUCKET` | Bucket of this environment: `compies-staging` or `compies-production` |
   | `R2_JURISDICTION` | Optional: `eu` when the buckets use the EU jurisdiction, else empty |
   | `REALTIME_URL` | The realtime Worker the Event page connects to: `http://localhost:8787` locally, the `*.workers.dev` URL of the staging or production Worker in Vercel (read at build time). Empty: no live connection, the page polls every 15 s |
   | `ROOM_TOKEN_SECRET` | Random string that signs the 60-second room token; the Worker holds the same value |
   | `ROOM_INTERNAL_SECRET` | Random string that signs the calls from the app to the Worker, and the deploy workflow's game-day check; the Worker holds the same value |
   | `ROOM_TOKEN_SECRET_PREVIOUS`, `ROOM_INTERNAL_SECRET_PREVIOUS` | Optional, only while a key rotates: the old value, accepted next to the new one (the app's deploy check and the Worker both read them) |

   The allowlists apply at each sign-in, so a change takes effect at that User's next sign-in.

   The R2 variables are set in Vercel, not in your `.env`, by `scripts/wizards/r2-setup.sh` (#139); on Windows, run it from Git Bash, since WSL's bash can't run the Windows Vercel CLI. Image upload needs them; tests use an in-memory store, so leave them empty locally.

4. Apply the migrations to your branch: `pnpm db:migrate`
5. Start the dev server: `pnpm dev`, then open http://localhost:3000. `GET /api/health` answers `{"status":"ok"}` when the database is reachable and migrated. To sign in without Discord or Twitch, open http://localhost:3000/api/dev/sign-in?as=host (or `member`, `admin`; `&to=/bibliothek` picks the page). The route exists only in the dev server.

## Realtime (the Worker in `realtime/`)

The Event page updates live through a Cloudflare Worker with one PartyServer room per Event (ADR 0012, ADR 0013). It is its own install with its own lockfile, so Vercel never installs wrangler. To try it locally:

1. `pnpm --dir realtime install --frozen-lockfile`
2. Copy `realtime/.dev.vars.example` to `realtime/.dev.vars` and give `ROOM_TOKEN_SECRET` and `ROOM_INTERNAL_SECRET` the same values as in your `.env`. Set `REALTIME_URL=http://localhost:8787` in `.env`.
3. `pnpm dev:realtime` (wrangler dev on port 8787) next to `pnpm dev`. Open an Event in two browsers: a Vote shows in the other at once.

### Deploying the Worker

`.github/workflows/realtime-deploy.yml` deploys it: a push to `staging` deploys `compies-rt-staging`, a push to `main` deploys `compies-rt`, each only when the push touches `realtime/` or a `shared/` file the Worker imports. A production deploy drops every open socket, so it first asks the app's deploy check (`GET /api/internal/deploy-check`, signed with the room's internal key) and fails on a day with a Session Date (Europe/Berlin) or while a Session runs (for 16 h after its start). To deploy anyway, or to deploy by hand, run the workflow from the Actions tab: `target` picks the Worker, `override` skips the check. Releases to `main` wait for a day without a Session (`docs/agents/release.md`).

One-off setup, once per Cloudflare account: run `scripts/wizards/realtime-setup.sh` (`--dry-run` walks it without access; on Windows use Git Bash). It deploys both Workers, gives each its two secrets, sets the Vercel variables and these GitHub Actions secrets:

| Secret | What |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token from the template „Edit Cloudflare Workers“, scoped to the account. Without it staging skips the deploy with a warning and production fails |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account that owns the Workers |
| `ROOM_INTERNAL_SECRET_PRODUCTION` | The production `ROOM_INTERNAL_SECRET` (the one Vercel's Production environment and the production Worker have); signs the game-day check |

Each Worker's own `ROOM_TOKEN_SECRET` and `ROOM_INTERNAL_SECRET` are Worker secrets (`wrangler secret put … --env staging|production`, from `realtime/`), and the same pair, with `REALTIME_URL`, is set in Vercel per environment.

Without the Worker the page polls every 15 s, as before. The Worker's checks: `pnpm --dir realtime typecheck` and `pnpm --dir realtime test` (workerd). To rotate a secret, set the new value in Vercel and as the Worker's secret, and the old one as the Worker's `ROOM_TOKEN_SECRET_PREVIOUS` or `ROOM_INTERNAL_SECRET_PREVIOUS` until open tokens and calls have expired.

## Database changes

Edit `server/db/schema.ts`, then run `pnpm db:generate` and commit the generated SQL in `drizzle/`. Apply it with `pnpm db:migrate`. Never use `drizzle-kit push` against a shared branch.

## Checks

| Command | What |
|---|---|
| `pnpm typecheck` | `nuxt typecheck` (vue-tsc) over app, server, tests and configs |
| `pnpm lint` | ESLint (`@nuxt/eslint`, stylistic rules) |
| `pnpm test` | All Vitest projects; `pnpm vitest --project unit` (or `integration`, `nuxt`) runs one |

The test projects:

- `unit` (`test/unit/`): pure domain rules from `server/domain/`.
- `integration` (`test/integration/`): server handlers called over HTTP against an in-memory PGlite with the committed migrations applied, via `test/integration/harness.ts`. No Neon needed. Server code imports `h3` and its own modules explicitly instead of relying on Nitro auto-imports, so these tests can load it.
- `nuxt` (`test/nuxt/`): pages and components in a Nuxt runtime.

CI runs all three checks on pull requests into and pushes to `staging` and `main`, and the Worker's typecheck and tests (`realtime/`) after them.

## Deploy

Only `staging` and `main` build on Vercel (`vercel.json`); feature branches don't deploy (ADR 0007).

| Branch | URL | Database |
|---|---|---|
| `staging` | https://staging.compies.christried.me (behind Vercel login) | Neon `staging` branch |
| `main` | https://compies.christried.me | Neon `main` branch |

Flow: feature branch cut from `staging` → PR into `staging` → check on staging → release PR `staging` → `main`. Both branches are protected: changes land only through a PR with green CI, and force pushes are blocked.

The Vercel build command is `pnpm db:migrate && pnpm build`, so each deploy first applies the committed migrations to that environment's `DATABASE_URL`. drizzle-kit runs all pending migrations in one transaction. If one fails, nothing is applied, the build fails, and the previous deployment keeps serving. Fix forward with a new migration; never edit a migration that has already run on staging.

ESLint rejects `@vercel/*` imports, because the app must not depend on Vercel-only runtime APIs (ADR 0005).
