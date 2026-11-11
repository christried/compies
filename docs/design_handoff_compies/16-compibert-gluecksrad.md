# 16 Compibert am Glücksrad

Where Compibert stands beside the LuckyWheel during a spin, how he enters and leaves, and his poses. Ref: `Compibert am Glücksrad.dc.html` (option **1b „Hinterm Rad“**, recommended), `WheelStage.dc.html` (frame used for every picture), `GameWheel` skin `show`, `CompibertRig`.

**New tokens: none. New rig state: none.** `excited` already exists in the reference rig (`STATES.excited` in `reference/compibert-options.js`, documented in 04-motion § `excited` „Mitfiebern“). The Vue port only has to ship it; it must not be replaced by another state.

---

## Additions to 02-components.md

## LuckyWheelMascot
**Scope:** [1.0] · **Ref:** Compibert am Glücksrad 1b, WheelStage

Compibert (bust) peeking out from **behind** the wheel at its upper right during a spin. Child of the LuckyWheel card, not of the wheel SVG.

- **Props / variants:** `width: 'md' | 'sm'` (from the LuckyWheel breakpoint, not from the viewport directly), `spin?: {startAt, durationMs, hidden}` (same object the wheel gets), `reduced: boolean` (from `reduced()`)
- **States:** absent (wheel at rest, default) · entering · `excited` · `suspense` · `cheer` (1.6 s) · `idle` (hold until removal) · leaving · absent
- **Slots:** —
- **Placement (all values relative to the wheel square, origin top-left; wheel size never changes):**

| Width | Wheel | Variant / size | Box left · top | Layer |
|---|---|---|---|---|
| md and up (stage left of the side panel, e.g. 1440) | 420 | `bust` 232 | 300 · 18 (box 300–532 × 18–250) | under the wheel |
| below md (card full width, e.g. 390 → wheel 332) | ≤ 340 | `bust` 150 | W − 142 · −20 (box W−142 … W+8 × −20 … 130) | under the wheel |

  - Stacking inside the wheel's positioned wrapper (`isolation: isolate`): mascot `z-index: 0`, wheel (SVG, flapper, hub) `z-index: 1`. No layer token needed; the mascot never leaves the card's stacking context.
  - Because he is behind the wheel disc, band, bulbs, pins, flapper and every slice label are always painted over him: nothing on the wheel can be covered, at any slice count (proved at 2 and 30 slices).
  - He stays right of the flapper: box left edge ≥ W/2 + 24 px at both widths (flapper is 44 px wide, centred).
  - He never reaches below the wheel's horizontal centre line, so the result card „Das Rad sagt“ (under the wheel) is never touched.
  - At sm the box may overhang the wheel square by ≤ 8 px into the card padding (14 px); it must not cross the card border. If the card padding ever drops below 10 px, move the box left by the difference.
  - He faces screen-left (the rig's profile), so he always looks at the wheel; never mirror him.
- **Desktop / mobile:** Same idea at both widths; only the bust size changes (232 / 150). No layout space is reserved; the card height does not change when he appears.
- **Outline:** as the rig documents it for `bust`: light = hard shadow (filter `hrd`, 7/8 px ink), dark = sticker (cream rim + shadow, filter `stk`). The wheel keeps its colours in both appearances; the outline is what separates him from the dark card.
- **Accessibility:** `aria-hidden="true"`, `pointer-events: none`, never focusable. Adds nothing to the wheel's live region. No sound of his own (the wheel's cues stay as they are), no speech bubble, no text.
- **Rest:** absent. The header head-logo is already the calm presence on the page; Compibert at the wheel is a moment, so the entrance means „it's happening“. Do not show him in `idle` while the wheel rests.
- **Veto:** he is gone before the veto window opens (he leaves with the slice). No `angry` here.
- **Motion:** see below.

Rejected options (documented in the ref file, not to be built): **1a „Eigener Platz“** (full body 190 in its own slot right of the wheel at md; bust 92 in a reserved 70 px slot in the card header at sm) and **1c „Eckplatz“** (head 92 / 56, in front of the wheel at its top-right corner, no outline).

---

## Additions to 04-motion.md

Replaces the Compibert parts of § Lucky Wheel and the wheel line in § Compibert moment slots (4a). All times are on the wheel's spin timeline (time 0 = server `startAt`, `D` = `durationMs / 1000`, 6–10 s), so they run toward the same server times on every device via `playAt`. Brake = `0.6·D`. Stop = `D`. Removal = `D + 2.2` (hidden wheel: `D + 2.8`). Max one full-body Compibert animating at a time still holds: this is a bust.

### Lucky Wheel · Compibert [1.0]
Target: `.wheel-mascot` (the positioned box) and its rig. Bus events stay as listed (`spin`, `brake`, `reveal`); the timeline below only adds the path in and out.

| Time | What | Values |
|---|---|---|
| `spin` @0 | → `excited`; enter along the radius from behind the rim | `x −130→0, y 100→0` (sm: `x −100→0, y 80→0`), 0.45, `back.out(1.8)`; `opacity 0→1` over the first 0.14 (`dur-fast`), `ease-out` |
| `brake` @0.6·D | → `suspense` | state crossfade 0.25 (rig `restTo`) |
| `stop` @D | → `cheer`, 1.6 s (react, prio 3) | open wheel: at the stop. **Hidden wheel: hold `suspense` until `reveal` @D+0.5, then `cheer`** (the name is only known then) |
| @D+1.6 (hidden D+2.1) | → `idle` | rig default |
| `remove` @D+2.2 (hidden D+2.8) | leave the way he came, with the slice | `x 0→−130, y 0→100` (sm: −100 / 80), 0.4, `power2.in`; `opacity 1→0` over the last 0.14 (`dur-fast`) |
| after leaving | unmount the rig | — |

- Start offset is chosen so the bust is completely behind the wheel disc at time 0 (no clip mask needed). The opacity ramp hides the last few pixels at the rim.
- Late joiners (`playAt` seeks in): if they land after 0.45 he is simply there in the current state; after removal + 0.4 he is not mounted.
- Tab hidden then visible: re-run `playAt`; the rig gets the state that belongs to the current time (excited < brake ≤ suspense < stop ≤ cheer < stop+1.6 ≤ idle < removal).
- `back.out(1.8)` and `power2.in` are the values already used in § Compibert moment slots (4a). `dur-fast` = 140 ms. No new tokens.

### Reduced
- No travel (no x/y), no overshoot. He appears in place with `opacity 0→1`, 0.22 (`dur-base`, `ease-out`) **at the same server time as full motion (@0)**, as a still pose (`still`: loops paused, rig `restTo` 0.2).
- State changes at brake and stop are crossfades of the still pose (0.2). At the stop he shows the still `cheer` frame (arms up, happy eyes, grin, on the ground).
- At removal: `opacity 1→0`, 0.22 (`dur-base`, `ease-in`), then unmount.
- The reduced wheel spins only in the last 1.2 s before stopAt; Compibert still follows the server times above, so he is visible (still `excited`, then `suspense`) while the status line says „Das Rad dreht …“.

### Checks
- Wheel 420 / ≤ 340 never changes size during a spin; the card height does not change when he appears or leaves.
- Nothing he does covers a slice label, the flapper or the result card (he is behind the wheel and above its centre line).
- Light: hard shadow · dark: sticker outline, switching with the appearance.
