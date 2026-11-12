# Roadmap

Where COMPIES goes after „Mehr Termine“ (0.3): a polished **Teams** Event with the **Lucky Wheel**, an equal **Veto allowance** per Party, in-app scores and the **Award ceremony**. Agreed on 2026-10-28 in a grilling session. Re-planned on 2026-10-31, in the grilling for „Glücksrad“: the Releases were renumbered, „Notizen“ was split out, and **Rounds** were added. Extended on 2026-11-08, in the grilling for „Feinschliff“: 0.10 takes the list that waited for the first Event, and 0.11 „Profil“ follows. Extended on 2026-11-09 from the first production check (the user's production-check notes (sorted here, then removed on 2026-11-09), #342): 0.12 „Eventseite“ and 0.13 „Glücksrad & Clip“ hold its bigger findings; its ideas for after the roadmap were listed in § Später until 2026-11-10 and are Idea issues now (#452–#468). Detailed on 2026-11-09, in the grilling for „Profil“: § 0.11 holds its rules. Detailed on 2026-11-10, in the grilling for „Eventseite“: § 0.12 holds its rules. Detailed on 2026-11-11, in the grilling for „Glücksrad & Clip“: § 0.13 holds its rules and its split into four Releases. Terms follow `GLOSSARY.md`.

**Numbering.** Releases count from 0.1 while COMPIES is being built; 1.0.0 is the Release the user declares ready (`docs/agents/release.md` § Semantic versioning). Before 0.5.1 they were numbered 1.x: 1.0.0 is 0.1.0, 1.1.x is 0.2.x, 1.2.0 is 0.3.0, 1.3.0 is 0.4.0 and 1.4.0 is 0.5.0. Older specs, issues, reviews, ADRs and code comments keep the old numbers; in them, the planned 1.5 „Glücksrad“ is 0.7, 1.6 „Punkte“ is 0.8 and 1.7 „Siegerehrung“ is 0.9.

Each release is one spec and usable on its own. A release is grilled, specced and ticketed in one fresh session **while the release before it is being built**, once the code it builds on exists, never all releases up front: the specs name real modules and seams, and the first game night in the app will change what comes after. Besides this file, the grilling reads the open Idea issues (`docs/agents/issue-tracker.md` § Ideas): since 2026-11-10 an idea that isn't grilled yet lives there, not here. 0.9 „Siegerehrung“ was the minimum for the first Event in the app; since 0.10 the first Event gates nothing any more (decided 2026-11-08), and there is no date pressure. This order replaces the 1.0 ticket order in `docs/design_handoff_compies/07-scope-and-tickets.md` for everything below; ticket numbers (T…) and screen numbers refer to that file and `03-screens.md`.

| Release | Name | Status |
|---|---|---|
| 0.4 (was 1.3) | Spielvorbereitung | released as 1.3.0 on 2026-10-29: [#138](https://github.com/christried/compies/issues/138), [#169](https://github.com/christried/compies/issues/169) |
| 0.5 (was 1.4) | Teams | released as 1.4.0 on 2026-10-31: [#153](https://github.com/christried/compies/issues/153), [#195](https://github.com/christried/compies/issues/195), [#206](https://github.com/christried/compies/issues/206) |
| 0.5.1 | Neue Nummern | released on 2026-11-01: [#215](https://github.com/christried/compies/issues/215), [#242](https://github.com/christried/compies/issues/242) |
| 0.6 | Notizen | released on 2026-11-01: [#217](https://github.com/christried/compies/issues/217) |
| 0.7 | Glücksrad | released on 2026-11-02: [#218](https://github.com/christried/compies/issues/218), [#263](https://github.com/christried/compies/issues/263) |
| 0.8 | Punkte | released on 2026-11-05: [#272](https://github.com/christried/compies/issues/272) |
| 0.9 | Siegerehrung | released on 2026-11-08: [#308](https://github.com/christried/compies/issues/308); the minimum for the first Event |
| 0.10 | Feinschliff | released on 2026-11-09: [#332](https://github.com/christried/compies/issues/332); the list that waited for the first Event, plus the production check. 0.10.1 „Partyhut“ released on 2026-11-09: the review follow-ups, the Partyhut ([#38](https://github.com/christried/compies/issues/38)) and the Countdown fix ([#379](https://github.com/christried/compies/issues/379)) |
| 0.11 | Profil | released on 2026-11-10: [#398](https://github.com/christried/compies/issues/398); the Profil page, Darstellung (Hell, Dunkel, System) and the dark check |
| 0.12 | Eventseite | released on 2026-11-11: [#425](https://github.com/christried/compies/issues/425); one Tribüne, open Team names, the stage that follows the game, game tiles with the game dialog, and the finished page that waits for the Award ceremony |
| 0.13 | Glücksrad & Clip | the wheel, the clip and the Share image findings of the production check; grilled on 2026-11-11 and split into four Releases: 0.13.0 „Clip“ ([#501](https://github.com/christried/compies/issues/501), released on 2026-11-12), 0.13.1 „Kleinkram“ ([#502](https://github.com/christried/compies/issues/502), released on 2026-11-12), 0.13.2 „Show-Rad“ ([#503](https://github.com/christried/compies/issues/503)), 0.13.3 „Ton“ ([#504](https://github.com/christried/compies/issues/504)) |
| 1.0 | | when the user declares COMPIES ready |

## 0.4 Spielvorbereitung (was 1.3)

Hosts can fill a Game library and set up a whole Event. No realtime yet. (T4, T5b; screens 05, 23, 24.)

**Game library**
- Only Users with the Host permission and the Platform admin see it, nav item included.
- Hosts create games; the creator and the Platform admin edit them. No deleting.
- Fields: name, optional image, YouTube link with start second and length (default 30 s) and a live preview, recommended player count, suitable formats. Search and filters as designed.
- Image: cropped and shrunk in the browser to one small WebP, stored on Cloudflare R2, served through a cached Nuxt route (ADR 0012). Fallback: the clip's YouTube thumbnail, then a placeholder.
- Out: duplicate check, pool suggestions.

**Create Event stepper**
- All 8 steps. Free-for-all, Pick & Ban, Loser's Pick and Loser's Advantage are shown as „Bald verfügbar“. Selection modes: Lucky Wheel (with Hidden wheel option) and Admin pick.
- The Event is created at „Fertig“; no drafts.
- Game count: default 10, range 1–30.
- Veto allowance (step 5): default 3, or the Team size if higher; range 0–9. In the stepper it follows the Team size until the Host touches it; after that, and after creation, only the Host changes it.
- Step 6: „Neues Spiel anlegen“ opens the game form in a sheet, and the new game lands in the pool. A hint that never blocks: Game count + Veto allowance × Parties games recommended (3v3, 10 games, 3 Vetoes: 16).
- Info sheet copy: the new Veto allowance rule, and that the Host sees the Hidden wheel's games.

**Editing an Event**
- Events created before 0.4 (1.3) stay valid. Their Host sees „Event einrichten“, which opens the same steps as an editor. No Session can start without settings (enforced from 0.5).
- Before the first Session starts, everything is editable. After that, still editable: Game count, Veto allowance (never below the most any Party has spent), Team size (never below the fullest team), Hidden wheel, Game pool, Tiebreaker pool. Locked: Format, team count, points table, Selection mode.
- Hidden wheel switched off mid-Event reveals the remaining games to everyone; switched on, it hides undrawn games from then on.

**Event page**
- „So wird gespielt“ card for every Member, built from the stepper's „Fertig“ summary (`App Vorbereitung`, state Fertig).

**Hidden wheel secrecy** (brief §8)
- No client except the Host's ever receives the name, id, image or clip of an undrawn game, through any API. Players see neither the Game pool nor the Tiebreaker pool. Acceptance includes a test that calls the API as a Player.

**Human task**
- Fresh Cloudflare account, R2 bucket in Europe, keys in Vercel for staging and production, walked through by a `/wizard` script. Blocks the image upload.

## 0.5 Teams (was 1.4)

Everyone in the lobby live; teams formed; a Session can start. (T6, T8, activity feed from T9; screens 09, 10, 27.) Spec: [#153](https://github.com/christried/compies/issues/153).

- Realtime foundation per ADR 0012: Nuxt on Vercel, one PartyServer Worker with one room per Event, room tokens, presence, clock sync, reconnect. Postgres writes stay in Nuxt.
- Lobby game board: zones, drag and drop, online indicator, team names (open question 10 as designed), team colours.
- Starting a Session; the Event goes to running.
- Activity feed.
- „Was ist neu“ pop-up: after a new Release, every Release newer than the one the User last saw, newest first, with a link to Neuigkeiten. „Gesehen“ is stored per User on the server, not per device. New Users get none; Users who never saw anything see only the newest Release. Static Compibert bust at most. (Agreed 2026-10-28 in the 1.3 review grilling.)
- Grilled on 2026-10-28 (ADR 0013, `GLOSSARY.md`): Nuxt decides and the room only relays; no Worker deploy or Release merge on a day with a Session Date or while a Session runs; rooms in the EU jurisdiction; ≤ 50 ms for server-timed moments, the clip best effort; staging and production Workers on `*.workers.dev`, set up by a wizard. Facts: `docs/research/realtime-hosting.md`.

## 0.5.1 Neue Nummern

A patch, no new feature. Spec: [#215](https://github.com/christried/compies/issues/215).

- **Renumbering:** every Release `1.N.p` becomes `0.(N+1).p` in `CHANGELOG.md`. A migration maps each User's stored „Was ist neu“ version, so Users who saw 1.4.0 get exactly one pop-up, for 0.5.1. A changelog line explains the jump. New `v0.x` tags go on the old commits, and the `v1.x` tags are deleted once the user approves.
- **Contact address:** `compies@christried.me` in the Impressum and the Datenschutzerklärung. It is blocked by the human task [#216](https://github.com/christried/compies/issues/216), which sets up the Namecheap forwarding. The forwarding target is never named in the repo.
- **Hidden wheel:** Players see neither the pool games nor how many there are until the wheel is on screen. The Event read sends no counts to anyone but the Host. The Host's banner says what the others see.

## 0.6 Notizen

Game notes and Pool preview; no realtime, no round. Spec: [#217](https://github.com/christried/compies/issues/217).

- **Game notes** („Notizen“) on every library game:
  - plain text, multi-line, line breaks kept, at most 1000 characters (graphemes, #76);
  - written by the game's editors, also in the stepper's „Neues Spiel anlegen“ sheet;
  - shown to Hosts in the library and, behind a collapsible „Notizen“, under each game in „So wird gespielt“ for the Host of the Event only; Members of a pool see picture and name of its games and nothing else (decided 2026-11-01, [#217 comment](https://github.com/christried/compies/issues/217#issuecomment-6560579466)).
  - One note per library game, shared across every Host's Events.
- **Pool preview** („Pool vorher zeigen“):
  - an Event setting for Host pick and the visible Lucky Wheel, on by default and for existing Events, editable while the Event runs;
  - under a Hidden wheel always off and disabled, and switching the Hidden wheel off leaves it off.
  - With it off, Members see no pool list and no counts. The Auswahl row reads „Glücksrad, Spiele erst am Rad“ or „Host-Wahl, Spiele erst beim Setzen“.
  - The 0.4 secrecy rules (#148) and test cover it, notes included.
- The Datenschutzerklärung covers both.
- All UI _own build_.

## 0.7 Glücksrad

The game round up to „wird gespielt“. (T10; screens 10, 11, 15, 30.) Spec: [#218](https://github.com/christried/compies/issues/218).

- **Ticket zero (A1):** one home for a Session's state, out of the Game board file. It models the Event's **Rounds** as a list, not one current game, and closes Standards S3 and S6 of review 1.4.
- **Deadlines (A2, ADR 0013 amended 2026-10-31):**
  - Nuxt owns every timed moment, stored as an instant; no timer runs anywhere, and reads are gated by time.
  - The room's one change is sending to named Users, for sealed Vetoes. It needs one Worker deploy, on a day without a Session.
- **Lucky Wheel:**
  - server-drawn result and a synced spin;
  - the Hidden wheel with placeholder names and the reveal;
  - Players under a Hidden wheel learn the count only from the wheel.
- **Synced clip** of the game's own length (5–60 s, default 30); the 60 s veto window fits the longest clip.
- **Vetoes:**
  - Veto allowance per Party, at most one per Party per drawn game, a 60 s window, sealed until the simultaneous reveal;
  - a window opens only when some Party has a Veto left;
  - a vetoed game leaves the Game pool.
- **Rounds:**
  - A Round begins with a spin or with the Host setting a game, and vetoed draws stay inside it. Only one Round is drawn at a time.
  - Others wait for their result, across Sessions too. This covers playing a second game during a long download.
  - The Host puts an open Round's game back (the Round is gone, the game returns to its pool, spent Vetoes stay spent).
  - The Game count never drops below the Rounds started.
  - Open Rounds are listed on the stage as GameCard rows with „wird gespielt“.
- **Spinning or setting needs teams of equal size**, as starting a Session already does on 0.5.
- **„Nächstes Spiel setzen“** in every mode (Host pick and the Lucky Wheel):
  - the Game pool first, then the library; a pool game leaves the pool, a library game never joins it.
  - In the Lucky Wheel only, the switch „Veto erlauben“ (off by default): if vetoed, the game leaves the pool and the Host chooses again.
  - Host pick has no Vetoes.
- **Bonus Veto:** the Host grants one Party a Veto on top of the Veto allowance.
  - Lucky Wheel only, any time until the Event finishes, at most 9 per Party.
  - Hold to confirm, no undo; usable at once, also in an open window.
  - An Activity feed entry for everyone. Nobody ever takes a Veto away, and the allowance stays the same for every Party.
- **Coin flip:**
  - the Host tosses it any time during a running Session, and the server decides Kopf or Schwanz;
  - every Member sees the same toss (`Coin3D`, no sound) at the same moment;
  - the result goes to the Activity feed only once the coin has landed.
- **Countdown:**
  - the Host sets 5 s to 99:59 and starts, pauses, resumes or resets it;
  - it runs down for every Member at the same moment and shows „Zeit ist um“ at zero;
  - no sound, no feed entry.
  - Needed for the first Event, so it ships in a plain look; the motion and graphics come with 0.10.
- **Host-only pool warning:** shown when the games left are fewer than (Game count − Rounds started) + every Party's remaining Vetoes (Bonus Vetoes included), or under Host pick fewer than the Rounds still to start. It never blocks.
- **Game notes on the Round card**, open while the game is played, for the Host only (decided 2026-11-01, [#217 comment](https://github.com/christried/compies/issues/217#issuecomment-6560579466)).
- **Settings lock (A3):** the Hidden wheel can't be switched during a spin or veto window; one summary for „So wird gespielt“ and the stepper.
- All UI _own build_ from the reference designs; no Claude Design hand-off.

**Planning items from 0.5 (review 1.4)** (`docs/reviews/review_1.4_2026-10-31.md` § Result and the leftovers of [#195](https://github.com/christried/compies/issues/195)), in the 0.7 tickets:
- **A4:** the Event page's block and dock lists, when the first 0.7 block lands.
- **A6:** Activity people by declaration, not by naming convention; one enum migration per Release.
- **A8:** `useBoardPlaces`, the next time the Game board is touched.
- **Nits:** N4–N12 and A9 of the review, and „Ersatz“ in `board.benchSub` (N3 was fixed in the grilling).
- **Code-review leftovers of #195:**
  - `settingsFloors` returns a function, the `POSITIVE_INFINITY` sentinel, and the Players-per-team array built twice;
  - `HomeSessionTimes.startedAt` is unused;
  - the duplicate log line in `publishAfterResponse`;
  - one return refetches twice (visibility and focus);
  - a first connect that never succeeds shows no banner.
- **Code-review leftovers of [#206](https://github.com/christried/compies/issues/206)** (the walk-through fixes):
  - 04-motion asks for a 0.14 s fade on a place change under reduced motion; the Game board shows none;
  - a `member.moved` that the refetch never confirms goes back after 5 s with a glide and a landing pop.

## 0.8 Punkte

Results in the app, Standings and a winner. (T13; screens 16, 17.) Spec: [#272](https://github.com/christried/compies/issues/272). Grilled on 2026-11-02 (`GLOSSARY.md` § Results, ADR 0014). There is no Tiebreaker (T14 and screen 18 are dropped).

- **Ticket zero:** [#256](https://github.com/christried/compies/issues/256) (seams for stage pieces). Then, before the first result ticket: [#257](https://github.com/christried/compies/issues/257) (one server-time ticker, a slimmer Event page), [#258](https://github.com/christried/compies/issues/258) (one visibility rule for drawn games) and [#259](https://github.com/christried/compies/issues/259) (`changeEvent` owns `now` and the settle). [#261](https://github.com/christried/compies/issues/261) (nits) is its own ticket. [#260](https://github.com/christried/compies/issues/260) stays `ready-for-human`; idea [#38](https://github.com/christried/compies/issues/38) stays out.
- **Result entry:**
  - The Host enters a Result for any open Round, in any order, while the Event runs, with or without a running Session.
  - Every Party gets a Place in every Round. A Shared place („gleichauf“) between neighbours earns the better Place's points and skips the next Place (1, 1, 3).
  - Each Party gets an optional Score (free text, at most 7 characters) that never counts.
  - „Ergebnis eintragen“ on the open Round's card opens a sheet on desktop and a full screen on a phone: drag plus arrow buttons, „gleichauf“, a Score per Party, a points preview and „Ergebnis speichern“.
  - A Round gets its number („Spiel 3“) when its Result is entered.
  - Everyone else sees „Das Ergebnis trägt der Host ein“ under each open Round; there is no live „trägt gerade ein“.
- **Corrections:**
  - The Host corrects any Result until the Event finishes, from the history („Korrigieren“ opens the same sheet), without a confirm dialog.
  - The Round keeps its number and shows „korrigiert“.
  - A Result is never withdrawn.
- **Standings** („Tabelle“):
  - Points only; equal points share a rank, listed in team order.
  - They live in a new side panel tab „Tabelle“ next to „Aktivität“, with the history („Verlauf“), and in a third phone tab „Tabelle“.
  - On the stage they stay calm once the first Result exists. A new Result reorders the rows, counts the points up and shows a delta pill; the game's winner gets the stamp and sticker confetti, with no Compibert. It plays when each device sees the Result; there is no shared instant.
- **The end of an Event:**
  - Once every Round up to the Game count has its Result, the Host finishes the Event by holding „Event abschließen“ in the Host dock. Nothing finishes by itself. To stop sooner, the Host lowers the Game count first.
  - With a Tie on first place, Players see „Gleichstand auf Platz 1. Der Host entscheidet.“ The Host either holds „Unentschieden beenden“ (every Party on the first rank wins) or adds „Letztes Spiel hinzufügen“ (Game count + 1, a regular Round for every Party from the Game pool, in the Selection mode). If the Tie is still there afterwards, the same choice comes up again.
  - Finishing ends the Running Session, removes the Sessions that have not started and closes the Date poll.
  - The finished Event page is read-only for everyone, the Host included, and shows the final Standings („Unentschieden“ for a Tie), the history with every Result, and the Activity feed. There is no reopening.
- **Stepper and settings:**
  - The Tiebreaker pool goes: the stepper loses step 7, „So wird gespielt“ and the settings summary lose its list, and a migration deletes the stored entries (a changelog line says so).
  - Step „Spiele“, the settings editor and the info sheet warn when the Event can end in a Tie: at an even Game count, or always with more than two teams.
  - The pool recommendation becomes Game count + Veto allowance × Parties, + 1 when that warning shows (10 games, 2 teams × 5 Vetoes → 21). Under the Lucky Wheel a note adds that Bonus Vetoes need more games.
  - The Host-only pool warning during the Event stays as it is.
- **Activity feed:**
  - New entries `result_entered` („Spiel 3: Mario Kart, Wilde Gurken gewinnt“), `result_corrected` and `event_finished` (the winner, or „Unentschieden“ with the names), in one enum migration.
  - „Letztes Spiel hinzufügen“ logs as `game_count_changed`.
- The Datenschutzerklärung gets a line on Results (Places and Scores per Round, readable by every Member, kept as long as the Event exists). The user approves the wording.
- All UI _own build_ from `App Spielrunde` (result, board) and `DS Scoring`; no Claude Design hand-off.

## 0.9 Siegerehrung

The Award ceremony and the Share image; the minimum for the first Event. (T15; screen 19.) Spec: [#308](https://github.com/christried/compies/issues/308). Grilled on 2026-11-05 (`GLOSSARY.md`: Award ceremony, Winner, Share image; ADR 0015). Out: Battle replay, Archive, 3D podium, sound, idea [#38](https://github.com/christried/compies/issues/38).

- **The ceremony** is the 2D „Pokal-Lauf“ of `AwardCeremony` (what „2D podium“ meant):
  - places from last to second, the winner card, Compibert running in with the trophy and a gag („trip“ or „bonk“);
  - then the „SIEGER“ stamp, the Winners' Players and Compibert dancing, with no fanfare.
  - Compibert's animated rig arrives only as far as the ceremony needs (ADR 0015); the header head stays still.
- **Starting:**
  - Finishing does not start it, so the Host can finish alone between Sessions and start the ceremony when the group is together.
  - The finished Event's Host dock gets the primary „Siegerehrung starten“: a tap, still there after the first start, disabled while a run plays.
  - The server picks the gag at random, never the same as the previous start.
  - No Activity feed entry.
- **Watching:**
  - A layer over the Event page: on desktop over the stage column, with the side panel visible; on the phone full screen above the tabs.
  - It opens for every Member with the Event open, on any tab and at any scroll position; a late joiner comes in where it has got to.
  - Each viewer can skip to the end frame („Überspringen“) or close it, for themselves only; the Host has no skip for everyone (WCAG 2.2.2).
  - The end frame stays until closed, with „Bild teilen“ and „Nochmal ansehen“.
  - Reduced motion shows the end frame; a live region announces the Winners.
- **Watching again:** once the Host has started it, every Member has „Siegerehrung ansehen“ on the finished page. It plays for them alone, with the last start's gag. Nothing plays on its own for anyone who wasn't there.
- **The Winners' people:** the Players in the winning Party at the Finish; a Winner with no Players shows its TeamMark only.
- **Share image** („Ergebnis-Bild“, 05-assets § 8a):
  - „Bild teilen“ sits at the top of the finished stage from the Finish on, and in the end frame. It opens a sheet with the image itself, „Querformat“ / „Quadrat“, „Bild herunterladen“, and „Teilen“ on devices that can share files.
  - Only Members of the finished Event get it. It is made on the server on each request and never stored. There is no public link (see Out of scope).
  - The date is the started Sessions' Dates: one day, or first to last. „· N Leute“ counts the Players at the Finish.
- **Tie** (ADR 0014):
  - A _Claude Design hand-off_ covers, in one prompt, the ceremony with 2–8 Winners, the Share image with 2–8 Winners, and a game chip whose Round had a Shared first place.
  - 0.9 ships only with the Tie variant built.
- Events finished on 0.8 get the ceremony and the Share image like any other.
- The Datenschutzerklärung stays as it is: the ceremony stores no personal data, and the image shows only what every Member already sees.
- All other UI _own build_ from `AwardCeremony`, `ShareImage` and `App Ende & Archiv ?s=ceremony` (its share sheet without the link).

## 0.10 Feinschliff

The list that waited for the first Event, plus the party hat. Spec: [#332](https://github.com/christried/compies/issues/332). Grilled on 2026-11-08 (`GLOSSARY.md`: Deleted Event, Tag, Price, Leading Party). One integration branch; tickets #333–#343 and #38.

- **Event löschen** (#333, #334): the Host deletes an Event from the Host dock's „Mehr“ in every Phase except while a Session runs, by holding a button. A soft delete (`events.deleted_at`, which Home, the Event read, the invite routes and the deploy check already honour): the Event leaves Home for every Member at once, open pages show „Event gelöscht“ through the usual room publish, the Event link and the Invite link lead there. No undo, no Activity entry, no purge; the Datenschutzerklärung says the data is removed on request. The 0.9 Release found a placeholder Event on production that only a script could remove.
- **Tags** (#335, #336): free Tags on a game, typed by its editors with suggestions from the Tags in use, normalised, at most 20 characters and 8 per game; a Tag nobody uses is gone. One Tag filter chip in the shared game browser (library, both pool pickers, the compact one too), the search matches Tags, cards show three plus „+N“. Members never see Tags.
- **Prices** (#337, #338): one Price per game, all optional: an amount in € (0,01 to 999,99, stored in cents), a source from a fixed list (Steam, Epic Games Store, GOG, Publisher-Website, Steam-Key, Free-to-play, Abo; the last two without an amount) and the day it was checked, stamped by the server on every change, with „Preis stimmt noch“ to refresh it. Hosts see it in the library, the pickers and „So wird gespielt“; Members in the pool preview and on the Round card, exactly when they may know the game's name (the 2026-11-01 rule „picture and name only“ widens by the Price, nothing else).
- **Countdown motion and graphics**: a _Claude Design hand-off_ (#339) for the card's four states, the last ten seconds, the zero moment, the Host's controls, reduced motion; no sound, no Compibert; the sheet stays. Built in #340 on the existing server-timed state.
- **Party hat** (#38, idea from the first staging review): Compibert's header head wears a party hat on the Event pages, only for the Players in a **Leading Party** (first rank of the Standings with at least one Result, all of them when shared; the Winners on the finished page). Bench, Stands, trailing Parties, Home and the hub pages show the plain head. The hat is a _Claude Design hand-off_ (#341), an accessory on the head crop like the hard hat.
- **#328**: the AwardCeremony refactor, as written, without a changelog line.
- **Three human sweeps** (`ready-for-human`), once every other ticket is on the integration branch: mockup vs. live app (#342), then the wording sweep (#343), then the animation sweep (#394, created 2026-11-09 under #332); all three are joint sessions paused until December 2026. Small findings land in 0.10 before the version cut; a feature or a redesign goes to 0.11 or later.
- **Production check** (2026-11-09, the user's production-check notes (sorted here, then removed on 2026-11-09), sorted on #342): ten small fixes as tickets #347–#356 (Home card to the reference, Sheet motion, the Sessions card's menu, „Bald verfügbar“ without a chip, aligned picker buttons, „vollständig abgestimmt“ and CSV for Hosts, the back link, the wheel card without a count, anonymous Vetoes, the clip status in the Host's footer). The bigger findings are 0.12 and 0.13 below.
- All other UI _own build_.

## 0.11 Profil

The Profil page (screen 25, trimmed) replaces its Construction page, and the app gets its dark look ([#43](https://github.com/christried/compies/issues/43)). Spec: [#398](https://github.com/christried/compies/issues/398). Grilled on 2026-11-09 (`GLOSSARY.md`: Display name, Appearance, Sound).

- **The page:**
  - One column (max 640 px) on every width: the h1 „Profil“, a card „Profil“ (the avatar with its hint, then Anzeigename), a card „Einstellungen“ (the rows Ton and Darstellung), and „Abmelden“ as a text button.
  - A deviation from the artboard, noted in the hand-off folder: no tabs, no Meine Sessions, no Verbundene Konten.
  - The profile menu stays as designed, without a link to Profil; the nav item loses its „Baustelle“ marker. First-time setup (`/einrichten`) stays as it is.
- **Display name:**
  - A User renames themselves as often as they like, under the rules of setup (1 to 32 characters, not unique), with a „Speichern“ button that is active only for a changed, valid name.
  - Names are read live everywhere, so a new name shows at once in old Activity entries and in the Share image of finished Events too. No earlier name is kept.
  - Nothing is pushed: others see it at their next load or the next refresh of their Event page.
- **Avatar:** read-only, from the provider, refreshed at each sign-in; the hint says so, on the setup page too.
- **Sound** (Ton): the row is the header's switch, per device, with the same state; the header toggle stays. Until 0.13 it only decides whether a Clip starts with sound, and the description says exactly that.
- **Appearance** (Darstellung: Hell / Dunkel / System):
  - Stored with the User, light unless they choose otherwise. A tap applies it at once and saves in the background; a failed save switches back with a notice. Other devices show it at their next page load.
  - A cookie mirrors it for the signed-out pages. It exists only while the choice is Dunkel or System, stays after Abmelden, and gives way to the next User's own choice at sign-in. It gets a new name, never the old `nuxt-color-mode`.
  - „System“ is CSS only: the dark tokens repeated under a `prefers-color-scheme` media query, kept in sync by a test; no script before first paint.
  - The browser bar colour and the offline page get their dark variants back. The PWA manifest stays light.
- **Dark in the app:**
  - An agent pass over every page and Event state, the signed-out pages included. It measures text and control contrast (WCAG AA), a visible focus ring, borders and shadows that still separate surfaces, and light-only colours left on a themed surface; it fixes with the existing tokens. The faint hover tint on nav items and the „Termin festlegen?“ options (#43) is a named fix.
  - Illustrations and stage pieces keep their colours in both modes (the Award ceremony, the Coin flip, Compibert, the construction tape); what surrounds them follows the Appearance. The Standings are plain UI and move to tokens.
  - The Share image stays light for everyone; the sheet around it follows the Appearance.
  - What needs a new drawing becomes a `Claude Design: …` ticket. It blocks 0.11 only if something is unreadable or broken in dark.
- **Two walk-throughs** (`ready-for-human`, both before the version cut): the usual staging walk-through, and a „Dunkel walk-through“ as a joint session after the agent pass (each page and Event state in dark at 390 and 1440 px, and the sign-in round trip for Discord and Twitch with cancel, watching for a light flash).
- **Datenschutzerklärung:** the Appearance stored with the User, the cookie and the renaming; its own `ready-for-human` ticket, and the user approves the wording.
- **Changelog:** two lines, the Profil page with renaming and Darstellung. Ton gets none.
- **Out:** second provider linking and Verbundene Konten, avatar upload, Push, Sprache, Weniger Bewegung (the OS setting already counts), Meine Sessions, the tabs, account deletion in the app, a dark Share image, an Appearance per Event, sound cues (0.13), Compibert on the page.
- All UI _own build_; the settings row (icon tile, title, description, control) is the one new piece, shaped by the artboard.

## 0.12 Eventseite

The Event page findings of the first production check (2026-11-09), plus #415 and #416 from the architecture review #413, #423 and #426. Spec: [#425](https://github.com/christried/compies/issues/425). Grilled on 2026-11-10 (`GLOSSARY.md`: Stands, Team word, Team name, Activity feed, Award ceremony; ADR 0016; the „Deviation (0.12, #425)“ notes in `docs/design_handoff_compies/` 02-components, 04-motion and 11-event-seite). Earlier decisions that contradict it no longer hold. Built in a Claude Code cloud session while 0.11 is finished locally; the browser checks, staging, the walk-through and the cut follow in a local session.

- **Ticket zero:** #415 (one Stage module) and #416 (one Event state, after measuring what runs under the Event row lock; the agent decides by the rule that no write route runs more statements under the lock than the heaviest does today).
- **One Tribüne:** Bench and Tribüne become one zone, the Tribüne, for every Member not in a team, without „Zuschauer, spielen nicht mit“. Arrivals and the Players of a removed team land there; Team choice is unchanged. A migration moves every Bench seat.
- **Team names never freeze:** Players change their Team word until the Finish; after the first word the builder folds to the name with a pencil. The Host resets a name to the colour name at any time and never types a word. Events finished before 0.12 keep their names; in running ones a team the Host reset keeps its colour name.
- **The feed keeps the name of its moment** (ADR 0016), with the TeamMark beside it, moves, resets and Bonus Vetoes included; everything else shows the current name.
- **The stage follows the game:** a block rises 0.5 s after its moment with the reflow glide (reduced motion: a fade; a hidden tab: at once): the wheel at a Draw's commit, „Gerade dran“ when a Round settles, the Standings at a Result or Correction, the Countdown at its start, the Coin flip at a toss. Newest first under the Head and the Host's notices; the Game board, the Date poll and „So wird gespielt“ never rise; no scrolling by itself; the same order after a reload. The Standings' result animation starts once the block is on top.
- **Game tiles and the game dialog:** the Spielepool, „Zuletzt gezogen“ and „Gerade dran“ show picture and name, for the Host too; a tap opens the game dialog. A Member sees players, Suitabilities and the Price there (widened by players and Suitabilities), the Host everything plus „In der Bibliothek öffnen“. The Host's Notes stay open on „Gerade dran“.
- **Notes in the picker:** a Notes button in every compact picker and on the chosen games of step „Spiele“.
- **The finished page waits for the Award ceremony:** until the Host's first start everyone, the Host included, sees it pending; the Standings, the Spielverlauf, the Tabelle tab, „Bild teilen“, the party hat and the Winners in the head and the feed wait. Events finished before 0.12 count as shown.
- **Free-to-play** (#423): the Tag follows the Price on every save.
- **The header** (#426) after the hand-off #428; it does not hold the cut.
- **Datenschutzerklärung:** the Tribüne, no frozen names, the feed's Team names; the user approves the wording.
- **The end of the build:** one ticket merges 0.11, resolves the conflicts and proves nothing got lost. Two local browser checks (layout and dark; motion with two accounts) and the staging walk-through follow.
- All UI _own build_ except the header (#428).

## 0.13 Glücksrad & Clip

The wheel, the clip and the Share image findings of the first production check, plus five Idea issues. Grilled on 2026-11-11 (`GLOSSARY.md`: Veto window, Clip, Veto allowance, Release; the „Deviation (0.13)“ notes in `docs/design_handoff_compies/` 02-components and 04-motion). Too big for one Release, so it ships as four, built strictly in this order; each is one spec with its own integration branch, changelog entry, „Was ist neu“ pop-up, Release review and staging walk-through (`docs/agents/release.md` § Semantic versioning). Sound enters the app in 0.13.3, which lifts it out of § Out of scope. Earlier decisions that contradict this section no longer hold.

### 0.13.0 Clip

Released on 2026-11-12 (`v0.13.0`). Spec: [#501](https://github.com/christried/compies/issues/501); tickets #505–#514, and #546, #549, #551, #555 from the review and the browser checks.

- **The clip raw:** in a Session the YouTube player takes no pointer and no keyboard input from anyone, so nobody pauses it, opens the „More videos“ shelf or follows a link. Nothing is laid over the player and nothing is cropped: YouTube's title shows for the first seconds, since no player parameter hides it and YouTube's developer policies forbid obscuring or blocking parts of the player. A player that pauses for any other reason resumes at the synced second. The Host keeps „Clip überspringen“; every Member keeps their own mute and „Für mich schließen“ (WCAG 1.4.2) and the remaining time. The clip preview in the game form stays operable: the Host seeks there.
- **A Veto during the clip** works as today (the Veto bar sits above the clip); a test pins it.
- **The Veto window lasts the clip length plus 30 s**, 30 s for a game without a Clip, for a spin and for a game the Host set with „Veto erlauben“. When the Host skips the Clip, the window ends 30 s after the skip if that is sooner; it never gets longer. Nothing a Member receives before the Draw's stop depends on the drawn game's clip length (Hidden wheel secrecy). No ADR: one rule, easy to change back.
- **Clips 10–120 s** (before: 5–60), default 30. The game form has Start, Ende and Länge: the two edited last hold and the third follows; when the form opens, Start and Länge hold. Stored stays start and length. A migration raises every clip length under 10 s to 10 s, from the same start, without a changelog line.
- **The Share image „Anzeigetafel“** (`14-share-image-redesign.md`, approved in [#357](https://github.com/christried/compies/issues/357)) replaces the „Poster“, for Events finished earlier too. _Own build_ from the note.
- All UI _own build_.

### 0.13.1 Kleinkram

Released on 2026-11-12 (`v0.13.1`). Spec: [#502](https://github.com/christried/compies/issues/502); tickets #453, #456, #457, #458, #465 (the Idea issues, rewritten) and #515–#518, and #573, #578 from the review and the browser check. The Idea issues that touch the same areas. Not built: [#550](https://github.com/christried/compies/issues/550), the Veto bar over the Clip on a phone held sideways, stays open.

- **The Veto allowance stays hidden** ([#453](https://github.com/christried/compies/issues/453)): always, without a setting. Until the Event's first Session starts, no Member but the Host gets the number from any API, and „So wird gespielt“ says „Vetos: Anzahl erst zum Start“. From the start on it stays visible, between Sessions too. A test calls the API as a Player.
- **„Speichern und noch eins“** ([#456](https://github.com/christried/compies/issues/456)): a second button on the create page only; it saves, shows the toast and empties the form with the cursor in the name. Nothing carries over.
- **The image crop** ([#457](https://github.com/christried/compies/issues/457)): after picking a file the tile shows it with drag to move and a zoom slider from „fits“ to 3×; arrow keys move it; what the tile shows is what is uploaded. No original is stored, so an existing image is adjusted by picking the file again. The slider is a small new control.
- **The player count** ([#458](https://github.com/christried/compies/issues/458)): the label says „(optional)“, and a minimum of 1 or 2 is not shown on cards and in the game dialog („2 bis 4“ reads „bis 4“, „ab 2“ shows nothing). Stored values and the player filter stay.
- **Strg + Enter saves the game form** ([#465](https://github.com/christried/compies/issues/465)) wherever it appears (create, edit, the stepper's sheet), from any field, with ⌘ + Enter on a Mac; on a blocked form it saves nothing and shows the field errors, as a click on „Speichern“ does. A new reusable **hint element** says so: a small „?“ in a circle at the form's top right that opens a popover (click or tap; Esc or a click outside closes it), shown only on devices with a fine pointer.
- All UI _own build_.

### 0.13.2 Show-Rad

Spec: [#503](https://github.com/christried/compies/issues/503); tickets #519–#529, the Compibert hand-off is [#525](https://github.com/christried/compies/issues/525).

- **The wheel's look:** the „Show-Rad“ (`reference/GameWheel.dc.html`, skin `show`; `Spec Changes.md` § Wheel look): bulb rim, pins at every slice edge, a hinged flapper. It keeps its colours in both Appearances, like the Coin flip; the card around it follows the Appearance.
- **Its motion** as `04-motion.md` § Lucky Wheel has it: bulbs blink at rest, chase during the spin and flash at the stop, the flapper kicks per pin, the winner slice and the result card pop, put back and refill redistribute the slices. The Hidden wheel's reveal and the removal stay as built.
- **The spin lasts 6 to 10 s**, drawn evenly by the server for each spin; there is no setting. The wheel makes more turns the longer it spins (5 at 6 s up to 8 at 10 s). Reduced motion keeps its calm last 1.2 s.
- **Compibert beside the wheel** is a _Claude Design hand-off_ with options to choose from: where he stands at 1440 and 390 px, how he enters and leaves, his poses at spin, brake and stop. It covers the wheel only: no voice, no `angry` at the veto reveal. It does not hold the cut: without an approved design when the wheel is done, 0.13.2 ships without him and he follows in a later patch.
- All other UI _own build_.

### 0.13.3 Ton

Spec: [#504](https://github.com/christried/compies/issues/504); tickets #530–#538, the listening session is [#535](https://github.com/christried/compies/issues/535).

- **Eleven cues:** the wheel's five (`wheel-windup`, `wheel-tick`, `wheel-stop`, `wheel-morph`, `wheel-slice-out`) and the Veto window's six (`veto-open`, `veto-clock`, `veto-clip-close`, `veto-seal`, `veto-drumroll`, `veto-reveal`), from `reference/docs/compibert-sound.md`. The coin, the Standings, the ceremony, drag, UI and Compibert's voice come later; so does ducking.
- **Where the sounds come from:** real files, CC0 or generated by us, chosen by ear in a joint session (`ready-for-human`): the agent prepares candidates per cue and a dev-only page that plays each one in its moment, the user listens and picks. One credits file in the repo names each cue's source; nothing needs a credit in the app.
- **Scheduling:** cues are scheduled ahead against server time on the audio clock, from the data and not from animation frames, so every device hears the stop at the same moment and a hidden tab plays them too wherever the browser lets a hidden page run. The motion's rule for a hidden tab stays.
- **Ton** stays one switch per device for the Clip and the cues, on by default, without a volume slider; its description on Profil becomes „Clips und Geräusche mit Ton“.
- **„Ton aktivieren“:** while Ton is on, a Session runs and the browser has not allowed sound yet, the stage shows a small notice; any tap or key press removes it. On a phone the same tap unlocks the Clip's sound.
- **Sound never holds a cut:** files that are not chosen yet delay 0.13.3 only.
- All UI _own build_.

## Out of scope for this roadmap

Free-for-all; Pick & Ban, Loser's Pick, Loser's Advantage; chat and emotes; sound before 0.13.3, and after it every cue but the wheel's and the Veto window's; push notifications; Compibert states outside the ceremony and the wheel (the party hat is an accessory, not a state); the boot splash (screen 01), the smoke background and the PWA install hint (screen 29; decided 2026-11-08); second provider, avatar upload and the settings 0.11 leaves out (Push, Sprache, Weniger Bewegung; T2b); account deletion in the app; Host permission admin page (T3, Hosts stay on the env allowlist); archive list (T16); battle replay; 3D podium; a public link to the Share image (a public URL would show the Team words in the Team names to anyone who has it; decided 2026-11-05); age-restricted videos playing embedded (not fixable: YouTube requires a signed-in viewer on youtube.com for age-gated videos, so such a game gets the card fallback the Glossary's Clip entry describes; from the production check of 2026-11-09).
