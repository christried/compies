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
  - Create every file with the Write tool: a script, a commit message's file, a scratch note. A heredoc that writes a file (`cat > x.mjs <<EOF`) is refused by the guard of `CLAUDE.md` § Scripting, 77 times in 53 subagents between 2026-11-11 and 2026-11-13 (#599).
  - Write a git call plainly: from your worktree's folder, with no shell variable (`$R`, `B=…`), no `cd` and no `git -C` in the call. The harness refuses a git call it cannot verify stays in your worktree: 184 refusals in 89 of 149 subagents in those three days, most of them a call with a variable or a `cd` in front (#599). When a call is refused, run its git command alone, as its own call: of 173 such calls none was refused. The exit code is in the tool's result, so no `; echo $?`.
- Scratch files (`red.log`, a throwaway script) go to a folder of your own, `<your scratchpad directory>/<your ticket's number>/`, never loose in the scratchpad and never into the checkout. Every agent of a session has the same scratchpad directory, and the orchestrator's folder in it is named after the spec: five implementers of 0.14 wrote their logs into it or beside it (#780). The checkout is out because `*.log` is gitignored, so git status hides them, and two stayed in the root after 0.10.
- Touch only what your brief allows. If the brief and the ticket disagree, or the code makes the brief wrong, do what the ticket needs and say so in the report.

## Commits

- Small commits on your branch, in Conventional Commits in English like the history (`fix(home): …`, `test(…)`, `refactor(…)`). The body says why.
- End every commit message with the Co-Authored-By line your own attribution reminder gives (the model you run as).

## Checks

- `pnpm typecheck && pnpm lint && pnpm knip`, and the test files you touched (`pnpm vitest run test/nuxt/x.test.ts`). They must pass before you push. A branch that touches `CHANGELOG.md` also runs `pnpm vitest run test/unit/changelog-file.test.ts` before the push: the Partyhut line (#380) failed that test in CI, one 6-minute round late.
- The full `pnpm test` and `pnpm test:build` run in CI on every push of your branch, not on this machine: several agents share it, and running them in parallel stalled it in Release 1.4. Your report waits for that run (§ Before you report). In 0.7 a test file nobody had touched broke the integration branch four times, each found only after the merge.
- The orchestrator checks pages in the browser; you work without a dev server, with one exception: the browser-check items your brief marks „measure on slot 2“. Its drafter read the code and could not run the page, and in 0.13.1 to 0.13.3 a typed pass condition was wrong at least eleven times, each a QUESTION row in a later check; the two times an implementer measured (#550, #585), the measurement found the brief's error before any check ran (#599). Measure the marked items once, after your checks pass:
  - `pnpm --dir realtime install --frozen-lockfile`, then `COMPIES_SLOT=2 node scripts/browser/serve.mjs start m<ticket>` with `run_in_background`, and wait for its `ready:` line naming :3100 and :8887. A taken port means another implementer is measuring: push, wait for CI and try again; after three refusals report the items as not measured.
  - Your scripts go in `scripts/browser/scratch/`, run with `COMPIES_SLOT=2`, and follow `docs/agents/browser-frame.md` § Checks: `results('m<ticket>')`, `open()`, a number for every verdict. Name every Event „R<release> m<ticket> …“. The dev database is the one the checks use: run no `pnpm db:migrate`, and change no dev User's Appearance.
  - End with `COMPIES_SLOT=2 node scripts/browser/serve.mjs stop m<ticket>`, and quote its last line in your report.
  - A FAIL is yours to fix. A pass condition the page cannot meet as written (a typed literal, a state that does not exist) is corrected in your report, with what you measured in its place.

## Before you report

1. Push your branch: `git push -u origin <your branch>`.
2. Wait for CI on your pushed head: `node scripts/ci-wait.mjs`, in the foreground. One call waits at most 2.5 minutes; exit 2 means CI is still running (a run takes about 6 minutes), so call it again until it exits 0 or 1. It prints one line, then the failures if any. Red: fix, push, and wait again. Report a green head; a red one you can't fix goes into the report with its output.
3. Then `git fetch origin` and test the merge: `git merge-tree --write-tree --name-only origin/<integration branch> HEAD`. Exit 0 → done: your head merges cleanly, also when the integration branch moved during your CI run. The orchestrator's merge builds the result, and CI runs on it. Exit 1 lists the conflicting paths → `git merge origin/<integration branch>`, resolving conflicts by keeping both sides (i18n keys) and keeping every removal the integration branch made, then rerun the checks, push, and wait for CI again from step 2. Until 0.14 a head had to contain the tip, so every other ticket's merge sent a waiting implementer round again (#610 six times, #607 five in 84 minutes; #780).
4. The loop ends when the reported head is green and merges cleanly into the integration tip you last fetched.

## Report (once, short, this shape)

- Branch and head SHA, CI on it (green, or the failing output), and the integration tip it merges cleanly into.
- The red run: the first test you wrote, and its failing line before any production code existed. Twice in 0.7 an implementer wrote the code first, and once a bug the test would have caught got as far as the review.
- Acceptance criteria of the ticket: each one ✅ / ❌, with one line on how it is covered (test file and case name).
- Deviations from the brief or the ticket, and why.
- Checks: pass, or the failing output.
- The changelog line, when you work for an integration branch: its group and its text.
- The browser-check items you measured on slot 2 (§ Checks): each with its number and PASS or FAIL, every pass condition you corrected, and the `stop`'s last line; or „not measured“ with the reason.
- Anything the orchestrator must decide or look at (e.g. a page to check in the browser).
