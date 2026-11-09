---
name: implement-spec-max
description: "Implement the result of /to-spec and /to-tickets in code, with every subagent on Opus 5.5 at high effort."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

**COMPIES (max):** this is `/implement-spec` with one change: every subagent spawned under it runs on **Opus 5.5 at high effort**. Pass `model: "opus"` and `effort: "high"` on every Agent call this skill makes, directly or through a skill or doc it invokes: exploration subagents, brief drafters, implementers, merge jobs, the `code-review` Standards and Spec sub-agents, the three Release reviewers and the report merger of `docs/agents/release.md` § Review, and browser-check subagents. This replaces `docs/agents/subagents.md` § Model per subagent and the model named in `docs/agents/merger.md`, `docs/agents/release.md` and the `code-review` patch; everything else in those documents still applies, isolation and concurrency limits included. A handoff written under this skill tells the next session to continue with `/implement-spec-max`, not `/implement-spec`.

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

   **COMPIES:** before every new implementer (steps 4, 6 and 7) check the context limit (`docs/agents/subagents.md` § Supervision); at the limit, hand off instead.

7. Once all tickets are complete, call the Skill tool with `code-review` on the integration branch. Fix all issues raised by the code review in a single **implementer subagent**.

   **COMPIES:** when the spec is a whole Release, run the Release review of `docs/agents/release.md` § Review, walk-through, retro here instead of `code-review`: it reviews the integration branch once, and the Release needs no second review on `staging`.

8. If a draft PR exists, mark it ready for review. Otherwise, resolve each ticket the way the issue tracker closes work, and report the integration branch.

   **COMPIES:** merge the PR into `staging` once CI is green, then verify each ticket on staging and close it (`docs/agents/delivery.md`).

9. Clean up all **implementer subagent** worktrees.

   **COMPIES:** with `scripts/worktree-clean.mjs` (`docs/agents/delivery.md` § Branch hygiene).
