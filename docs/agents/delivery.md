# Delivery workflow

What agents do on their own in COMPIES, and what waits for the user. The path to production is ADR 0007: feature branch → PR into `staging` → check on staging → Release PR into `main`. Changelog lines, the version cut and the Release PR itself are in `docs/agents/release.md`.

## Branches and merges

- **Feature branches**: push freely. `staging` and `main` are protected (admins included): every change arrives through a PR, the CI check `check` must pass, no force pushes or deletions.
- **Into `staging`**: open the PR and merge it yourself once `check` is green, without asking: `gh pr merge <n> --merge --delete-branch`. Both protected branches require a PR to be up to date with its base (`strict` status checks, since the 0.10 retro: #371 and #372 were each green on their own head and broke `staging` together, #376). When another PR landed first, `gh api -X PUT repos/christried/compies/pulls/<n>/update-branch` and wait for the new run. `--delete-branch` fails to delete the local branch while an agent worktree still holds it; the remote branch is gone, and `worktree-clean.mjs` removes the local one.
- **Into `main`**: open the Release PR yourself; merging it needs the user's approval. In auto mode the classifier blocks `gh pr merge` into `main` even after the user's "go". Once `check` is green on the Release PR, hand the user `! gh pr merge <n> --merge` (in a cloud session: the PR link, to merge on GitHub), then pick up the tag, sync and smoke check once they've merged. The classifier also blocks deleting a tag on `origin`: hand the user `! git push origin --delete <tag>`.
- **Subagents** hand their work back; the orchestrating session does every merge into `staging` and `main`.

## Database migrations

Committed drizzle-kit migrations run in the Vercel build, so merging into `staging` migrates the staging database and merging into `main` migrates production. Run migrations on local/dev and staging databases yourself. A migration against production needs the user's approval, which a Release PR that carries one asks for explicitly.

**Production data.** An agent never holds a production credential: the production `DATABASE_URL` is a sensitive Vercel variable (write-only, for the owner too), and one that reaches a transcript gets rotated. A data fix on production is a script under `scripts/prod/` that reads `DATABASE_URL` from the environment, dry-runs by default, writes with `--apply`, prints what it touched and never the URL; the user runs it with `! DATABASE_URL=… node scripts/prod/<name>.mjs`. Soft delete is the app's deletion: an Event with `events.deleted_at` leaves Home, its Event read answers 410, and the deploy check skips it (0.9 release, where a placeholder Session blocked the Release; the deploy check now names the Event and the Session that block, by id: the reason lands in the public Actions log, where a Host-typed slug does not belong).

## Issues

- **Comments are your job.** Record what later issues will need: decisions, deviations, verification results.
- **Verify on staging, then close.** Once an issue's work is merged into `staging` and deployed there, check it against the issue's requirements on staging (not just CI), post the result as a comment, and close the issue yourself, without waiting for the Release. A `Closes #n` in a PR into `staging` closes nothing, since GitHub closes issues only on merges into the default branch (`main`). Staging sits behind Vercel Authentication, so `curl` only gets a redirect to the login: read a page through the Vercel connector's `web_fetch_vercel_url`, which saves a large page to a file you then search. A page behind sign-in needs Claude in Chrome, which loads only when the session starts with `claude --chrome`; without it, say so at the session's first check and leave that check to the user. Claude in Chrome's limits:
  - `javascript_tool` masks strings shaped like a version (`0.5.1`) in what it returns, so return comparisons (`seen === '0.5.0'`) or counts;
  - `javascript_tool` gives up after 45 s, so a wait across a 60 s Veto window is split into several calls;
  - it can't resize the window („Bounds must be at least 50 % within visible screen space“), and a popup from `javascript_tool` (`window.open(url, '', 'width=390')`) is blocked for want of a user gesture (tried 2026-11-08), so the 390 and 1440 px checks run through `scripts/browser/`: on `pnpm dev`, or against staging itself with `BASE_URL` and the Vercel bypass secret (`scripts/browser/README.md` § Staging);
  - a motion ticket's check reads one of its animations with `document.getAnimations()` (duration and easing): the deployed CSS is minified and `pnpm dev`'s is not, and every local check of 0.5 to 0.10 passed while every Web Animation ran near 0 ms on staging and production (#370);
  - motion is read through a spy on `Element.prototype.animate`, installed in one `javascript_tool` call before the trigger (the pattern `scripts/browser/kit.mjs` installs), then `document.getAnimations()` for durations, delays, easings and `currentTime`, never by sampling frames: in the #363 check (2026-11-09) `requestAnimationFrame` ran at about 18 fps and timers jittered by up to 400 ms, so the first frame that read „0:00“ already showed finished animations, while the spy gave all seven burst tracks exactly;
  - return counts, booleans and short numbers, not class lists or CSS text: a result that carried class and CSS strings was blocked by the extension's filter („Cookie/query string data“, 2026-11-09);
  - keep one call's result under about 3 KB and use several calls for more: a larger result is cut with `[TRUNCATED]` (2026-11-09);
  - it can't change the OS settings, but the app reads two attributes on `<html>` that one `javascript_tool` line sets: `data-theme="dark"` for dark mode and `data-motion="reduced"` for reduced motion (`app/assets/css/compies-theme.css`; the 0.9 check left both to the local run for nothing);
  - a hold button takes a dispatched `pointerdown`, then a `pointerup` 1.4 s later.
- **A Player's view on staging.** A Player check on staging goes through Claude in Chrome with `https://staging.compies.christried.me/api/dev/sign-in?as=member&to=/e/<slug>`: the dev sign-in of `pnpm dev`, with the same three dev Users (`as=host|member|admin`), which the staging build carries too and production never does (#247). The Dev Member opens an Event once it has joined through the Invite link, and is a Player once it is in a Party; joining changes the Event, so the next bullet's rules apply. The sign-in replaces the operator's in that Chrome, so the report says so and the user signs in again.
- **Events on staging.** A Session needs a Player in every team. Live checks on staging (spin, Vetoes, clip, coin) run on „Staging-Check“: an Event the operator hosts, with their second account seated in a team, which stays unfinished. Agents date, start, end and add its Sessions, and seat the Dev Member in it (Invite link, then a Party), without asking (user, 2026-11-05); it holds no real game night. For anything that needs a finished Event, or another setup, agents create their own Events on staging as the Dev Host, with the Dev Member and the Dev Admin as Players, run them through by the API and finish them, without asking: the user approved everything on staging (2026-11-08). The requests are the ones `finishedEvent` in `scripts/browser/kit.mjs` makes (create, join, seat, start, set the games, Results for a winner or a Tie, finish): paste that sequence into one `javascript_tool` call per account, the Host's first, where the dev sign-in replaces the cookie the kit would carry. Events the operator hosts still need the user's OK for each change. Finished Events leave Home after 24 h and the Archiv is not built yet, so note a finished check Event's slug on its issue.
- **Name it in the Release PR.** The next Release PR into `main` lists every issue it ships (`Closes #n` or `Refs #n`), already closed ones included. Keep a running list as issues land.
- **Advise on Release timing.** After each finished issue, end your report with a go/no-go recommendation for a Release to `main` and why: what is on staging, open risks, pending migrations. The user decides.

## Branch hygiene

GitHub holds only `main`, `staging` and branches in active development. The repo setting "Automatically delete head branches" is on, and merges still pass `--delete-branch`. Before ending a work session, run `git fetch --prune` and `git branch -r --merged origin/staging`, and delete what's left with `git push origin --delete <branch>`. You may delete merged branches on `origin` and change the repo's branch settings via `gh`.

Agent worktrees go with `node scripts/worktree-clean.mjs <agent ids>`, run in the background (a worktree with `node_modules` takes minutes). Name the agents of this session that have reported; without names it removes only the worktrees of ended sessions. It unlocks what the harness locked, keeps a worktree with uncommitted changes, an unpushed commit or a process running in it (and says why), and deletes the folders a broken-off removal left.

## GitHub from a cloud session

Cloud sessions (`CLAUDE_CODE_REMOTE=true`) reach GitHub through a proxy that refuses GraphQL, so `gh pr …` and `gh issue …` fail with a 403. It also refuses branch deletions and tag pushes over `git push`. Use the session's built-in GitHub tools where they cover the operation, or the REST API through `gh api`. Issue operations are in `docs/agents/issue-tracker.md`; the rest:

- **Open a PR**: `gh api repos/christried/compies/pulls -f head=<branch> -f base=staging -f title="..." -F body=@body.md`
- **CI state**: `gh api repos/christried/compies/commits/<sha>/check-runs --jq '.check_runs[] | {name, status, conclusion}'`
- **Merge into `staging`**: `gh api -X PUT repos/christried/compies/pulls/<n>/merge -f merge_method=merge` (GitHub deletes the head branch)
- **Delete a branch**: `gh api -X DELETE repos/christried/compies/git/refs/heads/<branch>`
- **Tag a Release** (annotated, as `release.md` describes): `sha=$(gh api repos/christried/compies/git/tags -f tag=vX.Y.Z -f message="Release X.Y.Z – Name" -f object=<merge-sha> -f type=commit --jq .sha)`, then `gh api repos/christried/compies/git/refs -f ref=refs/tags/vX.Y.Z -f sha="$sha"`

When the proxy refuses one of these too, hand the step to the user to run locally.
