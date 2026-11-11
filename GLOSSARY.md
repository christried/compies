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
The name a User picks for themselves and can change at any time, shown everywhere in the app; not unique, and independent of their Discord or Twitch name. A change shows in everything that already happened too: no earlier name is kept.
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
The number of Rounds an Event runs for, changeable by the Host until the Event finishes but never below the Rounds already started. Once that many Rounds have their Result, the Host can finish the Event; it never finishes after a set time. If the last Session ends short of the count, the Event stays open until the Host adds a Session or lowers the count.
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

**Deleted Event**:
An Event its Host removed for good: it leaves Home for every Member at once, its Event link and Invite link lead nowhere, and no User can bring it back; its data stays stored until the operator removes it (UI: „Event löschen“).
_Avoid_: Archived (an archive is readable), cancelled, closed

**Member**:
A User who has joined an Event through its Invite link. The Host is a Member of their own Event.
_Avoid_: Participant, attendee, guest

**Player**:
A Member who is in a Party.
_Avoid_: Competitor, participant

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
A Member has voted once they have a Vote on every open Slot that still lies in the future; Slots that have passed or became a Date do not count, and with no such Slot left nobody has voted (UI: „haben vollständig abgestimmt“).
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
The number of slots per team in the Teams format, set by the Host and changeable while the Event runs, but never below the number of Players in the fullest team that remains (lowering the team count sends the Players of the removed teams to the Stands). A team may have fewer Players than its Team size; a game starts only when all teams have the same number of Players.
_Avoid_: Team capacity, players per team

**Game board**:
The view of an Event's teams and its Stands, where Members take their place; Players move only themselves, the Host moves everyone (UI: Spielbrett).
_Avoid_: Lobby, board view, waiting room

**Team choice**:
The time in which Players may join and leave teams themselves: from when the Event has its settings and a Session has a Date until the first Session starts. After that only the Host moves people into or out of teams.
_Avoid_: Team selection, draft, lock-in

**Team colour**:
The colour, symbol and pattern a team has by its position in the Event, never chosen.
_Avoid_: Team theme

**Team word**:
The one word (at most 12 characters, no spaces) a Player adds to their team's name and can change at any time until the Finish; it leaves the name when the Player leaves the team (UI: Teamwort).
_Avoid_: Nickname, tag

**Team name**:
A team's Team words in the order their Players joined the team, or its Team colour's name while it has none. It never freezes: it changes with its words until the Finish, and the Host can reset it to the colour name at any time but never writes a word. Unlike a Display name, the Activity feed keeps the Team name a Party had at the moment of each entry; everything else shows the current one.
_Avoid_: Team title, label

**Online**:
A Member is online while they have the Event open in at least one tab.
_Avoid_: Present, active, connected

**Stands**:
The one zone for every Member who is not in a Party, whether they will play later or only watch: everyone arriving via the Invite link lands here, and from here Players move into the teams (UI: Tribüne).
_Avoid_: Bench, Bank, waiting room, audience, Spectator (a Member on the Stands may still play)

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
Whether Members other than the Host see an Event's Game pool before the games come up; the Host chooses it, and under a Hidden wheel it is always off. With it off, Members neither see the games nor learn how many there are; they meet them only on the Lucky Wheel or when the Host sets one (UI: „Pool vorher zeigen“).
_Avoid_: Pool visibility, open pool

**Veto**:
A Party's rejection of a game the wheel has just drawn, or that the Host has set and allowed a Veto on, cast within the veto window; the game leaves the Game pool, and the wheel or the Host determines another. Any Player of the Party can cast any of its Vetoes, a Party casts at most one per drawn game, and a cast Veto cannot be withdrawn.
_Avoid_: Ban (a ban removes a game before it is drawn), skip, reject

**Draw**:
One try at a Round's game: a spin of the Lucky Wheel or a game the Host sets. It stays open while its Veto window runs and then settles as set or vetoed; a Round has one Draw, or several when Vetoes reject the earlier ones.
_Avoid_: Spin (a spin is only one kind of Draw), pick, roll

**Veto window**:
The time after a Draw's stop (or after the Host sets a game) in which every Party with a Veto left may reject the game: the game's clip length plus 30 seconds, or 30 seconds for a game without a Clip. When the Host skips the Clip, it ends 30 seconds after the skip if that is sooner; it never gets longer. It opens only when some Party has a Veto left, ends for everyone at the same moment, and a Veto does not outlive its Running Session; until it ends, only a Party’s own Players see its casts, and a Host who moves into a Party during its window sees them too, a privilege of the Host, who may move anyone at any time (UI: Veto-Fenster). A Veto belongs to its Party: a Party's Players see that their Party has cast, never which of them did, and only the database keeps who cast it.
_Avoid_: Veto round, voting time, grace period

**Clip**:
The game's YouTube excerpt that every device plays from the same second at a Draw's stop, for the game's clip length or until the Host skips it; a game without a video shows its card instead. Nobody can pause the video or operate it; a Member can mute it or close it on their own device, and a Party can cast its Veto while it plays.
_Avoid_: Trailer, preview, video

**Veto allowance**:
The number of Vetoes each Party has for the whole Event, the same for every Party and set by the Host. Bonus Vetoes come on top. Until the Event's first Session starts only the Host knows the number; the other Members learn only that there are Vetoes.
_Avoid_: Vetoes per player, veto budget

**Bonus Veto**:
A Veto the Host grants one Party on top of the Veto allowance, to make up for something that went wrong or to favour it over a Party being penalised. The Host never takes a Veto away.
_Avoid_: Extra veto, refund, penalty veto

**Suitability**:
What kind of play a game in the Game library works for: Teams, free-for-all or one against one, any number of them (UI: Passt zu). One against one is a Suitability, not a Format: such an Event is Teams with two teams of one.
_Avoid_: Format (an Event has a Format, a game has Suitabilities), game mode

**Game notes**:
The free text on a game in the Game library, such as its settings, warm-up and win condition; the game's editors write it, and only Hosts read it, in the library and as the Host of an Event whose pool holds the game (UI: Notizen).
_Avoid_: Note (a Note belongs to a Vote), description, rules

**Tag**:
A short word a game's editors attach to it in the Game library, such as a genre or „Co-op“, to find and filter games by; free, shared across the library, and never shown to Members (UI: Tag).
_Avoid_: Label, category, keyword, genre (a genre is one kind of Tag)

**Price**:
What a game costs, as its editors last noted it: an amount in euros, where it is bought (Steam, Epic, GOG, the publisher, a Steam key, free-to-play or a subscription) and the day that was checked; a Member sees it wherever they may see the game (UI: Preis).
_Avoid_: Cost, fee

**Activity feed**:
The Event's automatic log of what happened, with times, readable by every Member; it names each Party by the Team name the Party had at that moment, and never names a game before everyone may know it (UI: Aktivität).
_Avoid_: History, log, timeline

**Award ceremony**:
The show of a finished Event's Winners. The Host starts it after the Finish, and every Member with the Event open sees it at the same moment, a late joiner from where it has got to; each viewer can skip or close it for themselves, any Member can watch it again alone, and the Host can start it again for everyone. Until the Host first starts it, the finished Event shows that it is pending instead of its Standings and Winners (UI: Siegerehrung).
_Avoid_: Ceremony screen, finale, results screen, podium

## During a Session

**Round**:
One of the games an Event plays. It begins with a spin or with the Host setting a game, keeps going through vetoed draws until no Veto stops its game, and ends with its Result; if the Host puts its game back first, the Round is gone. Only one Round at a time is being drawn, but several can wait for their Result, across Sessions too, and their Results can be entered in any order. A Round gets its number („Spiel 3“) when its Result is entered, and an Event never starts more Rounds than its Game count.
_Avoid_: Match, game (alone), Session

**Coin flip**:
A coin the Host tosses at any time during a running Session, once the previous toss has landed; the server decides the side, and every Member sees the same toss at the same moment. The last toss stays on the stage until the next one or the end of its Session (UI: Münzwurf).
_Avoid_: Coin toss, random pick

**Countdown**:
A time the Host sets and starts that runs down to zero for every Member at the same moment, for games played against the clock.
_Avoid_: Timer, stopwatch (it never counts up)

## Results

**Result**:
The Places of every Party in one Round, with optional Scores, entered by the Host while the Event runs, also between Sessions. A Round has at most one Result; the Host can correct it but never withdraw it (UI: Ergebnis).
_Avoid_: Outcome (a Draw settles with an outcome), score, placement

**Place**:
A Party's position in one Result, from 1 up. Every Party gets one in every Round (UI: Platz).
_Avoid_: Rank (the Standings have ranks), position

**Shared place**:
Two or more Parties on the same Place in one Result, because the game ended level for them; they all get the better Place, and the next Place is skipped (1, 1, 3) (UI: gleichauf).
_Avoid_: Tie, draw (a Draw is a try at a Round's game)

**Points table**:
The points each Place earns in an Event, from a preset or set by hand by the Host, and fixed once the first Session starts (UI: Punktetabelle).
_Avoid_: Scoring, point system

**Score**:
What a Party reached in the game itself, such as 16 in 16:12, which the Host may add to a Result; it never changes the points (UI: Score).
_Avoid_: Points, result

**Standings**:
Every Party's points over all Results, highest first; Parties with equal points share a rank, and nothing else orders them (UI: Tabelle).
_Avoid_: Leaderboard, ranking, scoreboard

**Leading Party**:
A Party on the first rank of the Standings while the Event runs and at least one Result exists; several when they share the rank, none before the first Result. In a finished Event the Winners lead (UI: führt).
_Avoid_: Leader, first place (a Place is inside one Result), favourite

**Correction**:
The Host changing a Result after it was entered, possible until the Event finishes; the Round keeps its number and shows that it was corrected (UI: korrigiert).
_Avoid_: Edit, fix, amendment

**Tie**:
Two or more Parties sharing the first rank in the Standings once every Round up to the Game count has its Result. The Host then finishes the Event with all of them as winners (UI: „Unentschieden beenden“), or raises the Game count by one for another Round that every Party plays like any other (UI: „Letztes Spiel hinzufügen“). Ties on other ranks just stay shared (UI: Gleichstand).
_Avoid_: Draw (a Draw is a try at a Round's game), Shared place (that is inside one Result), Tiebreaker

**Finish**:
The Host closing an Event once every Round up to its Game count has its Result: it ends the Running Session, removes the Sessions that have not started, and leaves the Event read-only for good, with its final Standings (UI: „Event abschließen“).
_Avoid_: Close, end (a Session ends), archive

**Winner**:
A Party on the first rank of a finished Event's final Standings: one, or several when the Host finished a Tie as „Unentschieden“. Its Players are the ones in the Party at the Finish (UI: Sieger).
_Avoid_: Champion, victor, leader (a Leading Party is first while the Event still runs)

**Share image**:
The picture of a finished Event's Winners, Standings and played games, landscape or square, that a Member downloads or shares from their own device; only Members of the Event can get it (UI: Ergebnis-Bild).
_Avoid_: Poster, OG image, screenshot, share link

## App

**Construction page**:
The placeholder shown for every area not built yet in the MVP (UI: Baustelle).
_Avoid_: Coming soon page, placeholder

**Appearance**:
A User's choice between light, dark and the look their device asks for; light unless they choose otherwise. It belongs to the User, not to a device (UI: Darstellung, with Hell, Dunkel, System).
_Avoid_: Theme, colour mode, dark mode

**Sound**:
Whether a device plays the app's sound. It belongs to the device, not to the User (UI: Ton).
_Avoid_: Mute, volume

**Game library**:
The platform-wide collection of games that Hosts fill their Events from; only Users with the Host permission and the Platform admin see it (UI: Bibliothek).
_Avoid_: Game list, catalogue

**Release**:
A version of COMPIES that reaches Users, numbered by semantic versioning: a new feature raises the minor number; fixes, small additions and the further parts of a Release that was split raise the patch number. Releases count from 0.1 while COMPIES is being built; 1.0 is the Release the operator declares ready.
_Avoid_: Deploy, update, build

**Changelog**:
The public list of Releases, newest first, saying in plain words what changed for Users; changes Users cannot see are left out (UI: Neuigkeiten).
_Avoid_: Release notes, news, patch notes

**Compibert**:
The app's mascot; it appears on screen but is never named in UI copy.
_Avoid_: CompiBeard, Compi, mascot
