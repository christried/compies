# 18 Notizen (Rich-Text)

The Host's note per game („Notizen“, in their library) and, new, per game per Event („Notizen für dieses Event“) become rich text: **Fett, Kursiv, one Überschrift level, Liste, Nummerierte Liste, Link.** Nothing else (no images, tables, colours, quotes, code, nesting). Only the Host writes and reads them. Ref: `Notizen.dc.html` (all pictures), `NotizEditor.dc.html` (the field, live in § 6), `NotizText.dc.html` + `notizen.js` (renderer rules, link check, counter), `NotizBlock.dc.html` (the read-only block), `NotizScreen.dc.html` (the frames). TextField, Sheet, ConfirmModal, GameCard in 02-components.

**New tokens: none.** Field = TextField chrome. Popover look = border `--cp-bw` `line`, radius 18, `shadow-modal`. Event disc = `--cp-primary`. Links = `--cp-info-fg`. Motion = existing durations and eases.

Decisions:
1. The toolbar sits **inside** the field's border, at the top, always visible (also unfocused), never scrolls away. It fits one row down to 320.
2. Link control: **popover under the selection ≥ 980**, **bar inside the field under the toolbar < 980** (no sheet on a sheet; stays above the keyboard).
3. Over 2000 characters is allowed while typing (no hard cut: a paste must not lose text); it is an error, and saving is blocked.
4. Event note vs game note: disc + label + panel. Event = Sonne disc with calendar, framed `surface` panel, always first. Game = surface disc with sticky note, `paper-2` panel.
5. Finished Event: the Event note is read-only (dashed, no toolbar, lock chip „Event beendet“). The game note stays editable (it belongs to the library).

---

## Additions to 02-components.md

## NoteEditor
**Scope:** [1.4] · **Ref:** Notizen § 1, § 2, NotizEditor

Rich-text TextField. Built on TipTap 2 (Vue 3) with only: Document, Paragraph, Text, Bold, Italic, Heading `{levels: [3]}`, BulletList, OrderedList, ListItem, Link `{openOnClick: false, autolink: false, protocols: ['http','https'], HTMLAttributes: {target: '_blank', rel: 'noopener noreferrer nofollow'}}`, Placeholder, CharacterCount (no `limit`), History. No HardBreak shortcuts beyond Shift+Enter. Lists one level (no Tab indent).

- **Deviation (0.16, #454):** the Tiptap major version and the exact extension list are #454's choice (a pinned version at least two weeks old); what the editor emits must be what `shared/notes-doc.ts` accepts (ADR 0019).

- **Props / variants:** `modelValue: NoteDoc` (see Data), `variant: game | event`, `label?` (default by variant), `help?`, `placeholder?`, `max = 2000`, `readonly?` (finished Event), `disabled?` (while saving), `minHeight`, `maxHeight`
- **Emits:** `update:modelValue`, `update:count`, `invalid(boolean)`
- **Anatomy (top → bottom):**
  - Label row: disc 26 px (2 px `line` border; game: `surface` + `sticky-note` 14 ink; event: `primary` + `calendar` 14 `on-primary`; finished: `paper-2` + `ink-2`) · `<label>` 14 / 700 · finished only: chip „Event beendet“ (lock 12, 24 high, 2 px `line`, `paper-2`, 12 / 700). Gap 8, row min-height 26, 6 px to the field.
  - Field: border `--cp-bw` solid `line`, radius 12, `surface`. Contains NoteToolbar (top) → [NoteLinkControl bar, < 980 only] → content.
  - Content: padding 12 14 14, 16 / 1.5 (never smaller: iOS zoom), ProseMirror root. `min-height` 168 (game, ≥ 600) / 132 (< 600) / 96 (event). `max-height` 400 / 300, with the keyboard up `min(300px, visualViewport.height − 200px)`; then `overflow-y: auto`, `scrollbar-width: thin`.
  - Help row (6 px below): left help or error (13 / 500 `ink-2`; error 13 / 700 `error-fg` + `circle-alert` 16), right NoteCounter. `justify-content: space-between`, gap 12.
- **States:**
  - empty: placeholder in content, `ink-2` (game „z. B. Einstellungen, Aufwärmen, Siegbedingung, Hausregeln“, event „z. B. heute nur Bo1“). The label stays; placeholder is never the label.
  - hover: none on the field (the toolbar buttons have their own).
  - focus (caret in content): `outline: 3px solid var(--cp-focus); outline-offset: 2px` on the field (DS input focus). Focus inside the link control: field ring off, selection tint on (see NoteLinkControl).
  - near limit (≥ 1600): counter shows; ≥ 1800 counter `warning-fg` 700.
  - over limit (> 2000): border `error-fg`, help → error „Höchstens 2000 Zeichen.“ with icon, counter „37 zu viel“ `error-fg` 700, `aria-invalid="true"`. The form's „Speichern“ is `aria-disabled` (dashed, `paper-2`, `ink-2`) with „Erst die Notizen kürzen.“ under it.
  - disabled (only while saving, ≤ 1 s): border dashed `ink-3`, field + toolbar `paper-2`, text + icons `ink-3`, help „Wird gespeichert …“ with `loader-circle`, `aria-disabled` on toolbar buttons, `contenteditable=false`.
  - readonly (finished Event): border **dashed `line`**, no toolbar, text `ink` (stays readable), help „Das Event ist beendet. Diese Notizen bleiben so stehen.“ with `lock`. Content not focusable as a textbox (render NoteContent inside the field chrome).
- **Behaviour:**
  - Paste: keep only the six formats (TipTap schema drops the rest: colours, images, tables become text; `<b>`→strong, `<i>`→em, `h1–h6`→h3). Plain-text paste keeps line breaks as paragraphs.
  - Markdown input rules on: `## ` → heading, `- ` / `* ` → list, `1. ` → numbered, `**x**`, `*x*`. Typing a URL does **not** auto-link (no autolink); links only via the control.
  - Bold inside a heading is off (Lilita has one weight): the Fett button is disabled there, Strg+B is a no-op.
  - Heading button on a list item turns the item into a heading (lifts it out of the list).
  - Empty paragraphs at the end are trimmed on save; max one empty paragraph in a row.
- **Desktop / mobile:** identical field; < 980 the link control is a bar inside the field. On phones the focused field scrolls so the toolbar + caret sit above the keyboard (`scrollIntoView({block:'nearest'})` on the field via `visualViewport` resize; do not use it on the page shell).
- **Accessibility:** content `role="textbox" aria-multiline="true"`, `aria-labelledby` = label, `aria-describedby` = help/error id, `aria-invalid` over the limit. Label click focuses the content. Counter `aria-hidden`; a polite live region speaks „Noch {n} Zeichen“ at 1600, 1800, 1900, 1950, and „Höchstens 2000 Zeichen.“ once when crossing 2000.
- **Motion:** field outline/border colour `dur-fast` `ease-snap`. Nothing else moves; formats apply instantly. Error: no shake (never).

## NoteToolbar
**Scope:** [1.4] · **Ref:** Notizen § Toolbar

- **Buttons (order, groups):** [Fett `bold`, Kursiv `italic`] · [Überschrift `heading`] · [Liste `list`, Nummerierte Liste `list-ordered`] · [Link `link`]. Lucide, 20 px, stroke 2.5.
- **Size:** each button 44 × 44 (hit area) with a 36 × 36 visual square, radius 8, centred. Toolbar padding 4, bottom border 2 px `line-soft`, top corners radius 9 (inside the field's 12). Separators: 2 × 24 px `line-soft`, radius 1, margin 0 3 px. Width = 8 + 6·44 + 3·8 = **296 px**.
- **Wrap:** `display: flex; flex-wrap: wrap`, each group a nowrap unit. Container query on the toolbar: **< 296 px → separators hidden** (272 px, so 320 phones stay one row: field inside 282); **< 272 px** groups wrap whole (280 Galaxy Z Fold cover: B I H • 1. in row 1, Link in row 2). Never horizontal scroll. 390 (inside 352; sheet 346) = one row with separators.
- **States per button:** default (ink icon, transparent) · hover, pointer only (square `paper-2`) · pressed `aria-pressed="true"` (square `ink`, icon `paper`; dark flips automatically) · focus-visible (3 px `focus` outline on the 36 px square, offset 0, so it stays inside the 44 and is never clipped by the field) · disabled `aria-disabled="true"` (icon `ink-3`, no hover, still focusable, the tooltip says why: „Fett · in Überschriften nicht“) · whole toolbar disabled with the field.
- **Pressed logic:** Fett / Kursiv = mark active at the selection; Überschrift = block is h3; Liste / Nummerierte Liste = inside that list; Link = never `aria-pressed`, uses `aria-haspopup="dialog"` + `aria-expanded` (true while the control is open); its square is ink while the caret is inside a link or the control is open.
- **Tooltip (pointer ≥ 980 and keyboard focus):** under the button, 32 high, radius 8, `ink` fill, `paper` text 13 / 700, shortcut in `font-mono` 12 at .8 („Strg+B“, Mac „⌘B“), `shadow-soft` (tooltip rule). 500 ms hover delay, instant on focus. Not on touch.
- **Keyboard:** `role="toolbar" aria-label="Formatierung" aria-controls=<content id>`, one tab stop, ←/→/Home/End move (roving tabindex), Enter/Space activate. `aria-keyshortcuts` on Fett (`Control+B` / `Meta+B`), Kursiv, Link (`Control+K`). Buttons use `mousedown.prevent` so the text selection survives a click.
- **Motion:** square fill + icon colour `dur-instant` `ease-snap` (CSS). Tooltip as in 04.

## NoteLinkControl
**Scope:** [1.4] · **Ref:** Notizen § 1 (Link einfügen, Link: kein http(s)), § All states (Edit a link)

- **Opens from:** the Link button or Strg/⌘+K. Target = the selection, or the whole link under the caret, or (nothing selected) the caret position.
- **≥ 980 popover:** inside the field's positioning context, `top` = selection rect bottom + 10, `left` = selection left − 14, clamped to 8 … field width − 328. Width 320, padding 14 14 10, border `--cp-bw` `line`, radius 18, `surface`, `shadow-modal`, `layer` above the field content. No tail.
- **< 980 bar:** directly under the toolbar, full field width, `paper-2`, padding 10 10 12, bottom border 2 px `line-soft`. Pushes the text down.
- **Content (both):** label „Adresse“ 14 / 700 · input 48 high, radius 12, border `--cp-bw` `line`, `surface`, `link` 16 icon `ink-2` left, `type="url" inputmode="url" autocomplete="off" spellcheck="false"`, placeholder „https://“, 16 px · error line · actions right-aligned, wrapping: [„Link entfernen“ ghost with `unlink` 16, only when editing, pushed left] · „Abbrechen“ ghost · „Übernehmen“ primary (sm 40 in the popover with 44 hit area, 44 in the bar).
- **Selection tint:** while focus is in the control, the target text keeps a visible selection: `background: color-mix(in srgb, var(--cp-primary) 62%, transparent)` + 2 px spread of the same (ProseMirror decoration, not a mark; removed on close).
- **Validation (on Übernehmen / Enter, not while typing):** trim · has a scheme → only `http:` / `https:` pass · no scheme and looks like a domain (`x.yz…`) → prefix `https://` · then `new URL()` must parse with a dotted host. Fail → input border `error-fg`, `circle-alert` 18 in the input, message „Nur Adressen mit http oder https.“ (13 / 700 `error-fg`, `role="alert"`, linked via `aria-describedby`, `aria-invalid="true"`). Typing clears the error. The server repeats the check (see Data).
- **Apply:** selection → link mark with `href`; caret only → inserts the address as text + link; editing → updates `href`. Link text is never changed by the control.
- **Remove:** „Link entfernen“ unsets the mark on the whole link, text stays.
- **Close:** Übernehmen, Abbrechen, Esc, click outside → focus returns to the content with the selection restored (after apply: caret after the link).
- **Accessibility:** popover `role="dialog" aria-label="Link"`, focus to the input on open; bar `role="group" aria-label="Link"`. Tab cycles input → buttons; Esc closes.
- **Motion:** popover `opacity 0→1, y −4→0` `dur-fast` `ease-out`, close `dur-fast` `ease-in`. Bar `height 0→auto` `dur-base` `ease-out`. Reduced: opacity only / cut.

## NoteCounter
**Scope:** [1.4]

- Counts the **visible text**: Unicode graphemes of the text nodes; no markup, no block/line breaks, a link counts its text (not its address). TipTap: `editor.storage.characterCount.characters()` with `mode: 'textSize'` gives exactly this.
- Hidden below 1600 (80 %, TextField rule). 1600–1799: „noch {n} Zeichen“ 13 / 500 `ink-2`. 1800–2000: same text, `warning-fg` 700. > 2000: „{n} zu viel“ `error-fg` 700 + field error.
- Right of the help row, `font-variant-numeric: tabular-nums`, nowrap, `aria-hidden` (the live region speaks).

## NoteContent (read-only renderer)
**Scope:** [1.4] · **Ref:** Notizen § 3, NotizText, `notizen.js`

Renders a NoteDoc (TipTap `generateHTML` with the same extensions, or the sanitised HTML) inside a `.cp-note` scope. One stylesheet, three sizes.

- **Deviation (0.16, ADR 0019):** the renderer is `RichNotes.vue` (#728), which walks the stored `NotesDoc` into its own elements; no `generateHTML`, no HTML string, no `v-html`. The rules below are its look (#729). Its heading level prop is `headingLevel: 'h3' | 'h4'`.

- **Props:** `doc: NoteDoc`, `size: sm | md | lg`, `headingLevel = 3` (set per place so the outline is right: popover/sheet/dialog title is the h2 → 3; Round card → 4; library section h2 → 3).
- **Rules (sm / md / lg):**
  - text 14/1.45 · 15/1.5 · 16/1.55, `ink`, 500, `text-wrap: pretty`, `overflow-wrap: break-word`
  - p: margin-bottom 6 / 8 / 10
  - heading: `font-display` (Lilita) 17 / 18 / 20, line-height 1.15, `text-wrap: balance`, margin-top 12 / 14 / 16, margin-bottom 4
  - ul: `list-style: square`, padding-left 20 / 22 / 24 · ol: `decimal`, tabular numbers, padding-left +2 · li: margin 2 / 3 / 3 px 0, padding-left 2. Markers inherit `ink`.
  - strong 800 · em `font-style: italic` (Bricolage has no italic; keep `font-synthesis: style`)
  - a: `color: var(--cp-info-fg)`, 650, underline 2 px, offset 3 px, `overflow-wrap: anywhere`; after the text a word joiner (U+2060) + `arrow-up-right` icon at 12 / 13 / 14 px, stroke 2.75, so the ↗ never wraps alone; hover `ink` + underline 3 px; focus-visible DS ring. Always `target="_blank" rel="noopener noreferrer nofollow"`; `title` = full address; visually hidden „(öffnet in neuem Tab)“ appended for screen readers.
  - Display rule: if a link's text equals its address, show it without `https://`, `http://` and `www.` (the `href` stays full).
  - first block margin-top 0, last block margin-bottom 0.
- **Editor uses the same rules** at 16 / 1.5, heading 20, margin-top 14, and **without** the ↗ (it is not clickable while editing; Strg/⌘+click opens it).
- Contrast: `info-fg` on `paper-2` light ≈ 5.6:1, dark ≈ 8:1; on `surface` higher.

## NoteBlock
**Scope:** [1.4] · **Ref:** NotizBlock

One read-only note with its header; used in the card popover/sheet, the Round card and the game dialog.

- **Props:** `kind: game | event`, `doc`, `size`, `sub?`, `editable?` (pencil), `finished?`, `bare?` (no panel, used inside the Round card's paper-2 panel), `level`
- **Header (min-height 28, gap 8):** disc 26 (as NoteEditor) · title 13 / 800 („Notizen“ / „Notizen für dieses Event“, `role="heading"` at `level`) with sub 12 / 600 `ink-2` under it („aus deiner Bibliothek“ / the Event name; sub only when both blocks show) · finished chip · pencil IconButton (36 visual, 44 hit, 2 px `line`, `surface`; label „Notizen bearbeiten“ / „Notizen für dieses Event bearbeiten“).
- **Panel (8 px below):** event = `surface` + 2 px solid `line`, radius 12 (finished: 2 px **dashed** `line`); game = `paper-2`, radius 12, no border; `bare` = none. Padding 10 12 (sm) / 12 14 (md+).
- **Order:** event block always first, gap 16 (popover) – 20 (dialog). If one of them is empty it is not rendered (no empty state in read-only places); if both are empty, the trigger (card button, disclosure) is not rendered.

## GameCard (change)
- New `#notes` affordance when the game has a note for this Host (library) or an Event note (Event pool): IconButton 32 visual / 44 hit, top-right of the cover (4 px in), `surface`, 2 px `line`, `shadow-sm`, `sticky-note` 16; open = `ink` fill + `paper` icon, `aria-expanded`, `aria-label="Notizen zu {game}"`. Only rendered for the Host.
- **≥ 980 popover:** width 320, max-height `min(440px, space below − 24)` (Event context with two blocks: 520), anchored 4 px under the button, left edge 6 px left of the card (flip to the right edge when it would leave the stage). Header: kicker game name 12 / 700 `ink-2`, title „Notizen“ Lilita 22, close X (44). Body padding 4|12 16 16, scrolls; once scrolled a 2 px `line-soft` rule shows under the header. Footer (2 px `line-soft` top): „Bearbeiten“ text button with pencil (opens the game dialog in edit mode / the library form). Content `size="sm"`.
- **< 980 bottom sheet** (Sheet): same header + body (`md`), max 76 %, footer „Bearbeiten“.
- Esc / outside click closes; focus returns to the button. Body `tabindex="0"` when it scrolls.

## RoundCard „Notizen“ (change)
- Disclosure button 44 high: `sticky-note` 18 · „Notizen“ 15 / 800 · lock 12 + „Nur du siehst das“ 12 / 600 `ink-2` · chevron 20 at the right (rotates 180° open). `aria-expanded`, `aria-controls`.
- Panel: `paper-2`, radius 12, padding 12 14 14, gap 14: Event NoteBlock (`size="sm"`, framed `surface`), 2 px `line-soft` rule, game NoteBlock (`bare`). Default: open for the Host on the running Round, remembered per device.

## GameDialog on the Event page (change)
- View mode (default): dialog 600 (≥ 980) / bottom sheet (< 980), header cover 56 + kicker + title Lilita 30 + meta. Body: Event NoteBlock (`md`, pencil) then game NoteBlock (`md`, pencil, sub „aus deiner Bibliothek“).
- Edit mode (pencil, or „Bearbeiten“ from the card popover): both NoteEditors, Event first (min 96, max 200) then game (max 260 / 240), footer „Abbrechen“ · „Speichern“ (one save for both; saves only what changed). Sheet in edit mode: 90 % high.
- Finished Event: Event NoteBlock `finished` (view) / NoteEditor `readonly` (edit); game note unchanged.
- **Built in 0.16 (#464), where it differs from the above:**
  - Event notes only. The game's own notes stay read-only in the dialog and are edited in the library („In der Bibliothek öffnen“): the library's `PATCH /api/games/[id]` takes the whole game, so a notes-only save would need a new branch and a second request. The one save, „saves only what changed“ and „game note stays editable in a finished Event“ wait for a follow-up ticket.
  - A game without Event notes shows a text button „Notizen für dieses Event hinzufügen“ (`Plus`, where the Event block would sit): the design draws the pencil only on an existing block, so the Host would have no way to write the first note.
  - The view ↔ edit swap is a 0.14 s fade of the entering content (`riseFade`), with no height Flip (04-motion § Notizen: GSAP loads on the Event page only before a run, ADR 0015); under reduced motion it is the same fade.
  - Esc, ✗ and the scrim cancel the edit and only then close the dialog; „Abbrechen“ shows from md up (the phone's footer is „Speichern“ alone).
  - The edit entry shows in the three places a tile opens the dialog from (the Spielepool, the wheel's result card, „Gerade dran“), for the Host of a running Event. It is not in the notes popover or sheet of „Nächstes Spiel setzen“ (no „Bearbeiten“ footer there: it would open a dialog over a sheet) and not on the Round card's disclosure (the tile above it opens the dialog).
  - The dialog stays the 400 px side sheet from md up (0.12), not the 600 px dialog; in edit mode the cover and the facts give way to the editor, and the sheet is 90 % high below md.

## GameLibrary / GameForm (change)
- Form: the „Notizen“ multiline TextField becomes NoteEditor (`variant="game"`), same position. Over the limit blocks „Speichern“ with the reason.
- Detail page: section `<h2>` „Notizen“ (Lilita 26) + „Nur du siehst das“ + „Bearbeiten“ (AppButton secondary md), then NoteContent `lg` (`md` < 980) in a `paper-2` panel, radius 12, padding 16 18. Not rendered when empty (the form is the place to add one).

---

## Data

```ts
type NoteDoc = { v: 1, html: string }      // sanitised HTML, the only tags below
// allowed: p, h3, strong, em, ul, ol, li, a[href]   (a gets target/rel added on render, never stored)
// game_notes:  (host_id, game_id) → NoteDoc
// event_game_notes: (event_id, game_id) → NoteDoc   // new; host-only like the event
```
- **Server validation (both endpoints):** sanitise with an allowlist (e.g. `sanitize-html`: the tags above, `href` only, `allowedSchemes: ['http','https']`, `allowProtocolRelative: false`), then count visible text (strip tags, decode entities, graphemes) ≤ 2000 → else 422 `notes.too_long`. A link with another scheme is dropped (text kept).
- **Migration:** today's plain text → one `<p>` per line, empty lines dropped, text escaped. No automatic link detection.
- **Read-only places** render the stored HTML through the same sanitiser (defence in depth) and add `target`/`rel`/the ↗ at render time.
- Event notes become read-only when the Event is `finished` (server rejects writes with 409).
- **Deviation (0.16, ADR 0019):** this whole section does not hold. A note is stored as the editor's document, never as HTML: `NotesDoc` in `shared/notes-doc.ts` (#727), in `games.notes_doc` of the Host's own library copy (ADR 0018) and in `event_game_notes.notes` (#731). The server rebuilds what arrives from that file's short list of nodes and marks (a link only with an `http` or `https` address) and refuses anything else; there is no sanitiser and no `v-html`. The limit counts visible characters with `characterCount` (`shared/text.ts`, graphemes), 2000 for both (`GAME_NOTES_MAX`, `EVENT_NOTES_MAX`). The migration is 0038, already merged. A finished Event refuses an Event-notes write with the app's `wrong_phase` error (`server/api/e/[slug]/games/[gameId]/notes.put.ts`), not a bare 409.

---

## Additions to 04-motion.md

### Notizen [1.4]
CSS for hover/press/focus; GSAP for heights (`EASE.*`). Nothing loops, nothing overshoots.

| Moment | Values | Reduced |
|---|---|---|
| Field focus / blur | outline + border colour, 0.14 (`dur-fast`) `ease-snap` | same |
| Toolbar hover / press / pressed | square fill + icon colour, 0.08 (`dur-instant`) `ease-snap` | same |
| Tooltip | after 500 ms hover (0 on keyboard focus): `opacity 0→1, y 4→0`, 0.14 `EASE.out`; out 0.08 | opacity only |
| Formatting (B, I, H, lists) | instant, no transition | same |
| Link popover (≥ 980) | `opacity 0→1, y −4→0`, 0.14 (`dur-fast`) `EASE.out`; close 0.14 `EASE.in` | opacity 0.14 |
| Link bar (< 980) | `height 0→auto` 0.22 (`dur-base`) `EASE.out`, content `opacity` from +0.06; close 0.14 `EASE.in` | height cut, opacity 0.14 |
| Errors (link, max) | message `opacity 0→1` 0.14; border colour 0.14; **no shake** | same |
| Counter appears / tone | `opacity 0→1` 0.14; colour 0.14 | same |
| Card notes popover | `opacity 0→1, scale .96→1` (origin = trigger corner), 0.22 (`dur-base`) `EASE.out`; close 0.14 `EASE.in` | opacity 0.14 |
| Notes / dialog sheet | Sheet: `y 100%→0` 0.36 (`dur-slow`) `EASE.out`; out 0.22 `EASE.in`; scrim 0.14 | opacity 0.14 |
| Scrolled header rule | `opacity 0→1` 0.14 | same |
| Round card disclosure | `height 0→auto` 0.22 `EASE.out`; chevron `rotation 0→180` 0.22 `EASE.snap`; close 0.14 `EASE.in` | cut, chevron flips |
| Dialog view ↔ edit | GSAP Flip height 0.22 `EASE.io`, content crossfade 0.14 | cut + 0.14 fade |

---

## Copy (de, placeholder, reviewed separately)
```
notes.label                Notizen
notes.event.label          Notizen für dieses Event
notes.from_library         aus deiner Bibliothek                    (new)
notes.host_only            Nur du siehst das                        (exists: NoticeBanner chip)
notes.help                 Nur du siehst das.                       (new)
notes.event.help           Gilt nur für dieses Event. Nur du siehst das.   (new)
notes.placeholder          z. B. Einstellungen, Aufwärmen, Siegbedingung, Hausregeln   (new)
notes.event.placeholder    z. B. heute nur Bo1                      (new)
notes.toolbar              Formatierung                             (new, a11y)
notes.bold                 Fett
notes.italic               Kursiv
notes.heading              Überschrift
notes.bullet_list          Liste
notes.ordered_list         Nummerierte Liste
notes.link                 Link
notes.unlink               Link entfernen
notes.bold_in_heading      in Überschriften nicht                   (new, tooltip reason)
notes.counter              noch {n} Zeichen
notes.over                 {n} zu viel                              (new)
notes.error.max            Höchstens 2000 Zeichen.
notes.live.remaining       Noch {n} Zeichen                         (a11y)
notes.link.address         Adresse                                  (new)
notes.link.apply           Übernehmen                               (new)
notes.link.cancel          Abbrechen
notes.link.error           Nur Adressen mit http oder https.
notes.link.new_tab         (öffnet in neuem Tab)                    (new, a11y)
notes.saving               Wird gespeichert …                       (new)
notes.save_blocked         Erst die Notizen kürzen.                 (new)
notes.finished.chip        Event beendet
notes.finished.help        Das Event ist beendet. Diese Notizen bleiben so stehen.   (new)
notes.edit                 Bearbeiten
notes.edit_a11y            Notizen bearbeiten
notes.event.edit_a11y      Notizen für dieses Event bearbeiten
notes.open_a11y            Notizen zu {game}
notes.title                Notizen
```

## Checks
- 390 (inside 352 / sheet 346): toolbar one row with separators (296); 320: one row without separators (272); 280: Link wraps; never scrolls.
- The long link in the 320 px popover (288 inside) breaks inside the address, ↗ stays with the last letters; no horizontal scroll anywhere.
- Light and dark: `info-fg` links ≥ 4.5:1 on `surface` and `paper-2`; pressed buttons ink/paper flip; Event disc Sonne in both.
- Every error has icon + text; counter colour never alone (text changes too).
- Every hit area ≥ 44 (toolbar 44, pencil 44, close 44, link actions 44 / 40 + 44 hit).

## Open questions
1. A non-address like „Hausregeln“ in the link field gets the same message („Nur Adressen mit http oder https.“). A separate „Das ist keine Adresse.“ would be clearer; copy review decides.
2. Should a game note also show in the Event pool popover for **other** Hosts' games? (Assumed: only my own notes, per the brief.)
