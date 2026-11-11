# Review 0.13.0 „Clip“ (2026-11-11)

The diff `origin/staging...spec/501-clip` at the tip 19b9a68 is the integration branch of spec [#501](https://github.com/christried/compies/issues/501) with the tickets #505 to #511. It is a one-spec Release, so per `docs/agents/release.md` § Review, walk-through, retro, this review ran on the integration branch, and its fixes land before PR #542 merges into `staging`. Three read-only `sonnet` subagents reviewed it: Standards, Spec, and quality with architecture. No browser check ran before it: the browser checks are #512 and #513, in a local session.

## Result

- **No Must-fix on any axis.**
- **Shared findings**, each once, with all its ids:
  - Clip length of a game without a video, decided at two call sites and not in the reader: Q1, S3, P6.
  - Clip overlay's class-name guard, which jsdom cannot observe: Q3, S6, P5.
  - Order-dependent comparison case in the hidden-wheel test: Q10, S5, P4.
  - Legend assigned inside the games' `.map` callback: Q6, S7, P9.
  - `vetoEndAfterSkip` with no production caller: Q9, S9.
  - One-home row without the new SQL twin: Q8, S4.
  - `moreGames` key reused for the „+n weitere“ Winner band: S8, Q11.
  - #510 changelog line (five bands at 7 or 8 Winners): S2, P3, Q11.
  - Datenschutzerklärung sentence on the Ergebnis-Bild: S1, P1, Q11.
- The fixes are ticket [#546](https://github.com/christried/compies/issues/546). Two findings wait for the user: the Datenschutzerklärung's sentence (S1, P1) and the wide tie bar's label (P2).

## What happens to each finding

| Id | Severity | Finding | Outcome |
|---|---|---|---|
| S1 | Should-fix | The Datenschutzerklärung says the Ergebnis-Bild counts the Players; the new picture shows no count | open with the user |
| S2 | Should-fix | The #510 changelog line says every Winner gets a band; with 7 or 8 Winners the picture shows five and „+n weitere“ | fixed by the orchestrator on the integration branch (changelog line of #510) |
| S3 | Should-fix | The clip length that counts is decided twice in `server/utils/rounds.ts`; a video-less game with a stored length gets two lengths | fixed in #546 |
| S4 | Could | `CODING_STANDARDS.md` § One home does not name the new SQL twin `movedVetoEnd` | fixed in #546 |
| S5 | Could | Order-dependent test in `hidden-wheel-draw.test.ts`: the comparison case reads snapshots the cases before it fill | fixed in #546 |
| S6 | Could | The clip-overlay „nothing covers the player“ guard pins class names with an incomplete list | fixed in #546 |
| S7 | Could | `let legend` is assigned from inside `results.map(...)` in `shared/share-image.ts` | fixed in #546 |
| S8 | Could | `share.image.moreGames` is the string of the Winner band „+n weitere“ | fixed in #546 |
| S9 | Could | `vetoEndAfterSkip` has no production caller | left as it is: kept as the parity oracle, follows the `isDue` precedent |
| P1 | Should-fix | The same Datenschutzerklärung sentence, seen from the spec: its „no change“ rested on a fact that changed | open with the user |
| P2 | Should-fix | The wide tie bar's label is cut with „…“ when every Party won (3 or more) and the points have two digits | open with the user |
| P3 | Should-fix | The same #510 changelog line: every Winner a band is not true at 7 or 8; „links/rechts“ describes the wide format only | fixed by the orchestrator on the integration branch (changelog line of #510) |
| P4 | Could | The hidden-wheel comparison case depends on the order of the two cases before it | fixed in #546 |
| P5 | Could | The clip overlay's class regex is the weaker half of the „nothing over the player“ guard | fixed in #546 |
| P6 | Could | A game without a video whose stored clip length is above 30 s: the card can outlast the 30 s window | fixed in #546 |
| P7 | Could | Dates count distinct Berlin days, the note counts Sessions | left as it is: a reasonable build decision, no fix needed |
| P8 | Could | The „altAll“ tie text is not in the note | left as it is: the text is old, already on staging, not new in the diff |
| P9 | Could | The legend is assigned from inside the games' `.map` callback | fixed in #546 |
| P10 | Could | Stale „60 s“ Veto window in `docs/agents/delivery.md`, and a changelog sentence about the migration | split: fixed in #546 (`delivery.md` half); left as it is (#507 changelog sentence, a judgement call: keep or drop) |
| Q1 | Should-fix | The clip length of a video-less game is decided at two call sites and not in the reader; the card can outlast the window | fixed in #546 |
| Q2 | Should-fix | A stale `WINDOW_MS` (the value for a game without a video) in `hidden-wheel-draw.test.ts`, whose games have a video | fixed in #546 |
| Q3 | Should-fix | `clip-overlay.test.ts` pins class names to guard a rule jsdom cannot observe | fixed in #546 |
| Q4 | Could | `vetoView` takes a boolean `windowGameKnown` that `game` already says | left as it is: a taste change, the behaviour is right |
| Q5 | Could | `null` on the wire means „not known yet“ for a Member and „no window“ in the client | left as it is: works by coincidence, not worth a change before 0.13.0 |
| Q6 | Could | The legend is assigned from inside the games' `.map` callback | fixed in #546 |
| Q7 | Could | Renderer duplication (`gameRow`) and a cast in `server/utils/share-render.ts` | left as it is: a cleanup with no behaviour change |
| Q8 | Could | `CODING_STANDARDS.md` § One home is not updated for the new twin | fixed in #546 |
| Q9 | Could | `vetoEndAfterSkip` has no production caller and a different return contract than its SQL twin | left as it is: a taste choice, consistent with `isDue` |
| Q10 | Could | The order-dependent comparison case in the hidden-wheel test | fixed in #546 |
| Q11 | Could | Small drift in names and copy: the `moreGames` key, a second `Intl.Segmenter`, the #510 changelog line, the Datenschutzerklärung sentence | split: fixed in #546 (copy key, second Segmenter); fixed by the orchestrator on the integration branch (changelog line of #510); open with the user (Datenschutzerklärung) |

## Standards

Axis: Standards (CODING_STANDARDS.md, GLOSSARY.md, ADR 0013 and 0014, CLAUDE.md, docs/agents/release.md § Changelog lines, smell baseline). Diff: `git diff origin/staging...origin/spec/501-clip` (49 files). Tip: 19b9a68.

### Must-fix

None.

### Should-fix

**S1. The Datenschutzerklärung still says the Ergebnis-Bild counts the Players.**
`i18n/locales/de.json:1250` (`legal.datenschutz.events.text`): „Es zeigt Namen und Datum des Events, wie viele Leute mitgespielt haben, die Tabelle mit Teamnamen und Punkten und die gespielten Spiele …“. The new picture shows no count (`shared/share-image.ts` drops `members`; `server/utils/share-image.ts`: „No Member is here: the picture names no Player and, since #510, does not count them“; test „has no Player count“). The sentence now describes data the picture does not show, and says „Datum“ for what is a list of up to three days or „n Termine“.
Standard: CODING_STANDARDS § Secrecy (a picture that Members get is checked against every section of the Datenschutzerklärung that says who sees what) and § Copy (copy promises only what the app does). The spec says „no change“; the diff makes that wrong, and the privacy text is the one place where the user approves the wording.
Harm is low (the text over-states, it does not under-state). Smallest fix: one sentence changed („… Namen und Termine des Events, die Tabelle …“) with the user's approval, plus a changelog line like #446's, in a ticket before the cut.

**S2. The #510 changelog line promises more than the picture does.**
`CHANGELOG.md:25`: „Endet ein Event unentschieden, bekommt jeder Sieger ein eigenes Band“. With 7 or 8 Winners the picture draws five bands and „+n weitere“ (`shared/share-image.ts:300-302`, `TIE_BANDS_SHOWN_WHEN_FOLDED = 5`). Standard: release.md § Changelog lines and CODING_STANDARDS § Copy. Smallest fix: „… bekommt jeder Sieger ein eigenes Band, ab sieben Siegern die ersten fünf und „+N weitere““. Also „ohne Kapseln und Chips“ in the same line is design jargon, not plain German for Users (Could).
ADR 0014's consequence („the share image show every Party on the first rank“) is met in the alt text (all 8 named) but not in the drawing for 7 or 8 Winners; the note (14-share-image-redesign.md, row 7–8) decides it. One sentence in the ADR or the glossary keeps the standards in step with the note.

**S3. The „clip length that counts“ is decided twice in `server/utils/rounds.ts` and not at all in the Clip's window; a video-less game with a long stored length gets two different lengths.**
`server/utils/rounds.ts:80`: `clipLength: game.youtubeId === null ? null : game.clipLength` and `:113`: `clipLength: drawn && drawn.youtubeId !== null ? drawn.clipLength : null` (the same rule twice), while `shared/draw-timeline.ts:135` `clipWindow(draw, { clipLength })` and `server/utils/clip.ts` (`readClip`) use `game.clipLength` whatever the video. The form shows Start, Ende and Länge without a link (`GameForm.vue`), so a Host can store 120 s on a video-less game: its card runs 120 s, its Veto window ends at 30 s and the Vetoes are revealed while the card still shows. GLOSSARY § Clip says „a Party can cast its Veto while it plays“; § Veto window says „30 seconds for a game without a Clip“. This is decision 4 of #505 (known, open with the user); the standards part is the duplicate rule outside „One home“ (CODING_STANDARDS: a Draw's instants and what each decides live in `shared/draw-timeline.ts`).
Smallest fix: one pure function in `shared/draw-timeline.ts` (`clipLengthOf(game): number | null`, null without a video) called by both writers and by `clipWindow`'s caller; this also settles the user's question the cheap way (the card shows 30 s for a video-less game). If the user wants the card to keep its stored length, the function still removes the duplicate.

### Could

**S4. `CODING_STANDARDS.md` § One home does not name the new SQL twin.** Row „A Draw's instants …“ (line 23) lists „its SQL twins `stoppedDraws` and `dueDraws`“; the diff adds `movedVetoEnd` (`server/utils/draw-timeline.ts:40`) and `vetoEndCap` / `vetoEndAfterSkip` (`shared/draw-timeline.ts`), pinned by `test/integration/draw-timeline.test.ts`. Add `movedVetoEnd` to the row so the next surface of the window's end finds it.

**S5. Order-dependent test.** `test/integration/hidden-wheel-draw.test.ts:442`: the comparison case reads `snapshots` that the two `it.each` cases before it fill, and throws when run alone. It cannot pass silently (it fails loudly), so it is not a „test that cannot fail“; but `-t`, a re-run of one case or a shuffle breaks it. Smallest fix: one `it` that calls `spunWith(20)` and `spunWith(50)` (both worlds are already built per call) and compares, or build the snapshots in `beforeAll`.

**S6. The clip-overlay „nothing covers the player“ guard pins class names with an incomplete list.** `test/nuxt/clip-overlay.test.ts:454`: `/(absolute|fixed|sticky|inset-\S+|z-\S+|layer-\S+|translate\S*|scale\S*|-m\S*)/`. It misses `top-*`, `left-*`, `right-*`, `bottom-*`, arbitrary `[…]` variants and inline `style`, so a cover written with those passes. The structural lines above it (`wrapper.children` is exactly the stage, the stage has exactly the iframe, `querySelectorAll('*')` length 1) carry the real guard and are sound; the regex adds a false sense. Smallest fix: keep the structural asserts, add `top|right|bottom|left` to the regex and assert no descendant has a `style` with `position`, or drop the regex.

**S7. Side effect inside `.map` (Mutable state in a callback, baseline smell, judgement call).** `shared/share-image.ts:327-330`: `let legend` is assigned from inside `results.map(...)`. TypeScript narrows `legend` to `null` at its use in the returned object, so a later reader (or a lint tightening) can be misled. Smallest fix: `const firstTied = results.find(...)` before the `.map`, then build the legend from it.

**S8. Mysterious Name: `share.image.moreGames` is the string of the Winner band „+n weitere“** (`shared/share-image.ts:302`), the games' string reused for Winners. Works because the text is the same; a reworded „+n weitere Spiele“ would break the Tie bands. Smallest fix: a `moreWinners` key (or rename the key `more`).

**S9. `vetoEndAfterSkip` has no production caller** (`shared/draw-timeline.ts`, `@public`, „the route uses the SQL twin“). Kept as the parity oracle for `movedVetoEnd` with the same wording as `isDue`, so it follows precedent; named only for the maintenance cost of two implementations of one rule.

### Checked and sound

- **ADR 0013 (timers, time-gated reads):** no server timer; `skipClip` writes `clipSkippedAt` and the moved end with the request's `now` in one `UPDATE` under `changeEvent` (`server/utils/clip.ts`); `movedVetoEnd` is a `CASE`, not `LEAST` (a draw without a window stays without one), with the parity test at the boundary. `ClipOverlay`'s `resumeTimer` is a device-local player timer like `driftTimer`, not an outcome of the Event.
- **Secrecy:** the window's end is the drawn game's clip length plus 30 s, so it is a fact of the game: `vetoView` sends it only with `windowGameKnown` (`drawGameKnown`), null for a Member before the stop (`server/utils/stage-read.ts:185`); `useVetoClock` and `event-stage` handle null; the Hidden wheel test compares two worlds that differ only in clip length, field for field, over the Player's reads, feed and room. The read of the drawn game under the lock in `spinWheel` happens only when a window opens (budget `LOCK_BUDGET = 16` in `lock-statements.test.ts` is a ceiling, route covered).
- **One home:** the 30 s lives once in `shared/draw-timeline.ts` (`VETO_AFTER_CLIP_MS`, `vetoEndCap`); `clockText` is reused by `VetoWindow` (no second `m:ss`); `parseClipTime` takes a `max` instead of a copy; the Ende rule lives in `app/utils/clip-fields.ts` because Ende is never stored or sent (documented in the header; CODING_STANDARDS puts only rules both sides enforce into `shared/`); bounds stay in `shared/game.ts` and the server parser uses them.
- **Database:** migration 0034 is data only, adds no column or index, has no CHECK on purpose and states why (ADR 0007 switch-over, old code can write 5 to 9 s); journal idx 34, tag matches the file, snapshot 0034 differs from 0033 only in `id`/`prevId` (chain correct); a migration test covers 5, 9, 10, 60 and the old-code write.
- **Glossary and copy:** UI words „Veto-Fenster“, „Clip“, „Ergebnis-Bild“ are used; no retired word added (`copy.test.ts` change only swaps a NEVER_ONE entry for the new `datesMany`); removed keys (`winsOne`, `people`, `person`, `pts`, `moreParty` …) have no remaining reference; no remaining „60 Sekunden“ or „5 bis 60“ in `i18n/locales/de.json` or `app/`. The six reworded Veto strings and four new clip-field strings break no standard (the user approves only third-party/privacy text by § Copy); they belong on the #513 walk-through list as the frame says.
- **Changelog (release.md):** four lines under `### Geändert` in `## [Unreleased]`, groups and order valid, German for Users, issue references as links, bullets one level; #505/#506, #507/#508, #509, #510 each covered; no line for the tickets' tests. Only S2 above is wrong in content.
- **ADR 0014 (Ties):** the picture handles 1 to 8 Winners; ties with „beide / alle k gleichauf“, shared Standings ranks (1, 1, 3) and no Tiebreaker wording; alt text names every Winner.
- **Tests (CODING_STANDARDS § Tests):** share image model tests cover 0, 1 and 2+ games, 60-character names, 8 Parties of 77 characters, the slot edges (6/8 games, 4/6 Parties) and the font tier edges (14/15/22/23); `toMatchObject` used for stored rows in the migration test; no new Member rendering needing a picture.
- **Motion:** no new animation; the clip's own timing assertions unchanged.

### Not verified

- No browser: the look of the overlay, the form's three-column layout, the Anzeigetafel and the tie bar's „…“ (#512, #513).
- I did not run the test suite; CI is the runner.

## Spec

Axis: Spec (does the diff do what #501 and #505 to #511 ask, all of it and nothing else). Diff: `git diff origin/staging...origin/spec/501-clip` (49 files). Tip: 19b9a68. Read-only; I ran no test suite (the worktree has no `node_modules`), so every verdict below is from reading code and tests at the tip.

Headline: no Must-fix. The Veto window rule, the skip, the secrecy gate, the migration, the clip fields rule and the overlay do what the spec asks, and I found no reader of the window's end that bypasses the stored, moved end. Three Should-fix (a false sentence in the Datenschutzerklärung, a truncated tie-bar label, an inexact changelog sentence) and several Could.

### Must-fix

None.

### Should-fix

#### P1: the Datenschutzerklärung says the Ergebnis-Bild shows how many people played; the new picture does not
- `i18n/locales/de.json:1250` (`legal.datenschutz.events.text`): „Es zeigt Namen und Datum des Events, wie viele Leute mitgespielt haben, die Tabelle mit Teamnamen und Punkten und die gespielten Spiele, aber keine Anzeigenamen und keine Profilbilder.“
- Spec #501: „Datenschutzerklärung: no change … the picture shows what it showed.“ That premise no longer holds: `ShareImageSource` lost `members` (`shared/share-image.ts`, `server/utils/share-image.ts`) and the test „has no Player count“ (`test/unit/share-image.test.ts:96`) pins it. The legal text now names data the picture does not show.
- Why it matters: a published privacy text must say what the app does. The error is on the harmless side (it over-states), but it is wrong, and the spec's „no change“ rested on a fact that changed.
- Smallest fix: delete „wie viele Leute mitgespielt haben,“ and read „Namen und Datum des Events, die Tabelle …“. Needs the user's approval (legal text, spec says „no change“); #510's comment already recommends it.

#### P2: wide tie bar's label is cut with „…“ when every Party won (3 or more) and the points have two digits
- `server/utils/share-render.ts:215-228` (`tiePanel`, bar: `line({}, panel.label)` next to the „je {p} Punkte“ group) and `shared/share-image.ts` (`labelAll`).
- Source: #511's comment (build session rendered it): „UNENTSCHIEDEN · ALLE 3 GLEICHA…“ at 14 points, „… ALLE 8 GLEICHA…“ at 10. Ticket #511 asks for the labels „as `14-share-image-redesign.md` § Winner states“; a cut label is not that. I could not render it here (Not verified), I take the numbers from the comment.
- Why it matters: a Tie where everybody tied, the case that most needs its label, shows a broken word on the picture a Member shares.
- Smallest fix, a design choice for the user: in this one case a shorter label (`Alle {k} gleichauf`, drop „Unentschieden · “), or smaller `letterSpacing` for the bar, or a Claude Design hand-off for the bar. Do not ship it unseen: check on #513.

#### P3: the changelog line of #510 says every Winner gets a band; with 7 or 8 Winners there are five bands and „+n weitere“
- `CHANGELOG.md:25`: „Endet ein Event unentschieden, bekommt jeder Sieger ein eigenes Band“.
- Also in the same line: „links in der Teamfarbe der Sieger … rechts die Tabelle und die gespielten Spiele“ is the wide format; the square has the panel on top and the table and games below.
- Why it matters: `CODING_STANDARDS.md` § Copy (copy promises only what the app does); the ticket text itself (#511) says „at 7 or 8 Winners five bands and „+{n} weitere““.
- Smallest fix: „… bekommt jeder Sieger ein eigenes Band (bei mehr als sechs Siegern die ersten fünf und „+N weitere“)“; drop „links/rechts“ for „daneben oder darunter“.

### Could

#### P4: the hidden-wheel comparison case depends on the order of the two cases before it
- `test/integration/hidden-wheel-draw.test.ts:~437-444` (`snapshots` Map filled by `it.each(CLIPS)`, read by the next `it`). Judged: it is not a test that cannot fail. It throws a clear error when run alone, `vitest.config.ts` has no shuffle or concurrency, and the two `it.each` cases already assert the direct fact (`vetoEndsAtBeforeStop` is null, no `clipLength` string in any read). The comparison does catch a leak of the end (the reads would differ).
- Smallest fix: one `it` that loops `for (const clipLength of CLIPS)` and compares at the end, so a `-t` filter cannot split it.

#### P5: the clip overlay's class regex is the weaker half of the „nothing over the player“ guard
- `test/nuxt/clip-overlay.test.ts` (`covering = /(^|\s)(absolute|fixed|sticky|inset-\S+|z-\S+|layer-\S+|translate\S*|scale\S*|-m\S*)(\s|$)/`). The structural assertions beside it carry the rule: the wrapper has exactly one child (the stage), the stage exactly one child (the iframe), the bar and every button come after the wrapper in document order. The regex adds a class-name list that misses `top-*`, `left-*`, `bottom-*`, `grid` stacking and a `style` attribute, and it will fail on a harmless class later.
- Smallest fix: keep the structure assertions, drop the regex or add `style` and `top|left|right|bottom` to it. Not a defect now: I read `ClipOverlay.vue` and no element lies over the player.

#### P6: a game without a video whose stored clip length is above 30 s
- `server/utils/rounds.ts:80,113` (`game.youtubeId === null ? null : game.clipLength`), `server/utils/clip.ts:30` (`clipWindow(latest.draw, latest.game)` uses the stored length). The card shows for the stored length, the window is 30 s (#505, decision 4). Spec #501: „30 s for a game without a Clip“ and story 11 „show its card as before“; both hold, but the card can outlast the window by up to 90 s. Reachable when a Host removes the link of a game that had a long clip.
- Smallest fix if the user wants the two to agree: `clipWindow` takes `min(clipLength, 30)` for `youtubeId === null`, or the form resets the length to 30 when the link goes. Leave it if not.

#### P7: dates count distinct Berlin days, the note counts Sessions
- `shared/share-image.ts` `dateText` (`days` de-duplicated by `berlinDay`), pinned by `test/unit/share-image.test.ts:224,245`. Note § Overflow rules: „1–3 Sessions joined ‘ · ’; 4 or more → ‘{first} – {last} · {n} Termine’“. Four Sessions on three days read „3“ days listed. Decision of the build (#510 comment 2); reasonable for a picture that shows days. Confirm with the user, no fix needed otherwise.

#### P8: the „altAll“ tie text is not in the note
- `i18n/locales/de.json` `share.image.tie.altAll` / `whoBoth` / `whoAll`, built in `shared/share-image.ts` (`below.length === 0` branch). The note has one tie alt: „Unentschieden bei {event}: {names} gewinnen mit je {p} Punkten.“; #511: „The alt text for a Tie as the note has it“. The extra sentence („Beide Parteien gewinnen mit je 10 Punkten: A und B.“) is old (on staging already), not new in the diff, but the spec says the note wins. Smallest fix: use `tie.alt` for both cases, delete the three strings and the test line.

#### P9: the legend is assigned from inside the games' `.map` callback
- `shared/share-image.ts` (`let legend: ShareLegend | null = null` set in `results.map(...)`). Works (tested, including a tied game behind „+n weitere“), but a side effect in `map` and TypeScript narrows `legend` to `null` at the return. Smallest fix: `const firstTied = results.find(...)`, then build `legend` from it.

#### P10: stale 60 s in a repo doc, and a changelog sentence for the migration
- `docs/agents/delivery.md:37`: „a wait across a 60 s Veto window“; the window is now 30 to 150 s.
- `CHANGELOG.md:22` („Ein Clip, der kürzer als 10 Sekunden war, läuft jetzt 10 Sekunden ab derselben Stelle.“): #507 says „The migration gets none“. The sentence is in the line for the new bounds, so it is a judgement call; keep it or drop it.

### Checked and sound

- **The Veto window's end.** `shared/draw-timeline.ts` `drawInstants` is the one writer: stop + `clipLength*1000` + 30 s, or stop + 30 s (`clipLength` null), only with `windowOpens`. Both callers pass the drawn game's length, `null` for `youtubeId === null` (`server/utils/rounds.ts:80,113`); the spin's extra read happens only when a window opens. Unit tests cover spin and set for 10, 30, 120 and null at every edge (`test/unit/draw-timeline.test.ts`, `CASES`).
- **The skip.** `server/utils/clip.ts:51` stores `clipSkippedAt` and `vetoEndsAt: movedVetoEnd(now)` in one UPDATE. The SQL twin is a `CASE`, not `LEAST` (a draw without a window stays without one; test „leaves a draw without a Veto window without one“). `vetoEndCap` holds the 30 s once. A skip is at or after the stop (the clip runs from it), so `draws_instants_check` (`veto_ends_at >= stop_at`) holds. A skip with less than 30 s left or after the end changes nothing (tests at the 30 000 / 30 001 ms edges, JS and SQL parity at every boundary millisecond, `test/integration/draw-timeline.test.ts`).
- **Every reader reads the stored end.** `grep vetoEndsAt` over `app server shared`: the cast check (`vetoReason`), the seal (`vetoesSealed`, `knownVetoRows`), `revealed` (`windowEnded`), the settle (`dueDraws`, `settleAt`), the allowance floor (`event-state.ts:415`), the stage's instants (`app/utils/event-stage.ts:112,120`) and the clock (`useVetoClock`) all take the column or the read's `vetoEndsAt`. No other constant of 60 s or 30 s decides a window. Integration tests: a cast just before and from the moved end, sealed until it, revealed at it (feed too), settle at it, a second skip and a skip during the spin move nothing (`test/integration/vetoes.test.ts`, „after the Host skips the clip (#506)“).
- **Secrecy.** `server/utils/stage-read.ts` `vetoView` sends `vetoEndsAt` only when `windowGameKnown` (= `drawGameKnown`: the Host always, others from the stop, inclusive). Nothing else a Member gets before the stop carries the length: `readClip` selects through `stoppedDraws`; the Host-only pool faces carry `clipLength`; the room only relays `event.changed`; `push.drawn.body` has no reader and now states no length. `test/integration/hidden-wheel-draw.test.ts` reads event, feed and room at the commit, mid-spin and stop − 1 ms for two worlds that differ only in clip length and compares them after normalising ids, and asserts the Host has the end before the stop and the Player only at it. Client side: `useVetoClock` takes a `null` end (window neither open nor ended), `stageUnsettled` waits at the stop until the end arrives (`test/nuxt/event-stage.test.ts`).
- **The migration.** `drizzle/0034_clip_length_floor.sql` is the next number after 0033 on staging, journal idx 34 with a later `when`, snapshot present; data only, `clip_start` untouched, no CHECK. The previous deployment can still write 5 to 9 s after it ran; the build keeps that legal (no CHECK, no clamp), such a game plays its stored length with the window length + 30 s, and the form refuses to save it until the Host sets 10 to 120 (`openClipFields` puts Länge in error; form test „opens an old 5 s row with Länge in error and does not save it“). Draws the previous deployment stored keep their 60 s end; every reader works from the stored column, so the two versions do not disagree. A cached older client receiving `vetoEndsAt: null` before the stop shows no window until it reads at the stop (it guards on `null` in `windowOpen`); transient, no finding.
- **Clip fields.** `app/utils/clip-fields.ts`: `held` is `[older, newer]`; editing the follower drops the older, editing the older swaps, editing the newer keeps. Ende 2:00 then Länge 60 gives Start 1:00 (unit test „the ticket example“). Opening: Start and Länge held, Start counts as edited last, so the first edit of Ende makes Länge follow. Errors sit on the follower (`end_before_start` on Länge, `start_before_zero` on Start, 10 to 120 on Länge). Bounds in `shared/game.ts`: `CLIP_LENGTH_MIN = 10`, `CLIP_LENGTH_MAX = 120`, parser tests 9 and 121 refused, 10 and 120 accepted, default 30. The form sends start and length only (`draft`), never Ende.
- **The synced Clip.** `ClipOverlay.vue`: stage `inert` + `pointer-events-none`, `disablekb: 1`, `controls: 0`, `modestbranding` gone; the player wrapper holds only the stage, the stage only the iframe; bar and buttons follow it in the DOM. A reported PAUSED (after the first PLAYING, open, more than 1 s before the end) calls `playVideo()` then `seekTo(synced second)`, at most once a second; the one-shot drift check is unchanged. Mute, „Ton aktivieren“, „Für mich schließen“, the Host's skip are outside the inert part and tested. `ClipPreview.vue` is untouched and its tests are unchanged, so the form's preview stays operable.
- **A Veto while the Clip plays** (#509 AC): three integration tests (spin, last millisecond, a set game with „Veto erlauben“), accepted and sealed from the other Party.
- **The Share image against the note.** I compared `LAYOUT` in `server/utils/share-render.ts` and the tier tables in `shared/share-image.ts` with `14-share-image-redesign.md` line by line: header (92 / 196, kicker, divider 3 × 44, Event tiers 30 / 24 wide and 46 / 34 / 34 × 2 square), panel (600 × border 6; 420 × border 8), Winner name tiers (96 / 80 / 56; 112 / 92 / 64, ≤ 10 never broken), points 72 / 22 and 80 / 26, Compibert 200 and 260, sunburst 340 at right 24 bottom 12, tie bar 52 / 64, bands border 3 / 3.5 with marks 34/18 and 44/24, band font tables (72/52/38, 88/68/52, 56/44/34, 68/56/44, 36/32/28, 40/36/32), tier cut-offs 14 / 22 by the longest drawn name of all Winners, Standings slots 4 / 6 (8 Parties wide: 2, 3, „+4 weitere Parteien“, 8) and the rows' numbers, game slots 6 / 8 (12 games: 5 + „+7 weitere“ wide, 7 + „+5 weitere“ square), stripe 10/24, 12/28, legend 10/20, 12/24 of the first tied game's first two Parties, „· n gleichauf“ from 5, stripe at most 4, 7 or 8 Winners five bands + „+n weitere“, hidden Standings when all on rank 1, labels („beide gleichauf“, „alle k gleichauf“). The marks' border of 3 on the square's 36 and 44 marks is the reference's (`ShareImage.dc.html` lines 251, 269), not a slip. The alt text for one Winner is the note's (with „1 Punkt“ for 1) and the Tie's is the note's (P8 aside). Always light, rendered per request, Member-only routes unchanged; `members` is gone from the source, so the picture says nothing about any Player.
- **The note's table vs story 30.** For a Tie of exactly 6 Winners story 30 („up to five, ‘+N weitere’ beyond“) would give five bands and „+1 weitere“; the code gives six bands per the note's table and #511's own text. The ticket governs, the decision is on #511; sound.
- **Scope.** Nothing unasked in the diff beyond the six reworded Veto strings and four new clip-field strings (both listed by the build as the orchestrator's decisions, each one needed for the copy not to promise 60 s or to say the new field), `CLIP_END_MAX` (needed for Ende), and test helpers. The clock's text now reads „Noch 2:30“ in both the window and the bar; `clockText` existed.

### Not verified

- The Share image's pixels and Satori's actual layout (P2 included): no render, no browser; #513.
- The Clip in a real YouTube iframe (inert, pause, title, Tab order): #512.
- The full test suite and `typecheck`, `lint`, `knip`: not run here (no `node_modules`); I read the tests only.
- That `LOCK_BUDGET = 16` (`test/integration/lock-statements.test.ts`) still holds with the spin's added game read: the test is unchanged in the diff, the build sessions report CI green.

### Traceability

| Story / criterion | Covered by (file, test) |
|---|---|
| 1 keeps playing on tap | `clip-overlay.test.ts` „shuts the player's container to pointer input and focus“ (browser: #512) |
| 2 no shelf / share link | `ClipOverlay.vue` (inert, `rel: 0`, pause resumed); `clip-overlay.test.ts` „a paused player is resumed“, „asks the player for no keyboard, fullscreen or related videos“ |
| 3 tap leaves the page | same inert/pointer test (browser: #512) |
| 4 no key, no focus | `clip-overlay.test.ts` „leaves nothing to focus but the bar's buttons“ |
| 5 mute | `clip-overlay.test.ts` „mutes and unmutes the player without sending anything“ |
| 6 Für mich schließen | `clip-overlay.test.ts` „closes the clip for this device only“ |
| 7 remaining time | unchanged progress bar, `clip-overlay.test.ts` „the motion of the running clip“ |
| 8 Host skips for everyone | `clip-overlay.test.ts` „is offered to the Host“; `clip.test.ts` skip tests |
| 9 pause resumes at synced second | `clip-overlay.test.ts` „plays again at the synced second“, gap, last-second, closed cases |
| 10 Ton aktivieren | `clip-overlay.test.ts` „starts muted on a phone and asks for the tap“, „keeps „Ton aktivieren“ outside the inert part“ |
| 11 no video / cannot play: card | `clip-overlay.test.ts` „a game without a video“ (three cases) |
| 12 preview stays operable | `ClipPreview.vue` untouched, its tests unchanged (`git diff` shows none) |
| 13 Veto during the Clip | `clip.test.ts` „a Veto during the clip (#509)“ (3 cases) |
| 14 window = clip + 30 s | `draw-timeline.test.ts` (unit) `drawInstants` it.each; `vetoes.test.ts` „the length of the Veto window follows the clip (#505)“ |
| 15 30 s without a Clip | same, `clipLength: null`; „ends a set game without a video 30 s after the commit“ |
| 16 same rule for a set Draw | `draw-timeline.test.ts` set cases; `vetoes.test.ts` „ends a game the Host sets with „Veto erlauben“ and a 10 s clip 40 s after the commit“ |
| 17 skip ends the window 30 s after | `draw-timeline.test.ts` `vetoEndAfterSkip`; `vetoes.test.ts` „carries the moved end in every read of a spin / set draw“ |
| 18 skip never lengthens | `draw-timeline.test.ts` „never moves the end later“, edge tests; `vetoes.test.ts` „never moves the end later“ |
| 19 clock in m:ss | `veto-window.test.ts` „shows a window of 150 s as „Noch 2:30““; `veto-bar.test.ts` „shows the clock of a window of 150 s as 2:30“; `test/unit/veto-bar.test.ts` `clockText` |
| 20 Hidden wheel secrecy | `hidden-wheel-draw.test.ts` „the drawn game's clip length (#505)“ (P4 on its order); `event-stage.test.ts` „reads again at the stop for a Member's read before it“ |
| 21 sealed until the (moved) end | `vetoes.test.ts` „keeps the Vetoes sealed … until the new end“, „keeps a cast sealed … until the moved end and reveals it at that instant, in the feed too“ |
| 22 Clip of 10 to 120 s | `game.test.ts` 9 / 121 refused, 10 / 120 accepted; `game-form.test.ts` „does not accept a length outside 10 to 120 seconds“ |
| 23 Start + Ende gives Länge | `clip-fields.test.ts` „Länge then Start: Ende follows“ family; `game-form.test.ts` „sets Länge when Start and then Ende are typed“ |
| 24 Ende + Länge gives Start | `clip-fields.test.ts` „Ende then Länge: Start follows (the ticket example)“; `game-form.test.ts` „moves Start when Ende and then Länge are typed“; `event-stepper-pools.test.ts` (sheet) |
| 25 follower at once, errors | `clip-fields.test.ts` „the errors“; `game-form.test.ts` „the error sits on the field that followed“ (5 cases) |
| 26 opening state | `clip-fields.test.ts` „opens a stored game as stored, Ende worked out“; `game-form.test.ts` „opens an existing game as stored“ |
| 27 under 10 s becomes 10 s | `clip-length-migration.test.ts` „raises 5 s and 9 s to 10 s“, „keeps the start“; `game-form.test.ts` „opens an old 5 s row …“ |
| 28 no pills | `share-image.test.ts` (model has no chip/pill fields); `share-render.test.ts` renders; look: #513 |
| 29 Winner panel, name, points | `share-image.test.ts` „the Winner panel“, „the Winner name“; `integration/share-image.test.ts` |
| 30 Tie bands up to five, „+N weitere“ | `share-image.test.ts` „a Tie“ → „the bands“ (note's table, k = 6 differs from the story text, see Checked) |
| 31 rows never overflow | `share-image.test.ts` „the Standings“, „the games“, „the worst case“; `share-render.test.ts` `worst` (ellipsis itself: #513) |
| 32 tied game stripe + „gleichauf“ | `share-image.test.ts` „splits the stripe …“, „has the legend …“ (4 cases) |
| 33 Events finished before | `integration/share-image.test.ts` (render from current state, no stored picture); no migration needed |
| 34 both formats, alt text | `integration/share-image.test.ts` (wide + square PNG sizes, Tie of 3 of 4), `share-image.test.ts` „the alt text“, `share-dialog.test.ts` alt |
| #505 AC unit tests timeline | `draw-timeline.test.ts` (unit) |
| #505 AC SQL parity | `integration/draw-timeline.test.ts` (24 stored Draws, 10 / 30 / 120 / null) |
| #505 AC Hidden wheel reads | `hidden-wheel-draw.test.ts` (P4) |
| #505 AC cast accepted until / refused from the end, settle | `vetoes.test.ts` „ends a game the Host sets …“, „settles a spin of a game with a 120 s clip at its end“ |
| #505 AC component 150 s = 2:30 | `veto-window.test.ts`, `veto-bar.test.ts` |
| #505 AC browser items #512 / changelog | posted by the orchestrator / `CHANGELOG.md:22-24` (P3, P10) |
| #506 AC unit + parity | `draw-timeline.test.ts` `vetoEndAfterSkip`; `integration/draw-timeline.test.ts` „the SQL twin of the moved end“ |
| #506 AC integration (read, sealed, cast, settle) | `vetoes.test.ts` „after the Host skips the clip (#506)“ (5 cases + never-later group) |
| #506 AC component: clock follows moved end | `veto-window.test.ts` „follows a read whose end moved“, „waits for the reveal at once when the moved end is already past“; `veto-bar.test.ts` „leaves at the moved end“ |
| #506 AC changelog extended | `CHANGELOG.md:24` |
| #507 AC parser, migration, form, help text, changelog | `game.test.ts`; `clip-length-migration.test.ts`; `game-form.test.ts` („says the length is at most 120 seconds“); `CHANGELOG.md:23` |
| #508 AC rule, form, error, saved game | `clip-fields.test.ts`; `game-form.test.ts` „clip fields (#508)“ (incl. „sends the start and the length only, never Ende“); `event-stepper-pools.test.ts` |
| #509 AC overlay tests | `clip-overlay.test.ts` „no input (#509)“, „a paused player is resumed (#509)“ (P5) |
| #509 AC nothing over the player | `clip-overlay.test.ts` „puts nothing over, under or around the player“ |
| #509 AC Veto during the Clip | `clip.test.ts` |
| #509 AC preview tests unchanged | no diff in the preview's tests |
| #509 AC changelog | `CHANGELOG.md:22` |
| #510 AC model tiers, dates, slots | `share-image.test.ts` (Winner name, Event, dates, Standings, games; P7 on dates) |
| #510 AC render both formats, non-Member, unfinished, Tie | `integration/share-image.test.ts`, `share-render.test.ts` |
| #510 AC alt text one Winner | `share-image.test.ts` „names the Winner, the Event, the points and place 2“ |
| #510 AC changelog | `CHANGELOG.md:25` (P3) |
| #511 AC model k = 2, 3, 5, 8, labels, Standings, tied game 2 / 5, legend | `share-image.test.ts` „a Tie“ (tiers, bands, bar, Standings, games) |
| #511 AC render a Tie both formats | `integration/share-image.test.ts` „Tie of 3 of 4 Parties“ (both formats), `share-render.test.ts` (`tie2`, `tie3`, `tie5`, `tie8`) |
| #511 AC alt text for a Tie | `share-image.test.ts` „says the Tie in the alt text“, „names all 8 Winners“ (P8) |
| Testing Decisions: pixels of the picture | missing in code by design (browser, #513); P2 is the one known defect there |

## Quality and architecture

Axis: code quality and architecture. Diff: `git diff origin/staging...origin/spec/501-clip` (49 files). Tip: 19b9a68. Read with `thermo-nuclear-code-quality-review` and `improve-codebase-architecture` (vocabulary of `codebase-design`: module, interface, depth, seam, deletion test). Read-only; no test was run (the worktree has no `node_modules`), so every statement below is from reading the code at the tip.

Overall: the Release is well built. The decision „how long is the Veto window“ sits in one deep module (`drawInstants` takes `clipLength`; the readers work from the stored end), the skip is one `UPDATE` with a `CASE` twin kept honest by a parity test at every edge millisecond, the three clip fields are one small pure module with a two-function interface, and the Share image is a pure model plus a renderer that decides nothing. No file crossed 1000 lines (the largest new non-test files are `shared/share-image.ts` 366 and `server/utils/share-render.ts` 368). There is no Must-fix.

### Must-fix

None.

### Should-fix

**Q1. „A game without a video has no clip length“ is decided at two call sites and not at all in the reader.**
`server/utils/rounds.ts:80` (`game.youtubeId === null ? null : game.clipLength`) and `:113` (`drawn && drawn.youtubeId !== null ? drawn.clipLength : null`) each make the decision when the window is written. `shared/draw-timeline.ts:135` `clipWindow(draw, game: { clipLength })` never asks `youtubeId`, so the Clip (the card) runs for the stored length while the window was written for 30 s. This is the #505 decision 4 case the build session flagged, and it is not only a copy question. The cost has two parts:
- The rule has three places that must agree and one of them does not. `drawInstants` took the new parameter, but the decision was pushed to its callers: the new function moved the decision, it did not hide it (deletion test: deleting `drawInstants`' `clipLength` parameter would not concentrate anything, the two call sites would stay).
- The mismatch is reachable without any odd data: `GameForm` shows Start, Ende and Länge also with an empty link, and `parseGameInput` takes `clipLength` 10 to 120 with `youtubeId: null`. A game with no video and a 120 s length has a 30 s window and a card that covers the stage for 120 s. `readClip` takes the latest *stopped* draw, so that card also stays over the next spin's lead (the next draw has not stopped yet). Before 0.13 the longest clip (60 s) could never outlast the window (60 s); the Release makes it possible.
Smallest fix, which needs no product decision: one function in `shared/` (for example `clipLengthOf(game: { youtubeId, clipLength }): number | null`) that both writers and `clipWindow` call, and give `NewDraw` the game's two fields instead of a pre-digested `clipLength`. Whether the card then follows the window (30 s) or the window follows the card is the user's decision on #512 item 7; with the single function it is a one-line change. If the user wants the card to keep its stored length, the fix is only the first half (one function for the two writers).

**Q2. A stale `WINDOW_MS` in a test whose games have a video.**
`test/integration/hidden-wheel-draw.test.ts:8` imports `WINDOW_MS` from `test/draw-offsets.ts` and `:326` does `clock.set(new Date(stopAt + WINDOW_MS))` („keeps the undrawn game off the wheel for a Player after the removal too“). `draw-offsets.ts` redefined `WINDOW_MS` to 30 000 (a game *without* a video), but every game of `hidden-wheel-world.ts` has a video (`aaaaaaaaaaa`, …) and the default 30 s clip, so the real window is 60 s and the read at +30 s is in the middle of the window, not after it. The test still passes (its assertion holds in both states), so nothing flags the drift. `hidden-wheel-room.test.ts:15` hit the same trap and fixed it with a local `const WINDOW_MS = windowMsFor(CLIP_LENGTH_DEFAULT)`; the draw file was missed.
Root cause: `draw-offsets.ts` exports a constant (`WINDOW_MS`, `SPIN`, `SET`) whose value silently depends on a precondition of every importer. Fix: delete the three constants and make importers call `windowMsFor(null | 30)` / `offsetsFor(kind, clip)`, so each test names the game it means; at minimum, change `:8`/`:326` to `windowMsFor(CLIP_LENGTH_DEFAULT)`. The other importers (`results.test.ts`, `event-state.test.ts`, `pool-warning.test.ts`, `rounds.test.ts`, `stage-wheel.test.ts`) use scenario games without a video, which I confirmed only for `scenario.ts`'s seed games by reading, not by running them.

**Q3. `clip-overlay.test.ts` pins class names to guard a rule it cannot observe.**
`test/nuxt/clip-overlay.test.ts:454`:
`const covering = /(^|\s)(absolute|fixed|sticky|inset-\S+|z-\S+|layer-\S+|translate\S*|scale\S*|-m\S*)(\s|$)/` over `section.querySelectorAll('*')`.
jsdom has no layout, so the regex checks a naming convention, not that nothing covers the player. It also scans the rendered output of `AppButton`, `IconButton` and `GameCard`: a later restyle of a shared button (`translate-y-px` on press, `-m-1`) fails the overlay test for no reason a User would see. What the test needs is already proved by the structural assertions next to it: the `.aspect-video` wrapper has exactly one child (the stage), the stage holds only the iframe, the bar and the buttons follow the wrapper in document order, and the stage is `inert` and `pointer-events-none`. Fix: delete the regex and its `offenders` assertion (and the `.aspect-video` class selector can become „the first child of the section“); the real check is in the browser on #512. Note the regex also skips the `section` itself (`fixed … layer-clip`), so it was never the guard it reads as.

### Could

**Q4. `vetoView` takes a boolean that `game` already says.** `server/utils/stage-read.ts:172` adds `windowGameKnown: boolean` as the fifth of seven positional parameters; `:185` uses it as `vetoEndsAt: windowGameKnown ? … : null`. At `:232` `windowGame` is defined as `windowDraw && windowGameKnown ? byId.get(…) : undefined`, so `game !== null` is the same fact. Use `vetoEndsAt: game ? windowDraw.vetoEndsAt!.toISOString() : null` and drop the parameter (and its doc sentence). Fewer positional booleans, and the end is visibly tied to the card it must travel with.

**Q5. One `null` means two things on the wire.** `VetoDrawView.vetoEndsAt` is now `string | null` where null = „not yet known to this Member“; the same client code feeds the view to `windowOpen/windowEnded/windowFraction/settleAt` (`app/composables/useVetoClock.ts`, `app/utils/event-stage.ts:112`), where `DrawWindow.vetoEndsAt === null` means „this draw has no window“. It works (before the stop nothing is open or ended, `settleAt` falls back to the stop, which is the refetch instant, pinned in `test/nuxt/event-stage.test.ts`), but by coincidence of the two meanings, and the next reader that reads `null` as „no window“ will be wrong. A one-line comment on `useVetoClock` exists; a stronger option is to omit `draw` entirely for a Member before the stop. Not worth a change before 0.13.0 unless the stage rows are touched anyway.

**Q6. The legend is assigned from inside the games' `.map`.** `shared/share-image.ts:327–330`: `let legend: ShareLegend | null = null` and `legend = …` in the callback (the point the build sessions flagged). It also leaves TypeScript narrowing `legend` to `null` at the use site, so a later `legend.stripe` would not compile. Compute the tied teams once per result, then `const legend = tied.find(teams => teams.length >= 2)` and build the stripe from it; the callback becomes pure.

**Q7. Renderer duplication and a cast.** `server/utils/share-render.ts:252` `gameRow` repeats the `more` cell and the game cell in both format branches (only the `cell` style differs): build `cell` per format first, then one body. `:153` `lines as ShareName['lines']` hides that `filter(text => text !== '')` can yield an empty tuple, which the guard on the line before covers; `ShareName` for the header could be typed `lines: string[]`. The tie bar's `gap: 16` and the repeated `lineHeight: 1.1` / `1.2` sit outside `LAYOUT`, the one table meant to hold the note's numbers.

**Q8. `CODING_STANDARDS.md` § One home is not updated for the new twin.** The row for a Draw's instants (line 23) lists the SQL twins `stoppedDraws` and `dueDraws`; `movedVetoEnd` (SQL) and `vetoEndCap` are not named, so a reviewer of the next feature has no home to point at. Add them to the row.

**Q9. `vetoEndAfterSkip` has no production caller and a different return contract than its twin.** `shared/draw-timeline.ts:105`: JS returns `Date | null` („no change“), SQL `movedVetoEnd` returns the whole new value; the parity test needs `?? stored` to compare them. It follows the precedent of `isDue` (`@public`, tested only against SQL), so it is consistent, but there are now three functions for one rule (`vetoEndCap`, `vetoEndAfterSkip`, `movedVetoEnd`). If the JS twin returned the whole new end too, the parity test would compare directly and the `??` and the „null = no change“ wording would go. Taste.

**Q10. The order-dependent comparison case (flagged).** `test/integration/hidden-wheel-draw.test.ts:442`: the third `it` reads `snapshots` that the two `it.each` cases before it filled. It cannot pass vacuously (it throws a clear message when run alone), so it is not a test that cannot fail, but `-t`, `.only`, `--sequence.shuffle` or a retry of only the first case break it, and the failure message points at the test order, not at a secrecy fault. Smallest fix: the comparison runs inside the second `it.each` case (`if (clipLength === 50) expect(snapshots.get(20)!.before).toEqual(got.before)`), or build both worlds in one `it` with a second `testDb` (the single-`draws`-row assumption at `[row] = await db.select().from(draws)` is the reason for the split, so the in-case comparison is the cheaper one). Same failure mode, one test fewer.

**Q11. Small drift in names and copy.**
- `shared/share-image.ts:302`: the „+n weitere“ tie band reuses the copy key `moreGames` (a games key for a Winners band). Same text today; a rename to `moreN` or a `tie.more` key avoids a wrong edit later.
- `shared/share-image.ts:178` creates a second `Intl.Segmenter('de', { granularity: 'grapheme' })` next to the one in `shared/text.ts:4`, which `characterCount` already owns (CODING_STANDARDS: text length has one home). Export a `graphemesOf(text)` from `shared/text.ts` and use it in `breakAtMiddle`.
- `CHANGELOG.md` (#510 line): „bekommt jeder Sieger ein eigenes Band“ is wrong for 7 or 8 Winners (five bands and „+n weitere“); the note, not the spec's „up to five“, has six own bands. „bis zu sechs Sieger ein eigenes Band“ is true.
- `i18n/locales/de.json` `legal.datenschutz.events.text`, paragraph on the Ergebnisbild: „wie viele Leute mitgespielt haben“ is no longer in the picture (it shows „{n} Parteien“). The text over-states what the picture shows, which is the safe direction, so it is not a data risk, but the sentence is now untrue and legal text needs the user's approval (§ Copy), so only the user can change it. The spec said „no change“.

### Checked and sound

- **Window arithmetic.** `drawInstants` (`shared/draw-timeline.ts`): `stop + (clipLength ?? 0) * 1000 + 30_000`; unit tests at 10, 30, 120 s and null for spin and set; the window-length-for-clip test and the `CASES` loop pin all four boundary milliseconds for each. 10 s gives 40 s, 120 s gives 150 s, no video 30 s. A set draw stops at the commit, so `commit + clip + 30` is right.
- **The skip.** `server/utils/clip.ts:51`: one statement sets `clipSkippedAt` and `vetoEndsAt = case when vetoEndsAt > cap then cap else vetoEndsAt end` with the request's `now`; `CASE` rather than `LEAST` keeps a window-less draw window-less (tested). In production a skip is always at or after the stop, so the result is >= the stop and `draws_instants_check` holds. The strict `>` matches in JS and SQL; the parity test hits `end-30001 … end+1` and the 150 s window at exactly 30.001 s left. A skip in the last 30 s of a game *with* video cannot happen in production (the clip ends 30 s before the window); the branch exists for the Q1 and edited-game cases and is tested.
- **Secrecy of the end.** `vetoEndsAt` goes out only through `drawGameKnown` (`stage-read.ts:185`); the integration test compares a Player's reads before the stop for two clip lengths field for field and asserts the Host's end is present at the same instant. The extra `SELECT` in `spinWheel` runs only when a window opens, under the lock budget. No other reader of the end depends on the clip length before the stop (settle, `knownVetoRows`, `vetoReason` read the stored end after it).
- **Migration 0034** is data only, no CHECK, and the comment states the ADR 0007 case (the old code may still store 5 to 9 s); the form opens such a row in error, the window and the clip read the stored length without a bound; `clip-length-migration.test.ts` runs the real migration on rows of 5, 9, 10 and 60 s.
- **Clip fields.** `app/utils/clip-fields.ts` is a deep module (`openClipFields`, `editClipField`; held pair plus follower in one place), lives in `app/` for the right reason (Ende is form-only), and the bounds stay in `shared/game.ts`. Checked by reading: start before 0:00, end before start, a follower above 12:00:00, a held field with an error leaving the follower as it is, re-editing the field edited longest ago, and the stored 5 to 9 s row.
- **Clip overlay.** `inert` plus `pointer-events-none` on the player's container, nothing placed over the player, the resume path (`resumeIfPaused`: not before the first PLAYING, not in the last second, not after close or end, one resume per second, play before seek, the drift check stays one-shot) is tested at its edges. `modestbranding` is gone.
- **Share image.** Slot rules by arithmetic: 8 Parties wide gives ranks 2, 3, „+4 weitere Parteien“, last place; `n` is never 1, so dropping `moreParty` is right; games 12 gives 5 + „+7“ (wide) and 7 + „+5“ (square); 0 games gives „0 Spiele“ and no rows; an emoji-only Team name falls back to the colour name; an empty Event name draws nothing in both headers; the longest name of all Winners (also those folded into „+n weitere“) sets the band tier; the legend shows even when the tied game is folded. The model is a pure function with the renderer deciding nothing; unit tests assert the model (what a User sees), the render test asserts a PNG of the right size for every case in both formats, which is all a jsdom/Node test can say about pixels (and catches a Satori-unsupported style, which throws).
- **Tie bar label ellipsis (flagged).** Judged: built to the note's numbers, no code defect; the fix is a copy or layout decision for the user.
- **Six reworded Veto strings and four clip-field strings (flagged).** Judged: they promise only what the app does (the Lucky Wheel text says „während des Clips und noch 30 Sekunden danach“, which is true for a game with a video); no stale „60 Sekunden“ or „30-Sekunden-Clip“ remains in code, `de.json` or tests.
- **No interim code left**: no TODO, no unused export (the `@public` `vetoEndAfterSkip` aside, Q9), the `members` section dropped from `shareImageSource` while the state still loads Members only because `boardSection` types it.

### Not verified

- Tests, lint, typecheck and knip were not run (no `node_modules` in the review worktree).
- Pixel looks of the Share image and the Clip behaviour on devices (#512, #513).
- Whether a stale client bundle open across the deploy handles `vetoEndsAt: null`; a live Session across a deploy is excluded by the delivery rules, so I did not follow it further.
