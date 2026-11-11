# Merge job

The brief of a merge job (`docs/agents/subagents.md` § Supervision, on its ticket's model): one reviewed ticket branch whose merge conflicts into the integration branch, checked. A clean branch the orchestrator merges itself. The orchestrator's spawn prompt names both branches and the ticket number. One merge job runs at a time.

- Work in your own worktree: the orchestrator spawned you with `isolation: "worktree"` (`docs/agents/subagents.md` § Model per subagent), in Git Bash on Windows. Never switch, check out, merge, reset or pull in the main checkout, and leave it alone (`docs/agents/delivery.md` § Several sessions in one checkout). The orchestrator removes your worktree by name after your report.
- The orchestrator has already reviewed the diff. Change code only to resolve merge conflicts.
- Leave running dev servers alone; the orchestrator may be using them.

## Steps

1. Take the integration branch from origin, detached:
   - `git fetch origin && git checkout --detach origin/<integration branch>`: git refuses a second checkout of a branch another worktree holds, and a local copy of the branch would go stale;
   - `git status --short` must be clean. If it isn't, stop and report.
2. Merge: `git merge --no-ff origin/<ticket branch> -m "Merge <ticket branch> (#<n>)" -m "<the attribution lines your own attribution reminder gives>"`. They name the model that merges, so yours are right where the orchestrator's would be wrong.
   - On a conflict, keep both sides:
     - `CHANGELOG.md`: both lines, under the right group headings, in the order Neu, Geändert, Behoben, Entfernt, Sicherheit;
     - `i18n/locales/de.json`: both key sets, as valid JSON (check with `node -e "require('./i18n/locales/de.json')"`);
     - `pnpm-lock.yaml`: take the ticket branch's version, run `pnpm install`, and commit the lockfile it gives.
   - Code the integration branch removed stays removed.
   - Any other conflict: `git merge --abort`, then stop and report.
3. Install and check. CI runs the full suite and the build on every push to the integration PR, so here:
   - `pnpm install --frozen-lockfile`;
   - `pnpm typecheck && pnpm lint && pnpm knip`;
   - `pnpm vitest run <every test file the ticket branch changed>` (list them with `git diff --name-only HEAD^1 HEAD -- test/`);
   - `pnpm test:build` when the merge changed a file under `test/build/` or `nuxt.config.ts`: the default run leaves `test/build/` out, and in 0.9 a merge passed with such a file unrun.
   - A failing test file: rerun it alone once. Passes → note it as flaky and go on. Fails again → report the failing output and stop without pushing; the worktree is discarded.
4. All green: `git push origin HEAD:<integration branch>`, a plain push. If it is rejected, the integration branch moved: do not force or retry; report it and stop.

## Report (once)

- the merge commit SHA;
- the checks: pass, flaky files, or failures with their output;
- the conflicts and how you resolved them;
- the push: pushed, or rejected.
