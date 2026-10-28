# Roadmap

Where COMPIES goes after 1.2.0: a polished **Teams** Event with the **Lucky Wheel**, an equal **Veto allowance** per Party, in-app scores and the **Award ceremony**. Agreed on 2026-10-28 in a grilling session. Terms follow `GLOSSARY.md`.

Each release is one spec and usable on its own. Only the next release is specced; each later one gets its own grilling once the release before it has shipped, because a real game night changes what comes next. This order replaces the 1.0 ticket order in `docs/design_handoff_compies/07-scope-and-tickets.md` for everything below; ticket numbers (T…) and screen numbers refer to that file and `03-screens.md`.

| Release | Name | Status |
|---|---|---|
| 1.3 | Spielvorbereitung | grilled, next to spec |
| 1.4 | Teams | outline |
| 1.5 | Glücksrad | outline |
| 1.6 | Punkte | outline |
| 1.7 | Siegerehrung | outline |

## 1.3 Spielvorbereitung

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
- Events created before 1.3 stay valid. Their Host sees „Event einrichten“, which opens the same steps as an editor. No Session can start without settings (enforced from 1.4).
- Before the first Session starts, everything is editable. After that, still editable: Game count, Veto allowance (never below the most any Party has spent), Team size (never below the fullest team), Hidden wheel, Game pool, Tiebreaker pool. Locked: Format, team count, points table, Selection mode.
- Hidden wheel switched off mid-Event reveals the remaining games to everyone; switched on, it hides undrawn games from then on.

**Event page**
- „So wird gespielt“ card for every Member, built from the stepper's „Fertig“ summary (`App Vorbereitung`, state Fertig).

**Hidden wheel secrecy** (brief §8)
- No client except the Host's ever receives the name, id, image or clip of an undrawn game, through any API. Players see neither the Game pool nor the Tiebreaker pool. Acceptance includes a test that calls the API as a Player.

**Human task**
- Fresh Cloudflare account, R2 bucket in Europe, keys in Vercel for staging and production, walked through by a `/wizard` script. Blocks the image upload.

## 1.4 Teams

Everyone in the lobby live; teams formed; a Session can start. (T6, T8, activity feed from T9; screens 09, 10, 27.)

- Realtime foundation per ADR 0012: Nuxt on Vercel, one PartyServer Worker with one room per Event, room tokens, presence, clock sync, reconnect. Postgres writes stay in Nuxt.
- Lobby game board: zones, drag and drop, online indicator, team names (open question 10 as designed), team colours.
- Starting a Session; the Event goes to running.
- Activity feed.
- To grill: when the Worker may be deployed (deploys drop every socket), EU jurisdiction, how exact the clip sync must be, staging Worker setup. Facts: `docs/research/realtime-hosting.md`.

## 1.5 Glücksrad

The game round up to „wird gespielt“. (T10; screens 11, 15, 30.)

- Lucky Wheel with server-drawn result, synced spin, Hidden wheel with placeholder names and the reveal.
- Admin pick and „Nächstes Spiel setzen“ in every mode; putting a drawn game back.
- Synced 30 s clip.
- Vetoes: Veto allowance per Party, at most one per Party per drawn game, 60 s window, sealed until the simultaneous reveal; with an allowance of 0, no veto window.
- Host-only pool warning. The Hidden wheel can't be switched during a spin or veto window.

## 1.6 Punkte

Scores in the app and a winner. (T13, T14; screens 16, 17, 18.)

- Result entry with placements and „gleichauf“, optional cosmetic scores, points table, live leaderboard, corrections.
- Tiebreaker from the Tiebreaker pool, with remaining Vetoes, Hidden wheel setting applies.
- The Event finishes per the Game count rules; afterwards the Event page is read-only with final standings and every game's result.

## 1.7 Siegerehrung

The Award ceremony. (T15; screen 19.)

- Started by the Host, seen by every Member at the same moment; late joiners jump in; the Host can start it again any time after the Event finished.
- 2D podium, confetti, Compibert dancing, server-picked gag, share image in landscape and square.

## Out of scope for this roadmap

Free-for-all; Pick & Ban, Loser's Pick, Loser's Advantage; chat and emotes; sound; push notifications; Compibert states outside the ceremony; second provider, avatar upload and settings (T2b); Host permission admin page (T3, Hosts stay on the env allowlist); archive list (T16); battle replay; 3D podium.
