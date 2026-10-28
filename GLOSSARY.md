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
The User who created an Event and has full rights inside it. Each Event has exactly one Host.
_Avoid_: Organiser, owner, session admin

**Host permission**:
The platform-wide right to create Events and to see the Game library. Losing it does not stop a User from being the Host of Events they already created.
_Avoid_: Host role, canHost (that is a column, not the concept)

**Display name**:
The name a User picks for themselves, shown everywhere in the app; not unique, and independent of their Discord or Twitch name.
_Avoid_: Username, nickname

## Events

**Event**:
One competition of a group, from its Date poll to its archive, played over one or more Sessions.
_Avoid_: Tournament, game night, lobby, match

**Session**:
One sitting of an Event on one Date. Every Event has at least one; the Host can add and remove Sessions until the Event is finished, and a Session that has started stays. Sessions are numbered in the order of their Dates.
_Avoid_: Game night, evening, round

**Game count**:
The number of games an Event runs for, changeable by the Host at any time. The Event finishes after its last Session once that many games (plus a tiebreaker if needed) have been played, never after a set time. The Session that plays the last game becomes the last one, and later Sessions are removed; if the last Session ends short of the count, the Event stays open until the Host adds a Session or lowers the count.
_Avoid_: Rounds, games per Session

**Phase**:
The lifecycle stage an Event is in: draft, date poll, date set, running, finished or archived. Before it runs, an Event is in date poll while any of its Sessions has no Date, and in date set once all have one.
_Avoid_: Status, state

**Invite link**:
The only way for a User to become a Member of an Event; the Host can rotate it, which invalidates the old one.
_Avoid_: Share link, join link

**Event link**:
The stable address of an Event that only its Members can open; it survives rotating the Invite link.
_Avoid_: Session link, Event URL, permalink

**Member**:
A User who has joined an Event through its Invite link. The Host is a Member of their own Event.
_Avoid_: Participant, attendee, guest

**Player**:
A Member who is in a Party.
_Avoid_: Competitor, participant

**Spectator**:
A Member in the Stands.
_Avoid_: Viewer, audience

## Date poll

**Date poll**:
The voting on proposed Slots from which the Host sets the Dates of an Event's Sessions. Each Event has one; it is open while any Session has no Date, also in a running Event, and gives the Phase date poll its name.
_Avoid_: Terminumfrage (UI copy only), survey, scheduling

**Slot**:
A proposed date and time in an Event's Date poll, from which the Host can set a Session's Date. A Slot is open until it becomes a Date; a Reopen makes it open again. The Host can change an open Slot's date and time, and its Votes stay.
_Avoid_: Option, proposal, Termin

**Vote**:
One User's answer to one Slot: yes, maybe or no (UI: Ja / Meh / Nein), optionally with a Note.
_Avoid_: Response, availability

**Note**:
A short free text a Member adds to their Vote, such as a time limit or a counter-offer; it belongs to the Vote, lives and dies with it, and every Member can read it (UI: Anmerkung).
_Avoid_: Comment, remark, reason

**Has voted**:
A Member has voted once they have a Vote on every open Slot that still lies in the future; Slots that have passed or became a Date do not count, and with no such Slot left nobody has voted.
_Avoid_: Done, complete, responded

**Best slot**:
The open future Slot with the most yes Votes, then the most maybe Votes, then the earliest time.
_Avoid_: Winner, recommended slot

**Date**:
The confirmed start time of a Session, set by the Host from a Slot or directly.
_Avoid_: Termin (UI copy only), appointment, start date

**Reschedule**:
The Host moving a Session's set Date to another fixed time, without the Date poll.
_Avoid_: Move, postpone

**Reopen**:
The Host withdrawing a Session's set Date so the Session gets its Date from the Date poll again (UI: „Neue Terminsuche“).
_Avoid_: Un-confirm, cancel date, reset

## Lobby

**Party**:
One competing unit in an Event: a team in a team format, a single player in free-for-all. An Event has at most 8.
_Avoid_: Side, group

**Bench**:
The zone for members who are not in a Party but may be pulled in. Everyone arriving via the Invite link lands here.
_Avoid_: Waiting room, reserve

**Stands**:
The zone for spectators who will not play (UI: Tribüne).
_Avoid_: Audience, spectators

## Game selection

**Format**:
How an Event forms its Parties: Teams (2 to 8 teams of equal size) or free-for-all (every Player is their own Party).
_Avoid_: Mode, game type

**Game pool**:
The games an Event's Host picked from the Game library for drawing, picking and banning.
_Avoid_: Game list, playlist

**Selection mode**:
How an Event determines its next game, fixed for the whole Event. Whatever the mode, the Host can set the next game directly.
_Avoid_: Format, draw mode

**Lucky Wheel**:
The Selection mode in which the Host spins a wheel of games from the Game pool; every game the wheel draws leaves it, whether it is played or vetoed (UI: Glücksrad).
_Avoid_: Wheel of fortune, roulette, random pick

**Hidden wheel**:
A Lucky Wheel option under which only the Host knows which games are on the wheel; everyone else sees placeholder names until a game is drawn.
_Avoid_: Blind wheel, secret wheel

**Veto**:
A Party's rejection of a game the wheel has just drawn, cast within the veto window; the game leaves the wheel and the wheel spins again. Any Player of the Party can cast any of its Vetoes, a Party casts at most one per drawn game, and a cast Veto cannot be withdrawn.
_Avoid_: Ban (a ban removes a game before it is drawn), skip, reject

**Veto allowance**:
The number of Vetoes each Party has for the whole Event, the same for every Party and set by the Host.
_Avoid_: Vetoes per player, veto budget

## App

**Construction page**:
The placeholder shown for every area not built yet in the MVP (UI: Baustelle).
_Avoid_: Coming soon page, placeholder

**Game library**:
The platform-wide collection of games that Hosts fill their Events from; only Users with the Host permission and the Platform admin see it (UI: Bibliothek).
_Avoid_: Game list, catalogue

**Release**:
A version of COMPIES that reaches Users, numbered by semantic versioning: a new feature raises the minor number, fixes alone raise the patch number.
_Avoid_: Deploy, update, build

**Changelog**:
The public list of Releases, newest first, saying in plain words what changed for Users; changes Users cannot see are left out (UI: Neuigkeiten).
_Avoid_: Release notes, news, patch notes

**Compibert**:
The app's mascot; it appears on screen but is never named in UI copy.
_Avoid_: CompiBeard, Compi, mascot
