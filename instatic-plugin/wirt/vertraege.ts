/*
 * vertraege.ts — DER KATALOG DER BERUEHRUNGSPUNKTE (H6, Teilaufgabe 1).
 *
 * ============================================================================
 * WOZU DIESE DATEI
 * ============================================================================
 * Instatic ist v0.0.14 mit der ausdruecklichen Politik "No backward
 * compatibility. Ever." — 6 Releases in 4 Wochen. Unser Plugin haengt an
 * mehreren Flaechen des Wirts. Diese Datei ist die EINZIGE Stelle, an der
 * steht, WELCHE das sind, WO sie im Wirt liegen, WIE volatil sie sind und WAS
 * zu tun ist, wenn eine bricht.
 *
 * Sie ist bewusst REINE DATEN (keine Imports, keine Logik): sowohl die
 * Wirt-Schicht (wirt/*.ts) als auch die Smoke-Suite
 * (scripts/70-wirt-smoke.mjs) lesen daraus. Ein Beruehrungspunkt, der hier
 * nicht steht, wird nicht geprueft — deshalb ist "hier eintragen" der erste
 * Schritt, wenn wir eine neue Wirt-Flaeche anfassen.
 *
 * ============================================================================
 * VOLATILITAET — NEU GEMESSEN, UND H0 WAR ZU OPTIMISTISCH
 * ============================================================================
 * H0 hat 6 Host-Dateien vermessen (instatic-pin.json). H6 hat diese Messung
 * (a) reproduziert und (b) auf ALLE Dateien ausgedehnt, an denen wir wirklich
 * haengen. Zwei Befunde, die den Plan beruehren:
 *
 *   1. H0s Zahlen fuer die volatilen Dateien sind zu NIEDRIG. Mit demselben
 *      Fenster (60 Tage vor dem Pin-Datum, also `--since=2026-05-30`) misst
 *      derselbe Klon 15 statt 10 Aenderungen fuer CanvasRoot.tsx und
 *      nodeActions.ts. Die Einordnung (stabil/mittel/volatil) bleibt
 *      unveraendert richtig; die Zahlen in dieser Datei sind die
 *      reproduzierten. Reproduktionsbefehl steht in `MESSBEFEHL`.
 *
 *   2. DER ANKER-VERTRAG HAENGT AN EINER DER VOLATILSTEN DATEIEN DES REPOS.
 *      H0 hat fuer den Anker `src/core/htmlAttributes/attributes.ts` (3
 *      Aenderungen) vermessen — das ist aber der VERWORFENE Attribut-Weg. Der
 *      Weg, den wir seit H2 wirklich benutzen, laeuft ueber
 *      `src/core/publisher/renderNode.ts` (16!) und `render.ts` (20 — die
 *      meist-geaenderte Datei unter allen unseren Beruehrungspunkten).
 *      Der DATENvertrag ist stabil, seine TRAEGERDATEI ist es nicht.
 *      => BP-03 ist deshalb der wichtigste Check der Suite, nicht der
 *         nebensaechlichste.
 *
 * ============================================================================
 * REGEL FUER DIE WIRT-SCHICHT
 * ============================================================================
 * Genau EINE benannte Funktion/Konstante je Beruehrungspunkt. Kein anderer
 * Teil unseres Codes fasst Instatic-Interna direkt an.
 * AUSNAHME (bewusst, aus der Analyse, Entscheidung E3): `@instatic/host-ui`
 * darf direkt importiert werden — es ist die einzige Flaeche mit einem eigenen
 * Paritaets-Gate-Test der Plattform
 * (`src/__tests__/architecture/plugin-host-ui-runtime-parity.test.ts`).
 */

/** Wie stark eine Wirt-Datei sich bewegt. */
export type Volatilitaet = "stabil" | "mittel" | "volatil";

/** Wie die Suite einen gebrochenen Punkt meldet. */
export type Bruchart = "fehler" | "warnung";

/** Eine Wirt-Datei, an der ein Beruehrungspunkt haengt. */
export interface WirtDatei {
  /** Pfad RELATIV zur Klon-Wurzel (instatic/). */
  pfad: string;
  /** Zeile im gepinnten Stand — Orientierung, nicht Vertrag. Zeilen wandern. */
  zeile?: number;
  /** Wofuer diese Datei in diesem Beruehrungspunkt steht. */
  rolle: string;
  /** Aenderungen in 60 Tagen vor dem Pin-Datum (s. MESSBEFEHL). */
  aenderungen60d: number;
  /** Datum der letzten Aenderung im gepinnten Stand. */
  zuletzt: string;
}

export interface HostVertrag {
  /** BP-01 … BP-09. Stabil — die Smoke-Suite und die Berichte referenzieren ihn. */
  id: string;
  name: string;
  /** Was wir ueber diesen Punkt tun. */
  wasErTut: string;
  /** Die Funktion/Konstante in wirt/, die ihn kapselt. */
  wirtSymbol: string;
  /** Modul in wirt/, in dem sie liegt. */
  wirtModul: string;
  wirtDateien: WirtDatei[];
  /** Hoechste Volatilitaet der beteiligten Dateien. */
  volatilitaet: Volatilitaet;
  /** Ab welchem Haeppchen wir ihn wirklich benutzen. */
  genutztAb: string;
  /** Was zu tun ist, wenn er bricht — Fallback ODER harte Fehlermeldung. */
  wennErBricht: string;
  /** Bricht der Punkt still oder laut? Der teuerste Fehlermodus ist "still"
   *  (H1: `transaction` verliert Daten ohne jede Meldung). */
  bruchArt: Bruchart;
  /** Check-Ids, die die Smoke-Suite fuer diesen Punkt ausfuehrt. */
  pruefungen: string[];
}

/** Reproduktionsbefehl fuer die Volatilitaetszahlen (im Klon auszufuehren). */
export const MESSBEFEHL =
  'git log --since=2026-05-30 --oneline -- <datei> | wc -l   # 60 Tage vor dem Pin-Datum 2026-07-29';

/** Die einzige erlaubte Direkt-Import-Flaeche (Entscheidung E3). */
export const ERLAUBTE_DIREKT_FLAECHE = "@instatic/host-ui";

/** Schwellen, ab denen eine Datei als mittel/volatil gilt. */
export const VOLATIL_AB = 8;
export const MITTEL_AB = 3;

export function volatilitaetFuer(aenderungen60d: number): Volatilitaet {
  if (aenderungen60d >= VOLATIL_AB) return "volatil";
  if (aenderungen60d >= MITTEL_AB) return "mittel";
  return "stabil";
}

export const VERTRAEGE: HostVertrag[] = [
  {
    id: "BP-01",
    name: "Schreibpfad in den Editor-Store",
    wasErTut:
      "Setzt Node-Props (unsere Keyframes) so, dass die Seite SCHMUTZIG wird, im Save-PUT landet, einen Reload ueberlebt und im Undo haengt. In H1 dreifach gemessen: `transaction` tut das NICHT (und ueberlebt nur als Trittbrettfahrer, wenn zufaellig etwas anderes dieselbe Seite schmutzig macht — sporadisch statt deterministisch, der teuerste Fehlermodus).",
    wirtSymbol: "schreibeNodeProps()",
    wirtModul: "wirt/editor.ts",
    wirtDateien: [
      {
        pfad: "src/admin/pages/site/store/slices/site/nodeActions.ts",
        zeile: 315,
        rolle: "Implementierung der Aktion updateNodeProps (mutateActiveTree + Undo-Coalescing)",
        aenderungen60d: 15,
        zuletzt: "2026-07-03",
      },
      {
        pfad: "src/admin/pages/site/store/store.ts",
        zeile: 58,
        rolle: "useEditorStore — der Store selbst",
        aenderungen60d: 13,
        zuletzt: "2026-07-03",
      },
      {
        pfad: "src/core/plugins/runtime.ts",
        zeile: 491,
        rolle: "editor.store.read() liefert den Store ins Plugin; editor.store.transaction() ist der VERBOTENE Nachbar",
        aenderungen60d: 5,
        zuletzt: "2026-06-11",
      },
    ],
    volatilitaet: "volatil",
    genutztAb: "H1",
    wennErBricht:
      "HARTE FEHLERMELDUNG, kein Fallback. Ein Schreibpfad, der still nicht persistiert, ist schlimmer als gar keiner — genau das hat H1 belegt. `schreibeNodeProps` wirft, wenn `updateNodeProps` fehlt, und faellt NIEMALS auf `transaction` zurueck.",
    bruchArt: "fehler",
    pruefungen: ["bp01-action-vorhanden", "bp01-store-export", "bp01-plugin-store-read"],
  },
  {
    id: "BP-02",
    name: "Anker-Klasse an einen Node vergeben",
    wasErTut:
      "Erzeugt die Stilregel `fcank-<id>` und haengt sie per classIds an den Node. Instatic loest classIds beim Rendern ueber `classNamesForClassIds(site.styleRules, node.classIds)` in echte Klassennamen auf — die Regel ist also die Quelle des Klassennamens, nicht der Node.",
    wirtSymbol: "setzeAnkerKlasse()",
    wirtModul: "wirt/editor.ts",
    wirtDateien: [
      {
        pfad: "src/admin/pages/site/store/slices/styleRule/types.ts",
        zeile: 106,
        rolle: "Vertrag der Zuweisungs-Aktionen: createClass(name) / addNodeClass(nodeId, classId) / removeNodeClass",
        aenderungen60d: 4,
        zuletzt: "2026-07-11",
      },
      {
        pfad: "src/admin/pages/site/store/slices/styleRule/assignmentActions.ts",
        zeile: 26,
        rolle: "Implementierung von addNodeClass / addNodeClasses",
        aenderungen60d: 2,
        zuletzt: "2026-06-13",
      },
      {
        pfad: "src/core/page-tree/classNames.ts",
        zeile: 53,
        rolle: "classNamesForClassIds — classId -> Klassenname (der Auflöser)",
        aenderungen60d: 2,
        zuletzt: "2026-06-02",
      },
      {
        pfad: "src/core/page-tree/baseNode.ts",
        zeile: 55,
        rolle: "Node-Schema: classIds + offenes props-Record",
        aenderungen60d: 5,
        zuletzt: "2026-06-13",
      },
    ],
    volatilitaet: "mittel",
    genutztAb: "H2",
    wennErBricht:
      "HARTE FEHLERMELDUNG beim Setzen. Fallback ist NICHT der Attribut-Weg (`data-og-id`) — der ist in H2 als Opt-in je Modul gemessen und traegt auf svg/video/list/outlet nachweislich nicht. Ohne Klassen-Weg gibt es keinen Anker, und das muss laut sein.",
    bruchArt: "fehler",
    pruefungen: ["bp02-klassen-aktionen", "bp02-klassennamen-aufloeser", "bp02-node-classids"],
  },
  {
    id: "BP-03",
    name: "Anker-Emission in den Output",
    wasErTut:
      "Die Anker-Klasse muss im gerenderten HTML ankommen — fuer JEDEN Node-Typ. Traegt: `injectNodeClassIds` wird in `renderNode.ts` BEDINGUNGSLOS aufgerufen. Der Kontrast steht direkt daneben: `injectNodeId` haengt an `config.annotateNodeIds` und traegt deshalb NICHT.",
    wirtSymbol: "ANKER_KLASSEN_PREFIX / ankerKlasse()",
    wirtModul: "wirt/anker-vertrag.ts",
    wirtDateien: [
      {
        pfad: "src/core/publisher/renderNode.ts",
        zeile: 196,
        rolle: "DER Vertrag: injectNodeClassIds(...) unbedingt je Node",
        aenderungen60d: 16,
        zuletzt: "2026-07-08",
      },
      {
        pfad: "src/core/publisher/classInjection.ts",
        zeile: 80,
        rolle: "injectNodeClassIds — injiziert die Klasse ins Wurzel-Tag des Modul-HTML",
        aenderungen60d: 5,
        zuletzt: "2026-07-08",
      },
      {
        pfad: "src/core/htmlAttributes/attributes.ts",
        zeile: 67,
        rolle: "ZWEITWEG data-og-id (Opt-in je Modul) — nur noch Rueckwaertskompatibilitaet",
        aenderungen60d: 3,
        zuletzt: "2026-07-25",
      },
    ],
    volatilitaet: "volatil",
    genutztAb: "H2",
    wennErBricht:
      "HARTE FEHLERMELDUNG. Wird der Aufruf bedingt (Flag, if, &&), verlieren beliebige Node-Typen still ihren Anker — die Animation bleibt einfach stehen, ohne Fehler. Fallback gibt es nicht: der Attribut-Weg deckt nur 5 von ~11 Modultypen. Reaktion: auf dem gepinnten Stand bleiben (E4) und das Upgrade als eigenes Haeppchen planen.",
    bruchArt: "fehler",
    pruefungen: [
      "bp03-injectclassids-unbedingt",
      "bp03-injectnodeid-bedingt-gegenprobe",
      "bp03-injectclassids-export",
      "bp03-dist-prefix",
    ],
  },
  {
    id: "BP-04",
    name: "Props-Durchreichung (unsere Keyframes ueberleben)",
    wasErTut:
      "Unsere Keyframe-Daten liegen als unbekannte Keys in `node.props`. `validateNodeProps` ist der einzige Ort, der Props gegen das Modul-Schema normalisiert — und er ERHAELT unbekannte Keys: der Fast-Path gibt `rawProps` unveraendert zurueck, der Slow-Path merged `{ ...rawProps, ...cleaned }`.",
    wirtSymbol: "GRAFIK_PROP_SCHLUESSEL / liesGrafikAusNode() / grafikPatch()",
    wirtModul: "wirt/editor.ts",
    wirtDateien: [
      {
        pfad: "src/core/module-engine/validateNodeProps.ts",
        zeile: 188,
        rolle: "DER Vertrag: jeder return gibt rawProps zurueck oder spreizt es",
        aenderungen60d: 2,
        zuletzt: "2026-06-11",
      },
      {
        pfad: "src/core/page-tree/baseNode.ts",
        zeile: 55,
        rolle: "props: Record<string, Unknown> — das offene Ablagefach",
        aenderungen60d: 5,
        zuletzt: "2026-06-13",
      },
    ],
    volatilitaet: "mittel",
    genutztAb: "H5",
    wennErBricht:
      "HARTE FEHLERMELDUNG. Wuerden unbekannte Keys verworfen, verschwaenden die Keyframes beim naechsten Render — still, und erst beim Publish sichtbar. Fallback waere eine eigene Ablage (SiteFile statt Node-Props); das ist ein Datenmodell-Wechsel und gehoert in ein eigenes Haeppchen, nicht in einen Laufzeit-Fallback.",
    bruchArt: "fehler",
    pruefungen: ["bp04-unbekannte-keys-ueberleben", "bp04-props-record-offen"],
  },
  {
    id: "BP-05",
    name: "Render-/Preview-Pfad ohne Publish",
    wasErTut:
      "Server-gerendertes HTML einer echten Seite, ohne die Publish-Wand (Step-Up-Auth, `server/handlers/cms/publish.ts:40`) zu beruehren. `POST /admin/api/cms/runtime/preview` ist ein duenner Mantel um dieselbe `publishPage()`; unsere Skripte rufen `publishPage()` direkt.",
    wirtSymbol: "rendereSeiteZuHtml()",
    wirtModul: "wirt/publish.ts",
    wirtDateien: [
      {
        pfad: "src/core/publisher/index.ts",
        zeile: 8,
        rolle: "export { publishPage }",
        aenderungen60d: 11,
        zuletzt: "2026-07-11",
      },
      {
        pfad: "src/core/publisher/render.ts",
        rolle: "publishPage — die volatilste Datei unter allen Beruehrungspunkten",
        aenderungen60d: 20,
        zuletzt: "2026-07-08",
      },
      {
        pfad: "server/publish/runtime/previewRuntime.ts",
        zeile: 88,
        rolle: "Beleg, dass die Preview-Route denselben publishPage()-Pfad nutzt",
        aenderungen60d: 4,
        zuletzt: "2026-07-28",
      },
      {
        pfad: "server/handlers/cms/runtime.ts",
        zeile: 134,
        rolle: "Route-String /admin/api/cms/runtime/preview",
        aenderungen60d: 6,
        zuletzt: "2026-06-11",
      },
    ],
    volatilitaet: "volatil",
    genutztAb: "H2",
    wennErBricht:
      "FALLBACK moeglich: bricht der Direktaufruf, bleibt die HTTP-Route (braucht dann eine Admin-Session, die derzeit fehlt); bricht die Route, bleibt der Direktaufruf. Bricht `publishPage` selbst, ist das ein Upgrade-Haeppchen — nicht reparierbar auf unserer Seite.",
    bruchArt: "fehler",
    pruefungen: ["bp05-publishpage-export", "bp05-preview-route", "bp05-preview-nutzt-publishpage"],
  },
  {
    id: "BP-06",
    name: "Auslieferung unserer Laufzeit als Site-Script",
    wasErTut:
      "Unser Bundle reist als `SiteFile { type: 'script' }` mit. Instatic setzt die Betriebsart selbst aus `DEFAULT_SCRIPT_RUNTIME_CONFIG` (enabled/runInCanvas/format=module/placement=body-end/timing=dom-ready) und buendelt mit `buildSiteRuntimeScripts`.",
    wirtSymbol: "laufzeitSiteFile() / baueLaufzeitScripts()",
    wirtModul: "wirt/publish.ts",
    wirtDateien: [
      {
        pfad: "src/core/files/schemas.ts",
        zeile: 24,
        rolle: "SiteFileType-Union enthaelt 'script'",
        aenderungen60d: 1,
        zuletzt: "2026-07-03",
      },
      {
        pfad: "src/core/site-runtime/runtimeConfig.ts",
        zeile: 44,
        rolle: "DEFAULT_SCRIPT_RUNTIME_CONFIG — die Betriebsart, die wir NICHT setzen und deshalb geschenkt bekommen",
        aenderungen60d: 3,
        zuletzt: "2026-06-26",
      },
      {
        pfad: "server/publish/runtime/bundleScripts.ts",
        zeile: 178,
        rolle: "buildSiteRuntimeScripts — esbuild-Bundling der Site-Scripts",
        aenderungen60d: 1,
        zuletzt: "2026-06-08",
      },
    ],
    volatilitaet: "mittel",
    genutztAb: "H3a",
    wennErBricht:
      "Ein geaenderter Default (z.B. `enabled: false` oder `timing: 'immediate'`) ist ein STILLER Bruch: die Seite rendert, unser Script laeuft nur nicht (oder zu frueh). Reaktion: die Betriebsart explizit in `site.runtime.scripts[fileId]` setzen statt sich auf den Default zu verlassen — das ist der eingebaute Fallback, `laufzeitSiteFile()` kann ihn mitliefern.",
    bruchArt: "fehler",
    pruefungen: ["bp06-sitefile-typ-script", "bp06-script-defaults", "bp06-bundler-export"],
  },
  {
    id: "BP-07",
    name: "Canvas-/DOM-Marker im Editor",
    wasErTut:
      "Vier Marker, ueber die eine Editor-Flaeche den Canvas, den richtigen Breakpoint-Frame und ein einzelnes gerendertes Element findet: `data-instatic-canvas-root`, `data-canvas-view`, `data-breakpoint-id` (auf dem <body> IM Iframe), `data-node-id`.",
    wirtSymbol: "CANVAS_MARKER + findeCanvasWurzel/findeBreakpointFrame/findeNodeElement",
    wirtModul: "wirt/canvas-dom.ts",
    wirtDateien: [
      {
        pfad: "src/admin/pages/site/canvas/CanvasRoot.tsx",
        zeile: 431,
        rolle: "emittiert data-instatic-canvas-root + data-canvas-view",
        aenderungen60d: 15,
        zuletzt: "2026-07-11",
      },
      {
        pfad: "src/admin/pages/site/canvas/iframeBodyReset.ts",
        zeile: 69,
        rolle: "setzt data-breakpoint-id auf den <body> IM Iframe",
        aenderungen60d: 2,
        zuletzt: "2026-07-11",
      },
      {
        pfad: "src/admin/pages/site/canvas/canvasNodeLookup.ts",
        zeile: 48,
        rolle: "die Referenz-Aufloesung [data-node-id=...] samt Iframe-Suche",
        aenderungen60d: 3,
        zuletzt: "2026-06-11",
      },
      {
        pfad: "src/admin/pages/site/canvas/IframeFrameSurface.tsx",
        zeile: 641,
        rolle: "srcDoc-Iframes (same-origin) — Grundlage der iframeQuelle aus H4",
        aenderungen60d: 19,
        zuletzt: "2026-07-11",
      },
    ],
    volatilitaet: "volatil",
    genutztAb: "H7 (noch ungenutzt — H4 hat die drei Welten im eigenen Harness nachgestellt)",
    wennErBricht:
      "FALLBACK, keine harte Fehlermeldung: verschwindet ein Marker, faellt die Editor-Flaeche auf 'kein Overlay / keine Live-Positionierung' zurueck und meldet es sichtbar EINMAL. Der Renderkern und der Schreibpfad haengen NICHT daran — nur die Bedienung. Genau dafuer ist E3 ('distanziert bei DOM und Geometrie') gemacht.",
    bruchArt: "fehler",
    pruefungen: ["bp07-marker-vorhanden"],
  },
  {
    id: "BP-08",
    name: "Plugin-SDK-Flaechen (Panel, Overlay, Host-Hooks)",
    wasErTut:
      "Die vier Flaechen, ueber die H7 seine Editor-UI montiert: `editor.panels.register`, `editor.canvas.registerOverlay`, und die Laufzeit-Hooks `useEditorStore` / `useCanvasNodeRect` aus `@instatic/host-hooks`.",
    wirtSymbol: "PLUGIN_SDK_FLAECHEN + montiereEditorFlaechen()",
    wirtModul: "wirt/plugin-sdk.ts",
    wirtDateien: [
      {
        pfad: "src/core/plugin-sdk/types/editorApi.ts",
        zeile: 41,
        rolle: "Vertrag: panels.register + canvas.registerOverlay",
        aenderungen60d: 0,
        zuletzt: "2026-05-21",
      },
      {
        pfad: "src/core/plugin-sdk/types/canvasOverlays.ts",
        zeile: 22,
        rolle: "PluginCanvasOverlay — Form des Overlays",
        aenderungen60d: 0,
        zuletzt: "2026-05-21",
      },
      {
        pfad: "public/runtime/host-hooks.js",
        rolle: "Import-Map-Shim: useEditorStore, useCanvasNodeRect, useCanvasViewport",
        aenderungen60d: 2,
        zuletzt: "2026-06-10",
      },
      {
        pfad: "src/admin/plugin-host-hooks/index.ts",
        zeile: 188,
        rolle: "useCanvasNodeRect-Implementierung (Iframe-Koordinaten -> Editor-Koordinaten)",
        aenderungen60d: 4,
        zuletzt: "2026-06-10",
      },
      {
        pfad: "src/core/plugins/runtime.ts",
        zeile: 479,
        rolle: "Implementierung von panels.register / canvas.registerOverlay (permission-gated)",
        aenderungen60d: 5,
        zuletzt: "2026-06-11",
      },
    ],
    volatilitaet: "mittel",
    genutztAb: "H7 (noch ungenutzt — Plugin-Installation verlangt Leons Step-Up-Klick, s. Plan §7)",
    wennErBricht:
      "FALLBACK: faellt `useCanvasNodeRect` weg, positioniert das Overlay ueber BP-07 selbst; faellt `registerOverlay` weg, bleibt das Panel (Keyframes ohne Overlay bedienbar). Faellt `panels.register` weg, ist H7 blockiert — das ist dann ein Upgrade-Haeppchen. `@instatic/host-ui` ist die EINZIGE Flaeche, die direkt importiert werden darf (E3).",
    bruchArt: "fehler",
    pruefungen: ["bp08-editorapi-vertrag", "bp08-overlay-typ", "bp08-host-hooks-exports", "bp08-runtime-impl"],
  },
  {
    id: "BP-09",
    name: "Lesender Zugriff auf den Instatic-Stand (DB + Parser)",
    wasErTut:
      "Liest Site-Shell und Seiten aus `.tmp/dev.db`, weil die HTTP-Route eine Admin-Session braucht (Login-Wand). Beruehrt DREI Vertraege auf einmal: das SQLite-Schema (`site`, `data_tables`, `data_rows`), `validateSite` und `pageFromRow`.",
    wirtSymbol: "leseInstaticStand() / alsSiteDocument()",
    wirtModul: "wirt/daten.ts",
    wirtDateien: [
      {
        pfad: "src/core/persistence/validate.ts",
        rolle: "validateSite — Shell-Parser",
        aenderungen60d: 11,
        zuletzt: "2026-06-13",
      },
      {
        pfad: "src/core/data/pageFromRow.ts",
        rolle: "pageFromRow — Datenzeile -> Page",
        aenderungen60d: 1,
        zuletzt: "2026-06-04",
      },
    ],
    volatilitaet: "volatil",
    genutztAb: "H2",
    wennErBricht:
      "FALLBACK: der HTTP-Weg (`/admin/api/cms/runtime/preview`) liefert dasselbe, sobald eine Admin-Session da ist. Der DB-Weg ist ein Messwerkzeug, kein Produktpfad — er darf brechen, ohne dass das Plugin betroffen ist. NIE schreibend oeffnen (die Datei wird ausdruecklich readonly geoeffnet).",
    bruchArt: "warnung",
    pruefungen: ["bp09-parser-exporte"],
  },
];

/** Zusatzpruefungen, die zu keinem einzelnen Beruehrungspunkt gehoeren. */
export const QUERPRUEFUNGEN = [
  {
    id: "pin-stand",
    name: "Gepinnter Stand == Klon",
    beschreibung:
      "instatic-pin.json (Version + Commit) muss zum ausgecheckten Klon passen. Sonst prueft die Suite einen anderen Wirt als den, gegen den wir gebaut haben.",
    bruchArt: "fehler" as Bruchart,
  },
  {
    id: "htmlattr-modulmenge",
    name: "htmlAttributesAttr — die bekannten 5 Module",
    beschreibung:
      "H2 hat gemessen: nur button/container/image/link/text emittieren `data-og-id`. Eine Abweichung ist fuer uns keine Gefahr (der Zweitweg ist nicht tragend), aber ein Signal, dass sich der Attribut-Vertrag bewegt — deshalb WARNUNG, nicht Fehler.",
    bruchArt: "warnung" as Bruchart,
  },
  {
    id: "dist-aktuell",
    name: "Ausgeliefertes Bundle == kern/",
    beschreibung:
      "Baut kern/runtime.ts im Speicher neu und vergleicht mit dist/. Kein Wirt-Vertrag, aber derselbe Fehlermodus: eine Aenderung, die an anderer Stelle still nicht ankommt.",
    bruchArt: "warnung" as Bruchart,
  },
  {
    id: "import-gate",
    name: "Kein Instatic-Import ausserhalb von wirt/",
    beschreibung:
      "Das Grep-Gate aus dem Plan: kein `@instatic/`- oder `../instatic/`-Import ausserhalb von wirt/. Ausnahme: `@instatic/host-ui` (E3).",
    bruchArt: "fehler" as Bruchart,
  },
];

/** Alle Wirt-Dateien, ueber alle Beruehrungspunkte, ohne Doppelte. */
export function alleWirtDateien(): WirtDatei[] {
  const gesehen = new Set<string>();
  const raus: WirtDatei[] = [];
  for (const v of VERTRAEGE) {
    for (const d of v.wirtDateien) {
      if (gesehen.has(d.pfad)) continue;
      gesehen.add(d.pfad);
      raus.push(d);
    }
  }
  return raus;
}
