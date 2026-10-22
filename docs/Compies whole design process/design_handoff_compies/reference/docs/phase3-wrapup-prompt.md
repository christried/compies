# Handoff prompt: Phase 3 wrap-up (3 open items)

Copy everything below the line into a new session in this project.

---

We are finishing **Phase 3 (Compibert, Motion & Big Moments)** of COMPIES. Almost everything is done; three items from the phase brief are still open. Do them in this order, in one go, then flag me when done or if you hit a real question.

## Context: read these first (don't re-derive)
- `uploads/00-product-brief.md`: product brief (German party-game night app, Memphis style, mascot Compibert = cheeky Compsognathus).
- `Spec Changes.md`: every decision so far, incl. the Compibert section (direction **2b „Flitzer Großkopf“**, outline rules, all moment decisions 3b / 4a / 5a / 6b / 7a / 8a / 9a).
- `docs/compibert-handoff.md`: dev handoff for Compibert: files, crops, viewBoxes, performance, Satori notes.
- `docs/handoff.md`: design-system handoff (tokens, components, rules).
- `tokens/compies-tokens.css`: all colours. Team colours `--cp-team-1…8` (hex: 1 #e4572e, 2 #f0a202, 3 #f3e04a, 4 #56b4e9, 5 #009e73, 6 #0072b2, 7 #cc79a7, 8 #3d2d8f). Brand: primary #ffd23f, ink #151515, paper #fff3df, surface #fffdf8, pink #ff70c3, mint #2ec4b6, cobalt #3a86ff.
- **Rig source of truth:** `compibert-options.js` (builder `CBO.build('F2', view, uid)` returns the SVG string; `CBO.mount`, `CBO.toState`, states incl. clap/laugh/angry/roar/dance/cheer). Variants/viewBoxes for F2: full `0 36 404 344`, bust `150 36 254 254`, head `212 40 192 192`, emote `172 -4 270 270`, tail `2 157 196 196`.
- **Existing exports:** `assets/compibert/compibert-{full,bust,head}.svg` (made by running `CBO.build` in `run_script` and replacing `var(--cb-x)` with `var(--cb-x, <hex>)` fallbacks; Minze colourway: body #2ec4b6, body2 #1d9a8e, belly #ffd23f, spike #ff70c3, cheek #ff70c3, ink #151515). Reuse that exact approach.
- **Components:** `CompibertRig.dc.html` (props `variant head|bust|full|emote|tail`, `size`, `state`, `still`), `Coin3D.dc.html` (coin faces inline), `AwardCeremony.dc.html` (6b trophy run), `Compibert Momente.dc.html` (build specs page, sections 01–05), `DS Smoke.dc.html` (11 smoke screens; s10 = ceremony).
- Look and feel: thick ink outlines (2.5–3 px), hard offset shadows, flat Memphis colours, dotted paper texture. Light mode = hard shadow, dark mode = sticker (cream rim). No gradients except the sunburst, no emoji.

## Task 1: App icon, PWA icons, favicon
Brief: *„App icon and PWA icons featuring Compibert, plus a favicon.“*
1. Design 2–3 icon options first (e.g. head on yellow disc à la coin „Kopf“; head peeking from a rounded-square tile; full-body on a sunburst). Show them side by side at 512, 192, 48, 32, 16 px on light and dark backgrounds, next to a fake Android home screen, iOS home screen and a browser tab. Let me pick with a file-options / options section before finalising.
2. After the pick, export:
   - `assets/icons/icon-512.png`, `icon-192.png` (`purpose: any`)
   - `assets/icons/icon-maskable-512.png` (content inside the 80 % safe circle, full-bleed background)
   - `assets/icons/apple-touch-icon.png` 180 × 180 (no transparency)
   - `assets/icons/favicon.svg` (simplified head: at 16 px drop the fang, cheek and nostril; keep eye, brow, smirk, crest) + `favicon-32.png`, `favicon-16.png`
   - `assets/icons/monochrome.svg` (single-colour silhouette for Android themed icons)
   - a `manifest.webmanifest` snippet (name „COMPIES“, short_name, theme_color, background_color, icons) and the `<link>` tags for Nuxt `app.head`.
   PNGs: render the SVG to canvas in `run_script` and `saveFile` the canvas.
3. Add a small „Icons“ section to `Compibert Momente.dc.html` and list the files in `docs/compibert-handoff.md`.

## Task 2: Coin faces + rim, and the 4 emotes as standalone SVG files
Brief: *„Coin: front shows Compibert's funny head (Kopf), back his tail (Schwanz). Two SVGs plus the rim.“* and *„4 emotes as illustrations in Compibert's style“*.
1. **Coin**, from what's already in `Coin3D.dc.html` (read the inline markup; don't redesign):
   - `assets/coin/coin-kopf.svg`: yellow #ffd23f disc, 5 px ink border, cream inner ring + ink ring (as the inset box-shadows), Compibert head (`CBO.build('F2','head',…)` content, clipped to a circle).
   - `assets/coin/coin-schwanz.svg`: cobalt #3a86ff disc, same rings, the striped curled tail path from Coin3D.
   - `assets/coin/coin-rim.svg`: the edge strip (the stacked edge colours used for the 3D thickness) as a horizontal tileable strip + a note on how Coin3D stacks it.
   All 140 × 140 viewBox (rim: its own), no filters, no bitmaps.
2. **Emotes**, static key poses from the rig in the `emote` crop inside the round sticker (surface #fffdf8 disc, 3 px ink border, hard 4 px shadow drawn as an offset ink circle, not a filter):
   - `assets/emotes/emote-klatschen.svg` (state `clap`, mitts visible), `emote-freudentraenen.svg` (`laugh`, with the tear), `emote-wuetend.svg` (`angry`, anger mark), `emote-bruellen.svg` (`roar`, mouth open).
   - Pose them by mounting the rig in a hidden div in the preview, calling `CBO.toState`, waiting for the pose to settle, then serialising the SVG with the GSAP transforms baked in, or by setting the key-pose transforms manually from the state timelines in `compibert-options.js`. Must be static and Satori/`<img>`-safe.
3. Show all 7 files in a new „Assets“ section of `Compibert Momente.dc.html` (at 96 / 56 / 32 px) and list them in `docs/compibert-handoff.md`.

## Task 3: Award ceremony: winning team's avatars shown large
Brief: *„team name and avatars shown large“*. Our 6b „Pokal-Lauf“ (`AwardCeremony.dc.html`) shows the winner card (name, points, SIEGER stamp) but no avatars.
1. Add the winning party's members as large `Avatar`s (use the existing `Avatar.dc.html`, size 80; 64 on mobile) in a row under the flipped winner card. They pop in one by one (stagger 0.08 s, `back.out(2)`) right after the stamp, before Compibert switches to `dance`. Max 6 shown, more → „+N“. Free-for-all: the single winner's avatar at 120 px instead.
2. New prop `members: [{who, host?}]` (default: 3 sample names from the smoke test's team 1). Pass real members from `DS Smoke.dc.html` s10.
3. Keep everything else in 6b unchanged (trip/bonk gag variants, skip, share buttons, reduced motion = end frame shown at once, avatars included).
4. Update `Compibert Momente.dc.html` section 04 (Ablauf list) and `Spec Changes.md`.

## Ground rules
- Follow the project's existing visual vocabulary exactly; don't restyle anything outside these three tasks.
- Design Components only (`.dc.html`), inline styles, flex/grid with gap.
- Pages with many live rigs make the preview screenshot tool time out; check one section at a time (e.g. a `?only=` param like `Compibert Momente` already has).
- When done: verify, update `docs/compibert-handoff.md` (files table) and `Spec Changes.md`, then tell me Phase 3 is complete.
