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

4. Apply the migrations to your branch: `pnpm db:migrate`
5. Start the dev server: `pnpm dev`, then open http://localhost:3000. `GET /api/health` answers `{"status":"ok"}` when the database is reachable and migrated.

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
