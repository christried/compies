# 15 · Header auf der Eventseite

**Ref:** `Header auf der Eventseite.dc.html` · ergänzt `02-components.md` (AppHeader, HubNav, PhasePill) · gilt ab md (768). Phones (< 768) unverändert.

Entscheidung: Der Event-Kontext steht als **Unterzeile im Events-Tab** (Name + PhasePill sm), unter derselben 3-px-`hot`-Unterstreichung. Alternativen B (Brotkrumen in einer Zeile) und C (Kontext rechts vor „Einladen“) sind im File nur bei 1440 gezeigt und verworfen: B macht den aktuellen Tab zu breit und schiebt die übrigen Tabs, C löst den Kontext optisch vom Events-Tab.

**Neue Tokens:** keine.

## AppHeader (geändert)
**Scope:** [MVP] · **Ref:** AppFrame, Header auf der Eventseite

- **Props / variants:** `kind: hub | event | bare` (`event` ersetzt `session` für die Eventseite), `event?: { name: string, phase }` (nur `kind="event"`), `canInvite: boolean`, `isHost`
- **States:** hub · event · bare
- **Slots:** `#actions`
- **Desktop / mobile:**
  - Höhe 64 ab md (wie Hub), 56 unter md. Nie zweite Zeile: Header ist `display:flex; flex-wrap:nowrap`; nur der aktuelle Tab darf schrumpfen (`flex: 0 1 auto`), alles andere `flex:none`. Zwischen Nav und Aktionen ein Spacer `flex:1 1 0; min-width:8px`.
  - `kind="event"`, 768–1023: Padding 0 14, nur Compibert-Kopf (Wortmarke aus), HubNav, „Einladen“ als IconButton (Icon `link` 18, `aria-label="Einladen"`, `title="Einladen"`), Ton, UserMenu.
  - `kind="event"`, ≥ 1024: Padding 0 24, Kopf + Wortmarke „COMPIES“, HubNav, AppButton secondary „Einladen“, Ton, UserMenu.
  - `kind="hub"`: unverändert (Padding 0 14 bis 1023, 0 24 ab 1024).
  - Kein Trennstrich und kein Event-Titel mehr neben dem Logo ab md (beides wandert in den Events-Tab).
  - < 768: unverändert (Kopf 30, Name 15/700 + PhasePill md, Ton, UserMenu; Bottom-Tabs Event / Aktivität).
  - „Einladen“ nur bei `canInvite`.
- **Accessibility:** genau ein `<nav aria-label="Hauptnavigation">` im Banner. Logo-Link `aria-label="COMPIES Startseite"`.
- **Motion:** Logo-Compibert wie bisher (CompibertBus). Sonst siehe HubNav.

## HubNav (geändert)
**Scope:** [MVP] · **Ref:** AppFrame, Header auf der Eventseite

- **Props / variants:** `current`, `items` (rollenabhängig: Member = Events, Archiv, Profil · Host + Bibliothek · Operator + Admin), `context?: { name: string, phase }` (neu; nur auf der Eventseite, hängt am `current`-Tab „Events“), `soon: string[]`
- **States:**
  - default: 14/600 `ink-2`, Unterstreichung transparent, volle Header-Höhe (61 + 3 Border). Tab-Padding 0 11, **768–1023 neu 0 8** (Hub und Event; sonst passt der Hub mit 5 Tabs bei 768 nicht, +10 px).
  - hover: `ink`, Unterstreichung 3 px `line-soft`. Auf dem aktuellen Tab keine Änderung.
  - focus-visible: globaler Ring 3 px `focus`, Offset 3 px, um den ganzen Tab inkl. Unterzeile.
  - current: 14/800 `ink`, 3 px `hot`, Icon mit `hot`-Offset.
  - current + context (neu): zweizeilig, links bündig, vertikal zentriert, Abstand 3 px.
    - Zeile 1: Icon 16 + „Events“, 14/800, Zeilenhöhe 16.
    - Zeile 2: Event-Name 12/600 `ink-2`, Zeilenhöhe 16, eine Zeile, `text-overflow: ellipsis`, `title` = voller Name; danach PhasePill `size="sm"` (`flex:none`, kürzt nie).
    - Kein eigenes Ziel, kein zweites `aria-current`, kein eigener Hover.
- **Slots:** —
- **Desktop / mobile:**
  - `<nav>` braucht `min-width:0`; der Kontext-Tab braucht eine feste Untergrenze statt `min-width:auto` (sonst zählt der ganze Name als Minimum): 96 px (Pill Läuft / Beendet / Termin steht), 130 px (Terminumfrage). Praktisch: `min-width` = Breite Zeile 1 bzw. Pill + Padding, per JS/CSS-Var gesetzt.
  - Kontext-Tab `max-width`: 200 (768–1023) · 280 (1024–1439) · 340 (≥ 1440). Mindestbreite = Inhalt von Zeile 1 bzw. der Pill (Name kann auf 0 kürzen).
  - Sichtbare Namenbreite bei 60 Zeichen, Operator mit 5 Tabs + Einladen: ca. 55 px (768), ca. 130 px (1024), ca. 250 px (1440). Voller Name bleibt im `h1` der Seite und im `title`.
  - Member mit kurzem Namen: Tab nur so breit wie der Inhalt; Lücke wächst im Spacer.
  - < 768: keine HubNav im Header (Bottom-TabBar bzw. Event-Tabs), unverändert.
- **Accessibility:**
  - Events-Link: `aria-current="page"`, zugänglicher Name „Events“. Zeile 2 ist `aria-hidden="true"`.
  - `aria-describedby` → visuell versteckter Text, ungekürzt: „Event: {Name}, Phase: {Phase}“.
  - Screenreader beim Fokus: „Hauptnavigation, Navigation. Events, aktuelle Seite, Link. Event: Großer Herbst-Spieleabend bei Sanne mit Pizza, Quiz und Co., Phase: Läuft.“
  - Phasenwechsel wird nicht vom Header angesagt (macht die Live-Region der Seite).
- **Motion:**
  - Hover/Unterstreichung: `color`, `border-color` `--cp-dur-fast` `--cp-ease-out`.
  - Zeile 2 beim Wechsel /events → Event: Opacity 0→1 und translateY 4 px→0, `--cp-dur-base` `--cp-ease-out`. Beim Verlassen ohne Animation.
  - Name- oder Phasenwechsel live: Crossfade `--cp-dur-fast`.
  - Reduced (`data-motion="reduced"` / OS): alles sofort.

## PhasePill (geändert)
**Scope:** [MVP] · **Ref:** AppFrame, Header auf der Eventseite

- **Props / variants:** `phase`, `size: md | sm` (neu, Default `md`)
- **States:** unverändert: Entwurf · Terminumfrage (`surface`, Punkt `info`) · Termin steht (`surface`, Punkt `success`) · Läuft (`primary`, Punkt `hot`) · Beendet (`paper-2`, Punkt `ink-3`) · Archiv
- **Slots:** —
- **Desktop / mobile:** md: Höhe 24, Padding 0 9, 12/800, Punkt 7. sm: Höhe 18, Padding 0 7, 11/800, Punkt 6, Gap 5. Rand 2 px `line`, Text immer `ink`.
- **Accessibility:** Text trägt die Bedeutung, Punkt `aria-hidden`. In der Tab-Unterzeile ist die ganze Pill `aria-hidden` (Phase steckt in der Beschreibung).
- **Motion:** —

## Hinweis
`02-components.md` / AppShell nennt 980 als Umschaltpunkt (Header 64 + Nav). Laut Brief gilt md 768. Dieser Header folgt 768; AppShell bitte angleichen.

## Copy (de)
- `nav.main.label`: „Hauptnavigation“
- `nav.events`: „Events“ · `nav.archiv`: „Archiv“ · `nav.bibliothek`: „Bibliothek“ · `nav.profil`: „Profil“ · `nav.admin`: „Admin“
- `nav.events.context`: „Event: {name}, Phase: {phase}“
- `phase.poll`: „Terminumfrage“ · `phase.date_set`: „Termin steht“ · `phase.running`: „Läuft“ · `phase.finished`: „Beendet“
- `header.invite`: „Einladen“
- `header.sound.off`: „Ton aus“ · `header.sound.on`: „Ton an“
- `header.account`: „Konto von {name}“
- `header.home`: „COMPIES Startseite“
