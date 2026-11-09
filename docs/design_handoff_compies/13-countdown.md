# 13 Countdown

Stage card on the Event page while a Session runs. Same format as `02-components.md`. Ref: `Countdown.dc.html` (frame ids in brackets; state switch `?st=ready|ready-m|run|final|paused|burst|done|done-m|reduced|live&vp=desk|mob&theme=light|dark`, add `&motion=reduced` for the live demo and `&only=1` to show one frame only).

The sheet „Countdown stellen“ (minutes, seconds, „Stellen“) is unchanged and not part of this.

**New tokens: none.**

## Index
- [`CountdownCard`](#countdowncard) new (replaces the plain stage card)
- [`EventPage`](#eventpage-change) changed (stage order)
- [04-motion addition](#04-motion-addition)
- [Copy keys](#copy-keys)
- [Decisions](#decisions)

## CountdownCard
**Scope:** 1.4 · **Ref:** Countdown 1a–9d, T10–T1, B0–B760

Shows the Host's Countdown to everyone. Every visual is a function of the time left, never of when the viewer arrived.

- **Props / variants:**
  - `countdown: { status: "ready" | "running" | "paused", durationMs: number, endsAt?: number /* server ms, running */, remainingMs?: number /* paused */ }` (from the room state)
  - `isHost: boolean`, `hostName: string` (for the Member line)
  - emits `start`, `pause`, `resume`, `reset` (Host only; server sets `endsAt = serverNow + remaining` on start/resume and stores `remainingMs` on pause)
  - Derived on the client every frame (rAF, paused while the card is off-screen):
    - `left = status === "running" ? endsAt − serverNow() : status === "paused" ? remainingMs : durationMs`
    - `s = ceil(max(0, left) / 1000)`
    - `view = "done"` when `status === "running" && left ≤ 0` (no server event needed; the server keeps `running` until the Host resets)
    - `final = view ≠ "done" && status ≠ "ready" && 1 ≤ s ≤ 10`
- **Elements:**
  - Card: `surface`, `--cp-bw` `line`, radius 16, `shadow-card`; padding 16 18 18 (desktop) / 14 (mobile). Gap 14.
  - Head row (min 32): icon disc 32 (`primary`, 2 px `line`, Lucide `timer` 17) · `<h2>` „Countdown“ Lilita 28 / 24 · status pill right (28 high, 2 px `line`, 13 / 800).
  - Tile: fixed height 132 (desktop, 300 wide, left column) / 100 (mobile, full width); `--cp-bw` `line`, radius 12; digits centred, `--cp-font-timer` 96 / 68 px, line-height .9, digit slots `--cp-timer-slot` / `--cp-timer-sep` (CpNum `face="timer"`), so nothing wobbles.
  - Progress (16 high, right column on desktop, under the tile on mobile): either the **bar** (`paper-2` track, 2 px `line`, pill; fill `primary` with a 2 px `line` right edge) or, in the last ten and at zero, **10 pips** (grid of 10, gap 5, radius 5, 2 px border: lit = solid `line` + tone fill, spent = dashed `ink-3`, transparent).
  - Meta line 14 / 700 `ink-2`.
  - Host buttons, same labels and order as today, AppButton `secondary` `md` (44, surface, `--cp-bw` `line`, `shadow-btn`, 15 / 800, icon 18). Desktop: right of the meta line; mobile: full-width row under it, buttons share the width. Members: none (card is 56 px shorter, nothing else changes).
  - Desktop layout: grid `300px minmax(0,1fr)`, gap 22. Mobile: column, gap 12.
  - **Height is fixed per role and viewport in every state** (desktop ≈ 214; mobile ≈ 270 Host / 214 Member). Growth and burst are transforms inside the tile.
- **States:**
  - **Bereit** [1, 2]: pill „Bereit“ (`surface`, dot `ink-3`); tile `paper-2`, `ink` digits = `durationMs` („5:00“); bar full. Meta Host „Gestellt auf 5:00. Starte, wenn alle bereit sind.“ / Member „Gestellt auf 5:00. {host} startet ihn.“ Button: **Starten** (`play`).
  - **Läuft** [3]: pill „Läuft“ (`primary`, dot `hot`, as PhasePill); tile `primary` / `on-primary` (DS: „the countdown tile“); bar width = `left / durationMs`, updated every frame, no tween. Meta „Gestellt auf 5:00“. Button: **Pausieren** (`pause`).
  - **Läuft, letzte zehn** [4, T10–T1]: digits show seconds only („7“), the bar becomes 10 pips. Per second, see the table below.
  - **Pausiert** [5]: pill „Pausiert“ (`surface`, icon `pause`); tile `paper-2`, border **dashed**, pause badge 30 (top right, `surface`, 2 px `line`); digits `ink`; bar fill hatched (`repeating-linear-gradient(-45deg, transparent 0 6px, var(--cp-line-soft) 6px 12px)` over `primary`). Paused inside the last ten: pips and digit size of that second stay, digits use `warning-fg` (10–6) / `error-fg` (5–1) on `paper-2`, no fill, no pulse. Meta Host „Angehalten. „Fortsetzen“ macht bei 2:10 weiter.“ / Member „{host} hat angehalten, bei 2:10 geht’s weiter.“ Buttons: **Fortsetzen** (`play`) · **Zurücksetzen** (`rotate-ccw`).
  - **Zeit ist um** [7, 8]: pill „Zeit ist um“ (`error` / `on-error`, icon `bell-ring`); tile `error` / `on-error` „0:00“; stamp „Zeit ist um“ centred over the digits (Bungee 24 / 19, `ink` on `surface`, `--cp-bw` `line`, radius 8, `shadow-sm`, rotate −6°); all pips spent; card shadow `6px 6px 0 var(--cp-error)` (in dark this equals `shadow-card`). Meta Host „Bleibt stehen, bis du zurücksetzt.“ / Member „Bleibt stehen, bis {host} zurücksetzt.“ Button: **Zurücksetzen**. Stays until the Host resets; nothing loops, nothing ends on its own.
  - **Null-Moment** [6, B0–B760]: the burst between the last second and the steady state (see 04-motion).
- **What changes per second in the last ten** (`s` = seconds left):

  | s | Tile fill / text | Digits scale | Pips lit | Screen reader |
  |---|---|---|---|---|
  | 10 | `warning` / `on-warning` | 1.000 | 10 | „Noch 10 Sekunden.“ once |
  | 9 | `warning` | 1.035 | 9 | — |
  | 8 | `warning` | 1.070 | 8 | — |
  | 7 | `warning` | 1.105 | 7 | — |
  | 6 | `warning` | 1.140 | 6 | — |
  | 5 | `error` / `on-error` | 1.175 | 5 | — |
  | 4 | `error` | 1.210 | 4 | — |
  | 3 | `error` | 1.245 | 3 | — |
  | 2 | `error` | 1.280 | 2 | — |
  | 1 | `error` | 1.315 | 1 | — |

  `scale = 1 + (10 − s) × 0.035` on the digit wrapper (origin centre). Lit pips use the fill of the current second. Plus a tick on every second boundary (see 04-motion). All of it is keyed to `s`, so a Member who opens the page at 7 s gets row 7 at once.
- **Slots:** —
- **Desktop / mobile:** Desktop 1440: in the stage column (content 1052) next to the 340 SidePanel; the HostDock floats over the stage as before (no Countdown action in the dock change). Mobile 390: Event tab, full width; Members' card 214 px, Host 270 px.
- **Accessibility:**
  - `<section role="region" aria-labelledby>` the `<h2>`. Visual digits `aria-hidden`; a visually hidden `role="timer"` (implicit `aria-live="off"`) holds „Noch 3 Minuten 45 Sekunden“, readable on demand, never announced.
  - One polite live region (`role="status"`) is written **only on state changes**: „Countdown gestellt: 5 Minuten.“ · „Countdown läuft. Noch 3 Minuten 45 Sekunden.“ · „Countdown pausiert. Noch 2 Minuten 10 Sekunden.“ · „Countdown läuft. Noch …“ (resume) · „Noch 10 Sekunden.“ (entering the last ten) · „Zeit ist um.“ · „Countdown zurückgesetzt: 5 Minuten.“ Nothing on page load (the timer text is there). This replaces CpNum's 30 / 10 / 5 s rule for this card.
  - Buttons 44 px, focus ring `focus` 3 px, offset 3 (`:focus-visible`). Focus stays on the card after an action: Starten → focus moves to Pausieren (same spot), Pausieren → Fortsetzen, Zurücksetzen → Starten.
  - Contrast (light / dark): `on-primary` on `primary` 12.6 / 12.7 · `on-warning` on `warning` 10.0 / 10.1 · `on-error` on `error` 5.6 / 5.9 · `ink` on `paper-2` 15.3 / 16.7 · `warning-fg` on `paper-2` 5.3 / 12.1 · `error-fg` on `paper-2` 5.1 / 7.9 · stamp `ink` on `surface` ≥ 15. Colour never carries meaning alone (pill text, pips count, digits).
- **Motion:** see 04-motion § Countdown below. Reduced: colour and size steps only.

## EventPage (change)
- `running`: Head · NoticeBanner locked · **open Rounds · CountdownCard (while a Countdown exists) · Standings** · GameBoard · [EventSessions | HowWePlayCard]. The card appears when the Host sets it and leaves on „Zurücksetzen“ only if the Host also closes it (today: reset keeps it at Bereit).
- Card enter: Flip for the blocks below `dur-slow` `ease-out` (as 11 § EventPage), card itself `animate-enter` (fade, `dur-base` `ease-out`). Reduced: instant.

---

## 04-motion addition

### Countdown [1.4]
Times from the room: `endsAt` (running) or `remainingMs` (paused). Render rule from § Synchronised moments: `left = endsAt − serverNow()` every frame; never decrement. Re-read on `visibilitychange → visible` and after reconnect.

- **State changes** (Host action → room update, all clients at once):
  - tile background / text colour `dur-fast` `ease-snap` (CSS transition); dashed ↔ solid border instant; pill background `dur-fast` `ease-snap`.
  - Starten / Fortsetzen / Zurücksetzen: digits swap instantly (they are information); no count-up.
  - Bar fill: no tween ever; width is set from `left` each frame.
- **Last ten, per second** (only while `running`):
  - At each boundary (s changes), the digit inner span plays `animate-tick` (`cp-tick`: `scale 1 → 1.14 → 1`, 50 %, `dur-base` 220 ms, `ease-pop` per segment) on top of the step scale. Start it **sought**: `anim.currentTime = s × 1000 − left` (time already passed in this second). If that is ≥ 220 ms (late joiner, tab back from background), skip it: the steady frame is correct.
  - Colour, step scale and pips switch at the boundary without a tween (they are the keyed state). 11 → 10: digits change from „0:11“ to „10“ and the bar turns into pips in the same frame.
- **Zero burst** (0.76 s, `layer-content`, inside the tile; the card keeps its size):
  - Plays only if this client rendered a frame with `0 < left ≤ 1000` (it saw the last second live). Build one timeline and `playAt(tl, endsAt)`: early clients wait, a client up to 0.76 s late seeks in, later clients get `tl.progress(1)` = steady „Zeit ist um“. A client that opened after zero (never saw `left ≤ 1000`) renders the steady state directly.
  - Labels / tracks (t in ms from `endsAt`):
    | Track | t | Duration | Ease | Values |
    |---|---|---|---|---|
    | last „1“ out | 0 | `dur-fast` 140 | `ease-in` | scale ×1.315 → ×1.644, opacity 1 → 0 |
    | tile thump | 0 | `dur-slow` 360 | `ease-out` | scale 1 → 1.06 (at 40 %) → 1 |
    | shock outline 1 (`--cp-bw` `error`, tile radius) | 0 | `dur-slower` 600 | `ease-out` | scale 1 → 1.12 / 1.4 (x / y), opacity 1 → 0 |
    | shock outline 2 | 160 | `dur-slower` 600 | `ease-out` | same |
    | „0:00“ in | 80 | `dur-base` 220 | `ease-out` | scale 1.4 → 1, opacity 0 → 1 |
    | stamp „Zeit ist um“ | 200 | `dur-slow` 360 | `ease-pop` | scale 2.4 → 1, rotate −14° → −6°, opacity 0 → 1 |
    | card shadow | 200 | `dur-base` 220 | `ease-snap` | `shadow-card` → `6px 6px 0 var(--cp-error)` |
  - End = 760 ms = the steady state, identical to opening the page later.
  - No sound, no Compibert, no confetti.
- **Reduced** (`--cp-motion: reduced`): same states, same keyed colour / size / pip steps per second, set without transition (instant); no tick, no burst (steady „Zeit ist um“ at `endsAt`), colour transitions instant. Same live-region text.
- Off-screen (IntersectionObserver, rootMargin 120 px): stop the rAF; on re-entry compute from `left` again (no catch-up animations).

---

## Copy keys
```
countdown.title              Countdown
countdown.pill.ready         Bereit
countdown.pill.running       Läuft
countdown.pill.paused        Pausiert
countdown.pill.done          Zeit ist um
countdown.stamp              Zeit ist um
countdown.meta.set           Gestellt auf {time}
countdown.meta.ready_host    Gestellt auf {time}. Starte, wenn alle bereit sind.
countdown.meta.ready         Gestellt auf {time}. {host} startet ihn.
countdown.meta.paused_host   Angehalten. „Fortsetzen“ macht bei {time} weiter.
countdown.meta.paused        {host} hat angehalten, bei {time} geht’s weiter.
countdown.meta.done_host     Bleibt stehen, bis du zurücksetzt.
countdown.meta.done          Bleibt stehen, bis {host} zurücksetzt.
countdown.action.start       Starten
countdown.action.pause       Pausieren
countdown.action.resume      Fortsetzen
countdown.action.reset       Zurücksetzen
countdown.sr.timer           Noch {duration}
countdown.sr.timer_ready     Countdown gestellt auf {duration}
countdown.sr.timer_paused    Pausiert, noch {duration}
countdown.live.set           Countdown gestellt: {duration}.
countdown.live.running       Countdown läuft. Noch {duration}.
countdown.live.paused        Countdown pausiert. Noch {duration}.
countdown.live.final         Noch 10 Sekunden.
countdown.live.done          Zeit ist um.
countdown.live.reset         Countdown zurückgesetzt: {duration}.
```
`{time}` = „m:ss“ (5:00, 12:30); `{duration}` = „3 Minuten 45 Sekunden“, „1 Minute“, „7 Sekunden“.

## Decisions
1. **Typeface.** The brief asked for Bungee; DS Foundations reserves Bungee for scores and gives timers `--cp-font-timer` (Lilita One), like the veto timer. The card follows the DS. Bungee is ready as an option (`face="num"`: 76 / 56 px, `--cp-num-slot`) if you want it anyway. Open question.
2. Time is the only input: no client counters, no „from start“ animations. Everything works when you arrive in the middle.
3. The card's height never changes between states, so the stage below never jumps.
4. „Zeit ist um“ is loud through colour, stamp and shadow, not through a loop.
5. No new tokens.
