# COMPIES

Game nights for groups of friends. Nuxt 4, Tailwind v4, Drizzle on Neon Postgres, Vitest.

- Terms: `GLOSSARY.md`. Decisions: `docs/adr/`. Code rules: `CODING_STANDARDS.md`. Setup: `README.md`.
- Path to production (ADR 0007): feature branch, PR into `staging`, Release PR into `main`.
  Both branches are protected: every change arrives through a PR and the CI check `check` must pass.
- Merging into `main` and anything that touches production data needs Chris's approval.
- Migrations run in the Vercel build: merging into `staging` migrates staging, merging into `main` migrates production.
