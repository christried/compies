# The Activity feed keeps the Team name of its moment

Players change their Team words until the Finish. Each Activity feed entry stores the Team name every Party it names had when the entry was written, and shows it with the Team colour's mark so a renamed team stays recognisable. Everything that is not a log (the Standings, the Spielverlauf, the Round cards, the party hat, the Award ceremony, the Winners, the Share image) shows the current name, which after the Finish is the final one. Old entries read as they were, even where that confuses: it is part of the fun.

This is the opposite of the Display name, which shows live everywhere, history included.

Rejected: a live lookup as for Display names (a later name would rewrite every earlier entry), and freezing the name per Session (still a freeze).

## Consequences

- A Team word outlives its Player leaving the team, inside the feed entries written while it was part of the name; the Datenschutzerklärung says so.
- Entries written before 0.12 store no name and keep resolving it when read.
- Moves, resets and Bonus Vetoes name a Party by its Team name of the moment like every other entry.
