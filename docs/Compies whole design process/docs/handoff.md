# COMPIES design system: developer handoff

Phase 2 output. Stack: Nuxt + Tailwind CSS v4. Language of the UI: German (`lang="de"`). Everything visual comes from two files; components below are reference implementations (Design Components) to rebuild as Vue components.

## 1. Files

| File | What it is |
|---|---|
| `tokens/compies-tokens.css` | All CSS variables (`--cp-*`). Light and dark via `[data-theme=dark]`, reduced motion via `[data-motion=reduced]`. Single source of truth. |
| `tokens/compies-theme.css` | Tailwind v4 theme. Imports Tailwind + tokens, maps every token to utilities (`bg-paper`, `text-ink`, `shadow-card`, `layer-veto`, `dur-base`, `pattern-team-3` …). |
| `tokens/lucide-subset.js` | The Lucide icons we use (MIT). In Nuxt use `lucide-vue-next` with `stroke-width="2.5"` instead. |
| `docs/de.json` | Copy deck, i18n keys (vue-i18n format). |
| `docs/post-1.0.md` | Post-1.0, „Bald verfügbar“ and last-ticket items. |
| `Spec Changes.md` | Every decision that changes or sharpens the brief, plus open questions. |
| `DS *.dc.html` | The living system pages. Open `DS Foundations.dc.html` and use the rail. |

### Setup

```css
/* assets/css/main.css */
@import "./compies-theme.css";
```

```html
<html lang="de" data-theme="light" data-motion="full">
```

- Mode: read `prefers-color-scheme` on first visit, then the user's toggle (persist in a cookie so SSR renders the right theme).
- Motion: read `prefers-reduced-motion`, plus the in-app toggle. Use the `reduced:` variant in Tailwind.
- Fonts (Google Fonts): Lilita One (display), Bricolage Grotesque 400–800 with optical sizing (UI), Bungee (scores and timers), JetBrains Mono 500/700 (codes). Self-host in production.

## 2. Ground rules

1. **No raw values.** Colours, radii, shadows, z-index, durations: tokens only. If something is missing, add a token; don't hard-code.
2. **Colour is never alone.** Teams always pair colour + symbol (TeamMark) + pattern. States pair colour + icon or line style (solid = ok, dashed = not available).
3. **Team colours are identity only**, never for UI states or badges. Text on team colour uses `--cp-team-N-ink`. No text directly on a pattern.
4. **Ink lines.** Interactive surfaces get `border-memphis` (2.5 px ink) and a hard offset shadow. Press = translate by the shadow offset, shadow to none.
5. **One primary action per view** (yellow `primary`). Destructive actions use `hot` and are held, not clicked (hold-to-confirm, 1 s).
6. **Numbers** that change live (scores, timers) use `<CpNum>` (Bungee + fixed digit slots, see `num` / `timer` utilities) so nothing jumps. Plus a visually hidden full value for screen readers.
7. **Motion:** physical moments (landing, bounce-back, wheel) may overshoot; UI (toasts, sheets, badges) never does. Every animation has a reduced-motion twin (fade or instant).
8. **Sound** is optional flavour, off when muted, max 3 emote sounds per second for the whole room.
9. **Hit targets** ≥ 44 px (`hit-44` utility for small visuals). Focus ring: 3 px `focus` colour, 3 px offset, always visible on keyboard focus.
10. **Disabled is explained.** Use `aria-disabled` (keeps focus) plus the reason as text or description. Never only grey.
11. **Server-timed moments** (wheel spin, veto window, reveal, coin flip): the server sends start time + duration + result; clients animate to it. Rejoining lands you in the current second.

## 3. Layout

- Breakpoints: mobile < 600, tablet 600–979 (`sm`), desktop 980–1439 (`md`), wide ≥ 1440 (`xl`). Reference layout 1280.
- Desktop shell: header 64 px (`h-header`) · stage (max 1100 px, centred) · side panel 340 px (`w-panel`) with tabs Chat, Aktivität, Tabelle, Leute. Host dock floats bottom centre of the stage.
- Mobile shell: header 56 px · content · bottom tab bar (Spielbrett, Tabelle, Chat, Aktivität, Leute) · host button 56 px bottom right.
- Layer stack (`layer-*` utilities): decor 1 · content 2 · sticky 10 · dock 30 · sheet 40 · clip 44 · veto 46 · modal 50 · toast 60 · confetti 70. The veto bar always sits above the clip; confetti never takes pointer events.
- Content inside stage and panel uses container queries, not viewport breakpoints.

## 4. Components

Props as implemented in the reference DCs. States are what each must support. Page = where to see it.

### Core

| Component | Props | States / notes | Page |
|---|---|---|---|
| **Button** | `variant: primary \| secondary \| ghost \| hot`, `size: sm 36 \| md 44 \| lg 52`, `icon`, `loading`, `disabled` (+ reason) | default, hover (lift −2 px), active (press into shadow), focus, loading (spinner, label kept), disabled (dashed, `aria-disabled`) | Basics |
| **HoldButton** | `label`, `duration=1000`, `onConfirm` | idle, holding (fill sweeps), confirmed, cancelled on release. Space/Enter hold works the same. | Basics, Game |
| **IconButton** | `icon`, `label` (required), `size` | as Button; label goes to `aria-label` | Basics |
| **Input / Textarea** | `label`, `help`, `error`, `maxlength`, `counter` | default, focus, error (red border + text, `aria-invalid`), readonly (dashed), counter live region | Basics |
| **Toggle / Switch** | `checked`, `label`, `description` | on/off, focus, disabled with reason | Basics |
| **Radio cards** | `options[]`, `value`, per option `planned` | selected (thick border, lift), planned („Bald verfügbar“, dashed, `aria-disabled`, skipped by arrow keys) | Game, Smoke 06 |
| **Segmented** | `options[]`, `value` | 2–4 options, `aria-pressed` | Basics |
| **Stepper (number)** | `value`, `min`, `max`, `step`, `unit` | minus/plus disabled at bounds, `output` live | Scoring, Game |
| **Tabs** | `tabs[]` with `icon`, `badge` | active bar in `hot`, active icon offset, badge 99+ | Basics, Frame |
| **Sheet** (side / bottom) | `title`, `open`, `onClose` | slide in 360 ms, overlay, Esc + overlay click close, focus trap, return focus | Basics, People |
| **Modal** | destructive confirms only | — | Basics |
| **Toast** | `tone: success \| info \| warning \| error`, `action` | auto-dismiss 5 s (not for errors), max 3 stacked | Basics |
| **Banner / Notice** | `tone`, `icon`, `hostOnly`, `action` | „Nur du siehst das“ chip when host-only | People, Frame |
| **Icon** | `icon`, `size`, `sw=2.5`, `offset` (colour) | `offset` adds the active-state colour shadow | Foundations |
| **CpNum** | `v`, `face: score \| timer`, `say` | fixed slots, counts up on change, `say` for screen readers | Foundations |

### People and teams

| Component | Props | States / notes | Page |
|---|---|---|---|
| **Avatar** | `who`, `size: 24 \| 32 \| 40 \| 48 \| 80`, `team 0–8`, `host`, `online`, `dot`, `lifted`, `src` | rim slots fixed: team mark bottom-left, crown top-right, presence bottom-right; offline = greyscale + hollow ring; lifted = scale + hard shadow (dragging) | People |
| **TeamMark** | `team 1–8`, `size` | colour + symbol (● ▲ ■ ◆ ✚ ▬ ◗ ✦) | People |
| **TeamChip** | `team`, `name` | 36 px; collapses to the mark in tight rows | People |
| **TeamNameBuilder** | `team`, `myWord`, `frozen`, `canReset` | one word ≤ 12 chars, spaces stripped with hint, readonly after kick-off, host reset | People |
| **Board (Spielbrett)** | `teams[]`, `bench[]`, `stands[]`, `teamSize`, `phase`, `role` | drag + click/Enter „verschieben nach“ panel; zone states: open, drop target, full/refused, locked (poll), locked (running), uneven (host); server-confirmed last slot with bounce-back | People |
| **PlayerList** | `people[]`, `role` | rows with move menu (`aria-expanded`), only own row for players | People |
| **Profile** | — | upload + Discord image, display name ≤ 24, linked accounts, last account can't unlink | People, Smoke 08 |

### Game and selection

| Component | Props | States / notes | Page |
|---|---|---|---|
| **GameCard** | `title`, `players`, `fmt`, `state: default \| banned \| picked \| vetoed \| drawn \| disabled`, `team`, `order`, `layout: card \| row`, `selected`, `suggested`, `inPool`, `cover` | banned/picked carry the acting team's mark; disabled explains why | Game |
| **GameWheel** | `games[]`, `skin="show"`, `spinSec 3–10` (host setting), `hidden`, `hideStyle: fun \| q`, `canSpin`, `controls`, `muted`, `motion`, `onResult` | idle (bulbs blink), spin (bulbs chase, flapper kicks per pin, tick sound), stop (all bulbs flash, winner outline), reveal (hidden mode), remove slice (600 ms), put back, refill. Fixed size: never resizes during a spin. Reduced motion: 1.2 s calm spin. | Game |
| **VetoWindow** | `game`, `host`, `motion`, `seconds=60` | running (timer, hold-to-veto per party), vetoed (sealed until reveal), reveal, host skip | Game |
| **CoinFlip** | `take="bullet"`, `result`, `motion` | Zeitlupe: rise, near-freeze at apex while camera orbits once, drop, land flat, top view. Faces: Kopf = Compibert head, Schwanz = curled tail (Phase 3). | Game Options 1i |
| **PickBan** | `order[]`, `turn`, `pool[]` | order strip, current turn banner in team colour, hold bar „X bannen“ | Game, Smoke 04 |
| **ModeSetup** | `mode`, `spinSec`, `hidden` | five modes; Loser modes planned until shipped | Game |

### Scoring

| Component | Props | States / notes | Page |
|---|---|---|---|
| **ResultEntry** | `parties[]`, `pointsTable`, `editing` | drag / arrows / buttons to reorder, „gleichauf“ toggle (ties 1, 1, 3), optional score (decorative), save; correction mode | Scoring |
| **Leaderboard** | `standings[]`, `played`, `total` | shared ranks, rows slide (620 ms spring), points count up, delta pill, winner stamp + confetti, end state: ceremony or tiebreaker | Scoring |
| **PointsTable** | `preset: linear \| wta \| custom`, `custom[]` | custom can't reward a worse place more than a better one | Scoring |
| **GameHistory** | `games[]`, `canEdit` | „korrigiert“ marker | Scoring |
| **Tiebreaker** | `tied[]` | announce, own wheel, repeat until decided | Scoring |

### Communication

| Component | Props | States / notes | Page |
|---|---|---|---|
| **Chat** | `messages[]`, `me`, `role` | grouped within 2 min, own right in yellow, sending, failed + retry, host delete → „Vom Host gelöscht“ | Communication |
| **ActivityFeed** | `events[]` | 10 event types, sticky game headers, vetoes only after reveal | Communication |
| **EmoteBar / FloatingEmote** | `emotes[4]`, `cooldown=2000` | cooldown ring, rise above sender avatar, reduced = pop in place | Communication |
| **DatePoll** | `slots[]`, `votes`, `me`, `role` | Ja / Wenn nötig / Nein / offen (shape + colour), best slot (most Ja, then Wenn nötig, then earliest), host confirm, reschedule | Communication, Smoke 01 |
| **PushAsk** | — | soft ask after first poll vote; then browser prompt | Communication |

### Frame

| Component | Props | States / notes | Page |
|---|---|---|---|
| **AppShell** | `variant: desktop \| mobile` | landmarks, skip link | Frame |
| **HostDock** | `phase`, `actions[]` | max 3 + „Mehr“, one primary, collapses to crown after 8 s idle, `H` focuses it, moves above the veto bar; mobile = crown button + bottom sheet | Frame |
| **ConnectionBanner** | `state: reconnecting \| lost` | reconnecting after 2 s (`role=status`), lost after 15 s (`role=alert`), input queued | Frame |
| **FullScreenState** | `kind: loading \| invalid-link \| ended \| error` | focus to heading | Frame |
| **Confetti** | `origin`, `count` | sticker confetti (white rim, hard shadow), `layer-confetti`, `pointer-events: none`, skipped on reduced motion | Scoring, Game |

## 5. Not designed yet

- ~~Award ceremony~~: done in Phase 3, see `Compibert Momente` (04 Pokal-Lauf). Share image final art still open.
- ~~Compibert, coin faces, emote art~~: done in Phase 3 (`Compibert Rig`, `CompibertRig`, `Coin3D`, `Compibert Momente` 05).
- ~~Battle replay~~: done in Phase 4, see `App Ende & Archiv` → 20 (9a „Wettrennen“), engine in `battle-replay.js`.
- ~~All app screens~~: done in Phase 4, see section 6.

## 6. Phase 4: screens & flows

36 screens in 8 parts, desktop 1280 and mobile 390, light and dark, every state switchable, build notes next to each screen. Start at `App Screens.dc.html` (index) or `App Flows.dc.html` (5 click-through flows).

### Files

| Part | File | Screens |
|---|---|---|
| A Einstieg | `App Einstieg.dc.html` | 01 Splash, 02 Anmelden, 03 Profil einrichten, 04 Home, 06 Einladen, 07 Link öffnen |
| B Vorbereitung | `App Vorbereitung.dc.html` | 05 Session erstellen (8-step stepper + info sheet), 08 Terminumfrage |
| C Lobby | `App Lobby.dc.html` | 09 Spielbrett (poll / date set / running; host in stands, bench, team), 10 Host-Steuerung |
| D Spielrunde | `App Spielrunde.dc.html` | 11 Lucky Wheel (visible, hidden, spin, stop, veto, reveal, respin), 12 Loser's Advantage, 13 Pick & Ban, 14 Loser's Pick, 15 Admin-Wahl, 16 Ergebnis, 17 Live-Tabelle, 18 Tiebreaker |
| E Ende & Archiv | `App Ende & Archiv.dc.html` | 19 Siegerehrung + Teilen, 20 Battle-Replay [1.0 – last ticket], 21 Archiv, 22 Archiv-Detail |
| F Bibliothek & Profil | `App Bibliothek & Profil.dc.html` | 23 Bibliothek, 24 Spiel anlegen, 25 Profil & Einstellungen, 26 Plattform-Admin |
| G Systemzustände | `App Systemzustände.dc.html` | 27 Verbindung, 28 Push-Erlaubnis, 29 PWA, 30 Ton aktivieren, 31 Fehlerseiten |
| H Nach 1.0 | `App Post-1.0.dc.html` | 32 Crews, 33 Turnierbaum, 34 Liga, 35 Ergebnis selbst melden, 36 Sprache — all [Post-1.0] |

Shared frame: `AppFrame.dc.html` (header, nav, stage + panel, mobile tab bar, host dock). `AppViewer.dc.html` embeds one screen in the flows.

### Deep links

Every part reads URL params, so tickets can link straight to a state: `?s=<screen>&st=<state>&vp=desk|mob&theme=light|dark&role=host|player`. `embed=1` hides the viewer chrome and doesn't write localStorage. Example: `App Spielrunde.dc.html?s=wheel&st=vreveal&vp=mob&theme=dark`.

### Flows (`App Flows.dc.html`)

1. Host plant den Abend: Home → stepper (8 steps) → Terminumfrage → Einladen.
2. Spielerin kommt dazu: link signed out → Discord → bench → vote → push ask → date set → drag into team → team word.
3. Verdecktes Rad, 2 Vetos: hidden wheel → spin → stop + transform → clip + veto window → two vetoes revealed at 0:00 → both consumed → respin.
4. Pick & Ban im 2v2: coin flip → bans (A1, B2, A1) → picks (B1, A2, B2, A1) → play order.
5. Gleichstand bis zum Teilen: last result → tie on 1st → tiebreaker wheel → ceremony → share image.

Where the person in the flow acts, the real button in the screen advances the flow (hold buttons need the full 1 s). Server-driven steps (coin, countdown, wheel stop) use „Weiter“; the flow panel says which.

### Patterns added in Phase 4

- **Hold to confirm (1 s)** for veto, ban, pick and every destructive host action (rotate link, end, delete). Starting a session is a normal click + short confirm.
- **Disabled = aria-disabled + reason**, never a dead greyed button (create session without host right, edit someone else's game, team size limits, „Gerade läuft kein Clip“).
- **Mobile action bar** (veto / ban / pick) sits above the tab bar in thumb reach and above the clip (layer veto 46 > clip 44). While it shows, the emote bar collapses to one button.
- **Host on mobile:** crown button bottom right opens the same menu as the desktop dock, as a bottom sheet. Chat/Aktivität is a tab + bottom sheet; host delete works there too.
- **Loading:** skeleton cards in the real card shape (archive, library), staggered pulse, no pulse on reduced motion; search/filter stay usable.
- **Empty states:** sleeping Compibert. **Error pages:** confused Compibert, focus moves to the heading.
- **Yellow surfaces always use `--cp-on-primary`** for text, in light and dark (dark mode had light-on-yellow bugs until the Phase 4 review).
- **Static wheel references:** „Dreht“ and „Stopp“ stills in 11 are the visual target for the GSAP wheel; hidden wheel still shows the fake name at stop, transform follows 0.5 s later.
- **Desktop nav** includes „Profil“ to match the mobile tab bar (see Spec Changes, confirm).
