# A Deleted User stays as a nameless row; their Events and games go

Decided on 2026-11-20 in the grilling for 0.21 „Profil und Konto“ (Idea issue #681). Until 0.21 a User could not be deleted at all: every reference to a User blocked it, and a test pinned that as the rule. From 0.21 a User deletes themselves on the Profil page, and the deletion does three different things on purpose:

- **What they hosted is removed outright.** Every Event they host goes for every Member, finished ones included, with its rows and not as a Deleted Event. Their Game library goes with it; an image file goes once no other Host's copy uses it (ADR 0018).
- **What they typed is erased.** Their Messages lose their text like a Message its writer deleted, their Votes go with their Notes, and their Team word leaves the current Team name.
- **The User row stays, emptied.** No Display name, no name or email from the provider, no Profile picture, no provider account, no sign-in session: only the time of the deletion. In a finished Event of another Host they stay a Player of their Party, shown as „Gelöschtes Konto“, because the Winners are the Players at the Finish. In an Event that has not finished they stop being a Member, and what they did there (Activity feed entries, emptied Messages, the Vetoes their Party cast) still points at the emptied row.

The Datenschutzerklärung already promised the first two (§ 16: Events, Votes and Notes last as long as the account; the Chat's Messages are removed with it). The emptied row is what lets the third hold without rewriting other people's Events.

## Considered Options

- **A full cascade, every row of the User gone**: the simplest promise, but a finished Event would lose a Player from a Party, its Winners would change after the fact, and the Activity feed would lose its actor.
- **Finished Events they hosted stay, under a Host „Gelöschtes Konto“**: every Member keeps them in their Archive, but the played Rounds need the Host's games to stay, so a deleted User's library would have to be kept in part and explained in the Datenschutzerklärung. A Host can already remove any of their Events for everyone with „Event löschen“, so removing them here gives no new power.
- **A grace period before the deletion**: a second state and a job that runs later, for a wish nobody has voiced.

## Consequences

- A finished Event leaves the Archive of every Member when its Host deletes themselves. The confirmation names the number of Events and says so.
- A Deleted User who signs in again is a new User. The Host permission comes back with them, because it hangs on the provider account id in the operator's list (ADR 0002), which the app cannot change; the id stays there until they ask the operator to remove it.
- Old Activity feed entries keep the Team name of their moment, the Deleted User's Team word included (ADR 0016).
- Two Deleted Users in one Event look the same.
- The operator runs the same deletion by script for a User who asks by message and cannot sign in.
