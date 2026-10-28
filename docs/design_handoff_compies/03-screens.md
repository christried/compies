# 03 Screens

Every screen exists in the design files at desktop 1280 and mobile 390, light and dark, with all states switchable (`?s=…&st=…&vp=…&theme=…`) and German build notes next to the frame.

**Breakpoints** (Tailwind): mobile < 600 · `sm` tablet 600–979 (mobile shell, 2-col grids) · `md` desktop 980–1439 (desktop shell: side panel + floating host dock) · `xl` ≥ 1440 (shell stops growing, centred). Reference layout 1280. Inside stage and panel, use container queries.

**Shells:** hub (Home, Archiv, Bibliothek, Profil, Admin) = header + HubNav, mobile bottom tabs. Event = header with title + PhasePill + Einladen, stage, side panel (desktop), mobile tabs Spielbrett / Tabelle / Chat / Aktivität / Leute, host dock or crown button. Bare = header only (errors, sign-in).

## MVP screens (build first)

### M1 Start (Home, MVP)
**Scope:** [MVP] · **Ref:** `App MVP Terminfindung ?s=home`

- **Layout:** Hub shell. Desktop: header 64 + HubNav (Events active, Archiv/Bibliothek/Profil with tape marker), content max 1040, title row (kicker „Hallo {name}“, h1 44 px, host CTA right), section „Deine Events“ as 2-col card grid (gap 14), BaustelleZone below. Mobile (<600): h1 32, 1-col cards, bottom tab bar with the same 4 items (markers top-right). Tablet 600–979: 2-col cards, tab bar.
- **Components:** AppShell, AppHeader, HubNav, NavSoonMarker, AppButton, PhasePill, Event card (local), EmptyState, BaustelleZone, Compibert (bust, sleep)
- **Data:** Events the user is a member of: name, host name, phase, best slot so far (or confirmed date), votedCount/total, my vote status.
- **Host vs player:** Host (canHost): „Neue Terminumfrage“ (primary) in the title row. Without the right: no button, no notice. Nav: Bibliothek only with the Host permission or as Platform admin; Admin only as Platform admin. Card CTA: „Öffnen“ (host) / „Abstimmen“ (not voted, primary) / „Ansehen“ (voted or date set).
- **States:** Host mit Umfragen · Eingeladen, noch nicht abgestimmt · Noch keine Einladung (empty) · loading (SkeletonCard ×2) · error (FullScreenState generic)
- **Realtime:** MVP: refetch on focus. 1.0: none needed on Home (push covers changes).


### M2 Umfrage anlegen (MVP)
**Scope:** [MVP] · **Ref:** `App MVP Terminfindung ?s=create`

- **Layout:** Hub shell without tab bar on mobile. Single column max 680: back link, kicker + h1, name field, SegmentedControl (Terminumfrage / Direkt festlegen, max 420), slot list (date flex 1 + time 108 + remove 44), dashed „Termin vorschlagen“, help text, BaustelleZone (compact, no sign), footer CTA. Done state: success card (Compibert bust wave, link field + copy, „Zur Umfrage“).
- **Components:** TextField, SegmentedControl, DateTimeField, IconButton, AppButton, BaustelleZone, InviteLinkCard, ToastStack, Compibert
- **Data:** POST event {name, sessions, slots[] | startsAt[]}. Response: slug, inviteUrl.
- **Host vs player:** Host only (route guard → ConstructionPage „generic“ or 403 otherwise).
- **States:** Formular · Termin in der Vergangenheit (inline error, CTA aria-disabled + reason) · Angelegt + Link · Direkt festlegen (single DateTimeField, CTA „Event anlegen“) · saving
- **Realtime:** —


### M3 Terminumfrage (MVP)
**Scope:** [MVP] · **Ref:** `App MVP Terminfindung ?s=poll`

- **Layout:** Event shell, **no side panel** in the MVP. Desktop: kicker („Terminumfrage läuft, 7 von 9 haben abgestimmt“) + h1, no refresh hint; slot cards 4-col (gap 12); „Wer kann wann?“ matrix; BaustelleZone. Host dock floating bottom-centre: „Termin festlegen“ (primary) + „Einladen“. Mobile: slot cards 1-col, matrix scrolls horizontally only when the Slots don't fit (130 + 4×72), crown button bottom-right opens the host sheet. Date set: DateSetCard replaces cards + matrix.
- **Components:** AppShell (event), PhasePill, PollSlotCard, PollMatrix, UserAvatar, HostDock / host sheet, DateConfirmDialog, DateSetCard, InviteLinkCard, BaustelleZone, ToastStack
- **Data:** Event (name, phase, host), slots[], votes[] (all members, visible to everyone), members (name, avatar), best slot (computed server-side: most yes → most maybe → earliest), confirmed startsAt, icsSequence.
- **Host vs player:** Player: votes. Host: votes too + „Termin festlegen“ on each card (desktop, sets that Slot), dock/sheet „Termin festlegen“ (preselects best slot), „Verschieben“ after confirm, „Einladen“.
- **States:** Abstimmen · Abgestimmt (saved notice) · Host-Ansicht · Host: festlegen (dialog) · Termin steht · Termin steht (Host) · vote failed (rollback + toast „Deine Stimme ist nicht angekommen“) · reschedule dialog (from 08)
- **Realtime:** MVP: polling (15 s, visible tab) + refetch after own mutations. 1.0 events: `poll.voted`, `poll.slotAdded`, `poll.slotRemoved`, `poll.confirmed`, `poll.rescheduled`, `member.joined`.


### M4 Baustelle (construction page)
**Scope:** [MVP] · **Ref:** `App MVP Terminfindung ?s=site`

- **Layout:** Hub shell (Archiv, Bibliothek, Profil, Admin) or Event shell (Spielbrett and any Event sub-route). ConstructionPage fills the stage: desktop row (Compibert 250 + text column max 520, title 56); mobile column centred (Compibert 170, title 36). Tape top, fence/barrier/sign/cone bottom.
- **Components:** ConstructionPage (BaustelleZone hero), Compibert (full, still, hard hat), AppButton
- **Data:** Area key from the route; link to the user's most relevant poll (latest open) or Home.
- **Host vs player:** Bibliothek only for Users with the Host permission and the Platform admin; for everyone else the address shows the generic state (no hint that the Game library exists). Admin only for the Platform admin; for everyone else the generic state. Otherwise same for everyone.
- **States:** Archiv · Bibliothek · Profil (+ „Abmelden“) · Spielbrett (Event) · Admin · generic
- **Realtime:** —


## 1.0 screens

### 01 Splash
**Scope:** [1.0] · **Ref:** `App Einstieg ?s=splash`

- **Layout:** Full screen, centred logo + Compibert run-in.
- **Components:** BootSplash, Compibert
- **Data:** —
- **Host vs player:** —
- **States:** Boot-Animation · Laden · Reduzierte Bewegung
- **Realtime:** —


### 02 Anmelden
**Scope:** [MVP] · **Ref:** `App Einstieg ?s=login`

- **Layout:** Centred card max 440; desktop with Compibert left. Discord primary, Twitch secondary.
- **Components:** AppButton, Compibert, FullScreenState
- **Data:** Invite context (Event name, host) when coming from a link.
- **Host vs player:** —
- **States:** Standard · Über Einladung · Weiterleitung · Abgebrochen
- **Realtime:** —


### 03 Profil einrichten
**Scope:** [MVP] name · [1.0] upload · **Ref:** `App Einstieg ?s=setup`

- **Layout:** Single column max 480.
- **Components:** ProfileForm, TextField, UserAvatar
- **Data:** Provider name + image.
- **Host vs player:** —
- **States:** Discord-Bild · Bild lädt hoch · Name fehlt
- **Realtime:** —


### 04 Home
**Scope:** [1.0] · **Ref:** `App Einstieg ?s=home`

- **Layout:** As M1, plus „Läuft gerade“ hero card on top (primary), upcoming, archive teaser, PWA hint.
- **Components:** as M1 + PwaInstallHint
- **Data:** Events by phase.
- **Host vs player:** Create button needs host right; otherwise a notice.
- **States:** Mit Events · Leer · Lädt · Fehler
- **Realtime:** `session.started` for a Session of an Event you are in → „Läuft gerade“ card (optional; push covers it).


### 05 Event erstellen
**Scope:** [1.0] (MVP: M2) · **Ref:** `App Vorbereitung ?s=create`

- **Layout:** Desktop: step list 230 | form | InfoSheet 340. Mobile: 8-segment progress, form, sticky footer, info as bottom sheet.
- **Components:** EventStepper, RadioCardGroup, LockedOption, NumberStepper, PointsTableEditor, GamePoolPicker, InfoSheet, DateTimeField
- **Data:** Event config; library (suggestions by format + player count).
- **Host vs player:** Host only.
- **States:** 1 Name · 2 Format: Teams · 2 Format: Jeder gegen jeden · 3 Spiele · 4 Punkte · 4 Eigene Tabelle (Fehler) · 5 Lucky Wheel · 5 Pick & Ban + Info · 5 Loser-Modi noch gesperrt · 6 Spielepool · 7 Tiebreaker · 8 Termin · Fertig
- **Realtime:** —


### 06 Einladen
**Scope:** [MVP] · **Ref:** `App Einstieg ?s=invite`

- **Layout:** Sheet (desktop side, mobile bottom).
- **Components:** InviteLinkCard, HoldToConfirmButton
- **Data:** inviteUrl.
- **Host vs player:** Host only.
- **States:** Link · Kopiert · Erneuern bestätigen · Erneuert
- **Realtime:** `invite.rotated` (host devices only).


### 07 Link öffnen
**Scope:** [MVP] · **Ref:** `App Einstieg ?s=open`

- **Layout:** Centred card / FullScreenState.
- **Components:** FullScreenState, AppButton
- **Data:** Event preview (name, host) for valid links only.
- **Host vs player:** —
- **States:** Abgemeldet · Ungültig / erneuert · Event gelöscht · Angemeldet: Bench
- **Realtime:** —


### 08 Terminumfrage
**Scope:** [1.0] (MVP: M3) · **Ref:** `App Vorbereitung ?s=poll`

- **Layout:** As M3 plus side panel (Chat default) on desktop and the mobile tab bar (Spielbrett, Tabelle, Chat, Aktivität, Leute).
- **Components:** as M3 + SidePanel, ChatPanel, PushAsk
- **Data:** as M3.
- **Host vs player:** as M3.
- **States:** Abstimmen · Abgestimmt · Host-Ansicht · Host: festlegen · Termin steht + .ics · Host: verschieben
- **Realtime:** `poll.voted` (everyone sees who voted what, immediately) · `poll.confirmed` · `poll.rescheduled` · `chat.message` · `presence.*`


### 09 Spielbrett
**Scope:** [1.0] · **Ref:** `App Lobby ?s=board`

- **Layout:** Desktop: stage with GameBoard (TeamZones in a container-query grid, Bench and Tribüne rows), EmoteBar bottom-left, HostDock bottom-centre, SidePanel. Mobile: teams stacked, bench/stands rows, emote button bottom-left, crown bottom-right, tab bar.
- **Components:** GameBoard, TeamZone, BenchZone, StandsZone, UserAvatar, TeamChip, TeamNameBuilder, MoveToMenu, EmoteBar, FloatingEmote, NoticeBanner, HostDock, SidePanel
- **Data:** Members with zone/party/slot, online state, team words, team colours, phase, teamSize.
- **Host vs player:** Players move only themselves; host moves everyone, sees the uneven-teams notice and „Von der Bench nachziehen“. Host can sit anywhere (Tribüne, Bench, Team).
- **States:** Terminumfrage: Teams gesperrt · Teamwahl offen + Teamwort · Ziehen · Platz verloren · Teams ungleich · Verschieben nach … (Tastatur) · Läuft: Teams gesperrt · Emote · Chat als Sheet (mobil) · Host auf der Tribüne / Bench / im Team
- **Realtime:** **„player moved“** `member.moved {userId, from, to, by}` → Flip avatar to new slot · `member.moveRejected {userId, winnerId}` (to the loser) → bounce-back + toast · `team.wordSet` · `team.nameFrozen` at start · `team.nameReset` · `presence.join/leave` (online dot) · `emote.sent {userId, emote}` → FloatingEmote over that avatar · `session.started` → lock teams.


### 10 Host-Steuerung
**Scope:** [1.0] · **Ref:** `App Lobby ?s=host`

- **Layout:** HostDock + „Mehr“ sheet; mobile crown → bottom sheet.
- **Components:** HostDock, Sheet, HoldToConfirmButton, NextGamePicker, GamePoolPicker, NumberStepper
- **Data:** Phase-dependent actions.
- **Host vs player:** Host only.
- **States:** Dock · Mehr-Menü · Session starten · Leute verschieben · Rad & Pools bearbeiten · Nächstes Spiel setzen · Anzahl Spiele ändern · Teamname zurücksetzen · Chat-Nachricht löschen · Session beenden · Event löschen
- **Realtime:** Sends intents; receives `event.configChanged`, `wheel.entriesChanged`, `round.determined`.


### 11 Lucky Wheel
**Scope:** [1.0] · **Ref:** `App Spielrunde ?s=wheel`

- **Layout:** Desktop: wheel centred in the stage (420), Compibert full body beside it (rises in), result card under the wheel, clip overlay above, veto bar at the bottom. Mobile: wheel full width (≤ 340), clip on top, action bar above tabs.
- **Components:** LuckyWheel, Compibert, ClipPlayer, VetoWindow, HoldToConfirmButton, NoticeBanner (pool warning, host only), ActivityFeed
- **Data:** Wheel entries (real or placeholders), spin config, vetos per party, clip info.
- **Host vs player:** Host spins, edits wheel, can put a drawn game back, skips clip for all, sees pool warning. Players: veto (hold), mute/close clip for themselves.
- **States:** Rad sichtbar · Rad verdeckt · Dreht · Stopp · Verwandlung · Clip + Veto-Fenster · Eigenes Veto versiegelt · Clip zu, 30 s übrig · Aufdecken: 2 Vetos · Neu drehen · Kein Veto: wird gespielt
- **Realtime:** **„wheel spun, with stop timestamp“** `wheel.spin {startAt, durationMs, resultIndex, offset}` (stopAt = startAt + durationMs) → all clients animate to the same angle · hidden: `wheel.revealed {index, gameId, label}` at stopAt (real names never sent before) · `round.determined {gameId, determinedAt, vetoEndsAt, clip}` · `clip.started {startAt}` · `clip.skipped` · **„veto cast (own team only)“** `veto.cast {partyId, by}` delivered only to that party's members · **„vetoes revealed“** `veto.revealed {vetoes[], outcome: respin | play}` at vetoEndsAt for everyone · `wheel.entriesChanged` (slice leaves, redistribute).


### 12 Loser's Advantage
**Scope:** [1.0] after T12 · **Ref:** `App Spielrunde ?s=advantage`

- **Layout:** Wheel + LoserBanPanel.
- **Components:** LuckyWheel, LoserBanPanel, HoldToConfirmButton
- **Data:** Last-placed parties, wheel entries.
- **Host vs player:** Last-placed party bans (any member, hold); host spins.
- **States:** Letzter bannt (dran) · Alle anderen warten · Zwei Letzte bannen · Gebannt: Host dreht
- **Realtime:** `loser.banTurn {partyId}` · `loser.banned {partyId, gameId, by}` → slice removal for all · then as 11.


### 13 Pick & Ban
**Scope:** [1.0] · **Ref:** `App Spielrunde ?s=pickban`

- **Layout:** Coin first (centre), then PickBanBoard.
- **Components:** CoinFlip, PickBanBoard, GameCard, HoldToConfirmButton
- **Data:** Snake order, pool, play order.
- **Host vs player:** Host flips the coin and keeps things moving; parties ban/pick (first member to confirm wins).
- **States:** Münzwurf · Münze gefallen · Ban: wir sind dran · Ban: die anderen · Pick: wir sind dran · Pick: die anderen · Spielreihenfolge
- **Realtime:** `coin.flip {startAt, durationMs, result}` · `pickban.turn {index, partyId, action}` · `pickban.banned` / `pickban.picked {partyId, gameId, by}` · `pickban.done {playOrder}`.


### 14 Loser's Pick
**Scope:** [1.0] after T12 · **Ref:** `App Spielrunde ?s=loser`

- **Layout:** Pool grid + picker banner; veto as 11.
- **Components:** LoserPickPanel, GameCard, VetoWindow
- **Data:** Last place, pool.
- **Host vs player:** Last-placed party picks; others veto.
- **States:** Letzter wählt (dran) · Alle anderen warten · Veto-Fenster · Nach Veto: nochmal wählen · Letzter Platz geteilt: Rad
- **Realtime:** `loserpick.turn` · `round.determined` · veto events as 11.


### 15 Admin-Wahl
**Scope:** [1.0] · **Ref:** `App Spielrunde ?s=admin`

- **Layout:** NextGamePicker sheet for the host; waiting card for players.
- **Components:** NextGamePicker
- **Data:** Pool / library.
- **Host vs player:** Host picks; players wait.
- **States:** Host wählt · Spieler:innen warten · Gesetzt: Clip
- **Realtime:** `round.determined {via: admin}` → clip.


### 16 Ergebnis eintragen
**Scope:** [1.0] · **Ref:** `App Spielrunde ?s=result`

- **Layout:** Desktop sheet/stage list; mobile full screen list.
- **Components:** ResultEntry, CpNum
- **Data:** Parties, points table.
- **Host vs player:** Host only; players see „Host trägt das Ergebnis ein …“.
- **States:** Host: Teams sortieren · Host: Jeder gegen jeden · Spieler:innen warten · Vergangenes Spiel korrigieren
- **Realtime:** `result.saved {round, placements, scores, standings}` · `result.corrected`.


### 17 Live-Tabelle
**Scope:** [1.0] · **Ref:** `App Spielrunde ?s=board`

- **Layout:** Stage after each game; side panel tab „Tabelle“.
- **Components:** Leaderboard, Confetti, Compibert
- **Data:** Standings.
- **Host vs player:** Same.
- **States:** Nach dem Spiel: Mini-Feier · Ruhige Ansicht
- **Realtime:** on `result.saved` → reorder animation + winner celebration.


### 18 Tiebreaker
**Scope:** [1.0] · **Ref:** `App Spielrunde ?s=tie`

- **Layout:** Announcement then own wheel (tiebreaker pool).
- **Components:** TiebreakerBanner, LuckyWheel, VetoWindow
- **Data:** Tied parties, remaining vetos.
- **Host vs player:** Host spins; only tied parties play/veto.
- **States:** Ankündigung · Tiebreaker-Rad · Veto mit Restvetos · Wieder gleich: nochmal
- **Realtime:** `tiebreaker.started {tied[]}` · wheel + veto events as 11.


### 19 Siegerehrung + Teilen
**Scope:** [1.0] · **Ref:** `App Ende & Archiv ?s=ceremony`

- **Layout:** Full stage scene, then share card.
- **Components:** AwardCeremony, ShareDialog, ShareImage, Confetti, Compibert
- **Data:** Final standings, members of the winner.
- **Host vs player:** Host starts the ceremony; everyone sees it at the same time.
- **States:** Pokal-Lauf · Teilen: Querformat · Teilen: Quadrat · Link kopiert
- **Realtime:** `ceremony.started {startAt, gag}` (server picks the gag so all devices show the same one).


### 20 Battle-Replay
**Scope:** [1.0 – last ticket] · **Ref:** `App Ende & Archiv ?s=replay`

- **Layout:** Lanes full width, controls below.
- **Components:** BattleReplay
- **Data:** Parties, per-game points.
- **Host vs player:** Same.
- **States:** Abspielen
- **Realtime:** — (local playback)


### 21 Archiv
**Scope:** [1.0] · **Ref:** `App Ende & Archiv ?s=list`

- **Layout:** Filters (Alle, Gewonnen, Als Host) + search + card grid.
- **Components:** ArchiveList, ArchiveCard, SkeletonCard, EmptyState
- **Data:** Events where the user played ≥ 1 game (or admin).
- **Host vs player:** —
- **States:** Liste · Leer · Suche ohne Treffer · Lädt
- **Realtime:** —


### 22 Archiv-Detail
**Scope:** [1.0] · **Ref:** `App Ende & Archiv ?s=detail`

- **Layout:** Tabs: Endstand + Bild, Alle Spiele, Chat & Aktivität.
- **Components:** ArchiveDetail, ShareImage, GameHistory, ChatPanel (read-only), ActivityFeed
- **Data:** Everything stored for the Event.
- **Host vs player:** Read-only for all.
- **States:** Endstand + Bild · Alle Spiele · Chat & Aktivität
- **Realtime:** —


### 23 Bibliothek
**Scope:** [1.0] · **Ref:** `App Bibliothek & Profil ?s=lib`

- **Layout:** Search + filters + grid.
- **Components:** GameLibrary, GameCard, SkeletonCard
- **Data:** Global games.
- **Host vs player:** Only Users with the Host permission and the Platform admin see the library (nav item and route). Hosts create; edit for creator + admin.
- **States:** Liste + Filter · Detail · Keine Treffer · Lädt
- **Realtime:** —


### 24 Spiel anlegen
**Scope:** [1.0] · **Ref:** `App Bibliothek & Profil ?s=edit`

- **Layout:** Form + live YouTube preview.
- **Components:** GameForm, TextField, ClipPlayer (preview)
- **Data:** Game fields; duplicate candidates.
- **Host vs player:** Hosts.
- **States:** Neu, mit Vorschau · Duplikat-Hinweis · YouTube-Link kaputt · Bearbeiten
- **Realtime:** —


### 25 Profil & Einstellungen
**Scope:** [1.0] · **Ref:** `App Bibliothek & Profil ?s=profile`

- **Layout:** Single column.
- **Components:** ProfileForm, ToggleSwitch, SegmentedControl (Hell/Dunkel/System)
- **Data:** User, linked accounts, settings.
- **Host vs player:** —
- **States:** Profil · Bild lädt hoch · Letztes Konto · Einstellungen
- **Realtime:** —


### 26 Plattform-Admin
**Scope:** [1.0] · **Ref:** `App Bibliothek & Profil ?s=admin`

- **Layout:** Table + search.
- **Components:** AdminUserTable
- **Data:** Users, host flags.
- **Host vs player:** Platform admin only.
- **States:** Nutzer · Suche · Host-Recht entziehen · Bibliothek verwalten
- **Realtime:** —


### 27 Verbindung
**Scope:** [1.0] · **Ref:** `App Systemzustände ?s=conn`

- **Layout:** Banner under header.
- **Components:** ConnectionBanner, Compibert
- **Data:** Socket state.
- **Host vs player:** —
- **States:** Wird wiederhergestellt · Verloren · Wieder da
- **Realtime:** socket lifecycle; on reconnect request `state.snapshot` and re-pose every running timeline from server time.


### 28 Push-Erlaubnis
**Scope:** [1.0] · **Ref:** `App Systemzustände ?s=push`

- **Layout:** Soft ask card / sheet.
- **Components:** PushAsk
- **Data:** Permission state.
- **Host vs player:** —
- **States:** Eigene Frage · Browser-Dialog · Erlaubt · Abgelehnt
- **Realtime:** —


### 29 PWA installieren
**Scope:** [1.0] · **Ref:** `App Systemzustände ?s=pwa`

- **Layout:** Home banner; iOS sheet.
- **Components:** PwaInstallHint
- **Data:** —
- **Host vs player:** —
- **States:** Hinweis · iOS-Anleitung · Installiert
- **Realtime:** —


### 30 Ton aktivieren
**Scope:** [1.0] · **Ref:** `App Systemzustände ?s=sound`

- **Layout:** Over the clip.
- **Components:** SoundUnlockPrompt, ClipPlayer
- **Data:** —
- **Host vs player:** —
- **States:** Autoplay blockiert · Ton an
- **Realtime:** —


### 31 Fehlerseiten
**Scope:** [MVP] · **Ref:** `App Systemzustände ?s=error`

- **Layout:** Bare shell, centred.
- **Components:** FullScreenState, Compibert (confused)
- **Data:** Error id.
- **Host vs player:** —
- **States:** 404 · Keine Berechtigung · Allgemeiner Fehler
- **Realtime:** —


## Post-1.0 screens (mockups only)

| # | Screen | Ref | States |
|---|---|---|---|
| 32 | Crews | `App Post-1.0 ?s=crews` | Übersicht + Crew-Archiv · Crew gründen · Ohne Gründungsrecht · Mitglieder + Host-Rechte · Crew-Einladung |
| 33 | Turnierbaum | `?s=bracket` | Viertelfinale |
| 34 | Liga | `?s=league` | Tabelle + Spieltag |
| 35 | Ergebnis selbst melden | `?s=report` | Spieler:in meldet · Host bestätigt · Widerspruch |
| 36 | Sprache | `?s=lang` | Deutsch · English |

## Realtime event catalogue (1.0)

One PartyServer room per Event (`event:<id>`). The server is the only clock and the only source of truth. Every server message carries `serverTime` (ms). Clients send **intents**; the server validates and broadcasts **events**. On (re)connect the client receives `state.snapshot` and re-poses everything from it (never replays history).

### Visibility rules
- **Everyone in the room** unless noted.
- `veto.cast` → **only members of the vetoing party**. Nobody else (incl. the host, unless the host is in that party) learns about it before `veto.revealed`.
- Hidden wheel: players receive placeholder labels only; the real label for the drawn slice comes with `wheel.revealed` at `stopAt`. The host receives real labels.
- Pool warning → **host only** (`host.poolWarning`).
- `invite.rotated` → host devices only.

### Events (server → clients)

| Event | Payload | Triggers |
|---|---|---|
| `clock.pong` | `{t0, serverTime}` | clock sync (see 04-motion) |
| `state.snapshot` | full room state incl. running timers | join / reconnect |
| `presence.sync` / `presence.join` / `presence.leave` | `{userIds}` / `{userId}` | online dots, „Kitty ist dem Event beigetreten“ |
| `member.joined` | `{userId, zone: "bench"}` | avatar pops onto the bench |
| `member.moved` | `{userId, from, to: {zone, partyId?, slot?}, by}` | **player moved** → Flip avatar |
| `member.moveRejected` | `{userId, target, winnerId}` (to the loser) | bounce-back + „X war schneller“ |
| `team.wordSet` / `team.nameFrozen` / `team.nameReset` | `{partyId, userId?, word?}` | team name |
| `poll.voted` | `{slotId, userId, value}` | bars + matrix cell |
| `poll.slotAdded` / `poll.slotRemoved` | `{slot}` / `{slotId}` | cards |
| `poll.confirmed` / `poll.rescheduled` | `{startsAt, icsSequence}` | DateSetCard, team selection opens |
| `session.started` / `event.configChanged` / `event.finished` / `event.deleted` | | locks, game count, ceremony, redirect |
| `round.determined` | `{round, gameId, via, determinedAt, vetoEndsAt, clip: {videoId, start, length, startAt}}` | result card, clip, veto window |
| `wheel.spin` | `{wheelId, startAt, durationMs, resultIndex, offset, entriesVersion}` | **wheel spun, with stop timestamp** |
| `wheel.revealed` | `{index, gameId, label}` at stopAt | hidden-wheel transform |
| `wheel.entriesChanged` | `{entries, version}` | slice leaves / put back / edited |
| `clip.started` / `clip.skipped` | `{startAt}` / `{by}` | clip sync / close |
| `veto.cast` | `{partyId, by}` | **veto cast (own party only)**: seal, lock button |
| `veto.revealed` | `{vetoes: {partyId, by}[], outcome: "respin" \| "play"}` at vetoEndsAt | **vetoes revealed** |
| `coin.flip` | `{startAt, durationMs, result: "head" \| "tail", starter}` | coin |
| `pickban.turn` / `pickban.banned` / `pickban.picked` / `pickban.done` | | Pick & Ban |
| `loser.banTurn` / `loser.banned` / `loserpick.turn` | | Loser modes |
| `result.saved` / `result.corrected` | `{round, placements, scores?, standings}` | leaderboard |
| `tiebreaker.started` | `{tied}` | tiebreaker |
| `ceremony.started` | `{startAt, gag}` | award ceremony |
| `chat.message` / `chat.deleted` | `{id, userId, text, at}` / `{id}` | chat |
| `activity.event` | `{type, params, at}` | feed (i18n key `activity.<type>`) |
| `emote.sent` | `{userId, emote, at}` | floating emote |
| `host.poolWarning` | `{missing}` | host notice |

### Intents (client → server)
`ping`, `move`, `setTeamWord`, `vote`, `confirmDate`, `reschedule`, `startSession`, `spin`, `editWheel`, `putBack`, `setNextGame`, `skipClip`, `castVeto`, `flipCoin`, `ban`, `pick`, `saveResult`, `correctResult`, `startCeremony`, `chat`, `deleteChat`, `emote` (server enforces 2 s cooldown + room sound limit flag).

### MVP (no realtime)
HTTP only: `GET /api/e/:slug` (Event + Sessions + slots + votes + members), `PUT /api/e/:slug/slots/:slotId/vote`, `POST /api/e/:slug/confirm` (a Slot's time to an undated Session), `POST /api/e/:slug/sessions` and `DELETE /api/e/:slug/sessions/:id` (add and remove a Session), `POST /api/e/:slug/sessions/:id/reschedule` and `/reopen`, `POST /api/e/:slug/rotate`, `GET /api/e/:slug/ics`. Poll every 15 s while `document.visibilityState === "visible"`.
