# 06 Copy

All German UI copy lives in **`i18n/locales/de.json`** at the repo root (moved there for `@nuxtjs/i18n`) (vue-i18n format, `{name}` placeholders, `|` for plural forms). Version 1 ships German only; every string goes through `t()` from day one so English (Post-1.0) is a translation, not a refactor.

Tone: friendly, clear, a little cheeky. Short sentences. Du-form. No „·“ separators. German quotes „…“. Typographic apostrophe ’.

## Groups

- `app`
- `common`
- `nav`
- `phase`
- `dock`
- `board`
- `team`
- `people`
- `profile`
- `setup`
- `wheel`
- `veto`
- `coin`
- `pickBan`
- `result`
- `table`
- `history`
- `tiebreaker`
- `chat`
- `activity`
- `emote`
- `poll`
- `push`
- `archive`
- `admin`
- `connection`
- `boot`
- `auth`
- `onboarding`
- `home`
- `invite`
- `pushAsk`
- `pwa`
- `sound`
- `errorPage`
- `library`
- `gameEdit`
- `share`
- `replay`
- `archiveList`
- `settings`
- `connectionG`
- `post10`
- `mvp`
- `error`
- `empty`

## What is where (Phase 5 checklist)

| Required | Key(s) |
|---|---|
| Explanation copy for the info side sheet (brief §17) | `setup.info.*` (ffa, teams, admin, wheel incl. `hideWheel`, pickBan, loserPick, loserAdv, tiebreaker; section titles in `setup.info.sections`) |
| Placeholder names for the hidden wheel (brief §18) | `wheel.placeholders` (array of 20) + `wheel.placeholderQ` („???“) |
| Error messages | `error.*` (validation, permissions, network, realtime) + `errorPage.*` (full pages) + `connection.*` |
| Empty states | `empty.*` |
| Push notification texts | `push.*` (dateSet, dateMoved, reminder, started, drawn, result, winner + soft ask) |
| Activity feed | `activity.*` |
| MVP construction + MVP screens | `mvp.*` (home, create, poll, zone, site per area, ics) |
| Battle replay references | `replay.refs` |
| Post-1.0 copy (crews, bracket, league, report) | `post10.*` (keep out of the 1.0 bundle) |

## Rules for developers
- The app is „Compies“ in every text (tab titles, PWA name, .ics title, legal texts). Only the wordmark is all caps, and the wordmark gets its capitals from CSS, not from the string.
- Compibert appears on screen but is never named in any copy.
- The calendar is about the Date, not the file: no „.ics“, „Datei“ or „Download“ in UI copy. The button is „In den Kalender“. Only the Datenschutzerklärung describes the file.
- The vote options are Ja, Meh and Nein, as text (Meh has no icon on the card; the matrix cell keeps its minus). „Wenn nötig“ is retired everywhere. The legend above the Slot cards says what each promises: Ja „Ich kann da!“ · Meh „Krieg ich hin.“ · Nein „Wird nichts bei mir.“. The domain value stays `maybe`.
- Never concatenate sentences from fragments; use one key with placeholders.
- Team names, game names and user names are data, never translated.
- Dates: `Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })` → „Sa 25.10.“; time „20:30“; long form „Samstag, 25. Oktober, 20:30 Uhr“. Time zone Europe/Berlin.
- Numbers in live UI go through `CpNum`; the screen-reader text is its own key (e.g. `veto.timerSay`).
- Hidden-wheel placeholders: shuffle per spin, never repeat on one wheel; more slices than names → „???“ for the rest.
