# Puck-Erweiterungsebene: Befund & Architektur-Konsequenzen

> Stand: 2026-07-21. **Anlass:** Leons Hinweis, dass die offizielle Puck-Doku die KI-/API-Anbindung
> bereits dokumentiert (Internal Puck API, Plugin API, Data Migration) — diese Ebene fehlte in
> [ki-strategie.md](ki-strategie.md) v1 (Errata dort im Kopf verlinkt, vollständig hier in §5).
> Methodik: Multi-Agent-Nachrecherche — kompletter Doku-Sweep (Inhaltsverzeichnis kartiert) →
> 5 Tiefenlese-Dimensionen → 10 adversarielle Verify-Verdikte → Synthese; zusätzlich vom
> Orchestrator gegen die lokal installierten Typdefinitionen von `@puckeditor/core@0.22.2`
> gegengeprüft. Alles, was nur code-verifiziert und nicht dokumentiert ist, ist markiert.

## 1. Kernbefund

Puck stellt die Agenten-Anbindung im Editor nicht nur "irgendwie" bereit, sondern liefert sie als offizielles Architekturmuster: Ein Plugin (`{ name, label, icon, render }`) mountet ein eigenes Panel in der Plugin Rail, liest den Editor-Zustand über die Internal Puck API (`usePuck`/`useGetPuck`) und schreibt **ausschließlich über `dispatch(action)`** — exakt so arbeitet Pucks eigenes (cloud-gebundenes) AI-Plugin, dessen Stream nachweislich `PuckAction[]`-Batches transportiert. Für den Importer existiert ein vollständiger, Node-fähiger Daten-Werkzeugkasten (`migrate`/`transformProps`/`walkTree`/`resolveAllData` via `@puckeditor/core/rsc`), der unsere Stufe-A/B/C-Pipeline offiziell trägt. Beides war in unserer bisherigen Strategie-Recherche unterbelichtet; die frühere Laufzeit-Grenze (Static Export, kein Server im Deploy) bleibt dabei unverändert korrekt.

## 2. Die Bausteine im Detail

### 2.1 Internal Puck API (PuckApi)

**Belegt** (https://puckeditor.com/docs/extending-puck/internal-puck-api, .../api-reference/puck-api, .../api-reference/actions — jeweils gegen 0.22.2-dist verifiziert):

- Zugriff über zwei Hooks (`usePuck`, `useGetPuck`) plus die Factory `createUsePuck` (empfohlen, Selektor-basiert). Alle nur **innerhalb** des `<Puck>`-Baums nutzbar (werfen sonst); die Doku erlaubt Zugriff explizit in Composition, UI-Overrides und Custom Fields — Plugin-Panels eingeschlossen. `useGetPuck()` liefert eine stabile `getState`-Funktionsreferenz für Callbacks/Effects außerhalb des Render-Lifecycles.
- PuckApi-Oberfläche: `appState {data, ui}`, `dispatch(action)`, `selectedItem`, `getItemById`, `getItemBySelector`, `getSelectorForId(id)` (übersetzt stabile `props.id` in `{index, zone}` zur Dispatch-Zeit — der Schlüssel für ID-basierte Agenten-Adressierung), `getParentById`, Permissions-Getter, `resolveDataById/BySelector`, History-Objekt.
- **Action-Vokabular:** Die Doku-Seite dokumentiert nur 3 Actions (`setData`, `setUi`, `set`) und erklärt sich selbst zur Teilreferenz. Typverifiziert in 0.22.2 sind es 12: `insert | duplicate | replace | replaceRoot | reorder | move | remove | setUi | setData | set | registerZone | unregisterZone`, jede mit optionalem `recordHistory?: boolean`. `insert` trägt **keine** Props (Initial-Props kommen aus `defaultProps`); "Einfügen mit Props" = `insert` mit selbst vergebener `id` + anschließendes `replace`.
- `setData` ist die offizielle Voll-Ersetzung in laufender Session (Indexe werden automatisch rebuildet); die Runtime warnt aber selbst: "setData is expensive … Consider using a more atomic action instead" — atomare Operationen sind der von Puck nahegelegte Weg. Für sauberen Voll-Austausch alle drei Keys `{root, content, zones}` mitgeben (der Index-Rebuild merged, sonst bleiben stale Einträge als harmloser Superset zurück). `set` meiden (Funktions-Form rebuildet Indexe nicht).
- Rückkanal: `<Puck onAction={(action, appState, prev) => …}>` feuert bei jedem Store-dispatch, auch programmatischen (dokumentiert als Kanal zum "sync with external systems"). Die `data`-Prop ist initial-only — Live-Updates von außen gehen **nur** über dispatch.

**Grenzen / nur code-verifiziert (semver-ungeschützt, pro Upgrade re-prüfen):**
- History-Verhalten ist **undokumentiert**: strukturelle Actions erzeugen default Undo-Schritte, `setData`/`setUi`/`set` nicht; Aufzeichnung ist 250 ms debounced (Bursts koaleszieren zu einem Undo-Schritt). Kein Batch-/Transaktions-API.
- Kein Nicht-React-Einstieg (kein window-Global, kein Store-Export). Die Brücke "captured `getPuck`-Referenz an externen Code weiterreichen" ist implementierungsgedeckt, aber undokumentiert; nach `<Puck>`-Unmount liefert sie nur noch einen eingefrorenen Snapshot.
- `onAction` erhält in 0.22.2 die **rohen** internen State-Objekte (inkl. undokumentiertem `indexes`-Feld) und verpasst manche UI-only-`setUi`-Pfade (Canvas-Klick-Selektion).
- Permissions (`drag/duplicate/delete/edit/insert` + Custom-Keys) sind ein reines **UI-Gate**: der Reducer prüft nachweislich nichts — programmatische Dispatches unterliegen keiner Permission-Prüfung. Guardrails gehören in unsere Bridge, nicht in Puck-Permissions.

### 2.2 Plugin API + UI Overrides

**Belegt** (https://puckeditor.com/docs/extending-puck/plugins, .../api-reference/plugin, .../api-reference/overrides):

- Plugin-Shape 0.22.2: `{ name?, label?, icon?, render?, overrides?, fieldTransforms?, mobilePanelHeight? }`; ein Rail-Panel entsteht nur bei `name` **und** `render`. Geladen via `<Puck plugins={[…]}/>`. Default-Rail = blocks + outline + User-Plugins + fields; ein gleichnamiges User-Plugin ersetzt das eingebaute Panel (White-Labeling-Hebel).
- Plugin-`render()` läuft innerhalb des Puck-Kontexts → voller PuckApi-Zugriff inkl. `dispatch`. Aktives Panel ist UI-State (`ui.plugin.current`), programmatisch öffenbar via `setUi({ plugin: { current: 'assistant' }, leftSideBarVisible: true })`. Alle Panels sind permanent gemountet (nur CSS-Umschaltung) — Panel-State überlebt Wechsel.
- 13 dokumentierte Override-Slots (u.a. `headerActions` für Buttons, `componentOverlay` mit `componentId/hover/isSelected` für "Agent arbeitet hier"-Markierungen, `iframe` für Style-Injection). Overrides werden über Plugins gecurried (letztes Plugin außen). **Warnung der Doku selbst:** die Overrides-API ist "highly experimental".
- `fieldTransforms` sind eine reine Render-Schicht (flach gemergt) — für Import-/Persistenz-Transformationen ungeeignet.

**Offen:** Plugin-Objekt hat keinen Lifecycle-Hook (kein onMount/onAction am Plugin selbst); `mobileOnly/desktopOnly` existieren nur im internen Typ; ob sich Default-Plugins entfernen (statt ersetzen) lassen, ist undokumentiert.

### 2.3 Data Migration + Daten-APIs

**Belegt** (https://puckeditor.com/docs/integrating-puck/data-migration, .../api-reference/functions/*, .../guides/migrations/dropzones-to-slots, .../integrating-puck/external-data-sources):

- Datenmodell = rekursives **Slot-Modell**: Slots sind normale Props vom Typ `ComponentData[]`, beliebig tief; `zones` ist Legacy (DropZone deprecated, Runtime warnt). Das Format ist nicht selbstbeschreibend — die Config ist das Schema und muss jedem Werkzeug mitgegeben werden.
- `migrate(data, config?)`: hebt Legacy-Payloads (Root-Props, zones→slots) auf den aktuellen Stand; wirft hart bei unmigrierbaren Zonen. Enthält in 0.22.2 genau zwei eingebaute Migrationen; **kein** Registry-API für eigene — dafür ist `transformProps(data, transforms, config?)` da (Prop-Renames je Komponententyp inkl. `root`, id-erhaltend).
- `walkTree(data, config, cb)`: offizieller depth-first-Iterator (tiefste Slots zuerst, immutable Updates) — Fundament für Stufe-B-Codemods. `setDeep` für Pfad-Schreibzugriffe.
- `resolveAllData(data, config, …)`: führt alle `resolveData`-Resolver mit Trigger `force` aus — und ist wie `migrate/transformProps/walkTree` über **`@puckeditor/core/rsc` Node-fähig** (Build-/Prebuild-Skripte ohne Browser). `<Render>` selbst resolved nichts, rendert nur gespeicherte Props.
- `external`-Feld: Auswahl-UI mit `fetchList` (läuft im Browser der editierenden Person), speichert eine **Kopie** der Daten in props; Frische via `resolveData` (changed-Check + `readOnly`-Markierung), "Hybrid authoring" dokumentiert; Referenz `@puckeditor/field-contentful`.
- Puck bietet **keine** Payload-Validierung, und `<Render>` überspringt unbekannte Komponententypen **still** — Validierung bleibt unsere Pflicht.

**Offen:** Verhalten von `resolveAllData` bei Resolver-Fehlern undokumentiert; ob der Load-Pfad fehlende ids im content wirklich nie auffüllt, ist Code-Lesart und sollte einmal empirisch bestätigt werden.

### 2.4 Offizielle AI-Angebote (Puck AI)

**Belegt** (https://puckeditor.com/docs/ai/overview ff., .../api-reference/ai/*, npm-Registry, Bundle-Inspektion):

- "Puck AI" ist ein **Cloud-Produkt in offener Beta** mit Bezahlplänen (ab $25/Monat; Headless-`generate()` ab $150; "Bring-your-own-key" nur im $500-Plan, Semantik undokumentiert). Kein Self-Host-, kein BYO-LLM-Pfad in Doku oder Code.
- Zwei Pakete: `@puckeditor/plugin-ai` (Chat-Panel in der Rail) und `@puckeditor/cloud-client` (Server-Proxy zur Puck Cloud, `x-api-key`). Beide **closed source, ohne Lizenzdatei**, mit PostHog/Sentry-Telemetrie im Bundle; peerDependency `^0.21.0` schließt unser core 0.22.2 formal aus.
- Architektonisch hochrelevant als **Blaupause**: Der Chat streamt (Vercel AI SDK v6 UIMessage-Format) Puck-eigene Data-Parts — darunter `puck-actions: PuckAction[]` (exakt das dispatch-Vokabular des MIT-Core) und ein 7-Ops-Vokabular `add/update/updateRoot/move/delete/duplicate/reset`; der Server fordert sogar Canvas-Screenshots je Breakpoint an (visueller Feedback-Loop). `createAiPlugin({ host, prepareRequest })` kann offiziell auf einen eigenen Server zeigen — das Antwort-/Streamformat ist aber **nicht als öffentlicher Vertrag dokumentiert** (nur aus ausgelieferten .d.ts rekonstruierbar).
- Der `ai`-Metadaten-Namespace (`instructions`, `exclude`, `schema`, `stream`, `bind` je Komponente/Feld) wird per TypeScript-Augmentation auf offizielle Erweiterungspunkte des MIT-Core gelegt — das Muster "Komponenten für KI beschreiben" ist frei kopierbar, ohne deren Cloud.

**Offen:** LLM-Identität und Datenfluss der Cloud (config + pageData + Screenshots gehen an cloud.puckeditor.com) undokumentiert; Stabilität des Stream-Vertrags (0.x-Beta); Rechtslage des unlizenzierten Plugins gegen Fremd-Host.

### 2.5 "Printing Press"-CLI

**Belegt** (github.com/puckeditor, github.com/mvanhorn/cli-printing-press, npm; Stand 21.07.2026): Im Puck-Ökosystem existiert **kein** Tool dieses Namens (Org-Repos, awesome-puck, Docs-Site: 0 Treffer). Der mit Abstand prominenteste Namensträger ist `mvanhorn/cli-printing-press` — ein generischer Generator für agent-native Go-CLIs + MCP-Server aus API-Specs, **ohne jeden Puck-Bezug**. Der einzige offizielle Puck-CLI ist `create-puck-app` (Scaffolding). Die Zuordnung zu Puck ist damit sehr wahrscheinlich eine Kontext-Vermischung — **unbestätigt, bis Leon die Originalquelle nennt.** Für unseren Static-Publishing-Pfad ändert sich nichts; als spätere Option könnte Printing Press aus einer stabilen Builder-API einen agent-nativen CLI/MCP generieren.

## 3. Architektur-Konsequenz: Paperclip-/Claude-Anbindung im Editor

Der durch Doku + 0.22.2-Bordmittel vollständig gedeckte Bauplan (kein Fork, kein Patch, keine Cloud):

1. **Panel:** Eigenes Plugin `{ name: 'assistant', label, icon, render: () => <AssistantPanel/> }` in der Plugin Rail. Das Panel ist normale React-Komponente — fetch/SSE gegen Paperclip (localhost:3100, Issue→Run) ist reines React-Land.
2. **Lesen:** `createUsePuck`-Selektoren für Live-UI (`appState.data`, `selectedItem`); `useGetPuck()` in Handlern für den Snapshot, der als Agenten-Kontext geht (Data-JSON + Komponenten-Beschreibungen aus der Config, angelehnt an Pucks `ai`-Namespace).
3. **Schreiben:** ausschließlich `dispatch` — granulare Actions für Agent-Edits (`insert`+`replace`/`remove`/`move`/`duplicate`/`replaceRoot`), Adressierung über stabile `props.id` → `getSelectorForId(id)` zur Dispatch-Zeit. Undo bleibt intakt (strukturelle Actions recorden default; "ein Agent-Run = ein Undo-Schritt" via `recordHistory`-Choreografie ist **unverifiziert** → Spike).
4. **Protokoll:** an `PuckDataParts` des offiziellen Plugins anlehnen (puck-actions / build-op / tool-status / finish / page) — bewiesen LLM-tauglich, hält spätere Kompatibilität offen. Screenshots je Breakpoint als Rückspielkanal einplanen (Urteil bleibt bei Leon).
5. **Sichtbarkeit:** `componentOverlay`-Override für Agent-Markierungen, `headerActions` für Quick-Actions — im Plugin gebündelt, dünn gehalten (experimentell-Status).
6. **Static-Export-Grenze bleibt:** PuckApi existiert nur im gemounteten Browser-Editor. Der Editor ist Autoren-Werkzeug; das Deploy (`output: 'export'`) enthält weiterhin keinerlei Agent-/Server-Laufzeit. Der Agent-Dienst (Paperclip) läuft als separater lokaler Prozess — genau die Grenze, die v1 bereits gezogen hat.

**Nicht** auf `@puckeditor/plugin-ai` aufbauen (Peer-Konflikt, closed source ohne Lizenz, Telemetrie, undokumentierter Stream-Vertrag) — nur als UX-/Protokoll-Blaupause lesen.

## 4. Architektur-Konsequenz: Importer

- **Stufe A** (`lib/import/grafik-setup-to-puck.ts`): Slot-only erzeugen (nie `zones`); jede Komponente mit selbst generierter eindeutiger id im Puck-Hausformat `${type}-${uuid}`; Root-Props strikt unter `root.props`. Eigene Zod-Validierung ist Pflicht (Puck validiert nichts, `<Render>` verschluckt Typos still); `migrate(output, config)` als kostenloses Abschluss-Safety-Netz. Live-Import in eine offene Session ist jetzt zusätzlich möglich: `dispatch({ type: 'setData', data: {root, content, zones: {}}, recordHistory: true })`.
- **Stufe B:** kein eigener Baum-Walker — `walkTree` (Traversal), `transformProps` (Renames), `setDeep` (Pfade) sind die offiziellen Primitives. Eigene Schema-Versionierung selbst bauen: Versionsfeld (z.B. `root.props._schemaVersion`) + geordnete `transformProps`-Kette.
- **Stufe C:** Agent erzeugt fertige Slot-basierte Data-Payloads; **eine** Pipeline für alles: `migrate` → eigene `transformProps` → `resolveAllData` (Node, Prebuild; Fortschritts-Hooks `onResolveStart/End`) → Zod → Persist. Pucks Cloud-`generate()` ist kein Shortcut für uns (cloud-only, $150+), aber seine Signatur ist die richtige Vertragsvorlage.
- **Decap:** offizielles Muster external-Feld (Kopie) + `resolveData` (Frische) + Hybrid authoring passt exakt: build-generierter `content-index.json` same-origin, `fetchList` liest ihn im Browser (keine Tokens im Client), Build-Refresh via `resolveAllData`.

## 5. ERRATA zur ki-strategie.md v1

1. **"In-Editor-Claude-Kanal ist spekulativ" — zu korrigieren und zu differenzieren.** Richtig bleibt: In unserem Repo existiert dieser Kanal nicht, und Pucks eigenes AI-Produkt ist cloud-gebunden. Falsch ist die Einstufung als spekulativ: Puck sieht den Agenten-Einstieg **offiziell** vor (Plugin Rail + Internal Puck API + dispatch als dokumentierter Schreibkanal) und praktiziert ihn selbst (AI-Plugin streamt `PuckAction[]`). Neuer Wortlaut: "im Repo nicht vorhanden, aber von Puck als offizieller Integrationspunkt vorgesehen und mit 0.22.2-Bordmitteln self-hosted baubar."
2. **Lücke schließen:** v1 hat die Doku-Sektionen "Extending Puck" (7 Seiten), "Puck AI" (6 Seiten) und den AI-Block der API-Referenz (9 Seiten) nicht erfasst — die Kartierung aus Abschnitt 2 ist als verbindliche Ergänzung aufzunehmen.
3. **Import-Annahme schärfen:** Sofern v1 den Import nur über "Data-JSON persistieren + Editor neu mounten" beschreibt: das bleibt gültig, ist aber nicht mehr der einzige Weg — `setData` per dispatch ist die offizielle Voll-Ersetzung in laufender Session (inkl. Undo bei `recordHistory: true`).
4. **Migrations-/Werkzeuglage schärfen:** Puck liefert einen offiziellen, Node-fähigen Daten-Werkzeugkasten (`migrate/transformProps/walkTree/resolveAllData/setDeep` via `/rsc`) — jede v1-Formulierung, die Eigenbau von Traversal/Migration nahelegt, ist entsprechend zu ersetzen. Zugleich neu festzuhalten: Puck validiert **nichts**, Zod bleibt Pflicht.
5. **Zielarchitektur präzisieren:** DropZone ist Legacy; alles Neue ist Slot-basiert (offizieller Migrations-Guide). Falls v1 DropZones erwähnt: ersetzen.
6. **Neue Warnungen aufnehmen:** (a) `@puckeditor/plugin-ai`/`cloud-client` nicht als Basis (Lizenz/Peer/Telemetrie); (b) Permissions sind kein Sicherheits-Gate für programmatische Dispatches; (c) Overrides-API offiziell "highly experimental"; (d) History-Semantik (250 ms-Debounce, Ausnahmeliste) ist undokumentiertes Laufzeitverhalten — pro Puck-Upgrade re-verifizieren.
7. **"Printing Press":** kein Puck-Baustein — aus der Strategie streichen bzw. als unbestätigten Fremdfund (vermutlich `mvanhorn/cli-printing-press`, Agent-CLI-Generator) in den Anhang verschieben, bis Leon die Originalquelle nennt.

## 6. Empfohlener nächster Schritt

**R2c-Spike "Agent-Panel-Skelett" (klein, ~1 Tag, auf R2a/R2b aufbauend):** Auf der bestehenden `/puck`-Route ein Minimal-Plugin `{ name: 'assistant', … }` mounten, das (1) `appState.data` und `selectedItem` per `createUsePuck` anzeigt, (2) drei Buttons hat — "Insert mit Props" (insert + eigene id + replace), "Voll-Import" (`setData` mit `recordHistory: true`, Adapter-Output aus R2b), "Selektieren per id" (`getSelectorForId` + `setUi`) — und (3) dabei die drei unverifizierten Punkte empirisch klärt: Undo-Granularität via `recordHistory`-Choreografie, `onAction`-Sichtbarkeit programmatischer Dispatches, Verhalten von `dispatch` bei `insert: false`-Permission. Noch **ohne** Paperclip-Netzwerk — erst wenn das Skelett steht, wird der fetch gegen localhost:3100 eingehängt. Ergebnis: der komplette Doku-Bauplan aus Abschnitt 3 ist dann an unserem echten Setup bewiesen statt nur belegt.
