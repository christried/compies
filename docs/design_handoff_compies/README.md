# Handoff: COMPIES

> Phase 5 package for Claude Code. English text, German UI copy. Read this file first, then follow the links.

## ⚠ Priority change: the MVP ships first

We already have a group waiting to use COMPIES for a real gaming night. So the **first release is an MVP where only date coordination works** (sign-in, create a session with date proposals, invite link, poll, confirm, .ics). Every other area of the app is visible but shows a **construction site** (Bauzaun, Absperrband, Compibert with a hard hat).

- Designs: `App MVP Terminfindung.dc.html` (screens M1–M4) and the reusable `BaustelleZone.dc.html`.
- Ticket order: [07-scope-and-tickets.md](07-scope-and-tickets.md) puts the MVP cut (**T1, T2a, T5a, T7a**) before everything else. The rest of the 1.0 order stays as planned.
- The MVP is not throwaway: it uses the real data model, the real tokens and the real components. 1.0 tickets extend the same screens.

## Overview

COMPIES (from *competitiveness*) organises game nights for groups of friends: finding a date, forming teams, picking games (lucky wheel, pick & ban, …), recording results, a live leaderboard and a big award ceremony. Games are played outside the app. Everyone is live on the same page at the same time; one host runs the session. Primary device: desktop. Mobile is fully functional. Shipped as a PWA. UI language 1.0: German (i18n from day one).

## About the design files

The files in `reference/` are **design references built in HTML** ("Design Components", `*.dc.html`). They show the intended look, states and behaviour. They are **not production code**. Recreate them as Vue components in the Nuxt app. Open any `reference/*.dc.html` directly in a browser (they load `support.js` next to them). Start with `reference/App Screens.dc.html` (index of all screens) or `reference/App Flows.dc.html` (5 click-through flows).

Every screen page reads URL params, so tickets can link straight to a state:
`?s=<screen>&st=<state>&vp=desk|mob&theme=light|dark`. Example: `App MVP Terminfindung.dc.html?s=poll&st=host&vp=mob&theme=dark`.

## Fidelity

**High fidelity.** Colours, type, spacing, radii, shadows, states and motion are final. Recreate pixel-close. All values come from the tokens; no raw values in components.

## Stack (to be confirmed in the first Claude Code session)

Planned: Nuxt (Vue) + Tailwind CSS v4 · Neon + Drizzle · Better Auth (Discord, Twitch) · Vercel · Cloudflare Durable Objects + PartyServer (realtime) · Cloudflare R2 · PWA · nuxt-og-image (Satori) · GSAP · TresJS (optional, ceremony only).

**Design verdict: Nuxt + Tailwind is a good fit, no push-back.** The design is framework-agnostic: tokens are CSS variables with a ready Tailwind v4 `@theme`, Compibert is an inline SVG rig driven by GSAP, all components are plain DOM + CSS. Nothing in the design needs React or a specific UI kit.

Notes for the stack decision (leave the final call to the Claude Code session):
1. **MVP needs only:** Nuxt + Tailwind + Better Auth + Neon/Drizzle + Vercel. No Durable Objects, R2, push or OG images yet. The poll refreshes by polling every 15 s while the tab is visible (the UI already says „Aktualisiert sich von selbst“). Swap to realtime events in T6 without UI changes.
2. **Two platforms (Vercel + Cloudflare)** means cross-origin websockets: the Durable Object must verify who connects. Suggested: Nuxt mints a short-lived signed room token (JWT, 60 s, contains userId + sessionId + role); the DO verifies it on connect. Alternative worth evaluating: run Nuxt on Cloudflare too (Nitro `cloudflare` preset) to keep one platform and same-origin sockets. Neon works from Workers via its HTTP driver.
3. **Server time is the clock** for every synchronised moment (wheel stop, clip start, countdowns, reveals). See [04-motion.md § Synchronised moments](04-motion.md#synchronised-moments). This is the one hard requirement the design puts on realtime.
4. **iOS web push** only works for installed PWAs (iOS 16.4+). The design already has an iOS install sheet (screen 29) and a soft push ask (28).
5. **GSAP**: all plugins used (Flip, optional MotionPath) are free in current GSAP 3.x. No Rive, no Lottie (brief).
6. **Satori** (share image): flexbox only, no conic gradients, no filters, fonts as buffers. The share image is designed for this already.

## Contents

| File | What |
|---|---|
| [01-tokens.md](01-tokens.md) + `tokens/` | Tailwind v4 theme, light/dark, 8 team colours + patterns + symbols, motion tokens, MVP construction utilities |
| [02-components.md](02-components.md) | Every Vue component: purpose, props/variants, states, slots, desktop vs mobile, a11y, motion, scope |
| [03-screens.md](03-screens.md) | Every screen (M1–M4, 01–36): layout + breakpoints, components, data, host vs player, states, **realtime events**; event catalogue |
| [04-motion.md](04-motion.md) | GSAP timeline per animation + reduced-motion twin, Compibert rig + state machine, synchronised moments |
| [05-assets.md](05-assets.md) | Compibert, coin, emotes, icons, construction assets, sound cues, share image, battle replay storyboard |
| [06-copy.md](06-copy.md) + `i18n/de.json` | All German UI copy as i18n keys (vue-i18n), incl. info sheet copy, hidden-wheel names, errors, empty states, push |
| [07-scope-and-tickets.md](07-scope-and-tickets.md) | Scope labels, MVP cut, 1.0 ticket order, Post-1.0 issues, data model notes |
| [08-open-questions.md](08-open-questions.md) | Everything still unclear or assumed |
| `reference/` | The HTML design files, tokens, assets and earlier docs (handoff.md, compibert-handoff.md, Spec Changes.md) |
| `brief/00-product-brief.md` | The product brief (single source of truth for scope) |

Exploration pages kept only for history (not build targets): `COMPIES Stilrichtungen`, `Motion Lab`, `Lobby`, `Lobby2`, `MobileLobby`, `Wheel`, `StyleTile`, `MascotCard`, `Compibert` (Phase 2 placeholder), `Compibert Directions`, `DS Typography Options`, `Share Image Options`, `Battle Replay Options`, `Game Options` (except coin take 1i).

## Ground rules (short)

1. Tokens only. Missing value → add a token.
2. Colour is never alone: teams = colour + symbol + pattern; states = colour + icon/line style.
3. Team colours are identity only, never UI state.
4. Ink lines (2.5–3 px) + hard offset shadows on interactive surfaces. Press = move into the shadow.
5. One primary (yellow) action per view. Destructive and irreversible actions are **held 1 s** (HoldToConfirmButton).
6. Live numbers use `CpNum` (fixed digit slots), plus a hidden full value for screen readers.
7. Every animation has a reduced-motion twin. Physical things may overshoot; UI never does.
8. Disabled = `aria-disabled` + visible reason. Never a dead grey button.
9. Hit targets ≥ 44 px. Focus ring 3 px `focus` colour, 3 px offset.
10. Server-timed moments animate toward a server timestamp, never from the click.
