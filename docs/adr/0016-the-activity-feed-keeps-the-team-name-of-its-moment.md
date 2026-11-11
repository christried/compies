# The Activity feed keeps the Team name of its moment

Decided on 2026-11-10 in the grilling for 0.12 „Eventseite“ (#425). Until 0.12 a Team name froze at the first Session start, so one name per team was enough for the whole Event, and the feed stored only team positions and looked the name up when read. From 0.12 Players change their Team words until the Finish. Each Activity feed entry now stores the Team name every Party it names had when the entry was written, and shows it with the Team colour's mark so a renamed team stays recognisable. Everything that is not a log (the Standings, the Spielverlauf, the Round cards, the party hat, the Award ceremony, the Winners, the Share image) shows the current name, which after the Finish is the final one. The user wants old entries to read as they were, even where that confuses: it is part of the fun.

This is the opposite of the Display name, which shows live everywhere, history included (decided for 0.11 „Profil“). A reader who knows that rule will expect the same here; this ADR says why not.

## Considered Options

- **Live lookup, as for Display names**: nothing new stored and no change to the Datenschutzerklärung, but a later name would rewrite every earlier entry, and the user asked for the opposite.
- **Freeze per Session instead of per Event**: fewer names to keep, but still a freeze, which is the thing 0.12 removes.

## Consequences

- A Team word outlives its Player leaving the team, inside the feed entries written while it was part of the name. The Datenschutzerklärung's promise „Ein Teamwort wird gelöscht, sobald du dein Team verlässt“ changes with 0.12.
- Entries written before 0.12 store no name and keep resolving it when read.
- Moves, resets and Bonus Vetoes, which named a Party by its colour name on purpose before 0.12, name it by its Team name of the moment like every other entry.
