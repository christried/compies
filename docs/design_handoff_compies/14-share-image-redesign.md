# 14 Share image (1b „Anzeigetafel“) — Satori-compatible

Replaces 05-assets § Share image (8a „Poster“) and the share part of 12 § ShareImage (tie). Reference: `ShareImage.dc.html` (`?st=kurz|lang|tie2|tie3|tie5&fmt=wide|square&opt=b`; no params = options sheet, 1b picked). Component default `variant` = `b`.

Rendered server-side with nuxt-og-image (Satori) at **1200 × 630** (wide) and **1080 × 1080** (square). Always light. Fonts as buffers: Lilita One 400, Bungee 400, Bricolage Grotesque 700 / 800. **No pill, capsule or rounded chip.** The only round shape is the TeamMark (DS People).

Colours: paper `#fff3df` · surface `#fffdf8` · ink `#151515` · ink-2 `#5d5650` · header secondary `#b9ad9f` · divider in header `#5d5650` · soft rule `#dacfbf` · primary `#ffd23f` · team 1–8 `#e4572e #f0a202 #f3e04a #56b4e9 #009e73 #0072b2 #cc79a7 #3d2d8f` · team ink: `#fffdf8` on 6 and 8, `#151515` otherwise.

Common parts:
- **TeamMark s/i (table):** div s × s, radius 50 %, border 2.5 `#151515`, bg team, flex centre; child `<svg viewBox 0 0 24 24>` i × i, one `<path>` (DS symbol) fill team ink.
- **TeamMark on colour (panel, bands):** same, bg `#fffdf8`, symbol `#151515` (a team-coloured mark would vanish on its own colour).
- **Game stripe w/h:** div flex column, w × h, border 2 `#151515`, border-box; one child per winning team (max 4, ordered by team number), flex 1, bg team, 2nd+ child `border-top 2px #151515`. One team = a solid stripe.
- **Line:** single-line text = `white-space:nowrap; overflow:hidden; text-overflow:ellipsis` inside a box of known width.
- Compibert: `dance` pose baked to a static SVG; sunburst = `share/sunburst.svg`; head = static head SVG.

## Wide 1200 × 630
```
<div root: flex column, w 1200 h 630, border 6 #151515, border-box, bg #fff3df, overflow hidden>
  <div header: flex row, h 92, padding 0 32, gap 24, align centre, bg #151515>
    <div kicker: flex row, gap 10, flex none> [Compibert head 40] "COMPIES" Lilita 28 #ffd23f </div>
    <div divider: w 3 h 44, bg #5d5650 />
    <div event block: flex column, flex 1, min-w 0, gap 4>
      event: Lilita, #fff3df, lh 1.1, Line — ≤ 40 chars 30 px, longer 24 px
      dates: Bricolage 800 15, caps +0.1em, #b9ad9f, Line
    </div>
  </div>
  <div body: flex row, flex 1>
    <div panel: w 600, border-right 6 #151515>   → see Winner panel
    <div right: flex column, flex 1, min-w 0, padding 26 30>
      <div head: flex row space-between, pb 8, border-bottom 3 #151515, Bricolage 800 15 caps +0.12em, nowrap> "Endstand" · "{n} Parteien" #5d5650 </div>
      <div row: flex row, align centre, gap 12, h 44, border-bottom 2 #dacfbf>
        place Bungee 20 w 30 · TeamMark 26/14 · name Bricolage 800 21 flex 1 Line · points Bungee 20
      </div>
      <div more row: h 44, pl 42, border-bottom 2 #dacfbf, Bricolage 800 17 #5d5650> "+{n} weitere Parteien" </div>
      <div spacer flex 1, min-h 20 />
      <div head: as above> "{n} Spiele" · legend (if any game tied): Game stripe 10/20 of the first tied game's first two teams + "gleichauf" Bricolage 700 15 #5d5650 </div>
      <div games: flex row wrap, pt 6>
        cell: w 50 %, h 36, pr 16, flex row gap 10 → Game stripe 10/24 · name Bricolage 700 18 Line
        more cell: pl 20, Bricolage 800 17 #5d5650 "+{n} weitere"
      </div>
    </div>
  </div>
</div>
```

### Winner panel, wide
**k = 1** — flex column, padding 30 36, bg team, colour team ink, position relative, overflow hidden:
```
label row: flex row gap 12 → TeamMark on colour 30/16 · "Sieger" Bricolage 800 18 caps +0.14em
name: mt 18, Lilita, lh 1.04, each line a Line — ≤ 10 chars 96 px 1 line · ≤ 20 → 80 px 2 lines · longer → 56 px 2 lines
spacer flex 1
points: flex row baseline gap 12 → {p} Bungee 72 · "Punkte" Bricolage 800 22 caps +0.1em
Compibert w 200, absolute right 20 bottom 0
```
**k ≥ 2** — flex column, no padding:
```
tie bar: h 52, padding 0 28, bg #ffd23f, flex row space-between, Bricolage 800 17 caps +0.12em
  label (Line) · "je" {p} Bungee 22 "Punkte"
band ×k: flex 1, border-top 3 #151515, bg team, colour team ink, padding 0 28, flex row gap 16, align centre
  TeamMark on colour 34/18 · name Lilita, Line
```

## Square 1080 × 1080
```
<div root: flex column, w 1080 h 1080, border 8 #151515, border-box, bg #fff3df, overflow hidden>
  <div header: h 196, padding 0 44, bg #151515, flex column, justify centre>
    <div row: flex row gap 14> [head 48] "COMPIES" Lilita 34 #ffd23f · dates flex 1, right, Bricolage 800 18 caps +0.1em #b9ad9f, Line </div>
    <div event: mt 18, Lilita #fff3df lh 1.08> ≤ 30 chars 46 px 1 line · ≤ 44 → 34 px 1 line · longer → 34 px 2 lines, each a Line </div>
  </div>
  <div panel: h 420, border-bottom 8 #151515>   → see Winner panel square
  <div bottom: flex row, flex 1, padding 32 44, gap 44, overflow hidden>
    <div standings: flex 1, min-w 0> head Bricolage 800 18 (pb 10, border-bottom 3) · rows h 52: place Bungee 24 w 38 · TeamMark 32/18 · name Bricolage 800 25 Line · points Bungee 24 · more row h 52, pl 52, Bricolage 800 20 #5d5650 </div>
    <div games: w 380> head "{n} Spiele" + legend (stripe 12/24) · rows h 40: Game stripe 12/28 · name Bricolage 700 22 Line · more pl 24 Bricolage 800 20 #5d5650 </div>
  </div>
</div>
```
**k = 1** — padding 36 44, bg team, position relative: sunburst 340 absolute right 24 bottom 12 with Compibert w 260 (left 40 bottom 22 inside) · label row TeamMark on colour 36/20 + "Sieger" Bricolage 800 22 · name mt 18, box w 640, Lilita lh 1.04: ≤ 10 → 112 1 line · ≤ 20 → 92 2 lines · longer → 64 2 lines · spacer · {p} Bungee 80 + "Punkte" Bricolage 800 26.
**k ≥ 2** — tie bar h 64, padding 0 44, Bricolage 800 22, {p} Bungee 28 · bands border-top 3.5, padding 0 44, gap 20, TeamMark on colour 44/24.

## Winner states (k = Parties on rank 1, shared ranks by points)
| k | Label | Band font by longest name ≤ 14 / ≤ 22 / longer — wide | square |
|---|---|---|---|
| 1 | „Sieger“ | (panel, see above) | |
| 2 | „Unentschieden · 2 Sieger“, nobody else „· beide gleichauf“ | 72 / 52 / 38 | 88 / 68 / 52 |
| 3 | „Unentschieden · 3 Sieger“, nobody else „· alle 3 gleichauf“ | 56 / 44 / 34 | 68 / 56 / 44 |
| 4–6 | „Unentschieden · {k} Sieger“ / „· alle {k} gleichauf“ | 36 / 32 / 28 | 40 / 36 / 32 |
| 7–8 | as 4–6 | 5 bands + band „+{n} weitere“ (bg `#fffdf8`, no mark) | same |

- **Deviation (0.13, #551):** when every Party won (3 or more), the bar's label is „Alle {k} gleichauf“, without „Unentschieden · “: the long label was cut with „…“ in the wide picture beside two-digit points. The bar's sizes are unchanged.

- 2-line split (k = 1 and Event) = the space nearest the middle; no space → 1 line with ellipsis. Each line is its own Line, nothing wraps on its own.
- Bands always share the panel height equally (flex 1), so the band count is the only variable.
- Standings list the Parties after the Winners with their shared rank (3 after two Winners); everyone on rank 1 → Standings block hidden.

## Overflow rules (no text measuring)
- Event: tier by character count + Line. Dates: 1–3 Sessions joined „ · “; 4 or more → „{first} – {last} · {n} Termine“; Line.
- Names: always in a fixed or flex-bounded box + Line.
- Standings, slots S = 4 wide / 6 square. Rest ≤ S → all. Else the first S − 2 rows, „+{n} weitere Parteien“ („+1 weitere Partei“), then the last place. 8 Parties wide → 2, 3, „+4 weitere Parteien“, 8.
- Games, slots 6 wide (3 rows × 2) / 8 square (rows). Games ≤ slots → all; else slots − 1 + „+{n} weitere“. 12 games → 5 + „+7 weitere“ / 7 + „+5 weitere“.
- Tied game: stripe split per Party (max 4); 5 or more Parties → name gets „ · {n} gleichauf“.
- Header, panel and bottom have fixed heights, `overflow: hidden` as backstop.

Alt text: 1 Winner „{winner} gewinnt {event} mit {p} Punkten. Platz 2: {name}.“ · tie „Unentschieden bei {event}: {names} gewinnen mit je {p} Punkten.“

**Satori check:** every element is a flex container or text (no grid, no inline flow), sizes in px or %, colours as hex, borders solid, no gradients of any kind, no filters, no transforms, no text-shadow, `position: absolute` only for Compibert and the sunburst image, SVG only as static `<img>` or a one-path inline SVG without transforms, fonts only Lilita One / Bungee / Bricolage 700·800, ellipsis via `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
