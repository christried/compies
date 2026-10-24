# 09 Neuigkeiten (Changelog)

Route `/neuigkeiten`, public (works signed out), `AppShell kind="bare"`. Source: `CHANGELOG.md` (Keep a Changelog + SemVer), bundled at build time (`?raw` import in `app/utils/changelog.ts`) and parsed by `shared/changelog.ts`, the parser the changelog guard test uses, newest Release first, `[Unreleased]` dropped. **Ref:** `reference/Neuigkeiten.dc.html` (switch Desktop 1440 / Mobil 390, states Standard, Erster Besuch, Reduzierte Bewegung, Versionslabel; Tweak „Musterblöcke“ shows Entfernt, Sicherheit, inline code, nested list, link).

**New tokens: none.** Everything uses existing colour, type, radius, shadow, layer and motion tokens.

Page structure: BackLink „Zurück“ → hero (`h1` „Neuigkeiten“, intro, Compibert bust) → desktop: grid `236px | 1fr`, gap 40 (ReleaseRail + cards); mobile: ReleaseJumpStrip, then cards → legal footer (Impressum, Datenschutz, Neuigkeiten `aria-current="page"`, VersionLabel). Content max 1160, padding 20/40 (mobile 8/16).

Hero copy (i18n `news.title`, `news.intro`): „Neuigkeiten“ / „Frisch geschraubt: Hier siehst du, was sich bei COMPIES getan hat.“ Compibert `variant="bust"`, 168 desktop, 104 mobile, `join` event once on mount (wave 2.2 s → idle). Existing mood, no new art. **Optional new pose (not drawn, flag only):** Compibert holding a sign or a wrench would fit this page better than wave; only if the mascot set grows anyway.

## ReleaseCard
**Scope:** [1.x] · **Ref:** Neuigkeiten

One Release from the changelog.

- **Props / variants:** `release: {version, date (ISO), name, intro?: Inline[], groups: ChangeGroup[]}`, `newest?: boolean`
- **States:** default · newest (NewStamp on the top edge, version with 3/3 `primary` offset text-shadow) · newest first view (the moment, see NewStamp)
- **Slots:** —
- **Desktop / mobile:** Surface, `border-memphis`, radius 20, `shadow-card`, padding 30/32 (mobile 24/18). Header row: `h2` = version (`CpNum`, 44 px, mobile 32) + name (Lilita 30, mobile 24, wrap), below it `<time datetime>` with calendar icon, 14/700 `ink-2`, format „2. Nov. 2026“ (`d. MMM yyyy` with Duden abbreviations Jan. Feb. März Apr. Mai Juni Juli Aug. Sept. Okt. Nov. Dez.). Copy button top right. Intro paragraph 17/600 (mobile 16), max 62ch. Groups 24 apart, 26 below the header. Cards 44 apart (mobile 36).
- **Accessibility:** `<section id="1.2.0" aria-labelledby>`; `h2` has `tabindex="-1"` (focus target after a jump); `CpNum say="Version 1.2.0"`. `scroll-margin-top: 24px`. Query the anchor with `CSS.escape('1.2.0')` / `getElementById` (ids start with a digit). On load with a hash: scroll to it, no smooth scroll.
- **Motion:** none of its own; see NewStamp.

## CopyLinkButton
**Scope:** [1.x] · **Ref:** Neuigkeiten

`IconButton` (`icon="link"`, `variant="outline"`, size 44) that copies `https://<host>/neuigkeiten#<version>`.

- **Props / variants:** `version`
- **States:** default · hover/focus (`primary` fill) · copied → `ToastStack` `{tone: success, text: t("news.copied") = „Link kopiert“}`
- **Desktop / mobile:** Same.
- **Accessibility:** `aria-label` + tooltip „Link zu Version 1.2.0 kopieren“. Clipboard failure: toast `error` „Kopieren ging nicht. Link: …“ with the URL selectable.
- **Motion:** as IconButton; toast as ToastStack.

## NewStamp
**Scope:** [1.x] · **Ref:** Neuigkeiten (state Erster Besuch)

„Neu“ chip on the newest Release and the page's one celebratory moment.

- **Props / variants:** `celebrate: boolean` (true = newest version ≠ `localStorage["compies.news.seen"]`)
- **States:** static (always rendered, visible without JS) · pending (client only, motion full, unseen: `opacity 0` until in view) · stamped
- **Desktop / mobile:** Absolutely placed on the card's top edge (`top −19`, left 26 / mobile 16), wrapper `rotate(−6deg)`. 34 px pill, `border-memphis`, `primary` fill, `shadow-sm`, sparkles icon 16, 14/800 caps „Neu“. Confetti count 18 desktop, 10 mobile.
- **Accessibility:** Plain text after the `h2` in DOM order (read as „1.2.0 Mehr Termine, Neu“). Confetti `aria-hidden`, `pointer-events:none`, `layer-confetti` inside the card.
- **Motion:** Trigger: IntersectionObserver on the card header (root = viewport, threshold 0.6), first time only, then +0.35 s. Timeline: chip `opacity 0→1, scale 2.2→1, rotation −10→0`, 0.4 `back.out(2)` (same stamp as ban/veto); at 0.30 card `y 0→5→0` 2 × 0.08 `power1.out`; at 0.32 `Confetti` from the chip centre (04-motion § Confetti, `count` 18/10, colours primary, hot, mint, pop, cobalt) + `bus.emit('reveal')` (Compibert cheer 1.6 s). Then write `compies.news.seen = <version>`. **Reduced:** no timeline, chip just there, no confetti, no Compibert reaction, flag is still written.

## ChangeGroup
**Scope:** [1.x] · **Ref:** Neuigkeiten

`h3` + list for one of the five Keep-a-Changelog groups. Colour **and** icon **and** bullet shape, never colour alone.

- **Props / variants:** `type: neu | geaendert | behoben | entfernt | sicherheit`, `items: {inline: Inline[], children?: Inline[][]}[]`

  | type | fill / on | icon | bullet | tilt |
  |---|---|---|---|---|
  | Neu | `primary` / `on-primary` | plus | ● circle 12 | −2° |
  | Geändert | `info` / `on-info` | refresh-cw | ◆ diamond 10 | 1.5° |
  | Behoben | `success` / `on-success` | check | ■ square 11 | −1.5° |
  | Entfernt | `hot` / `on-hot` | minus | ▬ bar 15 × 7 | 2° |
  | Sicherheit | `ink` / `paper` | shield | ◯ ring 12 (3 px ink) | −1° |

  Unknown h3 → render as Geändert and log a build warning.
- **States:** —
- **Desktop / mobile:** h3 = tilted label pill (36 px, `border-memphis`, `shadow-sm`, Lilita 20, icon in a 24 px surface circle) + dashed `line-soft` rule to the right. Items: grid `26px | 1fr`, body 17/1.5 (mobile 16), gap 10, max 64ch. Bullets: group fill + 2 px ink border. Nested level: grid `22px | 1fr`, gap 6, same shape at 75 %, surface fill (Sicherheit: ink fill).
- **Accessibility:** Real `h3`, `ul > li`. Bullets `aria-hidden`.
- **Motion:** —

## ChangelogInline
**Scope:** [1.x] · **Ref:** Neuigkeiten

Inline renderer for intro and items: text, `**bold**` (800), `` `code` `` (mono .86em 700, `paper-2` fill, 1.5 px `line-soft`, radius 6), `[link](url)` (700, underline 2 px / offset 3, hover `focus`), and `#64` → IssueChip.

- **IssueChip:** link to `<repo>/issues/64`, mono 12/700, 22 px pill, 2 px ink, `surface-2`, hover `primary`. Parentheses around it are dropped („… entfernt #65.“).
- **Accessibility:** All external links `target="_blank" rel="noopener noreferrer"`; IssueChip `aria-label="Issue 64 auf GitHub, öffnet in neuem Tab"`, other links `title="Öffnet in neuem Tab"`. Inline links are exempt from the 44 px target (WCAG 2.5.8 inline).
- **Motion:** colour `dur-fast`.

## ReleaseRail
**Scope:** [1.x] · **Ref:** Neuigkeiten

Desktop (≥ `md` 980) sticky list of all Releases.

- **Props / variants:** `releases[]`, `current: version`
- **States:** item default · hover (`paper-2`) · current (`ink` fill, `paper` text, like SegmentedControl) · newest (mini „Neu“ chip next to the date)
- **Desktop / mobile:** `position: sticky; top: 24px`, `layer-sticky`. Card: surface, `border-memphis`, radius 20, `shadow-card`, padding 8; label „Versionen“; items min-height 58, radius 14: version (`CpNum` 15) + name (14/700, ellipsis), date 12/600. Hidden below `md`.
- **Accessibility:** `<nav aria-label="Versionen">`, links `href="#1.2.0"`, `aria-current="true"` on the one in view; accessible name „Version 1.2.0, Mehr Termine, 2. Nov. 2026, neu“. Click: scroll to the section, focus its `h2` (`preventScroll`), update the hash with `history.replaceState`.
- **Motion:** Scroll-spy: current = last section whose top ≤ scrollTop + 160; at page bottom = last. Click scroll `behavior: smooth` (spy paused 700 ms); reduced: `auto`. Highlight change: instant.

## ReleaseJumpStrip
**Scope:** [1.x] · **Ref:** Neuigkeiten (Mobil, Tweak „Versions-Sprungleiste“)

Mobile replacement for the rail. Decision: **worth it**, because the list grows with every release; it is not sticky (cards stay calm).

- **Props / variants:** `releases[]`
- **States:** default · newest (`primary` fill)
- **Desktop / mobile:** Below `md` only. Label „Springe zu“, horizontal scroll row (bleeds to the screen edge, no scrollbar), 44 px pills, 2 px ink, `shadow-sm`, version in `CpNum` 14.
- **Accessibility:** `<nav aria-label="Versionen">`, same link names and jump behaviour as the rail.
- **Motion:** as ReleaseRail.

## VersionLabel
**Scope:** [1.x] · **Ref:** Neuigkeiten (state Versionslabel)

Small „v1.2.0“ chip linking to `/neuigkeiten`. Version comes from `CHANGELOG.md` (newest release) at build time, not `package.json`, so label and page never disagree.

- **Props / variants:** `unseen?: boolean` (newest ≠ `compies.news.seen`; only in the UserMenu)
- **States:** default · hover/focus (`primary` fill + focus ring) · unseen (9 px `primary` dot with 1.5 px ink border before the text)
- **Desktop / mobile:** 28 px pill, 2 px ink, surface, mono 12/700. Hit area 44 via `::before` (inset −9 −4). Places: **UserMenu** last row, right of Impressum, Datenschutz, Neuigkeiten (13/700 `ink-2` text links); **sign-in page** centred legal row under the form (Impressum, Datenschutz, Neuigkeiten, label); page footer of `/neuigkeiten` (label scrolls to top).
- **Accessibility:** `aria-label="Version 1.2.0, zu den Neuigkeiten"` (+ „, neu“ when unseen). In the UserMenu it is a `menuitem`.
- **Motion:** colour `dur-fast`. The dot does not pulse.

## UserMenu (addition)
Existing avatar menu gets a footer row: Impressum, Datenschutz, Neuigkeiten + VersionLabel (`unseen` dot). Desktop: dropdown 340 wide under the avatar (`top 70, right 12`), surface, `border-memphis`, radius 16, `shadow-card`. Mobile: full width minus 12 each side, `top 62`.

## i18n keys (new)
`news.title` „Neuigkeiten“ · `news.intro` „Frisch geschraubt: Hier siehst du, was sich bei COMPIES getan hat.“ · `news.back` „Zurück“ · `news.rail` „Versionen“ · `news.jump` „Springe zu“ · `news.new` „Neu“ · `news.copy` „Link zu Version {v} kopieren“ · `news.copied` „Link kopiert“ · `news.issue` „Issue {n} auf GitHub, öffnet in neuem Tab“ · `news.version` „Version {v}, zu den Neuigkeiten“ · `legal.news` „Neuigkeiten“. Group names come from the changelog itself (German).

**As built (#80):** the intro says „Compies“ (copy rule: never „COMPIES“ in copy). `legal.news` became `legal.links.neuigkeiten` next to the other legal links, and the back link keeps `common.back`. Added: `news.say`, `news.item`, `news.itemNew` (rail link names), `news.copyFailed`, `news.newTab`, `news.versionUnseen`, `legal.nav` „Rechtliches“. Compibert in the hero is the still bust: the CompibertBus (`join` wave, `reveal` cheer) is not built yet, so neither reaction plays.
