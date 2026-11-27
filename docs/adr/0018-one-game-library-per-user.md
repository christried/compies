# One Game library per User, split by copying

Until 0.15 COMPIES had one platform-wide Game library. From 0.16 every User with the Host permission has their own Game library and nobody else sees it, the Platform admin included: a Host curates it as their own (their notes, their Tags, their archive), which a shared library made a compromise each time.

The split copies rather than shares. A game belongs to the User who created it. Where an Event of another Host used that game (in its Game pool, a Round or a Draw), the migration gave that Host a copy and pointed their Events at it; from then on the two games are independent. An Event only ever refers to games of its own Host's library.

Rejected: one shared library with an owner per game (keeps every compromise), and Events referring to games in another User's library (a Host would depend on a game they cannot see or edit, and its owner archiving or renaming it would change the other Host's Event).

## Consequences

- A User who gets the Host permission starts with an empty library. Sharing a game with another Host is a later feature; it will copy too.
- Tags belong to one library. A word keeps its colour everywhere, because the colour comes from its spelling.
- The Platform admin cannot edit or remove another User's game in the app.
- Copies share the original's image file; an image is only ever replaced by a new upload, never changed in place.
- Two Hosts each having „Counter-Strike 2“ is intended; there is no duplicate check across libraries.
