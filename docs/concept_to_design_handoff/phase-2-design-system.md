# Phase 2 – Design System

> **Attachment:** `00-product-brief.md`
> **Prerequisite:** A style direction was chosen in phase 1. Fill it in below before sending the prompt.

---

## Prompt (copy)

We have chosen this style direction: **[ENTER THE CHOSEN DIRECTION/COMBINATION HERE, incl. the light/dark decision and notes]**

Build the **complete design system for COMPIES** on top of it. The attached product brief describes all features, and the system must cover all of them. That includes the ones labeled **[Post-1.0]**; mark those components with a "Post-1.0" badge.

Remember: **the UI is German.** All labels and copy in components must be German (see the brief for existing copy).

### 1. Foundations (tokens)

Deliver all tokens so they can be used directly as a **Tailwind CSS theme** (CSS variables, Tailwind v4 `@theme`):

- **Color**
  - Brand colors, neutrals, semantic colors (success, warning, error, info)
  - **8 team colors** that are clearly distinguishable side by side, also for people with color vision deficiency
  - Each team color additionally gets a **pattern or symbol**, so color is never the only differentiator
  - Light and/or dark mode as decided, with WCAG AA contrast
- **Typography:**
  - typefaces, size scale, line heights
  - dedicated styles for **numerals** (leaderboard, points, countdown) with tabular figures
  - hyphenation for long German words
- **Spacing, grid, breakpoints** (desktop first, mobile fully functional)
- **Radii, borders, shadows, textures**
- **Icons and illustration rules**
- **Motion tokens:**
  - named durations and easing curves
  - stagger and choreography rules
  - a **reduced-motion** variant for every animation class
- **Sound guidelines:** what kind of sound fits the style (list of sound moments in the brief, section 14)

### 2. Components

For every component: **variants, sizes, states** (default, hover, focus, active, disabled, loading, error) and desktop vs. mobile behavior.

**Basics**
- Buttons (primary, secondary, ghost, danger)
- **Hold-to-confirm button**: hold for ~1 second, with a progress indicator. Used for veto, ban and pick.
- Inputs, select, toggle, checkbox, radio, slider
- Stepper (session creation)
- Side sheet (info panel), modal, bottom sheet (mobile), tooltip
- Toasts, inline notices, banners (e.g. "Verbindung wird wiederhergestellt …" / reconnecting)
- Badges: "Host", "Online", "Bald verfügbar", "Post-1.0"
- Tabs, empty states, loading states (Compibert thinking), skeletons

**People & teams**
- **Avatar** with these states:
  - online/offline
  - host marker
  - being dragged
  - active drop target
  - rejected (bounces back)
  - emote bubble above
- **Team zone**:
  - team name built from words (truncated + hover)
  - team color + pattern
  - free and occupied slots
  - locked state
  - "teams uneven" state
- **Bench** and **stands** as zones
- **Team-name word input** (max 12 characters)

**Game & selection**
- **Game card**: image, name, player count, formats
- **Lucky wheel**:
  - visible and hidden (placeholders / made-up names)
  - slices redistribute when a game is removed
  - reveal transformation
- **Countdown**: 60-second veto window, split into a clip phase and the remaining time
- **Veto bar**:
  - vetoes per party
  - your own veto visible immediately
  - other vetoes hidden until the reveal
- **Clip overlay**:
  - YouTube excerpt
  - mute, close, "Ton aktivieren" prompt
  - for the host: "Für alle überspringen" (skip for everyone)
  - must never cover the veto button
- **Coin** (Compibert head / Compibert tail)
- **Pick & ban bar**: turn order, whose turn it is, banned and picked games
- **Pool warning** (visible to the host only)

**Scoring**
- **Result entry** (host):
  - sort parties via drag and drop
  - "gleichauf" (tied) toggle
  - optional scores
- **Points-table editor** with presets
- **Leaderboard row**, incl. animation on rank change
- **Podium** (award ceremony)

**Communication**
- **Chat/activity panel**: two tabs, timestamps, "delete message" (host)
- **Emote bar** with 4 emotes and a cooldown
- **Date poll**:
  - grid of slots × people
  - Ja / Wenn nötig / Nein
  - best slot highlighted

**Navigation & frame**
- App header, navigation, user menu, global mute toggle
- **Host controls**: always reachable wherever the host sits, as a floating panel or dock

### 3. Background pattern
Define the **smoke pattern** from phase 1 as a system:
- shapes
- colors per context (lobby, wheel, award ceremony)
- movement speed and density
- resting state under reduced motion
- performance notes

### 4. Documentation
Write short documentation for every token and component:
- what it's for
- when not to use it
- accessibility: keyboard, focus, screen-reader text, touch targets of at least 44 px
