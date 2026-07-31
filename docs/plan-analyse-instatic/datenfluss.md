## Kurzfazit

Der Plugin-Weg trägt (Spike belegt), aber die **Tragfähigkeit ist ungleich verteilt**: unsere Datenverträge (freie Node-Props, `htmlAttributes`, Site-Script) sind belegt stabil, unsere **DOM-Marker und Geometrie-Hooks sind die Sollbruchstelle**. Der kritische Pfad läuft nicht über den Renderkern (der ist fertig und importfrei), sondern über **eine einzige Frage: kommt unsere Runtime auf die publizierte Seite und findet dort ihre Anker**. Die muss vor jedem Zeilen-Port beantwortet sein.

Alle Instatic-Pfade unten relativ zu `C:/Users/Lonsinator/Flowcode-Agentic-OS/user-projects/flowcode-website-builder/instatic/`.

---

## 1. Upgrade-Strategie (offener Punkt d)

### 1.1 Die Berührungspunkte, nach Fragilität sortiert

**Stufe 1 — DOM-Marker / interne Selektoren. Brechen STILL: kein Typfehler, kein Build-Fehler, nur ein Overlay, das nicht mehr da ist.**

| Marker | Beleg | Warum fragil |
|---|---|---|
| `[data-instatic-canvas-root]` | `src/admin/pages/site/canvas/CanvasRoot.tsx:431` | Unser Live-Portal hängt daran (`spike-plugin/editor/index.js:223`). **Kein Bestandteil der Plugin-SDK.** Intern nutzt ihn nur `src/admin/spotlight/shortcutDispatch.ts:5` — und zwar als `[data-instatic-canvas-root="true"]`, also mit Wert. Wer den Wert ändert, bricht uns, nicht sich. |
| `[data-canvas-view="live"]` | `CanvasRoot.tsx:433` (`data-canvas-view={canvasView}`), Werte aus `store/slices/canvasSlice.ts:62,131` | Reines Anzeige-Attribut, nichts gated darauf. Ein Rename kostet Instatic nichts. |
| `!isLive && editable && <PluginCanvasOverlayLayer />` | `CanvasRoot.tsx:535` | **Ein Boolean entscheidet, ob unser Werkzeug existiert.** Reine Host-Willkür. |
| `[data-canvas-overlay-layer]` | `src/admin/plugin-host-hooks/index.ts:34,158-161` | Unsere **gesamte Koordinaten-Mathematik** ist relativ zu diesem Element. Es ist exakt das Element, das im Live-Modus fehlt. |
| `[data-node-id]` im Canvas-Frame | `src/modules/base/body/BodyEditor.tsx:65-73` u.a. | Im Editor da, **im publizierten Output NICHT** — `annotateNodeIds` ist nur an zwei Stellen `true`: `src/admin/pages/site/agent/executor.ts:317` und `src/core/ai/readSurface.ts:94`. Bestätigt die Kartierung. |

**Stufe 2 — SDK-Oberfläche. Typisiert, aber ohne Kompat-Zusage.**

- `useCanvasNodeRect` / `useEditorStore` / `useCanvasViewport` — `src/admin/plugin-host-hooks/index.ts:188 / 69 / 264`. `useCanvasNodeRect` ruft intern `findRenderedCanvasNodes` + `measureCanvasElementRect` aus `@site/canvas/*` (index.ts:27-28), also **tief in Host-Interna**. Die Kartierung nennt eine kürzliche Reparatur dieses Hooks — die Instabilität ist also nicht theoretisch.
- **Store-Form:** `selectedNodeIds: string[]` ist die Wahrheit, `selectedNodeId` ist abgeleitet — `store/slices/selectionSlice.ts:28-36` sagt wörtlich, die meisten Call-Sites sollten `selectedNodeIds` benutzen. **Konsequenz: unser Adapter liest `selectedNodeIds` und leitet ab, nie `selectedNodeId`.** Der Spike las noch `selectedNodeId` (`spike-plugin/editor/index.js:170`) — das ist die abgekündigte Form.
- `api.editor.store.transaction(mutate: (store: EditorStore) => void)` — `src/core/plugin-sdk/types/editorApi.ts:59`. Mutierbarer Draft des **gesamten** Stores: maximale Sprengweite bei minimalem Vertrag. Wir dürfen darin genau eine Sache tun (Node-Props schreiben), nie mehr.
- Import-Map-Runtime (`react`, `@instatic/host-hooks`) über `globalThis.__instatic` — `plugin-host-hooks/index.ts:13-15`. Der Paritäts-Gate-Test `src/__tests__/architecture/plugin-host-ui-runtime-parity.test.ts:1-22` deckt **nur `host-ui` ab, nicht `host-hooks`** — für unsere Hooks gibt es also keinen Instatic-eigenen Drift-Schutz.

**Stufe 3 — Datenverträge. Belegt stabil, halten am ehesten.**

- Freie Node-Props überleben: `src/core/module-engine/validateNodeProps.ts:203` `return { ...rawProps, ...cleaned }` — und selbst im Fehlerfall Zeile 207 `return { ...rawProps, ...def.defaults }`. Unsere Keyframes am Node sind sicher.
- `htmlAttributes` erreichen den publizierten Output: `src/modules/base/container/index.ts:54` `const attrs = htmlAttributesAttr(props.htmlAttributes)` innerhalb von `render()`. **Aber zwei harte Einschränkungen, die die Kartierung nicht hatte:**
  1. **Nur 5 Module haben den Control** (`grep -l htmlAttributesControl src/modules/`): `button`, `container`, `image`, `link`, `text` (+ `body` via `src/core/publisher/render.ts:277`). **Nicht** `svg`, `video`, `list`, `loop`, `forms`, `visualComponentRef`. Wer eine SVG- oder Video-Ebene ankern will, hat kein UI dafür.
  2. **Namensfilter:** `src/core/htmlAttributes/attributes.ts:4-10` verbietet `data-instatic-*`, `data-canvas-*`, `data-node-id`, `data-module-id`, `data-hovered`, `class`, `style`, `on*`. **Unser `data-og-id` fällt nicht darunter — der Anker-Vertrag ist namentlich zulässig.**
- Site-Script-Defaults: `src/core/site-runtime/runtimeConfig.ts:45-52` — `enabled:true, runInCanvas:true, format:'module', placement:'body-end', timing:'dom-ready', scope:all-pages`. Canvas-Filter: Zeile 235. UI existiert: `src/admin/pages/site/code-editor/ScriptSettingsPane.tsx:67-71`.

### 1.2 Wie schnell bewegt sich das? (harte Zahl statt Bauchgefühl)

`CHANGELOG.md`: 0.0.11 (2026-07-11) → 0.0.12 (07-24) → 0.0.13 (07-24) → 0.0.14 (07-25). **Vier Releases in 14 Tagen.** HEAD des Klons: `d1f0942`, 2026-07-29 01:08 — also schon wieder Commits nach 0.0.14. Dazu `instatic/CLAUDE.md`: „Do not preserve old function signatures", „Do not add deprecation shims", „The plugin SDK … carries no backward-compatibility guarantee yet."

**Ehrliche Lücke:** Ich kann die Änderungsrate *unserer konkreten Dateien* nicht messen — der Klon ist depth-1 (`git rev-list --count HEAD` = 1). Jede Aussage über Churn von `CanvasRoot.tsx` oder `plugin-host-hooks/index.ts` wäre geraten. Ein `git fetch --unshallow` würde das billig beantworten und sollte vor der Entscheidung laufen.

### 1.3 Die Strategie — drei Teile, alle drei nötig

**(a) Harter Version-Pin, Upgrade als bewusster Akt.**
Upstream ist echt (`https://github.com/CoreBunch/Instatic.git`). Der Klon ist im Builder-Repo gitignoriert (`.gitignore:62 /instatic/`) — d.h. **wir haben aktuell keinen reproduzierbaren Stand.** Erste Maßnahme: Commit-SHA + Version in einer versionierten Datei festschreiben (`instatic-pin.json`: `{ version, commit, bunRange }`). Bun ist schon gepinnt (`instatic/package.json` `engines.bun: ">=1.3.0 <1.4.0"`). Nie `git pull` beiläufig — Upgrade ist ein eigenes Häppchen mit eigener Abnahme.

**(b) Adapter-Schicht mit GENAU EINEM Berührungspunkt je Host-API. Nicht verhandelbar.**
Eine Datei, z.B. `plugin/src/wirt.ts`, exportiert etwa acht Funktionen. **Kein anderer Teil unseres Codes darf `@instatic/host-hooks` importieren oder einen `data-*`-Selektor enthalten.**

| Adapter-Funktion | kapselt |
|---|---|
| `leseAuswahl()` | `useEditorStore(s => s.selectedNodeIds)` → `string[]` |
| `leseModus()` | `useEditorStore(s => s.canvasView)` → `'design' \| 'live'` |
| `messeNode(id)` | `useCanvasNodeRect` |
| `messeViewport()` | `useCanvasViewport` |
| `findeCanvasWurzel()` | `[data-instatic-canvas-root]` (Live-Portal) |
| `findeOverlaySchicht()` | `[data-canvas-overlay-layer]` |
| `schreibeNodeProps(id, patch)` | ~~`api.editor.store.transaction`~~ → **KORRIGIERT nach H1-Messung: `store.read().updateNodeProps(id, patch)`**. `transaction` ist ein rohes `setState`, macht die Seite nie dirty, landet nie im Save-PUT und haengt nicht im Undo — in H1 dreifach unabhaengig gemessen (leerer `changedPages`-Array im mitgeschnittenen PUT-Body, Wert nach Reload weg, kein History-Eintrag). Fuer Node-Props/Tree ist `transaction` **verboten**, nicht nur „nicht empfohlen". |
| `registriereFlaechen(api)` | `registerOverlay` + `panels.register` |

Der Wert: bei einem Instatic-Upgrade ist die Reparaturfläche **eine Datei**, nicht 4000 Zeilen. Absichern in *unserem* Repo mit einem Grep-Test: „außer `wirt.ts` importiert nichts `@instatic/`, außer `wirt.ts` steht nirgends `data-instatic`/`data-canvas`/`data-node-id`". Das ist derselbe Mechanismus, den Instatic selbst für seine Architektur-Regeln nutzt (`src/__tests__/architecture/`) — 97 solcher Gates existieren dort, das Muster passt.

**(c) Smoke-Suite gegen die Host-Verträge, läuft bei JEDEM Instatic-Update.**
Sie prüft nicht unsere Features, sondern **nur die Annahmen über den Wirt**. Läuft headless (Playwright ist im Builder schon da: `package.json` devDeps `playwright-core`). Was genau:

*Statisch (Sekunden, ohne Browser — gegen den Instatic-Quellbaum):*
1. `plugin-host-hooks/index.ts` exportiert `useEditorStore`, `useCanvasNodeRect`, `useCanvasViewport`, `usePluginContext` — Namen unverändert.
2. `CANVAS_OVERLAY_LAYER_ATTRIBUTE` ist noch `'data-canvas-overlay-layer'` (`index.ts:34`).
3. `CanvasRoot.tsx` enthält noch `data-instatic-canvas-root` und `data-canvas-view={canvasView}`.
4. `selectionSlice.ts` hat noch `selectedNodeIds: string[]`; `canvasSlice.ts` hat noch `canvasView` mit Wert `'design'`.
5. `editorApi.ts` hat noch `canvas.registerOverlay`, `panels.register`, `store.transaction`.
6. `validateNodeProps.ts` gibt unbekannte Keys weiter (Regex auf `...rawProps`) — sonst sterben unsere Keyframes.
7. `htmlAttributes/attributes.ts`: `data-og-` ist **nicht** in `RESERVED_DATA_PREFIX_RE`/`RESERVED_DATA_NAMES`.
8. Modul-Liste mit `htmlAttributesControl` ist noch ⊇ {container, image, text, link, button}.
9. `runtimeConfig.ts`: `DEFAULT_SCRIPT_RUNTIME_CONFIG` hat noch `runInCanvas`, `format`, `placement`, `timing`.
10. `annotateNodeIds` ist weiterhin NICHT im Publish-Pfad gesetzt (sonst ändert sich unsere Targeting-Strategie — dann sogar zum Guten).

*Dynamisch (Minuten, im laufenden Instatic, gegen eine feste Fixture-Seite):*
11. Plugin installiert sich, Status `active`.
12. Overlay mountet im Design-Modus (DOM-Sonde), Panel erscheint in der Rail.
13. `messeNode(id)` liefert ein Rechteck ≠ null und ändert sich beim Canvas-Pan (der Spike-Beweis, automatisiert).
14. Ein `pointerdown` auf unserem Handle verschiebt das Handle und **nicht** den Canvas (Gesten-Konflikt-Regressionstest).
15. **Publish-Kette:** Fixture publizieren, HTML abrufen, prüfen: `data-og-id` im Markup vorhanden UND unser Script-Tag eingespleißt.
16. Live-Modus: `[data-instatic-canvas-root]` existiert, `contentDocument` same-origin lesbar, `scrollHeight > 0`.

Prüfungen 15 und 16 sind die einzigen, die nutzersichtbaren Verlust anzeigen — die anderen sind Frühwarnung. Nach dem Verifikations-Protokoll (§1.2/1.3) läuft die Suite dreiwertig und ist nur grün, wenn alle 16 OK sind.

---

## 2. Reihenfolge mit frühem Nutzen

**Kleinste Ausbaustufe mit echtem Nutzen für Leon:**
> Leon baut in Instatic eine Seite, hängt EINE Grafik daran, zieht im Editor zwei Keyframes, publiziert — und auf der publizierten Seite bewegt sich die Grafik beim Scrollen genau so wie in der Editor-Vorschau.

Das ist der Punkt, ab dem Instatic + unser Plugin zusammen mehr können als Instatic allein. Alles davor ist Infrastruktur.

**Die Häppchen. Messlatte jeweils als Nutzer-Erlebnis, nicht als Technik-Check** (Lehre aus dem „Texte vorhanden statt Layout deckungsgleich"-Fehlschlag):

| # | Inhalt | Nutzersichtbare Messlatte |
|---|---|---|
| **H1** | Drei Annahmen validieren (siehe §4). Kein Produktionscode. | Leon sieht drei Screenshots: (a) publizierte Seite mit `data-og-id` im Quelltext, (b) publizierte Seite, auf der ein Testskript sichtbar etwas bewegt, (c) Live-Modus mit eigener Klick-Auswahl — oder die ehrliche Feststellung, dass (c) nicht geht. |
| **H2** | Plugin-Gerüst + Adapter `wirt.ts` + Smoke-Suite (16 Prüfungen). Renderkern **unverändert** einkopiert (`grafik-types.ts`, `easing.ts`, `GrafikLayer/-Medium/-Context` — 0 Next-/0 Puck-Imports laut Kartierung). | Panel „Animation" erscheint in Instatic; Smoke-Suite läuft grün und meldet 16/16. Noch keine Animation. |
| **H3** | **Erste echte Animation.** Ein Node auswählen → Grafik zuweisen → 2 Keyframes → Vorschau im Design-Canvas. Keyframes als freie Node-Props. | **Leon sieht die Grafik im Editor beim Scrollen wandern.** Screenshot-Paar Anfang/Ende. |
| **H4** | **Publish-Schluss.** Runtime als Site-Script, Anker via `htmlAttributes`, Config aus den Node-Props. | **Die kleinste Ausbaustufe ist erreicht:** publizierte Seite scrollt identisch zum Editor. Screenshot-Paar Editor vs. publiziert bei 3 Scroll-Positionen, deckungsgleich. |
| **H5** | Bedienung, die aus dem Inventar fehlt: Ziehen mit Einrasten (`grafik-snapping.ts`), Mehrfachauswahl (`grafik-mehrfachauswahl.ts`), Undo (499 Z. portabler Kern), Objektmenü, Zeitleiste. | Leon baut eine Sektion in Instatic **ohne Rückgriff auf den alten Editor**. |
| **H6** | Bibliothek: Datei-/Ordner-Anbindung gegen Instatics Media-API statt gegen `/api/assets`. | Leon zieht ein Bild aus der Instatic-Mediathek in eine Ebene. |
| **H7** | Vektorisierer als Plugin-Server-Route oder eigenes Paket (1330 Z., NULL externe Imports). | „In SVG umwandeln" funktioniert wieder — inkl. der beiden **Hover-Only**-Knöpfe (Risiko #1 im Inventar: `grafik-editor.css:456` / `:239`). |
| **H8** | Fluss-Engine (5570 Z., nur `motion/react`). | Der Fluss läuft auf einer Instatic-Seite. |

**Dauerhaft entfallen (von Instatic ersetzt, ~15.000 Z. laut Kartierung):** `lib/import/*` + Import-Skripte, `app/editor/*` (Vier-Stationen-Shell), Ordner-Export, die komplette Puck-Schicht inkl. `lib/puck-registry.ts`-Synchronpflicht, der Seiten-Speicher (`app/api/puck-seite/*`), Backdrop-System (Instatics Canvas IST der Hintergrund), `app/api/abbild` „Als Standard setzen" (Instatic publiziert). **Das ist der eigentliche Gewinn der Portierung** — nicht neue Features, sondern 15.000 Zeilen, die wir nicht mehr pflegen.

**Nicht entfallen, aber verschoben:** Export-Reiter (JSON/HTML-Overlay/Runtime-Download) — solange die Embed-Kette der Fallback-Plan ist, muss sie erhalten bleiben.

---

## 3. Migration / Koexistenz — konkrete Empfehlung

**Belegter Befund, der die Frage entschärft: die LIVE-WEE-Website hängt NICHT am Builder.**
`user-projects/wee-website-refactoring/site-versions/wee-website-leon-refactor/wee-website/package.json` — Dependencies sind **nur** `motion`, `next 16.2.10`, `react 19.2.4`, `react-dom`. Kein Puck, kein sharp, kein imgly. Ihre Komponenten (`src/components/`: footer, hero, mission, nav, oasis, projects, stats, subpage, system, veil) enthalten **kein** `river/`, `grafik/`, `curtain/`. Der Vercel-Root ist selbsttragend.

Der Fluss existiert zweimal und ist **auseinandergelaufen**: Builder `components/river/` = 4702 Zeilen, WEE-Ben-Variante (`site-versions/wee-website-ben-refactor/v3/components/river/`) = 3530 Zeilen. Zwei Stände, kein gemeinsamer Vertrag.

**Empfehlung:**

1. **WEE-Arbeit: gar nicht anfassen.** Eigenes Repo, eigener Stack, kein Builder-Import. Portierung und WEE-Website laufen risikofrei parallel. Das ist kein Kompromiss, das ist der belegte Ist-Zustand.
2. **Builder einfrieren, nicht abschalten.** Ab H2 keine neuen Features mehr im Builder — er wird **Referenz-Quelle und Fallback**. `npm run dev -p 3113` bleibt lauffähig, damit Leon jederzeit gegen das Original vergleichen kann (das braucht die Abnahme in H3–H5: „so sah es im alten Editor aus"). Einen Einfrier-Tag setzen, damit der Vergleichsstand identifizierbar ist.
3. **Vektorisierer sofort herauslösen** (H7 oder früher, ist unabhängig): `components/vektor/` = 1330 Z., NULL externe Imports, öffentlicher Vertrag in `typen.ts`. Eigenes Paket, von Builder UND Plugin konsumiert. Das verhindert die dritte divergierende Kopie.
4. **Instatic-Klon in Ordnung bringen.** Aktuell gitignoriert (`.gitignore:62`) und depth-1 → **kein reproduzierbarer Stand**. Entweder Submodul mit festem SHA oder Pin-Datei + `fetch --unshallow`. Vor H1 erledigen, kostet Minuten.
5. **Was NICHT tun:** den Builder als Monorepo-Paket in Instatic hängen. Instatic ist Bun/CSS-Modules/TypeBox, der Builder ist Next/Puck/Zod-frei-aber-anders. Der Klebstoff wäre teurer als die Kopie.

---

## 4. Die drei ungetesteten Annahmen — Reihenfolge und Minimal-Tests

**Reihenfolgeprinzip: aufsteigende Kosten × absteigende Tötungskraft.** A1 und A2 können das Vorhaben killen und kosten fast nichts; A3 kostet am meisten und killt nichts (es gibt einen Ausweg).

### A1 — Anker-Attribute im publizierten Output. **ZUERST. Kein Code.**
- **Bauen:** nichts. In Instatic eine Seite mit einem `base.container` anlegen, im Eigenschaften-Panel `htmlAttributes` setzen: `data-og-id="probe-1"`. Publizieren.
- **Messen:** publiziertes HTML abrufen, `data-og-id="probe-1"` muss wörtlich drinstehen. **Zusätzlich negativ prüfen:** `data-instatic-probe="x"` muss verschwinden (belegt, dass der Filter aus `attributes.ts:4-10` greift und wir seine Grenzen kennen).
- **Zweiter Teil, gleiche Sitzung:** dasselbe an einem `base.svg`- und einem `base.video`-Node versuchen. **Erwartung: dort gibt es gar kein Feld** (kein `htmlAttributesControl`). Wenn ja → wir brauchen ein eigenes Modul (`entrypoints.modules`) für Medien-Ebenen. Das ist eine Architektur-Weiche, keine Kleinigkeit.
- **Kosten:** ~30 min, reine Klickarbeit. **Wenn es scheitert:** Element-Targeting muss über generierte CSS-Klassen laufen — Umbau der Anker-Mechanik, aber nicht tödlich.

### A2 — Unsere Runtime als Site-Level-Script. **ZWEITER.**
- **Bauen:** ein 20-Zeilen-Wegwerf-Script, kein `wee-embed.js`. Inhalt: sucht `[data-og-id="probe-1"]`, hängt einen `scroll`-Listener an, schreibt `transform: translateY()` — sichtbare Bewegung, mehr nicht. Als Site-File `type: 'script'` anlegen (UI: `ScriptSettingsPane.tsx`).
- **Messen, vier Dinge, alle nötig:**
  1. **Publizierte Seite scrollen → Element bewegt sich.** (Nutzersichtbar, das ist die Messlatte.)
  2. `runInCanvas: true` → dieselbe Bewegung im Editor-Canvas (`runtimeConfig.ts:235`). Wenn das geht, ist unsere Editor-Vorschau geschenkt.
  3. **`format: 'module'` ist Default** (`runtimeConfig.ts:47`) — unser echtes `wee-embed.js` ist ein esbuild-IIFE (172 KB gzip). Deshalb im selben Test einmal auf `format: 'classic'` umschalten und prüfen, dass beides lädt. Wenn nur `classic` geht, muss der esbuild-Aufruf in `scripts/build-embed.mjs` das wissen.
  4. **Größe:** ein 172-KB-Script mit `placement: 'body-end'`, `timing: 'dom-ready'` — publizierte Seite laden und prüfen, dass Instatics „clean HTML, zero JS"-Versprechen nicht sichtbar leidet (kein Layout-Sprung).
- **Kosten:** ~2 h. **Wenn es scheitert:** Ausweichweg ist `frontend.assets[]` im Manifest (`plugin-system.md:601-619`, Permission `frontend.assets`) — deklarativ, vom Plugin ausgeliefert, CSP wird abgeleitet. Der Fallschirm ist also da; deshalb ist A2 nicht wirklich tödlich, nur teuer wenn falsch angenommen.

### A3 — Node-Selektion im Live-Modus. **ZULETZT, und ggf. gar nicht.**
- **Bauen:** die Spike-Live-Sonde (`spike-plugin/editor/index.js:214-255`) um einen Klick-Handler erweitern: Klick im Live-`contentDocument` → nächster `[data-node-id]`-Vorfahr → eigener Auswahl-State (nicht `selectedNodeId`, den setzt der Host im Live-Modus nicht). Rahmen zeichnen.
- **Messen:** Leon klickt im Live-Modus auf ein Element, ein Rahmen erscheint darum, und beim Scrollen des Live-Frames **bleibt der Rahmen am Element kleben** (das ist der eigentliche Beweis — der Spike hat nur die Messbarkeit gezeigt, nicht das Mitlaufen beim Scrollen).
- **Kosten:** ~1 Tag (Koordinaten-Umrechnung Frame→Editor ohne den Overlay-Layer, den es dort nicht gibt — `useCanvasNodeRect` misst relativ zu `[data-canvas-overlay-layer]`, `plugin-host-hooks/index.ts:199-206`, und der fehlt im Live-Modus).
- **Wenn es scheitert:** **kein Drama.** Ausweg 1: im Design-Modus authoren, Live nur zur Kontrolle (Spike-Befund §„Folgerung"). Ausweg 2: der Ein-Zeichen-Fork in `CanvasRoot.tsx:535`. Deshalb **darf A3 die Entscheidung nicht blockieren** — es entscheidet über Komfort, nicht über Machbarkeit.

---

## 5. Abbruch-Kriterien — harte Signale

**Sofortiger Abbruch (Plan B), wenn eines davon eintritt:**

1. **A1 scheitert doppelt:** `htmlAttributes` erreichen den Output nicht UND es gibt keinen stabilen Klassen-/Selektor-Ersatz. Dann kann unsere Runtime auf der publizierten Seite nichts finden — der Kern der Sache ist tot. *(Messbar: publiziertes HTML enthält weder `data-og-*` noch eine stabile pro-Node-Klasse.)*
2. **A2 scheitert doppelt:** weder Site-Script noch `frontend.assets[]` bringen unser JS auf die Seite. Gleiche Konsequenz.
3. **Der Renderkern verträgt sich nicht mit React 19 + React Compiler.** `GrafikLayer.tsx` schreibt in einer rAF-Schleife direkt ins DOM. Instatics Compiler ist global aktiv (`instatic/CLAUDE.md`, „React Compiler and memoization"). *(Messbar: die Editor-Vorschau in H3 ruckelt sichtbar oder springt zurück — nicht „Konsolen-Warnung", sondern Leon sieht es.)*
4. **Keyframe-Daten sprengen den Node.** Wenn eine Seite mit ~20 animierten Ebenen den Instatic-Editor spürbar verlangsamt oder eine Größengrenze reißt. *(Messbar: Speichern/Publizieren dauert sichtbar länger, oder ein Fehler-Toast.)* → dann müssen Keyframes in eine Plugin-Collection (`cms.storage`) statt an den Node.

**Verzögerter Abbruch (nach 2 aufeinanderfolgenden Runden):**

5. **Zwei Instatic-Upgrades in Folge brechen die Smoke-Suite an Stufe-1-Markern** und die Reparatur kostet jeweils >½ Tag. Das ist die Zahl, die „pre-1.0 ist gefährlich" von Bauchgefühl in eine Messung verwandelt. Die Suite liefert diese Zahl von H2 an automatisch.
6. **Die Adapter-Schicht wächst über ~10 Berührungspunkte.** Jeder neue Punkt ist eine neue Bruchstelle. Wenn wir bei H5 bei 20 sind, ist das Plugin-Modell für unseren Anspruch zu eng.

**Kein Abbruchgrund** (explizit, damit niemand vorschnell aufgibt): A3 scheitert; einzelne Instatic-Module haben kein `htmlAttributes`-Feld; Instatic hat keine Animation (das ist der Grund, warum wir kommen).

**Plan B, gestuft:**
- **B1 — Chirurgischer Fork.** Nur `CanvasRoot.tsx:535` (`!isLive` entfernen) + ggf. `annotateNodeIds` im Publish-Pfad. Zwei Zeilen, als Patch-Datei geführt, bei jedem Upgrade neu angewendet. Das ist die *erste* Antwort auf Szenario 1/2, nicht der Rückzug.
- **B2 — Hybrid.** Instatic für Struktur/Inhalt/Publish; unsere Animations-Ebene als eigenständiges Overlay-Artefakt (`wee-embed.js` + `wee-anim.json`), das Leon manuell auf die publizierte Seite legt — genau die Export-Kette, die **heute schon fertig ist** (`components/embed/`, `scripts/build-embed.mjs`). Kein Editor-Komfort, aber Nutzen ab Tag 1. **Deshalb: die Export-Kette in H1–H8 niemals löschen.**
- **B3 — Beim eigenen Builder bleiben.** Nur bei Szenario 3 (Renderkern inkompatibel) sinnvoll, denn dann hilft auch der Fork nicht. Kostet uns die 15.000 Zeilen, die wir loswerden wollten.

---

## 6. Aufwand je Häppchen + kritischer Pfad

| # | Aufwand | Begründung |
|---|---|---|
| H1 (3 Annahmen) | **S** | A1 reine Klickarbeit, A2 20-Zeilen-Script, A3 ein Tag. Kein Produktionscode, nichts zu pflegen. |
| H2 (Gerüst + Adapter + Suite) | **M** | Adapter ist klein; die 16-Prüfungen-Suite ist der Aufwand. Renderkern wird **kopiert, nicht geschrieben** (0 Next-/0 Puck-Imports = per Konstruktion portabel). |
| H3 (erste Animation) | **M** | Keyframe-Schema, Panel-UI für 2 Keyframes, Overlay-Handle (Spike hat den schwersten Teil — Gesten-Konflikt — schon geklärt). |
| H4 (Publish-Schluss) | **M** | Config-Serialisierung Node-Props → Runtime-Config; `baueEmbedConfig` existiert (`components/embed/embed-export.ts`), muss auf die neue Quelle umgehängt werden. |
| H5 (volle Bedienung) | **L** | **Der Brocken.** ~1200 Z. Panel-JSX ab `GrafikEditor.tsx:2967` + 1917 Z. CSS müssen auf Instatics CSS-Modules/Design-Tokens/`src/ui/`-Primitives umgestellt werden (`instatic/CLAUDE.md`: keine Tailwind-Utilities, keine Hex-Werte, `Button`-Primitive per Gate-Test erzwungen). Dazu die 11 hartkodierten `fetch("/api/…")`. **Hier lauern die Verlust-Risiken #1 (Hover-Only-Knöpfe), #8 (Mausrad/Entf) und #9 (Capture-Guards) aus dem Inventar.** |
| H6 (Bibliothek) | **M** | Neue Anbindung an Instatics Media-API; File System Access API + IndexedDB-Handles entfallen ersatzlos. |
| H7 (Vektorisierer) | **S–M** | Bibliothek ist DOM-frei und importfrei. Nur die Transportschicht ist neu (Plugin-Server-Route in QuickJS — `sharp` ist dort **nicht** verfügbar, das ist die einzige echte Frage). |
| H8 (Fluss) | **L** | 5570 Zeilen, `motion/react` als externe Abhängigkeit im unsandboxed Editor-Kontext (geht, weil `editor.code` unsandboxed ist), plus SVG-Geometrie im Canvas-iframe. |

**Kritischer Pfad: H1(A1) → H1(A2) → H2 → H3 → H4.**
Alles davor ist Voraussetzung, alles danach (H5–H8) ist parallelisierbar und additiv. Der Pfad ist **nicht** durch Umfang bestimmt (H5 ist der größte Brocken, steht aber nicht drauf), sondern durch **Widerlegbarkeit**: A1 und A2 sind die einzigen Stellen, an denen ein Nein das Vorhaben umbringt, und beide sind billig zu prüfen. Wer H2 vor H1 beginnt, riskiert, ein Plugin-Gerüst für eine Publish-Kette zu bauen, die nicht existiert.

**Zwei Sofortmaßnahmen vor H1** (Minuten, aber sonst hängen alle Aussagen in der Luft): Instatic-Klon `fetch --unshallow` + SHA-Pin versionieren.

---

## Was ich NICHT belegen kann

- **Änderungsrate unserer konkreten Berührungspunkte.** Depth-1-Klon (`git rev-list --count HEAD` = 1). Die Release-Kadenz (4× in 14 Tagen, `CHANGELOG.md`) ist ein Proxy, kein Beweis für Instabilität *genau dieser Dateien*.
- **Ob `sharp` im Plugin-Server-Sandbox verfügbar ist** — die Doku verbietet `node:*` und `bun:*` (`plugin-system.md:323-333`), sagt aber nichts über native Bild-Bibliotheken. Für H7 muss das geprüft werden.
- **Ob der React Compiler mit unserem rAF-DOM-Schreiber verträglich ist.** Nur Leseeindruck der Regeln, nicht ausgeführt.
- **Größenverhalten der Keyframe-Props.** `validateNodeProps.ts:203` beweist, dass unbekannte Keys überleben — nicht, dass 50 Keyframes × 20 Ebenen performant sind.
- **Optik jeder Art.** Trifft nur Leon.