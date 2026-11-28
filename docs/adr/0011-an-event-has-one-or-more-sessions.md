# An Event has one or more Sessions

What a group plays is an **Event**, played over one or more **Sessions**, each on its own Date. The Event owns the Host, Invite link, Event link, Members, Parties, Phase, Game count, Standings, Award ceremony and Archive entry; a Session is only a sitting with a Date. One Date poll per Event serves all its Sessions: Members vote once, the Host sets each Session's Date from a different Slot or directly, and the poll stays open while any Session has no Date. The Event finishes after its last Session once its Game count has been played, never after a set time.

In the schema, `events` holds the Events and `sessions` the sittings; addresses are `/e/<slug>`. A bare "session" in code means a sitting; a login session is `authSession` (ADR 0004). ADR 0006's Session link is the Event link.

Rejected: one Session with several Dates ("Session" would mean both the competition and each evening, while each evening needs its own Date, Reschedule and calendar entry); a Date poll per Session (Members would vote on the same evenings several times); a Game count per Session (evenings rarely go to plan, and the Host already changes the count along the way).
