# COMPIES

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on christried/compies (via `gh`). An idea that isn't grilled yet is an `Idea: …` issue (`enhancement`, `needs-triage`), never a roadmap line. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Roadmap

Which release comes next and what each one holds: `docs/roadmap.md`. It replaces the 1.0 ticket order in the design hand-off.

### Release workflow

Changelog lines and the version cut: `CHANGELOG.md` + `package.json`. See `docs/agents/release.md`.

### Delivery workflow

Set auto-merge on PRs into `staging` yourself; merges into `main` and production migrations wait for the user's approval. Also covers verifying and closing issues, branch cleanup, and GitHub from a cloud session (no `gh pr`/`gh issue` there). See `docs/agents/delivery.md`.

### Subagents

Pass `model` and `effort: "high"` on every spawn: `sonnet` for the harder half of this repository's tasks and for reviewers, `haiku` for the easier half. See `docs/agents/subagents.md`. `/implement-spec-max` is `/implement-spec` with every subagent on `fable`, or on `opus` or `sonnet` at high effort, by how hard its task is.

### Design hand-off

New pages, new design elements and Compibert redesigns go to Claude Design as a paste-ready prompt; build from existing components yourself. See `docs/agents/design-handoff.md`.

### Vendored skills

Matt Pocock's skills live in `.claude/skills/` with COMPIES patches, so cloud sessions have them too. Before updating or patching one, read `.claude/skills/README.md`.

### Standing rules

Record new standing rules in this file or `docs/agents/`, never only in auto-memory: cloud sessions see just what's committed.

### Personal data

Never send the operator's personal data or any data of the app's Users (names, email addresses, Discord/Twitch ids, Votes, Notes, anything from a database or a log) outside the app without the user's explicit approval for that case. Outside includes GitHub (the repo is public: issues, PRs, commits and committed docs), request headers, URLs and payloads to third-party services, Claude Design prompts and screenshots. Already published, and fine to repeat: what the Impressum and the Datenschutzerklärung state.

### Scripting

Script with `node`. A script of more than one line goes to a file (Write tool) and runs with `node <file>`: inline `node -e` breaks on an apostrophe and a Bash heredoc on a backtick. An edit of a Markdown file goes through the Edit tool or a node script file: `sed -i` with a `#` in the pattern, a `printf` with backticks and `sed -i "${L}d"` with an empty `L` each broke a file in 0.10. A background command is its own call: a Bash list that ends in `&` backgrounds the whole list. The user's Windows machine has only the Python Store alias; install the latest stable Python only when a task really needs it.
