# Roadmap

Where COMPIES goes after „Mehr Termine“ (0.3): a polished **Teams** Event with the **Lucky Wheel**, an equal **Veto allowance** per Party, in-app scores and the **Award ceremony**. Agreed on 2026-10-28 in a grilling session. Re-planned on 2026-10-31, in the grilling for „Glücksrad“: the Releases were renumbered, „Notizen“ was split out, and **Rounds** were added. Terms follow `GLOSSARY.md`.

**Numbering.** Releases count from 0.1 while COMPIES is being built; 1.0.0 is the Release the user declares ready (`docs/agents/release.md` § Semantic versioning). Before 0.5.1 they were numbered 1.x: 1.0.0 is 0.1.0, 1.1.x is 0.2.x, 1.2.0 is 0.3.0, 1.3.0 is 0.4.0 and 1.4.0 is 0.5.0. Older specs, issues, reviews, ADRs and code comments keep the old numbers; in them, the planned 1.5 „Glücksrad“ is 0.7, 1.6 „Punkte“ is 0.8 and 1.7 „Siegerehrung“ is 0.9.

Each release is one spec and usable on its own. A release is grilled, specced and ticketed in one fresh session **while the release before it is being built**, once the code it builds on exists, never all releases up front: the specs name real modules and seams, and the first game night in the app will change what comes after. The first Event in the app needs at least 0.9 „Siegerehrung“ on production; there is no date pressure. This order replaces the 1.0 ticket order in `docs/design_handoff_compies/07-scope-and-tickets.md` for everything below; ticket numbers (T…) and screen numbers refer to that file and `03-screens.md`.

| Release | Name | Status |
|---|---|---|
| 0.4 (was 1.3) | Spielvorbereitung | released as 1.3.0 on 2026-10-29: [#138](https://github.com/christried/compies/issues/138), [#169](https://github.com/christried/compies/issues/169) |
| 0.5 (was 1.4) | Teams | released as 1.4.0 on 2026-10-31: [#153](https://github.com/christried/compies/issues/153), [#195](https://github.com/christried/compies/issues/195), [#206](https://github.com/christried/compies/issues/206) |
| 0.5.1 | Neue Nummern | released on 2026-11-01: [#215](https://github.com/christried/compies/issues/215), [#242](https://github.com/christried/compies/issues/242) |
| 0.6 | Notizen | released on 2026-11-01: [#217](https://github.com/christried/compies/issues/217) |
| 0.7 | Glücksrad | released on 2026-11-02: [#218](https://github.com/christried/compies/issues/218), [#263](https://github.com/christried/compies/issues/263) |
| 0.8 | Punkte | specced: [#272](https://github.com/christried/compies/issues/272) |
| 0.9 | Siegerehrung | outline; the minimum for the first Event |
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
  - Needed for the first Event, so it ships in a plain look; the motion and graphics wait for „Nach dem ersten Event“.
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

The Award ceremony; the minimum for the first Event. (T15; screen 19.)

- Started by the Host, seen by every Member at the same moment; late joiners jump in; the Host can start it again any time after the Event finished.
- 2D podium, confetti, Compibert dancing, server-picked gag, share image in landscape and square.
- An Event finished as „Unentschieden“ has several winners: every Party on the first rank stands on the top step and on the share image (ADR 0014).

## Nach dem ersten Event

Picked up right after the first Event played in the app; the issues are opened then, not before.

- Countdown motion and graphics: a _Claude Design hand-off_ (`docs/agents/design-handoff.md`).
- **Tags for games:** searchable and filterable in the library, for example genre, Co-op/Async, zeitsparend/zeitintensiv. Grilled then.
- **Prices for games:** the amount in €, its source (Steam, Epic, GOG, publisher website, Steam key, Free-to-play, a subscription such as Game Pass) and the date it was checked, because prices change. Grilled then.
- Mockup vs. live app: the user compares the reference designs with the live app and names every difference (`ready-for-human`); the differences become tickets.
- Wording sweep: the user goes over all copy in the app (`ready-for-human`), after every other ticket of this list.

## Out of scope for this roadmap

Free-for-all; Pick & Ban, Loser's Pick, Loser's Advantage; chat and emotes; sound; push notifications; Compibert states outside the ceremony; second provider, avatar upload and settings (T2b); Host permission admin page (T3, Hosts stay on the env allowlist); archive list (T16); battle replay; 3D podium.
