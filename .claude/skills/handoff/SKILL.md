---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS (`$TMPDIR`, else `/tmp`; `%TEMP%` on Windows) - not the current workspace.

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

**COMPIES:** when `/handoff` is called while subagents run, the orchestrator pulls them back first: each one stops, commits and pushes what it has to its branch, and replies with the branch, the head commit, what is done and what is left. The handoff is written once, after every reply, with one row per subagent; a silent one is recorded as silent, with its worktree path. The next steps quote the order of the spec's § Delivery or of `docs/agents/release.md`, and do not paraphrase it: in 0.12 one handoff's „next“ row contradicted the spec on when the integration PR leaves draft. A question that is the operator's is asked in the chat before the handoff is written, so the next session does not begin by interrupting them. The rules and the operator's override are in `docs/agents/subagents.md` § Supervision.
