# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file>`. Write a multi-line body to a file with the Write tool first: a Bash heredoc that writes a file is refused by the guard (`CLAUDE.md` § Scripting).
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`. From Git Bash on Windows `gh issue view` prints nothing: use `gh api repos/christried/compies/issues/<n> --jq .body`, and `.../issues/<n>/comments --jq '[.[].body]'` for the comments.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+). Older `gh`: `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>` (database id, as in **Blocking** below). Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## In a cloud session

Cloud sessions (`CLAUDE_CODE_REMOTE=true`) refuse GraphQL, so every `gh issue …` command above fails with a 403. Use the session's built-in GitHub tools where they cover the operation, or these REST calls (`-F body=@file` reads a multi-line body from a file):

- **Create**: `gh api repos/christried/compies/issues -f title="..." -F body=@body.md -f "labels[]=ready-for-agent"`
- **Read**: `gh api repos/christried/compies/issues/<n>`, comments via `gh api repos/christried/compies/issues/<n>/comments --jq '[.[].body]'`
- **List**: `gh api 'repos/christried/compies/issues?state=open&labels=<label>&per_page=100' --jq '[.[] | select(.pull_request | not) | {number, title, labels: [.labels[].name]}]'` (this endpoint also returns PRs; the `select` drops them)
- **Sub-issue**: the REST call in **Make an issue a sub-issue of a parent** above
- **Comment**: `gh api repos/christried/compies/issues/<n>/comments -F body=@comment.md`
- **Apply / remove a label**: `gh api repos/christried/compies/issues/<n>/labels -f "labels[]=<label>"` / `gh api -X DELETE repos/christried/compies/issues/<n>/labels/<label>`
- **Close**: comment first, then `gh api -X PATCH repos/christried/compies/issues/<n> -f state=closed -f state_reason=completed`
- **Claim**: `gh api repos/christried/compies/issues/<n>/assignees -f "assignees[]=$(gh api user --jq .login)"`

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## Ideas

An idea that isn't grilled yet is an **Idea issue**, never a line in `docs/roadmap.md` (the user, 2026-11-10). The roadmap holds only what a grilling has given a Release. `/capture-idea` files one in about two minutes: a few quick questions, a draft, the user's OK.

- **Title**: `Idea: <the idea in a few words>`. The prefix says what the issue is: a placeholder, not a ticket.
- **Labels**: `enhancement` + `needs-triage`, where `needs-triage` means "not grilled yet". An Idea issue waits for a grilling, not for `/triage`: it is the user's own.
- **Body**: unfinished on purpose. The idea in the user's words, where it came from (a staging review, a game night, a session), and, where known, what it contradicts (`GLOSSARY.md`, an ADR, the design hand-off) and the open questions. Nothing about the app's Users: the repo is public (`CLAUDE.md` § Personal data).
- **One idea per issue**: a note that holds several ideas becomes several issues.
- **Create**: `gh issue create --title "Idea: …" --label enhancement --label needs-triage --body-file body.md`. In a cloud session: the REST call of § In a cloud session with `-f "labels[]=enhancement" -f "labels[]=needs-triage"`.
- **Find**: `gh issue list --state open --label needs-triage --search "Idea in:title" --json number,title,body`. Every release grilling reads them beside the roadmap (`docs/roadmap.md`).
- **Picked up**: a grilling that takes an idea into a spec closes the Idea issue with a link to the spec, or rewrites it into one of the spec's tickets (new title, `ready-for-agent` instead of `needs-triage`), as #38 became 0.10-8. An idea too small for a spec is grilled with `/grill-with-docs` and built in the same session with `/implement`, or rewritten into a `ready-for-agent` ticket. An idea the user drops is closed as not planned (`gh issue close <n> --reason "not planned"`), with the reason in a comment.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it as in **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (see **Make an issue a sub-issue of a parent**). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed. A ticket added to a spec after `/to-tickets` gets its edges in both directions: what it waits on, and every existing ticket that builds on the modules it changes.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
