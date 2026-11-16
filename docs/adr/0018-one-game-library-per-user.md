# One Game library per User, split by copying

Decided on 2026-11-16 in the grilling for 0.16 „Bibliothek“ (Idea issue #455). Until 0.15 COMPIES had one platform-wide Game library, as the product brief asked (§15, „Global“): every User with the Host permission saw every game, only its creator and the Platform admin edited it, and any Host could put any game into their Game pool. From 0.16 every User with the Host permission has their own Game library and nobody else sees it, the Platform admin included. The operator wants a library a Host curates as their own (their notes, their Tags, their archive), and a shared one made every one of those a compromise: Game notes that all Hosts read, one Tag vocabulary for everyone, no way to put a game away without taking it from the others.

The split copies rather than shares. A game belongs to the User who created it. Where an Event of another Host uses that game (in its Game pool, a Round or a Draw), the migration gives that Host a copy and points their Events at it; from then on the two games are independent. So an Event only ever refers to games of its own Host's library.

## Considered Options

- **One shared library with an owner per game, and texts that say „deine Bibliothek“**: no migration, but it keeps every compromise above and only hides it.
- **A split without copies, where an Event may refer to a game of another User's library**: no duplicated rows, but a Host would then depend on a game they cannot see or edit, and its owner archiving or renaming it would change the other Host's Event.

## Consequences

- A User who gets the Host permission after the split starts with an empty library. Sharing a game with another Host is a later feature; it will copy too.
- Tags split with the library: a Tag exists only on the games of one library. A word keeps its colour everywhere, because the colour comes from its spelling.
- The Platform admin can no longer edit or remove another User's game in the app. A removal request is handled by the operator outside the app.
- The copies share the original's image file; an image is only ever replaced by a new upload, never changed in place.
- The brief's duplicate check across the library loses its purpose: two Hosts having „Counter-Strike 2“ each is now intended.
