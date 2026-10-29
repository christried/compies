# COMPIES

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on christried/compies (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Roadmap

Which release comes next and what each one holds: `docs/roadmap.md`. It replaces the 1.0 ticket order in the design hand-off.

### Release workflow

Changelog lines and the version cut: `CHANGELOG.md` + `package.json`. See `docs/agents/release.md`.

### Delivery workflow

Merge PRs into `staging` yourself once CI is green; merges into `main` and production migrations wait for the user's approval. Also covers verifying and closing issues, branch cleanup, and GitHub from a cloud session (no `gh pr`/`gh issue` there). See `docs/agents/delivery.md`.

### Subagents

Pass `model` on every spawn: `haiku` for implementers by default, `sonnet` when the brief can't carry the task and for code-review agents. See `docs/agents/subagents.md`.

### Design hand-off

New pages, new design elements and Compibert redesigns go to Claude Design as a paste-ready prompt; build from existing components yourself. See `docs/agents/design-handoff.md`.

### Vendored skills

Matt Pocock's skills live in `.claude/skills/` with COMPIES patches, so cloud sessions have them too. Before updating or patching one, read `.claude/skills/README.md`.

### Standing rules

Record new standing rules in this file or `docs/agents/`, never only in auto-memory: cloud sessions see just what's committed.

### Scripting

Script with `node`. The user's Windows machine has only the Python Store alias; install the latest stable Python only when a task really needs it.
