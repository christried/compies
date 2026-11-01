# Release workflow

COMPIES keeps its version history in `CHANGELOG.md` at the repo root (Keep a Changelog, German, written for Users) and its version in `package.json`. Both move with a Release. The flow to production is ADR 0007: feature branch → PR into `staging` → check on staging → Release PR into `main`.

## Changelog lines (every ticket PR)

- A PR with a change Users can see adds its lines under `## [Unreleased]` in `CHANGELOG.md`, in the same PR.
- Write plain German for Users („Du kannst jetzt …“), not developer notes. Issue references are links: `([#64](https://github.com/christried/compies/issues/64))`.
- Groups are `### Neu`, `### Geändert`, `### Behoben`, `### Entfernt`, `### Sicherheit`, only these five, in this order when present.
- Bullets with at most one nested level. Bold, inline code and links are fine.
- A PR with no change Users can notice (refactors, tests, docs) adds no line.

## Review, walk-through, retro

Every Release runs these steps in this order. A step finds work → tickets, fixed on `staging`, before the next step.

1. **Review.** Once every ticket of the Release is on `staging`, review the Release diff (`vPREVIOUS...origin/staging`) in three `sonnet` subagents: `code-review` Standards, `code-review` Spec against the Release spec and its tickets, and `thermo-nuclear-code-quality-review` with `improve-codebase-architecture`. Merge their findings into `docs/reviews/review_x.y_YYYY-MM-DD.md` and turn what must change into tickets.
2. **Walk-through.** Open a `ready-for-human` issue „Staging walk-through x.y“ with a checklist built from the spec's acceptance criteria. The user walks staging and notes what is off; each finding becomes a ticket.
3. **Cut.** Only then the version cut and the Release PR below.
4. **Retro.** After the merge into `main`, ask the user to run `/retro` on the Release's sessions: what the review and the walk-through caught that a check, a standard or a brief should have caught earlier. Its rules land in `CLAUDE.md`, `docs/agents/` or a new automated check.

## Version cut (own PR into `staging`)

When a Release is ready, a PR into `staging` does three things:

1. Turns `## [Unreleased]` into a Release heading `## [x.y.z] - YYYY-MM-DD – Name`, with the date of the cut and the short German name, and an optional one-paragraph intro.
2. Leaves `## [Unreleased]` empty above it.
3. Sets `version` in `package.json` to `x.y.z`.

The cut lands on `staging` through its own PR first, before the Release PR to `main`. Plan the merge into `main` for a day without a Session (§ Release PR to `main`, No game days).

## Release PR to `main`

The user approves every merge into `main`. Agents open the Release PR and ask; they never merge it themselves.

**No game days.** Do not ask for the merge on a day with a Session Date (Europe/Berlin) or while a Session runs. The merge deploys the production Worker (`.github/workflows/realtime-deploy.yml`), and that drops every open socket. Before asking, check with the deploy check: `ROOM_INTERNAL_SECRET=… node realtime/scripts/deploy-check.mjs` (the production key; exit 0 means no Session is dated today and none has run for less than 16 h), or look at the Event list. The workflow runs the same check itself and fails the production deploy on a game day; the merge into `main` has then already happened, so the check up front is what keeps the deploy from waiting (re-run the failed workflow on the next day without a Session). The check (and the workflow's guard) counts a Running Session only for 16 h after its start, so a Session nobody ended stops blocking the next day. A deploy that must go out anyway: run the workflow by hand with `override`.

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
- Ask the user to run `/retro` (step 4 of § Review, walk-through, retro).

## Semantic versioning

Releases count from 0.1 while COMPIES is being built; 1.0.0 is the Release the user declares ready, never an agent. Until 0.5.1 the Releases were numbered 1.x; 0.5.1 renumbers them `1.N.p` → `0.(N+1).p` (1.0.0 is 0.1.0, 1.4.0 is 0.5.0), tags included. The tags `v0.2.2`, `v0.3.0`, `v0.4.0` and `v0.5.0` go on the commits of `v1.1.2`, `v1.2.0`, `v1.3.0` and `v1.4.0` (`git rev-parse v1.x.y^{}`) after the 0.5.1 Release merge, annotated with the new number; the `v1.x` tags are deleted on `origin` only after the user's OK (#220). Specs, issues, reviews, ADRs and code comments written before keep the old numbers; `docs/roadmap.md` maps them.

- A Release with a new feature raises the minor number and resets the patch number: `0.2.1` → `0.3.0`.
- A Release with fixes only raises the patch number: `0.2.1` → `0.2.2`.
- From 1.0.0 on, the major number is reserved for a break Users feel, for example everyone having to sign in again. Before 1.0.0, such a break raises the minor number.

## Checks

- `test/unit/changelog-file.test.ts` fails when `CHANGELOG.md` breaks its format, its Releases do not strictly go down in version or dates go up, or `package.json` is not at the newest Release version. Run `pnpm test` before opening a Release PR.
- The parser is `shared/changelog.ts`. The Neuigkeiten page reads the same file through it.
