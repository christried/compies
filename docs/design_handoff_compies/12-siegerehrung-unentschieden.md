# 12 Siegerehrung: Unentschieden

Tie variant of AwardCeremony (6b „Pokal-Lauf“) and ShareImage (8a „Poster“). Reference: `reference/Siegerehrung Unentschieden.dc.html`. One Winner stays exactly as specified in 02-components / 04-motion / 05-assets.

Trigger: the Host finishes the Event as „Unentschieden“ while ≥ 2 Parties share rank 1 in the final Standings (points only, equal points share a rank). Every Party on rank 1 is a Winner. No tiebreaker.

---

## AwardCeremony (tie)
**Scope:** [1.0] · **Ref:** Siegerehrung Unentschieden § A, AwardCeremony, Compibert Momente 6b

Winners stand side by side under one shared plate „Platz 1“. The trophy hops from Winner to Winner and ends on the plate: „SIEGER“ on every Winner card, „UNENTSCHIEDEN“ once on the plate.

- **Props / variants:**
  - new `outcome: "sieg" | "unentschieden"` (default `"sieg"`).
  - `standings[]` → `{t, name, pts, rank}` (rank shared: 1, 1, 3). Winners = all with `rank === 1`.
  - `members[]` → `{t, who, host?}[]` (team id added, so avatars can be split per Party). One Winner: unchanged.
  - `gag?: "trip" | "bonk"` unchanged.
- **States:** run · share (wide) · share (square) · link copied (unchanged) · plus layout, derived from k = number of Winners:
  - `chain-2`: desktop k = 2, mobile k = 2. Cards 240 × 160 (mobile 160 × 120), joined by „=“ badges (40 / 28 px, `--cp-primary`, Icon `equal`). Avatars 56 px (mobile 44) with names under each card, 3 per line.
  - `chain-3`: desktop k = 3. Cards 220 × 140, badges 36, avatars 48 with names.
  - `grid`: desktop k ≥ 4 (4 columns, cards 236 × 120), mobile k ≥ 3 (2 columns, 171 × 96). Team strip with name, points, small „SIEGER“ stamp, avatar stack inside the card (28 / 24 px, overlap 8 / 7, no names).
  - rows: `side` (desktop chain-2, as today) · `below` (mobile chain-2) · `chips` (all other layouts: one line of pills, wraps) · `none` (no Party below rank 1).
  - Plate: width of the Winner group, 40 px (mobile 34), `--cp-primary`, „Platz 1“ left (Bungee 15 / 12); centre „???“ → stamp „UNENTSCHIEDEN“ (Bungee 20 / 15, `--cp-hot` on `--cp-surface`, −3°).
  - Avatars: at most 6 cells per Party, then 5 + „+N“ (unchanged rule, applied per Party). Ring in the Party's colour in chain layouts.
  - End frame: „Bild teilen“, „Nochmal ansehen“, close (44 px, top right, replaces „Überspringen“).
- **Slots:** `#share` (unchanged)
- **Desktop / mobile:** Desktop: layer over the stage column, 310 px side panel stays (Tabelle shows „Endstand · Unentschieden“ with shared ranks). Mobile 390: full screen; 8 Winners fit 844 px.
- **Accessibility:** Winner cards are an `<ol aria-label="Platz 1, unentschieden">`; „=“ badges `aria-hidden`; each avatar list `aria-label="Team {Name}"` (grid: plus the Players' names). Live region (polite), German:
  - „Unentschieden! Gewonnen haben {A} und {B} mit je {p} Punkten.“
  - nobody else: „Unentschieden! Beide Parteien gewinnen mit je {p} Punkten: {A} und {B}.“ / „Unentschieden! Alle {k} Parteien gewinnen mit je {p} Punkten: {A}, {B} … und {H}.“
- **Motion:** see 04-motion § Award ceremony, Unentschieden (below).

## ShareImage (tie)
**Scope:** [1.0] · **Ref:** Siegerehrung Unentschieden § B, ShareImage (8a „Poster“)

- **Props / variants:** `rows[]` gains `rank`; new `outcome` (as above); `games[].w: number | number[]` (array = several Parties on Place 1 in that game).
- **States:** `tie-names` (2–3 Winners) · `tie-chips` (≥ 4 Winners).
  - Label: „Unentschieden · {k} Sieger“; nobody else: „Unentschieden · beide gleichauf“ / „· alle {k} gleichauf“.
  - Names (2–3): one per line, Lilita, each with its own team strip (w 14, h ⅔ font size, 3 px border; square 18 / 3.5) and text-shadow in its team colour (4 px, square 6 px). Size by k and the longest name (≤ 14 / ≤ 22 / longer chars): k = 2 → 80 / 68 / 52 (square 108 / 92 / 72); k = 3 → 64 / 54 / 44 (square 88 / 74 / 60). Same size for every name; longer names may wrap to 2 lines (balance).
  - Line: „gewinnen mit je {p} Punkten“.
  - Places 2–4 → next shared ranks: wide max 2 rows, square max 3 (2 with k = 3); one row fewer if a name wraps; rest „+N weitere Partei(en)“.
  - ≥ 4 Winners: name chips 2 per line (347 / 466 px), Lilita 34 / 30 (square 44 / 38), strip 12 × 28 (square 15 × 36), ellipsis. No rows; rest only as „+N weitere Parteien“.
  - Game chips, wide: at most 6, fewer if tied capsules don't fit. Add chips while the estimated width (name length × 8 + capsule width + 36, gap 10) plus „+N weitere“ (≈ 100 px, only if games remain) fits 1088 px minus the „N Spiele“ label; the rest goes into „+N weitere“. A last remaining game that fits is shown, never replaced by „+1 weitere“. Square: at most 9 (wraps), unchanged.
  - Square sunburst 340 / 300 / 280 px for k = 2 / 3 / ≥ 4, Compibert at 0.765 of it.
  - Game chip „gleichauf“: dot → capsule, one hard stripe per team (wide 8 px, square 11 px; height 11 / 15; border unchanged), order by team number, max 4 stripes, with 5+ the name gets „· {n} gleichauf“. Satori-safe: `linear-gradient(90deg, #e4572e 0%, #e4572e 50%, #3d2d8f 50%, #3d2d8f 100%)` (each stop doubled for hard edges, no conic).
- **Slots:** —
- **Desktop / mobile:** —
- **Accessibility:** alt: „Unentschieden bei {Event}: {A} und {B} gewinnen mit je {p} Punkten. Platz {r}: {Name}, {pts} Punkte.“ (max. 3 places). All tied: „Unentschieden bei {Event}: {Beide | Alle k} Parteien gewinnen mit je {p} Punkten: {Namen}.“
- **Motion:** —

---

## 04-motion addition

### Award ceremony „Pokal-Lauf“, Unentschieden (6b-T) [1.0]
Started by `ceremony.started {startAt, gag, outcome: "unentschieden"}` and played with `playAt`. Labels `banner`, `rows`, `plate`, `run`, `hop1 … hopN`, `stamp`, `members`, `dance`, `share`. k = Winners. Chain = desktop k ≤ 3, mobile k = 2; grid = the rest.
- 0: banner `y −140→0`, 0.55 `back.out(2.2)`. Subline = tie line.
- 0.6: non-winner rows from last up to rank k + 1: `x 60→0, opacity`, 0.45 `power3.out`, stagger 0.45. As chips: `y 12→0, opacity`, 0.3 `power3.out`, stagger 0.2. No rows: plate starts at 0.6.
- after rows: plate `scaleX .6→1, opacity` 0.3 `back.out(2)`; Winner cards `scale .9→1, opacity` 0.4 `back.out(2)`, stagger 0.1 in reading order; „=“ badges `scale 0→1` 0.2 `back.out(2)` with the card to their right.
- run: unchanged.
- gag „trip“ / „bonk“: unchanged up to the first landing. Target: card 1 (chain) or plate centre (grid).
- hopN (chain): card bump `y 6` yoyo 0.08; front→back 0.15; „SIEGER“ `opacity, scale 2.4→1` 0.3 `back.out(2.4)` at +0.1; confetti 14 (mobile 8) from the card's top centre. +0.12: hop to the next card: `x` 0.42 `power1.inOut`, `y −70` 0.22 `power2.out` then down 0.2 `power2.in`, `rotation +360`.
- plate: last landing +0.12, hop to the plate centre 0.5 (`y −110` 0.28 `power2.out`, down 0.22 `power2.in`). Plate bump `y 4` yoyo 0.08; „???“ → stamp „UNENTSCHIEDEN“ `opacity, scale 2.4→1, rotation −3` 0.32 `back.out(2.4)`; confetti 40 (mobile 20); trophy `opacity→0` 0.2 at +0.1.
- grid: plate +0.12, cards flip from the centre outward (distance to plate centre), stagger 0.06; front→back 0.15 + „SIEGER“ 0.24 `back.out(2.4)`; no per-card confetti.
- members (plate +0.45): per Party left→right, 0.2 between Parties; avatars `scale 0→1, y 18→0` 0.4 `back.out(2)`, stagger 0.06. Grid: each stack `scale .6→1, opacity` 0.3 `back.out(2)`, stagger 0.05 in ripple order.
- dance: plate +0.3 Compibert gets up (trip: `rotation→0` 0.45 `back.out(2)`) → `laugh`; plate +2.2 → `dance`.
- share (plate +1.4): `y 16→0, opacity` 0.35 `back.out(2)`; close button with it.
- Key times trip / bonk: hop1 t1 + 0.80 / t1 + 2.20; each further hop +0.54; plate = last landing + 0.62 → k = 2: t1 + 1.96 / t1 + 3.36; k = 3: t1 + 2.50 / t1 + 3.90. Grid: plate t1 + 0.80 / t1 + 2.20, ripple done by plate + 0.6.
- Skip / reduced: end frame (everything set), Compibert holds `cheer`, no run, no confetti; live region speaks the tie sentence.
- No sound.

Compibert: existing states only (run, suspense, cheer, confused, laugh, dance). No new art; the trophy is the existing one.

---

## Copy (de.json)
```json
"ceremony": {
  "tie": {
    "sub": "{event} · {n} Spiele · {k} Sieger, je {p} Punkte",
    "subBoth": "{event} · {n} Spiele · Beide gleichauf, je {p} Punkte",
    "subAll": "{event} · {n} Spiele · Alle {k} gleichauf, je {p} Punkte",
    "plate": "Platz 1",
    "plateStamp": "Unentschieden",
    "stamp": "SIEGER",
    "list": "Platz 1, unentschieden",
    "live": "Unentschieden! Gewonnen haben {names} mit je {p} Punkten.",
    "liveBoth": "Unentschieden! Beide Parteien gewinnen mit je {p} Punkten: {names}.",
    "liveAll": "Unentschieden! Alle {k} Parteien gewinnen mit je {p} Punkten: {names}."
  },
  "close": "Schließen"
},
"share": {
  "tie": {
    "label": "Unentschieden · {k} Sieger",
    "labelBoth": "Unentschieden · beide gleichauf",
    "labelAll": "Unentschieden · alle {k} gleichauf",
    "line": "gewinnen mit je {p} Punkten",
    "alt": "Unentschieden bei {event}: {names} gewinnen mit je {p} Punkten.",
    "altAll": "Unentschieden bei {event}: {who} Parteien gewinnen mit je {p} Punkten: {names}.",
    "altPlace": "Platz {r}: {name}, {pts} Punkte."
  },
  "moreParty": "+1 weitere Partei",
  "moreParties": "+{n} weitere Parteien",
  "gameTied": "· {n} gleichauf"
}
```
`{names}` joins with „, “ and „ und “ before the last.

## Tokens
None new. Plate `--cp-primary` / `--cp-on-primary`, stamps `--cp-hot` on `--cp-surface`, cards and avatar rings team tokens, „=“ badge `--cp-primary`. Share image keeps its hex table. All sizes are component constants.
