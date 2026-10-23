# 04 Motion

GSAP 3 is the only animation engine (CSS transitions only for hover/press/focus). Register once:

```ts
gsap.registerPlugin(Flip, CustomEase)
gsap.defaults({ overwrite: 'auto' })
export const EASE = {
  snap: CustomEase.create('snap', '.2,0,0,1'),   out: CustomEase.create('out', '.16,1,.3,1'),
  in: CustomEase.create('in', '.7,0,.84,0'),     io: CustomEase.create('io', '.65,0,.35,1'),
  pop: CustomEase.create('pop', '.34,1.56,.64,1'), spring: CustomEase.create('spring', '.5,1.8,.4,.8'),
}
export const reduced = () => getComputedStyle(document.documentElement).getPropertyValue('--cp-motion').trim() === 'reduced'
```

Use `gsap.matchMedia()` with a custom condition fed by `reduced()` (re-evaluate when the in-app toggle changes) so every timeline below has its reduced twin in the same place.

Rules: physical moments may overshoot (`pop`, `spring`, `back.out`); UI (toasts, sheets, badges, banners) never does. Max one full-body Compibert animating at a time. Pause timelines of off-screen elements (IntersectionObserver, rootMargin 120 px).

---

## Synchronised moments

Wheel stop, clip start, coin flip, veto countdown, veto reveal, Pick & Ban turn changes and the ceremony start run on **all devices at the same moment**, based on server timestamps. Animations must be able to run **toward a fixed target time**, not only from a click.

### 1. Clock sync
```ts
// composables/useServerClock.ts
let offset = 0                       // serverTime − Date.now()
async function sync() {
  const samples = []
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now(), wall0 = Date.now()
    const { serverTime } = await room.request('ping')        // → clock.pong
    const rtt = performance.now() - t0
    samples.push({ rtt, offset: serverTime + rtt / 2 - (wall0 + rtt) })
  }
  samples.sort((a, b) => a.rtt - b.rtt)
  offset = median(samples.slice(0, 3).map(s => s.offset))  // lowest-RTT three
}
export const serverNow = () => Date.now() + offset
```
Sync on connect, every 30 s, on `visibilitychange → visible` and after reconnect. Target spread between clients ≤ 50 ms.

### 2. Play a timeline toward a target time
```ts
// startAt = server ms when the timeline's time 0 happens (endAt = startAt + tl.duration()*1000)
export function playAt(tl: gsap.core.Timeline, startAt: number) {
  const lead = (startAt - serverNow()) / 1000
  if (lead > 0) { tl.pause(0); gsap.delayedCall(lead, () => tl.play(0)) }   // early: wait
  else if (-lead < tl.duration()) tl.play(-lead)                             // late: seek in
  else tl.progress(1).pause()                                                // very late: end frame
}
```
- Build the timeline **deterministically from server data** (result, offsets, durations). No random values on the client for synced moments; the server sends a `seed` or the final values.
- **Never trust local ticks for the end.** After `playAt`, schedule a correction at `endAt`: `tl.progress(1)`. If the tab was hidden (rAF throttled), on `visible` call `playAt` again with the same `startAt` (it seeks).
- **Countdowns** render `ceil((endsAt − serverNow()) / 1000)` every frame; never decrement a counter.
- **Sound** for synced moments is scheduled with Web Audio: `source.start(ctx.currentTime + (cueAt − serverNow()) / 1000)`. Skip cues whose time has passed by > 150 ms.
- **Clip:** YouTube IFrame API. At `clip.startAt`: `loadVideoById({ videoId, startSeconds: start + max(0, elapsed) })`. Late joiners seek. If drift > 1 s after 3 s of playback, `seekTo` once.
- **Reduced motion** keeps the same start/end times; only the in-between changes (see each animation).

---

## Animations

Each entry: trigger · targets · timeline · reduced twin. Durations in seconds.

### Boot „Reinsprinten“ (3b) [1.0]
- Trigger: app start, first visit per 24 h. Any tap/key → `tl.progress(1)`.
- Targets: `.cb-wrap` (full body), `.letter` ×7 („COMPIES“), `.speedline` ×n, `.dust` ×4.
- Timeline (T = 0.9):
  - 0: Compibert → `run`; speedlines `opacity 0→1, scaleX .4→1`, 0.2, stagger 0.05; wrap `x −620 → 0`, T, `none`.
  - each letter at the moment Compibert passes it: `y 46→0, opacity 0→1, scaleY .3→1` (origin bottom), 0.45, `back.out(3)`.
  - T−0.05: speedlines out 0.15. T: → `idle`; skid `x 0→16` 0.16 `power2.out`, then `x→0` 0.3 `back.out(3)`; dust `opacity 1→0, scale .3→1.7, x −18−i·16, y −4−i·5`, 0.65, stagger 0.04.
  - T+0.5: → `wave`; T+2.8: → `idle`. Labels: `run`, `skid`, `wave`.
- Reduced: logo + Compibert fade in 0.2.

### Avatar drag, drop, bounce-back [1.0]
- Lift (pointerdown + 0/300 ms long-press on touch): avatar `scale 1→1.08`, shadow → `shadow-lift`, 0.14 `EASE.out`; sound `drag-pick`.
- Drop accepted (`member.moved` for me or others): Flip from old to new slot, 0.36 `EASE.pop`; landing `scale .6→1.12→1` 0.34; `drag-snap`.
- Drop rejected (`member.moveRejected`): `x/y → origin`, 0.6 `EASE.spring`; toast „X war schneller“; `drag-reject`.
- Others moving: same Flip, no sound.
- Reduced: no lift scale; position changes with a 0.14 fade.

### Emote rise [1.0]
- Trigger: `emote.sent`. Target: sticker above sender avatar.
- `0→.15`: `y 10→−6, scale .4→1.15, opacity 0→1` (pop); `.15→.8`: `y −6→−44`, `scale 1`; `.8→1.4`: `y −64, opacity 0`. Total 1.4. Sender's own: plus Compibert reaction (clap/laugh/angry/roar) if in view.
- Reduced: pop in place (`scale .8→1`, 0.2), hold 0.8, fade 0.3.

### UI enters (sheet, modal, toast, banner) [MVP]
- Sheet: `x 100%→0` (bottom: `y`), 0.36 `EASE.out`; out 0.22 `EASE.in`; overlay `opacity` 0.14.
- Modal: `scale .96→1, opacity 0→1`, 0.22 `EASE.out`.
- Toast: `y 20→0, opacity`, 0.22; out 0.14.
- Reduced: opacity only, 0.14.

### Hold to confirm [MVP]
- Fill `scaleX 0→1` (origin left), 1.0 `none`. Release early: `scaleX → 0`, 0.2 `power2.out`. Confirm: button `scale 1→.96→1`, 0.18; icon swap.
- Reduced: identical fill (it is information), no scale.

### Poll [MVP]
- New vote (own or others): bar segments `width` tween 0.36 `EASE.out`; matrix cell `scale .6→1` 0.22 `EASE.pop`.
- Best slot changes: chip `scale 0→1` 0.3 `EASE.pop` on the new card; old chip fades 0.14. Card border colour 0.22.
- Date confirmed: DateSetCard calendar tile `y −20→0, rotation −4→0`, 0.45 `back.out(2)`; text fades in 0.22 after 0.15.
- Reduced: instant values; tile fades.

### Lucky Wheel [1.0]
Server sends `{startAt, durationMs (3–10 s host setting; reduced clients still use the same stopAt), resultIndex, offset ∈ (−0.3, 0.3)}`.
- Final angle: `slice = 360 / n`; `target = −((resultIndex + 0.5 + offset) · slice)`; `final = target + 360 · ceil((current + 1800 − target) / 360)`.
- **Idle:** bulbs alternate (`i % 2`) every 0.6 s.
- **Spin timeline** (labels `spin`, `brake`, `stop`, `reveal`, `remove`):
  - `spin` @0: wheel `rotation current → final`, duration = durationMs/1000, ease `cubic-bezier(.15,.75,.25,1.035)` (`CustomEase 'wheel'`); bulbs chase (every 4th lit, step 0.08). Compibert (full, beside the wheel) rises `y 180→0` 0.45 `back.out(1.8)` → `excited`. Sound `wheel-windup` at 0.
  - per pin crossing (computed from the rotation in `onUpdate`): flapper `rotation −30→0`, 0.13 `EASE.snap`; `wheel-tick` (rate-limited by speed).
  - `brake` @60 % of duration: Compibert → `suspense`; `cb-gulp`.
  - `stop` @duration: all bulbs flash (on/off ×3, 0.12); winner slice outline 3 px + label `scaleY 0→1.25→1` 0.42 `EASE.pop`; result card `scale .6→1.08→1, opacity` 0.42; Compibert → `cheer` (1.6 s); `wheel-stop`.
  - `reveal` (hidden mode) @stop + 0.5: slice label scrambles (random letters, 6 frames × 0.05) then real label `scaleY 0→1`; `wheel-morph`.
  - `remove` @stop + 2.2 (hidden: +2.8): drawn slice `scale 1→0` toward centre 0.3; remaining slices redistribute (tween each slice's start/end angle) 0.6 `EASE.io`; `wheel-slice-out`. Compibert sinks `y 0→180` 0.4 `power2.in`.
- **Put back / refill:** slices redistribute 0.6 `EASE.io`, new slice `scale 0→1` 0.3 pop.
- **Reduced:** spin = calm 1.2 s `EASE.snap` placed so it **ends at the same stopAt** (start at stopAt − 1.2 s); no bulbs chase, no flapper; reveal = crossfade 0.2; remove = fade 0.2 then redistribute instantly.

### Clip overlay [1.0]
- Open at `clip.startAt`: `scale .96→1, opacity`, 0.36 `EASE.out`. Auto-close at startAt + 30 s: 0.22 `EASE.in` + `veto-clip-close`.
- Reduced: fade.

### Veto window [1.0]
Times from `round.determined`: `determinedAt`, `vetoEndsAt = determinedAt + 60 s`.
- Open @determinedAt: bar `y 100%→0` 0.36 `EASE.out`; `veto-open`.
- Timer: render from `vetoEndsAt − serverNow()`. Last 10 s: each second `scale 1.12→1` 0.26 `EASE.snap`; `veto-clock` (faster from 5 s).
- Own party vetoed (`veto.cast`): seal stamp `scale 2→1, rotation −8`, 0.3 `back.out(2.4)`; button → locked; `veto-seal`.
- From vetoEndsAt − 1.2: `veto-drumroll`.
- **Reveal** @vetoEndsAt (`veto.revealed`): per party tile `rotationY 90→0` (perspective 600), 0.42 `EASE.out`, stagger 0.08; stamps „VETO“ `scale 2.2→.9→1, rotation −8`, 0.52, delay 0.3; `veto-reveal`; if any veto: Compibert `angry`, feed entry; outcome `respin` → wheel removes the game, host can spin again.
- Reduced: tiles and stamps appear with 0.2 fade at the same time; timer pulse off.

### Coin flip „Zeitlupe“ (Pick & Ban) [1.0]
- Server: `{startAt, durationMs: 3600, result}`. Coin = 13 stacked edge discs + 2 faces (CSS 3D, `preserve-3d`), camera wrapper, ground shadow. Final face: `rotateX = (result === 'tail' ? −90 : 90) + 1440`, `rotateZ = tail ? 0 : 180`.
- Keyframes over 3.6 s (progress → value):
  - camera: 0 `(0, 8°, 0)` → .18 `(40, 18°, 0)` → .62 `(60, 22°, 360° orbit)` `EASE.io` → .72 hold → 1 `(150, 90° top view, 360)` `EASE.out`.
  - position y: 0 stand → .18 −130 (`cubic-bezier(.2,0,.4,1)`) → .62 −150 (near-freeze at apex) → .74 ground (`cubic-bezier(.6,0,1,.5)`) → .79 ground −16 → .84 ground.
  - rotation: 0 → .18 540° → .62 700° (slow) → .74 final → 1 final, linear.
  - shadow: scale .4/.12 opacity .22 → .3/.08 in the air → 1/.35 on landing.
- Result banner `scale .4→1.1→1, rotate −4`, 0.38 `EASE.pop`. Sounds `coin-toss` 0, `coin-spin` .18, `coin-land` .74, `coin-result` 1.0.
- Reduced: coin fades out/in with the final face (0.5), banner appears.

### Pick & Ban [1.0]
- Turn change: banner slides `x −24→0` 0.3 `EASE.out` in the acting team's colour; `pb-turn`.
- Ban: game card stamp „GEBANNT“ `scale 2.2→1, rotation −8` 0.4 `back.out(2)`, card desaturates 0.3; team mark pops on the card; `pb-ban`.
- Pick: card Flip into the play-order strip 0.5 `EASE.out`, number chip pops; `pb-pick`.
- Reduced: state changes with 0.2 fades.

### Leaderboard [1.0]
- Trigger: `result.saved` / `result.corrected`.
- Rows: Flip reorder, 0.62 `EASE.spring`, stagger 0.04 (`lb-swap`). Points: CpNum count-up 0.6 `power2.out` (`lb-count`, max 15 ticks/s). Delta pill `scale .3→1.15→1` 0.42 pop, delay 0.3. Winner stamp `scale 2→.9→1, rotation 8` 0.48, delay 0.52. Mini celebration: 18 sticker confetti from the winner row + Compibert bust `cheer` beside it (4 s); last place → `sad`. `lb-winner`.
- Reduced: rows reorder instantly with a 0.2 highlight; numbers jump; no confetti.

### Tiebreaker [1.0]
- „Gleichstand!“ slam: `scale 2→1, rotation −6`, 0.4 `back.out(2.4)`, screen shake `x ±6` ×3 0.05; `tie-alarm`; `tie-drum` loop until spin. Then the wheel as above.
- Reduced: fade in, no shake.

### Award ceremony „Pokal-Lauf“ (6b) [1.0]
Started by `ceremony.started {startAt, gag}` and played with `playAt`. Labels `banner`, `rows`, `run`, `land`, `stamp`, `members`, `dance`, `share`.
- 0: banner `y −140→0`, 0.55 `back.out(2.2)` (`cer-drop`).
- 0.6: standings rows from last to 2nd: `x 60→0, opacity`, 0.45 `power3.out`, stagger 0.45 (`cer-row`, pitch rises).
- after rows: winner card `scale .9→1, opacity` 0.4 `back.out(2)`.
- run: Compibert (full) `x −260 → stopX`, linear, trophy follows hand with bob `y ±7` every 0.15 (`boot-steps` + rattle).
- gag „trip“: → `suspense`; body `rotation 78, x +46` 0.38 `power2.in`; trophy flies to the card (x 0.75 `power1.out`, y arc up 0.45 / down 0.3, rotation 720). gag „bonk“: → `cheer`, trophy up 170 and down on Compibert's head (→ `confused`), then to the card. `cer-trip` / `cer-bonk`.
- land (+0.8): card bump `y 6` yoyo; card front→back swap 0.15; stamp „SIEGER“ `opacity, scale 2.4→1` 0.3 `back.out(2.4)` (`cer-stamp`) + confetti burst.
- members (+0.45): winner avatars `scale 0→1, y 18→0`, 0.4 `back.out(2)`, stagger 0.08 (80 px, 64 mobile; max 6 cells, then „+N“; FFA: one 120 px).
- dance: Compibert gets up (`rotation→0` 0.45 `back.out(2)`) → `laugh` then `dance` synced to the fanfare (120 bpm), `cer-fanfare` + `cer-crowd`.
- share (+1.4): share card `y 16→0, opacity` 0.35 `back.out(2)`.
- Skip / reduced: end frame (everything set), no run, no confetti; winner announced via live region.

### Confetti [1.0]
- Sticker pieces (white rim, hard shadow) from an origin: phase 1 `x rnd(−200,200), y rnd(−200,−70), rotation rnd(−360,360)` 0.5 `power2.out`; phase 2 `y += rnd(300,460), x += rnd(−50,50), rotation += 420` rnd(1.3,2) `power1.in`; fade last 0.35. 40 pieces desktop, 20 mobile. `layer-confetti`, no pointer events.
- Reduced: none.

### Compibert moment slots (4a) [1.0]
- Rise in beside the wheel / winner row: `y 180→0` 0.45 `back.out(1.8)`; leave `y 0→180` 0.4 `power2.in`. Header head-logo is always there and reacts (idle · cheer · confused).

### Construction page [MVP]
- No motion except Compibert idle (breath, blink, eye-follow) in full motion. The tape does not scroll. Reduced: still pose.

### Battle replay (9a) [1.0 – last ticket]
See 05-assets § Battle replay storyboard; built as one GSAP timeline with labels `g0 … gN`, `end`.

---

## Compibert

Inline SVG rig (`reference/assets/compibert/compibert-{full,bust,head}.svg`), reference implementation `reference/compibert-options.js` (builder, mount, all states, eye-follow, outline filters). Source of truth for timings: `reference/Compibert Rig.dc.html`. Full developer notes: `reference/docs/compibert-handoff.md`.

### Vue API
```ts
<Compibert variant="head|bust|full|emote|tail" :size="120" state="idle" still? accessory="hardhat"? />
const bus = useCompibertBus()   // emit('spin' | 'brake' | 'stop' | 'win' | 'lose' | 'join' | 'emote:clap' | 'load' | 'error' | 'ok' | 'empty' | 'award' | 'boot')
```
Components never set states directly; they emit events. Each `<Compibert>` subscribes to the bus (or gets a local `state` prop for scenes).

### Variants and crops
| Variant | viewBox | Hidden parts | Outline |
|---|---|---|---|
| full | `0 36 404 344` | none | light: hard shadow 7/8 px ink · dark: sticker (cream rim + shadow) |
| bust | `150 36 254 254` | shadow | same |
| head | `212 40 192 192` | body, limbs, tail, neck, shadow | none |
| emote | `172 -4 270 270` (sticker: `158 −10 296 296`) | as head + clap mitts | none |
Below 40 px: no filter. Below 24 px: no blink, no fx.

### Parts (IDs and pivots)

Every part is a `<g>` with `id="compibert-<part>"`, class of the same name and `data-pivot="x y"` in SVG user units (viewBox of the full rig `0 36 404 344`). Mount: `gsap.set(el, { svgOrigin: el.dataset.pivot })` for every `[data-pivot]`. Prefix ids per instance (clipPath/filter).

| Part id | What it does |
|---|---|
| `compibert-root` | Whole figure: jumps, squash and stretch from the feet |
| `compibert-shadow` | Ground shadow, shrinks when he leaves the ground |
| `compibert-tail-1` | Tail base, sways ±4° |
| `compibert-tail-2` | Mid tail, ±7°, .22 s later |
| `compibert-tail-3` | Tail tip, ±11°, .44 s later |
| `compibert-leg-right` | Far thigh, rotates at the hip |
| `compibert-shin-right` | Far shin and foot, rotates at the knee |
| `compibert-torso` | Upper body lean: sad, angry, dance |
| `compibert-arm-right` | Far arm at the shoulder, negative = up |
| `compibert-neck` | Cursor head turn ±6° |
| `compibert-head` | Nods, tilts, shakes, laughs back |
| `compibert-eye-left` | Eye group: eyeball, pupil, lid, happy arc |
| `compibert-jaw` | Holds the mouth shapes |
| `compibert-brow-left` | Rotates around its centre: angry, sad, curious |
| `compibert-body` | Breathing scale from the belly bottom |
| `compibert-arm-left` | Near arm: waves, pumps, taps the chin |
| `compibert-leg-left` | Near thigh at the hip |
| `compibert-shin-left` | Near shin and foot at the knee |
| `compibert-pupil-left` | translate only, clipped by the eye; cursor follow |
| `compibert-lid-left` | translate only: `y = −(2·ry + 10)·(1 − closed)`, ry = 24 |
| `compibert-mouth-*` | smile, grin, frown, flat, wobble, o, roar; crossfade 0.1 s |
| `compibert-fx-*` | z ×3, tear, anger, sweat, question, dots ×3; hidden at rest |
| `compibert-hat` **[MVP, new]** | hard hat accessory, child of `compibert-head` (moves with it). Art: `assets/baustelle/bauhelm.svg`, placed with `transform="translate(236 6) scale(.95) rotate(-7 80 66)"` in rig units. Shown only when `accessory="hardhat"`. |

Hierarchy (outer → inner): root › torso › neck › head › (eye-left, brow-left, jaw, fx, hat). Legs, shins, arms, tail-1…3, body, shadow hang off root/torso as in `compibert-full.svg`. Profile face: only `-left` eye parts exist („left“ = screen-left/near side).

### State table (event → state)

| Situation | State | Layer | Then |
|---|---|---|---|
| App-Start, nichts los | `idle` | Basis | bleibt |
| Anmeldung, neue Person in der Lobby | `wave` | Reaktion 1, 2.2 s | Basis |
| 20 s keine Eingabe | `look` | Basis | idle bei Eingabe |
| Lobby leer | `sleep` | Basis | wave, sobald jemand kommt |
| Rad dreht | `excited` | Basis | suspense beim Bremsen |
| Rad bremst (letzte 40 %) | `suspense` | Basis | cheer beim Stopp |
| Rad stoppt, Ergebnis | `cheer` | Reaktion 3, 1.6 s | idle |
| Sieg (Spiel oder Event) | `cheer` | Reaktion 3, 4 s | Basis |
| Emote Tränen vor Lachen | `laugh` | Reaktion 2, 2.4 s | Basis |
| Emote Wütend, Veto aufgedeckt | `angry` | Reaktion 2, 2.6 s | Basis |
| Letzter Platz, Niederlage | `sad` | Reaktion 3, 4 s | Basis |
| Siegerehrung | `dance` | Basis | idle am Ende |
| Laden > 400 ms | `think` | Basis | vorherige Basis |
| Verbindung wird wiederhergestellt (2 s) oder verloren | `confused` | Basis, Prio 4 | wave, dann idle |
| App-Start, erster Besuch in 24 h | `run` | Boot, 0.9 s | wave, dann idle |
| Emote Klatschen (eigenes) | `clap` | Reaktion 2, 2 s | Basis |
| Emote Brüllen (eigenes) | `roar` | Reaktion 2, 2.4 s | Basis |
| Siegerehrung: Pokal-Lauf | `run → suspense` | Szene | laugh, dann dance |

### App events the bus accepts

| Event id | Meaning | State | Type | Duration | Prio |
|---|---|---|---|---|---|
| `boot` | App-Start | `run` | react | 1.2 s | 1 |
| `join` | Anmeldung, neue Person | `wave` | react | 2.2 s | 1 |
| `clap` | Emote Klatschen | `clap` | react | 2 s | 2 |
| `roar` | Emote Brüllen | `roar` | react | 2.4 s | 2 |
| `inactive` | 20 s keine Eingabe | `look` | base | — | — |
| `empty` | Lobby leer | `sleep` | base | — | — |
| `spin` | Rad dreht | `excited` | base | — | — |
| `brake` | Rad bremst | `suspense` | base | — | — |
| `reveal` | Rad stoppt | `cheer` | react | 1.6 s | 3 |
| `win` | Sieg | `cheer` | react | 4 s | 3 |
| `lol` | Emote Tränen vor Lachen | `laugh` | react | 2.4 s | 2 |
| `mad` | Emote Wütend, Veto aufgedeckt | `angry` | react | 2.6 s | 2 |
| `lose` | Letzter Platz | `sad` | react | 4 s | 3 |
| `award` | Siegerehrung | `dance` | base | — | — |
| `load` | Laden | `think` | base | — | — |
| `error` | Verbindung verloren | `confused` | base | — | — |
| `ok` | Alles wieder gut | `idle` | base | — | — |

### State timelines (GSAP)

Each state is a looping GSAP timeline on the parts listed. „rnd(a,b)“ = random per cycle.

#### `idle` (Ruhe) · Basis
Trigger: Default, when nothing else is going on. Returns: stays. Stands, breathes, blinks and watches the cursor. Small random actions keep him from looking like a loop.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `head` | micro tilt to rnd(−8, 6), hold .5–1.4 s | .35–.6 s, sine.inOut, yoyo 1, every 2.2–5.5 s |
| `arm-left` | twitch to −22 | .14 s, sine.inOut, yoyo 3 |
| `root` | small hop y −10 | .14 s, power2.out, yoyo 1 |

#### `wave` (Winken) · Reaktion 1
Trigger: Sign-in, a new person joins the lobby. Returns: base after 2.2 s. Arm up, a quick triple wave, head tilted, big grin.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `arm-left` | rotation 0 → −140 | .35 s, back.out(2) |
| `arm-left` | wave −140 ↔ −108 | .17 s, sine.inOut, yoyo 5, repeatDelay .9, ∞ |
| `head` | rotation −6, brow-left y −6 | .4 s, sine.out |
| `jaw` | mouth → grin | .1 s crossfade; tail timeScale 1.8 |

#### `look` (Umschauen) · Basis
Trigger: 20 s without pointer or key input. Returns: idle on any input. Looks behind, up, then forward with a raised brow, like he is checking if anyone is still there.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `pupil-left` | x −max, then (−.6, −1)·max, then (1, −.3)·max, then 0 | .35–.45 s each, power2.inOut, holds .6–.8 s |
| `head` | rotation −4 → −10 → 3 → 0 | .5–.6 s, sine.inOut |
| `brow-left` | y −4 on the forward look | .3 s |
| `timeline` | repeat ∞, repeatDelay .6 | eye-follow paused |

#### `excited` (Mitfiebern) · Basis
Trigger: The wheel is spinning. Returns: suspense when it starts braking. Pumps his arms in turns and bounces along, eyes wide open, tail going wild.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `arm-left, arm-right` | alternate −130 / −60 | .2 s, power2.out, .42 s cycle, ∞ |
| `root` | y 0 → −12 → 0 | .2 s power2.out, .2 s power2.in |
| `head` | rotation −5 ↔ 2 | .2 s |
| `lid, brow` | lids open, brow y −7, mouth grin | tail timeScale 2.6 |

#### `suspense` (Spannung) · Basis
Trigger: The wheel slows down (last 40 % of the spin). Returns: cheer (1.6 s) at the stop. Holds his breath: hands up, mouth a small o, eye fixed on the wheel, trembling, one bead of sweat.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `pupil-left` | fixed x .7·max | .25 s; eye-follow paused |
| `arm-left, arm-right` | rotation −80 / −90 | .4 s, power2.out |
| `root` | tremble x ±1.6 | .05 s, none, yoyo ∞ |
| `fx sweat` | y 0 → 30, opacity 1 → 0 | 1.1 s, power1.in, repeatDelay .4, ∞; breath and tail timeScale .2 |

#### `cheer` (Jubeln) · Reaktion 3
Trigger: Game or Event win; wheel result. Returns: base after 4 s (1.6 s after a wheel stop). Happy eyes, both arms up and jumping with squash on every landing.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `eye-left` | eyeball opacity 0, happy arc 1 | .1 s |
| `arm-left, arm-right` | rotation −150 / −140 | .3 s, back.out(2), stagger .04 |
| `root` | y 0 → −38 → 0, then scaleY .9 scaleX 1.07 | .26 s power2.out, .2 s power2.in, squash .07 yoyo 1; repeatDelay .1, ∞ |
| `shadow` | scale .6, opacity .06 in the air | synced with root |

#### `laugh` (Lachen) · Reaktion 2
Trigger: Emote „Tränen vor Lachen“, funny moments. Returns: base after 2.4 s. Head thrown back, holding his belly, shaking with laughter while tears fly off.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `head` | rotation −12 | .25 s, power2.out |
| `arm-left, arm-right` | rotation 24 / 18 (on the belly) | .25 s |
| `torso, root` | rotation ±5, y −4 | .09 s, sine.inOut, yoyo 7, repeatDelay .35, ∞ |
| `fx tear` | arcs back x −28, y −8 → 28, fades | .9 s, repeatDelay .2, ∞ |

#### `angry` (Wütend) · Reaktion 2
Trigger: Emote „Wütend“, a veto is revealed. Returns: base after 2.6 s. Brow down, fists up, a throbbing anger mark and a short roar every second.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `brow-left` | rotation 16, y 5; lids .3 | .15 s |
| `torso, head` | rotation 6 / 4; arms −48 / −56 | .2–.3 s |
| `fx anger` | scale 1 ↔ 1.2 | .22 s, sine.inOut, yoyo ∞ |
| `roar loop` | mouth → roar, head −10 then shake x ±3 ×9, back to frown | .12 s + .04 s steps, repeatDelay 1.1, ∞ |

#### `sad` (Traurig) · Reaktion 3
Trigger: Last place, defeat. Returns: base after 4 s. Slumps forward, head down, brow up in the middle, a slow tear.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `brow-left` | rotation −14, y −2; lids .38 | .3 s |
| `head, torso` | rotation 12 / 5 | .6 s, sine.inOut |
| `arm-left, arm-right` | rotation 12 (hanging) | .5 s |
| `fx tear` | y 0 → 46, opacity 1 → 0, scale .6 → 1 | 1.3 s, power1.in, repeatDelay .5, ∞; breath and tail .4 |

#### `dance` (Tanzen) · Basis
Trigger: Award ceremony. Returns: idle when the ceremony ends. Two-beat dance at 120 bpm: sway, alternate arms, stepping legs, bounce on every beat. Sync the beat to the fanfare.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `torso, head` | rotation ±8 / ∓6 | .5 s per beat, sine.inOut |
| `arm-left, arm-right` | alternate −150 / −40 | .4 s, back.out(1.6) |
| `leg-left, leg-right` | rotation ±10 / ∓6 | .25 s, sine.inOut |
| `root` | y 0 → −14 → 0 on every beat | .25 s power2.out, .25 s power2.in; 1 s cycle, ∞ |

#### `sleep` (Schläft) · Basis
Trigger: Lobby is empty. Returns: wave when someone joins. Eye closed, head nodded off, slow deep breaths and rising Zs.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `lid-left` | closed (y 0) | .5 s; blink off, eye-follow off |
| `head, torso` | rotation 14 / 4 | .9 s, sine.inOut |
| `jaw` | mouth → o | .2 s; breath and tail timeScale .3 |
| `fx z ×3` | opacity 0 → 1, x 30, y −60, scale .5 → 1.1 | 2 s, sine.out, fade from 1.6 s, stagger .75, ∞ |

#### `think` (Nachdenken) · Basis
Trigger: Loading longer than 400 ms. Returns: previous base when loaded. Looks up, hand on the chin tapping, three thinking dots pop up in turn.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `pupil-left` | x .4·max, y −max; brow y −8, rotation −8 | .35 s, power2.inOut |
| `arm-left` | rotation −100, then tap −100 ↔ −108 | .45 s power2.out; .35 s sine.inOut, yoyo ∞ |
| `head` | rotation −7; mouth flat | .5 s, sine.inOut |
| `fx dots ×3` | scale .4 → 1, all fade after .5 s | .2 s, back.out(2), stagger .3, repeatDelay .3, ∞ |

#### `run` (Rennen) · Szene
Trigger: Boot (3b), Pokal-Lauf (6b), battle replay. Returns: set by the scene. Sprint cycle: legs and shins swing in counter-phase, arms pump against the legs, a bob on every step, body leaning into the run.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `torso, head` | rotation 8 / −8 (lean, head level) | .2 s |
| `leg-left, leg-right` | −42 ↔ 34, counter-phase | .15 s per half step, sine.inOut, ∞ |
| `shin-left, shin-right` | back leg kicks to 40, front −8 | .15 s |
| `arm-left, arm-right; root` | arms 30 ↔ −40 against the legs; root y −9 per step | .075 s yoyo; tail timeScale 3 |

#### `clap` (Klatschen) · Reaktion 2
Trigger: Own emote „Klatschen“, places 2 and 3 in the ceremony. Returns: base after 2 s. Happy eyes, big grin, quick claps with a tiny bounce. In head and emote crops two floating mitts clap under the chin instead.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `arm-left, arm-right` | set to −96 / −70 | .2 s |
| `arm-left, arm-right` | clap: −74 / −92 and back | .09 s power2.in, .11 s power2.out, repeatDelay .04, ∞ |
| `root` | y −3 on each clap | synced |
| `fx mitts (emote crop)` | x ±9, rotation ±10, yellow impact lines | same .2 s cycle |

#### `roar` (Brüllen) · Reaktion 2
Trigger: Own emote „Brüllen“. Returns: base after 2.4 s. Inhales and leans back with a small o, then lunges forward into a full roar with a head shake.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `head, torso` | inhale: −14 / −5, torso scale 1.04, mouth o | .4 s, power2.out |
| `head, torso` | roar: 9 / 6, mouth roar, arms −70 / −78 | .12 s, power3.out |
| `head` | shake x ±2.5 ×22 | .03 s, none |
| `loop` | back to frown, rest, repeat | repeatDelay .7, ∞ |

#### `confused` (Verwirrt) · Basis, Prio 4
Trigger: Connection „wird wiederhergestellt“ (2 s) or lost (15 s); errors. Returns: one wave on reconnect, then idle. Shrugs, tilts his head from side to side, wobbly mouth, a question mark swinging above him.

| Target | Properties | Duration / ease / repeat |
|---|---|---|
| `arm-left, arm-right` | rotation −55 / −65 (shrug) | .3 s, back.out(2) |
| `head` | tilt −12 ↔ 8 | .6 s, sine.inOut, yoyo ∞, repeatDelay .8 |
| `brow-left` | rotation 14, y −6; mouth wobble | .25 s |
| `fx ?` | scale .2 → 1, then rotation ±12 | .35 s back.out(2.4); .6 s sine.inOut yoyo ∞ |


### Transition rules (state machine)
- **Two layers:** a **base** state (long-running: idle, look, excited, suspense, dance, sleep, think, confused) and an optional **reaction** on top (timed: wave, cheer, laugh, angry, sad, clap, roar). The visible state is the reaction if present, else the base.
- **Priority:** Verwirrt 4 > Jubeln / Traurig 3 > Lachen / Wütend / Klatschen / Brüllen 2 > Winken / Rennen 1. A reaction with **equal or higher** priority replaces the running one; lower is dropped.
- **Landing:** if the root is in the air (`y < −3`) when a new state comes, wait for the landing (max 320 ms) before switching.
- **Errors block:** while the base is `confused` (connection lost, errors), all reactions are dropped. On `ok`: one `wave` (2.2 s), then `idle`.
- `sleep` → `wave` when someone joins, then `idle`. `look` → `idle` on any pointer/key input.
- Wheel stop sets base back to `idle` while `cheer` plays.
- **Switching:** kill the previous state timeline, tween all touched parts back to rest over 0.18 s `power2.out`, then start the new timeline. Mouth shapes crossfade 0.1 s.

### Idle behaviour
- **Breathing:** `compibert-body` `scaleY 1→1.035, scaleX 1→.99` (pivot = belly bottom), rnd(1.6, 2.1) s per half cycle per instance, `sine.inOut`, yoyo ∞. Not in head/emote crops.
- **Tail:** tail-1 ±4°, tail-2 ±7° (delay 0.22), tail-3 ±11° (delay 0.44), 1.5 s per half cycle, `sine.inOut`, yoyo ∞; state changes set `timeScale` on all loops over 0.4 s (wave 1.8, excited 2.6, suspense .2, sleep .3, sad .4, run 3).
- **Blinking:** `gsap.delayedCall(rnd(1.6, 5.2))` loop (first after rnd(0.3, 3)): lid `y → 0` 0.07 `power2.in`, back 0.11 `power2.out`; 18 % chance of a second blink (0.06 / 0.1). Off in `sleep`; kept in reduced motion.
- **Eyes follow the cursor:** one global `pointermove` (rAF-throttled) for all instances. Per rig: `d` = distance from eyeball centre to cursor, `k = min(1, d / 220)`; pupil `x = dx/d · k · rx·0.42`, `y = dy/d · k · ry·0.36` via `gsap.quickTo(…, {duration: .4, ease: 'power3'})`; neck `rotation = clamp(dy/d · k · 6, −6, 6)` via quickTo 0.7 `power2`. Paused in look, suspense, sleep, think. Touch: pupils return to centre after 2 s.
- **Idle extras:** every 2.2–5.5 s one random micro action (head tilt, arm twitch, small hop) as in the `idle` table.
- **Inactivity:** 20 s without input → `look`. Lobby empty → `sleep`.
- **Poke (5a):** tap = random reaction (laugh, hop, wave, squash, shrug); 5 taps in 2 s = `angry`. Mouse/touch only; never functional.

### Reduced motion
Same state machine; states become held poses (loops paused at frame 0) with a 0.2 s crossfade; blink stays; boot = fade; ceremony = end frame; emotes pop in place; replay = still frames with „Weiter“.
