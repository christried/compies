# 11 Event-Seite (1.4)

Composition of the Event page now that it holds the Game board, the Activity feed and the start of a Session. Same format as `02-components.md`. Ref = `reference/App Event-Seite.dc.html` (artboard ids in brackets).

**New tokens: none.** Everything uses existing colour, type, radius, shadow, layer and motion tokens.

## Index
- [`EventPage`](#eventpage) new (composition only)
- [`EventPageHead`](#eventpagehead) new
- [`EventSessions`](#eventsessions-change) changed
- [`HowWePlayCard`](#howweplaycard-change) changed
- [`EventPoll`](#eventpoll-change) changed (`compact`)
- [`GameBoard`](#gameboard-change) changed (`setup` phase)
- [`HostDock`](#hostdock-change) changed (action sets per state)
- [`SidePanel`](#sidepanel-change) changed (single tab)
- [`TabBar`](#tabbar-change) changed (Event tabs, mobile)
- [`NoticeBanner`](#noticebanner-usage) usage only
- [`ConnectionBanner`](#connectionbanner-usage) usage only
- [Copy keys](#copy-keys)
- [Decisions](#decisions)

## EventPage
**Scope:** 1.4 · **Ref:** 1a–8d

Orders existing cards per state. Rule: what has to happen now goes on top.

- **Props / variants:** `event`, `sessions[]`, `role: host | member`, `me`, `connection` (from ConnectionBanner store)
- **States → order on the stage** (desktop and mobile identical; mobile stacks every 2-col row):
  - `poll` (no Session dated) [1a, 1b]: Head · EventPoll (full, matrix open) · GameBoard (phase `poll`) · [EventSessions | HowWePlayCard]
  - `teams` (≥ 1 Session dated, not started; another may still poll) [2a, 2b]: Head (+ jump link to the open poll) · NoticeBanner uneven (host-only) · GameBoard (phase `open`) · EventPoll `compact` · [EventSessions | HowWePlayCard]
  - `running` [3a, 3b]: Head („Session 1 von 2 läuft seit 20:34“) · NoticeBanner locked · GameBoard (phase `running`) · [EventSessions | HowWePlayCard]
  - `between` (a Session ended, next one dated) [4a, 4b]: Head · [EventSessions | HowWePlayCard] (EventSessions gets `shadow-card`) · NoticeBanner „Teams bleiben“ · GameBoard (phase `running`, locked for members)
  - `setup` (Event created before settings existed) [5a–5c]: Head · NoticeBanner „Event einrichten“ (host-only) or „Sanne richtet das Event noch ein“ (member) · GameBoard (phase `setup`) · [EventSessions | HowWePlayCard (empty)]
  - EventPoll is only rendered while a Session has no Date.
- **Layout:** AppShell `kind: session`, `panel: true`. Desktop ≥ 980: stage max 1100, padding 24 24 40, gap 22; SidePanel 340 right; PageFooter `dock` when host. Mobile: padding 16 14, bottom 92 (host, room for the crown) / 28 (member), gap 18; no PageFooter (signed in < 768).
- **Accessibility:** One `<h1>` per view (Head). Blocks are `role="region"` + `aria-labelledby` their `<h2>`. Jump links scroll the stage and move focus to the target `<h2>` (`tabindex="-1"`).
- **Motion:** when the state changes (e.g. date set), blocks reorder with GSAP Flip `dur-slow` `ease-out`; reduced: instant swap. Nothing loops.

## EventPageHead
**Scope:** new · **Ref:** all

- **Props:** `kicker`, `title`, `jump?: {label, target}`
- **Visual:** kicker 13 / 700 ink-2; h1 Lilita 44 (desktop) / 34 (mobile), line-height 1; jump = underlined text link 14 / 800 with calendar + arrow-down icons, 44 px tall.
- **States:** default · with jump (only when a second Session is polling)
- **Accessibility:** jump is an `<a href="#poll-session-2">`.

## EventSessions (change)
**Ref:** 1a–5c (card „Sessions“)

- **Row:** number disc 36 (Bungee 15, `primary` while running) · title 15 / 800 + sub 13 / 600 ink-2 (date as `<time datetime>`, „7 von 11 haben abgestimmt“, „Läuft seit 20:34“, „Sa 25.10., 20:34 bis 23:12“) · PhasePill (Kein Termin · Terminumfrage · Termin steht · Läuft · Beendet) · actions.
- **Actions per row:** dated → IconButton `.ics` (all) + „Verschieben“ (host). Polling → „Abstimmen“ (member) / „Zur Umfrage“ (host), both jump to the poll. Undated without poll → „Umfrage starten“ (host); in `setup` it is `aria-disabled` with the reason in the sub line. Running / ended → none.
- **Footer:** „+ Session hinzufügen“ text button (host).
- **Desktop / mobile:** rows wrap; actions drop under the title on 390.

## HowWePlayCard (change)
- `<dl>` rows Format · Spiele · Auswahl · Punkte. Host sees „Bearbeiten“ until the first Session starts; afterwards a lock + „Fest seit dem Start“.
- **Empty state** (`setup`): dashed `line-soft` box, host „Noch nicht festgelegt. Format, Spiele und Punkte legst du beim Einrichten fest.“, member „… Sanne legt gleich fest, wie gespielt wird.“

## EventPoll (change)
- New prop `compact: boolean` (true when another Session already has a Date). Compact: same Slot cards, „Wer kann wann?“ collapsed behind a 44 px pill button „Wer kann wann? · 5 von 11“ (`aria-expanded`). Title „Termin für Session n“ + meta „x von 11 haben abgestimmt“.
- Host desktop „Termin festlegen“ in the card is `primary` only on the best slot of the main poll; on a compact poll it stays `surface` (the dock owns the primary).

## GameBoard (change)
- New phase `setup`: no team grid, only Bench + Tribüne, inline note „Teams gibt es, sobald das Event eingerichtet ist. Bis dahin: Bench oder Tribüne.“
- Phase `poll` note: „Teamwahl öffnet, sobald der Termin steht. Bis dahin: Bench oder Tribüne.“ Locked slots „Zu“ (`role="img"`, label with reason).
- Desktop team grid 4 columns at 1052 px content width (each TeamZone ≥ 250, 2-col slots). Mobile 2 columns; the team name wraps to max 2 lines (line-clamp) instead of truncating to one.
- Teams stay locked for the whole Event, including between Sessions (decided). Members cannot re-choose; the host can still move people.

## HostDock (change)
Same position and actions wherever the host sits (team, Bench, Tribüne) [6a, 6b]. Max 3 + „Mehr“, exactly one primary. „Einstellungen“ always in „Mehr“.

- `poll`: **Termin festlegen** · Einladen · Mehr
- `teams`: **Session 1 starten** · Termin für Session 2 · Einladen · Mehr. Uneven/empty teams: primary is `aria-disabled` (dashed, paper-2, ink-2) and a reason bubble sits above the pill („Geht erst, wenn alle Teams gleich groß sind.“, `aria-describedby`).
- `running`: **Session 1 beenden** (HoldToConfirmButton, variant `primary`, „1 s halten“) · Einladen · Mehr
- `between`: **Session 2 starten** · Einladen · Mehr
- `done` (last Session ended, Event still open): **Event beenden** (HoldToConfirmButton, variant `primary`, „1 s halten“; leads to the ceremony) · Einladen · Mehr. „Session beenden“ never ends the Event, even on the last Session.
- `setup`: **Event einrichten** · Einladen · Mehr
- **Desktop:** centred over the stage (x = (viewport − 340) / 2), never over the SidePanel. **Mobile:** crown 56, right 14, bottom 96 (above the TabBar); sheet lists the same actions as 52 px buttons (reason under a disabled one), then „Mehr“: Einstellungen · Event beenden (halten; only before `done`, where it moves to the primary) · Leute verschieben · Teamname zurücksetzen · Event löschen (halten) [8d].

## SidePanel (change)
- 1.4 renders the tabs pattern with a single tab „Aktivität“ (`role="tablist"` › `role="tab" aria-selected="true" aria-controls` › `role="tabpanel"`). Chat, Tabelle, Leute are appended later; nothing else changes.
- Tabpanel holds ActivityFeed (`role="log"`, `aria-live="polite"`), newest at the bottom, scrolled to the end on load. Sticky group headers: „Vor dem Start“ until the first Session starts, then „Session 1“, „Vor Session 2“, …
- Empty (old Events): dashed box „Noch nichts passiert. Ab jetzt steht hier, wer dazukommt, wechselt und abstimmt.“

## TabBar (change)
- Mobile Event page: `placement: bottom`, two items **Event** (layout-grid) and **Aktivität** (history, unread badge). Grid grows to 5 when Tabelle, Chat, Leute arrive (as AppFrame). Badge in the accessible name („Aktivität, 3 neu“).

## NoticeBanner (usage)
- uneven (host-only, warning, action „Bea nachziehen“), uneven member variant, locked (running), „Teams bleiben“ (between), „Event einrichten“ (host-only, primary icon, secondary action „Jetzt einrichten“), „Sanne richtet das Event noch ein“ (member, info), host seat note (host-only, crown) [6a, 6b].

## ConnectionBanner (usage)
- Under the header, full width over stage and SidePanel [7a, 7b]. Nothing is dimmed (AA kept), dock stays usable, input is queued. Logo Compibert → confused.

## Copy keys
```
event.head.poll.kicker        Session {n} von {total} · Terminumfrage läuft
event.head.poll.title         Wann zocken wir?
event.head.teams.kicker       Session {n}: {date} · Teamwahl offen
event.head.teams.title        Rein in die Teams
event.head.jump_poll          Session {n}: Terminumfrage läuft
event.head.running.kicker     Session {n} von {total} läuft seit {time}
event.head.running.title      Session {n} läuft
event.head.between.kicker     Session {n} beendet · Session {m}: {date}
event.head.between.title      Halbzeit
event.head.setup.kicker       Noch nicht eingerichtet
event.head.setup.title_host   Erst einrichten, dann zocken
event.head.setup.title        Gleich geht’s los
event.notice.setup_title      Event einrichten
event.notice.setup            Für dieses Event fehlt noch, wie gespielt wird. Leg Format, Spiele und Punkte fest, dann öffnet die Teamwahl.
event.notice.setup_member     {host} richtet das Event noch ein. Bis dahin: Bench oder Tribüne.
event.notice.teams_stay       Die Teams bleiben fürs ganze Event. …
board.note.setup              Teams gibt es, sobald das Event eingerichtet ist. Bis dahin: Bench oder Tribüne.
poll.matrix_toggle            Wer kann wann? · {voted} von {total}
dock.start_disabled           Geht erst, wenn alle Teams gleich groß sind.
feed.group.pre                Vor dem Start
feed.group.before             Vor Session {n}
feed.empty                    Noch nichts passiert. Ab jetzt steht hier, wer dazukommt, wechselt und abstimmt.
tabs.event                    Event
```

## Decisions
1. Teams stay locked for the whole Event, including between Sessions (standings run across Sessions).
2. Ending the Event is a separate action, „Event beenden“. „Session beenden“ only ends the Session, even the last one. After the last Session the dock's primary becomes „Event beenden“; until then it lives in „Mehr“.
