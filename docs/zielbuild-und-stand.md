# Zielbuild & Stand — WEE Website-Builder

> Stand: 2026-07-19 · Kompakte Zusammenfassung von Zielbild, Architektur und Ist-Stand.
> Ausführlicher Master-Plan: [builder-plan.md](builder-plan.md). Beides lebt im Projekt-Repo
> `coastcoder439/wee-website-refactoring` und wird mit dem Projekt versioniert.

---

## 1. Zielbild (Nordstern)

Ein **selbst-gehosteter, kostenloser visueller Website-Editor der Wix/Elementor-Klasse**,
als Dashboard im Agentic OS, auf Open-Source-Basis. Drei Schichten, die sich nicht überlappen:

| Schicht | Werkzeug | Status |
|---|---|---|
| **Animation** (Scroll-Keyframes, Fluss, Vektorisierung) | **unsere Tools** — das Alleinstellungsmerkmal, das kein OSS-Tool liefert | ✅ gebaut (R1) |
| **Komposition** (Seiten, Sektionen, Layout, Blöcke) | **Puck-Editor** (`@puckeditor/core`, MIT, React-nativ) — NICHT „Puck CMS" (das ist ein unverwandtes C#-Produkt) | ⬜ R2 |
| **Inhalt** (Text, Bilder, Daten in Git) | **Decap** (Bens Workflow) bzw. später Sveltia | ⬜ R3 |

**Betriebs-Modus:** Seiten leben im Tool (gebaut oder importiert). Für bestehende Fremdseiten,
die NICHT importiert werden, bleibt der Overlay-Embed die Brücke (best effort).

---

## 2. Der Website-Importer (eigener Baustein — NICHT von Puck erwartet)

**Faktenlage (recherchiert, Primärquellen):** Puck editiert ausschließlich sein eigenes
JSON-Datenmodell (`{root, content:[{type, props}], slots}`) und liest niemals TSX/JSX/HTML.
Einen eingebauten „Ordner rein → editierbar"-Import gibt es nicht (Issue #888 offen).

**Konsequenz — wir bauen den Importer selbst**, dreistufig nach Sauberkeit der Quelle:

| Stufe | Quelle | Mechanismus | Verlässlichkeit |
|---|---|---|---|
| **A** | Datengetriebene Seiten mit **gleicher Komponenten-Bibliothek** (unser Fall, Bens Fall: Configs wie `grafik.config.json`, `curtain.config.json`, `layers`-Struktur) | **Deterministischer Adapter** (Algorithmus): Config/Deskriptoren → Puck-`content[]`, mechanisches Mapping | hoch, reproduzierbar |
| **B** | Gleiche Struktur, aber Hand-JSX (`page.tsx`-Komposition) | **AST-Codemod** für statische Bäume + **lokaler Agent** prüft/mappt den Rest, kapselt Unmappbares in Container-Komponenten | gut, mit Review |
| **C** | Beliebige fremde Seite (normaler Ordner, beliebiger Stack) | **Lokaler LLM-Agent-Importer**: liest den Ordner, zerlegt in registrierte Bausteine, erzeugt Puck-Daten, **flaggt ehrlich**, was er nicht abbilden konnte | best effort — Ergebnis ist ein Vorschlag, kein 1:1-Klon |

**Voraussetzung für alle Stufen:** die Komponenten der Seite sind in `config.components`
registriert (bei Stufe A/B trivial: `render` delegiert an die bestehende Komponente → 1:1-Parität).

**Harte Grenze (gilt immer):** Nur serialisierbare, registrierte Bausteine überleben den
Round-Trip. Funktionen als Props, Inline-Logik, bedingtes/gemapptes JSX → müssen gekapselt
oder nachgebaut werden. Je datengetriebener die Quelle, desto glatter der Import.
Für nicht-importierte Fremdseiten: Overlay-Embed (existiert, s.u.).

---

## 3. Stand heute (Ist)

### ✅ Fertig & gepusht — Standalone-Editor komplett (R1 + vorgezogenes Standalone)

**Grafik-/Animations-Editor**
- Vektorisierer (Raster→SVG, jede Farbfläche eigener Pfad, 63–160 ms, formtreu >98 %)
- Bild-Inspector („Bild"-Reiter): Position/Größe · In SVG umwandeln + Regler · Datei-Aktionen
- Asset-Bearbeitung: spiegeln · zuschneiden · freistellen (imgly, AGPL; lazy geladen)
- Keyframes: Bézier-Kurven (sichtbar + ziehbar), Kopieren, frame-spezifischer Bildtausch, Zeitleiste
- Mehrfachauswahl (Shift/Rubber-Band), Einrasten (Mitte/Raster/Nachbarn), Pfeiltasten-Nudge
- Undo/Redo (Strg+Z, ein Zug = ein Schritt), Objekt-Menü, 12 „?"-Hilfen + Tutorial
- Bibliothek lädt automatisch aus `public/` (projektrelativ, portabel); Abbilder auf Platte (`abbilder/`)

**Standalone-Fähigkeit**
- Backdrop-Modi: Screenshot · Single-File-HTML (`srcdoc`) · **ganzer Ordner** (Service Worker serviert same-origin unter `/wee-site/`)
- Scroll-Anker-Fix: Höhen-Normalisierung — Positionen überstehen Höhenunterschiede (Drift 56/72 Knoten → 0)
- Fluss-Profile: speichern/laden/importieren, Dateiname = Profilname, selbsttragender Snapshot (Geometrie + Farben eingefroren)
- **Embed-Kette:** `RiverFromSnapshot` (voller Fluss inkl. Schaum/Glitzer/Nebel ohne Host-DOM) → `wee-embed.js` (576 KB/172 KB gzip, läuft bewiesen auf nackter Nicht-React-Seite) → Export-Reiter (JSON · HTML-Overlay · Runtime) + Einbau-Anleitung

### 🟡 Offen im R1-Rest
- ⬜ Fluss-Editor: Tutorial + „?"-Hilfen (Grafik-Editor hat sie, Fluss noch nicht)
- ⬜ Website-OG voll: ALLES taggen (`data-og-*`), Seiten-Objekte direkt anklicken, Auto-„Ist-Stand"-Ebene (aktuell nur Bäume via „Seite"-Reiter)
- ⬜ Element-ID-Anker (Präzision über Höhen-Normalisierung hinaus — überlebt Verschiebungen mitten in der Seite)
- ⬜ Upscaling (echtes KI-Modell, serverseitig — bewusst verschoben)
- ⬜ Live-Bestätigung durch Leon/Ben: Freistellen-Erfolgsfall, Ordner-Picken, laufende Scroll-Animation (Sandbox konnte es nicht end-to-end)

---

## 4. Roadmap zum Zielbuild

| Phase | Inhalt | Status |
|---|---|---|
| **R1** | Animations-Kern härten (Editor, Export, Standalone) | ✅ im Kern fertig, Rest s.o. |
| **R2a** | **Puck-Spike**: unsere Komponenten in `config.components` registrieren, ein Tool (Grafik-Layer) als Puck-Komponente beweisen | ⬜ nächster Schritt |
| **R2b** | **Website-Importer** Stufe A (deterministischer Adapter für datengetriebene Seiten) → dann B (Codemod+Agent) → dann C (Agent-Importer) | ⬜ NEU als fester Baustein |
| **R2c** | Puck als visuelle Hülle; Animation als nativer Layer (relative Koordinaten, echte CSS/DOM-Integration — löst das Overlay-Fusions-Problem) | ⬜ |
| **R3** | Decap als Git-Content-Backend (Bens Workflow), Grenze Inhalt↔Präsentation | ⬜ |
| **R4** | Export-Pipeline produktiv (ganze Seiten + Elemente, self-hosted deploybar) | ⬜ teils via Embed vorhanden |
| **R5** | Dashboard im Agentic OS (mehrere Projekte, Rollen, Vorschau-Deploys) | ⬜ Vision |

**Leitplanken:** Jede OSS-Schicht erst per Spike beweisen, dann adoptieren. Nichts wegnehmen,
nur additiv. Optische Abnahmen macht ausschließlich Leon. Quelle wird nie verändert —
der Builder schreibt Abbilder.

---

## 5. Ehrliche Grenzen (damit niemand später überrascht ist)

1. **Import ist Eigenbau** — Puck liefert ihn nicht; unsere Stufen A–C sind der Weg. Stufe C (beliebige Fremdseite) bleibt best effort mit ehrlichem Flagging.
2. **Overlay-Embed auf fremden Seiten** ist Näherung: absolut positioniert, höhen-normalisiert, aber ohne Element-Anker verschiebt sich Inhalt-Mitte-Layout. Puck-native Seiten haben das Problem nicht.
3. **Serialisierungs-Grenze**: Nicht-JSON-fähiges (Funktionen, dynamisches JSX) landet nicht im Editor-Datenmodell.
4. **Browser**: Ordner-Modus nur Chromium (File System Access API).
