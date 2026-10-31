# Implementer frame

The frame around every implementer's brief (`docs/agents/subagents.md` § Briefs). The orchestrator's spawn prompt names the ticket, the brief, the integration branch and your branch; read this file first, then the brief.

You build ONE ticket in your own git worktree. The orchestrator reviews your diff and merges it. You never merge into `staging`, `main` or the integration branch, and never open a PR.

## Before you start

1. Base your worktree on the integration branch (on `origin`):
   - `git fetch origin && git merge-base --is-ancestor origin/<integration branch> HEAD || git reset --hard origin/<integration branch>`;
   - then create your branch: `git checkout -b <your branch>`.
2. `pnpm install --frozen-lockfile` (runs `nuxt prepare`). If you add a dependency, use `pnpm add` and commit the lockfile.
3. Read, in this order:
   - your ticket: `gh api repos/christried/compies/issues/<n> --jq .body` (`gh issue view` prints nothing from Git Bash);
   - its parent spec the same way;
   - your brief;
   - `CODING_STANDARDS.md`, and `GLOSSARY.md` for the terms you touch;
   - the ADRs and the files your brief names.
4. Call the Skill tool with `tdd` and build the ticket test-first.

## Rules

- Terms follow `GLOSSARY.md`, and each concern has one home (`CODING_STANDARDS.md`).
- Match the surrounding code: comment density, naming, idiom. Comments say why and name the ticket, as the existing code does (`(#197)`).
- UI copy is German, in `i18n/locales/de.json`. Use the exact strings your brief gives.
- A schema change or a migration only when your brief asks for one.
- Tests check what a User or the API can observe (responses, stored rows, published messages, rendered text and roles), never internals. Prior art is named in each brief.
- Changelog: add a line only if your brief says so, under `## [Unreleased]` in `CHANGELOG.md`, in the group it names (`docs/agents/release.md`). Plain German for Users, ending with the issue link `([#199](https://github.com/christried/compies/issues/199))`.
- Shell: this is Windows, and the Bash tool is Git Bash. Script with `node` from a file, never Python; inline `node -e` in bash mangles backticks.
- Touch only what your brief allows. If the brief and the ticket disagree, or the code makes the brief wrong, do what the ticket needs and say so in the report.

## Commits

- Small commits on your branch, in Conventional Commits in English like the history (`fix(home): …`, `test(…)`, `refactor(…)`). The body says why.
- End every commit message with the Co-Authored-By line your own attribution reminder gives (the model you run as).

## Checks

- `pnpm typecheck && pnpm lint && pnpm knip`, and the test files you touched (`pnpm vitest run test/nuxt/x.test.ts`). They must pass before you report.
- The full `pnpm test` and `pnpm test:build` are CI's: several agents share this machine, and running them in parallel stalled it in Release 1.4.
- The orchestrator checks pages in the browser; you work without a dev server.

## Before you report

1. `git fetch origin && git merge origin/<integration branch>` into your branch, because the integration branch moves while you work. Resolve conflicts by keeping both sides (changelog lines, i18n keys), and keep every removal the integration branch made. Rerun the checks.
2. Push your branch: `git push -u origin <your branch>`.

## Report (once, short, this shape)

- Branch and head SHA.
- Acceptance criteria of the ticket: each one ✅ / ❌, with one line on how it is covered (test file and case name).
- Deviations from the brief or the ticket, and why.
- Checks: pass, or the failing output.
- Anything the orchestrator must decide or look at (e.g. a page to check in the browser).
