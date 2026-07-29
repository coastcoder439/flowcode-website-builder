## Perspektive Datenfluss & Persistenz — Befund

### 0. Drei Befunde, die den Plan vorne verändern (neu gegenüber Spike/Kartierung)

| # | Befund | Beleg |
|---|---|---|
| **A** | **`api.editor.store.transaction` schreibt NICHT persistenzsicher.** Es ist ein rohes `setState((state)=>mutate(state))` — es umgeht `runHistoricMutation`, die **einzige** Stelle, die `hasUnsavedChanges = true`, Undo-History und die Save-Dirty-Marks setzt. Autosave hängt ausschliesslich an diesem Flag. Keyframes, die so geschrieben werden, sind nach einem Reload **weg**. | `src/core/plugins/runtime.ts:515`; `.../store/slices/site/helpers.ts:238-304`, insb. `:301`; `.../hooks/usePersistence.ts:356-381`. Gegenprobe: `grep "hasUnsavedChanges = true"` findet genau 3 Treffer (helpers.ts:301, undoRedoActions.ts:45/74). |
| **B** | **`data-og-id` überlebt nur auf 5 Modulen.** Das HTML-Attribute-Panel ist universell und speichert an *jedem* Node, aber nur `container/text/image/button/link` (+ `<body>`) emittieren es beim Publish. Auf `base.video`, `base.list`, `base.svg`, `base.loop`, `base.slot*`, `base.visualComponentRef` wird das Attribut gespeichert und **still verworfen**. | Emitter: `src/modules/base/{container:54,text:81,image:178,button:58,link:55}/index.ts`; Body: `src/core/publisher/render.ts:277`; Panel ohne Modulprüfung: `.../PropertiesPanel/PropertiesPanelBody.tsx:197-201` |
| **C** | **Site-Level-Scripts werden PRO SEITE gebündelt**, mit einer versions-eigenen URL. Unsere 172-KB-Runtime landet N-mal auf Platte (N = Seitenzahl), N esbuild-Läufe je Publish, und der Browser-Cache greift **nicht** seitenübergreifend. | `server/publish/publishSite.ts:137-169`, insb. `:143` `assetBasePath: /_instatic/assets/${versionId}/`; `server/publish/runtime/bundleScripts.ts:236-263` (`bundle:true`, 30 s Timeout `:49-51`) |

Gute Nachricht dazu: **`api.editor.store.read()` liefert `getState()` — inkl. aller Host-Aktionen.** `read().updateNodeProps(nodeId, patch)` läuft durch `mutateActiveTree → runHistoricMutation` und ist damit undo-fähig, dirty-markierend und autosave-fähig. Das ist der Schreibpfad, nicht `transaction`. (`.../store/slices/site/nodeActions.ts:315-322`, Typ `.../site/types.ts:220`) — beide Permissions (`editor.store.read` **und** `editor.store.write`) trotzdem deklarieren, weil der Grant-Zuschnitt pre-1.0 jederzeit nachgezogen werden kann.

---

### 1. Datenmodell — wo sollen Grafiken/Keyframes/Anker liegen

**Harte Randbedingungen zuerst:**

- `props` ist `Record<string, unknown>` (`src/core/page-tree/baseNode.ts:55`), und unbekannte Keys **überleben** die Validierung: `validateNodeProps` gibt `{ ...rawProps, ...cleaned }` zurück (`src/core/module-engine/validateNodeProps.ts:204`). Freie Props sind also technisch tragfähig — aber **ungeprüft**: der Host validiert unser Feld nie. Wir brauchen eigene TypeBox-Validierung beim Lesen + ein `schemaVersion`-Feld.
- **Schreib-Amplifikation:** Pages liegen je in einer eigenen `data_rows.cells_json`-Zeile, der Shell (`site.files`, `site.runtime`, `styleRules`, `explorer`) liegt in **einer** Zeile `site.settings_json` — und der Shell wird bei **jedem** Save mitgeschrieben. (`server/repositories/site.ts:10-12, 33-68`; `server/db/migrations-sqlite.ts:107,275`; `docs/features/site-shell.md:378-408`) → Alles Grosse gehört in die **Page-Row**, nichts Grosses in den Shell.
- **Properties-Panel ist für uns zu:** Plugin-Module dürfen nur 8 JSON-Control-Typen deklarieren (text/textarea/number/color/select/toggle/image/url) — kein eigenes React-Control (`src/core/plugin-sdk/modules.ts:23-39`). Eine Keyframe-Zeitleiste ist dort **nicht** darstellbar. Unsere UI muss Panel (`editor.panels`) + Canvas-Overlay (`editor.canvas`) sein.
- **Kein Rohbyte-Weg durch die Sandbox:** die Modul-`render()` läuft in QuickJS mit 2 s Deadline / 64 MB Heap (`server/plugins/quickjs/limits.ts:23,34`). Data-URLs im Config-JSON sind hier ein echtes Risiko.

**Optionsvergleich**

| Option | Für | Gegen |
|---|---|---|
| **A — freie Props am jeweiligen Node** | Reisen mit jedem Pfad mit, der Nodes serialisiert (Save, Version, Publish-Snapshot); page-scoped, also nur die geänderte Seite wird geschrieben; **upgrade-robustester Ort überhaupt**, weil kein Host-Code sie kennt (einziger Berührungspunkt: validateNodeProps.ts:204); der bestehende Agenten-/MCP-Tool `site_update_node_props` bedient sie **gratis** | Szene ist keine Node-Eigenschaft, sondern eine Overlay-Ebene über mehreren Nodes → Verteilung über N Nodes = Konsistenzproblem; im Properties-Panel unsichtbar |
| **B — eigener Modul-Typ (`entrypoints.modules`)** | Ein einziger Stage-Node trägt die ganze Szene → 1 Ort, 1 Undo-Schritt, page-scoped; `render()` kann Mount-Punkt **und** Config-`<script type="application/json">` selbst emittieren, ganz ohne Publish-Hook; `dependencies` fliessen automatisch in die Site-`package.json` | `render()` läuft in der QuickJS-VM (2 s/64 MB) → Config-Grösse ist eine harte Grenze; `render().js` läuft **nie im Canvas** (`src/core/plugin-sdk/modules.ts:55`) |
| **C — site-weites SiteFile** | Ein Ort für alles; Nutzer sieht es im Explorer | Liegt im Shell-Row → **wird bei jedem Save der ganzen Site mitgeschrieben**; Nutzer kann es im Code-Editor zerlegen; nicht page-scoped |
| **D — Kombination** | s. u. | — |

**Empfehlung: D, konkret so.**

1. **Szene = Props EINES `flowcode.anim-stage`-Nodes je Seite** (Option B als Träger, Option A als Mechanik). Alles, was heute `GrafikSetup.grafiken` ist, liegt dort. Ergebnis: page-scoped, ein Undo-Schritt, ein Publish-Snapshot, ein MCP-Handle.
2. **Anker = `htmlAttributes: { "data-og-id": "…" }` auf den Ziel-Nodes.** Das ist der HTML-Attribut-Vertrag, den unser Renderkern ohnehin schon spricht — 1:1 übertragbar.
3. **Assets = Instatic-Media-Library (`/uploads/…`-Pfade), NIE Data-URLs im Node.** Begründung: Page-Row-Grösse, QuickJS-Heap, und CSP erlaubt zwar `img-src … data:` (`src/core/publisher/cspPlan.ts:85`), aber das löst das Speicher- und Bündelproblem nicht.
4. **„Setups"-Bibliothek + Editor-Zustand = `api.cms.storage.collection(...)`** (Permission `cms.storage`, aus dem Editor-Entrypoint nutzbar). Das ist Werkzeug-Zustand, kein Seiteninhalt — der gehört nicht in den Page-Tree.
5. **Kollisionsrisiko:** ein einziger namespaced Top-Key (`flowcodeAnim`), Versionsfeld drin, eigene Validierung beim Lesen mit Fallback statt Throw (Instatic-Hausstil, vgl. `runtimeConfig.ts:90-118`).

---

### 2. Anker-Kette bis zur publizierten Seite

**Der Weg funktioniert und ist belegbar — mit zwei Fallen.**

- Sanitizer lässt `data-og-id` durch: gesperrt sind nur `data-instatic-*` / `data-canvas-*` sowie `data-node-id`, `data-module-id`, `data-hovered` (`src/core/htmlAttributes/attributes.ts:4-9,27-30,68-72`).
- Publisher-Emit: `htmlAttributesAttr` (sortiert + escaped, `src/modules/base/shared/htmlAttributes.ts:33-39`); Canvas-Emit: `htmlAttributesForReact` (`:41-43`) — **dieselbe** Normalisierung. Das Attribut steht also im Canvas-iframe **und** in der publizierten Seite identisch da. Das ist der Grund, warum unser Renderkern in beiden Welten unverändert laufen kann.
- **Automatismus ist möglich und ist der richtige Weg:** das Plugin setzt beim „Anker setzen" direkt `store.read().updateNodeProps(nodeId, { htmlAttributes: { ...vorher, 'data-og-id': id } })`. Kein Publish-Hook nötig, undo-fähig, dirty-markierend. Der Nutzer muss **nichts** manuell setzen.

**`publish.html` ist hier der falsche Weg** — belegbar, nicht Geschmackssache: der Filter bekommt nur den fertigen HTML-String, und publizierte Seiten tragen **kein** Node-Handle. `injectNodeId` schreibt `uid="<id>"` (nicht `data-node-id`, `src/core/publisher/classInjection.ts:154-162`) und `annotateNodeIds` ist ausschliesslich im Agenten-Lesepfad gesetzt (`src/core/ai/readSurface.ts:94`, `.../agent/executor.ts:317`) — der Publish-Pfad setzt es nie. Der Filter hätte also nichts, woran er ein Element wiedererkennen könnte. Ausserdem läuft er in QuickJS (5 s / 64 MB, `limits.ts:23,34`) nach der Asset-Injektion (`server/publish/publishedHtmlPipeline.ts:49-65`). → `publish.html` nur als Notnagel für **globale, node-lose** Einfügungen.

**Falle 1 (siehe Befund B):** auf nicht-anker-fähigen Modulen verschwindet das Attribut still. Unser „Anker setzen" muss die `moduleId` prüfen und sonst auf den nächsten anker-fähigen Vorfahren ausweichen (oder einen `base.container` einziehen) — mit sichtbarer Meldung, nie still.

**Falle 2:** der Nutzer kann `data-og-id` im HTML-Attribute-Panel jederzeit ändern/löschen → Waisen-Anker. Wir brauchen einen „Anker prüfen"-Lauf, der Stage-Props gegen den Baum abgleicht und Waisen benennt (löschen nur nach Bestätigung).

---

### 3. Runtime-Auslieferung

| Weg | Kommt auf die publizierte Seite? | Läuft im Editor-Canvas? | Kosten |
|---|---|---|---|
| **`frontend.assets[]`** (Manifest, ESM unter `/uploads/plugins/<id>/<version>/…`) | Ja, auf **jeder** Seite, deklarativ; relaxt CSP auf `script-src 'self'` | **Nein** — Injektion sitzt nur im Publish-Pfad (`publishedHtmlPipeline.ts:49-50`, `frontendInjections.ts:360-381`) | **Eine** URL für die ganze Site → echter Browser-Cache; kein esbuild |
| **SiteFile `type:'script'` + `runInCanvas`** | Ja, scope-steuerbar pro Seite | **Ja** — einziger Weg mit echter Canvas-Parität (`src/core/site-runtime/runtimeConfig.ts:235`; Injektor `RuntimeScriptInjector.tsx:43-60`) | Bundle **pro Seite pro Publish** (Befund C); Datei liegt im Shell-Row → jedes Save schreibt sie mit; Nutzer kann sie im Code-Editor zerlegen |
| **Modul-`render().js`** | Ja, dedupliziert unter `/_instatic/module-js/<moduleId>.js` | **Nein** (explizit: `src/core/plugin-sdk/modules.ts:55`) | js-String muss durch die QuickJS-Grenze |

**Empfehlung:** **Runtime-Bytes über `frontend.assets[]`**, weil das der einzige Weg ist, bei dem 172 KB genau **einmal** existieren und seitenübergreifend gecacht werden. **Config über die `render()` des Stage-Moduls** als `<div data-wee-anim data-config-id="…">` + `<script type="application/json" data-wee-config>` — das ist exakt Weg 2 unseres bestehenden `embed-entry.tsx:36-50`, ohne eine einzige Zeile Änderung an der Runtime.

Warum diese Config-Variante und nicht die anderen:
- **`window.__WEE_ANIM__` per Inline-Script** würde `script-inline` erzwingen und damit `script-src 'unsafe-inline'` auf die ganze Seite ziehen (`frontendInjections.ts:373-380`) — das ist ein realer Sicherheits-Rückschritt für den Nutzer.
- **`data-config="URL"`** bräuchte eine öffentliche Route. Plugin-Routen mounten unter `/admin/api/cms/plugins/<id>/runtime/*` (plugin-system.md:517) — ob `cms.routes.public` auch für **Besucher der publizierten Seite** erreichbar ist, habe ich **nicht geprüft**; das bleibt UNGEPRÜFT und ist kein Fundament.
- Ein `<script type="application/json">` ist ein Datenblock und wird nicht ausgeführt; CSP `script-src` sollte ihn deshalb nicht greifen. **Das ist Spezifikationswissen, kein Beleg aus diesem Code** — es gehört als eigener Browser-Check in die Messlatte von D2.

**Publish-Hooks, die es wirklich gibt** (`src/core/plugins/hookBus.ts:36-42` + `publishedHtmlPipeline.ts:45-69`): Events `publish.before`, `publish.after`; Filter `publish.html`, `publish.headers`, `content.entry.cells`. Mehr nicht — es gibt **keinen** Hook, der beim Publish in Node-Props schreiben oder Assets erzeugen könnte.

---

### 4. Editor-Vorschau = publizierte Wahrheit?

**`runInCanvas` allein reicht nicht — und zwar aus drei getrennten Gründen.**

1. **Der Design-Modus ist strukturell nicht die publizierte Seite:** pro Breakpoint ein eigener iframe, alle in einem Transform-Layer (Pan/Zoom). Overlays liegen ausserhalb in Screen-Koordinaten. Eine scrollY-getriebene Animation hat dort weder ein einziges `scrollY` noch eine 1:1-Geometrie. Der Live-Modus (ein Frame, echte Grösse, natives Scrollen, `CanvasRoot.tsx:519-525`) ist der **einzige** ehrliche Vergleichsort.
2. **Mehrfach-Mount ist real:** dieselben `runtimeScripts` werden an **jeden** Frame gereicht (`CanvasRoot.tsx:512` und `:524`) und dort per `appendChild` ausgeführt (`RuntimeScriptInjector.tsx:50-58`). Im Design-Modus laufen also N Instanzen unserer Runtime gleichzeitig, jede mit eigenem `document`. Unsere Runtime muss idempotent pro `document` mounten — `embed-entry.tsx:94-96` scannt heute `document.querySelectorAll("[data-wee-anim]")` global; im iframe ist das das richtige `document`, aber ein zweiter Lauf im selben Frame würde doppelt mounten (`createRoot` auf demselben Element). Braucht einen Mount-Marker.
3. **React reconcile clobbert DOM-Schreibzugriffe:** genau das ist der dokumentierte Grund für den manuellen „Refresh"-Knopf (`useRuntimeScriptBuild.ts:22-24`). Unser Renderkern schreibt `transform`/`opacity` direkt ins DOM — im Canvas kann ein Re-Render das überschreiben. Das ist kein Bug, den wir wegkonfigurieren, sondern eine Eigenschaft der React-gerenderten Canvas.
4. **Zeitpunkt-Semantik weicht ab:** `timing: 'dom-ready'` wird im Canvas per Replay-Shim nachgestellt (`canvasDomReadyReplay.ts:13-47`), auf der publizierten Seite ist es ein echtes `DOMContentLoaded`.

**Konsequenz — zwei Pfade, EIN Kern, EINE Datenquelle:** Renderkern (`grafik-types.ts`, `GrafikLayer.tsx`, `GrafikMedium.tsx`, `easing.ts`) einmal bündeln; Einstiegspunkt A = Editor-Entrypoint (unsandboxed, Portal in `[data-instatic-canvas-root]`, Editor-Koordinaten — genau der bewiesene Spike-Pfad); Einstiegspunkt B = `frontend.assets`-Runtime auf der publizierten Seite. Beide lesen dieselben Stage-Node-Props. Die Messlatte ist dann **nicht** „gleicher Code-Pfad", sondern **„gleiches Bild"**: Screenshot-Paar Live-Modus vs. publizierte Seite bei identischen scrollY-Werten.

---

### 5. Autoren-API / CLI / MCP

**Nicht nachbauen — es ist schon da, und es passt zu Empfehlung D1.**

- Instatic ist selbst ein MCP-Server unter `/_instatic/mcp` (`docs/features/mcp-connectors.md`), mit u. a. `site_update_node_props`, `site_read_document`, `site_insert_html`, `site_publish` (`server/ai/tools/site/writeTools.ts:102-166`, `server/ai/mcp/tools/publishTool.ts:23`). Schreibende Tools laufen über die Live-Workspace-Bridge in den **offenen** Editor, nicht headless in die DB — d. h. sie gehen durch dieselben Store-Aktionen, also mit Undo und Dirty-Tracking. **Wenn die Szene in Node-Props liegt, ist der Agenten-Zugriff ohne eine Zeile Code vorhanden.** Das ist das stärkste einzelne Argument für das empfohlene Datenmodell.
- **Plugins können keine MCP-/AI-Tools registrieren.** `allMcpTools` ist eine statische Liste (`server/ai/mcp/registry.ts:46-63`), und im Plugin-SDK gibt es keinen `tools.register`-Extension-Point (Suche leer).
- **Was in der QuickJS-Sandbox NICHT geht** (falls wir doch eine `cms.routes`-Route brauchen): kein `node:*`/`bun:*`, kein `fs`, kein `eval`/`new Function`, kein `WebSocket`/`XHR`, kein ungatetes `fetch`, >5 s Laufzeit bricht ab, 64 MB Heap, 1 MB Stack (`plugin-system.md:320-355`; `server/plugins/quickjs/limits.ts:23,34`). Media-Bytes gehen **bewusst nicht** durch die Sandbox. Also: Validierung/Rechenlogik ja — Bildverarbeitung, Vektorisierung, Freistellen, Rendering **nein**. Unsere heutigen `/api/vektorisieren`, `/api/abbild`, `/api/assets` (`components/grafik/GrafikEditor.tsx:760, 1980, 2520ff`) sind damit **keine** Kandidaten für ein Server-Plugin; sie müssten Editor-seitig (unsandboxed, voller Browser) oder als separater Dienst laufen.
- **CLI:** `bun instatic-plugin dev` schreibt Builds direkt nach `uploads/plugins/<id>/<version>/` (plugin-system.md:1005-1015) — das ersetzt unsere Entwicklungsschleife ohne Eigenbau.

---

### 6. Bau-Reihenfolge aus Datenfluss-Sicht (je mit nutzersichtbarer Messlatte)

| Schritt | Inhalt | **Nutzersichtbare Messlatte** (kein Ersatz-Indikator) |
|---|---|---|
| **D0 — Persistenz-Pfad** *(muss zuerst, sonst baut alles auf Sand)* | Minimal-Plugin schreibt einen Zahlenwert in `props.flowcodeAnim` — einmal über `store.transaction`, einmal über `store.read().updateNodeProps`. Beide Wege messen. | „Ich stelle im Plugin-Panel eine Zahl ein, **fasse sonst nichts an**, warte den Autosave ab, lade den Browser **hart** neu — die Zahl steht noch da. Und der Undo-Knopf des Editors macht sie rückgängig." |
| **D1 — Anker-Kette** | „Anker setzen" schreibt `data-og-id` per Host-Aktion; Modul-Fähigkeit prüfen + Ausweichlogik; „Anker prüfen"-Lauf | „Ich klicke ein Text-Element an, drücke ‚Anker setzen', publiziere, öffne die **publizierte** Seite, und Untersuchen zeigt genau an diesem Element `data-og-id`. Dann schiebe ich das Element im Editor um zwei Sektionen nach unten, publiziere neu — der Anker sitzt immer noch daran." |
| **D2 — Datenmodell + Stage-Node** | `flowcode.anim-stage`-Modul; Szene in dessen Props; `render()` emittiert Mount + JSON-Config; TypeBox-Validierung + `schemaVersion` | „Ich lege eine Grafik mit 3 Keyframes an, publiziere. Auf der publizierten Seite steht im Quelltext ein `<script type=\"application/json\" data-wee-config>` mit genau meinen 3 Keyframes — und die Konsole zeigt 0 CSP-Verstösse." |
| **D3 — Runtime auf der publizierten Seite** | `frontend.assets[]`-Auslieferung des Renderkerns | „Auf der publizierten Seite bewegt sich beim Scrollen meine Grafik entlang meiner Keyframes. Netzwerk-Tab: **genau eine** Runtime-Datei, und beim Wechsel auf eine zweite Seite wird sie **aus dem Cache** geladen. Konsole: 0 Fehler." |
| **D4 — Live-Modus = publizierte Wahrheit** | Editor-Einstiegspunkt gegen dieselbe Config; Mount-Idempotenz; Reconcile-Schutz | „Screenshot-Paar Live-Modus vs. publizierte Seite bei scrollY 0 / 500 / 1500 — deckungsgleich." **(Optik-Urteil: Leon)** |
| **D5 — Assets ohne Data-URLs** | Bibliothek → Instatic-Media; Migrationspfad für bestehende Setups | „Ein Setup mit 12 Bildern: die 12 Bilder stehen im Media-Bereich, die publizierte Seite lädt sie einzeln, und das Config-JSON im Quelltext enthält **keine** `data:`-URL mehr." |
| **D6 — Agenten-Zugriff** | nur Schema-Feinschliff, kein Eigenbau | „Über MCP sage ich ‚verschiebe Grafik 2 um 200 px nach unten' → im offenen Editor bewegt sie sich, und der Undo-Knopf macht es rückgängig." |

**Warum D0 zwingend zuerst kommt:** genau hier lag der frühere Fehlschlag-Typ. „Das Panel zeigt den Wert an" ist ein Ersatz-Indikator; die echte Frage ist „überlebt der Wert einen Reload". Befund A sagt: beim naheliegenden Weg (`store.transaction`) **überlebt er nicht**.

---

### Was ich NICHT belegen kann (bleibt UNGEPRÜFT)

- Ob `cms.routes.public` auf der **publizierten** Seite (nicht `/admin`) erreichbar ist — nicht nachgelesen. Deshalb steht der `data-config="URL"`-Weg nicht in der Empfehlung.
- Ob ein `<script type="application/json">` unter der emittierten CSP tatsächlich unbeanstandet bleibt — spezifikationsseitig ja, aber hier nicht ausgeführt. Gehört als eigener Check in D2.
- Ob Site-Transfer/Import unsere freien Props mitträgt — die Save-/Version-/Publish-Pfade serialisieren komplette Nodes, die Transfer-Pfade (`src/core/siteImport/*`) habe ich nicht einzeln geprüft.
- **Nebenbefund, ungeklärt:** auch `filesSlice`-Schreibzugriffe (`createFile`, `updateFileContent`, …, `.../slices/filesSlice.ts:99-180`) setzen `hasUnsavedChanges` **nicht** — eine reine Skript-Änderung im Code-Editor scheint für sich genommen keinen Autosave auszulösen. Ob der Code-Editor auf einem anderen Weg speichert, habe ich nicht abschliessend verfolgt. Falls das so ist, ist es ein zusätzlicher Grund, die Runtime **nicht** als SiteFile zu führen.