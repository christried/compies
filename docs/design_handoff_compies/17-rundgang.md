# 17 Rundgang (Event-Seite)

The first-visit tour of the Event page: 8 steps, one thing at a time. The page goes dark except the thing, a bubble explains it in one or two sentences, and Compibert's face sits on the bubble. The person only looks and clicks „Weiter“. Ref: `Rundgang.dc.html` (recommended **B „Bewegt“**), `RundgangStage.dc.html` (frame and placement logic used for every picture), `RundgangFace.dc.html` (the face), `CompibertRig`, 11-event-seite, 15-header-eventseite.

**New tokens: none. New rig state: none.** Bubble = popover look (border `--cp-bw` `line`, radius 18, `shadow-modal`), dark = `--cp-overlay` (the sheet/dialog scrim), ring = `--cp-primary`, layer = `--cp-z-modal`. Motion uses existing durations and eases only.

Rejected (shown in the ref file, not to be built): **A „Still“** (three held faces, no blink). Edge variants „glow“ and „nothing“. A pointing hand was tried for B and dropped: face and expressions only; the tail does the pointing.

---

## Steps

| # | Key | Thing (`data-tour`) | Anchor (tail aims at) | Face |
|---|---|---|---|---|
| 1 | `hallo` | — (page dark, bubble centred) | — | Hallo |
| 2 | `head` | EventPageHead (kicker + h1, shrink-wrapped) | centre | Zeigt |
| 3 | `poll` | slot grid incl. its h2 · < 600: first PollSlotCard | Ja/Meh/Nein group of the first card | Zeigt |
| 4 | `board` | GameBoard | the user's own avatar („Du“) on the Tribüne | Zeigt |
| 5 | `how` | HowWePlayCard | centre | Zeigt |
| 6 | `feed` | SidePanel · < 600: TabBar item „Aktivität“ | panel tab „Aktivität“ · item centre | Zeigt |
| 7 | `ton` | SoundToggle (the 40 px circle, not the 44 hit area) | centre | Zeigt |
| 8 | `ende` | — (page dark, bubble centred) | — | Freut sich |

- A step whose thing is not on the page (e.g. no open poll) is skipped and the count shrinks („3 von 7“). Steps 1 and 8 always exist.
- Rule for choosing a thing: the smallest element the sentence is about. If it is taller than the window on a phone, pick a child (poll → first card).
- Shown once per account on the first Event page visit (`tour.event.done` on the user, not the device). Restart: Profil → „Rundgang starten“. It never starts while a sheet, dialog, ConnectionBanner „lost“ or a synced moment (wheel, veto, ceremony) is on screen; it waits.

---

## Additions to 02-components.md

## EventTour
**Scope:** [1.4] · **Ref:** Rundgang (live demo in section 3)

Controller. Owns the step list, measures, scrolls, places and animates `TourSpotlight` + `TourBubble`.

- **Props / variants:** `steps: {key, target: string, targetNarrow?: string, anchor?: string, title, body, expr: 'hallo'|'zeigt'|'freut'}[]`, `open`, `startAt = 0`
- **States:** idle · entering · step n · changing (n → m) · ending · done
- **Emits:** `done({skipped: boolean, at: n})`
- **Behaviour:** scroll lock on the stage while open (only the tour scrolls it); the page (stage, header, panel, tab bar) gets `inert`. Window resize / orientation change: re-measure, re-place without animation. Header logo Compibert pauses its idle while the tour is open (one hero at a time).
- **Keyboard:** focus moves to the bubble's „Weiter“ on every step; Tab cycles inside the bubble; `Esc` = Überspringen; `→` Weiter, `←` Zurück.
- **Accessibility:** live region (polite) announces „Rundgang, Schritt 3 von 8: Terminumfrage“ on each step. The thing gets `aria-describedby` → bubble body while it is spotted.

## TourSpotlight
**Scope:** [1.4] · **Ref:** Rundgang § Placement

One absolutely positioned element in a fixed full-window layer (`layer-modal`). It IS the hole; its shadow is the dark.

- **Props:** `rect: {x, y, w, h} | null`, `radius`, `ring = true`
- **Visual:** `box-shadow: 0 0 0 max(100vw,100vh)*2 var(--cp-overlay)` (light rgba(21,21,21,.48), dark rgba(8,5,12,.66)). Ring: `outline: 3px solid var(--cp-primary); outline-offset: 0` (follows the radius). No glow.
- **Geometry:** hole = thing + padding on every side: **8 px ≥ 600, 6 px < 600.** Radius = the thing's own radius + the padding (card 14 → 22, so the curves stay concentric). Round things (radius ≥ half the short side) → circle. Square things → radius = padding.
  - Edge touching the sticky header (side panel): no padding on that side, flush.
  - Edge at the window edge (side panel right/bottom): runs past the window.
  - Thing inside the stage partly under the header or the tab bar: the hole is clipped to the stage box, so the ring is open where the thing goes on.
- **States:** closed (`rect: null` → 2 × 2 px at the bubble's centre, ring 0: whole page dark) · open · moving
- **Accessibility:** `aria-hidden`, `pointer-events: none`. A transparent shield in the same layer takes all clicks outside the bubble (they do nothing).

## TourBubble
**Scope:** [1.4] · **Ref:** Rundgang § 1, 2, 6

- **Props:** `title`, `body`, `step`, `total`, `side: 'top'|'bottom'|'left'|'right'|'none'` (= edge the tail sits on), `tail: number` (px along that edge), `expr`, `lookAt: {x, y}`
- **Size:** width **400 px ≥ 600**, **100vw − 24 px < 600** (390 → 366). Height = content. Never narrower for short copy (buttons stay put).
- **Box:** `surface`, border `--cp-bw` solid `line`, radius 18. Padding 18 20 18 (≥ 600) · 16 (< 600).
- **Shadow:** the `shadow-modal` values, but as `filter: drop-shadow(10px 10px 0 C)` on the box + tail group so the tail casts it too. C = `--cp-shadow-ink` (light) / `--cp-hot` (dark) — exactly the two `shadow-modal` colours. No new token.
- **Tail:** a square, 20 px (≥ 600) / 16 px (< 600), rotated 45°, `surface` fill, border `--cp-bw` on its two outer sides, tip radius 3. Centre on the border's centre line, so it covers the box border where it sits. Position along the edge: clamped to ≥ 18 + 0.7·size from the corners; on the top edge also ≥ 92 / 70 px from the left (face corner); on the left edge below the face.
- **Content:**
  - Row 1: title (display, `text-h3`: 23 px at 1440, 20 px at 390, lh 1.05, balance), starts right of the face (92 / 70 px from the bubble's left edge); step count right („3 von 8“, 13/700 `ink-2`, tabular, `aria-label="Schritt 3 von 8"`). Min height 34 / 30 so the face's chin clears the body.
  - Row 2: body, 16 / 15 px, lh 1.45, pretty, max 2 sentences (≈ 240 characters tested at 390).
  - Row 3 (margin-top 16): „Überspringen“ ghost (44 high, `ink-2`, underline 2 px `line-soft`, pulled 8 px left) · spacer · „Zurück“ AppButton secondary md · „Weiter“ AppButton primary md. Step 1: no „Zurück“. Step 8: no „Überspringen“, primary reads „Fertig“.
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` title, `aria-describedby` body. Face `aria-hidden`.

## TourFace (Compibert at the bubble)
**Scope:** [1.4] · **Ref:** Rundgang § 4, RundgangFace

- **Crop:** `variant="head"` (viewBox `212 40 192 192`, the header logo's crop). Never body, never bust.
- **Size / position (relative to the bubble's outer top-left):** **72 px at 14 / −20 (≥ 600)**, **56 px at 8 / −16 (< 600)**. In front of the border, like a sticker on the corner. svg `overflow: visible` (the end hop and the dark rim must not be cut).
- **Face only.** No hand, no mitt, no body.
- **Direction:** rig profile, faces right (into the bubble, toward „Weiter“). Never mirrored. Pupils turn toward the anchor: `x = cos a · rx·.42`, `y = sin a · ry·.36`, neck `sin a · 6°` (a = angle from face centre to anchor) — the existing eye-follow math with a fixed point.
- **Outline:** light none (rig rule for head); dark the rig's `Sticker` treatment (cream rim + offset shadow), otherwise his ink line disappears on `surface` dark.
- **Expressions (existing states on the head crop):**
  - **Hallo** (step 1): `wave` → grin, brow −6, head −6°. Pupils centre.
  - **Zeigt** (steps 2–7): `idle` with idle micro-actions OFF, pupils at the anchor.
  - **Freut sich** (step 8): `cheer` → happy eyes, grin; the hop loop is stopped after 1.15 s (2 hops) and lands (`y → 0`, 0.2 `power2.in`).

### What it needs from the rig
- `lookAt(point)`: call the existing `track()` math with a fixed point; disable cursor follow for this instance (`noFollow`-like flag).
- `idle` without micro-actions (flag), and a way to end `cheer`'s hop loop after n hops.
- One one-shot timeline: `nod` (values in 04 below). No new part, no new state in the state table, no bus event.

---

## Placement rules (per width)

Constants: ≥ 600 → padding 8, gap hole→bubble 24, window margin 24, tail 20, face 72. < 600 → padding 6, gap 20, margin 12 (+ 18 safe area at the bottom), tail 16, face 56. Usable for the bubble: header bottom + margin … window bottom − margin (on phones the bubble may cover the tab bar; it is dark and inert).

1. **No thing** (1, 8): hole closed, bubble centred horizontally, top at 46 % of (window − bubble).
2. **Scroll:** if the thing is in the stage, scroll its top to header + 24 (< 600: + 16), clamped to the page. Header, side panel, tab bar never scroll.
3. **Below** if it fits → tail on top. (Ton in the header always lands here.)
4. **Above** if it fits → tail at the bottom. (The phone's tab bar lands here.)
5. **Beside** (≥ 600 only) if left or right has bubble + gap + margin → the side with more room; tail on the facing edge at the anchor's height; bubble top = anchor − 40, clamped. (Side panel at 1440 lands here, left.)
6. **No room / taller than the window:** bubble docks at the window bottom over the thing, tail up at the anchor; the stage scrolls further until the anchor sits gap + 24 above the bubble; the hole is clipped by header / window (ring open there). (Spielbrett at 390 lands here.)
- **Horizontal:** bubble centred on the anchor, clamped to the margins (< 600: always 12 px). If the anchor would fall into the face corner on the top edge, shift the bubble left.
- **Anchor default:** centre of the thing; things taller than half the usable height without an anchor: 48 px below their top.
- **Measure:** bubble height is measured offscreen for each step before placing (same width, same content).

---

## Additions to 04-motion.md

### Rundgang [1.4]
All GSAP, eases = token beziers (`EASE.*`). Targets: `.tour-layer` (scrim + hole + shield), `.tour-hole`, `.tour-bubble`, stage scroller.

| Moment | Values |
|---|---|
| Start | layer `opacity 0→1`, 0.22 (`dur-base`) `EASE.out`; bubble `scale .96→1, opacity 0→1`, 0.22 `EASE.out`, delay 0.06 (the Modal enter) |
| Step change @0 | bubble out: `opacity 1→0, scale .98`, 0.14 (`dur-fast`) `EASE.in` |
| @0 | hole `left/top/width/height/borderRadius` → next, 0.36 (`dur-slow`) `EASE.io`; stage scroll → next, same 0.36 `EASE.io` in the same timeline (they land together) |
| @0.15 | swap bubble content + position (hidden) |
| @0.30 | bubble in: `opacity 0→1`, from 8 px on the tail side (toward the thing) → 0, 0.22 `EASE.out`. Total 0.52 s |
| no thing → thing | hole opens from the thing's centre (2 px → rect), 0.36 `EASE.out`, ring 0 → 3 |
| thing → no thing | hole closes into its centre, 0.22 `EASE.in`, ring 3 → 0; bubble in with `scale .96→1` |
| End (Fertig / Überspringen / Esc) | bubble `opacity →0, scale .96`, 0.14 `EASE.in`; layer `opacity →0`, 0.22 `EASE.in`, +0.06; then the header avatar ticks once: `scale 1→1.14→1`, 0.22 (`animate-tick`), pointing at „Profil“ where the tour lives |

Compibert (B), started at bubble-in:
- pupils glide to the new anchor: existing `quickTo`, 0.4 `power3`.
- `nod` (Zeigt): head `rotation 0→7` 0.18 `power2.out`, `→0` 0.24 `sine.inOut`.
- Freut sich: `cheer` hop loop stopped after 1.15 s (two hops), root lands `y → 0`, 0.2 `power2.in`.
- Blink: rig loop, unchanged. Nothing else loops.

### Reduced
- Start / end: opacity only, 0.14 (`dur-fast`), no scale, no avatar tick.
- Step change: hole and scroll **cut** at 0 (no glide, no smooth scroll); bubble content and position swap at 0 and the bubble fades in `opacity 0→1`, 0.14 linear. Nothing slides.
- Compibert: rig `still` (held poses, 0.2 crossfade on change), blink kept, pupils set instantly, no nod, no hop.

---

## Copy (de, placeholder, reviewed separately)
```
tour.count               {n} von {total}
tour.count_a11y          Schritt {n} von {total}
tour.next                Weiter
tour.back                Zurück
tour.skip                Überspringen
tour.done                Fertig
tour.hallo.title         Neu hier?
tour.hallo.body          Hallo! Ich zeig dir kurz, wie das hier läuft.
tour.head.title          Das Event
tour.head.body           Hier steht, worum es geht und wann es losgeht.
tour.poll.title          Terminumfrage
tour.poll.body           Stimm für jeden Termin ab: Ja, Meh oder Nein.
tour.board.title         Spielbrett
tour.board.body          Du sitzt erst mal auf der Tribüne. Sobald der Termin steht, suchst du dir ein Team aus.
tour.how.title           So wird gespielt
tour.how.body            Hier siehst du, wie gespielt wird und was es mit den Vetos auf sich hat.
tour.feed.title          Aktivität
tour.feed.body           Hier siehst du, was im Event passiert.
tour.ton.title           Ton
tour.ton.body            Hier schaltest du den Ton an oder aus.
tour.ende.title          Viel Spaß!
tour.ende.body           Das war’s. Den Rundgang findest du jederzeit in deinem Profil.
tour.live                Rundgang, Schritt {n} von {total}: {title}
profile.tour.restart     Rundgang starten
```
Titles are mine (the thing's UI label, so the bubble names what the ring shows). Compibert is never named; he speaks in the first person.

## Checks
- Every frame in the ref: nothing the bubble needs (buttons, text) is ever under the face or the tail; tail never in the face corner.
- 390, longest copy (2 × ~120 characters) and shortest (38) both fit with the same width; the placement uses the measured height.
- Light and dark: ring Sonne on both scrims; bubble border `line`; hard shadow ink (light) / hot (dark); face rim only in dark.
