# Merge job

The brief of a merge job (`docs/agents/subagents.md`, model `haiku`): one reviewed ticket branch into the integration branch, checked. The orchestrator's spawn prompt names both branches and the ticket number. One merge job runs at a time.

- Work in the main checkout `C:\Users\gilge\Desktop\compies` (Git Bash, Windows).
- The orchestrator has already reviewed the diff. Change code only to resolve merge conflicts.
- Leave running dev servers alone; the orchestrator may be using them.

## Steps

1. Get onto the integration branch:
   - `cd /c/Users/gilge/Desktop/compies && git status --short` must be clean. If it isn't, stop and report.
   - `git fetch origin && git checkout <integration branch> && git merge --ff-only origin/<integration branch>`.
2. Merge: `git merge --no-ff origin/<ticket branch> -m "Merge <ticket branch> (#<n>)" -m "<the Co-Authored-By line your attribution reminder gives>"`.
   - On a conflict, keep both sides:
     - `CHANGELOG.md`: both lines, under the right group headings, in the order Neu, Geändert, Behoben, Entfernt, Sicherheit;
     - `i18n/locales/de.json`: both key sets, as valid JSON (check with `node -e "require('./i18n/locales/de.json')"`);
     - `pnpm-lock.yaml`: take the ticket branch's version, run `pnpm install`, and commit the lockfile it gives.
   - Code the integration branch removed stays removed.
   - Any other conflict: `git merge --abort`, then stop and report.
3. Install and check. CI runs the full suite and the build on every push to the integration PR, so here:
   - `pnpm install --frozen-lockfile`;
   - `pnpm typecheck && pnpm lint && pnpm knip`;
   - `pnpm vitest run <every test file the ticket branch changed>` (list them with `git diff --name-only HEAD^1 HEAD -- test/`).
   - A failing test file: rerun it alone once. Passes → note it as flaky and go on. Fails again → `git reset --hard origin/<integration branch>`, report the failing output, and stop without pushing.
4. All green: `git push origin <integration branch>`.

## Report (once)

- the merge commit SHA;
- the checks: pass, flaky files, or failures with their output;
- the conflicts and how you resolved them.
