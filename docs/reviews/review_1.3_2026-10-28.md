# Review 1.3 „Spielvorbereitung“ (2026-10-28)

Diff `v1.2.0...origin/staging` (6d64db2), reviewed in three read-only `sonnet` subagents per `docs/agents/release.md` § Review, walk-through, retro: Standards, Spec (#138, #139–#148) and thermo-nuclear with architecture. The user's staging walk-through of the same day is in the 1.3 fix spec.

## Result

- **No blocker in the code.** Hidden wheel secrecy holds on every API a Player can call, and the required Player API test asserts the right thing. Edit rules, Veto default, Game count range, pool hint, „Event einrichten“, library visibility and the image fallback chain match the spec.
- **Before production (migration 0006 is not there yet):** games get their own enum for Suitability instead of `event_format` (Standards S2); indexes on `games.image_key` and `event_pool_games.game_id` (S6).
- **Domain language:** the stepper calls the Event a „Session“ (S1, Spec N2); „Lucky Wheel“ and „Admin pick“ in the UI against the glossary (S3).
- **Structure before 1.4:** one Event mutation wrapper (Thermo A1), a parallel Event read (A2), one rule for who sees pool games (A3), a seam for settings floors (A4).
- **Duplicated structure inside 1.3:** stepper and settings editor are two copies of one wizard (B1), Lucky Wheel options held three times (B2), game rules validated three ways (B3), two game searches (B4), pool data shape (B5), five hand-built callouts next to `NoticeBanner` (C1).
- **Smaller:** copy promises pool suggestions (S4); privacy text lacks YouTube and R2 (S5); `NumberStepper` a11y (S8); unknown `/api/…` routes answer with the page, not a 404 (Spec F2); a Host without the Host permission gets a pool picker that never loads (Spec N1); the image route is `private`, so „cached“ in ADR 0012 means browser cache only (Spec N4, Standards N12).
- **#140:** the `R2_*` variables are set for production and staging in Vercel (checked 2026-10-28); image upload works on staging.

What becomes a ticket is decided in the 1.3 fix spec.


## Standards review: Release 1.3 "Spielvorbereitung" (v1.2.0...origin/staging)

Reviewer axis: Standards only (not Spec). Read-only. Code read from a `git archive` of `origin/staging` (scratchpad `stg/`).
Standards sources used: `CLAUDE.md` / `AGENTS.md` (identical), `docs/agents/{domain,delivery,release,subagents,design-handoff,issue-tracker}.md`, `GLOSSARY.md` (both the staging copy and the newer copy on local HEAD `d10ba2f`, which only adds Bonus Veto, Suitability, Coin flip, Countdown), `docs/adr/0001..0013`, `eslint.config.mjs`, `docs/roadmap.md` (1.3 section), plus the Fowler smell baseline from `.claude/skills/code-review/SKILL.md`.
No `CODING_STANDARDS.md` / `CONTRIBUTING.md` exists.
Tooling: `npx eslint app server shared test` runs clean on this tree (local HEAD = staging + GLOSSARY only), so no lint-class findings are reported.
Smell-baseline findings are judgement calls; the repo's documented standards win where they conflict.

Severity: **blocking** = should not reach `main` as is. **should-fix** = fix before the Release PR or immediately after. **nit** = optional.
**No blocking findings.** Authorization, Hidden wheel secrecy and the locked-settings rule all check out (see "Checked and fine" at the end).

---

### Should-fix

#### S1. Creating an Event is called creating a "Session" (GLOSSARY: Event vs Session)
- `i18n/locales/de.json:1175` ("Wie soll die Session heißen?"), `:1184` ("Session erstellen"), `:1187` ("Session erstellt"), `:1193` ("Name der Session"), `:1247` ("Neue Session"), `:1307` (`error.nameRequired`: "Gib der Session einen Namen."). Also `CHANGELOG.md:7` ("Eine neue Session legst du jetzt Schritt für Schritt an"). Code comments repeat it: `app/pages/neu.vue:19`, `app/utils/event-draft.ts:4`, `app/components/stepper/EventStepper.vue:18`.
- Rule: GLOSSARY "Session: One sitting of an Event on one Date" and "Event: One competition of a group"; ADR 0004/0011 ("a bare 'session' now means one sitting of an Event"); `docs/agents/domain.md` "Don't drift to synonyms". The stepper creates an Event (`POST /api/e`) with N Sessions in its last step, so "Session erstellen" and "Name der Session" are wrong. v1.2.0 said "Neues Event" / "Name des Events" / "Gib dem Event einen Namen."; 1.3 regressed these. The strings come from the design hand-off, which predates the Session rename.
- Cost: Users and Hosts read "Session" in the same release in which "Session starten" means a sitting. The Changelog is public (Neuigkeiten). `error.nameRequired` is a shared key, so any other form using it changed too.
- Fix: change the six strings, the Changelog line and the three comments to Event; tell Claude Design to update the hand-off copy.

#### S2. Game-level "Format" contradicts the newer GLOSSARY "Suitability", and the DB enum is shared with Events
- `server/db/schema.ts` (`games.formats: eventFormat('formats').array()`), `drizzle/0006_game_library_and_event_settings.sql` (`"formats" "event_format"[]`), `shared/game.ts:49` (`GameView.formats`), `shared/event.ts:103` (`PoolGame.formats`), `server/domain/game.ts:22,62-68` (`parseFormats`), `i18n/locales/de.json:716` ("Passende Formate"), `library.format.*`, `app/components/GameForm.vue:226-241`.
- Rule: GLOSSARY on HEAD, "Suitability: What kind of play a game works for: Teams, free-for-all or one against one … Avoid: Format (an Event has a Format, a game has Suitabilities)" (UI: "Passt zu"); "Format … Avoid: Mode, game type" on the Event side.
- Cost: migration 0006 is not on production yet (delivery.md: migrations run on merge to `main`). Once it ships, adding "one against one" means `ALTER TYPE event_format ADD VALUE`. That puts a game-only value into `events.format` as well, and Postgres cannot remove enum values. Renaming later also needs a data migration.
- Fix: before the Release PR, give games their own `game_suitability` enum and column (`suitability`), and rename the TS/API/copy names ("Passt zu") in the same pass. If the grilling decision is not final, at least do not reuse the Event enum.

#### S3. "Lucky Wheel" in user copy where the GLOSSARY says Glücksrad; "Admin pick" is not a glossary term
- `i18n/locales/de.json:185,260` (`setup.mode.wheel.name` = "Lucky Wheel"), `app/utils/settings-summary.ts:28-31` (`modeText` produces "Lucky Wheel (verdeckt)"), `CHANGELOG.md:11` ("Admin-Wahl oder Lucky Wheel"), `de.json:197,280`.
- Rule: GLOSSARY "Lucky Wheel … (UI: Glücksrad)"; the roadmap names the release "Glücksrad". The key strings predate 1.3 (design hand-off), but 1.3 puts `modeText` into "So wird gespielt", which every Member sees (`app/components/HowWePlayCard.vue` → `EventSettingsSummary`), and into the Changelog.
- Also: "Admin pick" / "Admin-Wahl" (`shared/settings.ts:10`, `admin_pick`, roadmap, copy) has no GLOSSARY entry although the Selection mode entry lists no values. Per `domain.md`, a missing term is a gap to record via domain-modeling.
- Fix: use "Glücksrad" in UI and Changelog (or amend the GLOSSARY "UI:" note if "Lucky Wheel" is now intended); add "Admin pick (UI: Admin-Wahl)" to GLOSSARY.

#### S4. Copy promises pool suggestions that the 1.3 spec excludes
- `i18n/locales/de.json:719` (`gameEdit.playersNote`: "Spielerzahl und Formate nutzen wir nur für Vorschläge beim Pool-Füllen. Aussortiert wird nie automatisch.") shown in `GameForm.vue:242-244`; similar at `:1375` (`empty.pool.text` "Vorschläge passen zu Format und Spielerzahl"; I found no static reference to that key, so it may be unused).
- Rule: `docs/roadmap.md` 1.3: "Out: duplicate check, pool suggestions."
- Cost: users are told about a feature that does not exist; player count and Format fields look pointless today.
- Fix: reword to what is true ("Hilft dir später beim Finden") or drop the sentence until the feature ships.

#### S5. Privacy statement not updated for the new third-party calls (judgement, no documented repo rule)
- New external requests: YouTube IFrame API script and `youtube-nocookie.com` player (`app/components/ClipPreview.vue`, `loadYouTubeApi`), `i.ytimg.com` thumbnails (`app/components/GameCard.vue:20`, `shared/youtube.ts:43`), Cloudflare R2 (`server/utils/r2-store.ts`) as a new processor.
- `GameCard` is used in `HowWePlayCard`, so every Member of an Event with a visible pool and games without image loads thumbnails from Google, and the library and form pages load YouTube scripts.
- The Datenschutzerklärung in `i18n/locales/de.json` (sections 3 Hosting/Vercel, 4 Neon, 7 Cookies) names each processor. `grep -i "youtube|cloudflare"` finds only form copy, not the legal text. No CSP exists either.
- Cost: undisclosed IP transfer to Google/Cloudflare for Members who never opted in; this is a German hobby project with an Impressum.
- Fix: add a section for YouTube (Host form, library, game thumbnails) and for image storage on Cloudflare R2 before `main`; the legal text is not a Release-blocker per any doc, so flag it to the user.

#### S6. Missing indexes behind the hot image route (migration 0006 not yet on production)
- `server/api/images/[key].get.ts:21` looks up `games.image_key` on every image request (no index; only `games_created_by_idx` exists, `drizzle/0006_*.sql` last line). `server/utils/pools.ts:54` filters `event_pool_games.game_id`, but the PK is `(event_id, game_id, pool)` so `game_id` is not a leading column.
- Cost: each card of each Member does a seq scan on `games`, plus a scan of `event_pool_games` for non-Host Members; grows with the library. Cheap now, a second migration later.
- Fix: unique index on `games(image_key)` and an index on `event_pool_games(game_id)` in 0006 (and the matching snapshot) before production.

#### S7. Pool validation/persistence is split between create and patch, and `settings.patch.ts` has to re-read the raw body (Duplicated Code, judgement)
- `server/api/e/[slug]/settings.patch.ts:19-21,38-45,40,46` vs `server/api/e/index.post.ts` (parse at the top, `assertGamesExist`, `POOLS.flatMap(...)` insert). `parsePools` (`server/domain/pools.ts:25-33`) turns "absent" and "empty" into the same `[]`, so the patch handler must go back to `body.pools` (`rawPools[pool] !== undefined`) to know which pool was given. `settings!` is asserted twice (lines 40, 46) because TS cannot see the null guard at line 30.
- Cost: two code paths that must agree on pool rules; the next pool rule (limit vs Game count, 1.4/1.5) lands twice.
- Fix: `parsePools` returns `Partial<NewPools>` (key present = replace); add `writePools(tx, eventId, pools)` in `server/utils/pools.ts` used by both routes; restructure so `settings` is non-null by construction.

#### S8. `NumberStepper` is a `role="spinbutton"` that contains the buttons (a11y)
- `app/components/NumberStepper.vue:55-62` (group with `aria-valuenow`, `@keydown` for ArrowUp/Down) wrapping two `<button>`s. WAI-ARIA 1.2 gives spinbutton "Children Presentational: true", and the wrapper has no `tabindex`, so the ArrowUp/ArrowDown handler only fires after Tab has landed on an inner button. Assistive tech may not expose the inner buttons.
- Rule: not a repo doc; the design hand-off treats a11y as a requirement, hence should-fix, not blocking. It is used for team count, Team size, Game count, points, Veto allowance.
- Fix: make the wrapper `role="group"` with the labelled `<output>`, or make a real spinbutton (focusable, `aria-valuetext`) and keep the buttons outside it, `tabindex="-1"`.

---

### Nits

- **N1. Duplicated Code: step blocker reset.** The same `watchEffect(() => { blocker.value = null })` in `StepFormat.vue:19`, `StepGameCount.vue:10`, `StepMode.vue:20`, `StepPool.vue:21` (and the blocker model boilerplate in all seven steps). Fix: a `useStepBlocker(rule?)` composable or `defineModel` default.
- **N2. Duplicated Code: page chrome.** The "back to X" link markup is copied five times (`pages/neu.vue:90`, `pages/e/[slug]/einstellungen.vue:92`, `pages/bibliothek/neu.vue:38`, `bibliothek/[id]/bearbeiten.vue:49`, `bibliothek/[id]/index.vue:61`); the `FullScreenState` + retry block and the `!viewer || missing` guard repeat in both `[id]` pages. Since `construction.ts` lost its central `bibliothek` guard, each page now re-implements the guard. Fix: a `BackLink` component; a `useLibraryGame(id)` composable.
- **N3. Duplicated rule.** `settingsEditable` (`shared/settings.ts:239`) and `sessionsEditable` (`shared/event.ts:44`) have identical bodies; the handler checks it twice (`settings.patch.ts:26` and `checkSettingsChange` at `shared/settings.ts:262`). Fix: one `editablePhase()`, drop the redundant check or keep it only for pool-only requests with a comment.
- **N4. Duplicated rule client vs server.** Clip length parsing is inline in `GameForm.vue:72-77` while the server has `parseWholeNumber(...)` at `server/domain/game.ts:41-44,80`; player count and clip start, in contrast, share `shared/game.ts`. Fix: `parseClipLength` in `shared/game.ts`.
- **N5. Data Clump / duplicated state.** `hiddenWheel` + `vetoAllowance` live twice in the draft (`settings.*` and `draft.wheel`, `app/utils/event-draft.ts:22,56-75,105`) and four functions keep both in sync; they also travel together in `settingsFromRow`, `SettingsError.wheel_options_without_wheel`, `poolEventsOf`. Fix: one `wheel` value object, with `settings` derived from mode + wheel.
- **N6. Repeated Switches.** `selectionMode === 'lucky_wheel'` in `shared/settings.ts:124,197`, `event-draft.ts:54,82`, `settings-summary.ts:31,63`, `StepMode.vue:33,39`, `useEventStepper.ts:29`; `kind === 'main'` three times in `StepPool.vue:26,27,29`. 1.5/1.6 will add more branches. Fix: `hasWheel(mode)` helper; a `{ main: {...}, tiebreaker: {...} }` map for the pool step.
- **N7. Primitive Obsession (casts).** `RadioCardGroup` emits `string`, callers cast: `StepFormat.vue:31` `value as Format`, `PointsTableEditor.vue:31` `as PointsPreset` (StepMode narrows properly). Fix: make `RadioCardGroup` generic over the option value type.
- **N8. Speculative Generality.** `canStartSession` (`shared/settings.ts:294`) is used only by its own unit test (1.4 will enforce it); `ImageStore.get()` returns `contentType` that the route ignores (`server/api/images/[key].get.ts:30`, `server/utils/image-store.ts:7`); `parseWholeNumber`/`parsePlayers`/`parseFormats` are exported "for the edit route" (`server/domain/game.ts:8-9`) but only used in that file. Fix: delete or inline until used.
- **N9. Divergent Change.** `shared/settings.ts` (296 lines) changes for points math, pool-size hints (a UI concern, `poolHint`), parsing, edit/lock rules and constants. Fix: split `settings-rules` (parse/check) from `settings-hints` when the next rule lands.
- **N10. Stale comments.** `EventStepper.vue:5` ("5 now, 8 with the Selection mode"), `StepPool.vue:10` ("the draft lives in neu.vue", it also lives in einstellungen.vue), `app/utils/settings-summary.ts:3-5` ("#145 adds … #146 the pools" already done).
- **N11. Two defaults for one null.** `poolEventsOf` uses `coalesce(hidden_wheel, true)` (`server/utils/pools.ts:50`, fail-closed) while `settingsFromRow` uses `hiddenWheel ?? false` (`shared/settings.ts:225`). Not reachable through the API today (create always stores a boolean), but the image route and the Event read would disagree for a row with settings and a null `hidden_wheel`. Fix: one rule in `shared/settings.ts`, used by both (fail-closed).
- **N12. Image route/upload hardening.**
  - `private, max-age=31536000, immutable` (`images/[key].get.ts:31`) is right for secrecy, but then ADR 0012's "cached Nuxt route" means browser cache only. Every Member's first view costs `getUser` (2 queries) + `games` + `poolEventsOf` + an R2 GET. Say so in the comment or ADR.
  - `image.put.ts:20` skips the length guard when `content-length` is absent (body buffered before the size check at line 23).
  - Add `X-Content-Type-Options: nosniff` (the only check is the 12-byte `RIFF…WEBP` magic, `server/domain/image.ts:4-8`).
  - Old objects are never deleted when an image is replaced or the DB update fails after `put` (`image.put.ts:26-27`; the `ImageStore` has no `delete`).
- **N13. Shared fetch key.** `bibliothek/index.vue:44` (`useFetch('/api/games', { key: 'games', query })`) and `composables/useGameLibrary.ts:9` (`key: 'games'`, no query) use the same key for different request shapes; Nuxt shares data and warns on incompatible options, and `refreshNuxtData('games')` refreshes whichever handler is registered. Fix: distinct keys (`games-library`, `games-pool`).
- **N14. UI shows Formats the GLOSSARY does not have.** `StepFormat.vue:26-27` lists "Turnierbaum" and "Liga" as "Bald verfügbar", but GLOSSARY Format is Teams or free-for-all and the roadmap lists neither. Origin is the design hand-off. Either add them as planned terms or drop the cards.
- **N15. Middle Man.** `app/utils/construction.ts:22` re-exports `canSeeLibrary` only for `HubNav.vue:4`; import from `~~/shared/game` directly.
- **N16. No DB guard for "all null or all set".** `schema.ts` events comment says "All null = not set up", but nothing enforces it (partial rows are silently "not set up" via `settingsFromRow:224`). A `CHECK` in 0006 would make the invariant real. Low value; judgement.

---

### Checked and fine (no finding)

- **Authorization.**
  - `settings.patch.ts:25` uses `loadEvent(..., { hostOnly: true, lock: 'update' })` inside the transaction; non-Member gets 404, Member 403 `not_host`.
  - `POST /api/e` requires `canHost`; every `/api/games*` route goes through `requireLibraryViewer` (404 for non-viewers).
  - `PATCH` game and `PUT` image check `canEditGame` (creator or Platform admin) before reading the body.
  - Game ids are checked with `isUuid` before any query; the LIKE search escapes wildcards.
- **Validation.** `shared/settings.ts` (`parseSettings`, `checkSettingsChange`) and `shared/game.ts` / `server/domain/game.ts` are used by both client and server for the main rules; `pointsTable` presets are re-derived server-side, so a client cannot send arbitrary preset values.
- **Hidden wheel secrecy.**
  - `eventPools(visible=false)` selects only counts, so no name/id/image/clip is even read (`server/utils/pools.ts:16-25`).
  - `poolsVisibleTo` defaults to hidden for non-Host with unset settings.
  - The image route denies non-Host Members under a hidden wheel (`image-access.ts:19`) and answers 404, identical to a missing key.
  - Library routes are Host/admin only.
  - `settingsFloors` and `inviteUrl` are Host-only.
  - `HowWePlayCard` renders only what the server gave it.
  - `test/integration/hidden-wheel.test.ts` reads the raw responses.
- **Edit rules.** `LOCKED_WHEN_RUNNING = format, teamCount, pointsTable, selectionMode` matches the roadmap; Game count, Team size, Veto allowance, Hidden wheel and both pools stay editable while `running`; `wrong_phase` after finish. Floors are a documented stub until 1.4/1.5. A pre-1.3 Event without settings is unlocked even when running; this cannot occur before 1.4 (sessions cannot start without settings), so no finding.
- **R2 adapter.** SigV4 over `fetch` + Web Crypto, no `@vercel/*` import (ADR 0005 holds); keys come from the DB only, never from the request into the bucket path; random key part has no modulo bias (256 % 64 = 0). Wizard passes secrets on stdin.
- **Release docs.** `CHANGELOG.md` uses only `### Neu` / `### Sicherheit` in the allowed order, German, with issue links, per `docs/agents/release.md`.

## Spec review: Release 1.3 „Spielvorbereitung“ (#138, #139–#148)

Diff: `git diff v1.2.0...origin/staging` (origin/staging = 6d64db2 = local HEAD). Spec sources read: #138, #139–#148 and every comment, `docs/roadmap.md` 1.3 section, GLOSSARY.md (staging version), ADR 0012, #153 (1.4 spec, for hand-over items). Read-only; nothing written to GitHub.

Verified by running: `npx vitest run test/integration/hidden-wheel.test.ts test/unit/settings.test.ts` gives 90/90 passed. I did not run the full suite.

Verdict legend: met / partly met / missing / contradicted. Paths are relative to `/home/user/compies`.

### Result in one paragraph

No blocking code-level gap. Every functional requirement of #138 and #141–#148 is met in code and covered by a test that asserts the observable outcome. Hidden wheel secrecy holds on every Player-reachable path (Event read, „So wird gespielt“ data, library API, image route, PATCH/POST responses). Open items: the human ticket #140 and the release ticket #149 (process), one disclosed spec deviation (non-viewer answer for library routes is a JSON 404, not "the same as a missing route"), and a handful of nits.

---

### Hidden wheel secrecy: every API a Player can call

| API | Verdict | Evidence |
|---|---|---|
| `GET /api/e/:slug` (Event read, „So wird gespielt“ data) | met | `server/api/e/[slug].get.ts:68` calls `eventPools(db, id, poolsVisibleTo({isHost, settings}))`. `server/domain/pool-visibility.ts:8`: `isHost \|\| (settings !== null && !settings.hiddenWheel)`. When not visible, `server/utils/pools.ts:16-25` runs a `count(*) group by pool` query and never selects a game column, so nothing can leak by accident. No other field of `EventView` (`shared/event.ts:383`) carries game data. Not-set-up Events fall to the safe default (counts). |
| `GET /api/games`, `/api/games/:id`, `PATCH`, `PUT image`, `POST` | met | All go through `requireLibraryViewer` (`server/utils/library.ts:140`), which throws 404 unless `canHost \|\| isAdmin` (`shared/game.ts:29`). |
| `GET /api/images/:key` | met | `server/api/images/[key].get.ts:21-25` and `server/domain/image-access.ts:16-19`. Library viewers always; signed-out never; others only through `poolEventsOf` (`server/utils/pools.ts:48-55`): live Events they are a Member of that hold the game, and only when `isHost \|\| !hiddenWheel` (`coalesce(hidden_wheel, true)` means unset counts as hidden). Unknown key, no right and missing object all answer the same 404 (`libraryNotFound`). |
| `PATCH /api/e/:slug/settings` response | met | `server/api/e/[slug]/settings.patch.ts:46` returns `{ settings }` only. Host only (`hostOnly: true`). |
| `POST /api/e` response | met | Returns `{slug, inviteUrl}` (`server/api/e/index.post.ts:110`). |
| Any other route returning pools | met | `grep eventPoolGames` over `server/`: only `pools.ts`, `settings.patch.ts`, `index.post.ts`, `schema.ts`. Home (`GET /api/e`) and invite preview carry none. |
| Host sees games under Hidden wheel | met | `poolsVisibleTo` `isHost`; `HowWePlayCard.vue:68` shows the "only you see this" note. |
| Wheel off reveals, on hides again | met | Same derivation, no stored state. Tested through PATCH in `test/integration/event-settings.test.ts:216-232` and through direct DB flips in `hidden-wheel.test.ts:149-163`. |

#### Required API test as a Player (spec: "Testing Decisions")

`test/integration/hidden-wheel.test.ts` exists and asserts the right thing:
- `:130-138` reads the **raw response text** as the Player under a Hidden wheel and checks `not.toContain` for each pool game's name, id, image key and video id, plus no `api/images` string, and `pools` equals `{hidden:true, mainCount:2, tiebreakerCount:1}`. Both pools and a Tiebreaker-only game are covered.
- `:140-147` positive control: the Host sees every trace, so the negative test cannot pass vacuously.
- `:149-163` wheel off reveals every trace, hidden again removes them.
- `:176-184` image route 404 for the Player, for games in either pool. `:186-198` serves once not hidden, refuses again when hidden again.
- `:209-217` non-Member and signed-out get 404. `:219-227` deleted Event 404. `:229-246` game in a second, visible Event.
- `:249-258` library routes 404 for the Player.

One nit on the test, not on the code: the image-route toggle uses a direct DB update instead of the PATCH route. The PATCH-driven reveal is covered by `event-settings.test.ts:216`, so the pair together covers it.

---

### #138 (spec issue): user stories and decisions

| Requirement | Verdict | Evidence |
|---|---|---|
| 1 Library in main nav | met | `app/components/HubNav.vue:21`; `HUB_SITES` no longer lists `bibliothek` (`app/utils/construction.ts:7`), so the tape marker is gone. |
| 2 Library invisible without Host permission (nav, page, API) | met (see F2 for the API wording) | Nav `HubNav.vue:21`; pages show `ConstructionPage generic` (`bibliothek/index.vue:99`, `neu.vue:34`, `[id]/index.vue:45`, `[id]/bearbeiten.vue:32`); API `library.ts:140`. |
| 3 Platform admin sees and edits all | met | `canSeeLibrary` includes `isAdmin`; `canEditGame` (`shared/game.ts:224`) `isAdmin \|\| creator`. |
| 4, 5 Create game with name, YouTube link, start second, length (30 default) | met | `server/domain/game.ts:84-` (`CLIP_LENGTH_DEFAULT` 30), `GameForm.vue`. |
| 6 Live preview, same clip as in the Event, bar for the excerpt | met | `ClipPreview.vue`: IFrame player with `start`/`end`, bar `segment` once duration is known. |
| 7 Clear message for broken/non-YouTube link | met | `GameForm.vue:55-61` (`gameEdit.badLink`, `linkBroken`), blocks save (`blocker`). Server `invalid_youtube`. |
| 8 Image upload, cropped in browser | met | `app/utils/image-resize.ts` (16:10 cover crop, 512x320, WebP, quality ladder to fit 200 kB, refuses a PNG fallback); `GameImageField.vue`. |
| 9 Fallback: image, YouTube thumbnail, placeholder | met | `GameCard.vue:20` `imageUrl ?? (youtubeId ? youTubeThumbnail : null)`; placeholder at `:51-56`. |
| 10 Player count and Formats | met | `GameForm.vue` fields, `server/domain/game.ts` `parsePlayers`/`parseFormats`. |
| 11, 12 Search; filters players/Format/Von mir | met | `server/api/games/index.get.ts:91-102`; LIKE wildcards escaped. UI `bibliothek/index.vue:129-182`. |
| 13 Detail with clip preview, count, Formats | met | `app/pages/bibliothek/[id]/index.vue`. |
| 14, 15 Creator edits; other Host sees reason, not a dead button | met | `[id].patch.ts:17` (403 `not_game_editor`); detail page `index.vue:159-180` shows `library.editOnlyOwner`. |
| 16, 17 Empty state; skeleton cards | met | `bibliothek/index.vue:208-250` (SkeletonCard, empty library, Keine Treffer). |
| 18 No deleting | met | No DELETE route under `server/api/games`; FK `event_pool_games.game_id` has no cascade (`drizzle/0006…sql`). |
| 19 8 guided steps | met | `app/pages/neu.vue:28` `STEP_KEYS` has 8 entries. |
| 20 Desktop step list, finished steps clickable | met | `EventStepper.vue:206-208` `isLink`. |
| 21 Phone progress bar, sticky footer, info bottom sheet | met | `EventStepper.vue:265-277`, `:300`, `:359-366`. |
| 22 Info sheet with So läuft’s / Gut für / Achtung / example | partly met (nit N3) | `InfoSheet.vue`; copy in `i18n/locales/de.json` `setup.info.*`. Only the currently chosen option is explained (`useEventStepper.ts:145-150`); the copy for the locked options is unreachable. |
| 23, 24 Teams 2–8, size 1–6, max 24 players, plus button stops with reason as tooltip | met | `shared/settings.ts:29-34, 164-175`; `StepFormat.vue:35-38` computes tighter max (24/size) with its own reason; `NumberStepper.vue:92-93` `title` + sr-only description. |
| 25 FFA/bracket/league "Bald verfügbar" | met | `StepFormat.vue:23-28` `locked` from `AVAILABLE_FORMATS`; server `format_unavailable` (`settings.ts:169`). |
| 26 Game count 1–30, default 10 | met | `settings.ts:35-37, 177-178`; `StepGameCount.vue:209-212`. |
| 27, 28 Presets + custom; rejects rising table with the exact message | met | `settings.ts:77-100, 180-190`; message `stepper.points.rising` `de.json:1225` is "Platz {n} kann nicht mehr Punkte bekommen als Platz {above}." Linear = n-1…0, WTA = n-1,0… as spec. |
| 29, 30 Lucky Wheel / Admin pick; other 3 locked | met | `StepMode.vue:127-133`; server `mode_unavailable`. |
| 31 "Rad verdecken" switch with Lucky Wheel | met | `StepMode.vue:166-171`. |
| 32 Veto allowance 0–9 per Party | met | `settings.ts:38-39, 207-209`; `StepMode.vue:177-185`. |
| 33, 34 Default max(3, Team size), follows until touched, then sticks | met | `settings.ts:73-75`; `event-draft.ts:68-84` (`touched` flag, `followTeamSize`); wired by the `teamSize` watcher in `useEventStepper.ts:130-132`. Test `event-stepper-mode.test.ts:178` is the exact 3→5 then set 2 scenario. Server stores what is sent (`settings.ts:207-209`). |
| 35 Info sheet says Host sees Hidden wheel's games | met | `de.json` `setup.info.wheel.hostSees`, rendered via `InfoSheet.vue:21` (`hideWheel` section parts). |
| 36 Fill Game pool from library | met | `StepPool.vue`, `GamePoolPicker.vue`. |
| 37 "Neues Spiel anlegen" in a sheet, new game goes into pool | met | `StepPool.vue:282-287, 366-372`; test `event-stepper-pools.test.ts:404-445`. |
| 38 Non-blocking pool hint, formula and copy | met | `settings.ts:123-140` = gameCount + veto × teamCount (Admin pick: gameCount). Exact spec sentence asserted at `event-stepper-pools.test.ts:255-260` (10 Spiele, 6 Vetos, 16 needed, 12 in pool). Status role, never blocks (`:326`). |
| 39 Tiebreaker pool, no hint | met | `StepPool.vue:29` hint only for `main`; test `:371`. |
| 40 Sessions step as today | met | `StepSessions.vue` (old form). |
| 41 Event created only on „Session erstellen“ | met | `neu.vue:45-54`: one POST at the last step; `draftBody`. |
| 42 Fertig screen: summary + Invite link | met | `neu.vue:96-136`. |
| 43 „Event einrichten“ notice for pre-1.3 Events, Host only | met | `EventPage.vue:116, 155-171`; test `event-settings-entry.test.ts:20-46`. |
| 44 Editor from Host controls at any time | met | Dock action `EventPage.vue:121-130`, visible in every Phase before finished (`:114`). |
| 45 Everything editable before first Session | met | `settings.ts:257-284`: lock only in `running`/`finished`/`archived`. |
| 46 Running: Game count, Veto allowance, Team size, Hidden wheel, both pools editable | met | `LOCKED_WHEN_RUNNING` (`settings.ts:231`) excludes them. Tests `event-settings.test.ts:271-282`, `settings.test.ts:367`. |
| 47 Running: Format, team count, points table, Selection mode locked with reason | met | `settings.ts:267-269` returns `setting_locked` (HTTP 409). UI: `lockedReason` passed in `einstellungen.vue:337, 349, 355`; `SettingLockedNote`. API tests `event-settings.test.ts:244-259` (four cases). |
| 48 Team size never below fullest team, reason shown | met (stub floor of 1 by design) | Module `settings.ts:281`; UI `StepFormat.vue:40-41`; floors from `server/utils/settings-floors.ts:7` (1, until 1.4 per spec). Unit tests with a non-trivial floor `settings.test.ts:411-413, 436`. 1.4 hand-over exists: #153 line "replaces the constant Team size floor". |
| 49 Veto allowance never below most spent | met (stub floor 0 by design) | Module `settings.ts:282`; UI `StepMode.vue:139-140`; unit test `settings.test.ts:416-418`. Spec says "0 spent until 1.5". See N5 on tracking. |
| 50 Wheel off reveals, on hides | met | See secrecy table. |
| 51 Event without settings cannot start a Session | met as specified | `canStartSession` (`settings.ts:294`), tested; spec/ticket says 1.4 enforces it (no start-Session code exists yet). #153 story 59 carries it. |
| 52 „So wird gespielt“ card with Format, Team size, Game count, mode, Veto allowance, points table | met | `HowWePlayCard.vue` + `EventSettingsSummary.vue` + `app/utils/settings-summary.ts:209-226` (teams "à n", games, points with values, mode with „verdeckt“, Vetos row only with Lucky Wheel). |
| 53 Pools listed when not hidden | met | `HowWePlayCard.vue:78-108`. |
| 54 Hidden wheel: counts only | met | `HowWePlayCard.vue:59-64`; data is counts only (server side). |
| 55 Names, ids, images, clips never reach a Player's browser | met | See secrecy table and test. |
| 56 Card for Event without settings says Host hasn’t set up | met | `HowWePlayCard.vue:45-50`; `de.json:1277`. |
| 57 Wizard for Cloudflare R2 | met in code, human run open | `scripts/wizards/r2-setup.sh`, `bash -n` OK. See #139/#140. |

#### #138 Implementation Decisions

| Decision | Verdict | Evidence |
|---|---|---|
| Pure settings rules module (parse, partial change check, default allowance, pool size) | met | `shared/settings.ts` (browser and server share it). |
| Format `teams` only; team count 2–8, size 1–6, ≤24 | met | `settings.ts:168-175`. |
| Points table: per-place non-negative ints, length = teams, never rising, preset stored | met | `settings.ts:180-190`; preset values must equal the preset (`invalid_points`). |
| Selection mode; wheel options only with Lucky Wheel (off/null otherwise) | met | `settings.ts:197-209`; sending them with Admin pick is refused (`wheel_options_without_wheel`), stored as `false`/`null` otherwise. |
| Locked once running; floors | met | see above. |
| Recommended pool size formula | met | `settings.ts:123-126`. |
| Schema: `games`, `events` settings columns nullable, `event_pool_games` unique per (event, game, pool); no extra columns | met | `drizzle/0006_game_library_and_event_settings.sql`; `server/db/schema.ts`. PK (event_id, game_id, pool) gives uniqueness and allows a game in both pools. `ON DELETE cascade` on event only. Migration test `test/integration/event-settings-migration.test.ts:44`. |
| Image store seam; R2 via fetch-based SigV4; in-memory for tests | met | `server/utils/image-store.ts`, `r2-store.ts`; SigV4 reference test `test/unit/s3-signature.test.ts`. |
| Upload: WebP only, small size cap, editor-only, fresh key | met | `image.put.ts:17-30`: 200 000-byte cap on header and body, magic-byte check (`domain/image.ts:6`), `imageKey` random per upload. |
| Serving: long-lived immutable cache; access rule | met | `images/[key].get.ts:31` `private, max-age=31536000, immutable`. See N4. |
| YouTube: watch, youtu.be, shorts, embed; thumbnail fallback; IFrame player | met | `shared/youtube.ts` (also `live`); `ClipPreview.vue`. |
| Library API: list with filters, read, create, update, upload; viewers = Host perm or admin; editors = creator or admin | met | `server/api/games/*`. |
| Create Event takes settings and both pools in one transaction | met | `server/api/e/index.post.ts:95-108`. |
| Host-only partial settings update with new settings or a reason | met | `settings.patch.ts` (transaction, row lock). Also takes pools. |
| Event read: settings + pools; full for Host; counts only otherwise | met | see secrecy. |
| Event read tells Host whether it needs setting up | met | `settings: null` (`[slug].get.ts:187`), used by `EventPage.vue:116`. |
| UI is own build, German copy in i18n, info copy from brief §17 | met | `i18n/locales/de.json`; brief diff included. |
| Human task ticket with `/wizard` | met | #139/#140. |

---

### Per-ticket tables

#### #139 1.3-01 Wizard for Cloudflare R2 (closed)

| Requirement | Verdict | Evidence |
|---|---|---|
| Wizard opens each Cloudflare/Vercel page, says what to click, captures each value | met | `scripts/wizards/r2-setup.sh` (stage text, `ask_eu`, per-value prompts). |
| Sets values in Vercel for staging and production without printing secrets | met, with an unverified step | Values go to `vercel env add` on stdin (`:60`). The ticket comment says stdin use and `vercel env rm --yes` were not verified (CLI missing in build session). See F1. |
| Env var names documented where repo lists env vars | met | `README.md` env table, `.env.example`; names `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_JURISDICTION` match `server/utils/image-store.ts:202`. |
| Dry run works without Cloudflare access | met | `--dry-run` flag present; `bash -n` OK; ticket comment states dry run walked past the first external step. |

#### #140 1.3-02 Run the R2 wizard (OPEN, human)

| Requirement | Verdict | Evidence |
|---|---|---|
| Cloudflare account, one EU bucket each for staging and production | missing (human) | Ticket open; #138 comment says "#140: the human runs the R2 wizard". |
| Env vars set in Vercel for both | missing (human) | same |
| An image uploaded on staging shows on the card after reload | missing (human) | `useImageStore` throws 500 "Image storage is not configured" until the vars exist (`image-store.ts:203-205`). Until then image upload fails on staging/production; the form keeps the saved game and toasts the failure (`GameForm.vue:101-106`). |

#### #141 1.3-03 Create and list games (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Host/admin see „Bibliothek“ nav + page; Member sees neither and API answers as for a missing route | partly met | Nav/page: met (see #138). API: 404 `Not Found` JSON, but a really unknown `/api/...` GET on staging returns the SSR catch-all page (builder disclosed, #141 comment). See F2. |
| Creating a game with a valid YouTube link stores it, it appears in the list | met | `games/index.post.ts`; tests in `test/integration/library.test.ts`. |
| Broken or non-YouTube link shows „YouTube-Link kaputt“, cannot be saved with a clip | met | `GameForm.vue:55-61, 98-101`; server 400 `invalid_youtube`. |
| Cards show thumbnail or placeholder | met | `GameCard.vue:20`; `data-cover` attribute. |
| Detail plays clip from start for set length | met | `ClipPreview.vue:107` `start`/`end` playerVars. |
| API tests visibility per role + create; component tests form states | met | `test/integration/library.test.ts`, `test/nuxt/game-form.test.ts`, `test/nuxt/library.test.ts`. |
| Changelog line | met | CHANGELOG ("Bibliothek … (#141)"). |
| Also: no deleting; skeleton cards; nav tape marker removed | met | see #138. |

#### #142 1.3-04 Edit, search, filters (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Creator and admin edit; other Host sees why not and API refuses | met | `[id].patch.ts:17` (403), detail page reason `[id]/index.vue:173-179`. |
| Player count and Formats set and shown on detail | met | `GameForm.vue`, `[id]/index.vue`, `GameCard.vue:21-29` ("Beides" for both Formats). |
| Search and each filter narrow; combined filters work | met | `games/index.get.ts:91-102` ANDed; player filter excludes games with no count. |
| „Keine Treffer“ | met | `bibliothek/index.vue:219-233`. |
| API tests edit rights + filtering; component tests filter bar + edit state | met | `library.test.ts` (integration and nuxt). |
| Changelog | met | |

#### #143 1.3-05 Game image upload (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Uploading shows on card and detail | met | `GameForm.vue:94-111` uploads after save; card uses `imageUrl`. |
| Replace shows the new one without stale cache | met | New random key per upload (`domain/image.ts:23`); old key 404s (route looks up `games.imageKey = key`). |
| Non-WebP/oversized refused with a message; non-editor refused | met | 415 `image_not_webp` / 413 `image_too_large` / 403 `not_game_editor`. |
| Route serves library viewers, refuses everyone else | met (spec widened by #148) | `canSeeImage`; Members get pool images per #148. |
| API tests against in-memory store | met | `test/integration/game-image.test.ts`. |
| Changelog | met | |

#### #144 1.3-06 Stepper: name, Format, Game count, points, Sessions (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Create through steps and land on „Fertig“ with summary and Invite link | met | `neu.vue:96-136`. |
| Limits enforced in UI (plus disabled with reason) and by API | met | `NumberStepper.vue` (`aria-disabled` + `title`), server `parseSettings`. |
| Rising custom tables refused with the designed message | met | `StepPoints.vue:386-389` blocks Weiter, `PointsTableEditor` row message; server `points_rising`. |
| Locked Formats can’t be picked, skipped by arrow keys, `aria-disabled` | met | `RadioCardGroup.vue`, test `test/nuxt/radio-card-group.test.ts`, `event-stepper-mode.test.ts:110`. |
| Migration test: pre-migration Event reads as not set up | met | `event-settings-migration.test.ts:44`. |
| Unit tests rules; API tests create; component tests desktop and mobile | met | `test/unit/settings.test.ts`, `test/integration/event.test.ts`, `test/nuxt/event-stepper-layout.test.ts`. |
| "After merge: tell user #150 unblocked" | met | #144 comment; 1.4 is specced as #153. |
| Changelog | met | |

#### #145 1.3-07 Selection mode, Hidden wheel, Veto allowance (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Lucky Wheel or Admin pick; others locked | met | `StepMode.vue:127-137`. |
| Hidden wheel and allowance appear only with Lucky Wheel and are stored | met | `StepMode.vue:162`; `settings.ts:197-209`; `index.post.ts:99`. |
| Team size 3→5 moves untouched allowance 3→5; after setting 2, stays | met | `event-stepper-mode.test.ts:178-197` (the exact scenario). |
| API refuses allowance outside 0–9 and wheel options with Admin pick | met | `settings.ts:198, 208`; `settings.test.ts:290-306`; `event-settings.test.ts:130`. |
| Info sheet incl. "Host sees hidden games" line | met | `de.json` `setup.info.wheel.hostSees`. |
| „Fertig“ summary includes mode, Hidden wheel, allowance | met | `settings-summary.ts:187-190, 221-223`. |
| Changelog | met | |

#### #146 1.3-08 Game pool and Tiebreaker pool (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Fill both pools, Event created with them | met | `index.post.ts:96-103`; `event-pools.test.ts:89`. |
| Creating a game from the sheet adds to the pool without losing input | met | `event-stepper-pools.test.ts:415`. |
| Hint below the recommended size, right numbers, never blocks | met | see #138 story 38. |
| Empty pools allowed | met | `domain/pools.ts:81`; test `event-pools.test.ts:107`. |
| API and component tests | met | `test/integration/event-pools.test.ts`, `test/nuxt/event-stepper-pools.test.ts`. |
| Counts in „Fertig“ | met | `neu.vue:131-135`. |
| Game may sit in both pools; once per pool | met | PK `(event, game, pool)`; `domain/pools.ts:73` rejects duplicates within one list. |
| Changelog | met | |

#### #147 1.3-09 Edit an Event's settings (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Host of pre-1.3 Event sees „Event einrichten“ and can set up; others don't see the notice | met | `EventPage.vue:116, 155`; `settings.patch.ts:30-36` accepts a full payload for a not-set-up Event; tests `event-settings.test.ts:349`, `event-settings-entry.test.ts:20-38`. |
| Host opens editor from Host controls and saves | met | dock action, `einstellungen.vue:262-278`. |
| Running Event: locked settings refused by API and shown locked with reason | met | see story 47. |
| Floors enforced by settings module (unit tests) | met | `settings.test.ts:410-444`. |
| API and component tests | met | `event-settings.test.ts`, `test/nuxt/event-settings-editor.test.ts`, `event-settings-entry.test.ts`. |
| Hidden wheel off reveals / on hides | met | `event-settings.test.ts:216`. |
| Module answers whether an Event may start a Session | met | `canStartSession`. |
| Pools replaced per pool given; one transaction; rollback on refusal | met | `settings.patch.ts:24-47`; test `event-settings.test.ts:204` (unknown game rolls back settings too). |
| Changelog | met | |

#### #148 1.3-10 „So wird gespielt“ and secrecy (closed)

| Acceptance criterion | Verdict | Evidence |
|---|---|---|
| Members see the card with all settings; without settings the not-set-up text | met | `HowWePlayCard.vue`; `test/nuxt/how-we-play-card.test.ts:35, 95`. |
| Hidden wheel: counts; otherwise game names | met | `how-we-play-card.test.ts:47, 67`. |
| Secrecy test on raw JSON, reveal after wheel off | met | `hidden-wheel.test.ts:130-163`. |
| Image route refuses Player an undrawn hidden game's image, serves once not hidden | met | `hidden-wheel.test.ts:176-198`. |
| API and component tests | met | as above. |
| Changelog | met | CHANGELOG Neu + Sicherheit entry. |

---

### Findings

#### Blocking (release-process, not code)

None in code.

#### Should-fix

**F1. #140 (human R2 run) and #149 (release) are still open; image upload cannot work on staging/production until then.**
`useImageStore` throws a 500 when `R2_*` are unset (`server/utils/image-store.ts:203-205`), and the #138 acceptance "image shows on the game card after reload" (#140) is unverified. The wizard's `vercel env add … <stdin>` and `vercel env rm --yes` were never run for real (#139 comment).
Fix direction: run the wizard and the staging upload check before cutting 1.3.0; if `vercel env add` stdin handling fails, fix the wizard then.

**F2. Non-viewers get a JSON 404 from library routes, not "the same answer as for a missing route" (#138 API contracts, story 2).**
`server/utils/library.ts:135` throws 404 "Not Found". An unknown `/api/…` GET on staging returns the SSR catch-all page (builder disclosed this in the #141 comment and asked the user). No game data leaks; only the existence of the routes is distinguishable.
Fix direction: user decides. Either accept and amend the spec line, or add a catch-all `/api/**` 404 handler so both answers match.

#### Nits

**N1. Host of an Event without library permission gets a permanently failing pool picker.** `einstellungen.vue:250` always calls `useGameLibrary()`, and `GET /api/games` returns 404 for anyone without Host permission/admin (`library.ts:140`). `GamePoolPicker.vue:44-56` shows "list failed" with a retry that can never succeed. Existing pool games still show from the draft and saving does not lose them. Only reachable if a Host's permission is revoked after creating an Event. Fix direction: hide the picker (or show a plain "needs Host permission" note) when `canSeeLibrary(user)` is false.

**N2. UI copy calls the Event a "Session" on the create stepper** ("Name der Session", "Wie soll die Session heißen?", heading "Neue Session", „Session erstellen“, `de.json:1172-1185`), while GLOSSARY.md defines Event vs Session. The spec itself prescribes „Session erstellen“ and this is inherited from the pre-1.3 form, so I do not count it against the spec. Flagging for the user in case the copy should follow the glossary.

**N3. Info sheet explains only the chosen option, not "each option".** `useEventStepper.ts:145-150` returns the selected Format or mode. The copy for locked options (`setup.info.pickBan/loserPick/loserAdv/ffa`) exists in `de.json` but can never be shown, and `InfoSheet.vue:11` types `topic` without them. Matches the single-column design in `03-screens.md:104`, so likely intended; low impact.

**N4. Image route is `private`, so Vercel's CDN will not cache it** (`images/[key].get.ts:31`). ADR 0012 says "served through a cached Nuxt route". This follows from per-viewer access control and matches the spec wording "long-lived immutable caching" (browser cache), but every first view per browser costs a function call plus an R2 read. Fix direction: none needed now; revisit if egress or latency shows up.

**N5. The stub floors (`server/utils/settings-floors.ts:7`: Team size 1, Veto 0) rely on later releases to replace them.** 1.4 (#153) lists the fullest-team floor; the Veto floor "stays 0 until 1.5" and 1.5 is only an outline. Fix direction: make sure the 1.5 ticket set includes replacing `SETTINGS_FLOORS` for the Veto allowance. Also note there is no API-level test of the floors because the constants are fixed; they are unit-tested at module level (`settings.test.ts:410-444`).

**N6. The diff carries unrelated tooling and docs** (about 60 files under `.claude/skills/`, `.claude/settings.json`, `scripts/cloud-setup.sh`, `docs/research/realtime-hosting.md`, ADR 0013, `docs/agents/*`, `.gitattributes`, `CLAUDE.md`, `docs/roadmap.md`). None is in the #138 scope; harmless to behavior, but they travel with the staging-to-main release.

**N7. Host sees "Der Host hat das Event noch nicht eingerichtet." on their own not-set-up Event** (`HowWePlayCard.vue:45-50`), next to the „Event einrichten“ notice. Spec only describes the Member view; wording for the Host is slightly odd but not wrong.

#### Scope creep check

No behavior was added beyond the spec that conflicts with it. Small additions: `live` links accepted by the YouTube parser (`shared/youtube.ts:12`), the HostDock now appears in `date_set`/`running` Phases (needed for "open the editor at any time", story 44), `GET /api/games` returns a `total`.

## COMPIES 1.3 „Spielvorbereitung“: thermo-nuclear and architecture review

Diff: `git diff v1.2.0...origin/staging` (6d64db2), `docs/design_handoff_compies` and `.claude/skills` ignored. Read-only: I extracted `origin/staging` with `git archive` into the scratchpad and read it there. I ran no tests and no typecheck; every claim below comes from reading the code at the cited `file:line` (staging line numbers).

Standards applied: `.claude/skills/thermo-nuclear-code-quality-review/SKILL.md` (part 1), `improve-codebase-architecture` and `codebase-design` vocabulary (part 2: module, interface, depth, seam, adapter, leverage, locality, deletion test), the previous review `docs/reviews/thermo-nuclear-review_2026-10-24.md` (part 3), spec #153, ADR 0012/0013 and `docs/roadmap.md` (part 4).

Size of the diff: 4,857 added source lines (app, server, shared), 6,329 test lines, 218 copy lines. 73 commits.

---

### Verdict

**No blocker; do not hold 1.3 for any of this.** The skill's file-size rule is met: no file crosses 1,000 lines. The largest new source file is `GameForm.vue` (299); `i18n/locales/de.json` went 1,188 → 1,383 (copy, waived). No presumptive blocker from the approval bar is a bug today. Nothing found breaks behaviour or leaks a pool game.

What is good, so nobody "fixes" it:

- `parseSettings` / `checkSettingsChange` (`shared/settings.ts:164, 257`) is a deep module: pure, injected `phase` and `floors`, one 450-line unit test file at its interface.
- The pool secrecy lives at the query: `eventPools(db, id, visible)` (`server/utils/pools.ts:16`) does not even select a game when `visible` is false.
- `ImageStore` (`server/utils/image-store.ts`) is a real seam: two adapters (R2, memory), and the routes only see the interface.
- The previous review's T1–T8 were nearly all applied (part 3).

What I would still change, in order: the 1.3 additions copy a few patterns instead of using the structure 1.2 had just created (mutation wrapper, `displayName ?? name`, stepper pages), three rules live in 2–3 encodings (game validation, pool visibility, wheel options in the draft), and the Event read will be the bottleneck of 1.4 as it stands.

Severity legend: **blocking** (presumptive blocker, none), **should-fix** (do soon; the first group before 1.4 starts), **opportunity** (clear win, not urgent), **nit**.

---

### Part 1 and 2: findings

Sizes are estimates ("≈ -n lines" = net). All moves keep behaviour; where one needs your decision I say so.

#### Group A: before 1.4 starts (should-fix)

##### A1. Every Event mutation is hand-rolled; 1.4 needs one place to publish after commit (should-fix)

- **Where:** `server/api/e/[slug]/settings.patch.ts:16-48` (new in 1.3), `server/api/e/[slug]/slots/index.post.ts:14-31`, `slots/[slotId].patch.ts:23`, `slots/[slotId].delete.ts:20`, `slots/[slotId]/vote.put.ts:37`, `server/api/e/index.post.ts:47-60`; against `server/utils/sessions.ts:26-43` (`changeSessions`).
- **Cost today:** the previous review's T1 move (`changeSessions`) stopped at Sessions. Six other handlers repeat `requireUser → readBody → useDb(event).transaction → loadEvent(tx, slug, user.id, { hostOnly, lock })`. 1.3 added the sixth copy (settings.patch) and its own casts. Spec #153 says "every mutating Event endpoint publishes after its commit" (≈ 14 handlers incl. new ones). Today that means editing 12+ files and one forgotten publish is a silent stale screen.
- **Move:** deepen `server/utils/event-access.ts` with `changeEvent(event, { hostOnly, lock }, change)`: auth, body read before the lock, transaction, `loadEvent`, run `change({ tx, eventRow, user, body })`, and **return the commit hook point** (`afterCommit(messages)`). `changeSessions` becomes a thin caller of it. 1.4 adds the room notifier in exactly one function. `vote.put.ts` keeps its rate limiter outside. Add the deletion-test result to the ticket: deleting `changeEvent` brings back 8 copies of the 6-line preamble and the 1.4 publish call.
- **Size:** ≈ -45 lines now, and 1.4's publish becomes +1 call site instead of +14.
- **Trap:** error precedence must stay: 401 before body, `loadEvent` 404/403 before rule checks (the sessions tests pin it). Votes lock `share`, the rest `update`.

##### A2. The Event read is a 111-line monolith with six independent reads awaited in sequence (should-fix)

- **Where:** `server/api/e/[slug].get.ts:25-93` (reads at `:31, :32, :33, :38, :45, :68`).
- **Cost today:** after `requireUser` (≥ 2 queries) and `loadEvent` (2 queries), six independent queries run one after the other. ADR 0013 puts a Vercel→Neon hop at ≈ 100–300 ms, so the read is roughly 1–2 s on a cold hop. User story 1 of #153 wants "within about a second" **after `event.changed` refetches this exact route**, and every Member refetches on every change (a vote burst = N clients × full read). 1.4 adds ~6 more fields (zone/team/word per Member, teams, started/ended, Running Session, Team choice, start rule) to the same function. This is the skill's rule 7 (serialized independent work) and rule 2 (a handler that grows a branch per release).
- **Move:** split the handler into section builders in `server/utils/event-read.ts` (`pollSection`, `sessionSection`, `membersSection`, `poolsSection`; 1.4 adds `boardSection`) that take `(db, eventRow, viewer)` and return their slice; the handler is `const [poll, sessions, members, pools] = await Promise.all([...])`, then composes `EventView`. The viewer-dependent rules (`isHost` fields: `inviteUrl`, `settingsFloors`; pool visibility) move into the section that owns them. Neon `Pool` supports concurrent queries (`useDb` in `server/utils/db.ts`), PGlite serializes them in tests, so nothing breaks.
- **Size:** file +40, handler -60; read latency from ~6 round trips to ~1 for the section group.
- **Optional, bigger:** pools do not change on a vote. Serve them from `GET /api/e/:slug/pools` (used by `HowWePlayCard` and the editor) and keep the poll-refetched read small. Needs a client change (`EventPage.vue`, `einstellungen.vue`) and the hidden-wheel test updated to read two raw responses. I would do it only after measuring the payload (up to 200 games × 2 pools, `server/domain/pools.ts:6`).

##### A3. "Who sees pool games under a Hidden wheel" is written in three encodings (should-fix, secrecy-critical)

- **Where:** `server/domain/pool-visibility.ts:8-10` (`isHost || (settings !== null && !settings.hiddenWheel)`), `server/domain/image-access.ts:19` (`isHost || !hiddenWheel` over rows), `server/utils/pools.ts:50` (`coalesce(events.hiddenWheel, true)`: "not set up" means hidden).
- **Cost today:** `image-access.ts:18` already says "Drawn games under a Hidden wheel become visible in 1.5: that is the branch to add here". 1.5 must then change `poolsVisibleTo` (Event read), `canSeeImage` and the SQL `coalesce`, and keep all three in step, or a player sees names but gets a 404 image (or the reverse, a leak). The two TS predicates agree today only because a null in one place is `true` in another.
- **Move:** one function in `server/domain/pool-visibility.ts`: `canSeePoolGames({ isHost, hiddenWheel: boolean | null }): boolean` (null = not set up = false). `poolsVisibleTo` and `canSeeImage` call it; `poolEventsOf` selects the raw nullable column and no longer coalesces. Test once at the module's interface; the two callers' tests shrink.
- **Size:** ≈ -10 lines, 1 rule instead of 3, and the 1.5 "drawn" branch gets a single home.

##### A4. Settings floors are a constant imported twice; the 1.4 floor and the "move players to the Bench" step have no seam (should-fix)

- **Where:** `server/utils/settings-floors.ts:7`, imported at `server/api/e/[slug]/settings.patch.ts:10,33` and `server/api/e/[slug].get.ts:11,63`.
- **Cost today:** 1.4 replaces the Team size floor with the fullest team (a DB read inside the PATCH transaction, since a move can race with the change) and moves Players of removed teams to the Bench "in the same transaction" with activity entries. The current handler has no named step to hang that on: the diff of `current` vs `settings` is not even computed, but the activity feed needs "Game count or Team size changed".
- **Move:** extract `applySettingsChange(tx, row, change)` from the PATCH handler into `server/utils/settings.ts`. It reads the floors (`settingsFloors(tx, eventId)`, constant for now), calls `checkSettingsChange`, writes, and returns `{ before, after }`. Add a pure `changedKeys(before, after)` next to `checkSettingsChange`. The Event read calls `settingsFloors(db, id)` for the Host. 1.4 then adds two lines. Also let `parsePools` return only the lists that were given (`Partial<NewPools>`), which removes `rawPools` and its cast (`settings.patch.ts:21, 38`) and the two `settings!` assertions (`:40, :46`).
- **Size:** ≈ ±0 lines now (a move), -8 casts/assertions.

#### Group B: duplicated structure inside 1.3 (should-fix)

##### B1. The Event setup stepper (`/neu`) and the settings editor are two copies of one wizard (should-fix)

- **Where:** `app/pages/neu.vue:45-61, 40-43, 152-207` against `app/pages/e/[slug]/einstellungen.vue:51-67, 46-49, 122-172`; `app/composables/useEventStepper.ts` (48 lines).
- **Cost today:**
  - `next()` is the same 17 lines (blocker/saving guard, `advance`, `saving`/`failure`, try/catch/finally).
  - `nextLabel`, the `<p v-if="failure" role="alert">` line, the `#info` slot with `InfoSheet`, the 10 `EventStepper` props and 3 listeners, and the `useGameLibrary()` keep-alive call (`neu.vue:32`, `einstellungen.vue:39`) are copied.
  - The step dispatch is a `v-if` chain of 7 branches per page, and each step has its own `v-model` type (string, `EventSettings`, `EventDraft`, `SessionsDraft`), so it cannot be a loop.
  - `useEventStepper<K extends string>` is "generic" but hard-codes `'format'`, `'mode'`, `'tiebreaker'` (`:27-32`). Its interface (11 returned values) is nearly as wide as its body: shallow by the deletion test.
  - The lock knowledge is split three ways: `LOCKED_WHEN_RUNNING` in `shared/settings.ts:231`, `lockedReason` passed down by the editor, and which controls each step locks (`StepFormat.vue:56,75` locks Format and team count but not Team size; `StepMode.vue:52`; `StepPoints.vue:27`).
- **Move (code judo):** one deep module, `app/components/stepper/EventSetupWizard.vue`, that owns the step list, the current/reached/blocker/failure state, the dispatch table `STEP: Record<StepKey, Component>`, the `EventStepper` layout, the `InfoSheet` slot, the `useGameLibrary()` hold and the submit state machine. Its interface is small: `mode: 'create' | 'edit'`, `v-model="draft"`, `:rules="{ lockedReason, floors }"` and `submit: (draft) => Promise<void>` that throws on refusal (the wizard shows `t(apiErrorKey(error, …))`). Every step gets the same interface (`v-model="draft"`, `v-model:blocker`, `:rules`), so the chain becomes `<component :is="STEP[stepKey]" …>`. `neu.vue` keeps the gate, the Fertig screen and `POST /api/e`; `einstellungen.vue` keeps the gate, the phase message and `PATCH`; steps `name` and `sessions` exist only when `mode === 'create'`. `useEventStepper.ts` is deleted.
- **Size:** pages -75 lines, wizard +95, `useEventStepper.ts` -48, three steps' `defineModel` plumbing -10: **≈ -40 lines, 1 file less, one place for 1.4's "no Session can start without settings" link and the Sessions step.**
- **Tests:** `test/nuxt/event-stepper*.test.ts` and `event-settings-editor.test.ts` mount the pages, so they survive. The wizard gets one small file for dispatch and blocker logic.

##### B2. The draft keeps the Lucky Wheel options in three places and re-syncs them by hand (should-fix)

- **Where:** `app/utils/event-draft.ts:19-22` (`touched`, `wheel`), `:54-84` (`chooseMode`, `setHiddenWheel`, `setVetoAllowance`, `followTeamSize`), `app/composables/useEventStepper.ts:12-14` (a `watch` on `teamSize`), `app/components/stepper/StepMode.vue:75` (reads `draft.wheel.vetoAllowance`, not `settings`).
- **Cost today:** `hiddenWheel` lives in `draft.wheel` and `draft.settings`; `vetoAllowance` lives in `draft.wheel`, `draft.settings` and the `touched` flag. Four functions and one watcher keep them equal, and `followTeamSize` has an explicit branch for "mode is not lucky_wheel, update wheel only" (`:82`). `draft.settings` can hold values the invariant of `EventSettings` forbids (`hiddenWheel` is documented "false otherwise").
- **Move:** keep one holder. `draft.wheel = { hiddenWheel: boolean, vetoAllowance: number | null }` where **null means "follows the Team size"** (this replaces `touched`). `draft.settings` stays as the steps edit it (Format, teams, Game count, points, mode). A pure `settingsOf(draft): EventSettings` derives the stored form: `lucky_wheel` → wheel options (`null` → `defaultVetoAllowance(teamSize)`), anything else → `false`/`null`. `draftBody`, `settingsBody` and the Fertig summary call it. Deleted: `touched`, `setHiddenWheel`, `chooseMode`'s branches (it becomes a one-field update), `followTeamSize`, the watcher. `draftFromEvent` becomes: stored allowance → number, none → null.
- **Size:** ≈ -45 lines in source, event-draft tests (`test/unit/event-draft.test.ts:121-197`) shrink to "settingsOf" cases.
- **Behaviour check:** "In the stepper it follows the Team size until the Host touches it; after that, and after creation, only the Host changes it" (roadmap) is exactly `null` vs number.

##### B3. Game rules are validated three times on the client and server, with different code (should-fix)

- **Where:** server `server/domain/game.ts:27-31` (`parseGameName`), `:41-44` (`parseWholeNumber`), `:47-59` (`parsePlayerBound`, `parsePlayers`), `:109` (a third "1–99" regex in `parseGameFilters`); client `app/components/GameForm.vue:45-46` (name length), `:72-77` (clip length regex + bounds), `:81-89` (`parsePlayerCount` + own `rangeInverted`); `shared/game.ts:16-21` (`parsePlayerCount`).
- **Cost today:** the constants are shared (`CLIP_LENGTH_MIN`, `PLAYERS_MAX`, `GAME_NAME_MAX`), the logic is not. "Player count 1–99" exists as a server number check, a shared text parser, and a regex in the filter parser. The previous review's T8 complained about exactly this kind of rule (a name counted in four places); `shared/event.ts:17` has `eventNameLength` for Events and 1.3 did not make the game twin. The stepper side of settings is shared through `shared/settings.ts`; the game side is not, so the two halves of 1.3 follow different rules of placement.
- **Move:** `server/domain/game.ts` imports only `shared/*`, so move its pure rules (`parseGameName`, `parseWholeNumber`, `parsePlayerBound`, `parsePlayers`, `parseFormats`, `escapeLike` stays server-side) into `shared/game.ts` and add `gameNameLength(raw)` like `eventNameLength`. `GameForm` calls the same functions after turning text into numbers (one `parsePlayerCount(text)` → `parsePlayerBound(number)` chain), and `parseGameFilters` reuses `parsePlayerCount`. Optional: `parseGameInput` returns `errors: Partial<Record<GameField, GameInputError>>` so the form can show per-field messages from the same code as the server's first error.
- **Size:** ≈ -30 lines (GameForm 12, game.ts 8, duplicated regexes), 0 new files.

##### B4. The library search bar and the pool picker search are two searches (should-fix; requested)

- **Where:** library `app/pages/bibliothek/index.vue:129-143` (custom `<input>` with `Search` icon, 46 px), filters `:145-196` (three chip styles), debounce and URL sync `:58-68`, states `:199-280`, layout switch via `matchMedia` `:81-90`; picker `app/components/GamePoolPicker.vue:20-26` (client-side filter with `toLocaleLowerCase('de')`), `:32-38` (`TextField type="search"`), states `:42-107`; server filter `server/api/games/index.get.ts:18-29`, `server/domain/game.ts:107-122`.
- **Cost today:**
  - Two matching semantics: the library runs `ilike` in Postgres, the picker lowercases in the browser with the `de` locale. They can disagree for umlauts and `ß`.
  - Two copies of the same five states (error, loading skeleton, library empty, no match, list), with different markup, copy keys (`library.*` vs `stepper.pool.*`) and the same fetch.
  - The picker lacks the player-count and Format filters, which a Host building a 3v3 pool wants most.
  - `useFetch('/api/games', { key: 'games' })` is called by the library page with a `query` and by `useGameLibrary()` without one, under the **same key** (`bibliothek/index.vue:43`, `useGameLibrary.ts:9`). They never mount together, so it works, but it is a trap.
  - `useGameLibrary()` is also called by two pages only to keep the key alive across steps (`neu.vue:32`, `einstellungen.vue:39`): a side-effect call whose result is dropped.
- **Move (deepening candidate, strength: Strong):** one module, `GameBrowser.vue`, over one fetch.
  - **Interface:** `v-model:filters`, `compact?: boolean`, `to?: (game) => RouteLocationRaw` (library: the card is a link), and a `#card-actions="{ game }"` slot (picker: the toggle button), `#toolbar` slot (create buttons).
  - **Behind it:** `GameSearch` (input with icon plus filter chips; `compact` = 40 px input, chips behind one "Filter" button or only search plus player count), the five-state machine as one `computed` (`'error' | 'loading' | 'empty' | 'noMatch' | 'list'`), the grid/row layout in CSS (no `matchMedia`), and the skeletons.
  - **Filters in one place:** `filterGames(games, filters, viewerId)` in `shared/game.ts` (name contains, player range covers with "no count never matches", Format, `mine`). The library page keeps a thin `useRouteFilters()` (the URL, debounce and `param()` code now at `:20-68`); the picker keeps a local `ref`.
  - **Two real adapters** (URL-bound page, local picker) make the seam real by the "two adapters" rule.
  - **Decision for you:** the picker already loads the whole library and `useGameLibrary` shares one unfiltered key across the two pool steps. Filtering on the client for both then deletes `parseGameFilters`, `escapeLike`, the SQL condition block and `GameList.total` could stay for the placeholder. That changes the `GET /api/games` contract in #138 (`q`, `players`, `format`, `mine`), so I list it as an option, not as part of the move. Without it, `useGameLibrary(filters)` includes the filters in its key and the picker loses its cross-step cache.
- **Size:** `bibliothek/index.vue` 283 → ≈ 130, `GamePoolPicker.vue` 109 → ≈ 35, `GameBrowser.vue` +150, `useRouteFilters` +30: **≈ -45 lines now**, ≈ -110 more with client-side filtering (server filter code and its tests). The picker gains the filters for free and one test file (`test/nuxt/library.test.ts` states) covers both.
- **Tests:** replace-don't-layer: test the five states once at `GameBrowser`; page tests keep only URL binding and the pool toggle.

##### B5. Pool UI: the component is already shared; the shape of the data is not (should-fix, small)

- `app/components/stepper/StepPool.vue` is one component for both pools (`kind`), which is good. What remains:
  - `:25-27` three `kind === 'main' ? … : …` ternaries for copy keys; use `stepper.pool.${kind}.count` / `.list` so a third pool costs no code.
  - The pools are keyed two ways: the draft and the PATCH use `Pool` keys (`pools.main`, `pools.tiebreaker`), but `EventPools` is `{ hidden: true, mainCount, tiebreakerCount } | { hidden: false, main, tiebreaker }` (`shared/event.ts:107-109`). So `HowWePlayCard.vue:18-30` hand-builds `counts` and `lists`, `EventSettingsSummary` takes `{ main, tiebreaker }` numbers, `summaryRows` (`settings-summary.ts:66`) builds the sentence from `main` only, and `eventPools` (`server/utils/pools.ts:23-24, 32-33`) names both.
  - **Move:** `EventPools = { hidden: false, games: Record<Pool, PoolGame[]> } | { hidden: true, counts: Record<Pool, number> }`. Every consumer maps over `POOLS`. 1.5 adds a "drawn games" state here; a keyed shape is where it fits.
  - **Size:** ≈ -20 lines, touches 6 files and the hidden-wheel test's raw-JSON assertions (rename only).
- The Game pool "Wird knapp" hint (`StepPool.vue:59-76`) is a hand-built notice: see C1.

#### Group C: components that should be one thing

##### C1. Callouts: five hand-built variants next to `NoticeBanner` (should-fix)

- **Where:**
  1. `app/components/NoticeBanner.vue:20-54`: the family head (`role="status"`, `border-2 border-line bg-surface`, icon chip per tone, `animate-enter`, always a ✕).
  2. `StepPool.vue:59-76`: the pool hint is a **copy of NoticeBanner's chrome** (same classes, same warning chip, `role="status"`) without the ✕, because NoticeBanner always renders one.
  3. `InfoSheet.vue:32-40`: the „Achtung“ box (`rounded-xl border-2 border-line bg-surface-2` + `TriangleAlert` inline in the heading).
  4. `SettingLockedNote.vue` (17 lines): dashed box with `Lock`, used at `StepFormat.vue:48`, `StepMode.vue:44`, `StepPoints.vue:20`.
  5. `HowWePlayCard.vue:67-76`: the Host-only line (`EyeOff`, copy `howWePlay.hostOnly`) beside `NoticeBanner`'s `hostOnly` chip (`common.hostOnly`, „Nur du siehst das“): the same concept in two renderings.
  6. Error lines: `<p role="alert" class="m-0 font-bold text-error-fg">` at `neu.vue:196`, `einstellungen.vue:161`, `GameForm.vue:270`, `GameImageField.vue:109`, plus `einstellungen.vue:98` (`role="status"` for the phase message).
- **Cost today:** a design change (radius, border width, chip colours) touches 4+ files. The next release (1.4 adds "NoticeBanner states", the uneven-teams notice, the connection banner) will add a seventh variant unless the family has a home.
- **Move (one module, `NoticeBanner` as the head of the family):** props `tone: 'info' | 'success' | 'warning' | 'locked' | 'error'`, `icon?`, `closable?: boolean` (default `true`, so existing callers are unchanged), `hostOnly?`. `locked` = dashed border and `bg-paper-2`; `error` = `role="alert"`. Then: the pool hint is a 5-line `NoticeBanner tone="warning" :closable="false"`; `SettingLockedNote` is deleted (its 3 callers use `tone="locked"`); the four error `<p>`s become `tone="error"`. `InfoSheet`'s „Achtung“ stays a section (it has a heading), but takes its classes from the same tone token via a `calloutClasses(tone)` util that `NoticeBanner` also uses, so the look lives once. `howWePlay.hostOnly` becomes the banner's slot text with the `hostOnly` chip.
- **Size:** ≈ -45 lines, -1 file; I did not check the visual spec: confirm with the design hand-off that `locked` may be a banner tone (it is the "LockedOption" look in `RadioCardGroup.vue:5-9`).

##### C2. Library page frame is copied across four pages, plus the back link five times (opportunity)

- **Where:** the `v-if="!viewer"` → `ConstructionPage` gate with an `AppShell` pair in `bibliothek/index.vue:99-108`, `[id]/index.vue:44-54`, `[id]/bearbeiten.vue:31-42`, `bibliothek/neu.vue:20-31` (and the same shape in `app/pages/neu.vue:73-83`, `einstellungen.vue:71-85`); the hand-built `NuxtLink` + `ChevronLeft` back link at `neu.vue:85-95`, `einstellungen.vue:87-96`, `bibliothek/neu.vue:33-42`, `[id]/index.vue:56-65`, `bearbeiten.vue:44-53`, although `BackLink.vue` exists (used by 3 legal pages). The game fetch (`useFetch<GameView>`, key `game-<id>`, `immediate: viewer`, `missing`, `refresh`) is copied between `[id]/index.vue:16-20` and `[id]/bearbeiten.vue:16-20`, with the same retry `FullScreenState` (`index.vue:67-79` / `bearbeiten.vue:55-67`).
- **Move:** `GatedShell.vue` (`allowed`, `kind`, `no-tabs`, default slot; renders `ConstructionPage` when not allowed), a `to`/`label` prop on `BackLink` (history-back stays the default), and `useGame(id)` returning `{ game, missing, error, status, refresh }`.
- **Size:** ≈ -60 lines across 6 pages.

#### Group D: types, casts and small contracts (opportunity / nit)

##### D1. Stringly-typed `RadioCardGroup` forces casts and `includes` tricks (opportunity)

- **Where:** `RadioCardGroup.vue:11-12` (`modelValue: string`, `options.value: string`), casts at `StepFormat.vue:31` (`value as Format`), `PointsTableEditor.vue:31` (`preset as PointsPreset` twice), `StepFormat.vue:28` and `StepMode.vue:30` (`(AVAILABLE_FORMATS as readonly string[]).includes`), `StepMode.vue:32-34` (re-checking the literal), `StepSessions.vue:108` (`$event as SessionsDraft['mode']`).
- **Move:** `<script setup generic="T extends string">` on `RadioCardGroup` (and `SegmentedControl`). Plus an options table per concept, `app/utils/settings-options.ts`: `FORMAT_OPTIONS`, `MODE_OPTIONS`, `PRESET_OPTIONS` with `{ value, nameKey, descKey, icon, available }`. `StepFormat`, `StepMode`, `PointsTableEditor` and `settings-summary.ts:9-21` (`MODE_NAME`, `PRESET_NAME`: the same i18n keys again) read it. `StepFormat` shows `bracket` and `league`, which are not in `FORMATS`; the table marks them `available: false` explicitly instead of via a miss in `includes`.
- **Size:** ≈ -30 lines, 6 casts gone.

##### D2. Casts at the new trust boundaries (nit; regresses S3 of the previous review)

- `server/api/e/index.post.ts:30,33` (`(body as { settings?: unknown } | null)?.settings` twice), `settings.patch.ts:18,21` (`as { settings?: unknown, pools?: unknown } | null`, `as Record<string, unknown>`), `server/domain/game.ts:71` (`as Record<string, unknown>`) and `:110` (`query.format as Format`), `server/domain/pools.ts:28`.
- **Move:** one `asRecord(raw): Record<string, unknown>` guard (there is already an `isRecord` private to `shared/settings.ts:148`; export it) and `parseCreateEvent(body)` in `server/domain/event.ts` that calls `parseNewEvent`, `parseSettings`, `parsePools` and returns one result; the create handler loses 12 lines. Keep `unknown` input.

##### D3. `settingsEditable` and `sessionsEditable` are the same function (nit)

`shared/settings.ts:239-241` and `shared/event.ts:44-46` have identical bodies ("every Phase before the Event is finished"). The two names exist for readability, but 1.4 adds "teams lock at the first start", "Session start", "Team choice open"; each will want a Phase predicate. Define the phase set once (`isBeforeFinish(phase)`) in `shared/event.ts` and implement both names with it, or keep one name. Also `shared/event.ts` mixes rules, the Event wire types and Home types in 224 lines and imports types from `settings.ts` while `settings.ts` imports `Phase` from it (type-only cycle): moving `PHASES`/`Phase` and the phase predicates to `shared/phase.ts` ends the cycle. ≈ ±0 lines.

##### D4. `GameView` re-lists the nine fields of `PoolGame` (nit)

`shared/game.ts:39-55` vs `shared/event.ts:94-104`. `poolGameView` and `gameView` already spread one into the other at runtime (`server/utils/library.ts:62-68`). Declare `PoolGame` in `shared/game.ts` (it is a game concept) and `interface GameView extends PoolGame`. `canSeeLibrary` is re-exported through `app/utils/construction.ts:22` as a pass-through (used by `HubNav.vue:4`): import it from `shared/game` and delete the re-export.

##### D5. `displayName ?? name` is now six copies (regresses S8)

`server/api/e/[slug].get.ts:86`, `server/api/invite/[invite].get.ts:23`, `app/components/UserMenu.vue:12`, `app/pages/index.vue:19`, and the new `creatorNameOf` in `server/utils/library.ts:28-31` (used 3 times in the library routes, never by the others). Make it one `shownName({ name, displayName })` in `shared/auth.ts` and use it in all six. ≈ -8 lines. This is the same finding the previous review filed as S8.

##### D6. `InfoSheet` decides what to show from whether a translation key exists (opportunity)

`InfoSheet.vue:14-20` filters sections with `te('setup.info.<topic>.<part>')`. A typo in `de.json` silently drops a section; the Selection-mode copy and the component are coupled through key existence (skill rule 4: magic). Put the table in code (`INFO_SECTIONS: Record<Topic, SectionKey[]>`) with a unit test that every listed key exists in `de.json`. ≈ +12 lines, but the behaviour becomes checkable.

##### D7. R2 adapter signs S3 requests by hand (opportunity)

`server/utils/r2-store.ts:33-90` is 60 lines of AWS Signature V4 (`sha256Hex`, `hmac`, `signS3Request`), checked by `test/unit/s3-signature.test.ts` (26 lines) and "checked by hand on staging". `aws4fetch` (about 3 kB, Web Crypto, documented by Cloudflare for R2) is the canonical choice and still keeps the ADR 0005 promise (no Vercel-only APIs). It is a judgment call because of the extra dependency. Whichever you pick, 1.4 needs HMAC-SHA256 twice more (room token HS256, internal call `ROOM_INTERNAL_SECRET`): move `hex`/`hmac` to `server/utils/crypto.ts` before they get copied a third time.

##### D8. Smaller things (nits)

- `server/api/images/[key].get.ts:21`: lookup by `games.imageKey`, but `server/db/schema.ts` has no index on `image_key` (only `games_created_by_idx`). Add a unique index (a key is generated per upload anyway).
- `server/api/games/[id]/image.put.ts:25-28`: the old object is never deleted from R2 after a replace (200 kB each). Not urgent; note it in the R2 section of the docs.
- `app/pages/bibliothek/[id]/index.vue:24`: a private Berlin month formatter; the repo has `app/utils/berlin-time.ts` and `shared/time.ts`.
- `GameCard.vue:20-30` and `bibliothek/[id]/index.vue:28-40` format the player count and Formats twice with different wording; one `describeGame(game, t)` beside `settings-summary.ts` (the existing pure-with-`t` pattern).
- `bibliothek/index.vue:81-90`: layout (card vs row) is chosen with `matchMedia` in JS and starts "wide", so phones flash the wide layout after hydration. `GameCard`'s two layouts differ only in classes; make them responsive classes.
- `app/pages/neu.vue:41` borrows `mvp.create.saving`; there is now also `eventSettings.saving` and `gameEdit.saving`. A `common.saving` key (the S9 note) would be right.
- The same try/catch/toast sequence for "save a game and refresh `games`" is in `StepPool.vue:49-54` and `bibliothek/neu.vue:12-16`, and the key string `'games'` appears in 5 files. A `GAMES_KEY` const plus `afterGameSaved(game)` in `useGameLibrary` ends it.
- `shared/settings.ts:294`: `canStartSession` is exported and unused; it is a 1.4 anchor (spec says the start rule "uses `canStartSession`"), so keep it, but a one-line comment saying so avoids a delete.
- `shared/settings.ts:271-275`: `delete merged.hiddenWheel / vetoAllowance` is the one hack in the merge. A pure `mergeSettings(current, change)` with its own unit test would hold it.
- 24 new `ApiErrorCode`s (`shared/errors.ts`) with 22 `CODE_COPY` lines and about 12 copy strings: about 10 of them (`team_count_range`, `game_count_range`, `format_unavailable`, `invalid_clip`, …) can only come from a request the stepper cannot build. They are a safety net if client and server rules drift (B3, B2), which argues for keeping them. If you prefer less to maintain, fold those into `invalid_settings` / `invalid_game_*` with the generic copy. I would not do this before B2/B3 land.
- i18n namespaces for one screen are `stepper.*`, `setup.*` and `mvp.create.*` (legacy). Rename only when touching.

---

### Where the new modules are shallow (deletion test)

| Module | Interface | Test | Verdict |
|---|---|---|---|
| `useEventStepper` | 11 returned refs/functions, generic key list that is not generic | wiring only | Shallow; folds into B1's wizard |
| `SettingLockedNote` | one prop, 17 lines | via editor tests | Pass-through; folds into C1 |
| `useGameLibrary` | `useFetch` with a key | via page tests | A keep-alive hack, not a module; becomes the browser's fetch (B4) |
| `GamePoolPicker` | `selected`, `toggle`, `#actions` | page tests | Half of a module; the other half is in the library page (B4) |
| `event-draft.ts` | 8 functions + draft | 265-line unit test | Too wide because of the shadow state (B2) |
| `settings-floors.ts` | a constant | via integration tests | Fine now, wrong shape for 1.4 (A4) |
| `checkSettingsChange` / `parseSettings` | 2 functions, pure | 452 lines | Deep, keep |
| `eventPools` + `poolsVisibleTo` | 2 functions | integration | Deep except the three-way predicate (A3) |

---

### Part 3: previous review (2026-10-24) vs 1.3

I read the code at staging, not the commit messages. "Applied" means the structure from the review exists at v1.2.0 or in 1.3; 1.3-specific notes follow.

| ID | Recommendation | State in 1.3 |
|---|---|---|
| T1 | One pipeline for every Session change (`changeSessions`) | **Applied** (`server/utils/sessions.ts:26`), `phaseOf` used by create (`index.post.ts`). **Not extended:** 1.3 adds `settings.patch.ts` as a sixth hand-rolled transaction (A1) |
| T2 | `numberedSessions`, shown number sent by the server, `SessionView` union | **Applied** (`server/domain/session.ts:34`, `shared/event.ts:60-84`) |
| T3 | Open Slots and Votes decided once | **Applied** (`openPoll`, `[slug].get.ts:43`) |
| T4 | API answer types in `shared/`, every handler annotated | **Followed** in 1.3: all six game handlers (`Promise<GameView>`, `GameList`), the Event read and create are annotated; shared `AuthUser`. Gaps: `settings.patch.ts:16` returns an inline `{ settings }` type and `einstellungen.vue:57` calls it untyped; `apiFailure` still casts |
| T5 | Split the Event page | **Applied** (`EventPage.vue` 284 lines, `EventSessions`, `EventPoll`, `useOptimisticVotes`). 1.3 added 55 lines (settings notice, dock, `HowWePlayCard`); 1.4 will push it again (O3 below) |
| T6 | `HoldToConfirm` resets, one `send` (`useEventMutation`) | **Applied** for the Event page. **Regressed in spirit:** four 1.3 flows write their own try/catch/toast (`neu.vue:45-61`, `einstellungen.vue:51-67`, `GameForm.vue:128-155`, `StepPool.vue:49-54`). The wizard (B1) is where this converges, using `apiErrorKey` once |
| T7 | Canonical helpers on the client | **Followed:** the 24 new codes went into `CODE_COPY` (`api-error.ts`), `settingsPath` into `shared/links.ts`, `vote-look.ts`, the `titleTemplate` plugin all exist and 1.3 uses them. **Misses:** a private Berlin formatter (D8), `canSeeLibrary` re-exported through `construction.ts` (D4) |
| T8 | Count length once; setup page uses `TextField` | **Applied** (`shared/text.ts` `characterCount`, used by Event, Game, `TextField`). **Regressed once:** the game name length is recomputed in `GameForm.vue:46` instead of a shared `gameNameLength` (B3) |
| S1 | One error mechanism | **Neutral:** 24 new coded errors (the default is now clearly the code route). New hand-made `libraryNotFound()` (`server/utils/library.ts:14`) is the same ADR 0006 "generic link answer" as `eventNotFound`, so intended; `useImageStore` throws an English 500 (`image-store.ts:37`), which is operator-facing and fine |
| S2 | `isMember` in the wrong file | Unchanged. `poolEventsOf` (`server/utils/pools.ts:48-55`) joins `event_members` itself, which is reasonable in one query |
| S3 | Casts in the parsers | **Regressed:** D2 (about 8 new casts at the new trust boundaries) and D1 (stringly-typed radio groups) |
| S4 | Rejection-type zoo | Grew by `SettingsError`, `SettingsChangeError`, `GameInputError`. They document what each rule says; fine. Cost note in D8 |
| S5 | Rate limiter | Not touched |
| S6 | `DateTimeField.vue` | Not touched by 1.3 (493 lines at both tags) |
| S7 | `freeSlug` | Not changed; create now also inserts pools in the same transaction (good) |
| S8 | `displayName ?? name` ×5 | **Regressed:** now six copies (D5) |
| S9 | Borrowed `mvp.create.saving` | **Regressed slightly:** still used at `neu.vue:41`, plus two more saving keys (D8) |
| Checked and fine | file sizes, layering, concurrency, trust boundaries, small composables | **Still true:** no file past 1k, new domain modules are pure with injected `now`/`phase`/`floors`, settings PATCH takes the Event row `FOR UPDATE` and `vote.put.ts` `FOR SHARE`, every new handler parses `unknown` through a domain parser |

Net: the five structural moves of the previous review (T1–T5) were all done, and 1.3 mostly used the new structure (typed answers, `CODE_COPY`, `characterCount`). The recurring failure is the same as before: a new feature repeats a pattern the codebase had just learned to collapse (A1, B3, D5).

---

### Part 4: seams in 1.3 that will hurt 1.4 (spec #153, ADR 0012/0013)

| # | Seam | What 1.4 needs | Today | Finding |
|---|---|---|---|---|
| 1 | **Publish after commit** | "Every mutating Event endpoint publishes after its commit"; no-op without a Worker URL; in-memory recorder in tests, like the image store | 7 hand-rolled transaction shapes; no hook point | A1. Add the notifier to `H3EventContext` in the style of `image-store.ts:10-14` |
| 2 | **Event read shape** | + zone/team/word per Member, teams, started/ended, Running Session, Team choice, start-rule result for the Host; refetched by every client on `event.changed` | One 111-line function, six sequential independent reads, `members` mapped inline (`:84-89`), 15 top-level fields | A2. Section builders + `Promise.all`; decide on splitting pools out |
| 3 | **Settings floors and team count lowering** | Floor = fullest team (a locked read in the same transaction), Players of removed teams to the Bench, activity entry "Game count or Team size changed" | `SETTINGS_FLOORS` constant in two handlers; the PATCH handler does not compute a diff | A4 |
| 4 | **Pool data and the secrecy test** | No room message and no activity entry may carry a pool game; the 1.3 test is extended to a full lobby flow | The predicate is in 3 encodings; `EventPools` keyed unlike `Pool` | A3, B5. The test `hidden-wheel.test.ts` reads the raw response; extend it with the room recorder once A1 exists |
| 5 | **One client owner of the Event read** | The socket calls `refresh` on `event.changed`, polling only while it is down, one refetch on every reconnect | `useFetch<EventView>(() => '/api/e/' + slug)` is written twice (`EventPage.vue:20`, `einstellungen.vue:26`) under an auto key; `usePollRefresh` is attached only in `EventPage.vue:134`. A good seam: one call site. | Extract `useEventView(slug)` (fetch + `usePollRefresh`) so 1.4 attaches the live connection once. **Unverified, check on staging:** after the PATCH, `einstellungen.vue:59` navigates to the Event page that shares the key; I did not verify that the Event page refetches rather than reusing the editor's data until the 15 s poll |
| 6 | **EventPage grows** | Game board, connection banner, start/end dialogs, Activity feed, dock "Mehr" | `EventPage.vue` holds the open/busy/id state of 6 dialogs (`:36-117`) and builds the dock (`:121-131`) | Opportunity O3: move the Host dialogs into `HostDialogs.vue` (takes `view`, `send`, emits nothing) before 1.4 adds three more. ≈ -80 lines from the page |
| 7 | **Crypto helpers** | HS256 room token + HMAC signed internal call, two secrets with rotation | `hex`/`hmac`/`sha256Hex` private in `r2-store.ts:33-46` | D7: `server/utils/crypto.ts` |
| 8 | **Phase predicates** | Teams lock at the first start; Reopen that closes Team choice leaves Players in teams; started Sessions refused (`session_started`) | `sessionsEditable` and `settingsEditable` identical; the rejection functions in `server/domain/phase.ts` take `hasDate` but no `started` | D3. When adding `started` to `SessionDate`, `changeSessions` already passes the rows to the rule (`sessions.ts:36`), which is a good seam |
| 9 | **Members and the Bench** | `event_members.zone/team/team_word`, joined activity entry on invite join and create | `server/api/e/index.post.ts:56` and `server/api/invite/[invite].post.ts:25` each insert a member | One `addMember(tx, eventId, userId)` util now; 1.4 adds zone/activity in one place. The invite handler's comment already says "the Bench" |
| 10 | **Stepper "no Session can start without settings"** | Start rule `not_set_up` links to the editor | `settingsPath` exists (`shared/links.ts`) and `canStartSession` is already exported | OK as is |

What is **not** a problem for 1.4: `checkSettingsChange` takes `floors` as input, so the new floor needs no change to the rule module (the best seam in 1.3); `eventPools(visible)` selects no game when hidden; `changeSessions` re-reads `after` from the database, so a `started_at` column fits.

---

### Suggested order

1. **A3** (smallest, secrecy), **A1** then **A4** (they touch the same handlers), **A2** (shape and speed of the read). All before the first 1.4 ticket.
2. **B3**, **D5**, **D2**, **D4** (mechanical, any time).
3. **B2** then **B1** (the draft first, so the wizard is built on the clean draft).
4. **B4** with the decision on client-side filtering; **C1** and **C2** together with the Claude Design hand-off check for `locked`/`error` tones.
5. **B5**, **D1**, **D6**, **D7** opportunistically.

### Not checked

- Visual and accessibility behaviour of any markup; whether `locked` and `error` tones are in the design.
- Query plans or payload sizes (the read's cost is an estimate from round-trip count and ADR 0013's hop time).
- The migration SQL beyond its shape, `drizzle/meta`, the wizard script `scripts/wizards/r2-setup.sh`, CI.
- Test code quality beyond size and placement (1.3 added 6,329 test lines for 4,857 source lines; no test file is over 566 lines).
