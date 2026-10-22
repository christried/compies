# 01 Tokens

Files: `tokens/compies-tokens.css` (all CSS variables, framework-agnostic) and `tokens/compies-theme.css` (Tailwind v4 `@theme`, imports Tailwind + tokens). Copy both into `assets/css/` and import the theme once:

```css
/* assets/css/main.css */
@import "./compies-theme.css";
```
```html
<html lang="de" data-theme="light|dark" data-motion="full|reduced">
```
- **Mode:** first visit follows `prefers-color-scheme`, then the user's choice (Hell / Dunkel / System) from settings. Persist in a cookie so SSR renders the right theme (`@nuxtjs/color-mode` with `dataValue: 'theme'`).
- **Motion:** `data-motion="reduced"` from the in-app toggle; the OS setting is covered by `@media (prefers-reduced-motion)` inside the token file. JS reads `getComputedStyle(document.documentElement).getPropertyValue('--cp-motion')` → `full | reduced`. Tailwind variant: `reduced:`.
- **Fonts** (self-host in production): Lilita One 400 (display + timers), Bricolage Grotesque 400–800 with optical sizing (UI), Bungee 400 (scores), JetBrains Mono 500/700 (codes, links).

## Colour (light / dark)

| Token | Utility | Light | Dark | Use |
|---|---|---|---|---|
| `--cp-paper` | `bg-paper` | #fff3df | #17121d | app background (+ `tex-paper` dot texture) |
| `--cp-paper-2` | `bg-paper-2` | #fbe9cc | #120e17 | wells, empty slots, construction zones |
| `--cp-surface` | `bg-surface` | #fffdf8 | #221b2b | cards, panels |
| `--cp-surface-2` | `bg-surface-2` | #fff9ef | #2d2438 | nested, hover |
| `--cp-ink` | `text-ink` | #151515 | #f7efe1 | text, lines |
| `--cp-ink-2` | `text-ink-2` | #5d5650 | #b9ad9f | secondary text (≥ 6.4:1) |
| `--cp-ink-3` | `text-ink-3` | #8f857a | #75697f | disabled only, never for reading |
| `--cp-line` / `--cp-line-soft` | `border-line` | #151515 / 16 % | #f7efe1 / 18 % | Memphis outline / dividers |
| `--cp-primary` + `--cp-on-primary` | `bg-primary text-on-primary` | #ffd23f / #151515 | #ffd23f / #17121d | the one primary action |
| `--cp-hot` + `--cp-on-hot` | `bg-hot` | #ff4f4f | #ff5a36 | danger, veto, live, active tab bar |
| `--cp-mint` `--cp-pop` `--cp-cobalt` | | #2ec4b6 #ff70c3 #3a86ff | #3fd6c6 #ff7fc0 #6b93ff | decor, wheel slices, Compibert only |
| `--cp-focus` | | #1f5fe0 | #8fb3ff | focus ring |
| success / warning / error / info | `bg-success`, `text-success-fg` … | fill + on-* + fg per tone | | states (always with an icon) |
| `--cp-online` / `--cp-offline` | | #06b46b / #a39a90 | #45d483 / #6f6478 | presence dot, fence feet |

Dark mode has one signature: `--cp-shadow-card` and `--cp-shadow-modal` are **orange** (#ff5a36) instead of ink.

## Team colours, symbols, patterns (identical in both modes)

| # | Name (de) | Colour | Ink on colour | Symbol | Pattern |
|---|---|---|---|---|---|
| 1 | Rot | #e4572e | #151515 | ● | Punkte |
| 2 | Orange | #f0a202 | #151515 | ▲ | Zickzack |
| 3 | Gelb | #f3e04a | #151515 | ■ | Karo |
| 4 | Himmel | #56b4e9 | #151515 | ◆ | Rauten |
| 5 | Grün | #009e73 | #151515 | ✚ | Kreuze |
| 6 | Blau | #0072b2 | #fffdf8 | ▬ | Streifen |
| 7 | Pink | #cc79a7 | #151515 | ◗ | Bögen |
| 8 | Nacht | #3d2d8f | #fffdf8 | ✦ | Sterne |

Utilities: `bg-team-N`, `text-team-N-ink`, `pattern-team-N` (16 px tile). Assigned in join order of teams, never reused within a session. Before any team word exists, a team is named after its colour („Team Rot“). Never put text directly on a pattern.

## Type scale

| Token | Utility | Size | Font |
|---|---|---|---|
| display-xl / display / title | `text-display-xl` … | clamp 56–96 / 40–64 / 32–46 | Lilita One |
| h2 / h3 / h4 | `text-h2` … | clamp 26–32 / 20–24 / 18 | Lilita One |
| body-lg / body / small / caption | | 17 / 15 / 13 / 12 | Bricolage 500 (floor 12 px) |
| label | `label` | 12, 700, caps, +0.08em | Bricolage |
| num-hero … num-xs | `text-num-*` + `num` | clamp 96–160 … 15 | Bungee, fixed digit slots (`num-slot` .74em, `num-sep` .34em) |
| timer | `timer` | | Lilita One, slots .6em / .3em |

No „·“ separators in kickers, headers or timers.

## Space, size, radius, elevation, layers

- Space: 4 px base (`--spacing: 4px` → `p-4` = 16 px). Gutter 24 (mobile 16). Header 64 (mobile 56). Side panel 340. Max shell 1440. Touch 44. Controls 36 / 44 / 52.
- Radius: xs 4 · sm 8 · md 12 · lg 14 · xl 20 · pill 999.
- Borders: `border-memphis` 3 px light / 2.5 px dark, thin 2 px.
- Shadows (hard, no blur): sm 3/3 · btn 4/4 · card 6/6 · modal 10/10 · lift 9/13 (dragged avatar) · soft (tooltips, toasts only) · sticker (confetti, emotes).
- Layers (`layer-*`, never raw z-index): decor 1 · content 2 · sticky 10 · dock 30 · sheet 40 · clip 44 · veto 46 · modal 50 · toast 60 · confetti 70. **The veto bar always sits above the clip.**
- Breakpoints: `sm` 600 (tablet), `md` 980 (desktop shell: side panel + floating dock; below = tab bar + crown button), `lg` 1280 (reference), `xl` 1440 (shell stops growing). Inside stage and panel use **container queries**.

## Motion tokens

| Token | Value | Use |
|---|---|---|
| `dur-instant` | 80 ms | press feedback |
| `dur-fast` | 140 ms | hover, fades, reduced-motion fallback |
| `dur-base` | 220 ms | UI enter/leave, toasts |
| `dur-slow` | 360 ms | sheets, pop-ins |
| `dur-slower` | 600 ms | bounce-back, wheel slice remove |
| `dur-scene` | 1200 ms | reduced-motion wheel spin, scene beats |
| `dur-epic` | 2400 ms | ceremony beats |
| `dur-hold` | 1000 ms | hold-to-confirm |
| `ease-snap` | cubic-bezier(.2,0,0,1) | UI default |
| `ease-out` | cubic-bezier(.16,1,.3,1) | enters |
| `ease-in` | cubic-bezier(.7,0,.84,0) | exits |
| `ease-io` | cubic-bezier(.65,0,.35,1) | camera moves, wiggles |
| `ease-pop` | cubic-bezier(.34,1.56,.64,1) | **physical only**: landings, stickers, coin, emotes |
| `ease-spring` | cubic-bezier(.5,1.8,.4,.8) | bounce-back |
| `--cp-stagger` / `--cp-stagger-max` | 40 / 400 ms | list staggers, capped |

GSAP equivalents (register once): `CustomEase.create('snap','.2,0,0,1')` etc., or use the closest built-ins: snap ≈ `power3.out`, out ≈ `expo.out`, pop ≈ `back.out(1.7)`, spring ≈ `back.out(2.4)`. Keep the token names in code (`ease: EASE.pop`).

## MVP construction utilities (new in Phase 5)

In `compies-theme.css`:
- `tape`: red/white 45° stripes (#ff4f4f / #fffdf8, 14 px) with 2.5 px ink edges. Physical object → same colours in light and dark.
- `tape-chip`: the 16 × 10 px tape marker next to nav items that lead to a construction page.
- `fence-mesh`: 12 px grid in `--cp-line` at 38 %, theme-aware.

Static SVGs for the same objects are in `reference/assets/baustelle/` (see 05-assets).
