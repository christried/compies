---
name: christried-capture-bug
description: Capture a bug report as a bug issue in about two minutes - redacted, a few quick questions, a draft, the user's OK. Use when the user pastes a bug report or asks to note a bug.
---

# Capture a bug

Turn a bug report into a bug issue in about two minutes: what goes wrong, what should happen and where that is documented, how to get there. Finding the cause is the job of whoever picks it up. The rules for a bug issue (title, labels, body, the create call, cloud sessions, what happens when it is picked up) are in `docs/agents/issue-tracker.md` § Bugs.

The user often writes in German, and a pasted report may be in any language. Write the issue and every reply in English, with UI strings in German quotes („Noch eins hinzufügen“).

## 1. Redact

A pasted report usually comes from a Player, so it is that User's data, and the repo is public (`CLAUDE.md` § Personal data). Keep the fault and drop the person: names, handles, email addresses, Discord and Twitch ids, Event titles and slugs, Notes, Votes, chat text, and every log line that carries an id. People become roles („a Host“, „a Member“, „a Player“). A screenshot becomes a sentence describing what it shows.

Done when nothing you will draft can point back to a person or an Event.

## 2. Gather

Take the report from the arguments or the user's message. If there is none, ask "What's broken?" and wait.

A bug issue needs these fields:

- **Observed**: what happens.
- **Expected**: what should happen.
- **Steps**: how to get there.
- **Where**: the page, production or staging, device and width, browser, role (Host, Member, signed out).
- **How often**: every time or sometimes, and since when.
- **Impact**: blocks a game night, annoying (a workaround exists), or cosmetic.

Look these up yourself:

- **Duplicates and regressions**: search the open issues and the closed `bug` issues for the report's key words (`gh issue list --state open --search "<words>" --json number,title`, then the same with `--state closed --label bug`; in a cloud session, the List call of § In a cloud session). An open match makes the draft a comment for that issue, and the user can still ask for a new issue instead. A closed match makes it a regression (§ Bugs).
- **The expected behaviour's source**: the spec or ticket that built the feature, `docs/design_handoff_compies/`, `docs/adr/`, `GLOSSARY.md`. Quote the line with its path or issue number. When nothing documents it and the code does what it was built to do, say the report reads as a missing feature and offer to capture it as an idea (`/christried-capture-idea`).
- **The code**: the component or route behind the fault as `file:line`, and its last commits (`git log --oneline -5 -- <file>`), which name the Release that likely brought the fault in.
- **The version**: production's is the `version` in `main`'s `package.json` (`git show origin/main:package.json`). The tags make a poor source: the old 1.x tags sort above the 0.x ones, and one commit can carry several Release tags.
- **Wording**: name things with the terms of `GLOSSARY.md`.

Then ask one round of at most three questions, only for fields the report and the lookups leave open. The reporter is often out of reach, so take the answers as they come: a field the user cannot answer goes into the draft as „unknown“, and its question goes under **Open questions**.

Done when each field is filled from the report, a lookup or an answer, or is „unknown“ after one question.

## 3. Draft

Write one draft per bug; a report holding several faults gets several drafts. Show them all in one message:

```
Title: <where>: <what goes wrong>
Labels: bug, needs-triage[, urgent]

<what goes wrong, 1–2 sentences>

**Expected:** … (source: `<path>` or #<n>, or „not written down“)
**Steps:** 1. … 2. … (or „unknown“; „not reproduced yet“ until someone has)
**Where:** <page>; <production vX.Y.Z | staging>; <device, width, browser>; <role>
**How often:** …
**Impact:** blocks a game night | annoying | cosmetic
**Code:** `<file:line>`, last changed in <commit or PR>
**Where it came from:** a Player's report from <date> | noted on <date> during a session on <topic>
**Regression of:** #<n>
**Open questions:** …
**Next:** /diagnosing-bugs | /grill-with-docs
```

- **urgent**: when **Where** is production; a Player's report counts as production unless it names staging.
- **Regression of**: only for a regression; leave the line out otherwise.
- **Open questions**: up to three; leave the line out when there are none.
- **Next**: `/diagnosing-bugs` when the expected behaviour is documented, `/grill-with-docs` when it is disputed or „not written down“.

End the message with: "**ja** creates it, **abbrechen** drops it, anything else and I'll change the draft."

## 4. Create

- **ja** / **ok**: create each issue (or comment) as § Bugs describes. With several, add a **Related:** line to each body afterwards, naming the others by number.
- **abbrechen**: drop the drafts.
- Anything else is a correction: apply it and show the drafts again.

Done when every approved draft is an issue (or a comment); the fix, urgent or not, is a later session's (§ Bugs). Reply with the links only, plus, when the report had a screenshot, one line asking the user to add it to the issue on GitHub after checking it for personal data.
