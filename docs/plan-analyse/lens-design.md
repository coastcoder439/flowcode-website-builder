I have everything I need. Here is the analysis.

---

# Analyse — Lens: Design-System & UI-Flächen (R5 / M24)

## 1 · Ist-Befund (selbst verifiziert, mit Datei:Zeile)

**Tokens & Fonts sind bereits vorhanden und global geladen — die Panels konsumieren sie nur nicht.**
- `app/design-tokens.css` ist 1:1 identisch mit der Referenz `test-sites/wee-website-v3/design-system/design-tokens.reference.css` (verglichen: Sand-/Green-/Orange-/Ink-Skala, `--accent-500:var(--orange-500)`, `--surface`, `--font-display:Syne`, `--font-body:Montserrat`). Wird global auf `:root` geladen (`app/layout.tsx:3`).
- Syne/Montserrat sind über `next/font` verdrahtet (`app/layout.tsx:6-18`) und in `app/globals.css:6-9` auf `--font-display`/`--font-body` gemappt. **Aber**: die Tool-Panels hardcoden `system-ui` (z. B. `components/grafik/grafik-editor.css:18` `font: 13px/1.45 system-ui`). → WEE-Fonts erreichen das Tool-UI heute NICHT.

**Das dunkle Panel-Farbsystem ist über 11 CSS-Dateien dupliziert (Insellösung pro Panel — genau der R5-Verstoß).** Verifizierte Träger:
`components/grafik/grafik-editor.css`, `grafik-inspector.css`, `grafik-hilfe.css`, `grafik-crop.css`, `grafik-easing.css`, `grafik-keyframe-timeline.css`, `grafik-layer.css`, `grafik-objekt-menue.css`, `components/river/river-kurs-editor.css`, `components/backdrop/backdrop.css`, sowie 3 Reste in `app/editor/seiten-bereich.css`.

Wiederkehrende Hartwerte (Beleg-Zeilen):
- Panel-Fläche `rgba(20,30,24,.92)` (`grafik-editor.css:15`), Overlay-Panels `.96/.97` (`grafik-crop.css:28`, `grafik-hilfe.css:109`).
- **Button-Fläche = `#3f6e3a` = `--green-600` als Fläche** (`grafik-editor.css:85`, `grafik-objekt-menue.css:48`, `river-kurs-editor.css:86`) → direkter Verstoß gegen Leons Regel „Grüntöne inkl. 500 nicht als Fläche".
- Eingabefeld/Thumb-Fläche `#10201a` (`grafik-editor.css:195,206,325,371,387`).
- Panel-Text `#f2efe7`, Sekundärwert `#9fd68a` (~green-300), Button-Hover `#4d8546`/`#4f8a49`.
- **„Aktiv/gekoppelt"-Akzent = Gelb `#e8b400`** — nicht in der WEE-Palette (`grafik-editor.css:363,432,915`, `grafik-inspector.css:111`, `grafik-keyframe-timeline.css:62`); dieselbe Farbe dient zugleich als „Freischalten"-Button (`grafik-editor.css:247`), Snap-Linie (`:653`) und Rubberband (`:637`) — drei Bedeutungen auf einem Fremdton.
- Danger `#8a2b2b`/`#a83737` (`grafik-editor.css:302`, `grafik-objekt-menue.css:64`). Canva-Türkis `#00c4cc` (`grafik-editor.css:426`, Fremdmarke).
- Fokus-Ring `#9ecb98` statt `--focus-ring` (`grafik-editor.css:154`).

**Die jüngste Station (Seiten-Bereich) ist bereits weitgehend WEE-tokenisiert** (`app/editor/seiten-bereich.css` nutzt `var(--surface)`, `var(--accent-500)`, `var(--bg-page)`, `var(--border-*)`, `var(--danger)`). Es bleiben genau **3 dunkle Reste**:
- `.editor-umschalter` Pille `rgba(20,30,24,.92)` (`:23`) — das sind die „Animator | Seiten"-Reiter.
- **`.seiten-editor-kopf` `rgba(20,30,24,.94)` + `color:#f2efe7` (`:300-301`) = N5** — die dunkle Vollflächen-Kopfleiste über dem Puck-Editor (Seitenname + Speichern/Zurück).
- Schwebender Knopf `rgba(20,30,24,.92)` (`:580`).

**Puck-Chrome:** `@puckeditor/core/puck.css` wird in `app/editor/SeitenBereich.tsx:27` (und `app/puck/page.tsx:16`) importiert; Pucks eigene Editor-Oberfläche (Felder-Sidebar, Kopf) läuft im selben Dokument, die Canvas als iframe mit eigenem Style-Inject (`SeitenBereich.tsx:79-103, 424`). → Puck-Chrome ist heute unberührt vom WEE-System.

**M17 (Hover-Titel):** Es gibt bereits `components/shared/HilfeIcon.tsx` (aria-label + Popover für „?"-Hilfen), aber **keine zentrale Quelle für `title`-Texte** auf normalen Knöpfen. Die ~30 nackten Knöpfe sind in `maengelliste-final.md` §2 vollständig aufgezählt.

**M19 (@scope-Warnung):** Der UI-Warnhinweis ist `components/import/SeitenStyles.tsx:118-138` (`<div role="alert">` „Seiten-Styles ohne @scope injiziert … Chrome/Edge empfohlen"), plus Konsolenwarnung `:100-103`. Feature-Erkennung `CSSScopeRule` `:51-53`. Der Warnkasten ist mein (Design), der Fallback-Zweig selbst ist Import-Lens.

**M16 (`prompt()`) und M20 (`rt-bleibt`-Preset):** beide liegen in `components/grafik/GrafikEditor.tsx` (Binärdatei wegen NUL-Byte Zeile 779 — per Grep unauffindbar; `rt-bleibt` erscheint in KEINER Quelldatei, nur in Docs → es ist Seed-/IndexedDB-Daten, wahrscheinlich hartkodierter Seed im Binär-File). Beide brauchen Bearbeitung via Read-Tool, nach dem NUL-Fix (N6, andere Lens).

## 2 · Ziel-Architektur (Design-Lens)

**Ein Tool-UI-Layer als semantische Brücke zwischen WEE-Tokens und jedem Panel.** Kein Panel hardcodet mehr Farben; alle konsumieren dieselben `--tool-*`-Aliasse, die aus den WEE-Tokens abgeleitet sind. So genügt EINE Stellschraube für die Gesamtoptik, Leon kann sie global abnehmen, und **Puck-Chrome UND Eigen-Panels ziehen aus derselben Quelle**.

- SSOT bleibt `app/design-tokens.css` (unverändert).
- Neu: `app/editor/editor-ui.css` (Tool-UI-Aliasse), einmal in `/editor` geladen. Beispiel-Mapping unter §CSS-Architektur.
- Puck-Chrome: Override-Block auf `.seiten-puck-wrapper`, der Pucks CSS-Variablen (`--puck-color-*` in 0.22) auf die `--tool-*`-Aliasse zieht (dokumentierte Variablen bevorzugen statt interner Klassennamen).
- Flächen strikt hell: `--surface` (#fff) / `--surface-sunken`/`--sand-100/200` für eingesenkte Blöcke. Dunkelgrün NUR noch für Text/Linien (`--text-*`, `--green-600` für Werte). Signal = `--accent-500` (Orange) + `--green-500`.
- **Offene Design-Spannung (Option für Leon):** Das Animator-Panel schwebt über der jetzt hellen/sandfarbenen Live-Seite. Ein solides Sand-Panel über Sand-Seite trennt evtl. schlecht → zwei Varianten vorbereiten: (A) solide `--surface` + `--shadow-lg` + `--border-default`; (B) helles Glas (`--glass-light` + `--glass-blur`, WEE hat die Tokens). Leon wählt.

## 3 · Umsetzungsschritte (geordnete, einzeln abnehmbare Häppchen)

Jeder Chunk: Dateien → Deliverable. Reihenfolge folgt R3 (Station-Nähe) und „klein zuerst".

- **C0 — Fundament (unsichtbar außer Font).** Datei: neu `app/editor/editor-ui.css` + Font-Aliasse in Panels. Deliverable: `--tool-*`-Layer definiert; `system-ui` → `var(--font-body)`/`var(--font-display)` in allen Panel-CSS. Kein Farbwechsel. Ermöglicht alle folgenden Chunks.
- **C1 — Seiten-Station fertig (kleinstes sichtbares Häppchen, inkl. N5).** Datei: `app/editor/seiten-bereich.css:23,300-301,580`. Deliverable: die 3 dunklen Reste hell; **N5 = helle Variante der Puck-Kopfleiste** vorbereitet (Sand-Fläche, `--text-strong`, Signal-Buttons) → als Erstes zur Optik-Abnahme an Leon.
- **C2 — Puck-Chrome.** Datei: `app/editor/seiten-bereich.css` (Override-Block) + ggf. `app/puck/*`. Deliverable: Pucks Felder-Sidebar/Kopf in WEE-Optik über `--puck-*`-Override.
- **C3 — Animator-Hauptpanel `.gre-panel` (der große Brocken, in 3 Teilen).** Datei: `components/grafik/grafik-editor.css`. 3a Container/Tabs/Kopf/Verlauf; 3b Bibliothek/Pool/Assets/Regler; 3c Fluss-Eintrag/Sektionen/Presets/OG-Liste/Rubberband/Snap.
- **C4 — Satelliten-Dialoge Grafik.** Dateien: `grafik-inspector.css`, `grafik-objekt-menue.css`, `grafik-keyframe-timeline.css`, `grafik-easing.css`, `grafik-layer.css`. Deliverable: Inspector, schwebendes Objektmenü, Zeitleiste, Easing-Kurve, Ebenen-Outline hell.
- **C5 — Overlays & Hilfe.** Dateien: `grafik-crop.css`, `grafik-hilfe.css` (Popover + Dialog + Tutorial via `ProduktTutorial.tsx`), `shared/HilfeIcon.tsx`-Optik, Vektor-Overlay; **M19**: Warnkasten `SeitenStyles.tsx:118-138` entfernen (mit Import-Lens abstimmen).
- **C6 — Fluss & Backdrop.** Dateien: `components/river/river-kurs-editor.css` (rke-* werden von den Fluss-Sektionen in `components/river/sektionen/*` weiterverwendet), Fluss-Handles (`river-kurs-editor.css:24-39`), `components/backdrop/backdrop.css`. **Ausgenommen:** `river.css`/`river-birth.css` = die animierte Fluss-Grafik selbst (Feature-Visual, kein UI-Chrome — nicht anfassen).
- **C7 — M17 Titel-Abdeckung (parallel, additiv).** Konvention + Textquelle (§unten). Dateien: alle in `maengelliste-final.md` §2 genannten Komponenten.
- **C8 — M16 + M20 (nach N6-NUL-Fix).** Datei: `components/grafik/GrafikEditor.tsx` (via Read-Tool). M16: `prompt()` → Inline-`<input>` im Panel; M20: `rt-bleibt`-Seed entfernen (+ ggf. IndexedDB-Migration prüfen).
- **C9 — M21 Abnahme-Paket (nach Flow-Umbau).** Screenshot-Serie (§unten).

## Token-Mapping-Tabelle (dunkles Panel → WEE)

| Aktuell (Rolle) | WEE-Ziel-Token |
|---|---|
| `rgba(20,30,24,.92)` Panel-Fläche | `--surface` (solide) **oder** `--glass-light`+`--glass-blur` (Option B) |
| `#10201a` Eingabe/Thumb-Fläche | `--surface` + `--border-default` (bzw. `--sand-50`) |
| `#3f6e3a` (green-600) Default-Button-Fläche | **kein Grün** → `--sand-200` Fläche, `--text-body` Text, `--border-default` |
| `#3f6e3a` aktiver Reiter / Primär-Aktion | Signal: `--accent-500` (Orange), Text `#fff` — Alt.: `--green-500` |
| `#4d8546`/`#4f8a49` Button-Hover | `--sand-300` bzw. Rahmen `--accent-500` |
| `#f2efe7` Panel-Text | `--text-body` / Titel `--text-strong` |
| `#9fd68a` (green-300) Wert/Sekundärakzent | `--green-600` (Dunkelgrün als Text erlaubt) bzw. `--text-muted` |
| `#e8b400` Gelb „aktiv/gekoppelt"-Umriss | **Option für Leon:** `--accent-500` (Orange) / `--green-500` / `--warning` (Amber) |
| `#e8b400` „Freischalten"-Button | `--accent-500`, Text `#fff` |
| `#8a2b2b`/`#a83737` Danger | `--danger` (#C9442E) |
| `#00c4cc` Canva | beibehalten (Fremdmarke, kein Systemton) |
| `rgba(255,255,255,.15)` Trennlinie | `--border-subtle` / `--border-default` |
| `rgba(0,0,0,.2–.35)` eingesenkter Block | `--surface-sunken` / `--sand-100` |
| Fokus `#9ecb98` | `--focus-ring` |
| `system-ui` | `--font-body`; Titel `--font-display` |

## Komponenten-Inventar (Panels/Dialoge zum Umbau)
- **grafik/**: `GrafikEditor`(`.gre-panel`, alle Tabs+Pool+Assets+Presets+OG), `GrafikInspector`, `GrafikObjektMenue`, `GrafikCrop`(Vollbild-Overlay), `EasingKurve`, `GrafikKeyframeTimeline`, `GrafikLayer`(Outline), `GrafikHilfe`(Popover/Dialog), `ProduktTutorial`, `GrafikExportPanel`/`GrafikExportAnleitung`, `WebsiteOg`, `GrafikSeiteTab`, `GrafikMedium`.
- **river/**: `sektionen/{Fluss,Wasser,Front,Nebel,Profile}Sektion` + `Regler` (nutzen rke-*), `FlussKnotenHandles`/`FlussHandlesEbene` (Handle-Punkte). *river.css/river-birth.css ausgenommen.*
- **app/editor/**: `SeitenBereich`(3 Reste+N5), `SeitenImport`, `SeitenVorschau` (Inline-Styles gegenprüfen).
- **shared/**: `HilfeIcon`. **backdrop/**: `BackdropAuswahl`, `BackdropHilfeIcon`. **Puck-Chrome** via Override.

## CSS-Architektur
1. `app/design-tokens.css` = SSOT (unangetastet).
2. Neu `app/editor/editor-ui.css`: semantische Aliasse, z. B. `--tool-panel-bg:var(--surface); --tool-panel-sunken:var(--sand-100); --tool-btn-bg:var(--sand-200); --tool-btn-text:var(--text-body); --tool-signal:var(--accent-500); --tool-active:var(--green-500); --tool-danger:var(--danger); --tool-border:var(--border-default); --tool-text:var(--text-body); --tool-text-strong:var(--text-strong); --tool-muted:var(--text-muted); --tool-focus:var(--focus-ring); --tool-font:var(--font-body); --tool-font-display:var(--font-display);`
3. Jede Panel-CSS ersetzt Hex → `--tool-*` (mechanisch, ein Panel je Chunk).
4. Puck-Chrome: `.seiten-puck-wrapper{ --puck-color-…:var(--tool-…); … }` — dokumentierte Puck-0.22-Variablen, nicht interne Klassen.
5. Namespacing: `--tool-*` bleiben getrennt von den Seiten-Tokens der importierten Bühne (die ihr eigenes `:root` via `SeitenStyles`→`:scope` bekommt); Panels sind `position:fixed`-Overlays außerhalb des Bühnen-Containers → kein Bleed.

## M17 Titel-Konvention + Textquelle
- **Konvention:** Jeder interaktive Knopf ohne sichtbaren Textinhalt bekommt `title` (Maus-Hover) UND `aria-label` (Screenreader); Icon-Knöpfe mit bestehendem `aria-label` (HilfeIcon) erhalten `title` zusätzlich. Text beschreibt die WIRKUNG, nicht den Namen (analog HilfeIcon-Doc `:48`).
- **Textquelle:** zentrale Map `components/shared/knopf-titel.ts` (`{ [knopfId]: string }`), damit die ~30 Texte an einer Stelle liegen und mit den „?"-Hilfetexten stilistisch konsistent bleiben. Liste der Knöpfe = `maengelliste-final.md` §2 (GrafikEditor 8, GrafikObjektMenue 8, GrafikCrop 4, FlussSektion 3, Umschalter 2, Export/Hilfe je 2, Einzelfälle). Testbare Regel per ESLint/`grep`-Gate: kein `<button>` ohne Textkind und ohne `title`.

## M21 Abnahme-Paket (Screenshot-Plan)
Nach dem Flow-Umbau, **eine Sicht je Abnahme-Häppchen** (Leon nimmt einzeln ab). WEE-Tool = nur Hell-Modus (kein Dark-Toggle).
- **Sichten:** Station 2 Puck-Bauen · Station 3 Animator · Station 4 Live-Preview+Export.
- **Breakpoints je Sicht:** 375 (Mobil), 768 (Tablet), 1440 (Desktop) + 1920 zusätzlich für den panel-lastigen Animator.
- **Control-Nahaufnahmen:** Reiterleiste (aktiv/hover/focus), Default- vs. Signal-Button, Danger-Button, Slider/Regler, Inspector, Hilfe-Popover, Crop-Overlay, Tutorial, Preset-Inline-Input (M16), Puck-Kopfleiste hell (N5).
- Belege nach `verifikations-protokoll.md` §1.4 (visueller Beleg Pflicht); Leons Optik-Abnahme bleibt zusätzlich aus.

## 4 · Risiken + Gegenmaßnahmen
- **Puck-Chrome-Overrides brüchig** (interne Klassen/Versionsdrift 0.22.2). → dokumentierte `--puck-*`-Variablen statt Klassen-Hacks; Version pinnen; Browser-Verify.
- **Kontrast-Umkehr** hell↔dunkel: jedes Paar neu prüfen (WCAG). → nur `--text-*` auf `--surface`/`--sand` (bereits kontrast-getunt), Stichprobe je Chunk.
- **`GrafikEditor.tsx` Binär/NUL** (M16/M20): riskante Edits. → erst N6-Fix (andere Lens) abwarten, dann Read-Tool + punktuelle Edits.
- **Gelb-Rollenkollision** (`#e8b400` = aktiv+warnung+snap): ein Token deckt nicht alle. → Optionsset an Leon, dann pro Rolle mappen.
- **Grün-als-Fläche entfernen mindert Affordanz** (alle Buttons heute grün). → zwei Button-Stile (neutral Sand default, Orange/Grün-500 primär), Leon wählt.
- **Bühne-über-Bühne-Trennung** (Panel-Sand über Seiten-Sand). → Glas- vs. Solid+Shadow-Variante (Option A/B oben).

## 5 · Abhängigkeiten zu anderen Lenses
- **Flow (R3/R4):** Das Panel wird umstrukturiert (8 Tabs → User-Reise-Reiter, Animator = Station 3, neue Station 4). **C3+ müssen die FINALE Struktur stylen, nicht die heutige** → C0–C2 laufen unabhängig, C3+ erst NACH dem Flow-Panel-Umbau, sonst Nacharbeit.
- **Undo (R1):** Styling ändert Undo nicht. Aber M16 (Inline-Preset-Input) erzeugt eine neue Editier-Aktion — ob Preset-Speichern in die Historie gehört, hängt an N10 (Bibliothek-Undo, Undo-Lens).
- **Import:** M19-Warnkasten (meins) sitzt am `@scope`-Fallback (Import entscheidet über den Zweig selbst); N5-Kopfleisten-Umbau darf die iframe-Style-Injektion (`SeitenBereich.tsx:79-103,424`) nicht brechen; `rt-bleibt` (M20) ist Preset-Seed-Daten (Import/Daten-Lens).
- **Preview/Export (M23/M25):** neue Station-4-Oberfläche + Export-Menü brauchen Styling — sie bauen die Struktur, ich liefere den `--tool-*`-Layer und restyle danach.

## 6 · Offene Fragen (nur echt unentscheidbar)
- **Animator-Panel-Trennung über heller Bühne:** solides Sand-Panel (+Shadow/Border) ODER helles Glas? Beides technisch machbar (Tokens vorhanden), rein optischer Verdikt-Punkt für Leon — blockiert konsistentes Container-Mapping in C3, bis entschieden. (Alle übrigen Design-Verdikte sind als Optionsset vorbereitet, nicht offen.)

## 7 · Abgedeckte Defekt-IDs
**M24, R5, N5, M17, M19, M16, M20, M21.**

Belege liegen ausschließlich per Datei:Zeile vor; keine Datei wurde verändert (read-only). `GrafikEditor.tsx` wurde wegen des NUL-Bytes nur über Doku/Grep-Metadaten referenziert — M16/M20 dort sind für die Umsetzung per Read-Tool zu öffnen.