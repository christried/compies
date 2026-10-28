# Delivery workflow

What agents do on their own in COMPIES, and what waits for the user. The path to production is ADR 0007: feature branch → PR into `staging` → check on staging → Release PR into `main`. Changelog lines, the version cut and the Release PR itself are in `docs/agents/release.md`.

## Branches and merges

- **Feature branches**: push freely. `staging` and `main` are protected (admins included): every change arrives through a PR, the CI check `check` must pass, no force pushes or deletions.
- **Into `staging`**: open the PR and merge it yourself once `check` is green, without asking: `gh pr merge <n> --merge --delete-branch`.
- **Into `main`**: open the Release PR yourself; merging it needs the user's approval. In auto mode the classifier blocks `gh pr merge` into `main` even after the user's "go". Hand the user `! gh pr merge <n> --merge` (in a cloud session: the PR link, to merge on GitHub), then pick up the tag, sync and smoke check once they've merged.
- **Subagents** hand their work back; the orchestrating session does every merge into `staging` and `main`.

## Database migrations

Committed drizzle-kit migrations run in the Vercel build, so merging into `staging` migrates the staging database and merging into `main` migrates production. Run migrations on local/dev and staging databases yourself. A migration against production needs the user's approval, which a Release PR that carries one asks for explicitly.

## Issues

- **Comments are your job.** Record what later issues will need: decisions, deviations, verification results.
- **Verify on staging, then close.** Once an issue's work is merged into `staging` and deployed there, check it against the issue's requirements on staging (not just CI), post the result as a comment, and close the issue yourself, without waiting for the Release.
- **Name it in the Release PR.** The next Release PR into `main` lists every issue it ships (`Closes #n` or `Refs #n`), already closed ones included. Keep a running list as issues land.
- **Advise on Release timing.** After each finished issue, end your report with a go/no-go recommendation for a Release to `main` and why: what is on staging, open risks, pending migrations. The user decides.

## Branch hygiene

GitHub holds only `main`, `staging` and branches in active development. The repo setting "Automatically delete head branches" is on, and merges still pass `--delete-branch`. Before ending a work session, run `git fetch --prune` and `git branch -r --merged origin/staging`, and delete what's left with `git push origin --delete <branch>`. You may delete merged branches on `origin` and change the repo's branch settings via `gh`.

## GitHub from a cloud session

Cloud sessions (`CLAUDE_CODE_REMOTE=true`) reach GitHub through a proxy that refuses GraphQL, so `gh pr …` and `gh issue …` fail with a 403. It also refuses branch deletions and tag pushes over `git push`. Use the session's built-in GitHub tools where they cover the operation, or the REST API through `gh api`. Issue operations are in `docs/agents/issue-tracker.md`; the rest:

- **Open a PR**: `gh api repos/christried/compies/pulls -f head=<branch> -f base=staging -f title="..." -F body=@body.md`
- **CI state**: `gh api repos/christried/compies/commits/<sha>/check-runs --jq '.check_runs[] | {name, status, conclusion}'`
- **Merge into `staging`**: `gh api -X PUT repos/christried/compies/pulls/<n>/merge -f merge_method=merge` (GitHub deletes the head branch)
- **Delete a branch**: `gh api -X DELETE repos/christried/compies/git/refs/heads/<branch>`
- **Tag a Release** (annotated, as `release.md` describes): `sha=$(gh api repos/christried/compies/git/tags -f tag=vX.Y.Z -f message="Release X.Y.Z – Name" -f object=<merge-sha> -f type=commit --jq .sha)`, then `gh api repos/christried/compies/git/refs -f ref=refs/tags/vX.Y.Z -f sha="$sha"`

When the proxy refuses one of these too, hand the step to the user to run locally.
