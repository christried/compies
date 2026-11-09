# Implementer frame

The frame around every implementer's brief (`docs/agents/subagents.md` § Briefs). The orchestrator's spawn prompt names the ticket, the brief, the integration branch and your branch; read this file first, then the brief.

You build ONE ticket in your own git worktree. The orchestrator reviews your diff and merges it. You never merge into `staging`, `main` or the integration branch, and never open a PR.

## Before you start

1. Base your worktree on the integration branch (on `origin`):
   - `git fetch origin && git merge-base --is-ancestor origin/<integration branch> HEAD || git reset --hard origin/<integration branch>`;
   - then create your branch: `git checkout -b <your branch>`.
2. `pnpm install --frozen-lockfile` (runs `nuxt prepare`). If you add a dependency, use `pnpm add` and commit the lockfile.
3. Read, in this order:
   - your ticket, read as `docs/agents/issue-tracker.md` § Conventions says (from Git Bash the `gh api` form);
   - its parent spec the same way;
   - your brief;
   - `CODING_STANDARDS.md`, and `GLOSSARY.md` for the terms you touch;
   - the ADRs and the files your brief names.
4. Call the Skill tool with `tdd` and build the ticket test-first. The test seams the brief names count as confirmed by the user, so `tdd`'s „confirm with the user“ step is met by the brief; a seam the brief doesn't name goes into your report.

## Rules

- Terms follow `GLOSSARY.md`, and each concern has one home (`CODING_STANDARDS.md`).
- Match the surrounding code: comment density, naming, idiom. Comments say why and name the ticket, as the existing code does (`(#197)`).
- UI copy is German, in `i18n/locales/de.json`. Use the exact strings your brief gives.
- A schema change or a migration only when your brief asks for one.
- Tests check what a User or the API can observe (responses, stored rows, published messages, rendered text and roles), never internals. Prior art is named in each brief.
- Changelog: your brief gives the line whenever `release.md` asks for one; if your change is visible to Users and the brief has none, say so in your report. Plain German for Users, ending with the issue link `([#199](https://github.com/christried/compies/issues/199))`.
  - Working for an integration branch: the line goes in your report, not in `CHANGELOG.md`. The orchestrator adds it when it merges your branch (`docs/agents/release.md` § Changelog lines).
  - A branch whose PR goes straight into `staging`: add it under `## [Unreleased]` in `CHANGELOG.md`, in the group the brief names.
- Shell: this is Windows, and the Bash tool is Git Bash. Script with `node` from a file, never Python; inline `node -e` in bash mangles backticks.
- Scratch files (`red.log`, a throwaway script) go to your scratchpad directory, never into the checkout: `*.log` is gitignored, so git status hides them, and two stayed in the root after 0.10.
- Touch only what your brief allows. If the brief and the ticket disagree, or the code makes the brief wrong, do what the ticket needs and say so in the report.

## Commits

- Small commits on your branch, in Conventional Commits in English like the history (`fix(home): …`, `test(…)`, `refactor(…)`). The body says why.
- End every commit message with the Co-Authored-By line your own attribution reminder gives (the model you run as).

## Checks

- `pnpm typecheck && pnpm lint && pnpm knip`, and the test files you touched (`pnpm vitest run test/nuxt/x.test.ts`). They must pass before you push.
- The full `pnpm test` and `pnpm test:build` run in CI on every push of your branch, not on this machine: several agents share it, and running them in parallel stalled it in Release 1.4. Your report waits for that run (§ Before you report). In 0.7 a test file nobody had touched broke the integration branch four times, each found only after the merge.
- The orchestrator checks pages in the browser; you work without a dev server.

## Before you report

1. Push your branch: `git push -u origin <your branch>`.
2. Wait for CI on your pushed head: `node scripts/ci-wait.mjs`, in the foreground. One call waits at most 2.5 minutes; exit 2 means CI is still running (a run takes about 6 minutes), so call it again until it exits 0 or 1. It prints one line, then the failures if any. Red: fix, push, and wait again. Report a green head; a red one you can't fix goes into the report with its output.
3. Then `git fetch origin` and check containment: `git merge-base --is-ancestor origin/<integration branch> HEAD`. Contained → done. Not contained, because the integration branch moved during the CI run → `git merge origin/<integration branch>`, resolving conflicts by keeping both sides (changelog lines, i18n keys) and keeping every removal the integration branch made, then rerun the checks, push, and wait for CI again from step 2. Checking only after the CI run avoids the loop in session 2 of 0.10, where all three parallel implementers merged the tip before their CI wait, found it had moved, and needed another round (#363 three, #364 four).
4. The loop ends when the reported head contains the integration tip and is green, both on the same SHA.

## Report (once, short, this shape)

- Branch and head SHA, and CI on it: green, or the failing output.
- The red run: the first test you wrote, and its failing line before any production code existed. Twice in 0.7 an implementer wrote the code first, and once a bug the test would have caught got as far as the review.
- Acceptance criteria of the ticket: each one ✅ / ❌, with one line on how it is covered (test file and case name).
- Deviations from the brief or the ticket, and why.
- Checks: pass, or the failing output.
- The changelog line, when you work for an integration branch: its group and its text.
- Anything the orchestrator must decide or look at (e.g. a page to check in the browser).
