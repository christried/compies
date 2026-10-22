# Phase 5 – Handoff to Claude Code

> **Attachment:** `00-product-brief.md` + all results of phases 1–4
> **Goal:** A handoff package that lets Claude Code build COMPIES from scratch without design questions.

---

## Prompt (copy)

Now create the **handoff package for Claude Code**. Claude Code will build COMPIES from scratch with this stack (details in the brief, section 19):

- **Nuxt** (Vue) + **Tailwind CSS**
- **Neon** + **Drizzle**
- **Better Auth** (Discord, Twitch)
- **Vercel**
- **Cloudflare Durable Objects + PartyServer** (realtime)
- **Cloudflare R2**
- **PWA**
- **nuxt-og-image**
- **GSAP**, plus **TresJS** optionally and only for the award ceremony

Write the handoff in English. Keep all UI copy in German.

The package must contain:

### 1. Tokens
All design tokens as a **Tailwind v4 theme** (`@theme` with CSS variables), including:
- light/dark
- 8 team colors + patterns
- motion tokens (durations, easings)

### 2. Component spec
For each component, document:
- purpose
- props and variants
- states
- slots
- desktop vs. mobile behavior
- accessibility (keyboard, ARIA, focus)
- motion

Components are meant as Vue components, named in PascalCase (e.g. `HoldToConfirmButton`, `LuckyWheel`, `TeamZone`).

### 3. Screen spec
For each screen, document:
- layout with breakpoints
- which components it uses
- which data it shows
- host vs. player view
- all states
- **which events arrive in realtime**, e.g.:
  - "player moved"
  - "wheel spun, with stop timestamp"
  - "veto cast (visible to own team only)"
  - "vetoes revealed"

### 4. Motion spec
- Every animation as a **GSAP timeline description**: target elements, properties, duration, easing, stagger, labels, trigger.
- The reduced-motion variant for each.
- **Compibert:**
  - SVG files with rig documentation (IDs, pivots)
  - state table for the state machine
  - transition rules
  - idle behavior (blinking, breathing, eyes following the cursor)
- **Synchronized moments:** wheel stop, clip start, countdowns and reveals run on all devices at the same time, based on a timestamp from the server. Animations must therefore be able to run toward a **fixed target time**, not only from a click.

### 5. Assets
- Compibert (all variants), coin (head/tail), 4 emotes, app and PWA icons, favicon
- list of sound cues
- share-image layout (Satori-compatible: flexbox only)
- battle-replay storyboard

### 6. Copy
All German UI copy as **i18n keys** (JSON, grouped by area), including:
- the explanation copy (brief, section 17)
- the placeholder names for the hidden wheel (section 18)
- error messages, empty states and push notification texts

### 7. Scope & tickets
- Label every element with **[1.0]**, **[1.0 – last ticket]** or **[Post-1.0]**.
- List **[Post-1.0]** items as separate later issues, referencing the existing mockups.
- Suggested **ticket order for 1.0** (adjustable):
  1. Project setup: Nuxt, Tailwind theme from tokens, i18n, PWA shell, base components
  2. Sign-in (Discord, Twitch), profile, avatar upload (R2)
  3. Platform admin: user list, host permission
  4. Game library, incl. YouTube excerpt preview and duplicate check
  5. Create session (stepper, info panel), invite link
  6. Realtime foundation: one room per session, presence, clock sync, reconnect
  7. Date poll, incl. .ics and reminder
  8. Lobby/game board: drag and drop, zones, locking, team names, team colors
  9. Chat, activity feed, emotes
  10. Game selection: admin pick, lucky wheel (+ hidden), clip, veto logic
  11. Pick & ban, incl. coin flip
  12. Loser's Pick, Lucky Wheel – Loser's Advantage
  13. Result entry, points table, live leaderboard, corrections
  14. Tiebreaker
  15. Award ceremony, share image
  16. Archive
  17. Push notifications
  18. Wire up Compibert states everywhere; sound, boot animation, smoke background, motion polish
  19. **Battle replay** (last ticket; dropped if it isn't feasible purely with GSAP)

### 8. Open questions
List everything that stayed unclear during design, or where you made an assumption, so it can be resolved before the build.
