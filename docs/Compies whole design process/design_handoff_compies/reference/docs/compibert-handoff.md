# Compibert: developer handoff (Phase 3)

Stack: Nuxt + Tailwind + GSAP 3. Compibert is one inline SVG per instance, animated with GSAP, driven by a small state machine. No Rive, no Lottie, no canvas.

## Files
| File | What |
|---|---|
| `assets/compibert/compibert-{full,bust,head}.svg` | Production rig. Every part has an `id` (`compibert-*`) and a `data-pivot`. Fills are CSS vars with fallbacks. |
| `compibert-options.js` | Reference implementation: builder, `mount`, all 16 states, eye-follow, outline filters. Port to a composable, keep the numbers. |
| `Compibert Rig.dc.html` | Parts table, layer order, every state's timeline, transition rules, event → state table. **Source of truth for timings.** |
| `Compibert Momente.dc.html` | Boot (3b), moments (4a), poke (5a), ceremony (6b), emotes (7a). |
| `AwardCeremony.dc.html`, `CompibertRig.dc.html` | Working components used in `DS Smoke` (screens 03 and 10). |
| `ShareImage.dc.html` | Share image 8a, props `format wide|square`, `session`, `date`, `people`, `rows[{t,name,pts}]`, `games[{name,w}]`. Flex-only layout (Satori-ready). Used in `DS Smoke` 07. |
| `BattleReplay.dc.html` | Battle replay 9a, props `teams[{t,name,ab}]`, `games[{name,pts[]}]`, `size`, `motion`, `autoplay`. 1–8 lanes. Used in `DS Smoke` 11. |
| `assets/share/sunburst.svg` | Static sunburst for the share image (Satori has no conic gradients). |
| `docs/compibert-sound.md` | Every sound cue. |
| `assets/coin/coin-kopf.svg` | Coin front, 140 × 140: yellow disc, 5 px ink border, cream + ink ring, head (idle) clipped to r 52. |
| `assets/coin/coin-schwanz.svg` | Coin back, 140 × 140: cobalt disc, same rings, striped tail. |
| `assets/coin/coin-rim.svg` | Edge strip, 440 × 14 (one turn of a 140 px coin), 1 row per px of thickness. Coin3D stacks 13 discs at z −6…6 (ink at −6/−2/2/6, gold `#c99a1a` between), faces at ±7. Use the strip only for flat/2D edges. |
| `assets/emotes/emote-{klatschen,freudentraenen,wuetend,bruellen}.svg` | Static emote stickers, 100 × 100 (96 px disc + 4 px offset ink circle as shadow). Key poses: clap 0.78 s, laugh 0.65 s, angry 0.45 s, roar 0.85 s into the state timeline. |

| `assets/icons/icon-512.png`, `icon-192.png` | App icon 1c „Sonnenkopf“, `purpose: any`: rounded sticker tile (ink border, transparent corners). Source `icon.svg`. |
| `assets/icons/icon-maskable-512.png` | Full-bleed sunburst, head inside the 80 % safe circle. Source `icon-maskable.svg`. |
| `assets/icons/apple-touch-icon.png` | 180 × 180, full bleed, no transparency (iOS rounds it). |
| `assets/icons/favicon.svg`, `favicon-32.png`, `favicon-16.png` | Simplified head (no fang, cheek, nostril; lines ×1.5) with the cream sticker rim, so it reads on light and dark tab bars. |
| `assets/icons/monochrome.svg` | Single-colour silhouette (eye, brow and mouth cut out) for Android themed icons. |
| `assets/icons/manifest.webmanifest` | Manifest (name, colours, icons). Serve the icons under `/icons/`. |

Nuxt `app.head` (nuxt.config.ts):
```ts
app: { head: {
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/icons/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/icons/favicon-32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/icons/favicon-16.png' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' },
    { rel: 'manifest', href: '/manifest.webmanifest' }
  ],
  meta: [
    { name: 'theme-color', content: '#fff3df', media: '(prefers-color-scheme: light)' },
    { name: 'theme-color', content: '#17121d', media: '(prefers-color-scheme: dark)' },
    { name: 'apple-mobile-web-app-title', content: 'COMPIES' }
  ]
} }
```
If you use `@vite-pwa/nuxt`, paste the manifest object into `pwa.manifest` instead of shipping the file.

All coin and emote SVGs are baked from the rig: mount, `toState`, advance GSAP manually (`gsap.ticker.remove(gsap.updateRoot)` + `gsap.updateRoot(t)` in 1/120 s steps), then serialise. Transforms end up as plain `transform` attributes, invisible parts are removed, CSS vars replaced with hex, filters dropped. Safe for `<img>`, Satori and notification images. Live UI keeps using the rig; these are for static spots (chat log, push, share image, OG).

## Suggested Vue API
```ts
<Compibert variant="head|bust|full|emote" :size="120" :state="'idle'" still? />
useCompibert(el) → { setBase(state), react(state, {dur, prio}), poke() }
```
- One `useCompibertBus()` store holds `base` and `reaction`; components subscribe. The app emits events (`join`, `spin`, `brake`, `stop`, `win`, `lose`, `emote:<k>`, `load`, `error`, `ok`, `empty`, `award`) and never sets states directly.
- Rules (Rig page section 05): two layers; priority Verwirrt 4 > Jubeln/Traurig 3 > Lachen/Wütend/Klatschen/Brüllen 2 > Winken/Rennen 1; equal or higher replaces, lower is dropped; wait for landing (root y < −3) up to 320 ms; errors block reactions.

## Mounting
1. Inline the SVG (no `<img>`: parts must be reachable).
2. Give each instance a unique id prefix for `clipPath`/`filter` ids.
3. `gsap.set(el, { svgOrigin: el.dataset.pivot })` for every `[data-pivot]`.
4. Lids: `y = −(2·ry + 10)·(1 − closed)`, ry = 24.
5. Start breath + tail loops with per-instance random durations; start the blink scheduler.
6. `gsap.defaults({ overwrite: 'auto' })` once, globally.

## Variants and crops
| Variant | viewBox | Hidden parts | Outline |
|---|---|---|---|
| full | `0 36 404 344` | none | light: hard shadow, dark: sticker |
| bust | `150 36 254 254` | shadow | same |
| head | `212 40 192 192` | body, limbs, tail, neck shape, shadow | none |
| emote | `172 -4 270 270` | as head; adds clap mitts | none (the sticker circle is the frame) |
Below 40 px rendered width: no filter. Below 24 px: no blink, no fx.

## Performance
- Max **one** full-body Compibert animating at a time in the app (4a). Header head + emote stickers are cheap.
- Pause loops for off-screen instances (`IntersectionObserver`, rootMargin 120 px): `timeline.pause()` + `visibility:hidden`. The reference already does this.
- Eye-follow: one `pointermove` listener for all instances, rAF-throttled, `gsap.quickTo`.
- The SVG filters (`feMorphology` sticker) are the expensive part. Never animate filter params; apply them to the static `.cb-fig` group only. On low-end Android, fall back to `drop-shadow` CSS or no outline (`navigator.hardwareConcurrency <= 4`).
- Design pages with 20+ live rigs are design-only; don't copy that density.

## Reduced motion
Same state machine. States become held poses (loops paused at frame 0) with a 200 ms crossfade; blink stays; boot = fade; ceremony = end frame; emotes = pop in place; replay = still frames with „Weiter“.

## Accessibility
Compibert is decorative: `aria-hidden="true"`, never focusable. Anything he "says" that matters (ceremony winner, errors) also exists as real text or an `aria-live` region. Poking is mouse/touch only and changes nothing functional.

## Share image (Satori / nuxt-og-image)
Satori supports flexbox, linear/radial gradients and inline SVG, but **no conic gradients, no CSS filters, no transforms on SVG children**. So: render the sunburst as a static SVG background asset, and pass Compibert as a pre-posed static SVG (state frame baked server-side from the rig JSON, `still` pose). Fonts must be loaded as buffers (Lilita One, Bungee, Bricolage Grotesque).

## Open
- Nothing design-side. Audio production per `compibert-sound.md`.

## Share image (8a) build notes
- Render with Satori at 1200 × 630 and 1080 × 1080. The component is flex-only; replace `CompibertRig` with the baked still SVG (`dance` for the hero, `idle` head for the logo).
- Name sizing: ≤ 14 chars 96 / 128 px, ≤ 34 chars 84 / 112 px, longer 64 / 88 px. `text-wrap: balance` is ignored by Satori; insert a manual break at the space nearest the middle for 2-line names.
- Places 2–4 shown, more → „+N weitere Parteien“. Games: 6 (wide) / 9 (square), more → „+N weitere“. Dot = colour of the game winner.
- Always light theme. Team colours as hex (same values as `--cp-team-N`).

## Battle replay (9a) build notes
- One GSAP timeline per replay, labels `g0 … gN`, `end`. 1.45 s per game; `2×` = `timeScale(2)`. „Nächstes Spiel“ seeks to the next label with events suppressed, then re-poses tokens and texts from data (no reliance on callbacks).
- Lanes: ≤ 4 parties 58 px / token 42, ≤ 6 46 / 34, ≤ 8 38 / 28. Rebuild on resize, keep the current time.
- Per game: label in (0.2 s) and out after 1.15 s, tokens move (0.5 s, stagger 0.03), winner hops, „+N“ chip over the token, „FÜHRUNG“ stamp left of the new leader at +1.0 s. End: winner scales 1.25, crown, Compibert `dance`.
- Compibert never speaks here: `clap` per game, `excited` on a lead change, `dance` at the end.
- Reduced motion: no timeline; „Start / Weiter / Ergebnis“ steps through still frames with a 200 ms crossfade. An `aria-live` line reports the leader after each game.
