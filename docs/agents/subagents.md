# Subagents

The orchestrating session (Opus) plans, briefs, supervises and decides; subagents implement and review. These rules win over any skill or hand-off note that names another model, such as "always pass `model: "opus"`".

**Why:** the user wants Haiku used as much as a precise brief allows, with Opus controlling everything that lands.

## Model per subagent

Pass `model` on every Agent call. `CLAUDE_CODE_SUBAGENT_MODEL=haiku` in `.claude/settings.json` only catches a spawn that leaves it out.

- **`haiku`**: implementers and merge jobs, by default.
- **`sonnet`**: an implementer whose task the brief can't carry, because the instructions don't fit or the work needs judgement the brief can't settle in advance (e.g. a design across many modules found only while building). Also both `code-review` sub-agents (Standards and Spec), since the Spec review has to reason about correctness.
- Implementers and reviewers never run on `opus`.

## Briefs

Read the ticket and the code first, then write one brief per ticket: files to change, data shapes, migration, tests at which seam with which cases, edge cases, what not to touch, an acceptance checklist, and the model it runs on. The more precise the brief, the more of the work Haiku can take. Name the existing module the ticket extends (the homes in `CODING_STANDARDS.md`); a ticket that builds a second copy of a page, flow or component says why. Around it goes the generic frame: worktree base, commits, the changelog line (`docs/agents/release.md`), the checks CI runs (`.github/workflows/ci.yml`), and the report.

## Supervision

Read every implementer's diff against its brief and the ticket's acceptance criteria before it merges, and send concrete fix lists back. A ticket that changes a page isn't done on tests alone: look at the page on `pnpm dev` at 390 and 1440 px wide, signed in through `/api/dev/sign-in?as=host` or `?as=member` (README), and compare it with its `.dc.html` artboard in `docs/design_handoff_compies/reference/`. Put the screenshots in the PR. The orchestrator does every merge into `staging` and `main` (`docs/agents/delivery.md`).
