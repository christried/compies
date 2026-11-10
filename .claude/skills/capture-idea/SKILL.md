---
name: capture-idea
description: Capture an idea as an Idea issue for a later grilling, in about two minutes - a few quick questions, a draft, the user's OK. Use when the user asks to note an idea for later.
---

# Capture an idea

Park the user's idea as an Idea issue in about two minutes. This is a **sketch**: a general ask and a surface description of what the user wants. Sharpening it is the job of the grilling that later picks it up. The rules for an Idea issue (title, labels, one idea per issue, the create call, cloud sessions) are in `docs/agents/issue-tracker.md` § Ideas.

The user often writes in German. Write the issue and every reply in English, with UI strings in German quotes („Noch eins hinzufügen“).

## 1. Gather

Take the idea from the arguments or the user's message. If there is none, ask "What's the idea?" and wait.

Then ask one round of at most three questions, each only when the text leaves it open:

1. **What** is different afterwards: what does someone see or do?
2. **Why**: what bugs the user, or what is it for?
3. **Who notices it**: Hosts, Members, everyone, or only the developer?

Take the answers as they come: a vague answer goes into the draft as vague. Done when each of the three is answered or has been asked once.

Look these up yourself:

- **Duplicates**: search the open issues for the idea's key words (`gh issue list --state open --search "<words>" --json number,title`; in a cloud session, the List call of § In a cloud session). On a match, the draft becomes a comment for that issue, and the user can still ask for a new issue instead.
- **Wording**: name things with the terms of `GLOSSARY.md`.

## 2. Draft

Write one draft per idea; a message holding several ideas gets several drafts. Show them all in one message:

```
Title: Idea: <the idea in a few words>
Labels: enhancement, needs-triage

<the idea, 1–3 sentences>

**Why:** …
**Who notices it:** …
**Where it came from:** …
**Open questions:** …
```

- **Where it came from**: from context: the source the user named, or "noted on <date> during a session on <topic>". Leave the line out when there is nothing to say.
- **Open questions**: up to three you noticed while drafting, written down for the grilling. Leave the line out when there are none.
- People appear as roles („a Player“, „a Host“): the repo is public.

End the message with: "**ja** creates it, **abbrechen** drops it, anything else and I'll change the draft."

## 3. Create

- **ja** / **ok**: create each issue as § Ideas describes. With several, add a **Related:** line to each body afterwards, naming the others by number.
- **abbrechen**: drop the drafts.
- Anything else is a correction: apply it and show the drafts again.

Done when every approved draft is an issue (or a comment). Reply with the links only.
