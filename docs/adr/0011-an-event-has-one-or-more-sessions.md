# An Event has one or more Sessions

The group's first real game night already needs two evenings for its 8+ games, so what a group plays is now an **Event**, played over one or more **Sessions**, each on its own Date. The Event keeps everything a Session owned until now (Host, Invite link, Event link, Members, Parties, Phase, Game count, standings, award ceremony, archive); a Session is only a sitting with a Date. One Date poll per Event serves all its Sessions: Members vote once, the Host sets each Session's Date from a different Slot or directly, and the poll stays open while any Session has no Date. The Event finishes after its last Session once its Game count has been played, never after a set time.

We rename before the MVP release, while no real links or data exist: the `sessions` table becomes `events`, a new `sessions` table holds the sittings, `/s/<slug>` becomes `/e/<slug>`, and the migration turns every existing Session into an Event with one Session. This supersedes ADR 0004's rule that a bare "session" means a game Session (it now means a sitting; a login session is still `authSession`) and renames ADR 0006's Session link to Event link.

## Considered Options

- **One Session with several Dates**: keeps every name, but "Session" would mean both the whole competition and each evening, while each evening needs its own Date, Reschedule and calendar entry.
- **A Date poll per Session**: Members would vote on the same evenings once per Session.
- **A Game count per Session**: evenings rarely go to plan, and the Host already changes the count along the way.
