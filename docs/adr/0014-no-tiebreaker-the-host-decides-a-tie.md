# No Tiebreaker: the Host decides a Tie

The brief (§ 10), the designs (screen 18, `TiebreakerBanner`, stepper step 7, `App Spielrunde ?s=tie`) and the 0.4 stepper planned a **Tiebreaker**: when Parties share first place after the Game count, only they play an extra game from a separate **Tiebreaker pool**, until one wins. We drop it (decided 2026-11-02 in the grilling for 0.8 „Punkte“). When first place is shared once every Round up to the Game count has its Result (a **Tie**), the Host chooses: finish the Event with all tied Parties as winners („Unentschieden beenden“), or raise the Game count by one for another regular Round („Letztes Spiel hinzufügen“). Every Party plays that Round, from the Game pool and in the Event's Selection mode, with Vetoes and the Points table as usual. If first place is still shared afterwards, the same choice comes up again. A Tiebreaker needs a second pool, its own wheel and its own rules for who plays and who may veto. A last regular game reuses everything the Event already has, and ending with several winners is a fair outcome for a game night.

## Consequences

- The Tiebreaker pool goes: the stepper loses its step, „So wird gespielt“ and the settings summary lose its list, and a migration deletes the stored Tiebreaker pool entries of existing Events. A Host can add those games to the Game pool.
- The stepper warns when a Tie is possible (an even Game count, or more than two teams), and its pool recommendation adds one game for the possible last Round.
- An Event can have several winners, so the Award ceremony and the share image (0.9) show every Party on the first rank.
- The designs for screen 18 and `TiebreakerBanner` are not built.
