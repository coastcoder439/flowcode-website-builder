# Stationen-Menü-Inventar (verbindlich, R4)

> **Zweck:** Dieses Dokument ist die verbindliche Zuordnung JEDER heutigen Bedienfläche
> des Editors zu genau EINER der vier Stationen des Userflows (R3/R4). Es ist das
> Gegenstück zu [feature-inventar.md](feature-inventar.md) §1: dort steht, *dass* eine
> Funktion existiert und *wo heute*; hier steht, *in welcher Station* sie im
> Vier-Stationen-Modell lebt. Erstellt in Phase 1, Schritt **F7**
> ([plan-webbuilder-umbau-gesamt.md](plan-webbuilder-umbau-gesamt.md), Phase 1;
> Spec [plan-analyse/lens-flow.md](plan-analyse/lens-flow.md) §1 R4-Inventar + §2-Tabelle).
>
> **Der verbindliche Userflow (vier Stationen):**
> **1. Importieren → 2. Seite bauen (Puck) → 3. Animieren (Animator) → 4. Vorschau & Export.**
>
> **Regeln, die dieses Dokument durchsetzt:**
> - **R4** — Menüs schlank, strikt in die vier Stationen eingeteilt; keine Station zeigt fremde Menüs.
> - **Nichts-verlieren-Gate** — jede `- [ ]`-Funktionsgruppe aus feature-inventar §1 taucht in genau
>   EINER Station auf (Abgleich in §7). Verschiebungen sind **additiv/umgruppierend**, nie entfernend.
> - **Geplante Verschiebungen sind hier NUR dokumentiert, nicht gebaut.** Zwei stehen aus:
>   der **Export-Reiter → Station 4** (Bau in **Phase 5**, Schritt X4/X5) und die dazugehörige
>   Embed-/Export-Kette. Der **Hintergrund-Reiter bleibt Station 3** (bewusst, siehe §5).
>
> Datei-Pfade relativ zu `C:/Users/Lonsinator/Flowcode-Agentic-OS/user-projects/flowcode-website-builder/`.
> Zeilennummern sind Orientierung (die Dateien werden weiter umgebaut), nicht Vertrag.

---

## 1. Stand der Umsetzung (Kontext für dieses Inventar)

Die Flow-Shell steht bereits (Phase 1, F1–F6 gebaut):

- **F1** — Vier-Stationen-Nav in Flow-Reihenfolge, `?station=import|bauen|animator|preview`
  (Default `import`), Alt-Param `?bereich=seiten` → `bauen`. `app/editor/page.tsx:211-278` (`STATIONEN`, `StationsNav`).
- **F2** — Zentraler History-Reducer `navigiere()`, Dirty-Guard („Wirklich verlassen?"),
  `document.title` je Station (`STATIONS_TITEL` `page.tsx:220-225`).
- **F4** — Import ist **echte Station 1**: `SeitenImport` wird direkt gemountet (`page.tsx:515-537`),
  kein `importOffen`-Unterzustand in `SeitenBereich` mehr.
- **F5** — Produkt-Tour auf Shell-Ebene (`<ProduktTutorial>` `page.tsx:569`), feuert auf Station 1,
  Animator-„?"-Menü ruft sie manuell.
- **F6** — Animator-Panel-Toggle (`.gre-panel--versteckt` + Rest-Einblend-Knopf,
  `GrafikEditor.tsx:2593-2650`).

**F7 (dieses Dokument)** liefert die verbindliche Menü-Zuordnung, gegen die die weiteren Phasen
(v. a. Phase 5 = Station 4, Phase 6 = Design) prüfen.

---

## 2. Station 1 — Importieren (`?station=import`)

**Mount heute:** `SeitenImport` als Voll-Bereich (`app/editor/page.tsx:515-537`).
**Tab-Label:** „1 · Importieren". **Titel:** „1 · Import — Flowcode Builder".

| Bedienfläche | Wirkung | Herkunft (Datei ~Zeile) |
|---|---|---|
| Kopf „Website importieren" | Beschriftung | `SeitenImport.tsx ~219` |
| „← Zurück"-Knopf | Import abbrechen → `navigiere("bauen")` | `SeitenImport.tsx ~220` |
| „Ordner wählen" | Ordner mit statischer Website einlesen (Chrome/Edge) | `SeitenImport.tsx ~238` |
| „Zerlegen / Import-Bericht" | HTML zerlegen, Bericht (was→was, was entfällt) erzeugen | `SeitenImport.tsx ~285` |
| Import-Bericht + „Nicht übernommen / entfernt" | Ergebnis-Übersicht | `SeitenImport.tsx ~329 / ~350` |
| „Speichern & im Editor öffnen" | Seite speichern → aktive Website → `navigiere("bauen", {puck})` | `SeitenImport.tsx ~365` / `page.tsx:531-534` |
| „Verwerfen" | Import verwerfen → Seiten-Liste | `SeitenImport.tsx ~374` |

**Ausstehend in dieser Station (andere Phasen, hier nur vorgemerkt):**
- „?"-Hilfe-Icon auf der Import-Ansicht (N1) und differenzierte „erst bauen"-Meldung (M9) → **Phase 4, I7**.
- Feiner Import (gemma4-Zerlegung, Assets, Unterseiten, Fremdkörper-Filter) → **Phase 4** (I1–I9).
  Diese füllen Station 1 inhaltlich, ändern aber ihre **Stations-Zugehörigkeit nicht**.

---

## 3. Station 2 — Seite bauen / Puck (`?station=bauen`)

**Mount heute:** `SeitenBereich` (Verwaltungs-Liste + Puck-Editor + statische Vorschau als Sub-Zustand),
`app/editor/page.tsx:538-554`. **Tab-Label:** „2 · Seite bauen". **Titel:** „2 · Seite bauen — …".

### 3.1 Seiten-Verwaltung (Liste)

| Bedienfläche | Wirkung | Herkunft (~Zeile) |
|---|---|---|
| Kopf „Seiten" | Beschriftung | `SeitenBereich.tsx ~530` |
| „Website importieren" | **Quer-Sprung zu Station 1** (`navigiere("import")`) — bleibt in Station 2 als Einstieg | `SeitenBereich.tsx ~531-538` |
| „?"-Hilfe-Icon (Seiten-Bereich) | Kurzhilfe-Dialog | `SeitenBereich.tsx ~539-548` |
| „Neue Seite — Name" + „Neu" | Leere Seite anlegen und direkt im Editor öffnen | `SeitenBereich.tsx ~551-571` |
| pro Eintrag: „Vorschau" | **Schnellblick** — statische Vollbild-Vorschau je Seite (auch nicht-aktiver) | `SeitenBereich.tsx ~613-620` |
| pro Eintrag: „Öffnen" | Seite im Puck-Editor öffnen (`navigiere("bauen", {puck})`) | `SeitenBereich.tsx ~621-628` |
| pro Eintrag: „Als aktive Website setzen" | Seite zur Default-Bühne des Animators machen | `SeitenBereich.tsx ~629-638` |
| pro Eintrag: „Löschen" | Seite löschen (heute `confirm()`; wird Papierkorb in Phase 2/U7-U8) | `SeitenBereich.tsx ~639-647` |
| „★ aktive Website"-Badge | Markiert die aktive Seite | `SeitenBereich.tsx ~599-606` |

> **Entscheidung E1 (Default bestätigt):** Die **Schnell-Vorschau je Seite bleibt in Station 2**
> (additiv, kein Verlust). Station 4 ist die Export-Wahrheit der **aktiven** Seite — kein Widerspruch.

### 3.2 Puck-Editor-Kopf (Sub-Zustand `art:"puck"`)

| Bedienfläche | Wirkung | Herkunft |
|---|---|---|
| Seitenname + „Speichern" / „Zurück" | Puck-Kopfleiste (heute dunkler Vollbreite-Balken, N5 → Phase 6/D1) | `SeitenBereich.tsx` (Puck-Rendering) / Puck-Chrome |
| Puck-Sidebar (Bausteine, Props, HTML-Feld) | Fremdbibliothek `@measured/puck`; Feld-Defekt N3 → Phase 3/B4 | Puck-intern |
| Puck-eigenes Undo/Redo | Über History-Bridge an den Undo-Bus (N4 → Phase 2/U6) | `usePuck().history` |

### 3.3 Statische Vollbild-Vorschau (Sub-Zustand `art:"vorschau"`)

| Bedienfläche | Wirkung | Herkunft |
|---|---|---|
| `SeitenVorschau` + „← Zurück" | Chrome-freie Portal-Vorschau einer Seite | `SeitenBereich.tsx ~416-419` → `SeitenVorschau.tsx` |

> **Hinweis:** Diese Vorschau (Portal auf `document.body`) ist NICHT Station 4. Station 4 wird eine
> **eigene** Preview auf der Animator-Render-Grundlage (Export-Wahrheit) — siehe §5.

---

## 4. Station 3 — Animieren / Animator (`?station=animator`)

**Mount heute:** `BackdropProvider → EditorInner` (`page.tsx:509-511`), darin `GrafikEditor`
(`.gre-panel`) + Fluss (`FlussHandlesEbene`/`FlussObjektProvider`) auf derselben `/editor`-Route.
**Tab-Label:** „3 · Animieren". **Titel:** „3 · Animieren — …".

> Station 3 ist mit Abstand die dichteste Station. Sie erbt **alle** Grafik-Editor- und
> Fluss-Editor-Funktionsgruppen aus feature-inventar §1.A–1.U (außer dem Export-Reiter, der nach
> Station 4 vorgemerkt ist). Das Detail-Inventar bleibt feature-inventar §1 (Datei:Zeile); hier
> steht die **Stations-Zuordnung**.

### 4.1 Panel-Kopf `.gre-kopf` (immer über allen Reitern)

| Bedienfläche | Zuordnung / Anmerkung | Herkunft |
|---|---|---|
| Titel „Grafik-Editor" | Station 3 | `GrafikEditor.tsx ~2605` |
| ↶ Rückgängig / ↷ Wiederholen | Station 3 (Fokus-Weiche Grafik/Fluss; wird Undo-Bus in Phase 2) | `GrafikEditor.tsx ~2611-2632` |
| `HilfeMenue` (Produkt-Tour / Animator-Anleitung) | Station 3 | `GrafikEditor.tsx ~2636-2639` |
| **Panel-ausblenden-Toggle (M22/F6)** | Station 3 — neu, versteckt `.gre-panel` per CSS (kein Unmount) | `GrafikEditor.tsx ~2643-2650` |
| **Rest-Wiedereinblend-Knopf (M22/F6)** | Station 3 — nur bei verstecktem Panel | `GrafikEditor.tsx ~2593-2602` |
| scrollY-Live-Anzeige | Station 3 | `GrafikEditor.tsx ~2656` |
| Checkbox „🧲 Einrasten beim Ziehen" | Station 3 (tab-unabhängig) | `GrafikEditor.tsx ~2662-2670` |
| versteckte `<input>` datei/ordner | Station 3 | `GrafikEditor.tsx` (dateiRef/ordnerRef) |
| ~~„← Fluss"-Link~~ | **Entfällt** — Editoren vereint auf `/editor` (Inventar §4.3) | `GrafikEditor.tsx ~2651-2654` (Kommentar) |

### 4.2 Reiter-Leiste (8 Reiter) — alle Station 3

Reihenfolge und Labels laut `REITER` (`GrafikEditor.tsx:126-137`):

| # | id (stabil) | Label heute | Stations-Zuordnung |
|---|---|---|---|
| 1 | `bibliothek` | Bibliothek | Station 3 (feature-inv §1.B) |
| 2 | `ebenen` | Ebenen | Station 3 (§1.C) |
| 3 | `bild` | Objekt | Station 3 (§1.D, `GrafikInspector`) |
| 4 | `keyframes` | Animation | Station 3 (§1.E) |
| 5 | `seite` | Seite | Station 3 (§1.G, `GrafikSeiteTab` / Vorhang-Übernahme) |
| 6 | `hintergrund` | Hintergrund | **Station 3 (bleibt)** — `BackdropAuswahl` (§1.T), siehe §5 |
| 7 | `setups` | Speichern | Station 3 (§1.F, Setups + „Als Standard setzen") |
| 8 | `export` | Export | **Station 3 heute → geplant Station 4 (Phase 5)** — `GrafikExportPanel` (§1.H) |

### 4.3 Weitere Station-3-Flächen (kein Reiter)

| Funktionsgruppe | Zuordnung | Herkunft (feature-inv) |
|---|---|---|
| Schwebendes Objektmenü (`GrafikObjektMenue`, z70) | Station 3 | §1.I |
| Overlays & Indikatoren (Lock/Drop/Status/Vektor/Rubber-Band/Snap/Tutorial/Crop) | Station 3 | §1.J |
| Canvas-Interaktionen (Klick/Ziehen/Lock/Mehrfachauswahl/Snap/Paste …) | Station 3 | §1.K |
| Fluss-Panel-Rahmen + Reiter (Fluss/Wasser/Front/Nebel/Profile/Hintergrund) | Station 3 | §1.L–1.R |
| Fluss-Knoten-Handles + Interaktionen | Station 3 | §1.M, §1.S |
| Backdrop-Rendering (`Backdrop.tsx`, alle Modi) | Station 3 | §1.U |

> **Fluss-Anmerkung:** Der frühere `RiverKursEditor.tsx` (verwaiste Standalone-Route) wird in
> **Phase 0/P0.4** gelöscht (N12). Die Fluss-Bedienung selbst lebt vereint auf `/editor` (oben rechts)
> und gehört zu Station 3 — die Funktionsgruppen §1.L–1.S bleiben vollständig erhalten, nur ihr
> Datei-Ort ändert sich beim Merge.

---

## 5. Station 4 — Vorschau & Export (`?station=preview`)

**Mount heute (Platzhalter):** `StationVorschau` → bei gesetzter aktiver Website
`SeitenVorschau` der aktiven Seite; sonst dezente Notiz (`page.tsx:280-312`).
**Tab-Label:** „4 · Vorschau & Export". **Titel:** „4 · Vorschau & Export — …".

| Bedienfläche heute | Wirkung | Herkunft |
|---|---|---|
| Vollbild-Vorschau der aktiven Website | Portal-Vorschau (Platzhalter) | `page.tsx:284-290` → `SeitenVorschau.tsx` |
| „← Zurück" | zurück in den Flow (→ Station „Animieren") | `page.tsx:289 / 514` |
| Leer-Notiz „noch keine aktive Website" | Hinweis + „wird in Phase 5 zur Export-Wahrheit" | `page.tsx:291-311` |

### 5.1 Geplante Verschiebung (NUR dokumentiert — Bau in Phase 5)

Station 4 wird zur **„Live-Preview + Export"-Einheit** (M23/N14/M25). Dann ziehen zwei
Funktionsgruppen aus Station 3 hierher um — **additiv, nichts entfällt**:

| Was zieht um | Von | Nach | Wann |
|---|---|---|---|
| **Export-Reiter** (`GrafikExportPanel`, §1.H): „? Anleitung", Fluss-Profil-`select`, „Bilder einbetten", JSON-/HTML-Overlay-/Runtime-Export | Station 3, Reiter `export` | **Station 4** (einklappbares Export-Fenster; „Als Ordner exportieren" wird primärer Kernweg, die 5 Datei-Wege bleiben nachgeordnet) | **Phase 5, X4/X5** |
| **Embed-/Export-Kette** (§1.V): `baueEmbedConfig`, `baueOverlayHtml`, `EmbedRoot`, `embed-entry`, `RiverFromSnapshot`, `build-embed.mjs` | über Station-3-Export erreichbar | **Station 4** (Export-Generator; neuer Ordner-Modus via `POST /api/export/ordner`) | **Phase 5, X1–X5** |

Station 4 selbst wird dann ein **Preview-Modus auf der Animator-Render-Grundlage** (kein zweiter Bau):
Station 3↔4 teilen EINEN gemounteten Bühnen-Baum über ein `previewModus`-Flag (kein Remount),
Animator KOMPLETT aus (Panel + Klick-Abfangung), Links echt klickbar, nichts selektierbar.

### 5.2 Bewusst NICHT verschoben: der Hintergrund-Reiter

Der **Hintergrund-Reiter (`BackdropAuswahl`, §1.T) bleibt in Station 3.** Begründung: der Backdrop
ist das Werkzeug, das die **lebendige Quellseite als Bühne** unter den Animator legt (Ordner-/HTML-/
Bild-Modus). Das ist eine **Animier-Vorbereitung**, kein Export-Schritt. Ihn nach Station 4 zu ziehen
würde Station 3 die Bühnen-Wahl nehmen und Station 4 (reine Ausgabe-Kontrolle) mit einem
Editor-Werkzeug vermischen — Verstoß gegen R4 („keine Station zeigt fremde Menüs").

---

## 6. Stations-übergreifend (Shell, kein Stations-Menü)

| Bedienfläche | Rolle | Herkunft |
|---|---|---|
| **4-Stationen-Nav** (`StationsNav`, `role="tablist"`, Pfeiltasten/Home/End) | Die Navigation selbst | `page.tsx:227-278` |
| Dirty-Guard „Wirklich verlassen?" (`VerlassenDialog`) | Schützt ungespeicherte Puck-Änderungen bei Wechsel (N20) | `page.tsx:318-382` |
| `document.title` je Station (`STATIONS_TITEL`) | Tab-/Lesezeichen-Titel (N16) | `page.tsx:220-225` |
| Produkt-Tour (`ProduktTutorial`) | Onboarding, feuert auf Station 1, manuell via Animator-„?" | `page.tsx:569` |

> **Ersetzt:** Der frühere **2-Reiter-Umschalter „Animator | Seiten"** (M1, und die 2 titel-losen
> Knöpfe aus M17) ist durch die 4-Stationen-Nav abgelöst. Kein Funktionsverlust — die alten
> Bereiche sind als Stationen 2 und 3 erhalten, `?bereich=seiten` wird weiter auf `bauen` gemappt.

---

## 7. Abgleich gegen feature-inventar §1 (Nichts-verlieren-Gate)

Jede Funktionsgruppe aus [feature-inventar.md](feature-inventar.md) §1 erscheint in **genau einer**
Station. UI-lose Infrastruktur (Backend-Routen, Bibliotheken) wird der Station zugeordnet, deren
Bedienflächen sie ausschließlich bzw. primär bedient; echt stationsneutrale Infrastruktur steht als
solche markiert.

| feature-inv §1 | Funktionsgruppe | Station | Anmerkung |
|---|---|---|---|
| 1.A | Grafik-Editor Panel-Kopf | **3** | „← Fluss"-Link entfällt (Merge) |
| 1.B | Reiter Bibliothek | **3** | |
| 1.C | Reiter Ebenen | **3** | |
| 1.D | Reiter Bild („Objekt") | **3** | |
| 1.E | Reiter Keyframes („Animation") | **3** | |
| 1.F | Reiter Setups („Speichern") | **3** | inkl. „Als Standard setzen" (einziger Live-Landing-Schreibpfad) |
| 1.G | Reiter Seite | **3** | Vorhang-Übernahme |
| 1.H | Reiter Export (`GrafikExportPanel`) | **3 → 4** | geplante Verschiebung Phase 5 (§5.1) |
| 1.I | Schwebendes Objektmenü | **3** | |
| 1.J | Overlays & Indikatoren | **3** | |
| 1.K | Canvas-Interaktionen | **3** | |
| 1.L | Fluss-Editor Panel-Rahmen | **3** | vereint auf `/editor` |
| 1.M | Fluss Knoten-Handle-Ebene | **3** | |
| 1.N | Reiter Fluss | **3** | |
| 1.O | Reiter Wasser | **3** | |
| 1.P | Reiter Front | **3** | |
| 1.Q | Reiter Nebel | **3** | |
| 1.R | Reiter Profile | **3** | |
| 1.S | Fluss-Interaktionen | **3** | |
| 1.T | Reiter Hintergrund (`BackdropAuswahl`) | **3 (bleibt)** | bewusst nicht nach 4 (§5.2) |
| 1.U | Backdrop-Rendering | **3** | Bühne = lebendige Seite |
| 1.V | Embed-/Export-Kette | **3 → 4** | folgt dem Export-Reiter, Phase 5 (§5.1) |
| 1.W | Vektorisierer-Bibliothek | **3** | DOM-frei; ausgelöst aus Bibliothek/Objekt (1.B/1.D) |
| 1.X | API-Routen | **verteilt** | siehe unten |
| 1.Y | Puck-Spike (`/puck`, `/puck-import`) | **2 (Domäne)** | separate Routen, nicht im Stations-UI; verlust-relevant, nicht löschen |

### 7.1 API-Routen (§1.X) je Station

| Route | Station | Bedient |
|---|---|---|
| `POST /api/import/grafik-setup` | **1** | Import-Zerlegung |
| `POST /api/puck-seite/liste\|lade\|speichere\|loesche` | **2** | Seiten-CRUD (Papierkorb-Erweiterung Phase 2/U7) |
| `POST /api/vektorisieren` | **3** | Bibliothek/Objekt-Vektorisierung |
| `POST /api/abbild` | **3** | Setups laden/speichern + `standard` schreibt `grafik.config.json` |
| `POST /api/assets` | **3** | Bibliothek (public/ lesen, public/vektor/ schreiben) |
| `POST /api/export/ordner` (neu) | **4** | Ordner-Struktur-Export (Phase 5/X2) |
| `POST /api/builder/status` | **neutral** | Discovery/Health, keine Station |
| `lib/api/server-helfer.ts` | **neutral** | CSRF/Body-Parsing für alle Routen |

**Ergebnis:** Keine `- [ ]`-Funktionsgruppe aus feature-inventar §1 ist ohne Station. Die einzigen
Stations-**Wechsel** gegenüber heute sind die zwei vorgemerkten Export-Verschiebungen (1.H, 1.V →
Station 4, Phase 5) — additiv, verlustfrei, hier dokumentiert und noch nicht gebaut.

---

## 8. Gate-Regel

Dieses Inventar gilt als eingehalten, wenn (a) jede Station nur ihre in §2–§6 gelisteten
Bedienflächen zeigt (R4), (b) die zwei geplanten Verschiebungen erst in Phase 5 real erfolgen und
(c) der Abgleich §7 nach jeder Phase weiterhin lückenlos ist (Kreuzprüfung gegen
feature-inventar §1). Jede neue Bedienfläche muss vor dem Bau hier einer Station zugeordnet werden.
