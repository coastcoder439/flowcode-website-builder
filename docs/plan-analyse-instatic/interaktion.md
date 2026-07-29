## Basis-Befund, der alles andere bestimmt

Ein Punkt, der in der bisherigen Kartierung fehlt und Frage 4 vorentscheidet: **der Design-Frame scrollt nicht — er ist auf Inhaltshöhe ausgerollt.**

- `instatic/src/admin/pages/site/canvas/IframeFrameSurface.tsx:643-646`: „Canvas frames are sized to the breakpoint width and **grow to content height**. Live frames fill the surface-controlled wrapper and **scroll internally**" — Design: `style={{width: `${width}px`}}` (Höhe imperativ gesetzt), Live: `{width:'100%', height:'100%'}`.
- `IframeFrameSurface.module.css:12-24` (Höhe wird von der Mess-Schleife gesetzt) vs. `:47-52` `.iframeLive { overflow: auto }`.
- `100vh` ist im Design-Frame hart auf **800 px gepinnt**: `resolveViewportUnits.ts:47` `CANVAS_VIEWPORT_HEIGHT = 800`, angewandt in `iframeBodyReset.ts:83` und `IframeFrameSurface.tsx:633`.

Konsequenz: Der Design-Frame **ist** die Scroll-Achse, räumlich ausgerollt. Das ist ein Geschenk, kein Hindernis — aber es heißt, unser Renderkern darf `window.scrollY` nicht mehr selbst lesen.

Zweiter neuer Befund: `useCanvasNodeRect` sucht `[data-canvas-overlay-layer]` (`plugin-host-hooks/index.ts:158-176`). Im Live-Modus wird der Layer gar nicht gemountet (`CanvasRoot.tsx`, `{!isLive && editable && <PluginCanvasOverlayLayer />}`) — der Hook liefert dort also **null aus zwei Gründen** (kein Layer *und* keine Selektion), nicht nur wegen der fehlenden Selektion.

---

## 1. Zerlegung von GrafikEditor.tsx (4184 Z., Stand heute — die Zeilen im Inventar sind veraltet)

### Grobschnitt

| Block | Zeilen | Umfang | Kategorie |
|---|---|---|---|
| Imports | 1-90 | 90 | — |
| Konstanten + REITER + reine Helfer (`naechsterKfIndex` 178-189, `istSvgName` 280, `eindeutigerSvgName` 288) | 92-296 | 205 | **1:1 portierbar, DOM-frei** |
| `ankerFelderFuer`/`ANKER_LEER` (201-264), `hoehenFaktor` (266-278) | 201-278 | 78 | portierbar, aber **liest `window.scrollY`/`innerHeight`/`documentElement.scrollHeight`** → Quelle injizieren |
| `AnimLadenDialog` | 394-465 | 72 | fällt weg (Instatic-Persistenz) |
| State-Deklarationen | 467-696 | 230 | ~40 % fällt weg (Backdrop, Setups, Ordner) |
| Lade-Effekte, Panel-Sichtbarkeit | 697-870 | 174 | fällt weitgehend weg |
| **`setzeGrafiken` / `patchKf`** | 878-914 | 37 | **Die zwei zentralen Mutatoren — hier hängt alles dran** |
| OG-Scan / Puck-Seite / Lade-Latch / `ogWaehlen` / `ogInBuilder` | 915-1223 | 309 | fällt weg bzw. wird zu Node-Targeting |
| **Wheel-im-Lock (Skalieren)** | 1224-1243 | 20 | portierbar, Ziel-Fenster wechselt |
| **Pointer-Effekt: Auswahl / Einzel-Zug / Gruppen-Zug / Rubber-Band / Snap** | 1257-1553 | **297** | **Der wertvollste Block. Reine Interaktionslogik, koordinatenraum-abhängig** |
| Bibliothek (`dateiUebernehmen` … `presetLoeschen`) | 1560-1962 | 403 | Assets → Instatic Media; Presets → eigene Storage |
| `vektorisieren` / `freistellen` | 1963-2119 | 157 | portierbar, `fetch` → Plugin-Route |
| Tastatur-Blocker + Paste/DnD | 2120-2179 | 60 | portierbar (Schutzschichten! Risiko 9) |
| Ebenen-Ops (`loeschen` … `tauschenStarten`) | 2181-2380 | 200 | Hälfte → Host-Store-Aktionen |
| **Keyframe-Ops (`keyframeSetzen` 2382, `keyframeLoeschen`, `kfDuplizieren`, Zeitleisten-Zug)** | 2382-2487 | 106 | **1:1 portierbar** |
| **Persistenz (11 `fetch`)** | 2490-2760 | 271 | **stirbt komplett / wird Abstraktion** |
| Undo-Wrapper + globaler Tastatur-Effekt | 2761-2861 | 101 | portierbar |
| Abgeleitete Werte + `poolEintrag` | 2863-2966 | 104 | teils |
| **JSX gesamt** | 2967-4184 | **1218** | s. u. |

**Die 11 API-`fetch`:** 760 (`/api/assets` liste), 919 + 1077 (`/api/puck-seite/lade`), 928 (`…/speichere`), 1980 (`/api/vektorisieren`), 2026 (`/api/assets` schreibe), 2520/2557/2632/2677/2718 (`/api/abbild` liste/speichere/lade/loesche/**standard**). Plus ein Nicht-API-`fetch(quelle.src)` in 1976 (Blob).
→ **Abstraktion:** genau zwei überleben inhaltlich — Vektorisieren (rechenintensiv, braucht `sharp`) und Assets-Schreiben. Beide werden `api.cms.routes.post(...)` im **Server-Entrypoint** (QuickJS!) oder — weil `sharp` im Sandbox unmöglich ist — clientseitig im Editor-Entrypoint (unsandboxed, volles DOM/Worker). **Empfehlung: clientseitig**, unsere Vektor-Bibliothek (`components/vektor/`, 1330 Z., NULL externe Imports) läuft im Browser; damit fällt der Server-Roundtrip ganz weg. Die übrigen 9 sterben mit der Setups-/Puck-Persistenz.

### JSX-Aufteilung (2967-4184)

| Reiter | Zeilen | Verdikt | Begründung |
|---|---|---|---|
| Panel-Rahmen (Kopf, ↶↷, Hilfe-Menü, scrollY-Anzeige, Einrasten-Checkbox, Tab-Leiste mit Roving-Tabindex, versteckte File-Inputs) | 2967-3123 | **(c) fällt weg** | Host liefert Panel-Chrome (`PluginEditorPanel` — „chrome (header + close) is host-provided", `types/panels.ts`), Undo-Knöpfe (CanvasNotch), Rail, Tabs (`Tabs/TabList/Tab/TabPanel` aus `@instatic/host-ui`). **Einrasten-Checkbox + Playhead-Zahl bleiben** und wandern in den Panel-Kopf. |
| **Bibliothek** | 3124-3265 | **(c) grösstenteils** + (b) Rest | Assets/Upload/Suche/Ordner → Instatic `MediaExplorerPanel` + Media-Workspace. **Nicht ersetzbar:** ⬡ Vektorisieren, 🪄 Freistellen, die **Presets** (Animations-Bibliothek) und der `kfBildZiel`-Bewaffnungs-Modus → eigener Panel-Abschnitt. Die zwei HOVER-ONLY-Knöpfe (Risiko 1) fallen dabei ersatzlos weg — bewusst, sie werden sichtbare Aktionen. |
| **Ebenen** | 3266-3470 | **(c) grösstenteils** + (b) Mehrfachauswahl | `DomPanel` (Layers) kann Umbenennen (Doppelklick), Verstecken (`toggleNodeHidden`), Sperren (`toggleNodeLocked`), Duplizieren, Löschen, Reihenfolge per DnD. **Aber:** Instatics `selectionSlice` hält nur `selectedNodeId`/`hoveredNodeId` (`docs/editor.md:337`) — **es gibt keine Mehrfachauswahl im Host.** Unsere Gruppen-Zug-/Rubber-Band-Mechanik (1.K) hat kein Gegenstück und bleibt eigener Zustand. |
| **Objekt („bild")** | 3471-3578 | **gespalten** | Der Reiter ist heute dreiwertig (`WebsiteOgObjekt` \| `FlussObjektBild` \| `GrafikInspector`, 3472/3492/3508). Die **skalaren** Eigenschaften (Grundbreite, Deckkraft, Drehung, Spiegeln, Abspielmodus) werden **Modul-Props** und rendert der Host von selbst — `PluginPropertyControl` kennt `number{min,max,step,unit}`, `toggle`, `select`, `image`, `color` (`plugin-sdk/modules.ts:24-40`). **(c)**. Alles Bespoke (✂ Zuschneiden, ⬡ Vektorisieren mit Fortschritt, 🪄 Freistellen, ⚓ Anker lösen) **kann kein Property-Control sein** → **(b)** in unser Panel. |
| **Animation („keyframes")** | 3580-3888 | **(a)+(b) — das Herz** | Instatic hat **null** Animation. Logik 1:1, JSX neu mit Host-Primitives. `EasingKurve.tsx` (157 Z.) und `GrafikKeyframeTimeline.tsx` (154 Z.) werden 1:1 übernommen, nur auf Host-Tokens umgefärbt. |
| **Speichern („setups")** | 3890-4043 | **(c) fällt weg** | Instatic besitzt Draft/Publish/Versionen. „Als Standard setzen" = Publish. |
| **Seite** | 4045-4056 (+`GrafikSeiteTab.tsx` 208 Z.) | **entfällt als Reiter** | WEE-Spezialfall (Vorhang-Bäume). Sein *Konzept* („ein Element, das die Seite selbst zeichnet, in den Builder holen") wird zum generischen **Node-Targeting** — und damit zum Kern des Ankers, nicht zu einem Tab. |
| **Hintergrund** | 4058 (1 Zeile, `BackdropAuswahl`) | **(c) fällt komplett weg** | Backdrop existiert nur, weil wir keine echte CMS-Seite hatten: Screenshot/HTML/Ordner + Service Worker + IndexedDB + `Backdrop.tsx`. Instatic rendert die echte Seite. **Grösste einzelne Ersparnis des ganzen Vorhabens.** |
| **Export** | 4060-4086 (+`GrafikExportPanel.tsx` 455 Z.) | **(c) grösstenteils** | Instatic publiziert. Bleibt: ein kleiner Statusabschnitt „Runtime aktiv / nicht aktiv" — kein Download-Knopf mehr. |
| Globale Indikatoren + Geschwister-Overlays (Lock-Hinweis, Drop, Status, Vektor-Overlay, Objektmenü, Rubber-Band, Snap-Linien, OG-Outline, Tutorial) | 4088-4182 | **(a)/(b)** | Wandern in den Canvas-Overlay bzw. Toasts (`pushToast`, Instatic-Regel: kein `alert/confirm`). |

**Grobbilanz:** von 4184 Zeilen überleben inhaltlich ~1100 (Pointer-/Keyframe-/Anker-/Vektor-Logik), ~1300 werden mit Host-Primitives neu gebaut, ~1800 sterben.

---

## 2. Wo lebt was in Instatic

| Instatic-Fläche | Was von uns dort hin | Warum |
|---|---|---|
| **`entrypoints.modules` → Modul `flowcode.grafik`** | Die Grafik selbst als **Node**. `render()` gibt `<div data-fc-grafik-id … data-fc-kf="…">` + `<img>`. `schema` deklariert Grundbreite/Deckkraft/Drehung/Modus/Spiegeln → Host rendert PropertiesPanel. `keyframes` liegt als **freier Prop** daneben. | Damit bekommen wir Layers-Baum, Selektion, Sperren/Verstecken, Duplizieren, Undo, Publish **geschenkt** — das ist der Unterschied zwischen „nativ" und „Fremdkörper". Belegt: `validateNodeProps.ts` Tier 2 `return { ...rawProps, ...cleaned }` erhält unbekannte Keys; ohne `propsSchema` wird `rawProps` unverändert durchgereicht. |
| **`editor.canvas.registerOverlay`** | Playhead-Linie, Anker-Linie, Snap-Hilfslinien, Rubber-Band, Objektmenü, Zug-Handles, Mehrfachauswahl-Rahmen. | Der Layer liegt ausserhalb des Transform-Layers in Screen-Koordinaten (`PluginCanvasOverlayLayer.module.css`), `pointer-events:none` mit Opt-in — genau unser heutiges Modell (Grafik-Ebene `pointer-events:none`, Treffer über einen Fenster-Listener). **Achtung:** der Layer trägt `aria-hidden="true"` — interaktive Overlay-Inhalte brauchen einen eigenen, nicht-versteckten Tastaturweg (unser Panel). |
| **`editor.panels.register` → EIN Panel „Animation"** | Keyframe-Liste, Zeitleiste, Easing-Kurve, Playhead-Scrubber, Presets, Vektorisieren/Freistellen/Crop, Anker-Status. | Ein Panel, innen `Tabs` aus `@instatic/host-ui` — nicht acht Rail-Einträge. Sonst Fremdkörper. |
| **`editor.commands` + `toolbar.addButton` + `palette`** | „◉ Hier locken", „Playhead an Auswahl", „Alle Keyframes zeigen", „Runtime an/aus". | Tastenkürzel-Ersatz: `PluginCommand.shortcutLabel` ist laut `types/commands.ts` **nur informativ, nicht gebunden** — echte Kürzel müssen wir selbst am `document` registrieren, mit unseren Capture-Guards (Risiko 9). |
| **Site-Script (`SiteFile type=script`, `runInCanvas:true`)** | Unsere `wee-embed`-Runtime. | Läuft in **beiden** Canvas-Modi und auf der publizierten Seite: `CanvasRoot.tsx:94/411/512/524` reicht `runtimeScripts` an Live- **und** Design-Surface; `RuntimeScriptInjector.tsx` injiziert imperativ per `createElement`. Gated am Store-Flag `runScripts`. |
| **Plugin-Route (Server)** | nichts Zwingendes. | Vektorisieren läuft clientseitig; QuickJS könnte `sharp` ohnehin nicht. |

**Primitiven-Lücke (konkret):** `plugin-host-ui/index.ts` exportiert Alert, Button, Card, Checkbox, Code, EmptyState, Heading, Input, SearchBar, Select, Separator, Stack, Switch, Text, Textarea, Charts, Widget, Tabs, Skeleton — **kein Slider/Range**. Unser Editor ist regler-lastig (Grundbreite, Deckkraft, Drehung, 3 Vektor-Regler, im Fluss 15 weitere). Zwei Wege: (1) `Input type=number` — Host-treu, aber Bedienverlust; (2) eigener `<input type=range>` in einem CSS-Modul mit Host-Tokens (`--overlay-*`, `--radius`, `--accent-*`). **Empfehlung (2)** mit exakt einer Regler-Komponente, die alles nutzt — und die skalaren Modul-Props bekommen zusätzlich den Host-`number`-Control, sodass beide Wege stimmen.

---

## 3. Selektion im Live-Modus (offener Punkt a)

Drei diskutierte Optionen, plus die eigentliche Empfehlung:

| Option | Robust? | Bricht bei Update wenn… |
|---|---|---|
| A: Eigener Klick-Handler im Portal-Layer, Hit-Testing gegen `[data-node-id]` im Live-iframe | mittel | `data-node-id` umbenannt wird; Portal-Anker `[data-instatic-canvas-root]` umbenannt wird; `CanvasRoot.tsx`-Bedingung `!isLive` verschwindet (dann doppelte Layer) |
| B: Auswahl aus dem Store spiegeln | **funktioniert nicht** | Der Store hat im Live-Modus schlicht keine (Explorer zu, kein `selectedNodeId` — Spike Z. 51-55) |
| C: Eigene Auswahl-Leiste im Panel (Liste unserer Grafik-Nodes, Klick wählt) | **sehr robust** | fast nie — hängt nur an `editor.store.read` |
| D (Fork): ein Zeichen in `CanvasRoot.tsx:535` | robust im Betrieb | jedem `0.0.x`-Merge |

**Empfehlung: C als Fundament + A als Komfort, D nie.**

Begründung: Wir brauchen im Live-Modus ohnehin eine eigene Auswahl, weil wir **Mehrfachauswahl** haben, die der Host nirgends kennt (`selectionSlice` ist einwertig). Sobald unsere Auswahl unser eigener Zustand ist (Panel-Liste = Wahrheit, Host-`selectedNodeId` wird nur *gespiegelt*, wenn er da ist), ist Live-vs-Design kein Sonderfall mehr, sondern nur „Host-Selektion verfügbar: ja/nein". A wird dann reiner Komfort (Klick auf die Grafik wählt sie in unserer Liste) und darf beim Update ausfallen, ohne das Werkzeug zu blockieren.

Wichtig: Auch mit Auswahl liefert `useCanvasNodeRect` im Live-Modus **null** — der Overlay-Layer fehlt (siehe Basis-Befund). Wir brauchen dort also **eigene Messung** aus dem Portal heraus: `iframe.getBoundingClientRect()` + `el.getBoundingClientRect()` im Live-Dokument (Spike Z. 44 hat genau das bewiesen). Das ist ~30 Zeilen, kapselbar in **eine** Funktion `messeNode(nodeId): Rect | null`, die im Design-Modus an `useCanvasNodeRect` delegiert und im Live-Modus selbst misst. **Diese eine Funktion ist die gesamte Update-Angriffsfläche** (Punkt d) — sie und der Portal-Anker sind die zwei Stellen, die ein Instatic-Upgrade brechen kann. Beides mit einer sichtbaren Fehlermeldung absichern („Canvas-Anbindung nicht gefunden — Instatic-Version geändert?") statt still `null`.

---

## 4. Scroll-Authoring — die schwierige Frage

### Der eine Umbau, ohne den nichts geht

`GrafikLayer.tsx` liest heute selbst: `:89` `window.scrollY`, `:163`/`:240` `document.documentElement.scrollHeight`, `:238`, `:257`, `:122` `ro.observe(document.body)`. Der **Rechenkern ist dagegen schon sauber** — `zustandBei(g, scrollY)` (`grafik-types.ts:198`) und `scrubFortschritt(g, scrollY)` (`:143`) bekommen `scrollY` als Argument.

→ **`GrafikLayer` bekommt eine injizierte Fortschrittsquelle** `() => { y: number; docH: number; viewportH: number }`. Drei Implementierungen, ein Kern:

1. **`fensterQuelle`** — publizierte Seite + Live-Frame von innen. Exakt heutiges Verhalten.
2. **`frameQuelle(iframe)`** — Live-Frame, gelesen vom Admin-Fenster (same-origin bewiesen, Spike Z. 43).
3. **`virtuelleQuelle(playhead)`** — Design-Frame. `y` kommt vom Playhead, `docH` = gemessene Frame-Höhe, `viewportH` = **800** (`CANVAS_VIEWPORT_HEIGHT`).

Ohne das dritte Feld geht ein stiller Fehler an: `ANKER_MAX_ABSTAND_VH` (`GrafikEditor.tsx:201`) rechnet mit `window.innerHeight` (`:235`) — im Design-Frame ist `vh` aber auf 800 px gepinnt. Der Editor würde anders verankern als der Publisher.

### Der Authoring-Flow

**Der Design-Frame ist die Scroll-Achse, räumlich ausgerollt.** Dokument-y **ist** die scrollY-Achse. Daraus folgt eine Aufteilung, die aus Instatics Modell herausfällt statt aufgesetzt zu wirken:

**Design-Modus = setzen.**
- *Position* braucht **keinen** Scrubber: die Grafik im Frame an ihre Dokumentstelle ziehen — genau die heutige Geste, nur in Frame-Koordinaten.
- *Der zweite Freiheitsgrad* („bei welchem scrollY?") ist heute implizit das aktuelle `window.scrollY`. Im ausgerollten Frame gibt es das nicht → **Playhead**: eine horizontale Linie im Overlay über dem aktiven Frame, die den virtuellen Betrachter-Viewport markiert (800 px hoch, halbtransparent abgedunkelt darüber/darunter). Ziehen = scrubben; ein Klick auf die Zeitleiste im Panel springt hin.
- „◉ Hier locken (scrollY {n})" wird zu „◉ Keyframe bei {n}" — die Playhead-Zahl ersetzt die scrollY-Anzeige (`GrafikEditor.tsx:3030`).
- **Vorschau ist echt**, nicht simuliert: unsere Runtime läuft im Design-Frame (`runScripts`), getrieben von der virtuellen Quelle. Playhead ziehen = die Animation läuft im Frame ab, WYSIWYG, ohne dass irgendetwas scrollt.

**Mehrere Breakpoint-Frames.** Der Playhead ist **ein** Wert, normiert als Fortschritt (0..1 gegen `docH`), und wird in jedem Frame an dessen eigener `docH`-Position gezeichnet. Genau dafür existiert `hoehenFaktor`/`skaliereGrafikenFuerHoehe` bereits — die Höhen-Normalisierung bekommt hier erstmals ihren echten Anwendungsfall (jeder Breakpoint hat andere Dokumenthöhe). **Regel gegen Risiko 7 (Doppelskalierung): authoriert wird nur im aktiven Breakpoint** (`canvasSlice.activeBreakpointId`); die übrigen Frames zeigen nur mit, Overlay-Handles erscheinen dort nicht.

**Live-Modus = prüfen.** Echtes Scrollen, echte Trägheit, echte `vh`. Kein Authoring-Zwang — dort nur Playhead-Spiegel und Auswahl. Das entschärft Punkt (a) zusätzlich: die Live-Selektion ist Komfort, nicht Voraussetzung.

**Was ausdrücklich NICHT gebaut wird:** eine Zeit-Timeline im AE-Stil. Unsere Achse ist Scroll, nicht Zeit; eine zweite, konkurrierende Achse wäre genau die „Fremdkörper"-Falle.

---

## 5. Undo

**Beides — aber mit einer Richtung, nicht zwei Systemen.**

- Instatics History ist patch-basiert über Mutative, 50 tief, auf das `SiteDocument` gescopt (`docs/editor.md:328`). Alles, was **Node-Props** sind (Position, Grundbreite, Deckkraft, Drehung, Keyframes-Array), läuft über `api.editor.store.transaction` und ist damit **automatisch** im Host-Undo — inklusive der Host-Knöpfe im CanvasNotch und Cmd+Z. Das ist die „native" Antwort.
- Unser Undo-Bus (`components/undo/UndoBus.tsx:41-56`: `push/undo/redo/canUndo/canRedo/pushScope` + `BusAdapter`) hat aber drei Fähigkeiten, die der Host so nicht anbietet und die Leons Regel „jede Aktion ist rückgängig" tragen:
  1. **Coalescing** (`coalesce.ts`, Gruppen-Schlüssel wie `breite:${id}`, 600 ms) — ohne das erzeugt jeder Regler-Tick einen Undo-Schritt.
  2. **EIN Zug = EIN Schritt** über einen bei `pointerdown` gemerkten Vor-Zug-Stand (`GrafikEditor.tsx:1500-1503`, `1538-1541`).
  3. **Nicht-Store-Zustände**: Bibliothek/Pool (`poolMitUndo` :566), Presets inkl. IndexedDB-Persistenz (`presetsMitUndo` :583).

**Empfehlung:** Der Undo-Bus bleibt — aber als **Coalescer und Zug-Klammer VOR** dem Host, nicht als paralleler Stapel. Konkret: ein `BusAdapter`, dessen `undo`/`redo` in eine `store.transaction` münden; Punkte 1+2 entscheiden nur, **wann** eine Transaktion geschrieben wird. Für Punkt 3 (Pool/Presets, die nicht im Site-Document liegen) bleibt der eigene Stapel — mit der ehrlichen Konsequenz, dass zwei Undo-Historien nebeneinander existieren.

**UNGEPRÜFT (muss vor P2 verifiziert werden):** Ob `api.editor.store.transaction` genau einen Undo-Eintrag erzeugt, ob geschachtelte/schnell aufeinanderfolgende Transaktionen zusammengefasst werden, und ob eine Transaktion überhaupt in die Host-History geht (statt sie zu umgehen). Das habe ich nicht gelesen und rate es nicht. Prüfweg: eine Transaktion auslösen, Cmd+Z drücken, im Frame nachsehen — nutzersichtbar in 30 Sekunden.

---

## 6. Bau-Reihenfolge mit nutzersichtbaren Messlatten

Jede Messlatte ist etwas, das Leon im Browser **sieht** — kein Ersatz-Indikator, kein „Datei existiert".

| # | Phase | Nutzersichtbare Messlatte |
|---|---|---|
| **P0** | Fortschrittsquelle aus `GrafikLayer` herausziehen (noch ohne Instatic, im eigenen Repo) | Im heutigen Editor bewegen sich die Grafiken unverändert beim Scrollen **UND** eine Testseite fährt dieselbe Animation über einen Schieberegler: Regler ziehen = Grafiken wandern exakt wie beim Scrollen. Beides im selben Screenshot-Paar. |
| **P1** | Runtime als Instatic-Site-Script (`runInCanvas:true`), Keyframes von Hand als `data-`-Attribut. **Löst offene Punkte b + c.** | In Instatic: Live-Modus scrollen → das Bild bewegt sich. Danach publizieren, die veröffentlichte Seite im normalen Browser-Tab öffnen, scrollen → **dieselbe** Bewegung. Zwei Videos/Screenshot-Reihen. |
| **P2** | Modul `flowcode.grafik` + Panel-Skelett (leer, nur Rail-Eintrag + Kopf) | Im Modul-Inserter taucht „Grafik" auf; eingefügt erscheint sie im Layers-Baum mit Namen; das Properties-Panel zeigt Grundbreite/Deckkraft/Drehung; ein Regler-Zug ändert das Bild im Frame sichtbar; das Rail-Icon öffnet unser Panel. |
| **P3** | Playhead-Overlay + „Keyframe hier" + Keyframe-Liste | Playhead-Linie liegt im aktiven Frame, ist ziehbar, die Zahl im Panel läuft mit; „Keyframe hier" legt einen Eintrag in der Liste an; Playhead ziehen lässt die Grafik im Design-Frame wandern — **ohne dass etwas scrollt**. |
| **P4** | Direktmanipulation im Overlay: Zug, Einrasten, Objektmenü, Wheel-Skalierung | Grafik im Frame mit der Maus verschieben: Hilfslinien erscheinen, der Keyframe-Wert in der Liste ändert sich, **und der Canvas pannt dabei nicht mit** (Spike-Befund 6 im echten Werkzeug, nicht im Wegwerf-Spike). Cmd+Z macht den ganzen Zug in einem Schritt rückgängig. |
| **P5** | Animations-Panel vollständig: Easing-Kurve, Zeitleiste, KF-Duplizieren/Löschen, Bildtausch pro KF, Presets | Easing-Griffe ziehen ändert sichtbar den Verlauf beim Playhead-Scrubben; ein Preset auf eine zweite Grafik anwenden lässt diese dieselbe Bewegung machen. |
| **P6** | Live-Modus: eigene Auswahl (Panel-Liste + Klick), Mehrfachauswahl, Tastenkürzel mit Capture-Guards | Im Live-Modus: Grafik im Panel anklicken → Handles erscheinen am richtigen Ort; zwei Grafiken auswählen und gemeinsam verschieben; Entf löscht beide in **einem** Undo-Schritt; in einem Textfeld löscht Entf ein Zeichen statt der Grafik. |
| **P7** | Nichts-verlieren-Gate | Jede `- [ ]`-Zeile aus `feature-inventar.md` §1 im neuen Werkzeug abgehakt oder als bewusst gestrichen dokumentiert (mit Begründung), §2-Tastenkürzel entschieden, §5-Risiken 1/2/6/7/8/9 einzeln adressiert. |

**Reihenfolge-Begründung:** P0 und P1 stehen bewusst vorne, weil sie die zwei ungetesteten Annahmen (b und c) klären, **bevor** UI gebaut wird — scheitert P1, ist die ganze Plugin-Strategie tot und niemand hat 1200 Zeilen Panel-JSX umsonst geschrieben. P2 vor P3, weil ohne Node kein Ziel für den Playhead existiert. P4 nach P3, weil der Zug den Playhead braucht (welchen Keyframe bearbeitet er?).

---

## Was ich nicht belegen kann

- **Undo-Semantik von `api.editor.store.transaction`** (siehe §5) — nicht gelesen, nicht geraten.
- **Ob unsere `data-`-Attribute den Publisher überstehen** — `htmlAttributes` läuft durch ein Sicherheits-Gate (`src/core/htmlAttributes/attributes.ts:48-50`, „single security gate every custom-`htmlAttributes` emit path funnels through") plus DOMPurify. Ob `data-fc-*` dort durchkommt, habe ich nicht verifiziert. Der **sichere Weg umgeht das ganz**: unser Modul erzeugt sein Markup in der eigenen `render()`-Funktion, nicht über `htmlAttributes` — dann gibt es kein Gate zu passieren. Trotzdem in P1 zu prüfen.
- **Ob der Design-Frame unsere Runtime samt rAF-Schleife ohne Performance-Einbruch verträgt**, wenn 3-4 Breakpoint-Frames gleichzeitig gemountet sind (`docs/editor.md:398`: „Design mode mounts every breakpoint frame as soon as the page document is in the store"). Vier gleichzeitige rAF-Schleifen über je N Grafiken sind ein reales Risiko — messbar erst ab P3.