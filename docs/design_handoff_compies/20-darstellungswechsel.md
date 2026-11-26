# 20 Darstellungswechsel (Hell / Dunkel / System)

Ref: `Darstellungswechsel.dc.html` (options 1a–1c vs. clean cut, live demo, frames per control, hand-off). Frame component: `ThemeSweep.dc.html`.

## Decided (unchanged)
- Tap on an option → View Transition. `::view-transition-new(root)` is clipped to a circle from the tapped option's centre to the farthest viewport corner. `--cp-dur-slower` (600 ms), `--cp-ease-io`. The old picture stays still.
- Reduced motion (`--cp-motion: reduced`) or no View Transitions → 140 ms cross-fade (`--cp-dur-fast`), no circle, no edge. No sound.

## Edge: 1b Kartenkante (decided)
The new look arrives like a card: a cream line plus a hard offset shadow that falls on the light side, in ink. It goes from the modal offset to the small one while the circle grows.

| Part | Hell → Dunkel | Dunkel → Hell |
|---|---|---|
| Line | `--cp-line`, `--cp-bw` from **Dunkel** (#f7efe1, 2.5 px), `inset`: inside the circle | same tokens, outer spread: outside the circle |
| Shadow | `--cp-shadow-modal` → `--cp-shadow-sm` from **Hell** (ink, 10/10 → 3/3), outer: lower right, on the old Hell picture | `inset` + same tokens: upper left inside the circle, on the new Hell picture |

Seen from the dark side to the light side it is always: cream line, then ink shadow, light from the top left. Only the CSS differs (outer vs. inset).

Each part is an `<i>` with its own `data-theme`, so the tokens resolve to that theme no matter what the page is switching to. No literals, no new tokens.

### Over the 600 ms
| t | ms | radius (ease-io) | shadow offset |
|---|---|---|---|
| 0 % | 0 | 0 % | 10 px |
| 15 % | 90 | 3 % | 9 px |
| 40 % | 240 | 30 % | 7.2 px |
| 50 % | 300 | 50 % | 6.5 px |
| 85 % | 510 | 97 % | 4 px |
| 100 % | 600 | 100 % | 3 px (off screen) |

The radius follows `--cp-ease-io`. The shadow runs `--cp-ease-linear`, so it is biggest while the circle is still small next to the finger (the pick-up) and smallest while it crawls into the corner. The line stays the same. At 100 % the edge is outside the viewport, so there is nothing to fade.

## How it is drawn
1. JS takes the centre of the tapped element's `getBoundingClientRect()` and R = the distance to the farthest corner. It writes them to `--vt-x --vt-y --vt-r` on `html`. These are runtime values, not tokens.
2. Root: both pictures get `animation:none; mix-blend-mode:normal`. The new one animates `clip-path: circle(0 → var(--vt-r) at var(--vt-x) var(--vt-y))`.
3. Edge: `.theme-edge` is fixed and full-viewport, with `view-transition-name: theme-edge`. It is appended inside the update callback, so it becomes its own group above the root pictures. Its new view is live, so its CSS animation plays during the transition.
4. Inside it, `.theme-edge__disc` is centred on the origin and grows 0 → 2R with the same duration and easing as the clip, so its border box always matches the circle. The edge parts are `box-shadow`s on its children: outer shadows draw only outside the circle, inset shadows only inside.
5. The edge animations stay paused until `transition.ready`, then start in the same frame as the clip. The edge is removed on `transition.finished`.

```css
html[data-vt="circle"]::view-transition-old(root),
html[data-vt="circle"]::view-transition-new(root){animation:none;mix-blend-mode:normal}
html[data-vt="circle"]::view-transition-new(root){animation:cp-vt-reveal var(--cp-dur-slower) var(--cp-ease-io) both}
@keyframes cp-vt-reveal{from{clip-path:circle(0 at var(--vt-x) var(--vt-y))}to{clip-path:circle(var(--vt-r) at var(--vt-x) var(--vt-y))}}
.theme-edge{position:fixed;inset:0;pointer-events:none;contain:strict;view-transition-name:theme-edge}
::view-transition-group(theme-edge),::view-transition-new(theme-edge){animation:none}
.theme-edge__disc{position:absolute;left:var(--vt-x);top:var(--vt-y);translate:-50% -50%;border-radius:50%;
  animation:cp-vt-disc var(--cp-dur-slower) var(--cp-ease-io) both}
.theme-edge__disc>i{position:absolute;inset:0;border-radius:inherit}
.theme-edge:not(.is-running) *{animation-play-state:paused}
@keyframes cp-vt-disc{from{width:0;height:0}to{width:calc(2*var(--vt-r));height:calc(2*var(--vt-r))}}
/* 1b: <i class="line" data-theme="dark"></i><i class="shadow" data-theme="light"></i> */
.theme-edge[data-to="dark"]  .line{box-shadow:inset 0 0 0 var(--cp-bw) var(--cp-line)}
.theme-edge[data-to="light"] .line{box-shadow:0 0 0 var(--cp-bw) var(--cp-line)}
.theme-edge[data-to="dark"]  .shadow{animation:cp-vt-shadow var(--cp-dur-slower) var(--cp-ease-linear) both}
.theme-edge[data-to="light"] .shadow{animation:cp-vt-shadow-in var(--cp-dur-slower) var(--cp-ease-linear) both}
@keyframes cp-vt-shadow{from{box-shadow:var(--cp-shadow-modal)}to{box-shadow:var(--cp-shadow-sm)}}
@keyframes cp-vt-shadow-in{from{box-shadow:inset var(--cp-shadow-modal)}to{box-shadow:inset var(--cp-shadow-sm)}}
/* fallbacks */
html[data-vt="fade"]::view-transition-old(root),html[data-vt="fade"]::view-transition-new(root){animation-duration:var(--cp-dur-fast)}
html.theme-fade,html.theme-fade *{transition:background-color var(--cp-dur-fast),color var(--cp-dur-fast),border-color var(--cp-dur-fast),box-shadow var(--cp-dur-fast)}
```

The JS composable (`setAppearance(pref, el)`) is printed in section 05 of the DC. All three controls call it with `event.currentTarget`. Inside `startViewTransition` it does `colorMode.preference = pref; closeMenus(); append(edge); await nextTick()`.

## The three controls
- **Header (≥ 980 px):** a 40 px round button left of Ton. Its icon shows the current look (`sun` / `moon`). It opens a 240 px `role="menu"` with three 44 px `menuitemradio` rows; the current one has a check. Caption: „System folgt deinem Gerät.“ Origin = the centre of the tapped row. Not present below 980 px.
- **Avatar menu:** a row „Darstellung“ with three icon segments, 40 × 36, each with an `aria-label`. On a phone this is the bottom sheet: the segments go full width with labels, 44 px tall. Origin = the centre of the tapped segment.
- **Profil › Einstellungen:** the existing SegmentedControl, now with icons. Below 600 px it wraps under the label at full width, 44 px tall.
- Menus close in the same update, so the menu disappears under the circle. Focus goes back to the trigger. The segmented control keeps focus on the tapped radio.

## Edge cases
- No visible change („System“ resolves to the current look, or the user taps the current option): only the selection moves, and there is no transition.
- The OS changes while the app is set to System: 140 ms cross-fade. There was no tap, so there is no origin.
- A tap during a running transition: `skipTransition()`, then start again from the new tap.
- SSR: the cookie keeps the first paint right. Nothing animates on load.

## Rejected alternatives (kept in the DC for reference)
- **1a Tintenrand:** the inner line uses the new theme's `--cp-line`/`--cp-bw`, the outer line the old theme's. Constant over the 600 ms. Quiet.
- **1c Sonnenband:** a `--cp-primary` band runs outside the circle, `calc(var(--cp-space)*4)` → 0, linear, with an ink line on the light side. Loud, and it spends the primary colour on decoration.

## New tokens
None.
