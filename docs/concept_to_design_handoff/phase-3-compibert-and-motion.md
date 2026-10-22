# Phase 3 – Compibert, Motion & Big Moments

> **Attachment:** `00-product-brief.md` + the result of phase 2 (design system)
> **Goal:** The mascot as an animatable rig, all signature animations and the big show moments. Everything specified so Claude Code can implement it 1:1 with **GSAP**.

---

## Prompt (copy)

Based on our design system, now design **Compibert** and all **big motion moments** of COMPIES.

Important: we use **no Rive**. Everything is animated with **GSAP** on SVG/DOM. The goal is to get as close as possible to what a Rive file could do.

### 1. Compibert as an animatable rig

Deliver Compibert as an **SVG with a rig of individually named parts**. This is the most important requirement of this phase.

- Every moving part is its own group with a descriptive ID:
  - `compibert-head`, `compibert-jaw`
  - `compibert-eye-left`, `compibert-eye-right`
  - `compibert-lid-left`, `compibert-lid-right`
  - `compibert-pupil-left`, `compibert-pupil-right`
  - `compibert-neck`, `compibert-body`
  - `compibert-arm-left`, `compibert-arm-right`
  - `compibert-leg-left`, `compibert-leg-right`
  - `compibert-tail-1` to `compibert-tail-3` (segmented tail)
  - further parts as needed
- **Document the pivot point** of every part so it rotates from the right place (`transform-origin` / GSAP `svgOrigin` values).
- Sensible layer order, fixed `viewBox`, no embedded bitmaps.
- **Variants:**
  - full body
  - bust
  - **head only** (for small sizes, e.g. loading indicator)

### 2. States

For each state, provide:
- a short description
- a **timeline spec** (parts, keyframes, duration, easing, repeat)
- an **interactive prototype**

| State | Trigger in the app |
|---|---|
| idle | default |
| waving | greeting, sign-in, new person in the lobby |
| looking around | longer inactivity |
| rooting / excited | the wheel is spinning |
| suspense | the wheel is slowing down |
| cheering | game or session win |
| laughing | "tears of joy" emote, funny moments |
| angry | "angry" emote, veto revealed |
| sad | last place, defeat |
| dancing | award ceremony |
| sleeping | empty lobby |
| thinking | loading |
| confused | error, connection lost |

**Transitions:** blend between states, never hard-cut. Specify the transition rules, e.g. what happens when "sad" is triggered in the middle of "cheering".

**Liveliness, like Rive:**
- random blinking
- subtle breathing
- **eyes follow the mouse cursor**
- small random variations, so nothing looks like an obvious loop

Also deliver a **state table** (event → state → returns to …) as a template for a state machine in the app.

### 3. Compibert assets

- **Coin:** front shows **Compibert's funny head** ("Kopf"), back shows **Compibert's tail / rear end** ("Schwanz"). Two SVGs plus the rim.
- **4 emotes** as illustrations in Compibert's style:
  1. Clapping
  2. Tears of joy
  3. Angry
  4. Compibert Roar
  - Each with a short animation: rising above the avatar, a small motion of its own, fading out.
- **App icon and PWA icons** featuring Compibert, plus a **favicon**

### 4. Signature moments

Specify every moment as a storyboard plus timeline (duration, easing, stagger, sound cue), with an interactive prototype where possible. For every moment, include a reduced-motion variant.

1. **Boot animation** on app start, like a console booting up, but in our style.
   - Reference: https://recent.design/i/8sy6r7f-asmr-portfolio-interactions
   - Short (2–3 s), skippable, not on every page change.
2. **Smoke background**: alive, but subtle and satisfying.
   - Reference: https://curated.design/sites/s/76446/
3. **General interaction style** (hover, click, pick up, drop).
   - Reference: https://recent.design/i/gzkgota-david-heckhoff
4. **Drag and drop on the game board**:
   - picking up an avatar
   - the target zone reacting
   - snapping in
   - rejected: bounces back when someone else was faster
   - on mobile: via long press
5. **Lucky wheel**:
   - wind-up, spin, slow-down with suspense and ticking
   - stop and reveal
   - hidden mode: the placeholder or made-up name **transforms** into the real name
   - the played slice leaves the wheel and the remaining slices redistribute
6. **Veto window**:
   - 60-second countdown, of which 30 seconds are the clip
   - the clip closes automatically
   - confirming your own veto (hold the button)
   - **dramatic simultaneous reveal** of all vetoes at the end
7. **Coin flip** (Pick & Ban): a 3D flip with CSS 3D and GSAP, no 3D engine. Toss, spin, land, result.
8. **Pick & ban sequence**:
   - whose turn it is
   - ban animation (the game gets struck out or flies out)
   - pick animation (the game moves into the play order)
9. **Leaderboard update** after each game:
   - rows swap places (FLIP technique)
   - points count up
   - a **mini celebration** for the game's winner
10. **Tiebreaker announcement**: tie, suspense, its own wheel.
11. **Award ceremony**:
    - podium and confetti
    - Compibert dancing
    - team name and avatars shown large
    - fanfare
    - Optionally a 3D podium (TresJS/Three.js, only here, lazy-loaded). Deliver a 2D variant as the default.
12. **Share image**:
    - layouts for 1200 × 630 (Discord/Open Graph) and square
    - final standings, teams/players, Compibert
    - must be buildable as static HTML/CSS with Satori: **flexbox only, no complex effects**
13. **Battle replay** **[1.0 – last ticket]**:
    - storyboard for a 30–60 second in-app animation
    - the parties battle each other; after every game you see who stood where
    - game cut-ins and random, generic gaming references in between
    - at the end, the winner comes out on top
    - must be buildable **purely with GSAP in the browser** (no video rendering)

### 5. Sound cues

Create a list of all moments with sound: moment → character of the sound → length → relative volume. This is the template for finding or creating the sounds. Globally mutable.
