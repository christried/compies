# Release workflow

COMPIES keeps its version history in `CHANGELOG.md` at the repo root (Keep a Changelog, German, written for Users) and its version in `package.json`. Both move with a Release. The flow to production is ADR 0007: feature branch → PR into `staging` → check on staging → Release PR into `main`.

## Changelog lines (every ticket PR)

- A PR with a change Users can see adds its lines under `## [Unreleased]` in `CHANGELOG.md`, in the same PR.
- Write plain German for Users („Du kannst jetzt …“), not developer notes. Issue references are links: `([#64](https://github.com/christried/compies/issues/64))`.
- Groups are `### Neu`, `### Geändert`, `### Behoben`, `### Entfernt`, `### Sicherheit`, only these five, in this order when present.
- Bullets with at most one nested level. Bold, inline code and links are fine.
- A PR with no change Users can notice (refactors, tests, docs) adds no line.
- **On an integration branch** (one spec, many tickets), ticket branches add no line. The implementer gives its line in its report, and the orchestrator adds it under `## [Unreleased]` right after merging the ticket, so one writer touches the file. It makes that commit in its own worktree, never in the main checkout (`docs/agents/delivery.md` § Several sessions in one checkout): `git worktree add --detach .claude/worktrees/<name> origin/<integration branch>` once, then for each line `git fetch origin` and `git checkout --detach origin/<integration branch>` (`scripts/merge-into.mjs` moves the branch on `origin` only), the commit, and `git push origin HEAD:<integration branch>`. In 0.7 every ticket branch appended to the same hunk, which caused most of the sync merges (review 0.7, Q4). The integration PR carries the lines into `staging`. Right after adding a line, the orchestrator runs `pnpm vitest run test/unit/changelog-file.test.ts` before the push.

## Review, walk-through, retro

Every Release runs these steps in this order. A step finds work → tickets, fixed on `staging`, before the next step.

1. **Review.** Once every ticket of the Release is on `staging`, review the Release diff (`vPREVIOUS...origin/staging`) in three `sonnet` subagents at high effort: `code-review` Standards, `code-review` Spec against the Release spec and its tickets, and `thermo-nuclear-code-quality-review` with `improve-codebase-architecture`. Each reviewer writes its report to a file in the orchestrator's scratchpad and returns at most 300 words: the path and its finding headlines. A `haiku` agent at high effort merges the files into `docs/reviews/review_x.y_YYYY-MM-DD.md`; the orchestrator reads the headlines and turns what must change into tickets (0.9: three full reports in the orchestrator's context cost what a whole ticket does).
   - A Release that is one spec on one integration branch gets this review on the integration branch (`vPREVIOUS...<integration branch>`), as `/implement-spec`'s code review, and its fixes land before the integration PR merges. In 0.5.1 a two-axis review on the integration branch and this review on `staging` covered the same diff, and only the second found #242.
   - The Release's browser check of its UI tickets (one brief, `docs/agents/browser-frame.md`) runs against the production build: `COMPIES_STAGE=staging pnpm build` (in Git Bash, or with `COMPIES_STAGE=staging` uncommented in the worktree's `.env`, `.env.example` line 40; without it the production build has no dev sign-in, `stage.ts`), then `serve.mjs start <run> --only=prod` (port 3001). `pnpm dev` serves the CSS unminified, and every dev check of 0.10 passed while the minified duration tokens broke every Web Animation on staging (#370).
2. **Verify on staging.** Once the integration PR is on `staging`, verify each open issue the Release PR will list (`Closes` or `Refs`) there and close it (`docs/agents/delivery.md` § Issues), not only the spec's tickets (#427 was merged by a session that ended after setting auto-merge and shipped in 0.11.0 unverified). An issue that cannot be verified is named as unverified in the Release PR. A FAIL is fixed on `staging` before the cut. A fix that lands after the cut and changes nothing Users see needs no new cut (0.10: #370 rode into the Release PR).
3. **Walk-through.** Open a `ready-for-human` issue „Staging walk-through x.y“ with a checklist built from the spec's acceptance criteria. The user walks staging and notes what is off; each finding becomes a ticket.
4. **Cut.** Only then the version cut and the Release PR below.
5. **Retro.** After the merge into `main`, ask the user to run `/retro` on the Release's sessions: what the review and the walk-through caught that a check, a standard or a brief should have caught earlier. Its rules land in `CLAUDE.md`, `docs/agents/` or a new automated check.

## Version cut (own PR into `staging`)

When a Release is ready, a PR into `staging` does three things:

1. Turns `## [Unreleased]` into a Release heading `## [x.y.z] - YYYY-MM-DD – Name`, with the date of the cut and the short German name, and an optional one-paragraph intro.
2. Leaves `## [Unreleased]` empty above it.
3. Sets `version` in `package.json` to `x.y.z`.

The cut lands on `staging` through its own PR first, before the Release PR to `main`. Plan the merge into `main` for a day without a Session (§ Release PR to `main`, No game days). The orchestrator makes the cut in its own worktree on a branch from `origin/staging` (`git worktree add .claude/worktrees/<name> -b chore/cut-x.y.z origin/staging`), never in the main checkout (`docs/agents/delivery.md` § Several sessions in one checkout).

## Release PR to `main`

The user approves every merge into `main`. Agents open the Release PR and ask; they never merge it themselves.

**Process and tooling apart.** The Release PR lists changes to process and tooling (CI workflows in `.github/`, `scripts/`, `.claude/skills/`, `docs/agents/`) in a section of its own, apart from the product changes, so the user approves them knowingly with the merge into `main`; find them with `git diff --name-only vPREVIOUS...origin/staging -- .github scripts .claude docs/agents`. (#288)

**No game days.** Do not ask for the merge on a day with a Session Date (Europe/Berlin) or while a Session runs. The merge deploys the production Worker (`.github/workflows/realtime-deploy.yml`), and that drops every open socket. Before asking, check with the deploy check (exit 0 means no Session is dated today and none has run for less than 16 h). An agent has no production key, so it runs the check-only workflow: `gh workflow run game-day-check.yml && gh run watch $(gh run list --workflow game-day-check.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status` (green = no game day; it deploys nothing). A `workflow_dispatch` workflow runs only once it is on the default branch (`main`), so this works from the Release after the one that brings the file. The user runs the check locally with the production key: `ROOM_INTERNAL_SECRET=… node realtime/scripts/deploy-check.mjs`. Or look at the Event list. The workflow runs the same check itself and fails the production deploy on a game day; the merge into `main` has then already happened, so the check up front is what keeps the deploy from waiting (re-run the failed workflow on the next day without a Session). The check (and the workflow's guard) counts a Running Session only for 16 h after its start, so a Session nobody ended stops blocking the next day. A deploy that must go out anyway: run the workflow by hand with `override`.

Which case applies depends on what `staging` holds after the cut.

**Case A: staging holds nothing for a later Release.** The cut commit is the last commit on `staging`.

- Open the Release PR from `staging` into `main`.
- Ask the user to approve the merge. Merge only after their approval.

**Case B: staging already holds work for a later Release.** Work merged into `staging` after the cut belongs to the next Release, and `staging` must keep taking work.

- Cut a branch `release/x.y.z` from the staging commit that holds the version cut.
- Open the Release PR from `release/x.y.z` into `main`.
- Ask the user to approve the merge. Merge only after their approval. `staging` is not touched.

**After the merge, in both cases:**

- Tag the merge commit on `main` with an annotated tag `vX.Y.Z`, message `Release x.y.z – Name` (e.g. `Release 0.3.0 – Mehr Termine`), and push the tag. A cloud session tags through the REST API (`docs/agents/delivery.md`).
- If `main` and `staging` have diverged (the merge commit on `main` is not in `staging`), merge `main` back into `staging` so the next Release PR is clean.
- Delete the `release/x.y.z` branch once it is merged (Case B only).
- Mark the Release as released in `docs/roadmap.md`.
- Ask the user to run `/retro` (step 5 of § Review, walk-through, retro).

## Semantic versioning

Releases count from 0.1 while COMPIES is being built; 1.0.0 is the Release the user declares ready, never an agent. Until 0.5.1 the Releases were numbered 1.x; 0.5.1 renumbers them `1.N.p` → `0.(N+1).p` (1.0.0 is 0.1.0, 1.4.0 is 0.5.0), tags included. The tags `v0.2.2`, `v0.3.0`, `v0.4.0` and `v0.5.0` go on the commits of `v1.1.2`, `v1.2.0`, `v1.3.0` and `v1.4.0` (`git rev-parse v1.x.y^{}`) after the 0.5.1 Release merge, annotated with the new number; the `v1.x` tags are deleted on `origin` only after the user's OK (#220). Specs, issues, reviews, ADRs and code comments written before keep the old numbers; `docs/roadmap.md` maps them.

- A Release with a new feature raises the minor number and resets the patch number: `0.2.1` → `0.3.0`.
- A Release with fixes only raises the patch number: `0.2.1` → `0.2.2`. So does a Release with small additions, and each further part of a big Release that was split: 0.13 „Glücksrad & Clip“ ships as `0.13.0`, `0.13.1`, `0.13.2` and `0.13.3` (decided 2026-11-11).
- From 1.0.0 on, the major number is reserved for a break Users feel, for example everyone having to sign in again. Before 1.0.0, such a break raises the minor number.

## Checks

- `test/unit/changelog-file.test.ts` fails when `CHANGELOG.md` breaks its format, its Releases do not strictly go down in version or dates go up, or `package.json` is not at the newest Release version. Run `pnpm test` before opening a Release PR.
- The parser is `shared/changelog.ts`. The Neuigkeiten page reads the same file through it.
