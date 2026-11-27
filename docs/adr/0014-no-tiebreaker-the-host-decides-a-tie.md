# No Tiebreaker: the Host decides a Tie

The brief and the designs (screen 18, `TiebreakerBanner`, a stepper step) planned a **Tiebreaker**: Parties sharing first place after the Game count play an extra game from a separate **Tiebreaker pool**. We drop it. When first place is shared once every Round up to the Game count has its Result (a **Tie**), the Host chooses: finish the Event with all tied Parties as winners („Unentschieden beenden“), or raise the Game count by one for another regular Round („Letztes Spiel hinzufügen“). Every Party plays that Round, from the Game pool and in the Event's Selection mode, with Vetoes and the Points table as usual; if first place is still shared afterwards, the same choice comes up again. A Tiebreaker would need a second pool, its own wheel and its own rules for who plays and who may veto; a last regular game reuses everything the Event already has.

## Consequences

- There is no Tiebreaker pool; a migration deleted the stored entries.
- The stepper warns when a Tie is possible (an even Game count, or more than two teams), and its pool recommendation adds one game for the possible last Round.
- An Event can have several winners, so the Award ceremony and the Share image show every Party on the first rank.
- The designs for screen 18 and `TiebreakerBanner` are not built.
