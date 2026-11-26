# 19 Rauch auf der Bühne (smoke behind the stage)

Placement of Foundations' „Smoke drift“ on the Event page. Ref = `Rauch auf der Bühne.dc.html` (options 1a–1c, chosen **1b Aufsteigend**, reaching the top of the stage). Artboard component: `BuehnenRauch.dc.html`.

**New tokens: none.** No canvas, no video, no image file.

## Place
- Event page only. All other pages keep the dot grid (Hell) / stage fog `--cp-tex-image` (Dunkel).
- `div.stage-smoke` = first child of the stage column, sibling of the stage scroller. `position:absolute; inset:0; overflow:hidden; pointer-events:none; contain:strict; aria-hidden="true"`; `z-index: var(--cp-z-decor)`. Content stays `--cp-z-content`.
- Covers the whole stage, from directly under the header down to the bottom (TabBar on mobile). Desktop ≥ 980: stage column only. Header and SidePanel stay opaque and smoke-free.
- Anchored to the visible stage; does not scroll.
- Ground order: paper → dot grid / stage fog → smoke → cards. Cards are opaque `--cp-surface`, so card text is never over smoke. The Head (kicker, h1) stands in the smoke; see Contrast.

## Shapes (1b, 5 ellipses)
Fill `radial-gradient(closest-side, var(--c), transparent)`, `border-radius:50%`. The gradient edge is the blur; no `filter`. Values in % of the layer.

| # | 1440: x y w h | 390: x y w h | Hell | Dunkel | Keyframes | Loop | Delay |
|---|---|---|---|---|---|---|---|
| b1 | 4 −16 46 60 | −34 −14 110 46 | `--cp-pop` | `--cp-hot` | RiseA | 36 s | 0 |
| b2 | 36 −22 42 58 | 22 0 110 44 | `--cp-mint` | `--cp-cobalt` | RiseB | 44 s | −9 s |
| b3 | 58 0 46 62 | −22 26 120 44 | `--cp-primary` | `--cp-hot` | RiseA | 52 s | −18 s |
| b4 | 20 30 48 56 | 12 48 110 40 | `--cp-mint` | `--cp-cobalt` | RiseB | 60 s | −27 s |
| b5 | −6 48 40 50 | −40 66 120 38 | `--cp-primary` | `--cp-hot` | RiseA | 68 s | −36 s |

- Group (wrapper) opacity = peak: **Hell 0.24, Dunkel 0.12**. Each shape 0.8 → 1 of peak (Foundations ± 20 %).
- Hell: no cobalt (cobalt + pop fails ink-2). Dunkel: hot + cobalt only. No Sonne, because the spotlight is already amber, and no pop, because pop + pop inside the spotlight fails ink-2.

## Drift
- Loops 36 + i·8 s (Foundations spec 36–76 s), played as two legs: `animation: <kf> <loop/2> var(--cp-ease-io) <−i·9 s> infinite alternate`.
- RiseA `to { transform: translate3d(3%,-6%,0) scale(1.08); opacity:1 }`, RiseB `to { transform: translate3d(-3%,-6%,0) scale(1.06); opacity:1 }`. `from` = element at rest (opacity .8).
- transform + opacity only. The 6 s in Foundations is its 10× demo, not the shipping loop.

## Moments
`updatePlaybackRate(.5)` on the layer's animations at start, `1` at end (keeps position, no jump; the switch is instant and can't be seen at these speeds).

| Moment | Window | Smoke |
|---|---|---|
| Lucky Wheel spin | spin start → stop + 2.2 s | 0.5× |
| Clip overlay | clip.startAt → close | 0.5× + layer opacity .5 (in `--cp-dur-slower` `--cp-ease-out`, out `--cp-dur-slow` `--cp-ease-in`) |
| Veto reveal | vetoEndsAt → +1.2 s | 0.5× |
| Award ceremony | start → share card | 0.5× |
| Coin flip | toss → result | 0.5× |
| Lobby, veto countdown, Standings, P&B turns | — | 1× |

Decor only: follows local moment events, no server time.

## Reduced
`prefers-reduced-motion` or `[data-motion="reduced"]` → `animation:none`. Still frame = `from` keyframe (home, scale 1, 0.8 × peak). Clip dim still applies, instantly.

## Contrast (worst case: text on the ground over two overlapping shapes at peak)
- Hell, on paper with the dot grid: ink-2 ≥ 4.59:1.
- Dunkel, inside the amber spotlight: ink-2 ≥ 4.55:1.
- ink is far above both. Exact numbers in the ref file, section 05.

## Cost
5 divs in one wrapper, CSS gradients + @keyframes. No canvas, no video, no image file, no rAF, no filter, no blend modes. JS only at moment start/end.
