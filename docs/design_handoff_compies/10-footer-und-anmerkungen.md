# 10 Footer und Anmerkungen

Four small changes: a page footer with a „NEU“ chip, a slimmer profile menu, the Note popover/dialog in „Wer kann wann?“, and the reworked Note editor on a Slot card. Same format as `02-components.md`. Ref = `reference/Footer und Anmerkungen.dc.html` (artboard ids in brackets), `reference/PageFooter.dc.html`.

**New tokens: none.** Everything uses existing colour, type, radius, shadow, layer and motion tokens.

## Index
- [`PageFooter`](#pagefooter) new
- [`NewChip`](#newchip) new
- [`VersionLabel`](#versionlabel) removed
- [`AppShell`](#appshell-change) changed
- [`UserMenu`](#usermenu-change) changed
- [`PollMatrix`](#pollmatrix-change) changed
- [`NotePopover`](#notepopover) new
- [`NoteDialog`](#notedialog) new
- [`PollSlotCard`](#pollslotcard-change) changed
- [`NoteEditor`](#noteeditor) new
- [`IconButton`](#iconbutton-change) changed (new `tone`)
- [Copy keys](#copy-keys)

## PageFooter
**Scope:** new · **Ref:** Footer und Anmerkungen 1a–1f, PageFooter.dc.html

One footer at the bottom of every page: „Impressum ◆ Datenschutz ● Version 1.2.0“. Nothing else.

- **Props / variants:** `variant: page | menu` (menu = the same links inside UserMenu, left-aligned, `role="menuitem"`, no band), `current?: 'impressum' | 'datenschutz' | 'neuigkeiten'`, `unseen: boolean` (shows NewChip; parent passes `signedIn && !seenNewest`), `dock?: boolean` (reserve room for the HostDock), `version` (from the newest Release in CHANGELOG, never hard-coded)
- **Layout:** full-width band, `surface` fill, `border-top: var(--cp-bw) solid line` (bookends the AppHeader). Padding 6 px 16 px, row centred, `column-gap: 12px`, wraps if needed. Links are inline-block, 14 px / 20 px line, weight 700, ink, padding 12 px 2 px → 44 px hit area. Separators: 9 px diamond (`mint`, 2 px line, rotated 45°) between Impressum and Datenschutz, 9 px circle (`primary`, 2 px line) before Version, both `aria-hidden`. „1.2.0“ in `font-num` 13 px.
- **States:**
  - default: underline 2 px `line-soft`, offset 5 px
  - hover: „Textmarker“ — `linear-gradient(transparent 55%, primary 55%)` on the content box grows `background-size 0% → 100%` from the left; underline turns `line`
  - focus-visible: focus ring token (3 px `focus`, offset 3, radius 8) around the 44 px box
  - current page: marker fixed at 100 %, weight 800, no underline, `aria-current="page"` (Impressum on /impressum, Datenschutz on /datenschutz, Version on /neuigkeiten)
  - unseen: NewChip after the number, link name „Version 1.2.0, neu“
  - dock: adds a 96 px spacer under the links (dock 66 px + 24 px offset + 6 px air). The dock floats in the band below the links; nothing clickable ever sits under it.
- **Where it shows:**
  - Signed in: hub pages, Event page, Impressum, Datenschutz, Neuigkeiten from **md (768 px)** up. Below 768 signed-in Users get the links in UserMenu instead (no page footer).
  - Signed out (sign-in, Impressum, Datenschutz, Neuigkeiten): at every width, 390 included.
  - Placement: last child of the scroll container; `margin-top: auto` in a min-height column so it sits at the bottom of short pages and at the end of long ones.
  - /neuigkeiten: replaces the page's own inline footer.
- **Slots:** —
- **Desktop / mobile:** identical styling; mobile only appears signed out.
- **Accessibility:** `<footer>` (contentinfo) with `<nav aria-label="Rechtliches und Version">`. „Version …“ link → `/neuigkeiten` (newest Release first). Contrast: ink on surface 17:1, ink on primary 13.6:1.
- **Motion:** marker `background-size` `dur-base` `ease-out`, underline colour `dur-fast`. Reduced: no transition, marker appears instantly.

## NewChip
**Scope:** new · **Ref:** Footer und Anmerkungen 2a

Small sibling of the „Neu“ NewStamp on /neuigkeiten.

- **Props / variants:** — (rendered by PageFooter / UserMenu when `unseen`)
- **Visual:** height 20, padding 0 6, `border: 2px solid line`, radius pill, `primary` / `on-primary`, „Neu“ 12 px 800, letter-spacing .06em, uppercase, `rotate(-6deg)` (same tilt as the stamp), 8 px gap to the version number. No icon, no shadow.
- **Visibility rule:** signed-in only. Shown while `localStorage['compies.news.seen'] !== newestVersion` on this device; opening /neuigkeiten writes the newest version (key already used by the Neuigkeiten page). Replaces the old unseen dot on the VersionLabel pill. No hint on the avatar. Signed-out visitors never see it.
- **States:** visible · gone
- **Accessibility:** `aria-hidden="true"`; the meaning lives in the link name „Version 1.2.0, neu“.
- **Motion:** one entrance per page load: `scale .5→1` + `opacity 0→1`, `dur-base`, `ease-out`, 360 ms delay after mount. No pulse, no loop. Reduced (`--cp-motion: reduced` or the OS setting): no entrance, chip is simply there.

## VersionLabel
**Scope:** removed

The „v1.2.0“ pill and its unseen dot go away everywhere (UserMenu, sign-in, /neuigkeiten). Its job moves to PageFooter („Version 1.2.0“) + NewChip.

## AppShell (change)
- New slot `#footer` rendering PageFooter as the last child of the stage scroller.
- Rules: signed in → `hidden below md`; signed out → always. `kind: session` with host on desktop → `dock` prop true.

## UserMenu (change)
**Ref:** Footer und Anmerkungen 3a, 3b

- **Desktop (≥ 768):** 280 px dropdown (`surface`, `bw` line, radius 16, `shadow-card`, padding 8) with exactly: Display name line (Avatar 40 + name 16 / 800, `role="none"`, truncates) · 2 px `line-soft` divider · „Abmelden“ menuitem (log-out icon 18, 15 / 700, 44 px, hover `paper-2`). Removed: provider line, Profil, legal links, VersionLabel.
- **Phone (< 768):** full width (12 px from the edges), same items, then a divider and `PageFooter variant="menu"` (Impressum ◆ Datenschutz ● Version 1.2.0 + NewChip).
- **Avatar trigger:** no unseen hint. Open state: `paper-2` fill + 2 px line ring, `aria-expanded="true"`.
- **Accessibility:** `role="menu"`; arrow keys move through Abmelden and the three links in order; Esc closes and returns focus to the avatar.
- **Motion:** unchanged.

## PollMatrix (change)
**Ref:** Footer und Anmerkungen 1f, 4a–4c

- Votes: Ja (check, circle, `success`) · Meh (minus, circle, `warning`) · Nein (x, 6 px square, surface) · Noch offen (dashed circle).
- Name column is `position: sticky; left: 0` (`z-sticky`) with a 2 px `line-soft` right edge. Desktop 200 px + slot columns ≥ 96; mobile 130 + 72 px, horizontal scroll.
- **Cell with a Note:** the vote icon sits in a `<button type="button">`, 44 × 44, radius 12, with a 10 px dot (`primary`, 2 px line) at top 4 / right 4. Hover/open: `paper-2` fill. `aria-label="Bea, Sa 25.10. 20:30: Meh, mit Anmerkung"`, `aria-describedby` → NotePopover id. Touch: `aria-haspopup="dialog"`.
- **Cell without a Note:** unchanged (`role="img"` + label), not focusable, opens nothing. The native `title` tooltip is removed everywhere.
- **Input routing:** `pointerenter` with `pointerType === 'mouse'` → NotePopover; keyboard focus (`:focus-visible`) → NotePopover; `click` after a `pointerdown` with `pointerType` touch/pen → NoteDialog. Focus that follows a touch is ignored for the popover.
- **On focus**, if the cell is partly under the sticky column or past the right edge, scroll the matrix by the overlap + 8 px first, then open.
- Scrolling the matrix (or the page) closes an open popover.

## NotePopover
**Scope:** new · **Ref:** Footer und Anmerkungen 4a, 4c

- **Props / variants:** `anchor: HTMLElement`, `member: {name, avatarUrl}`, `vote: yes | maybe | no`, `note: string`
- **Content:** Avatar 24 + Display name (14 / 800, truncates) + vote chip right (24 px pill, 2 px line, vote fill: Ja `success`, Meh `warning`, Nein `ink` with `paper` text; icon in a 16 px surface circle) · the Note in „…“, 14 / 600 / 1.4, wraps.
- **Visual:** width `min(280px, 100vw − 24px)`, padding 12 14 14, `bw` line, radius 14, `surface`, `shadow-soft` (tooltip shadow). Arrow: 14 px square rotated 45° with the two outer borders, follows the cell.
- **Placement:** `<Teleport to="body">`, `position: fixed`, `z-index: var(--cp-z-sheet)` — above the sticky column and the HostDock, below modals. Prefers above the cell (12 px gap); flips below if it would leave the viewport. Horizontally centred on the cell, clamped 12 px from both viewport edges; the arrow is clamped 20 px inside the box so it always points at the cell.
- **States:** closed · open (hover) · open (focus, focus ring stays on the cell)
- **Accessibility:** `role="tooltip"`, always mounted (hidden when closed) so `aria-describedby` works. Opens on hover and keyboard focus, Esc closes (focus stays on the cell), pointer can move onto the popover without it closing (close delay 120 ms) — WCAG 1.4.13.
- **Motion:** enter `opacity 0→1` + `y 4→0` (from below: `−4→0`), `dur-fast`, `ease-out`; leave `dur-instant`. Reduced: fade only.

## NoteDialog
**Scope:** new · **Ref:** Footer und Anmerkungen 4b

Small centred dialog for touch (not a bottom sheet).

- **Props / variants:** as NotePopover
- **Content:** Avatar 32 + Display name as the dialog title (Lilita 26) + close IconButton (✗, 36 visual / 44 hit) · vote chip (30 px, 14 px text) · Note 16 / 600.
- **Visual:** overlay `--cp-overlay`; card `max-width: 320px`, 24 px from the edges, padding 14 12 20 18, `bw` line, radius 20, `surface`, `shadow-modal`. `z-modal`.
- **States:** open · closing
- **Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → name. Focus moves to „Schließen“ on open and is trapped inside (Tab stays). Closes via ✗ („Schließen“), tap on the overlay, or Esc; focus returns to the cell.
- **Motion:** as ConfirmModal: card `scale .96→1` + fade, `dur-base`, `ease-out`; overlay fade `dur-fast`. Reduced: fade.

## PollSlotCard (change)
**Ref:** Footer und Anmerkungen 5a, 5b

- Vote labels are Ja / Meh / Nein (counts line „6 Ja, 1 Meh, 0 Nein“).
- After voting, below the radiogroup and a 2 px dashed `line-soft` rule, one of:
  - no Note: text button „+ Anmerkung“ (13 / 700, 44 px, `aria-label="Anmerkung hinzufügen"`)
  - saved Note: „Deine Anmerkung · sehen alle“ (12 / 700 ink-2) + Note 13 / 600 + pencil IconButton „Anmerkung bearbeiten“ (32 visual / 44 hit)
  - editing: NoteEditor
- Host, desktop: „Termin festlegen“ stays the full-width 44 px pill below everything (`primary` on the best slot, else `surface`; `shadow-sm`). The three actions now read differently: two small round icons vs one wide labelled pill. Mobile: host confirms via the crown sheet, not in the card (unchanged).

## NoteEditor
**Scope:** new (replaces TextField + 2–3 equal secondary buttons) · **Ref:** Footer und Anmerkungen 5a, 5b

- **Props / variants:** `modelValue: string`, `maxlength = 80`, emits `save(value)`, `cancel()`
- **Top row:** `<label>` „Anmerkung“ 13 / 800 · „sehen alle“ 12 / 600 ink-2 (`aria-describedby` of the field) · right: counter „12/80“, `font-mono` 12 / 700, always visible; `ink-2`, from 72 chars `warning-fg`.
- **Field:** `<textarea rows="1" maxlength="80" enterkeyhint="done">`, grows with its text (`field-sizing: content`; fallback: set `height = scrollHeight + borders` on input), `overflow: hidden`, `resize: none` — never an inner scrollbar. 13 / 600 / 1.4 (same as the saved Note), padding 9 11, 2 px line, radius 10, `surface-2`. Placeholder „z. B. kann maximal bis 20:30“ in `ink-2`. Focus: border `focus` + 1 px focus shadow (= 3 px, TextField rule).
- **Keys:** Enter saves (not while IME composing), Esc cancels. Pasted line breaks become spaces; input is cut at 80.
- **Actions:** directly below, right-aligned, nothing else: IconButton ✓ `tone="success"` „Anmerkung speichern“, IconButton ✗ `tone="error"` „Abbrechen“. 36 px visual, 44 px hit areas, touching (no gap between hit areas).
- **States:** empty (placeholder) · typing · near limit (≥ 72, warning-fg counter) · at limit (80/80) · saving (✓ shows spinner, `aria-busy`) · error (toast, text kept)
- **After save / cancel:** focus moves to the pencil (saved) or „+ Anmerkung“ (empty). Saving an empty field removes the Note.
- **Desktop / mobile:** identical; card is 1 column on mobile.
- **Accessibility:** counter is `aria-hidden`; a polite live region says „Noch 16 Zeichen“ from 64 chars (80 %, TextField rule).
- **Motion:** border colour `dur-fast`. Nothing else.

## IconButton (change)
- New prop `tone?: 'success' | 'error'` for solid fills: `success` / `on-success`, `error` / `on-error`, 2 px line, `shadow-sm`. Size 36 added (hit area stays 44).
- **Motion:** as AppButton (hover lift −1 px, press translate by shadow, `dur-instant` `ease-snap`). Reduced: colour only.

## Copy keys
Add to `de.json` (see 06-copy):

```
footer.nav_label        Rechtliches und Version
footer.impressum        Impressum
footer.datenschutz      Datenschutz
footer.version          Version {version}
footer.version_new_a11y Version {version}, neu
footer.new_chip         Neu
menu.sign_out           Abmelden
matrix.cell_a11y        {name}, {slot}: {vote}
matrix.cell_note_a11y   {name}, {slot}: {vote}, mit Anmerkung
matrix.note_close       Schließen
note.label              Anmerkung
note.audience           sehen alle
note.placeholder        z. B. kann maximal bis 20:30
note.counter            {n}/{max}
note.remaining_a11y     Noch {n} Zeichen
note.save               Anmerkung speichern
note.cancel             Abbrechen
note.add                Anmerkung hinzufügen
note.edit               Anmerkung bearbeiten
note.saved_label        Deine Anmerkung · sehen alle
vote.yes / vote.maybe / vote.no   Ja / Meh / Nein
```

Remove: `version_label.*`, `menu.profile`, `menu.signed_in_via`, the old note help text („Sehen alle im Event. Zum Beispiel: …“).
