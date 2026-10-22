# COMPIES

COMPIES organises game nights for groups of friends: finding a date, forming teams, picking games, recording results and running an award ceremony. The games themselves are played outside the app.

## People and roles

**User**:
Anyone who has signed in with Discord or Twitch.
_Avoid_: Account, profile (a profile is what a User edits, not the User)

**Platform admin**:
The operator, who grants and revokes the host permission and maintains the game library.
_Avoid_: Admin (ambiguous with the session admin role a Host has)

**Host**:
The User who created a Session and has full rights inside it. Each Session has exactly one Host.
_Avoid_: Organiser, owner, session admin

**Host permission**:
The platform-wide right to create Sessions. Losing it does not stop a User from being the Host of Sessions they already created.
_Avoid_: Host role, canHost (that is a column, not the concept)

**Display name**:
The name a User picks for themselves, shown everywhere in the app; not unique, and independent of their Discord or Twitch name.
_Avoid_: Username, nickname

## Sessions

**Session**:
One game night of a group, from its date poll to its archive.
_Avoid_: Event, game night, lobby, match

**Phase**:
The lifecycle stage a Session is in: draft, date poll, date set, running, finished or archived.
_Avoid_: Status, state

**Invite link**:
The only way for a User to become a Member of a Session; the Host can rotate it, which invalidates the old one.
_Avoid_: Share link, join link

**Session link**:
The stable address of a Session that only its Members can open; it survives rotating the Invite link.
_Avoid_: Session URL, permalink

**Member**:
A User who has joined a Session through its Invite link. The Host is a Member of their own Session.
_Avoid_: Participant, attendee, guest

**Player**:
A Member who is in a Party.
_Avoid_: Competitor, participant

**Spectator**:
A Member in the Stands.
_Avoid_: Viewer, audience

## Date poll

**Date poll**:
The Phase in which members vote on proposed Slots before the Host sets the Date.
_Avoid_: Terminumfrage (UI copy only), survey, scheduling

**Slot**:
A proposed date and time for a Session, offered in its Date poll.
_Avoid_: Option, proposal, Termin

**Vote**:
One User's answer to one Slot: yes, maybe or no (UI: Ja / Wenn nötig / Nein).
_Avoid_: Response, availability

**Best slot**:
The Slot with the most yes Votes, then the most maybe Votes, then the earliest time.
_Avoid_: Winner, recommended slot

**Date**:
The confirmed start time of a Session, set by the Host from a Slot or directly.
_Avoid_: Termin (UI copy only), appointment, start date

**Reschedule**:
The Host moving an already set Date to another fixed time, without a new Date poll.
_Avoid_: Move, postpone

**Reopen**:
The Host withdrawing a set Date so the Session returns to its Date poll (UI: „Neue Terminsuche“).
_Avoid_: Un-confirm, cancel date, reset

## Lobby

**Party**:
One competing unit in a Session: a team in a team format, a single player in free-for-all. A Session has at most 8.
_Avoid_: Side, group

**Bench**:
The zone for members who are not in a Party but may be pulled in. Everyone arriving via the Invite link lands here.
_Avoid_: Waiting room, reserve

**Stands**:
The zone for spectators who will not play (UI: Tribüne).
_Avoid_: Audience, spectators

## App

**Construction page**:
The placeholder shown for every area not built yet in the MVP (UI: Baustelle).
_Avoid_: Coming soon page, placeholder
