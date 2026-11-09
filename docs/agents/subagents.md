# Subagents

The orchestrating session (Opus) plans, briefs, supervises and decides; subagents implement and review. These rules win over any skill or hand-off note that names another model, such as "always pass `model: "opus"`".

**Why:** the user wants Haiku used as much as a precise brief allows, with Opus controlling everything that lands.

## Model per subagent

Pass `model` on every Agent call. `CLAUDE_CODE_SUBAGENT_MODEL=haiku` in `.claude/settings.json` only catches a spawn that leaves it out.

- **`haiku`**: implementers and merge jobs, by default.
- **`sonnet`**: an implementer whose task the brief can't carry, because the instructions don't fit or the work needs judgement the brief can't settle in advance (e.g. a design across many modules found only while building). Also both `code-review` sub-agents (Standards and Spec), since the Spec review has to reason about correctness, and the brief drafter (§ Briefs).
- Implementers and reviewers never run on `opus`, with one exception: under `/implement-spec-max` (`.claude/skills/implement-spec-max/SKILL.md`) every subagent runs on `opus` with `effort: "high"`, from the brief drafter to the Release reviewers. The rest of this document applies there unchanged.

Reviewers, the `code-review` sub-agents and the Release review alike, and brief drafters run with `isolation: "worktree"`. Merge jobs work in the main checkout, and a reviewer told to stay read-only still checked out a detached head there (0.5.1).

## Briefs

One brief per ticket: files to change, data shapes, migration, tests at which seam with which cases, edge cases, what not to touch and an acceptance checklist. The model is the spawn prompt's (§ Model per subagent), not the brief's: session 2 of 0.10 rewrote every brief's model line. The more precise the brief, the more of the work Haiku can take.

A `sonnet` brief drafter writes it. Its prompt names the ticket, the integration branch and this section; it reads the ticket, its spec and the code, writes the brief to a file in the orchestrator's scratchpad, and returns the path and its open questions. The orchestrator reads the brief rather than the code, checks it against this list and the ticket, settles the questions, and edits it before the spawn. It opens the code only where the brief touches a secret or is unsure. In 0.7 the orchestrator wrote every brief from the code itself, and that reading, with the diffs, filled its 300k context in each of the five sessions.

A brief aims under 25 KB. A drafter whose brief would run longer proposes a split into disjoint parts instead, each its own implementer, and the orchestrator decides (0.9: a 47 KB brief, then #315 split into two parts that touched no common file). A brief for a ticket whose predecessor is not merged yet is drafted after that merge: drafted before it, the brief for #315 needed nine edits for a two-case change once the predecessor landed.

- A data shape names every new field with its type and where it hangs (which section, which key). #231's brief said „the open draw gets its window“, the implementer hung it on `wheel.spin`, and #232 had to move it.
- A ticket that keeps something secret, or shows Members something new, names every surface in `CODING_STANDARDS.md` § Secrecy, and quotes the decision comment or the Datenschutzerklärung sentence word for word, with its link. The 0.10 verifier's brief paraphrased #355 („the Admin sees that a Veto was cast“) where the decision keeps the count unchanged until the reveal, and a round went to the note.
- A ticket that draws a list, a wheel or a count names its edge cases (`CODING_STANDARDS.md` § Tests), and a sheet or a list names the dev library at its full size (176 games at 0.7) for the browser check.
- Name the existing module the ticket extends (the homes in `CODING_STANDARDS.md`); a ticket that builds a second copy of a page, flow or component says why.
- Name the ADRs the change must respect (`docs/adr/`). The 1.4 brief for #202 missed ADR 0005, and the user had to decide mid-build.
- A ticket where something moves names its entry in `docs/design_handoff_compies/04-motion.md`: curve, duration, landing.
- A data migration names what the old code writes while the build migrates: the previous deployment serves until the switch-over (`CODING_STANDARDS.md` § Database). The 0.5.1 brief for #220 missed it (#242).

Around the brief goes the frame, `docs/agents/implementer-frame.md`: worktree base, commits, changelog line, checks and report. A new worktree starts from `main`, where a frame changed on `staging` isn't yet, so the spawn prompt names it as `git show origin/<integration branch>:docs/agents/implementer-frame.md`. A merge job gets `docs/agents/merger.md`. Run at most three implementers at a time and one merge job at a time; more overloads the machine (session 6 of 1.4).

## Supervision

Review every implementer's work against its brief and the ticket's acceptance criteria before it merges, and against the integration tip: a merge resolution can bring back code another ticket just removed. Read the diffstat first, then the files the brief marks risky; open the full diff only for a seam the brief doesn't name (0.9: full diffs of 66 KB and 15k-token reports put every session at the context limit). Merge it only once CI is green on the head it reported (`node scripts/ci-wait.mjs <sha> --until-done` with `run_in_background` says so, or why not; without the flag a call ends after 2.5 minutes with exit 2, which the background reports as a failed task, three times in session 5 of 0.10), then add its changelog line on the integration branch (`docs/agents/release.md` § Changelog lines).

The orchestrator merges a clean branch itself: when the head contains the integration tip and `git merge-tree --write-tree <integration branch> <head>` reports no conflict, `git merge --no-ff -m "Merge <branch> (#<n>)" -m "<the attribution lines>"` and push cost a few hundred tokens (a merge commit carries the attribution lines like any commit; session 4 of 0.10 forgot them once), where a merge job costs ≈ 55k and 2–3 minutes (0.9, sessions 4 and 5). A merge job (`docs/agents/merger.md`) is for a conflict. Answer a report only with a fix list, and accept it by merging, without a reply: a finished agent stays idle, and a message wakes it to send its report again (all three times in session 7 of 0.8).

A ticket that changes a page isn't done on tests alone: look at the page on `pnpm dev` at 390 and 1440 px wide, signed in through `/api/dev/sign-in?as=host` or `?as=member` (README), with the edge cases its brief names, and compare it with its `.dc.html` artboard in `docs/design_handoff_compies/reference/`. The PR's Evidence lists what the check showed (page, account, width, what was compared); the screenshots stay in `<tmp>/compies-browser/`, and the key ones go to the user with SendUserFile (`gh` cannot upload images). A ticket with live behaviour (two people on one Event) or motion also gets the two-account check in `scripts/browser/`: a Host and a Member in two headless Chrome profiles, with every animation logged. A browser check run by a subagent (`sonnet`, `isolation: "worktree"`) gets a brief of the items to check and the frame `docs/agents/browser-frame.md` (setup, measuring rules, report), named in the spawn prompt like the implementer frame. A brief of more than six UI items splits by theme (motion apart from layout), so the first report comes earlier: 0.10's ten-ticket check took 55 minutes and 415k tokens in one agent.

**Context limit.** Before every new implementer (`implement-spec` steps 4, 6 and 7), run `node scripts/context-usage.mjs`. It reads this main session's context from its transcript; subagents don't count. At 300k tokens or more, start no new implementer: let the running ones report, review and merge them as usual, then write a handoff for the next session and stop. `handoff` is user-invoked, so read `.claude/skills/handoff/SKILL.md` and follow it. The handoff carries what a fresh `/implement-spec` needs to go on without loss:
- the spec, the integration branch, its PR, and each ticket's state: merged, in flight (branch, worktree), on the frontier, or blocked (by what);
- every subagent still running, by its ticket and the description it was spawned with: only the session that spawned an agent can resume it (SendMessage), so one a usage limit stops is resumed from this session, not the next (retro 0.8, finding 6);
- the brief of every ticket not yet merged, copied next to the handoff (briefs live in this session's scratchpad);
- every decision the user made in chat, first posted as a comment on its issue, then pointed to;
- the friction worth a `/retro`: what cost time, what a check, a doc or a brief should have caught.

End by telling the user the handoff's path, to start the next session with `/implement-spec` and that path. A `/retro` followed by an `/implement-spec` in one session starts the run near the limit (session 1 of the 0.10 follow-ups began at 239k), so run `/clear` between them.

The orchestrator does every merge into `staging` and `main` (`docs/agents/delivery.md`).
