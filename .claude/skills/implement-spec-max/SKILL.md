---
name: implement-spec-max
description: "Implement the result of /to-spec and /to-tickets in code, with every subagent on Fable 5.2, Opus 5.5 or Sonnet 5.5 by how hard its task is."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

**COMPIES (max):** this is `/implement-spec` with one change: every subagent spawned under it runs on the **tier** its task rates in § Model tiers: Fable 5.2, Opus 5.5 at high effort, or Sonnet 5.5 at high effort. That covers every Agent call this skill makes, directly or through a skill or doc it invokes: exploration subagents, brief drafters, implementers, merge jobs, the `code-review` Standards and Spec sub-agents, the three Release reviewers and the report merger of `docs/agents/release.md` § Review, and browser-check subagents. § Model tiers replaces `docs/agents/subagents.md` § Model per subagent and the model named in `docs/agents/merger.md`, `docs/agents/release.md` and the `code-review` patch; everything else in those documents still applies: isolation, the concurrency limits, and the 300k context limit with its handoff. A handoff written under this skill names the tier of each ticket not yet merged and tells the next session to continue with `/implement-spec-max`, not `/implement-spec`.

**COMPIES:** before the first spawn, read `docs/agents/subagents.md` (the model per subagent, one brief per ticket, reading every diff before it merges) and `docs/agents/delivery.md` (PRs into `staging`, verifying and closing tickets).

## Steps

1. Read the spec and tickets to understand the task graph.

   **COMPIES:** read the spec and the frontier tickets; read a later ticket when it opens (`docs/agents/subagents.md` § Supervision). All seven tickets of 0.9 up front cost 15k tokens before the first spawn.

2. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation. Ensure the exploration subagent can save files - it should save its markdown notes in a directory outside the repo, accessible by all future subagents. This lets **implementer subagents** focus on implementation rather than exploration.

3. Create the integration branch. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

   **COMPIES:** branch it from `staging` and always open its PR into `staging` (ADR 0007). Its `Closes #n` lines close nothing there; step 8 closes each ticket by hand (`docs/agents/delivery.md` § Issues).

4. Use **implementer subagents** to implement each ticket, each in its own worktree on its own branch. Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting, and resets onto it if not;
   - calls the Skill tool with `tdd` to build the ticket;
   - merges the integration branch tip into its own branch before reporting done

5. Once an **implementer subagent** completes, merge its work to the integration branch with a **merger subagent**.

   **COMPIES:** merge it yourself when the head contains the integration tip and `git merge-tree` is clean, once CI is green on the head; a merger subagent (`docs/agents/merger.md`) only for a conflict (`docs/agents/subagents.md` § Supervision).

6. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

   **COMPIES:** before every new implementer (steps 4, 6 and 7) check the context limit, passing your session id (`docs/agents/subagents.md` § Supervision); at the limit, hand off instead.

7. Once all tickets are complete, call the Skill tool with `code-review` on the integration branch. Fix all issues raised by the code review in a single **implementer subagent**.

   **COMPIES:** when the spec is a whole Release, run the Release review of `docs/agents/release.md` § Review, walk-through, retro here instead of `code-review`: it reviews the integration branch once, and the Release needs no second review on `staging`.

8. If a draft PR exists, mark it ready for review. Otherwise, resolve each ticket the way the issue tracker closes work, and report the integration branch.

   **COMPIES:** merge the PR into `staging` once CI is green, then verify each ticket on staging and close it (`docs/agents/delivery.md`).

9. Clean up all **implementer subagent** worktrees.

   **COMPIES:** with `scripts/worktree-clean.mjs` (`docs/agents/delivery.md` § Branch hygiene).

## Model tiers

Every spawn runs on one of three tiers. Each tier holds about a third of the work this project realistically has; the anchors below are tickets of 0.7 to 0.10, which they split about evenly.

| Tier | Agent call |
|---|---|
| **Fable** | `model: "fable"`, no `effort` (it runs at its default) |
| **Opus** | `model: "opus"`, `effort: "high"` |
| **Sonnet** | `model: "sonnet"`, `effort: "high"` |

Rate a task by the hardest thing it asks. Between two tiers, take the higher one.

- **Fable**: the task holds a risk a green test run can hide.
  - Secrecy (`CODING_STANDARDS.md` § Secrecy): what a viewer may know of a game, a pool or a Veto (#258, #338, #355).
  - Realtime and server time across Nuxt and the room (ADR 0012, ADR 0013): room messages, clock sync, synced moments, deadlines (#259, #287, #309).
  - A data migration while the old deployment still serves (`CODING_STANDARDS.md` § Database).
  - Domain rules whose edge cases interlock: Ties, Corrections, Rounds against the Game count, the Veto allowance (#275, #278, #315).
  - A ticket zero, or a concern moving to a new home across many modules (#256, #284).
  - A bug whose cause is still unknown.
- **Opus**: a feature or refactor along known seams that needs judgement but holds none of the Fable risks.
  - A feature in one or two modules with its own edge cases (#274, #333, #335, #337).
  - Motion built to `04-motion.md` and an artboard (#276, #340, #348).
  - A review follow-up that merges or splits components (#362 to #366).
- **Sonnet**: the brief settles every decision, and the work carries it out.
  - Copy, layout or styling to a reference (#347, #350, #353, #379).
  - Datenschutzerklärung text the brief quotes (#280, #334).
  - Extracting one component or constant, rewriting tests (#361, #367, #368).
  - Docs and scripts for agents (#386 to #393).

Who runs on which tier:

- A ticket's **brief drafter, implementer and merge job** run on the ticket's tier. Rate the ticket from its text and the spec before the drafter, and again from the brief: a brief that names a Fable risk raises it. The fix implementer of step 7 is rated by its hardest fix.
- **`code-review`**: the Spec sub-agent on the tier of the hardest ticket on the branch, Opus at least; the Standards sub-agent on Opus.
- **Release review**: the Spec reviewer and `thermo-nuclear-code-quality-review` on Fable, the Standards reviewer on Opus, the report merger on Sonnet.
- **Browser check**: Sonnet for layout on one account; Opus for motion or the two-account check.
- **Exploration**: Sonnet; Opus when its question touches a Fable risk.
