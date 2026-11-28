# COMPIES

COMPIES organises game nights for groups of friends: finding a date, forming teams, picking games, recording results and running an award ceremony. The games themselves are played outside the app.

## People and roles

**User**:
Anyone who has signed in with Discord or Twitch.
_Avoid_: Account (UI copy says „Konto“ only where a User deletes theirs), profile (a profile is what a User edits, not the User)

**Platform admin**:
The operator, who grants and revokes the Host permission, removes another User's uploaded Profile picture and deletes another User; nobody gains or loses this role in the app, and a Platform admin always has the Host permission. They see a row for every Event, Deleted Events included, but open only the Events they are a Member of, and have no rights over another User's Game library or inside an Event (UI: Admin).
_Avoid_: Admin (ambiguous with the session admin role a Host has)

**Host**:
The User who created an Event and has full rights inside it. Each Event has exactly one Host.
_Avoid_: Organiser, owner, session admin

**Host permission**:
The platform-wide right to create Events and to have a Game library, granted and taken by the Platform admin (UI: „Darf hosten“). Losing it does not stop a User from hosting the Events they already created; their Game library is hidden but stays stored and returns with the permission.
_Avoid_: Host role, canHost (that is a column, not the concept)

**Display name**:
The name a User picks for themselves and can change at any time, shown everywhere in the app; not unique, and independent of their Discord or Twitch name. A change shows in everything that already happened too.
_Avoid_: Username, nickname

**Profile picture**:
The round picture shown next to a User's Display name: the one they uploaded, else their picture at Discord or Twitch, else their initial. Anyone who has its address can load it, signed in or not (UI: Profilbild).
_Avoid_: Avatar, user image, photo

**Deleted User**:
A User removed for good, by themselves or by the Platform admin; signing in again makes a new User. The Events they hosted and their Game library are removed outright; in a finished Event of another Host they stay a Player of their Party without a name or picture, and everything they typed is gone (ADR 0020; UI: „Konto löschen“, „Gelöschtes Konto“).
_Avoid_: Deleted account, deactivated User, banned User, anonymous User

## Events

**Event**:
One competition of a group, from its Date poll to its Finish, played over one or more Sessions.
_Avoid_: Tournament, game night, lobby, match

**Session**:
One sitting of an Event on one Date. Every Event has at least one, and a Session that has started stays and keeps its Date. Started Sessions are numbered first, in the order they started, then dated ones by Date; once a Session has started, its number never changes.
_Avoid_: Game night, evening, round

**Running Session**:
The Session the Host has started and not yet ended; an Event has at most one. The Host starts the earliest dated Session that has not started, and the first start makes the Event running (UI: „Session starten“, „Session beenden“).
_Avoid_: Active session, live session, game night

**Game count**:
The number of Rounds an Event runs for, changeable by the Host until the Finish but never below the Rounds already started. The Event never finishes after a set time; if the last Session ends short of the count, the Event stays open until the Host adds a Session or lowers the count.
_Avoid_: Games per Session, number of games

**Phase**:
The lifecycle stage an Event is in: draft, date poll, date set, running or finished. Before it runs, an Event is in date poll while any Session has no Date, and in date set once all have one.
_Avoid_: Status, state, archived (no Event is ever archived; an Archived game is a game)

**Invite link**:
The only way for a User to become a Member of an Event; the Host can rotate it, which invalidates the old one.
_Avoid_: Share link, join link

**Event link**:
The stable address of an Event that only its Members can open; it survives rotating the Invite link.
_Avoid_: Session link, Event URL, permalink

**Deleted Event**:
An Event its Host removed for good: it leaves Home for every Member at once, its links lead nowhere, and no User can bring it back; its data stays stored until the operator removes it (UI: „Event löschen“).
_Avoid_: Archived (an archive is readable), cancelled, closed

**Member**:
A User who has joined an Event through its Invite link; the Host is a Member of their own Event. A Member cannot leave by themselves; the Host can remove any other Member from an Event that has not finished, which takes their Seat, Team word and Votes, and they can join again through the current Invite link (UI: Teilnehmende; „Aus dem Event entfernen“).
_Avoid_: Participant, attendee, guest, kick, ban (a ban is about a game, and no User is banned from an Event)

**Player**:
A Member who is in a Party (UI: Spielende).
_Avoid_: Competitor, participant

## Date poll

**Date poll**:
The voting on proposed Slots from which the Host sets the Dates of an Event's Sessions. Each Event has one; it is open while any Session has no Date, also in a running Event.
_Avoid_: Terminumfrage (UI copy only), survey, scheduling

**Slot**:
A proposed date and time in an Event's Date poll, open until it becomes a Date (a Reopen makes it open again). The UI never calls it „Slot“: that UI word means a Seat.
_Avoid_: Option, proposal, Termin

**Vote**:
One User's answer to one Slot: yes, maybe or no (UI: Ja / Meh / Nein), optionally with a Note.
_Avoid_: Response, availability

**Note**:
A short free text a Member adds to their Vote; it lives and dies with the Vote, and every Member can read it (UI: Anmerkung).
_Avoid_: Comment, remark, reason

**Has voted**:
A Member has voted once they have a Vote on every open Slot that still lies in the future; with no such Slot left nobody has voted (UI: „haben vollständig abgestimmt“).
_Avoid_: Done, complete, responded

**Best slot**:
The open future Slot with the most yes Votes, then the most maybe Votes, then the earliest time.
_Avoid_: Winner, recommended slot

**Date**:
The confirmed start time of a Session, set by the Host from a Slot or directly (UI: „Termin fixieren“, never „festlegen“).
_Avoid_: Termin (UI copy only), appointment, start date

**Reschedule**:
The Host moving a Session's set Date to another fixed time, without the Date poll.
_Avoid_: Move, postpone

**Reopen**:
The Host withdrawing a Session's set Date so the Session gets its Date from the Date poll again (UI: „Neue Terminsuche“).
_Avoid_: Un-confirm, cancel date, reset

## Lobby

**Party**:
One competing unit in an Event: a team in a team format, a single player in free-for-all. An Event has at most 8, and a Party lasts for the whole Event.
_Avoid_: Side, group

**Team size**:
The number of Seats per team in the Teams format, changeable while the Event runs but never below the number of Players in the fullest remaining team. A game starts only when all teams have the same number of Players.
_Avoid_: Team capacity, players per team

**Seat**:
One place in a team on the Game board, filled by a Player or free (UI: Slot).
_Avoid_: Platz (a Place is inside a Result), spot, position

**Game board**:
The view of an Event's teams and its Stands, where Members take their place; Players move only themselves, the Host moves everyone (UI: Spielbrett).
_Avoid_: Lobby, board view, waiting room

**Team choice**:
The time in which Players may join and leave teams themselves: from when the Event has its settings and a Session has a Date until the first Session starts.
_Avoid_: Team selection, draft, lock-in

**Team colour**:
The colour, symbol and pattern a team has by its position in the Event, never chosen.
_Avoid_: Team theme

**Team word**:
The one word (at most 12 characters, no spaces) a Player adds to their team's name, changeable until the Finish; it leaves the name when the Player leaves the team (UI: Teamwort).
_Avoid_: Nickname, tag

**Team name**:
A team's Team words in the order their Players joined, or its Team colour's name while it has none; it changes with its words until the Finish. The Activity feed keeps the Team name of each entry's moment (ADR 0016); everything else shows the current one.
_Avoid_: Team title, label

**Online**:
A Member is online while they have the Event open in at least one tab.
_Avoid_: Present, active, connected

**Stands**:
The one zone for every Member who is not in a Party; everyone arriving via the Invite link lands here (UI: Tribüne).
_Avoid_: Bench, Bank, waiting room, audience, Spectator (a Member on the Stands may still play)

## Game selection

**Format**:
How an Event forms its Parties: Teams (2 to 8 teams of equal size) or free-for-all (every Player is their own Party).
_Avoid_: Mode, game type

**Game pool**:
The games an Event's Host picked from their Game library for drawing, picking and banning.
_Avoid_: Game list, playlist

**Selection mode**:
How an Event determines its next game, fixed for the whole Event. Whatever the mode, the Host can set the next game directly.
_Avoid_: Format, draw mode

**Lucky Wheel**:
The Selection mode in which the Host spins a wheel of games from the Game pool; every game the wheel draws leaves it, played or vetoed (UI: Glücksrad).
_Avoid_: Wheel of fortune, roulette, random pick

**Host pick**:
The Selection mode in which the Host sets every next game (UI: Host-Wahl).
_Avoid_: Admin pick, Admin-Wahl (Admin means the Platform admin)

**Hidden wheel**:
A Lucky Wheel option under which only the Host knows which games are on the wheel; everyone else learns how many there are only once the wheel is on screen and sees placeholder names until a game is drawn. The Host can uncover the wheel once every Round up to the Game count has its Result, while the Session still runs, and from then on it is a visible wheel (UI: „Pseudo-Games“ for the option; „verdeckt“; „Rad aufdecken“).
_Avoid_: Blind wheel, secret wheel

**Pool preview**:
Whether Members other than the Host see an Event's Game pool, and how many games it has, before the games come up; the Host chooses it, and under a Hidden wheel it is always off (UI: „Pool vorher zeigen“).
_Avoid_: Pool visibility, open pool

**Veto**:
A Party's rejection, within the Veto window, of a game the wheel has just drawn or the Host has set and allowed a Veto on; the game leaves the Game pool. Any Player of the Party can cast it, a Party casts at most one per drawn game, and a cast Veto cannot be withdrawn.
_Avoid_: Ban (a ban removes a game before it is drawn), skip, reject

**Draw**:
One try at a Round's game: a spin of the Lucky Wheel or a game the Host sets. It stays open while its Veto window runs and then settles as set or vetoed.
_Avoid_: Spin (a spin is only one kind of Draw), pick, roll

**Veto window**:
The time after a Draw's stop (or after the Host sets a game) in which every Party with a Veto left may reject the game: until 30 seconds after its Clip ends, or 30 seconds for a game without a Clip, ending sooner when the Host skips the Clip; it never gets longer. It opens only when some Party has a Veto left, ends for everyone at the same moment, and a Veto does not outlive its Running Session; until it ends only a Party's own Players (and a Host who moves into it) see its casts, and nobody but the database learns which Player cast (UI: Veto-Fenster).
_Avoid_: Veto round, voting time, grace period

**Clip**:
The game's YouTube excerpt that every device plays from the same second, for the game's clip length or until the Host skips it; a game without a playable video shows its card instead, for at most 30 seconds. Nobody can pause it; a Member can mute or close it on their own device, and a Party can cast its Veto while it plays.
_Avoid_: Trailer, preview, video

**Veto allowance**:
The number of Vetoes each Party has for the whole Event, the same for every Party and set by the Host; Bonus Vetoes come on top. Until the first Session starts only the Host knows the number.
_Avoid_: Vetoes per player, veto budget

**Bonus Veto**:
A Veto the Host grants one Party on top of the Veto allowance. The Host never takes a Veto away.
_Avoid_: Extra veto, refund, penalty veto

**Suitability**:
What kind of play a game in the Game library works for: Teams, free-for-all or one against one, any number of them (UI: Passt zu). One against one is a Suitability, not a Format: such an Event is Teams with two teams of one.
_Avoid_: Format (an Event has a Format, a game has Suitabilities), game mode

**Game notes**:
The formatted free text on a game in a Game library (ADR 0019). Only the User whose game it is writes and reads it (UI: Notizen).
_Avoid_: Note (a Note belongs to a Vote), description, rules, general notes

**Tag**:
A short word a User attaches to a game in their Game library to find and filter games by; shared across that one library and never shown to Members (UI: Tag). Its chip wears one of the eight Team colours, chosen by the Tag's key.
_Avoid_: Label, category, keyword, genre (a genre is one kind of Tag)

**Price**:
What a game costs as its owner last noted it: an amount in euros, where it is bought and the day that was checked; a Member sees it wherever they may see the game (UI: Preis).
_Avoid_: Cost, fee

**Event notes**:
The free text a Host adds to one game for one Event, beside the Game notes and with the same formatting. Only the Host writes and reads it, and it is read-only once the Event is finished (UI: „Notizen für dieses Event“).
_Avoid_: Note (a Note belongs to a Vote), pool notes, session notes

**Archived game**:
A game its owner has put away because it can no longer be played. It leaves the library's list, every place a game is picked from and the Lucky Wheel of every unfinished Event, can be restored at any time, and the Rounds it was played in keep showing it. A User never deletes a game (UI: „Archiviert“).
_Avoid_: Deleted game, hidden game, retired game

**Activity feed**:
The Event's automatic log of what happened, readable by every Member; it never names a game before everyone may know it (UI: Aktivität).
_Avoid_: History, log, timeline

**Award ceremony**:
The show of a finished Event's Winners, started by the Host and seen by every Member with the Event open at the same moment. Until the Host first starts it, the finished Event shows that it is pending instead of its Standings and Winners (UI: Siegerehrung).
_Avoid_: Ceremony screen, finale, results screen, podium

## Chat and emotes

**Chat**:
The Event's one conversation: every Member, the Stands included, writes Messages until the Finish; after that it stays readable. What happens in the game goes to the Activity feed, never into the Chat (UI: Chat).
_Avoid_: Comments, thread, channel

**Message**:
One text a Member writes in the Chat, at most 500 characters. Its writer and the Host can delete it; a deleted Message loses its text for good and leaves a line that says so (UI: Nachricht).
_Avoid_: Comment, post, Note (a Note belongs to a Vote)

**Emote**:
One of four fixed pictures a Member sends with a tap, rising above their Profile picture for every Member who has the Event open; never stored, at most one every two seconds (UI: Emote).
_Avoid_: Emoji, reaction, sticker

## During a Session

**Round**:
One of the games an Event plays. It begins with a spin or the Host setting a game, goes through vetoed Draws until no Veto stops its game, and ends with its Result; several Rounds can wait for their Result. A Round gets its number („Spiel 3“) when its Result is entered.
_Avoid_: Match, game (alone), Session

**Coin flip**:
A coin the Host tosses during a running Session; the server decides the side, and every Member sees the same toss at the same moment (UI: Münzwurf).
_Avoid_: Coin toss, random pick

**Countdown**:
A time the Host sets and starts that runs down to zero for every Member at the same moment.
_Avoid_: Timer, stopwatch (it never counts up)

## Results

**Result**:
The Places of every Party in one Round, with optional Scores, entered by the Host while the Event runs. A Round has at most one Result; the Host can correct it but never withdraw it (UI: Ergebnis).
_Avoid_: Outcome (a Draw settles with an outcome), score, placement

**Place**:
A Party's position in one Result, from 1 up. Every Party gets one in every Round (UI: Platz).
_Avoid_: Rank (the Standings have ranks), position

**Shared place**:
Two or more Parties on the same Place in one Result; they all get the better Place, and the next Place is skipped (1, 1, 3) (UI: gleichauf).
_Avoid_: Tie, draw (a Draw is a try at a Round's game)

**Points table**:
The points each Place earns in an Event, from a preset or set by hand, fixed once the first Session starts (UI: Punktetabelle).
_Avoid_: Scoring, point system

**Score**:
What a Party reached in the game itself, such as 16 in 16:12; it never changes the points (UI: Score).
_Avoid_: Points, result

**Standings**:
Every Party's points over all Results, highest first; Parties with equal points share a rank, and nothing else orders them (UI: Tabelle).
_Avoid_: Leaderboard, ranking, scoreboard

**Leading Party**:
A Party on the first rank of the Standings while the Event runs and at least one Result exists; in a finished Event the Winners lead (UI: führt).
_Avoid_: Leader, first place (a Place is inside one Result), favourite

**Correction**:
The Host changing a Result after it was entered, possible until the Finish; the Round keeps its number and shows that it was corrected (UI: korrigiert).
_Avoid_: Edit, fix, amendment

**Tie**:
Two or more Parties sharing the first rank once every Round up to the Game count has its Result. The Host finishes with all of them as winners (UI: „Unentschieden“) or adds one more Round (UI: „Letztes Spiel“) (ADR 0014). Ties on other ranks just stay shared (UI: Gleichstand).
_Avoid_: Draw (a Draw is a try at a Round's game), Shared place (that is inside one Result), Tiebreaker

**Finish**:
The Host closing an Event once every Round up to its Game count has its Result, or earlier once a single Leading Party can no longer be caught and no Round waits for its Result. It ends the Running Session, removes the Sessions that have not started, and leaves the Event read-only for good (UI: „Event abschließen“).
_Avoid_: Close, end (a Session ends), archive

**Winner**:
A Party on the first rank of a finished Event's final Standings; its Players are the ones in the Party at the Finish (UI: Sieger).
_Avoid_: Champion, victor, leader (a Leading Party is first while the Event still runs)

**Archive**:
A User's list of the finished Events they are a Member of, played or on the Stands. An Event enters it at its Finish and leaves it only as a Deleted Event or when its Host becomes a Deleted User (UI: Archiv).
_Avoid_: History, past Events, „Meine Sessions“ (its rows are Events), archived Event

**Share image**:
The picture of a finished Event's Winners, Standings and played games that a Member downloads or shares from their own device; only Members can get it, and there is no public link, which would show the Team words to anyone (UI: Ergebnis-Bild).
_Avoid_: Poster, OG image, screenshot, share link

## App

**Construction page**:
The placeholder shown for every area not built yet (UI: Baustelle).
_Avoid_: Coming soon page, placeholder

**Appearance**:
A User's choice between light, dark and the look their device asks for; light by default. It belongs to the User, not to a device (UI: Darstellung, with Hell, Dunkel, System).
_Avoid_: Theme, colour mode, dark mode

**Sound**:
Whether a device plays the app's sound. It belongs to the device, not to the User (UI: Ton).
_Avoid_: Mute, volume

**Reduced motion**:
Whether a device shows the calm variants of the app's large animations. It belongs to the device, and a device that asks for less motion itself always gets them (UI: Weniger Bewegung).
_Avoid_: Animations off, motion setting

**Tour**:
A short guided look at an Event page for a User who first opens an Event they do not host: Compibert points at one thing after another, and the User never has to act (ADR 0017). Every User gets it once and can ask for it again; a reworked Tour is shown once more to everyone (UI: Rundgang).
_Avoid_: Onboarding, tutorial, walkthrough, guide

**Game library**:
A User's own collection of games that they fill their Events from. Every User with the Host permission has one, and nobody else sees it, the Platform admin included (ADR 0018; UI: Bibliothek).
_Avoid_: Game list, catalogue, shared library, global library

**Release**:
A version of COMPIES that reaches Users, numbered by semantic versioning.
_Avoid_: Deploy, update, build

**Changelog**:
The public list of Releases, newest first, saying in plain words what changed for Users (UI: Neuigkeiten).
_Avoid_: Release notes, news, patch notes

**Compibert**:
The app's mascot; it appears on screen but is never named in UI copy. Its voice is wordless sounds, and a hat is an accessory, never one of its states.
_Avoid_: CompiBeard, Compi, mascot
