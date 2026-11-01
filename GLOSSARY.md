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
One sitting of an Event on one Date. Every Event has at least one; the Host can add and remove Sessions until the Event is finished, and a Session that has started stays and keeps its Date. Sessions that have started are numbered first, in the order they started, then the dated ones that have not started by Date (a Session still waiting for a Date keeps no number, but the page shows it with the number it will get, after the dated ones); once a Session has started, its number never changes.
_Avoid_: Game night, evening, round

**Running Session**:
The Session the Host has started and not yet ended; an Event has at most one. The Host starts the earliest dated Session that has not started, and the first start makes the Event running (UI: „Session starten“, „Session beenden“).
_Avoid_: Active session, live session, game night

**Game count**:
The number of Rounds an Event runs for, changeable by the Host at any time but never below the Rounds already started. The Event finishes after its last Session once that many Rounds have their result (plus a Tiebreaker if needed), never after a set time. The Session that plays the last Round becomes the last one, and later Sessions are removed; if the last Session ends short of the count, the Event stays open until the Host adds a Session or lowers the count.
_Avoid_: Games per Session, number of games

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
One competing unit in an Event: a team in a team format, a single player in free-for-all. An Event has at most 8, and a Party lasts for the whole Event, across all its Sessions.
_Avoid_: Side, group

**Team size**:
The number of slots per team in the Teams format, set by the Host and changeable while the Event runs, but never below the number of Players in the fullest team that remains (lowering the team count sends the Players of the removed teams to the Bench). A team may have fewer Players than its Team size; a game starts only when all teams have the same number of Players.
_Avoid_: Team capacity, players per team

**Game board**:
The view of an Event's teams, Bench and Stands, where Members take their place; Players move only themselves, the Host moves everyone (UI: Spielbrett).
_Avoid_: Lobby, board view, waiting room

**Team choice**:
The time in which Players may join and leave teams themselves: from when the Event has its settings and a Session has a Date until the first Session starts. After that only the Host moves people into or out of teams; Bench and Stands stay free for everyone.
_Avoid_: Team selection, draft, lock-in

**Team colour**:
The colour, symbol and pattern a team has by its position in the Event, never chosen.
_Avoid_: Team theme

**Team word**:
The one word (at most 12 characters, no spaces) a Player adds to their team's name; it leaves the name when the Player leaves the team (UI: Teamwort).
_Avoid_: Nickname, tag

**Team name**:
A team's Team words in the order their Players joined the team, or its Team colour's name while it has none. It freezes when the first Session starts; afterwards the Host can only reset it to the colour name.
_Avoid_: Team title, label

**Online**:
A Member is online while they have the Event open in at least one tab.
_Avoid_: Present, active, connected

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

**Host pick**:
The Selection mode in which the Host sets every next game (UI: Host-Wahl).
_Avoid_: Admin pick, Admin-Wahl (Admin means the Platform admin)

**Hidden wheel**:
A Lucky Wheel option under which only the Host knows which games are on the wheel; everyone else learns how many there are only once the wheel is on screen, sees placeholder names until a game is drawn, and never learns the games that were not drawn.
_Avoid_: Blind wheel, secret wheel

**Pool preview**:
Whether Members other than the Host see an Event's Game pool and Tiebreaker pool before the games come up; the Host chooses it, and under a Hidden wheel it is always off. With it off, Members neither see the games nor learn how many there are; they meet them only on the Lucky Wheel or when the Host sets one (UI: „Pool vorher zeigen“).
_Avoid_: Pool visibility, open pool

**Veto**:
A Party's rejection of a game the wheel has just drawn, or that the Host has set and allowed a Veto on, cast within the veto window; the game leaves the Game pool, and the wheel or the Host determines another. Any Player of the Party can cast any of its Vetoes, a Party casts at most one per drawn game, and a cast Veto cannot be withdrawn.
_Avoid_: Ban (a ban removes a game before it is drawn), skip, reject

**Veto allowance**:
The number of Vetoes each Party has for the whole Event, the same for every Party and set by the Host. Bonus Vetoes come on top.
_Avoid_: Vetoes per player, veto budget

**Bonus Veto**:
A Veto the Host grants one Party on top of the Veto allowance, to make up for something that went wrong or to favour it over a Party being penalised. The Host never takes a Veto away.
_Avoid_: Extra veto, refund, penalty veto

**Tiebreaker**:
An extra game after the Game count, played only by the Parties tied for first place and drawn by a Lucky Wheel from the Tiebreaker pool; it repeats until one Party wins.
_Avoid_: Decider, overtime, sudden death

**Tiebreaker pool**:
The games an Event keeps apart for the Tiebreaker only.
_Avoid_: Backup pool

**Suitability**:
What kind of play a game in the Game library works for: Teams, free-for-all or one against one, any number of them (UI: Passt zu). One against one is a Suitability, not a Format: such an Event is Teams with two teams of one.
_Avoid_: Format (an Event has a Format, a game has Suitabilities), game mode

**Game notes**:
The free text on a game in the Game library, such as its settings, warm-up and win condition; the game's editors write it, and Members read it once they may know the game (UI: Notizen).
_Avoid_: Note (a Note belongs to a Vote), description, rules

**Activity feed**:
The Event's automatic log of what happened, with times, readable by every Member; it never names a game before everyone may know it (UI: Aktivität).
_Avoid_: History, log, timeline

**Award ceremony**:
The show that closes a finished Event, started by the Host and seen by every Member at the same moment; the Host can start it again (UI: Siegerehrung).
_Avoid_: Ceremony screen, finale, results screen

## During a Session

**Round**:
One of the games an Event plays. It begins with a spin or with the Host setting a game, keeps going through vetoed draws until no Veto stops its game, and ends with its result; if the Host puts its game back first, the Round is gone. Only one Round at a time is being drawn, but several can wait for their result, across Sessions too, and their results can be entered in any order. A Round gets its number („Spiel 3“) when its result is entered, and an Event never starts more Rounds than its Game count, apart from the Tiebreaker.
_Avoid_: Match, game (alone), Session

**Coin flip**:
A coin the Host tosses at any time during a running Session; the server decides the side, and every Member sees the same toss at the same moment (UI: Münzwurf).
_Avoid_: Coin toss, random pick

**Countdown**:
A time the Host sets and starts that runs down to zero for every Member at the same moment, for games played against the clock.
_Avoid_: Timer, stopwatch (it never counts up)

## App

**Construction page**:
The placeholder shown for every area not built yet in the MVP (UI: Baustelle).
_Avoid_: Coming soon page, placeholder

**Game library**:
The platform-wide collection of games that Hosts fill their Events from; only Users with the Host permission and the Platform admin see it (UI: Bibliothek).
_Avoid_: Game list, catalogue

**Release**:
A version of COMPIES that reaches Users, numbered by semantic versioning: a new feature raises the minor number, fixes alone raise the patch number. Releases count from 0.1 while COMPIES is being built; 1.0 is the Release the operator declares ready.
_Avoid_: Deploy, update, build

**Changelog**:
The public list of Releases, newest first, saying in plain words what changed for Users; changes Users cannot see are left out (UI: Neuigkeiten).
_Avoid_: Release notes, news, patch notes

**Compibert**:
The app's mascot; it appears on screen but is never named in UI copy.
_Avoid_: CompiBeard, Compi, mascot
