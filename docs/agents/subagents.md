# Subagents

The orchestrating session (Opus) plans, briefs, supervises and decides; subagents implement and review. These rules win over any skill or hand-off note that names another model, such as "always pass `model: "opus"`".

**Why:** the user wants Haiku used as much as a precise brief allows, with Opus controlling everything that lands.

## Model per subagent

Pass `model` on every Agent call. `CLAUDE_CODE_SUBAGENT_MODEL=haiku` in `.claude/settings.json` only catches a spawn that leaves it out.

- **`haiku`**: implementers and merge jobs, by default.
- **`sonnet`**: an implementer whose task the brief can't carry, because the instructions don't fit or the work needs judgement the brief can't settle in advance (e.g. a design across many modules found only while building). Also both `code-review` sub-agents (Standards and Spec), since the Spec review has to reason about correctness.
- Implementers and reviewers never run on `opus`.

Reviewers, the `code-review` sub-agents and the Release review alike, run with `isolation: "worktree"`. Merge jobs work in the main checkout, and a reviewer told to stay read-only still checked out a detached head there (0.5.1).

## Briefs

Read the ticket and the code first, then write one brief per ticket: files to change, data shapes, migration, tests at which seam with which cases, edge cases, what not to touch, an acceptance checklist, and the model it runs on. The more precise the brief, the more of the work Haiku can take.

- Name the existing module the ticket extends (the homes in `CODING_STANDARDS.md`); a ticket that builds a second copy of a page, flow or component says why.
- Name the ADRs the change must respect (`docs/adr/`). The 1.4 brief for #202 missed ADR 0005, and the user had to decide mid-build.
- A ticket where something moves names its entry in `docs/design_handoff_compies/04-motion.md`: curve, duration, landing.
- A data migration names what the old code writes while the build migrates: the previous deployment serves until the switch-over (`CODING_STANDARDS.md` § Database). The 0.5.1 brief for #220 missed it (#242).

Around the brief goes the frame, `docs/agents/implementer-frame.md`: worktree base, commits, changelog line, checks and report. A new worktree starts from `main`, where a frame changed on `staging` isn't yet, so the spawn prompt names it as `git show origin/<integration branch>:docs/agents/implementer-frame.md`. A merge job gets `docs/agents/merger.md`. Run at most three implementers at a time and one merge job at a time; more overloads the machine (session 6 of 1.4).

## Supervision

Read every implementer's diff against its brief and the ticket's acceptance criteria before it merges, and against the integration tip: a merge resolution can bring back code another ticket just removed. Answer each report once, with either the fix list or „report received, stop“; a fix list sent after a „stop“ can arrive after the agent has ended.

A ticket that changes a page isn't done on tests alone: look at the page on `pnpm dev` at 390 and 1440 px wide, signed in through `/api/dev/sign-in?as=host` or `?as=member` (README), and compare it with its `.dc.html` artboard in `docs/design_handoff_compies/reference/`. The PR's Evidence lists what the check showed (page, account, width, what was compared); the screenshots stay in `<tmp>/compies-browser/`, and the key ones go to the user with SendUserFile (`gh` cannot upload images). A ticket with live behaviour (two people on one Event) or motion also gets the two-account check in `scripts/browser/`: a Host and a Member in two headless Chrome profiles, with every animation logged.

**Context limit.** Before every new implementer (`implement-spec` steps 4, 6 and 7), run `node scripts/context-usage.mjs`. It reads this main session's context from its transcript; subagents don't count. At 300k tokens or more, start no new implementer: let the running ones report, review and merge them as usual, then write a handoff for the next session and stop. `handoff` is user-invoked, so read `.claude/skills/handoff/SKILL.md` and follow it. The handoff carries what a fresh `/implement-spec` needs to go on without loss:
- the spec, the integration branch, its PR, and each ticket's state: merged, in flight (branch, worktree), on the frontier, or blocked (by what);
- the brief of every ticket not yet merged, copied next to the handoff (briefs live in this session's scratchpad);
- every decision the user made in chat, first posted as a comment on its issue, then pointed to;
- the friction worth a `/retro`: what cost time, what a check, a doc or a brief should have caught.

End by telling the user the handoff's path, to start the next session with `/implement-spec` and that path.

The orchestrator does every merge into `staging` and `main` (`docs/agents/delivery.md`).
