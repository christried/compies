---
name: christried-tag-review
description: Recurring Tag review of the production Game library — research every game, propose Tags and new Tags, apply what the user approves (#424).
disable-model-invocation: true
---

A joint session: you prepare, the user decides. Tags are a Host's tool for finding games while building a Game pool; Members never see them (GLOSSARY: Tag). The agreed Tags, their meaning and the ones already turned down are in [`VOCABULARY.md`](VOCABULARY.md), the single source of truth for every label you propose.

Work files (the export, your research, the plan) go in your scratchpad, never in the repo: they hold library data, and the repo is public (CLAUDE.md § Personal data). The user approved looking games up online by name for this task.

## 1. Export

You never hold the production `DATABASE_URL` (`docs/agents/delivery.md` § Production data). Ask the user to put it in `.env.prod` at the repo root (git ignores it, and the § names this skill as its one exception) for this run, to delete it when the run ends, and to run:

```
! node --env-file=.env.prod .claude/skills/christried-tag-review/library-tags.mjs export "<scratchpad>/library.json"
```

Done when the file exists and the printed count of games and Tags in use is in front of you. A label in use that is missing from the vocabulary was typed by a Host since the last run: treat it as a candidate in step 3.

## 2. Research every game

For each game, read its notes first: they hold the operator's own setup knowledge (no spectator slot, mods, servers). Then look the game up: its store page (on Steam: genres, Free to Play, „Remote Play Together“, local versus online multiplayer, demo or playtest) and the official site for the launcher and account it needs. A game from an earlier run needs only the facts that change: free-to-play switches, a demo becoming the full game, a new launcher or mode.

Done when every game has its row of proposed Tags, each Tag with its **evidence**: a URL or „notes“. A game you can't pin down gets a question for the user instead of a guess.

## 3. Spot new Tags

While researching, collect properties that several games share, that a Host would filter by while building a pool, and that no vocabulary Tag covers. Propose each with its label (20 characters at most), what it means, its games, why a Host filters by it, and the existing Tag it could be mistaken for. Propose dropping a vocabulary Tag that no game earns. Skip what the library already has a field for: the Price, player counts, Suitabilities („Passt zu“).

## 4. Propose

Present in chat:

1. The games whose Tags change, one table row each: current Tags → proposed, the added and removed ones marked, 8 per game at most (when more fit, keep them in the priority order of `VOCABULARY.md`).
2. The new Tag candidates with their reasoning.
3. Your open questions.
4. The unchanged games, in one line.

The user decides game by game and Tag by Tag. Done when every row and candidate has the user's yes, no or change.

## 5. Record

Write the user's decisions on Tags into `VOCABULARY.md`: an accepted Tag joins its group with its meaning, a turned-down one goes under **Turned down** with the reason and date, so later runs leave it alone.

## 6. Apply

Build the plan from the export: a JSON array of `{ id, name, tagsBefore, add, remove }`, where `tagsBefore` is the game's Tag keys in the export, in order (`library-tags.mjs` documents the format). Ask the user to run the dry run, then the same command with `--apply`:

```
! node --env-file=.env.prod .claude/skills/christried-tag-review/library-tags.mjs "<scratchpad>/tag-plan.json"
```

The script writes all or nothing. When it names a game whose Tags changed since the export, export again and rebuild the plan for those games. Done when it prints `Written: <n> games.`

## 7. Close the run

Comment on #424 with counts only (games reviewed, Tags added and removed, new Tags accepted), no game names. Change the issue title to the month of the next run (about a month on, or what the user names), and remind the user to delete `.env.prod`.
