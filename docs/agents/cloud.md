# Cloud sessions

What holds only in a Claude Code cloud session (`CLAUDE_CODE_REMOTE=true`): a Linux container with its own clone, real bash, no browser, and a scratchpad that dies with the container. A cloud orchestrator reads this file before its first spawn and names it first in every spawn prompt, as `git show origin/<integration branch>:docs/agents/cloud.md`; a cloud subagent reads § Every agent, then its frame. Until 0.14 each cloud run wrote these notes itself, and each of its sessions rebuilt them from a comment on the spec issue (#780).

## Every agent

- **Read Linux for Windows.** Where a doc says Windows, Git Bash or the Python Store alias, read Linux and bash. The guard on heredocs and the rule for git calls hold here as they do locally (`docs/agents/implementer-frame.md` § Rules, Shell).
- **Base your worktree on the integration branch**, since it may start on an old commit. An implementer does it as its frame says. A drafter or a reviewer, who commits nothing: `git fetch origin`, then `git reset --hard origin/<integration branch>`. Read every doc and frame from that tip.
- **GitHub answers REST only.** The proxy refuses GraphQL, so `gh issue …` and `gh pr …` fail with a 403. Read an issue with `gh api repos/christried/compies/issues/<n> --jq '.title, .body'`, and its comments with `gh api repos/christried/compies/issues/<n>/comments --jq '.[] | "=== \(.created_at)\n\(.body)"'`. Only the orchestrator comments on issues, labels them, closes them and opens PRs.
- **Tests run on PGlite, and nothing else runs:** no browser, no `pnpm dev`, no `.env`, no dev database, no staging. So no ticket is checked in a browser here, and every pass condition of a cloud run is **typed, not measured**:
  - a drafter marks no item „measure on slot 2“ (`docs/agents/drafter-frame.md` § Browser-check items) and heads the section „Browser-check items (typed, not measured)“;
  - an implementer measures nothing in a browser and says „not measured: cloud run“ in its report;
  - the orchestrator posts the items on the Release's check ticket under the same heading, and the local phase's check agents judge them as `docs/agents/browser-frame.md` § Checks says for a typed item.
- **Checks:** `pnpm typecheck && pnpm lint && pnpm knip` and the test files you touched run here; the full `pnpm test` and `pnpm test:build` run in CI, which `node scripts/ci-wait.mjs` waits for (it polls through REST).
- **Report** as your frame says.

## The run branch

The scratchpad dies with the container, so a cloud run keeps what its next session needs on a branch of its own, `run/<spec number>` on `origin`: the briefs (`briefs/<ticket>.md`, each pushed once the orchestrator has checked it, before its spawn), the run's notes for subagents (`notes.md`: what this run alone must know, such as the files a parallel run owns), and any helper script the run wrote. Handoffs, decisions and the notes for the Release PR stay comments on the spec issue (`docs/agents/delivery.md` § Issues), and they link a file on the branch, never copy it: the 0.14 run posted eight briefs, its notes and three scripts as comments, and #621 grew to 156 KB that every later session's first read paid for (#780).

1. **Start it**, once per run, as an orphan branch in a worktree of its own, so it holds the run's files and nothing of the repository:
   - `git worktree add --detach <scratchpad>/run-<spec>`
   - `git -C <scratchpad>/run-<spec> switch --orphan run/<spec>`
2. **Add to it:** write the file into that folder with the Write tool, then `git -C <scratchpad>/run-<spec> add -A`, `commit -m "run <spec>: <what>"` and `push origin run/<spec>`. CI skips `run/**` (`.github/workflows/ci.yml`).
3. **Read it**, in a later session: `git fetch origin run/<spec>`, then `git show origin/run/<spec>:briefs/<ticket>.md`, one file at a time. A session that goes on writing makes its worktree with `git worktree add <scratchpad>/run-<spec> run/<spec>`.
4. **Delete it when the spec issue closes:** nothing of a run stays in the repository (the operator, 2026-11-16). The session that closes the spec deletes the branch, here with the REST call below and locally with `git push origin --delete run/<spec>`, and says so in its last comment on the spec. A helper worth keeping for every run becomes a ticket for `scripts/`, with a test, before the branch goes.

A local run's scratchpad outlives its session, so a local run needs no run branch: its briefs go next to the handoff (`docs/agents/subagents.md` § Supervision).

## GitHub operations

Cloud sessions reach GitHub through a proxy that refuses GraphQL, so `gh pr …` and `gh issue …` fail with a 403. It also refuses branch deletions and tag pushes over `git push`. Use the session's built-in GitHub tools where they cover the operation, or the REST API through `gh api`. Issue operations are in `docs/agents/issue-tracker.md` § In a cloud session; the rest:

- **Open a PR**: `gh api repos/christried/compies/pulls -f head=<branch> -f base=staging -f title="..." -F body=@body.md`
- **CI state**: `gh api repos/christried/compies/commits/<sha>/check-runs --jq '.check_runs[] | {name, status, conclusion}'`
- **Merge into `staging`**: `gh api -X PUT repos/christried/compies/pulls/<n>/merge -f merge_method=merge` (GitHub deletes the head branch)
- **Wait for a merge**: `node scripts/ci-wait.mjs --pr <n>` polls through `gh api` (REST, no GraphQL), so the wait runs here too; the report of a failed check calls `gh run view --log-failed`, which is untested in a cloud session and falls back to the run's URL. Auto-merge is not available here (setting it is GraphQL), so a PR of this session is merged with the REST call above once its head is green; the PR mode serves a PR somebody else merges.
- **Wait for a deployment**: `node scripts/ci-wait.mjs --deployed <sha>` reads the commit's statuses through REST too.
- **Delete a branch**: `gh api -X DELETE repos/christried/compies/git/refs/heads/<branch>`
- **Tag a Release** (annotated, as `release.md` describes): `sha=$(gh api repos/christried/compies/git/tags -f tag=vX.Y.Z -f message="Release X.Y.Z – Name" -f object=<merge-sha> -f type=commit --jq .sha)`, then `gh api repos/christried/compies/git/refs -f ref=refs/tags/vX.Y.Z -f sha="$sha"`

When the proxy refuses one of these too, hand the step to the user to run locally.

## Where the session starts

A cloud session of 0.14 was at about 155k tokens before any work, against 71k locally, and nobody has measured why: the transcripts stay in the container. A cloud orchestrator runs `node scripts/context-usage.mjs --startup` before its first spawn and puts the output into its first handoff, so the next retro can say (#780).
