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

   The allowlists apply at each sign-in, so a change takes effect at that User's next sign-in.

   The R2 variables are set in Vercel, not in your `.env`, by `scripts/wizards/r2-setup.sh` (#139); on Windows, run it from Git Bash, since WSL's bash can't run the Windows Vercel CLI. Image upload needs them; tests use an in-memory store, so leave them empty locally.

4. Apply the migrations to your branch: `pnpm db:migrate`
5. Start the dev server: `pnpm dev`, then open http://localhost:3000. `GET /api/health` answers `{"status":"ok"}` when the database is reachable and migrated. To sign in without Discord or Twitch, open http://localhost:3000/api/dev/sign-in?as=host (or `member`, `admin`; `&to=/bibliothek` picks the page). The route exists only in the dev server.

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

CI runs all three checks on pull requests into and pushes to `staging` and `main`.

## Deploy

Only `staging` and `main` build on Vercel (`vercel.json`); feature branches don't deploy (ADR 0007).

| Branch | URL | Database |
|---|---|---|
| `staging` | https://staging.compies.christried.me (behind Vercel login) | Neon `staging` branch |
| `main` | https://compies.christried.me | Neon `main` branch |

Flow: feature branch cut from `staging` → PR into `staging` → check on staging → release PR `staging` → `main`. Both branches are protected: changes land only through a PR with green CI, and force pushes are blocked.

The Vercel build command is `pnpm db:migrate && pnpm build`, so each deploy first applies the committed migrations to that environment's `DATABASE_URL`. drizzle-kit runs all pending migrations in one transaction. If one fails, nothing is applied, the build fails, and the previous deployment keeps serving. Fix forward with a new migration; never edit a migration that has already run on staging.

ESLint rejects `@vercel/*` imports, because the app must not depend on Vercel-only runtime APIs (ADR 0005).
