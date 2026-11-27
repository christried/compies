# A Deleted User stays as a nameless row; their Events and games go

A User deletes themselves on the Profil page (or the Platform admin or the operator's script does it for them), and the deletion does three different things on purpose:

- **What they hosted is removed outright.** Every Event they host goes for every Member, finished ones included, with its rows and not as a Deleted Event. Their Game library goes with it; an image file goes once no other Host's copy uses it (ADR 0018).
- **What they typed is erased.** Their Messages lose their text like a Message its writer deleted, their Votes go with their Notes, and their Team word leaves the current Team name.
- **The User row stays, emptied.** No Display name, no name or email from the provider, no Profile picture, no provider account, no sign-in session: only the time of the deletion. In a finished Event of another Host they stay a Player of their Party, shown as „Gelöschtes Konto“, because the Winners are the Players at the Finish. In an Event that has not finished they stop being a Member, and what they did there (Activity feed entries, emptied Messages, the Vetoes their Party cast) still points at the emptied row.

The Datenschutzerklärung promises the first two (§ 16); the emptied row lets the third hold without rewriting other people's Events.

Rejected: a full cascade (a finished Event would lose a Player, its Winners would change after the fact, and the feed would lose its actor); keeping finished Events they hosted under a Host „Gelöschtes Konto“ (part of their library would have to stay); a grace period (a second state and a later job, for a wish nobody has voiced).

## Consequences

- A finished Event leaves the Archive of every Member when its Host deletes themselves. The confirmation names the number of Events and says so.
- A Deleted User who signs in again is a new User, without the Host permission (ADR 0002).
- Old Activity feed entries keep the Team name of their moment, the Deleted User's Team word included (ADR 0016).
- Two Deleted Users in one Event look the same.
