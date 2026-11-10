---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

**COMPIES:** before your first edit, create your own worktree on the ticket's branch from `origin/staging`: `git fetch origin`, then the harness's worktree tool, or `git worktree add .claude/worktrees/<name> -b <branch> origin/staging`. Work there; the main checkout's branch belongs to no session (`docs/agents/delivery.md` § Several sessions in one checkout).

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work.

Commit your work to the current branch.

**COMPIES:** then deliver it as `docs/agents/delivery.md` describes: PR into `staging`, merge once CI is green, verify on staging, close the issue, and remove your worktree by name: step out of it first (git cannot remove the folder you stand in), then `git -C <main checkout> worktree remove .claude/worktrees/<name>` (git refuses while it holds uncommitted changes), and `git -C <main checkout> branch -D <branch>` once `git branch -r --contains <branch>` lists `origin/staging`, names written out (or the harness's worktree tool, exit with remove). `scripts/worktree-clean.mjs` is not used here: it finds its worktrees from the folder it runs in, which a worktree is not.
