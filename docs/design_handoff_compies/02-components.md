# 02 Components

Vue 3 SFCs, PascalCase, `<script setup lang="ts">`. Props listed as TypeScript-ish. All visuals from tokens. „Ref“ = the design file to compare against (in `reference/`).

Order of the MVP build: everything tagged **[MVP]** first.

Common rules for every component:
- Focus ring 3 px `focus`, 3 px offset, on `:focus-visible`.
- Hit area ≥ 44 px.
- Disabled = `aria-disabled="true"` + visible reason.
- Motion respects `--cp-motion`; the reduced twin is listed per component.
- Copy only via i18n keys (`06-copy.md`).

## Index
- [`AppButton`](#appbutton) [MVP]
- [`IconButton`](#iconbutton) [MVP]
- [`HoldToConfirmButton`](#holdtoconfirmbutton) [MVP]
- [`TextField`](#textfield) [MVP]
- [`DateTimeField`](#datetimefield) [MVP]
- [`ToggleSwitch`](#toggleswitch) [1.0]
- [`RadioCardGroup`](#radiocardgroup) [1.0]
- [`SegmentedControl`](#segmentedcontrol) [MVP]
- [`NumberStepper`](#numberstepper) [1.0]
- [`TabBar`](#tabbar) [1.0]
- [`Sheet`](#sheet) [MVP]
- [`ConfirmModal`](#confirmmodal) [MVP]
- [`ToastStack`](#toaststack) [MVP]
- [`NoticeBanner`](#noticebanner) [MVP]
- [`AppIcon`](#appicon) [MVP]
- [`CpNum`](#cpnum) [1.0]
- [`SkeletonCard`](#skeletoncard) [1.0]
- [`EmptyState`](#emptystate) [MVP]
- [`LockedOption`](#lockedoption) [1.0]
- [`BaustelleZone`](#baustellezone) [MVP]
- [`ConstructionPage`](#constructionpage) [MVP]
- [`NavSoonMarker`](#navsoonmarker) [MVP]
- [`AppShell`](#appshell) [MVP]
- [`AppHeader`](#appheader) [MVP]
- [`HubNav`](#hubnav) [MVP]
- [`PhasePill`](#phasepill) [MVP]
- [`HostDock`](#hostdock) [1.0]
- [`SidePanel`](#sidepanel) [1.0]
- [`ConnectionBanner`](#connectionbanner) [1.0]
- [`FullScreenState`](#fullscreenstate) [MVP]
- [`SoundToggle`](#soundtoggle) [1.0]
- [`BootSplash`](#bootsplash) [1.0]
- [`UserAvatar`](#useravatar) [MVP]
- [`TeamMark`](#teammark) [1.0]
- [`TeamChip`](#teamchip) [1.0]
- [`TeamNameBuilder`](#teamnamebuilder) [1.0]
- [`GameBoard`](#gameboard) [1.0]
- [`TeamZone`](#teamzone) [1.0]
- [`BenchZone / StandsZone`](#benchzone-standszone) [1.0]
- [`MoveToMenu`](#movetomenu) [1.0]
- [`PlayerList`](#playerlist) [1.0]
- [`ProfileForm`](#profileform) [MVP] name only · [1.0] full
- [`EventStepper`](#eventstepper) [1.0] (MVP: date step only = M2)
- [`InfoSheet`](#infosheet) [1.0]
- [`PointsTableEditor`](#pointstableeditor) [1.0]
- [`GamePoolPicker`](#gamepoolpicker) [1.0]
- [`PollSlotCard`](#pollslotcard) [MVP]
- [`PollMatrix`](#pollmatrix) [MVP]
- [`DateConfirmDialog`](#dateconfirmdialog) [MVP]
- [`DateSetCard`](#datesetcard) [MVP]
- [`CalendarSheet`](#calendarsheet) [MVP]
- [`InviteLinkCard`](#invitelinkcard) [MVP]
- [`SlotEditSheet`](#sloteditsheet) [MVP]
- [`GameCard`](#gamecard) [1.0]
- [`LuckyWheel`](#luckywheel) [1.0]
- [`ClipPlayer`](#clipplayer) [1.0]
- [`VetoWindow`](#vetowindow) [1.0]
- [`CoinFlip`](#coinflip) [1.0]
- [`PickBanBoard`](#pickbanboard) [1.0]
- [`LoserBanPanel`](#loserbanpanel) [1.0] (after T12)
- [`LoserPickPanel`](#loserpickpanel) [1.0] (after T12)
- [`NextGamePicker`](#nextgamepicker) [1.0]
- [`ResultEntry`](#resultentry) [1.0]
- [`Leaderboard`](#leaderboard) [1.0]
- [`GameHistory`](#gamehistory) [1.0]
- [`TiebreakerBanner`](#tiebreakerbanner) [1.0]
- [`ChatPanel`](#chatpanel) [1.0]
- [`ActivityFeed`](#activityfeed) [1.0]
- [`EmoteBar`](#emotebar) [1.0]
- [`FloatingEmote`](#floatingemote) [1.0]
- [`PushAsk`](#pushask) [1.0]
- [`PwaInstallHint`](#pwainstallhint) [1.0]
- [`SoundUnlockPrompt`](#soundunlockprompt) [1.0]
- [`AwardCeremony`](#awardceremony) [1.0]
- [`ShareImage`](#shareimage) [1.0]
- [`ShareDialog`](#sharedialog) [1.0]
- [`BattleReplay`](#battlereplay) [1.0 – last ticket]
- [`ArchiveList / ArchiveCard / ArchiveDetail`](#archivelist-archivecard-archivedetail) [1.0]
- [`Compibert`](#compibert) [MVP] head + still full · [1.0] all states
- [`GameLibrary / GameForm`](#gamelibrary-gameform) [1.0]
- [`AdminUserTable`](#adminusertable) [1.0]
- [`Confetti`](#confetti) [1.0]
- [`ReleaseCard`](#releasecard) [1.x] (with CopyLinkButton and NewStamp)
- [`ChangeGroup`](#changegroup) [1.x]
- [`ChangelogInline`](#changeloginline) [1.x] (with IssueChip)
- [`ReleaseNav`](#releasenav) [1.x] (ReleaseRail and ReleaseJumpStrip)
- [`VersionLabel`](#versionlabel) [1.x]
- [`LegalLinks`](#legallinks) [1.x]

## AppButton
**Scope:** [MVP] · **Ref:** DS Basics

The button. One `primary` per view.

- **Props / variants:** `variant: primary | secondary | ghost | hot`, `size: sm (36) | md (44) | lg (52)`, `icon?: string`, `iconRight?: string`, `loading?: boolean`, `disabled?: boolean`, `disabledReason?: string`, `to?: RouteLocation` (renders `<NuxtLink>`), `block?: boolean`
- **States:** default · hover (lift −2 px, shadow +1) · active (translate by shadow offset, shadow none) · focus-visible · loading (spinner replaces icon, label stays, `aria-busy`) · disabled (dashed border, paper-2 fill, ink-2 text, `aria-disabled="true"`, reason rendered next to it or via `aria-describedby`)
- **Slots:** default (label), `#icon`
- **Desktop / mobile:** Same on both. `block` on mobile for sheet/footer CTAs.
- **Card size (#49):** `size: card` is 48 px with 15 px / 700 text, and it is the same set on a Session card: „Verschieben“, „Einladen“, „Session hinzufügen“, „Neue Terminsuche“, „Entfernen“ and „In den Kalender“. Only „In den Kalender“ is filled (primary); the others are secondary. Text size and weight do not depend on the variant at this size.
- **Accessibility:** Native `<button>`/`<a>`. Disabled keeps focus (aria-disabled, click handler no-ops). Hot variant is only for destructive actions and is usually wrapped by HoldToConfirmButton; no hot button sits on a Session card (#49).
- **Motion:** hover/press `dur-instant` `ease-snap`. Reduced: no lift, colour change only.

## IconButton
**Scope:** [MVP] · **Ref:** DS Basics

Round icon-only button (sound toggle, close, remove slot).

- **Props / variants:** `icon`, `label` (required → `aria-label`), `size: 32 | 40 | 44`, `variant: outline | solid | ghost`, `pressed?: boolean`
- **States:** as AppButton; `pressed` shows ink fill (toggle)
- **Slots:** —
- **Desktop / mobile:** Visual 32–40 px, hit area always ≥ 44 (`hit-44`).
- **Accessibility:** `aria-label` required; toggles use `aria-pressed`. Tooltip on hover/focus (desktop) with the same label.
- **Motion:** as AppButton.

## HoldToConfirmButton
**Scope:** [MVP] · **Ref:** DS Basics, VetoWindow, DS Game

Irreversible or destructive actions: veto, ban, pick, rotate link, end/delete Event, remove a Session, remove slot with votes.

- **Props / variants:** `label`, `holdingLabel?` („Halten …“), `doneLabel?`, `duration = 1000`, `variant: hot | primary | secondary`, `size: card (48 px) | lg (52 px)`, `disabled`, `disabledReason`, `icon`, `action?: () => Promise<boolean>` (runs after the hold; without it the parent acts on `confirm`). On a Session card „Entfernen“ and „Neue Terminsuche“ are `secondary` and keep the hold fill while held (#49).
- **States:** idle · holding (fill sweeps left→right) · released early (fill drains back 200 ms, nothing happens) · confirmed (emits `confirm`; with an `action`, the fill stays full while it runs) · done (fill full, icon → check, `doneLabel`; with an `action`, only when it resolves to true) · refused (the `action` resolved to false: fill drains back, idle again, the caller shows why; #74) · locked (team already used it: dashed + reason, e.g. „Larsi hat schon ein Veto eingelegt“)
- **Slots:** default (label)
- **Desktop / mobile:** Desktop pointer hold; mobile touch hold with `drag-longpress` haptic tick (`navigator.vibrate(10)`) at start. Mobile action bar version is full-width 56 px.
- **Accessibility:** `<button>`; Space/Enter **held** for 1 s works the same (keydown starts, keyup cancels; ignore key repeat). Live region announces „Veto eingelegt“. Help text „1 Sekunde halten“ always visible on first use.
- **Motion:** GSAP `fill.scaleX 0→1`, `duration 1`, `ease none`; release: `scaleX → 0`, `0.2 s power2.out`. Confirm: button `scale 1→0.96→1` 0.18 s + sound `ui-hold-done`. Reduced: same fill (it is information), no scale.

## TextField
**Scope:** [MVP] · **Ref:** DS Basics, M2

Input / textarea with label, help, error, counter.

- **Props / variants:** `modelValue`, `label`, `help?`, `error?`, `maxlength?`, `counter?: boolean`, `type`, `multiline?`, `readonly?`, `prefixIcon?`
- **States:** default · focus (3 px focus border) · error (error-fg border + message with icon, `aria-invalid`) · readonly (dashed) · disabled
- **Slots:** `#prefix`, `#suffix`
- **Desktop / mobile:** Height 56 for primary fields, 48 for rows (date/time).
- **Accessibility:** Real `<label for>`; help + error linked via `aria-describedby`; counter in a polite live region only when ≥ 80 % of max.
- **Motion:** border colour `dur-fast`. Error shake: none (never).

## DateTimeField
**Scope:** [MVP] · **Ref:** M2

Date + time pair for poll slots and direct date.

- **Props / variants:** `modelValue: string (ISO, local Europe/Berlin)`, `min`, `error`
- **States:** default · focus · error („Der Termin liegt in der Vergangenheit.“, „Diesen Termin gibt es schon.“)
- **Slots:** —
- **Desktop / mobile:** Own fields on every device, not native inputs (ADR 0010): date typed as TT.MM.JJJJ with a calendar popover, time typed as four digits (24 h) with a list in 15-minute steps. Styled like TextField (date flex 1, Bungee digits). Escape with the calendar or the time list open closes only that popover and leaves the focus in the field; inside a dialog (Reschedule) the dialog stays open (#46).
- **Accessibility:** Grouped with `role="group"` + label „Termin 1“ etc. On the create page's direct mode, each row shows its „Termin n“ on screen when there is more than one Session (#49).
- **Motion:** —

## ToggleSwitch
**Scope:** [1.0] · **Ref:** DS Basics

On/off settings (sound, push, reduced motion, hide wheel).

- **Props / variants:** `modelValue`, `label`, `description?`, `disabled`, `disabledReason`
- **States:** on · off · focus · disabled + reason
- **Slots:** —
- **Desktop / mobile:** Same.
- **Accessibility:** `role="switch"` + `aria-checked`; label clickable.
- **Motion:** knob `dur-base ease-snap`. Reduced: instant.

## RadioCardGroup
**Scope:** [1.0] · **Ref:** App Vorbereitung 05

Big choice cards (format, mode, points preset, date mode).

- **Props / variants:** `options: {value, label, desc, icon, planned?: boolean}[]`, `modelValue`, `columns`
- **States:** default · selected (3 px border, card shadow, primary icon chip) · focus · **planned** („Bald verfügbar“ chip, dashed, lock, `aria-disabled`, skipped by arrow keys, one shared note below the group)
- **Slots:** `#info` per option (mobile „Info“ button that opens the InfoSheet)
- **Desktop / mobile:** Desktop 2 columns + InfoSheet on the right; mobile 1 column, info via button → bottom sheet.
- **Accessibility:** `role="radiogroup"`; roving tabindex; arrows move, Space selects.
- **Motion:** selection lift `dur-base ease-out`.

## SegmentedControl
**Scope:** [MVP] · **Ref:** M2, DS Basics

2–4 short exclusive options (Terminumfrage / Direkt festlegen, Desktop filter chips).

- **Props / variants:** `options: {value,label,icon?,fill?}[]`, `modelValue`, `label`, `disabled?`. An option's `fill` (e.g. success for „Ja“) replaces the ink fill when it is selected; `icon` is drawn before the label.
- **States:** selected (ink fill, paper text, or the option's own `fill`) · focus · disabled (a past Slot: the options show, none is selected, no pointer and no hover tint)
- **Slots:** —
- **Desktop / mobile:** Same; full width on mobile.
- **Accessibility:** `role="radiogroup"` with radios (or buttons with `aria-pressed` for filters).
- **Motion:** selection fill `dur-fast`.

## NumberStepper
**Scope:** [1.0] · **Ref:** DS Scoring

Teams, team size, number of games, points per place.

- **Props / variants:** `modelValue`, `min`, `max`, `step=1`, `unit?`, `label`
- **States:** default · at min/max (that button aria-disabled with reason) · focus
- **Slots:** —
- **Desktop / mobile:** Same; buttons 44 px.
- **Accessibility:** Value in `<output>` + `role="spinbutton"` semantics (arrow up/down).
- **Motion:** value tick `animate-tick`.

## TabBar
**Scope:** [1.0] · **Ref:** DS Frame, AppFrame

Side panel tabs (Chat, Aktivität, Tabelle, Leute) and mobile bottom tabs.

- **Props / variants:** `tabs: {key,label,icon,badge?}[]`, `modelValue`, `placement: panel | bottom`
- **States:** active (3 px hot bar, offset-coloured icon, 800 weight) · inactive · badge (count, 99+) · focus
- **Slots:** —
- **Desktop / mobile:** Panel: top of the 340 px panel. Bottom: 58 px items + safe-area inset.
- **Accessibility:** Panel = `role="tablist"`; bottom nav = `<nav>` with `aria-current="page"`. Badge text in the accessible name („Chat, 3 ungelesen“).
- **Motion:** bar slides between tabs `dur-base ease-snap` (GSAP Flip or CSS).

## Sheet
**Scope:** [MVP] · **Ref:** DS Basics

Side sheet (desktop: info sheet, host „Mehr“) and bottom sheet (mobile: host menu, chat, move-to).

- **Props / variants:** `open`, `title`, `side: right | bottom`, `size`
- **States:** closed · opening · open · closing
- **Slots:** default, `#footer`
- **Desktop / mobile:** Desktop right, 360–420 px. Mobile bottom, max 76 % height, drag handle, swipe down closes.
- **Accessibility:** `role="dialog"` + `aria-modal`, focus trap, Esc + overlay click close, focus returns to the trigger.
- **Motion:** enter `x 100%→0` (bottom: `y`), `dur-slow ease-out`; exit `dur-base ease-in`; overlay fade `dur-fast`. Reduced: fade only.

## ConfirmModal
**Scope:** [MVP] · **Ref:** App Vorbereitung 08 confirm

Short confirm for consequential but reversible actions (confirm date, start Session).

- **Props / variants:** `open`, `title`, `icon`, `confirmLabel`, `cancelLabel`
- **States:** open · loading on confirm
- **Slots:** default (body), `#summary`
- **Desktop / mobile:** Desktop centred 480 px; mobile bottom sheet.
- **Accessibility:** `role="dialog"`, focus on title, Esc cancels.
- **Motion:** pop-in `scale .96→1 + fade`, `dur-base ease-out`. Reduced: fade.

## ToastStack
**Scope:** [MVP] · **Ref:** DS Basics

Transient feedback („Link kopiert“, „X war schneller“, vote failed).

- **Props / variants:** `toast({tone: success | info | warning | error, text, action?, duration?})`
- **States:** enter · visible · leave; max 3 stacked; errors stay until dismissed. Every toast has an ✕ that dismisses it.
- **Slots:** —
- **Desktop / mobile:** Desktop bottom centre above the dock; mobile above the tab bar. With a Host dock on the page, desktop sits above the dock pill (bottom 96 px) and phones above the crown button (bottom 144 px).
- **Accessibility:** `role="status"` (errors `role="alert"`); action reachable by keyboard; auto-dismiss pauses on hover/focus.
- **Motion:** `y 20→0, opacity`, `dur-base ease-out`; leave `dur-fast`. Sound `ui-toast`.

## NoticeBanner
**Scope:** [MVP] · **Ref:** DS People, M3

Inline notices (team selection locked, uneven teams, pool warning).

- **Props / variants:** `tone`, `icon`, `hostOnly?: boolean`, `action?`
- **States:** default · host-only (chip „Nur du siehst das“). Every notice has an ✕: it emits `close`, and the page decides what closing means.
- **Slots:** default, `#action`
- **Desktop / mobile:** Same.
- **Accessibility:** `role="status"` when it appears live, else plain text.
- **Motion:** enter fade `dur-base`.

## AppIcon
**Scope:** [MVP] · **Ref:** Icon

Lucide wrapper.

- **Props / variants:** `name`, `size`, `strokeWidth = 2.5`, `offset?: colour` (active-state colour shadow)
- **States:** —
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Decorative by default (`aria-hidden`); meaning comes from the label next to it.
- **Motion:** —

## CpNum
**Scope:** [1.0] · **Ref:** Num, DS Foundations

Live numbers (scores, timers, points) without layout jump.

- **Props / variants:** `value: string | number`, `face: score | timer`, `say?: string` (screen reader text), `animate?: boolean`
- **States:** static · counting (on change)
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Visual digits `aria-hidden`, a visually hidden `say` (e.g. „noch 42 Sekunden“). Timers announce only at 30, 10, 5 s.
- **Motion:** count-up per digit with GSAP `snap: 1`, 0.4–0.8 s `power2.out`; reduced: instant.

## SkeletonCard
**Scope:** [1.0] · **Ref:** App Ende & Archiv 21, App Bibliothek 23

Loading placeholders in the real card shape.

- **Props / variants:** `shape: card | row`, `count`
- **States:** pulsing
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Container `aria-busy="true"`; skeletons `aria-hidden`.
- **Motion:** opacity .55↔1, 1.2 s, stagger 0.08; reduced: static.

## EmptyState
**Scope:** [MVP] · **Ref:** M1 empty

Nothing to show yet.

- **Props / variants:** `title`, `text`, `compibertState = "sleep"`, `action?`
- **States:** —
- **Slots:** `#action`
- **Desktop / mobile:** Desktop row (Compibert left); mobile stacked, centred.
- **Accessibility:** Heading level fits the page.
- **Motion:** Compibert sleep loop; reduced: held pose.

## LockedOption
**Scope:** [1.0] · **Ref:** App Vorbereitung 05

„Bald verfügbar“ chip + locked style for not-yet-built options (bracket, league, loser modes until T12).

- **Props / variants:** `label = "Bald verfügbar"`
- **States:** —
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Option gets `aria-disabled` + description from the shared note.
- **Motion:** —

## BaustelleZone
**Scope:** [MVP] · **Ref:** BaustelleZone.dc.html

Construction strip inside working pages (Home, create, poll): says what is not built yet.

- **Props / variants:** `title`, `text`, `chip = t("mvp.zone.chip")`, `compact?: boolean`, `sign = true`
- **States:** — (static)
- **Slots:** default (overrides text)
- **Desktop / mobile:** Desktop: copy top-left (max 600), scene 138 px: tape at −3°, 9 fence panels 150 × 100, sign at 30 %, cone bottom-right. Compact/mobile: 4 panels 112 × 82, scene 118, sign left. Fence overflows and is clipped by the 18 px rounded container.
- **Accessibility:** `role="note"` with `aria-label="Baustelle: <title>"`. Scene (tape, fence, sign, cone) `aria-hidden`. Never focusable, never a link.
- **Motion:** None. No looping tape (people idle on these pages).

## ConstructionPage
**Scope:** [MVP] · **Ref:** App MVP Terminfindung M4, BaustelleZone variant=hero

Full page for every route that is not built yet.

- **Props / variants:** `area: archiv | bibliothek | profil | brett | admin | generic` (copy keys `mvp.site.<area>.*`), `primaryTo` (poll or home), `secondary?: {label, icon, action}` (Profil: Abmelden)
- **States:** one per area
- **Slots:** —
- **Desktop / mobile:** Desktop: fills the stage (min-height = stage height), row: Compibert full 250 px with hard hat + text (title 56 px). Tape across the top at −4°, fence + barrier + sign + cone along the bottom (130 px). Mobile: stacked and centred, Compibert 170, title 36, 4 fence panels.
- **Accessibility:** `<h1>` = title; focus moves to it on route change. Decorative scene `aria-hidden`. Compibert `aria-hidden`.
- **Motion:** Compibert idle (breathing + blink) only. Reduced: still.

## NavSoonMarker
**Scope:** [MVP] · **Ref:** AppFrame (prop soon)

Small tape chip next to nav items that lead to a construction page.

- **Props / variants:** —
- **States:** —
- **Slots:** —
- **Desktop / mobile:** Desktop: 16 × 10 after the label. Mobile tab bar: top-right of the icon.
- **Accessibility:** `title="Baustelle"`; the nav item gets `aria-description="Baustelle"`.
- **Motion:** —

## AppShell
**Scope:** [MVP] · **Ref:** AppFrame, DS Frame

Layout frame: header, stage, side panel, mobile tab bar, host dock slot.

- **Props / variants:** `kind: hub | event | bare`, `panel?: boolean`
- **States:** —
- **Slots:** `#header`, default (stage), `#panel`, `#dock`, `#tabs`
- **Desktop / mobile:** ≥ 980: header 64, stage max 1100 centred, panel 340 right (Event only), dock floating. < 980: header 56, content, bottom TabBar, crown button 56 bottom-right for hosts.
- **Accessibility:** Landmarks: `header`, `nav`, `main`, `aside`. Skip link „Zur Bühne springen“.
- **Motion:** —

## AppHeader
**Scope:** [MVP] · **Ref:** AppFrame

Logo (Compibert head), hub nav or Event title + phase pill, invite button, sound toggle, avatar menu.

- **Props / variants:** `kind`, `title?`, `phase?: draft | poll | date_set | running | finished | archived`, `isHost`
- **States:** hub · event · bare
- **Slots:** `#actions`
- **Desktop / mobile:** Desktop shows wordmark + nav. Mobile: head logo only, Event title + pill wrap to 2 lines max.
- **Accessibility:** Logo links to Home; pill has text (dot is decorative).
- **Motion:** Logo Compibert reacts (idle → cheer/confused) via CompibertBus.

## HubNav
**Scope:** [MVP] · **Ref:** AppFrame

Main navigation: Events, (Crews Post-1.0), Archiv, Bibliothek, Profil, (Admin). Bibliothek only for Users with the Host permission and the Platform admin; Admin only for the Platform admin.

- **Props / variants:** `current`, `canHost`, `isAdmin`, `soon: string[]` (MVP: archiv, bibliothek, profil)
- **States:** active (3 px hot underline, offset icon) · soon (NavSoonMarker)
- **Slots:** —
- **Desktop / mobile:** Desktop header nav; mobile = bottom TabBar with the same items.
- **Accessibility:** `<nav aria-label="Hauptnavigation">`, `aria-current="page"`.
- **Motion:** —

## PhasePill
**Scope:** [MVP] · **Ref:** AppFrame

Event phase chip in the header and on cards.

- **Props / variants:** `phase`
- **States:** Entwurf · Terminumfrage (info dot) · Termin steht (success dot) · Läuft (yellow, hot dot) · Beendet · Archiv
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Text carries the meaning.
- **Motion:** —

## HostDock
**Scope:** [1.0] · **Ref:** AppFrame, App Lobby 10

Host controls, reachable wherever the host sits.

- **Props / variants:** `actions: {key,label,icon,primary?,disabledReason?}[]` (max 3 + „Mehr“), `phase`
- **States:** expanded · collapsed to crown after 8 s idle · „Mehr“ open (sheet) · lifted above veto bar
- **Slots:** —
- **Desktop / mobile:** Desktop floating pill bottom-centre of the stage (`layer-dock`). Mobile: crown button 56 px bottom-right → bottom sheet with the same menu. MVP uses it for „Termin festlegen“, „Verschieben“, „Einladen“.
- **Accessibility:** `role="toolbar" aria-label="Host-Steuerung"`; shortcut **H** focuses it; arrows move inside.
- **Motion:** collapse/expand width `dur-slow ease-out`; reduced: instant.

## SidePanel
**Scope:** [1.0] · **Ref:** AppFrame

Event side panel with tabs Chat, Aktivität, Tabelle, Leute.

- **Props / variants:** `tab`
- **States:** per tab; unread badges
- **Slots:** one per tab
- **Desktop / mobile:** Desktop only (340 px). Mobile: the same content as bottom tabs.
- **Accessibility:** Tabs pattern.
- **Motion:** tab content crossfade `dur-fast`.

## ConnectionBanner
**Scope:** [1.0] · **Ref:** App Systemzustände 27

Realtime connection state.

- **Props / variants:** `state: ok | reconnecting | lost | back`
- **States:** nothing < 2 s · reconnecting (warning, after 2 s) · lost (hot, after 15 s, retry button) · back (success, 2 s)
- **Slots:** —
- **Desktop / mobile:** Full-width bar under the header.
- **Accessibility:** reconnecting/back `role="status"`, lost `role="alert"`. Input is queued, never lost.
- **Motion:** slide down `dur-base`; Compibert → confused (prio 4).

## FullScreenState
**Scope:** [MVP] · **Ref:** App Systemzustände 31, App Einstieg 07

Loading, invalid link, deleted Event, 404, no permission, generic error.

- **Props / variants:** `kind`, `errorId?`
- **States:** one per kind
- **Slots:** `#actions`
- **Desktop / mobile:** Centred column; Compibert bust (confused for errors, think for loading).
- **Accessibility:** Focus to `<h1>` on mount.
- **Motion:** Compibert only.

## SoundToggle
**Scope:** [1.0] · **Ref:** AppFrame

Global mute (header).

- **Props / variants:** —
- **States:** on · muted
- **Slots:** —
- **Desktop / mobile:** Header right.
- **Accessibility:** IconButton with `aria-pressed`, label „Ton aus/an“. Persisted per device.
- **Motion:** —

## BootSplash
**Scope:** [1.0] · **Ref:** App Einstieg 01, Compibert Momente 3b

„Reinsprinten“ boot: Compibert runs in, letters spring up, skid, wave.

- **Props / variants:** —
- **States:** boot (first visit per 24 h) · loading (short) · reduced
- **Slots:** —
- **Desktop / mobile:** Same, scaled.
- **Accessibility:** Tap/any key skips. `aria-live` „COMPIES lädt“.
- **Motion:** see 04-motion § Boot.

## UserAvatar
**Scope:** [MVP] · **Ref:** Avatar, DS People

Person everywhere (board, poll matrix, chat).

- **Props / variants:** `user: {name, avatarUrl?}`, `size: 24 | 32 | 40 | 48 | 80 | 120`, `team?: 1–8`, `host?: boolean`, `online?: boolean`, `showPresence?: boolean`, `lifted?: boolean`
- **States:** default · offline (greyscale + hollow ring) · lifted (scale 1.08 + `shadow-lift`, while dragging) · bounce-back (lost slot) · emote rising above
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** `alt` = name; team/host/presence added to the accessible name („Kitty, Team Rot, online“).
- **Motion:** drop: `scale .6→1.12→1`, 0.34 s pop; bounce-back 0.6 s spring.

## TeamMark
**Scope:** [1.0] · **Ref:** TeamMark

Team colour + symbol; never colour alone.

- **Props / variants:** `team: 1–8`, `size`
- **States:** —
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Name in text next to it; mark `aria-hidden` unless standalone (then `aria-label="Team Rot"`).
- **Motion:** —

## TeamChip
**Scope:** [1.0] · **Ref:** DS People

Team name label (mark + name), truncates with full name on hover/focus.

- **Props / variants:** `team`, `name`, `compact?`
- **States:** full · compact (mark only in tight rows)
- **Slots:** —
- **Desktop / mobile:** 36 px.
- **Accessibility:** `title` + accessible full name.
- **Motion:** —

## TeamNameBuilder
**Scope:** [1.0] · **Ref:** DS People

Each member adds one word (≤ 12 chars) to the team name.

- **Props / variants:** `team`, `words: {user, word}[]`, `myWord`, `frozen`, `canReset`
- **States:** empty (colour name) · editing (counter, spaces stripped with hint) · frozen (readonly, after kick-off) · host reset
- **Slots:** —
- **Desktop / mobile:** Inline in the TeamZone header; mobile in the team sheet.
- **Accessibility:** TextField rules; live region for the composed name.
- **Motion:** new word pops in `dur-slow ease-pop`.

## GameBoard
**Scope:** [1.0] · **Ref:** DS People, App Lobby 09

The lobby: teams, bench, stands; drag and drop.

- **Props / variants:** `teams[]`, `bench[]`, `stands[]`, `teamSize`, `phase`, `role: host | player`, `me`
- **States:** poll (team slots locked „Teamwahl öffnet, sobald der Termin steht“) · open · dragging · drop target · full/refused · lost slot (bounce-back + toast „X war schneller“) · running (teams locked for players) · uneven (host notice)
- **Slots:** —
- **Desktop / mobile:** Desktop grid of TeamZones (2–4 columns by container width) + bench + stands rows. Mobile: teams stacked, bench/stands as rows; drag = long-press 300 ms.
- **Accessibility:** Every avatar: focus + Enter opens MoveToMenu („Verschieben nach …“). Drop zones announce „Team Rot, 1 von 2 frei“. Players can only move themselves; host moves everyone.
- **Motion:** GSAP Draggable or pointer events; drop = Flip from old slot; refused = bounce-back.

## TeamZone
**Scope:** [1.0] · **Ref:** DS People

One team (or FFA player slot) on the board.

- **Props / variants:** `team`, `members[]`, `size`, `locked`, `lockReason`, `isDropTarget`
- **States:** open · drop target (dashed → solid, sparkle) · full · locked (poll / running) · winner glow (after a game)
- **Slots:** `#header` (TeamChip + TeamNameBuilder)
- **Desktop / mobile:** Container-query: 2-col slots ≥ 260 px, else 1-col.
- **Accessibility:** `role="group"` + name.
- **Motion:** drop-target wake `dur-fast`.

## BenchZone / StandsZone
**Scope:** [1.0] · **Ref:** DS People

Unlimited zones: substitutes (Bench) and spectators (Tribüne).

- **Props / variants:** `people[]`
- **States:** empty · filled · drop target
- **Slots:** —
- **Desktop / mobile:** Horizontal wrap; mobile rows.
- **Accessibility:** as TeamZone.
- **Motion:** as TeamZone.

## MoveToMenu
**Scope:** [1.0] · **Ref:** DS People

Keyboard/touch alternative to dragging.

- **Props / variants:** `person`, `targets[]` (with disabled reasons)
- **States:** open · target disabled (full, locked)
- **Slots:** —
- **Desktop / mobile:** Desktop popover; mobile bottom sheet.
- **Accessibility:** `role="menu"`, `aria-expanded` on trigger.
- **Motion:** popover fade `dur-fast`.

## PlayerList
**Scope:** [1.0] · **Ref:** DS People

„Leute“ tab: everyone by zone, online state, move menu.

- **Props / variants:** `people[]`, `role`
- **States:** host (menu on every row) · player (menu on own row only)
- **Slots:** —
- **Desktop / mobile:** Panel tab / mobile tab.
- **Accessibility:** List with sections; row menu button labelled.
- **Motion:** —

## ProfileForm
**Scope:** [MVP] name only · [1.0] full · **Ref:** App Einstieg 03, App Bibliothek 25

Display name, avatar (provider or upload), linked accounts, settings.

- **Props / variants:** `user`
- **States:** provider image · uploading (progress) · name missing (error) · last account (can't unlink)
- **Slots:** —
- **Desktop / mobile:** Single column max 560.
- **Accessibility:** Form semantics; upload button with file input.
- **Motion:** —

## EventStepper
**Scope:** [1.0] (MVP: date step only = M2) · **Ref:** App Vorbereitung 05

Guided 8-step setup: Name, Format, Anzahl Spiele, Punktetabelle, Auswahlmodus, Spielepool, Tiebreaker-Pool, Termin.

- **Props / variants:** `event`, `step`
- **States:** per step; error per step; done
- **Slots:** one per step, `#info`
- **Desktop / mobile:** Desktop: step list left (230), form centre, InfoSheet right (340) on format/mode/tie steps. Mobile: progress bar (8 segments), form, info via button + bottom sheet, sticky footer Zurück/Weiter.
- **Accessibility:** Step list `aria-current="step"`; „Schritt n von 8“ in the heading.
- **Motion:** step change crossfade `dur-base`.

## InfoSheet
**Scope:** [1.0] · **Ref:** App Vorbereitung 05

Explains every format/mode with „So läuft's“, „Gut für“, „Achtung“ + example run.

- **Props / variants:** `topic: ffa | teams | admin | wheel | pickBan | loserPick | loserAdv | tiebreaker`
- **States:** —
- **Slots:** —
- **Desktop / mobile:** Desktop side column; mobile bottom sheet.
- **Accessibility:** Headings per section.
- **Motion:** content swap fade `dur-fast`.

## PointsTableEditor
**Scope:** [1.0] · **Ref:** DS Scoring

Linear / Winner takes all / custom points per place.

- **Props / variants:** `preset`, `custom[]`, `parties`
- **States:** preset · custom · error (worse place > better place)
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Steppers per row; error linked to row.
- **Motion:** —

## GamePoolPicker
**Scope:** [1.0] · **Ref:** App Vorbereitung 05

Fill wheel/pick pool and tiebreaker pool from the library with suggestions.

- **Props / variants:** `pool[]`, `suggestions[]`, `kind: main | tiebreaker`, `required` (for the pool warning)
- **States:** suggested · in pool · pool warning (host only)
- **Slots:** —
- **Desktop / mobile:** Desktop 4-col cards + 2-col rows; mobile 2-col cards.
- **Accessibility:** Add/remove buttons labelled with the game name.
- **Motion:** card into pool: Flip `dur-slow`.

## PollSlotCard
**Scope:** [MVP] · **Ref:** M3

One proposed date in the poll.

- **Props / variants:** `slot: {startsAt}`, `counts: {yes, maybe, no}`, `total`, `myVote`, `best`, `canPick` (host)
- **States:** not voted (all options neutral) · voted (selected option filled: Ja success with a check, Meh warning text only, no icon (#50), Nein error red with dark text (`bg-error text-on-error`) with an x) · best (3 px focus border, card shadow, „Bester Termin“ chip) · confirmed
- **Slots:** —
- **Desktop / mobile:** Desktop 4 columns; mobile 1 column. Host on desktop gets „Diesen festlegen“ in the card.
- **Accessibility:** Options = `role="radiogroup"` labelled with the slot („Sa 25.10. 20:30“); chip text says best.
- **Motion:** bar widths tween `dur-slow ease-out` on new votes; best chip pops `ease-pop`. Reduced: instant.

## PollMatrix
**Scope:** [MVP] · **Ref:** M3

„Wer kann wann?“: everyone × every slot.

- **Props / variants:** `people[]`, `slots[]`, `votes`, `me`
- **States:** cells: Ja (check, circle, success) · Meh (minus, circle, warning) · Nein (x, square, error red with dark text) · Noch offen (dashed circle)
- **Slots:** —
- **Desktop / mobile:** Desktop name column 200 + equal columns; mobile 130 + 72 px columns, horizontal scroll only when the Slots don't fit. Headers show the day and the time on separate lines, never cut.
- **Accessibility:** Real `<table>` with row/column headers; cell `title` and text equivalent („Ja“).
- **Motion:** cell change pop `dur-base ease-pop`.

## DateConfirmDialog
**Scope:** [MVP] · **Ref:** M3 confirm

Host confirms a slot.

- **Props / variants:** `slot`, `counts`
- **States:** open · saving · selected option (filled radio dot, 3px focus-blue border, light focus-blue wash; unselected options: hollow dot). The option that opened the dialog, else the Best slot, starts selected.
- **Slots:** —
- **Desktop / mobile:** ConfirmModal / bottom sheet.
- **Accessibility:** as ConfirmModal.
- **Motion:** as ConfirmModal.

## DateSetCard
**Scope:** [MVP] · **Ref:** M3 set

Confirmed date with calendar tile, .ics download, reschedule (host).

- **Props / variants:** `startsAt`, `isHost`, `icsUrl`
- **States:** player · host
- **Slots:** —
- **Desktop / mobile:** Desktop row; mobile stacked.
- **Accessibility:** Date as `<time datetime>`.
- **Motion:** tile drops in `y −20→0` 0.45 s `back.out(2)`, once.

## CalendarSheet
**Scope:** [MVP] · **Ref:** Sheet (#81, built from existing parts, no design of its own)

The choice behind „In den Kalender“, the one calendar button of the Event. Every Member can open it. Google and Outlook open a new, pre-filled event in that calendar; the file is the calendar file download.

- **Props / variants:** `open`, `view` (the Event view). One dated Session: „Google Kalender“, „Outlook“, „Apple & andere (.ics)“. Several dated Sessions: „Apple & andere (.ics) – alle Termine“ first, then one row per dated Session („Session 2 · Sa 24.10.“) with „Google“ and „Outlook“.
- **States:** closed · open. Stays closed while no Session has a Date.
- **Slots:** —
- **Desktop / mobile:** the Sheet (right on desktop, bottom on phones). Every button is `AppButton` secondary, size card (48 px). A Session row is the Slot editor's row card, with its two buttons side by side.
- **Accessibility:** as Sheet. Google and Outlook are links that open a new tab (`rel="noopener noreferrer"`, trailing external-link icon); the file is a `download` link. Each Session row is a `role="group"` named by its label. The trigger carries `aria-haspopup="dialog"`.
- **Motion:** as Sheet.

## InviteLinkCard
**Scope:** [MVP] · **Ref:** App Einstieg 06, M2 done

Show, copy and rotate the invite link.

- **Props / variants:** `url`, `canRotate`
- **States:** link · copied (toast) · rotate confirm (hold 1 s) · rotated
- **Slots:** —
- **Desktop / mobile:** Desktop dock „Einladen“ sheet; mobile bottom sheet.
- **Accessibility:** Copy button announces „Link kopiert“.
- **Motion:** —

## SlotEditSheet
**Scope:** [MVP] · **Ref:** — (the create form's Slot row, in a Sheet; #15, #85)

The Host's „Termine bearbeiten“, from the host dock while the Date poll is open: the open Slots, changed, removed and added.

- **Props / variants:** `open`, `slug`, `slots: {id, startsAt, votes}[]`
- **States:**
  - list: each open Slot in time order with „Ändern“ and remove. Without Votes, remove is an IconButton; with Votes, a HoldToConfirmButton under „N Stimmen gehen verloren“.
  - changing (one row at a time): „Ändern“ turns the row into the DateTimeField, prefilled with the Slot's time, with „Speichern“ and „Abbrechen“. The rules and messages of adding apply (in the future, not another Slot's minute; the Slot's own minute is fine). A Slot with Votes says „Die Stimmen bleiben erhalten – sag der Gruppe Bescheid.“: the Votes stay and Members are not told. Saved, the row closes and the list re-sorts, so the Slot may move. A Slot that became a Date meanwhile is refused with „Dieser Termin steht schon fest.“
  - adding: DateTimeField + „Termin hinzufügen“ (dashed). Full at 16 Slots: „Höchstens 16 Vorschläge.“ instead.
- **Slots:** —
- **Desktop / mobile:** Sheet.
- **Accessibility:** The changing field is named by the Slot's current time. „Speichern“ and „Termin hinzufügen“ stay focusable while blocked (`aria-disabled`), with the rule's message on the field.
- **Motion:** as Sheet.

## GameCard
**Scope:** [1.0] · **Ref:** GameCard

A game in library, pool, wheel lists, pick & ban.

- **Props / variants:** `game: {title, players, formats, coverUrl}`, `state: default | banned | picked | vetoed | drawn | disabled`, `team?`, `order?`, `layout: card | row`, `selected`, `suggested`, `inPool`
- **States:** as `state`; banned/picked carry the acting team mark; disabled explains why
- **Slots:** `#actions`
- **Desktop / mobile:** —
- **Accessibility:** Card is not a button unless selectable (then `aria-pressed`).
- **Motion:** ban: stamp `scale 2.2→1, rotate −8°` 0.4 s; pick: slap into order strip (Flip).

## LuckyWheel
**Scope:** [1.0] · **Ref:** GameWheel, App Spielrunde 11

„Show-Rad“: bulb rim, pins, flapper; spins on all devices in sync.

- **Props / variants:** `entries: {id, label, colour}[]`, `hidden?: boolean`, `placeholders?: string[]`, `spin?: {startAt, durationMs, resultIndex, offset}` (from server), `canSpin`, `muted`
- **States:** idle (bulbs blink) · spinning (bulbs chase, flapper kicks per pin, tick) · braking (last 40 %) · stopped (bulbs flash, winner outline) · reveal (hidden: fake name → real, 0.5 s after stop) · slice removing · put back · refill
- **Slots:** `#center`, `#controls` (host)
- **Desktop / mobile:** Desktop 420 px; mobile fits width (max 340). Never resizes during a spin.
- **Accessibility:** `role="img"` with label „Glücksrad mit 9 Spielen“; live region announces result („Glücksrad: Counter-Strike 2“). Spin button for host only.
- **Motion:** see 04-motion § Wheel.

## ClipPlayer
**Scope:** [1.0] · **Ref:** App Spielrunde 11, App Systemzustände 30

30 s YouTube excerpt, synced.

- **Props / variants:** `videoId`, `start`, `length = 30`, `startAt` (server), `canSkipForAll` (host)
- **States:** playing with sound · autoplay blocked (muted + big „Ton aktivieren“) · muted by me · closed by me · skipped by host · ended
- **Slots:** —
- **Desktop / mobile:** Desktop overlay over the stage (`layer-clip`), 16:9 max 720; mobile top, full width.
- **Accessibility:** Controls labelled; closing is personal („Für mich schließen“).
- **Motion:** open `scale .96→1, fade` `dur-slow`; close `dur-base`.

## VetoWindow
**Scope:** [1.0] · **Ref:** VetoWindow

60 s veto phase per drawn game.

- **Props / variants:** `game`, `determinedAt`, `party: {vetosLeft, usedBy?}`, `revealed?: {partyId, by}[]`
- **States:** running (timer, clip first 30 s) · clip closed (30 s left) · own party vetoed (sealed, visible to own party only) · no vetos left · last 10 s (timer ticks, pulse) · reveal (all at once) · no veto: game is played
- **Slots:** —
- **Desktop / mobile:** Desktop bar at the bottom of the stage (`layer-veto`, above clip). Mobile action bar above the tab bar, thumb reach.
- **Accessibility:** HoldToConfirmButton „Veto (1 s halten)“; timer announces 30/10/5 s; reveal announced via live region.
- **Motion:** see 04-motion § Veto.

## CoinFlip
**Scope:** [1.0] · **Ref:** Coin3D, Game Options 1i

Who starts in Pick & Ban. Kopf = Compibert head (yellow), Schwanz = tail (cobalt).

- **Props / variants:** `flip?: {startAt, result: head | tail}`
- **States:** ready · in the air · landed · result banner
- **Slots:** —
- **Desktop / mobile:** Desktop 220 px coin; mobile 160.
- **Accessibility:** Live region announces „Kopf: Wilde Gurken fangen an“.
- **Motion:** see 04-motion § Coin.

## PickBanBoard
**Scope:** [1.0] · **Ref:** App Spielrunde 13

Snake order, current turn, pool, play order.

- **Props / variants:** `order: {party, action: ban | pick}[]`, `turnIndex`, `pool[]`, `myParty`
- **States:** our turn (banner in team colour + hold bar „X bannen“) · their turn (waiting) · bans done → picks · final play order
- **Slots:** —
- **Desktop / mobile:** Desktop: order strip top, pool grid, play order right. Mobile: strip scrolls, action bar bottom.
- **Accessibility:** Turn banner is a live region.
- **Motion:** ban stamp, pick slap (Flip), turn change `pb-turn`.

## LoserBanPanel
**Scope:** [1.0] (after T12) · **Ref:** App Spielrunde 12

Loser's Advantage: last place bans one game before each spin.

- **Props / variants:** `bannerParties[]`, `wheelEntries[]`, `myParty`
- **States:** we ban · others wait · two last places ban in table order · banned → host spins
- **Slots:** —
- **Desktop / mobile:** as PickBanBoard.
- **Accessibility:** as PickBanBoard.
- **Motion:** slice removal as wheel.

## LoserPickPanel
**Scope:** [1.0] (after T12) · **Ref:** App Spielrunde 14

Loser's Pick: last place chooses from the pool.

- **Props / variants:** `picker`, `pool[]`
- **States:** we choose · others wait · veto window · after veto: choose again · tie for last → wheel
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** —
- **Motion:** —

## NextGamePicker
**Scope:** [1.0] · **Ref:** App Spielrunde 15, App Lobby 10

Host sets the next game directly (Admin-Wahl and fallback in every mode).

- **Props / variants:** `pool[]`, `library[]`
- **States:** choosing · set → clip
- **Slots:** —
- **Desktop / mobile:** Sheet.
- **Accessibility:** Searchable list.
- **Motion:** —

## ResultEntry
**Scope:** [1.0] · **Ref:** DS Scoring, App Spielrunde 16

Host orders parties into places; ties; optional cosmetic score.

- **Props / variants:** `parties[]`, `pointsTable`, `editingGame?`
- **States:** sorting · tie toggle „gleichauf“ (1, 1, 3) · score entered · players waiting · correction mode
- **Slots:** —
- **Desktop / mobile:** Desktop drag list; mobile up/down buttons + drag handle.
- **Accessibility:** Arrow buttons per row („Nach oben“), live region for the order.
- **Motion:** row reorder Flip 0.62 s spring.

## Leaderboard
**Scope:** [1.0] · **Ref:** DS Scoring, App Spielrunde 17

Live standings.

- **Props / variants:** `standings[]`, `played`, `total`, `lastWinner?`
- **States:** after game (mini celebration) · calm · end (ceremony or tiebreaker)
- **Slots:** —
- **Desktop / mobile:** Side panel tab „Tabelle“ + stage after each game; mobile tab.
- **Accessibility:** Table semantics; rank changes announced politely.
- **Motion:** see 04-motion § Leaderboard.

## GameHistory
**Scope:** [1.0] · **Ref:** DS Scoring

All games with results; host can correct.

- **Props / variants:** `games[]`, `canEdit`
- **States:** default · „korrigiert“ marker
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** —
- **Motion:** —

## TiebreakerBanner
**Scope:** [1.0] · **Ref:** App Spielrunde 18

Announces a tie on 1st place and the tiebreaker wheel.

- **Props / variants:** `tied[]`
- **States:** announce · wheel · veto with remaining vetoes · tied again → spin again
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** `role="alert"` once.
- **Motion:** „Gleichstand!“ slam `scale 2→1` 0.4 s + `tie-alarm`.

## ChatPanel
**Scope:** [1.0] · **Ref:** DS Communication

Event chat for everyone incl. bench and stands.

- **Props / variants:** `messages[]`, `me`, `role`
- **States:** grouped (2 min) · own (right, yellow) · sending · failed + retry · deleted by host („Vom Host gelöscht“) · empty
- **Slots:** —
- **Desktop / mobile:** Desktop side panel; mobile tab / bottom sheet.
- **Accessibility:** `role="log"` + `aria-live="polite"`; input labelled „Nachricht an alle“.
- **Motion:** new message `y 8→0, fade` `dur-base`.

## ActivityFeed
**Scope:** [1.0] · **Ref:** DS Communication

Automatic events with timestamps.

- **Props / variants:** `events[]`
- **States:** 10 event types · sticky game headers · vetoes only after reveal · empty
- **Slots:** —
- **Desktop / mobile:** as ChatPanel.
- **Accessibility:** `role="log"`.
- **Motion:** as ChatPanel.

## EmoteBar
**Scope:** [1.0] · **Ref:** DS Communication

4 emotes: Klatschen, Freudentränen, Wütend, Compibert-Brüllen.

- **Props / variants:** `cooldownMs = 2000`
- **States:** ready · cooldown (ring drains, others dimmed) · collapsed to one button while an action bar shows (mobile)
- **Slots:** —
- **Desktop / mobile:** Desktop pill bottom-left of the stage; mobile floating bottom-left.
- **Accessibility:** `role="toolbar"`; each button labelled; cooldown as `aria-disabled` + „Kurz warten“.
- **Motion:** cooldown ring stroke-dashoffset linear 2 s.

## FloatingEmote
**Scope:** [1.0] · **Ref:** DS Communication

Emote rising above the sender's avatar.

- **Props / variants:** `emote`, `anchorEl`
- **States:** rise · fade
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** `aria-hidden`; feed does not log emotes.
- **Motion:** see 04-motion § Emote.

## PushAsk
**Scope:** [1.0] · **Ref:** App Systemzustände 28

Soft in-app ask before the browser prompt.

- **Props / variants:** —
- **States:** soft ask · native dialog · granted · denied (how to re-enable)
- **Slots:** —
- **Desktop / mobile:** Card under the poll after the first vote; mobile bottom sheet.
- **Accessibility:** —
- **Motion:** —

## PwaInstallHint
**Scope:** [1.0] · **Ref:** App Systemzustände 29

Install hint on Home after the first Event.

- **Props / variants:** —
- **States:** banner · iOS instruction sheet · installed
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** „Später“ hides for 14 days.
- **Motion:** —

## SoundUnlockPrompt
**Scope:** [1.0] · **Ref:** App Systemzustände 30

„Ton aktivieren“ when autoplay is blocked.

- **Props / variants:** —
- **States:** blocked · on
- **Slots:** —
- **Desktop / mobile:** Big button over the clip.
- **Accessibility:** Never steals focus; announced via a polite live region.
- **Motion:** pulse 2× then still.

## AwardCeremony
**Scope:** [1.0] · **Ref:** AwardCeremony, Compibert Momente 6b

„Pokal-Lauf“: banner, standings slide in, Compibert runs in with the trophy, trips/hits, stamp „SIEGER“, members pop in, dance, share.

- **Props / variants:** `standings[]`, `winner`, `members: {who, host?}[]`, `gag?: "trip" | "bonk"`
- **States:** run · share (wide) · share (square) · link copied
- **Slots:** `#share`
- **Desktop / mobile:** Desktop stage; mobile full screen.
- **Accessibility:** Winner and standings as real text, live region announces the winner. Skip button.
- **Motion:** see 04-motion § Ceremony.

## ShareImage
**Scope:** [1.0] · **Ref:** ShareImage (8a „Poster“)

Server-rendered share image (Satori).

- **Props / variants:** `format: wide (1200×630) | square (1080×1080)`, `event`, `date`, `rows`, `games`, `people`
- **States:** —
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** `alt` text = winner + standings.
- **Motion:** —

## ShareDialog
**Scope:** [1.0] · **Ref:** App Ende & Archiv 19

Download PNG or copy link with preview.

- **Props / variants:** `imageUrl`, `pageUrl`
- **States:** wide · square · copied
- **Slots:** —
- **Desktop / mobile:** Sheet.
- **Accessibility:** —
- **Motion:** shutter sound.

## BattleReplay
**Scope:** [1.0 – last ticket] · **Ref:** BattleReplay, battle-replay.js

„Wettrennen“: one lane per party, game by game.

- **Props / variants:** `parties[]`, `games: {name, pts[]}[]`, `autoplay`
- **States:** playing · 2× · next game · end · reduced (still frames + „Weiter“)
- **Slots:** —
- **Desktop / mobile:** Lanes adapt (≤4 58 px, ≤6 46, ≤8 38).
- **Accessibility:** Live line reports leader per game.
- **Motion:** see 05-assets § Battle replay storyboard.

## ArchiveList / ArchiveCard / ArchiveDetail
**Scope:** [1.0] · **Ref:** App Ende & Archiv 21, 22

Past Events you played in; read-only detail.

- **Props / variants:** `filter: alle | gewonnen | host`, `events[]`
- **States:** list · empty · no results · loading
- **Slots:** —
- **Desktop / mobile:** Desktop 3-col grid; mobile 1-col.
- **Accessibility:** —
- **Motion:** skeletons.

## Compibert
**Scope:** [MVP] head + still full · [1.0] all states · **Ref:** CompibertRig, Compibert Rig, compibert-options.js

The mascot: inline SVG rig + GSAP + state machine.

- **Props / variants:** `variant: head | bust | full | emote | tail`, `size`, `state`, `still?: boolean`, `accessory?: "hardhat"` (MVP)
- **Framed pose:** the bust is a framed upper-body pose with a round sticker frame, and the frame is part of the pose, so every use shows it (empty states, the set Date, sign-in). Head and full have no frame.
- **States:** 16 states (see 04-motion)
- **Slots:** —
- **Desktop / mobile:** Max one animated full body at a time.
- **Accessibility:** Always `aria-hidden`, never focusable.
- **Motion:** see 04-motion § Compibert.

## GameLibrary / GameForm
**Scope:** [1.0] · **Ref:** App Bibliothek & Profil 23, 24

Global library; create/edit games with YouTube preview and duplicate hint.

- **Props / variants:** `games[]`; form: `name, image, youtubeUrl, start, length=30, players, formats`
- **States:** list · detail · no results · loading; form: new with preview · duplicate hint · broken YouTube link · editing (creator or admin only, else aria-disabled + reason)
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** Preview player labelled.
- **Motion:** —

## AdminUserTable
**Scope:** [1.0] · **Ref:** App Bibliothek & Profil 26

User list, search, grant/revoke host right.

- **Props / variants:** `users[]`
- **States:** list · search · revoke confirm
- **Slots:** —
- **Desktop / mobile:** Desktop table; mobile cards.
- **Accessibility:** Table semantics.
- **Motion:** —

## Confetti
**Scope:** [1.0] · **Ref:** DS Scoring, AwardCeremony

Sticker confetti (white rim, hard shadow).

- **Props / variants:** `origin`, `count`
- **States:** —
- **Slots:** —
- **Desktop / mobile:** count halves on mobile.
- **Accessibility:** `aria-hidden`, `pointer-events:none`, `layer-confetti`.
- **Motion:** see 04-motion § Confetti; skipped on reduced motion.
- **Built (#80):** `confetti(layer, x, y, count)` in `app/utils/confetti.ts`, on the Web Animations API (the app ships no GSAP). First user: the „Neu“ stamp on Neuigkeiten, with its smaller burst (18 desktop, 10 mobile).

## ReleaseCard
**Scope:** [1.x] · **Ref:** Neuigkeiten · **Spec:** 09-neuigkeiten § ReleaseCard, § CopyLinkButton, § NewStamp

One Release from `CHANGELOG.md` on `/neuigkeiten`: version, name, date, copy-link button, intro, groups. CopyLinkButton and NewStamp are built into it, not as components of their own.

- **Props / variants:** `release: Release` (from `shared/changelog.ts`), `newest?: boolean`
- **States:** default · newest (NewStamp, version with the `primary` offset shadow) · newest first view (stamp lands once per device: `localStorage["compies.news.seen"]` through `useNewsSeen`)
- **Slots:** —
- **Desktop / mobile:** Surface card, `border-memphis`, radius 20, `shadow-card`; version 44 / 32, name 30 / 24.
- **Accessibility:** `<section id="1.2.0" aria-labelledby>`, `h2` with `tabindex="-1"`, version read as „Version 1.2.0“. Copy button: IconButton with „Link zu Version 1.2.0 kopieren“, toast „Link kopiert“ or the error toast with the link.
- **Motion:** NewStamp timeline on the Web Animations API. Compibert does not cheer yet: the CompibertBus (`reveal`) is still to come.

## ChangeGroup
**Scope:** [1.x] · **Ref:** Neuigkeiten · **Spec:** 09-neuigkeiten § ChangeGroup

`h3` label pill and list for one of the five groups, with one nested level. Colour, icon and bullet shape per group.

- **Props / variants:** `group: ChangeGroup` (`type: neu | geaendert | behoben | entfernt | sicherheit`)
- **States:** —
- **Slots:** —
- **Desktop / mobile:** Body 17 / 16.
- **Accessibility:** Real `h3`, `ul > li`; bullets and icon `aria-hidden`. The parser refuses unknown group names, so there is no fallback group.
- **Motion:** —

## ChangelogInline
**Scope:** [1.x] · **Ref:** Neuigkeiten · **Spec:** 09-neuigkeiten § ChangelogInline

Renders the parser's inline nodes: text, bold, code, links. A link named `#64` becomes the IssueChip; parentheses that only wrap Issue chips are dropped.

- **Props / variants:** `nodes: Inline[]`
- **States:** —
- **Slots:** —
- **Desktop / mobile:** Same.
- **Accessibility:** Links `target="_blank" rel="noopener noreferrer"`, title „Öffnet in neuem Tab“; IssueChip `aria-label` „Issue 64 auf GitHub, öffnet in neuem Tab“.
- **Motion:** colour `dur-fast`.

## ReleaseNav
**Scope:** [1.x] · **Ref:** Neuigkeiten · **Spec:** 09-neuigkeiten § ReleaseRail, § ReleaseJumpStrip

All Releases as links to `#<version>`. `variant="rail"`: the sticky card from `md` up, the Release in view marked with `aria-current`. `variant="strip"`: the „Springe zu“ pill row below `md`. The page does the scroll-spy and the jump (scroll, focus the `h2`, `history.replaceState`).

- **Props / variants:** `variant: rail | strip`, `current?: version`; emits `jump(version)`
- **States:** item default · hover · current (rail) · newest (mini „Neu“ chip in the rail, `primary` pill in the strip)
- **Slots:** —
- **Desktop / mobile:** Rail only from `md`, strip only below.
- **Accessibility:** `<nav aria-label="Versionen">`; link names „Version 1.2.0, Mehr Termine, 2. Nov. 2026, neu“.
- **Motion:** jump scroll smooth, `auto` under reduced motion; spy paused for 700 ms after a jump.

## VersionLabel
**Scope:** [1.x] · **Ref:** Neuigkeiten (state Versionslabel) · **Spec:** 09-neuigkeiten § VersionLabel

„v1.2.0“ chip linking to `/neuigkeiten`. The version is the newest Release in `CHANGELOG.md`; the changelog guard test keeps `package.json` at the same version.

- **Props / variants:** `unseen?: boolean` (user menu only)
- **States:** default · hover/focus (`primary` fill) · unseen (dot)
- **Slots:** —
- **Desktop / mobile:** 28 px pill, 44 px hit area via `::before`. In the user menu's last row, the sign-in footer and the Neuigkeiten footer (there it scrolls to the top).
- **Accessibility:** „Version 1.2.0, zu den Neuigkeiten“, with „, neu“ when unseen; `role="menuitem"` in the user menu.
- **Motion:** colour `dur-fast`.

## LegalLinks
**Scope:** [1.x] · **Ref:** Neuigkeiten (state Versionslabel)

Impressum, Datenschutz and Neuigkeiten as 13/700 `ink-2` text links, 44 px high. Used with VersionLabel in the user menu's last row (`role="menuitem"`), the sign-in footer and the Neuigkeiten footer.

- **Props / variants:** `role?: "menuitem"`
- **States:** default · hover (`ink`, underlined) · current page (`aria-current="page"`, 800 `ink`)
- **Slots:** —
- **Desktop / mobile:** Same; the parent lays the row out.
- **Accessibility:** Inside `<nav aria-label="Rechtliches">` outside the menu.
- **Motion:** —

