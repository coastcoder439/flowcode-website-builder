/*
 * wirt-checks.mjs — die einzelnen Vertragspruefungen der Wirt-Smoke-Suite (H6).
 *
 * Eine Funktion je Check-Id aus wirt/vertraege.ts. Jede gibt zurueck:
 *   { status: 'OK' | 'ABWEICHUNG' | 'WARNUNG' | 'UNGEPRUEFT', detail, fundstelle? }
 *
 * Grundsatz (aus dem Verifikations-Protokoll, §1.2): kein stilles Weglassen.
 * Ist eine Datei nicht lesbar, ist der Check UNGEPRUEFT mit Grund — nie
 * heimlich OK und nie heimlich rot.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import {
  ts,
  KLON,
  PLUGIN_WURZEL,
  quelle,
  suche,
  suchEines,
  zeileVon,
  nameVon,
  aufrufe,
  bedingungAufDemWeg,
  umschliessendeFunktion,
  returnsVor,
  exportiert,
  eigenschaft,
  konstanteInitialisierer,
  literalWert,
  literalVorhanden,
  importQuellen,
} from "./ts-ast.mjs";
import { ERWARTETE_SCRIPT_BETRIEBSART, PREVIEW_ROUTE } from "../../wirt/publish-vertrag.ts";
import { ANKER_KLASSEN_PREFIX } from "../../wirt/anker-vertrag.ts";
import { CANVAS_MARKER } from "../../wirt/canvas-dom.ts";
import { BENOETIGTE_HOST_HOOKS } from "../../wirt/plugin-sdk.ts";
import { ERLAUBTE_DIREKT_FLAECHE } from "../../wirt/vertraege.ts";

const require_ = createRequire(import.meta.url);

const ok = (detail, fundstelle) => ({ status: "OK", detail, fundstelle });
const ab = (detail, fundstelle) => ({ status: "ABWEICHUNG", detail, fundstelle });
const warn = (detail, fundstelle) => ({ status: "WARNUNG", detail, fundstelle });
const unklar = (detail) => ({ status: "UNGEPRUEFT", detail });

/** Datei im Klon oeffnen — fehlt sie, ist der Check UNGEPRUEFT, nicht rot. */
function klonQuelle(relPfad) {
  const p = resolve(KLON, relPfad);
  if (!existsSync(p)) return { fehler: `Wirt-Datei fehlt: ${relPfad}` };
  try {
    return { sf: quelle(p), pfad: relPfad };
  } catch (f) {
    return { fehler: `${relPfad} nicht parsebar: ${f instanceof Error ? f.message : String(f)}` };
  }
}

const fund = (relPfad, sf, node) => `${relPfad}:${zeileVon(sf, node)}`;

/* ===========================================================================
 * BP-01 — Schreibpfad
 * ========================================================================= */

export function bp01ActionVorhanden() {
  const q = klonQuelle("src/admin/pages/site/store/slices/site/nodeActions.ts");
  if (q.fehler) return unklar(q.fehler);
  /* Die AKTION, nicht der gleichnamige Import aus page-tree/mutations: gesucht
     ist eine Objekt-Eigenschaft mit Funktionswert. */
  const treffer = suchEines(
    q.sf,
    (n) =>
      (ts.isPropertyAssignment(n) || ts.isMethodDeclaration(n)) &&
      nameVon(n) === "updateNodeProps" &&
      (ts.isMethodDeclaration(n) ||
        (n.initializer && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)))),
  );
  if (!treffer) {
    return ab(
      "Store-Aktion `updateNodeProps` nicht mehr als Funktion im Slice gefunden. " +
        "NICHT auf transaction/setState ausweichen (H1: persistiert nicht).",
    );
  }
  const params = (ts.isMethodDeclaration(treffer) ? treffer : treffer.initializer).parameters;
  if (params.length < 2) {
    return ab(`updateNodeProps hat nur ${params.length} Parameter — erwartet (nodeId, patch).`, fund(q.pfad, q.sf, treffer));
  }
  return ok(`updateNodeProps(${params.map((p) => p.name.getText(q.sf)).join(", ")}) vorhanden`, fund(q.pfad, q.sf, treffer));
}

export function bp01StoreExport() {
  const q = klonQuelle("src/admin/pages/site/store/store.ts");
  if (q.fehler) return unklar(q.fehler);
  return exportiert(q.sf, "useEditorStore")
    ? ok("useEditorStore wird exportiert")
    : ab("useEditorStore wird von store.ts nicht mehr exportiert.");
}

export function bp01PluginStoreRead() {
  const q = klonQuelle("src/core/plugins/runtime.ts");
  if (q.fehler) return unklar(q.fehler);
  const storeObj = suchEises(q.sf);
  if (!storeObj) return ab("Kein `store: { … }`-Block mit `read` in der Plugin-Editor-API gefunden.");
  const hatTransaction = eigenschaft(storeObj, "transaction") !== null;
  return ok(
    `editor.store.read vorhanden${hatTransaction ? "; transaction ebenfalls (bleibt VERBOTEN, s. H1)" : "; transaction ist weg — unser Verbot wird gegenstandslos"}`,
    fund(q.pfad, q.sf, storeObj),
  );

  function suchEises(sf) {
    for (const p of suche(sf, (n) => ts.isPropertyAssignment(n) && nameVon(n) === "store")) {
      const init = p.initializer;
      if (init && ts.isObjectLiteralExpression(init) && eigenschaft(init, "read")) return init;
    }
    return null;
  }
}

/* ===========================================================================
 * BP-02 — Anker-Klasse vergeben
 * ========================================================================= */

export function bp02KlassenAktionen() {
  const q = klonQuelle("src/admin/pages/site/store/slices/styleRule/types.ts");
  if (q.fehler) return unklar(q.fehler);
  const noetig = ["createClass", "addNodeClass", "removeNodeClass"];
  const da = new Set(
    suche(q.sf, (n) => ts.isMethodSignature(n) || ts.isPropertySignature(n)).map(nameVon).filter(Boolean),
  );
  const fehlend = noetig.filter((n) => !da.has(n));
  return fehlend.length === 0
    ? ok(`${noetig.join(", ")} im Store-Vertrag`)
    : ab(`Store-Aktionen fehlen: ${fehlend.join(", ")} — Anker sind nicht mehr setzbar.`);
}

export function bp02KlassennamenAufloeser() {
  const q = klonQuelle("src/core/page-tree/classNames.ts");
  if (q.fehler) return unklar(q.fehler);
  const fn = suchEines(q.sf, (n) => ts.isFunctionDeclaration(n) && nameVon(n) === "classNamesForClassIds");
  if (!fn || !exportiert(q.sf, "classNamesForClassIds")) {
    return ab("classNamesForClassIds nicht mehr exportiert — classIds werden nicht mehr zu Klassennamen aufgeloest.");
  }
  return fn.parameters.length >= 2
    ? ok(`classNamesForClassIds/${fn.parameters.length}`, fund(q.pfad, q.sf, fn))
    : ab(`classNamesForClassIds hat ${fn.parameters.length} Parameter — erwartet (styleRules, classIds).`);
}

export function bp02NodeClassIds() {
  const q = klonQuelle("src/core/page-tree/baseNode.ts");
  if (q.fehler) return unklar(q.fehler);
  const p = suchEines(q.sf, (n) => ts.isPropertyAssignment(n) && nameVon(n) === "classIds");
  return p
    ? ok("Node-Schema traegt classIds", fund(q.pfad, q.sf, p))
    : ab("Node-Schema hat kein `classIds` mehr — der Klassen-Anker haette keinen Traeger.");
}

/* ===========================================================================
 * BP-03 — Anker-Emission (DER wichtigste Check)
 * ========================================================================= */

/** Erwartete Zahl frueher `return`s vor dem Aufruf: genau einer, die
 *  dokumentierte base.body-Ausnahme ("base.body has no wrapper element"). */
const BP03_ERWARTETE_GUARDS = 1;

export function bp03InjectClassIdsUnbedingt() {
  const q = klonQuelle("src/core/publisher/renderNode.ts");
  if (q.fehler) return unklar(q.fehler);
  const rufe = aufrufe(q.sf, "injectNodeClassIds");
  if (rufe.length === 0) {
    return ab(
      "injectNodeClassIds wird in renderNode.ts NICHT mehr aufgerufen — die Anker-Klasse kaeme nicht mehr im HTML an. " +
        "Kein Fallback: der Attribut-Weg deckt nur 5 von ~11 Modultypen (H2).",
    );
  }
  const aufruf = rufe[0];
  const grund = bedingungAufDemWeg(aufruf);
  if (grund) {
    return ab(
      `injectNodeClassIds haengt jetzt an einer Bedingung (${grund}) — genau der Fehlermodus, den ` +
        "injectNodeId nebenan zeigt. Beliebige Node-Typen verlieren still ihren Anker.",
      fund(q.pfad, q.sf, aufruf),
    );
  }
  /* Ergebnis darf nicht verworfen werden. */
  const p = aufruf.parent;
  const verwendet =
    ts.isVariableDeclaration(p) || ts.isReturnStatement(p) || ts.isCallExpression(p) || ts.isBinaryExpression(p);
  if (!verwendet) {
    return ab("Rueckgabe von injectNodeClassIds wird verworfen — die Klasse landet nicht im Output.", fund(q.pfad, q.sf, aufruf));
  }
  const fn = umschliessendeFunktion(aufruf);
  const guards = returnsVor(fn, aufruf);
  if (guards !== BP03_ERWARTETE_GUARDS) {
    return warn(
      `Aufruf ist unbedingt, aber die Zahl frueher Ausstiege davor hat sich geaendert ` +
        `(${guards} statt ${BP03_ERWARTETE_GUARDS}). Bekannt und in Ordnung ist genau einer: die ` +
        "dokumentierte base.body-Ausnahme. Ein zusaetzlicher Ausstieg verengt den Vertrag still — nachsehen.",
      fund(q.pfad, q.sf, aufruf),
    );
  }
  return ok(
    `injectNodeClassIds wird UNBEDINGT je Node aufgerufen (${guards} bekannter frueher Ausstieg: base.body)`,
    fund(q.pfad, q.sf, aufruf),
  );
}

/**
 * Positiv-Kontrolle: `injectNodeId` MUSS als bedingt erkannt werden. Schlaegt
 * das fehl, ist nicht der Wirt kaputt, sondern unser Detektor blind — und dann
 * ist auch das gruene Ergebnis der Hauptpruefung wertlos.
 */
export function bp03InjectNodeIdGegenprobe() {
  const q = klonQuelle("src/core/publisher/renderNode.ts");
  if (q.fehler) return unklar(q.fehler);
  const rufe = aufrufe(q.sf, "injectNodeId");
  if (rufe.length === 0) return warn("injectNodeId gibt es nicht mehr — die Gegenprobe fuer den Detektor entfaellt.");
  const grund = bedingungAufDemWeg(rufe[0]);
  return grund
    ? ok(`Detektor unterscheidet: injectNodeId ist bedingt (${grund})`, fund(q.pfad, q.sf, rufe[0]))
    : warn(
        "injectNodeId wird als UNBEDINGT gemeldet. Entweder haengt es nicht mehr an config.annotateNodeIds " +
          "— oder unser Bedingungs-Detektor ist blind. Bis das geklaert ist, traegt auch bp03-injectclassids-unbedingt nicht.",
        fund(q.pfad, q.sf, rufe[0]),
      );
}

export function bp03InjectClassIdsExport() {
  const q = klonQuelle("src/core/publisher/classInjection.ts");
  if (q.fehler) return unklar(q.fehler);
  return exportiert(q.sf, "injectNodeClassIds")
    ? ok("injectNodeClassIds wird exportiert")
    : ab("classInjection.ts exportiert injectNodeClassIds nicht mehr.");
}

/*
 * Unser eigenes Artefakt: das ausgelieferte Bundle muss denselben Anker-Praefix
 * tragen wie der Vertrag.
 *
 * Diese Pruefung ist der einzige Check der Suite, der NICHT den Wirt betrifft —
 * sie steht trotzdem hier, weil sie denselben Fehlermodus abfaengt: eine
 * Aenderung an EINER Stelle, die an einer ANDEREN still nicht ankommt. Wer
 * `ANKER_KLASSEN_PREFIX` aendert und dist/ nicht neu baut, hat eine Laufzeit,
 * die nach der alten Klasse sucht, waehrend der Editor die neue schreibt —
 * und nichts bewegt sich, ohne dass irgendwo ein Fehler stuende.
 */
export function bp03DistPraefix() {
  const p = join(PLUGIN_WURZEL, "dist/fcank-runtime.js");
  if (!existsSync(p)) return unklar("dist/fcank-runtime.js nicht gebaut — nichts zu vergleichen.");
  const inhalt = readFileSync(p, "utf8");
  return inhalt.includes(ANKER_KLASSEN_PREFIX)
    ? ok(`gebautes Bundle traegt den Anker-Praefix "${ANKER_KLASSEN_PREFIX}"`)
    : ab(
        `dist/fcank-runtime.js enthaelt "${ANKER_KLASSEN_PREFIX}" nicht — Vertrag und gebautes Bundle sind auseinander. ` +
          "Bundle neu bauen (scripts/build-runtime.mjs).",
      );
}

/* ===========================================================================
 * BP-04 — Props-Durchreichung
 * ========================================================================= */

export function bp04UnbekannteKeysUeberleben() {
  const q = klonQuelle("src/core/module-engine/validateNodeProps.ts");
  if (q.fehler) return unklar(q.fehler);
  const fn = suchEines(q.sf, (n) => ts.isFunctionDeclaration(n) && nameVon(n) === "validateNodeProps");
  if (!fn?.body) return ab("validateNodeProps nicht mehr gefunden — die Keyframe-Ablage haette keinen Vertrag.");

  const returns = suche(fn.body, (n) => ts.isReturnStatement(n) && n.expression);
  if (returns.length === 0) return ab("validateNodeProps hat keine Rueckgabe mehr.", fund(q.pfad, q.sf, fn));

  /* Rename-robust: NICHT nach "rawProps" suchen, sondern fragen, ob es
     IRGENDEINEN Parameter gibt, den JEDE Rueckgabe unveraendert weiterreicht
     (direkt oder als Spread). Genau das IST der Vertrag. */
  for (const param of fn.parameters) {
    if (!ts.isIdentifier(param.name)) continue;
    const name = param.name.text;
    const alleErhalten = returns.every((r) => {
      const e = r.expression;
      if (ts.isIdentifier(e)) return e.text === name;
      if (ts.isObjectLiteralExpression(e)) {
        return e.properties.some(
          (p) => ts.isSpreadAssignment(p) && ts.isIdentifier(p.expression) && p.expression.text === name,
        );
      }
      return false;
    });
    if (alleErhalten) {
      return ok(
        `alle ${returns.length} Rueckgaben reichen Parameter "${name}" durch (direkt oder per Spread) — unbekannte Keys ueberleben`,
        fund(q.pfad, q.sf, fn),
      );
    }
  }
  return ab(
    `Kein Parameter wird mehr von ALLEN ${returns.length} Rueckgaben durchgereicht. ` +
      "Unbekannte Keys werden verworfen -> unsere Keyframes verschwinden beim naechsten Render, still.",
    fund(q.pfad, q.sf, fn),
  );
}

export function bp04PropsRecordOffen() {
  const q = klonQuelle("src/core/page-tree/baseNode.ts");
  if (q.fehler) return unklar(q.fehler);
  const props = suchEines(q.sf, (n) => ts.isPropertyAssignment(n) && nameVon(n) === "props");
  if (!props) return ab("baseNode hat kein `props`-Feld mehr.");
  const hatRecord = aufrufe(props, "Record").length > 0;
  const hatUnknown = aufrufe(props, "Unknown").length > 0;
  return hatRecord && hatUnknown
    ? ok("node.props ist weiterhin ein offenes Record<string, Unknown>", fund(q.pfad, q.sf, props))
    : ab(
        "node.props ist kein offenes Record<string, Unknown> mehr — fremde Keys haetten keinen Platz.",
        fund(q.pfad, q.sf, props),
      );
}

/* ===========================================================================
 * BP-05 — Render-/Preview-Pfad
 * ========================================================================= */

export function bp05PublishPageExport() {
  const q = klonQuelle("src/core/publisher/index.ts");
  if (q.fehler) return unklar(q.fehler);
  if (!exportiert(q.sf, "publishPage")) return ab("src/core/publisher/index.ts exportiert publishPage nicht mehr.");
  const r = klonQuelle("src/core/publisher/render.ts");
  if (r.fehler) return warn(`publishPage exportiert, render.ts aber nicht lesbar: ${r.fehler}`);
  const fn = suchEines(r.sf, (n) => ts.isFunctionDeclaration(n) && nameVon(n) === "publishPage");
  if (!fn) return warn("publishPage exportiert, aber in render.ts nicht als Funktion gefunden (umgezogen?).");
  return fn.parameters.length >= 3
    ? ok(`publishPage(${fn.parameters.map((p) => p.name.getText(r.sf)).join(", ")})`, fund(r.pfad, r.sf, fn))
    : ab(`publishPage hat ${fn.parameters.length} Parameter — erwartet mindestens (page, site, registry).`);
}

export function bp05PreviewRoute() {
  const q = klonQuelle("server/handlers/cms/runtime.ts");
  if (q.fehler) return unklar(q.fehler);
  /* Literal, nicht Kommentar: die Route steht in runtime.ts auch im Kopfkommentar. */
  return literalVorhanden(q.sf, PREVIEW_ROUTE)
    ? ok(`Route ${PREVIEW_ROUTE} als echtes Literal vorhanden`)
    : ab(`Route ${PREVIEW_ROUTE} ist als Literal weg — der HTTP-Fallback fuer BP-05 existiert nicht mehr.`);
}

export function bp05PreviewNutztPublishPage() {
  const q = klonQuelle("server/publish/runtime/previewRuntime.ts");
  if (q.fehler) return unklar(q.fehler);
  const rufe = aufrufe(q.sf, "publishPage");
  return rufe.length > 0
    ? ok("Preview-Route ruft nachweislich publishPage() — derselbe Render-Pfad wie unser Direktaufruf", fund(q.pfad, q.sf, rufe[0]))
    : ab(
        "previewRuntime ruft publishPage nicht mehr. Damit ist unsere Begruendung hinfaellig, " +
          "dass Direktaufruf und Preview denselben Pfad nehmen — die H2/H3a-Messungen muessten neu bewertet werden.",
      );
}

/* ===========================================================================
 * BP-06 — Site-Script-Auslieferung
 * ========================================================================= */

export function bp06SiteFileTypScript() {
  const q = klonQuelle("src/core/files/schemas.ts");
  if (q.fehler) return unklar(q.fehler);
  const init = konstanteInitialisierer(q.sf, "SiteFileTypeSchema");
  if (!init) return ab("SiteFileTypeSchema nicht mehr gefunden.");
  const hatScript = suche(init, (n) => ts.isStringLiteral(n) && n.text === "script").length > 0;
  return hatScript
    ? ok("SiteFileType enthaelt weiterhin 'script'", fund(q.pfad, q.sf, init))
    : ab("SiteFileType kennt 'script' nicht mehr — unsere Laufzeit haette keinen Transportweg.");
}

export function bp06ScriptDefaults() {
  const q = klonQuelle("src/core/site-runtime/runtimeConfig.ts");
  if (q.fehler) return unklar(q.fehler);
  const init = konstanteInitialisierer(q.sf, "DEFAULT_SCRIPT_RUNTIME_CONFIG");
  if (!init || !ts.isObjectLiteralExpression(init)) return ab("DEFAULT_SCRIPT_RUNTIME_CONFIG nicht mehr gefunden.");
  const abweichungen = [];
  for (const [feld, erwartet] of Object.entries(ERWARTETE_SCRIPT_BETRIEBSART)) {
    const p = eigenschaft(init, feld);
    const ist = p ? literalWert(p) : undefined;
    if (ist !== erwartet) abweichungen.push(`${feld}: ${JSON.stringify(ist)} statt ${JSON.stringify(erwartet)}`);
  }
  return abweichungen.length === 0
    ? ok("Script-Betriebsart unveraendert (enabled/runInCanvas/format/placement/timing)", fund(q.pfad, q.sf, init))
    : ab(
        `Script-Betriebsart geaendert: ${abweichungen.join("; ")}. STILLER Bruch — die Seite rendert weiter, ` +
          "unser Script laeuft nur nicht mehr (oder zu frueh). Fallback: Betriebsart explizit setzen " +
          "(laufzeitSiteFile(..., { betriebsartFestnageln: true })).",
        fund(q.pfad, q.sf, init),
      );
}

export function bp06BundlerExport() {
  const q = klonQuelle("server/publish/runtime/bundleScripts.ts");
  if (q.fehler) return unklar(q.fehler);
  return exportiert(q.sf, "buildSiteRuntimeScripts")
    ? ok("buildSiteRuntimeScripts wird exportiert")
    : ab("buildSiteRuntimeScripts ist weg — Site-Scripts werden anders gebuendelt.");
}

/* ===========================================================================
 * BP-07 — Canvas-/DOM-Marker
 * ========================================================================= */

const MARKER_ORTE = [
  { marker: CANVAS_MARKER.canvasWurzel, datei: "src/admin/pages/site/canvas/CanvasRoot.tsx" },
  { marker: CANVAS_MARKER.canvasAnsicht, datei: "src/admin/pages/site/canvas/CanvasRoot.tsx" },
  { marker: CANVAS_MARKER.breakpoint, datei: "src/admin/pages/site/canvas/iframeBodyReset.ts" },
  { marker: CANVAS_MARKER.breakpoint, datei: "src/admin/pages/site/canvas/BreakpointFrame.tsx" },
  { marker: CANVAS_MARKER.node, datei: "src/admin/pages/site/canvas/canvasNodeLookup.ts" },
];

export function bp07MarkerVorhanden() {
  const fehlend = [];
  const ungeprueft = [];
  for (const { marker, datei } of MARKER_ORTE) {
    const q = klonQuelle(datei);
    if (q.fehler) {
      ungeprueft.push(`${marker} in ${datei} (${q.fehler})`);
      continue;
    }
    /* Nur echte Literale/JSX-Attribute — Kommentare zaehlen NICHT. In
       IframeFrameSurface.tsx steht `data-breakpoint-id` viermal im Kommentar;
       eine String-Suche waere dort falsch-gruen. */
    if (!literalVorhanden(q.sf, marker)) fehlend.push(`${marker} in ${datei}`);
  }
  if (fehlend.length > 0) {
    return ab(
      `DOM-Marker weg: ${fehlend.join(", ")}. Fallback: Editor-Flaeche ohne Overlay/Live-Positionierung, ` +
        "sichtbar gemeldet (markerBericht()). Renderkern und Schreibpfad sind NICHT betroffen.",
    );
  }
  if (ungeprueft.length > 0) return unklar(`nicht pruefbar: ${ungeprueft.join(", ")}`);
  return ok(`alle ${MARKER_ORTE.length} Marker-Orte belegt (als Literal/JSX-Attribut, nicht als Kommentar)`);
}

/* ===========================================================================
 * BP-08 — Plugin-SDK-Flaechen
 * ========================================================================= */

export function bp08EditorApiVertrag() {
  const q = klonQuelle("src/core/plugin-sdk/types/editorApi.ts");
  if (q.fehler) return unklar(q.fehler);
  const noetig = [
    ["panels", "register"],
    ["canvas", "registerOverlay"],
    ["store", "read"],
  ];
  const fehlend = [];
  for (const [aussen, innen] of noetig) {
    const p = suchEines(q.sf, (n) => ts.isPropertySignature(n) && nameVon(n) === aussen);
    const drin = p?.type && ts.isTypeLiteralNode(p.type)
      ? p.type.members.some((m) => nameVon(m) === innen)
      : false;
    if (!drin) fehlend.push(`${aussen}.${innen}`);
  }
  return fehlend.length === 0
    ? ok("editor.panels.register / editor.canvas.registerOverlay / editor.store.read im SDK-Vertrag")
    : ab(`SDK-Vertrag fehlt: ${fehlend.join(", ")} — H7 waere davon betroffen.`);
}

export function bp08OverlayTyp() {
  const q = klonQuelle("src/core/plugin-sdk/types/canvasOverlays.ts");
  if (q.fehler) return unklar(q.fehler);
  const i = suchEines(q.sf, (n) => ts.isInterfaceDeclaration(n) && nameVon(n) === "PluginCanvasOverlay");
  if (!i) return ab("PluginCanvasOverlay nicht mehr deklariert.");
  const felder = i.members.map(nameVon);
  const fehlend = ["id", "component"].filter((f) => !felder.includes(f));
  return fehlend.length === 0
    ? ok("PluginCanvasOverlay { id, component }", fund(q.pfad, q.sf, i))
    : ab(`PluginCanvasOverlay fehlt: ${fehlend.join(", ")}`, fund(q.pfad, q.sf, i));
}

export function bp08HostHooksExports() {
  const berichte = [];
  for (const datei of ["public/runtime/host-hooks.js", "src/admin/plugin-host-hooks/index.ts"]) {
    const q = klonQuelle(datei);
    if (q.fehler) {
      berichte.push({ datei, fehlend: null, grund: q.fehler });
      continue;
    }
    const fehlend = BENOETIGTE_HOST_HOOKS.filter((h) => !exportiert(q.sf, h));
    berichte.push({ datei, fehlend });
  }
  const kaputt = berichte.filter((b) => b.fehlend?.length);
  if (kaputt.length > 0) {
    return ab(
      kaputt.map((b) => `${b.datei}: ${b.fehlend.join(", ")} fehlt`).join("; ") +
        ". Fallback: Overlay ueber BP-07 selbst positionieren.",
    );
  }
  const offen = berichte.filter((b) => b.fehlend === null);
  if (offen.length > 0) return unklar(offen.map((b) => b.grund).join("; "));
  return ok(`${BENOETIGTE_HOST_HOOKS.join(", ")} in Shim und Implementierung`);
}

export function bp08RuntimeImpl() {
  const q = klonQuelle("src/core/plugins/runtime.ts");
  if (q.fehler) return unklar(q.fehler);
  const namen = new Set(
    suche(q.sf, (n) => ts.isMethodDeclaration(n) || ts.isPropertyAssignment(n)).map(nameVon).filter(Boolean),
  );
  const fehlend = ["registerOverlay", "panels", "canvas"].filter((n) => !namen.has(n));
  return fehlend.length === 0
    ? ok("panels/canvas/registerOverlay in der Plugin-Laufzeit implementiert")
    : ab(`Plugin-Laufzeit: ${fehlend.join(", ")} nicht mehr gefunden.`);
}

/* ===========================================================================
 * BP-09 — Datenzugriff
 * ========================================================================= */

export function bp09ParserExporte() {
  const paare = [
    ["src/core/persistence/validate.ts", "validateSite"],
    ["src/core/data/pageFromRow.ts", "pageFromRow"],
  ];
  const fehlend = [];
  for (const [datei, name] of paare) {
    const q = klonQuelle(datei);
    if (q.fehler) return unklar(q.fehler);
    if (!exportiert(q.sf, name)) fehlend.push(`${name} (${datei})`);
  }
  return fehlend.length === 0
    ? ok("validateSite + pageFromRow exportiert")
    : warn(
        `${fehlend.join(", ")} weg. Nur das MESSWERKZEUG ist betroffen (DB-Lesepfad), nicht das Plugin. ` +
          "Fallback: HTTP-Route, sobald eine Admin-Session da ist.",
      );
}

/* ===========================================================================
 * Querpruefungen
 * ========================================================================= */

export function pinStand() {
  const pinPfad = resolve(PLUGIN_WURZEL, "../instatic-pin.json");
  if (!existsSync(pinPfad)) return unklar("instatic-pin.json nicht gefunden.");
  const pin = JSON.parse(readFileSync(pinPfad, "utf8"));
  const paket = JSON.parse(readFileSync(resolve(KLON, "package.json"), "utf8"));
  const probleme = [];
  if (paket.version !== pin.stand?.version) {
    probleme.push(`Version: Klon ${paket.version}, gepinnt ${pin.stand?.version}`);
  }
  let head = null;
  try {
    head = execFileSync("git", ["-C", KLON, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch (f) {
    probleme.push(`git rev-parse fehlgeschlagen: ${f instanceof Error ? f.message : String(f)}`);
  }
  if (head && pin.stand?.commit && !head.startsWith(pin.stand.commit)) {
    probleme.push(`Commit: Klon ${head.slice(0, 8)}, gepinnt ${pin.stand.commit}`);
  }
  return probleme.length === 0
    ? ok(`Klon == Pin (v${paket.version} @ ${String(head).slice(0, 8)})`)
    : ab(
        `${probleme.join("; ")}. Die Suite prueft dann einen ANDEREN Wirt als den, gegen den gebaut wurde — ` +
          "alle uebrigen Ergebnisse sind nur fuer diesen abweichenden Stand gueltig.",
      );
}

/**
 * Baut kern/runtime.ts IM SPEICHER neu und vergleicht mit dem ausgelieferten
 * dist/-Bundle. Beantwortet: "ist das, was wir ausliefern, noch das, was in
 * kern/ steht?"
 *
 * WARUM DAS HIER STEHT UND WARUM ES NUR WARNT
 * -------------------------------------------
 * In H6 ist der Anker-Vertrag aus kern/anker.ts nach wirt/anker-vertrag.ts
 * gewandert. Verhalten unveraendert — aber esbuild ordnet dadurch zwei
 * Deklarationen anders an und vergibt andere Kurznamen: das Bundle wird 4 Byte
 * groesser, obwohl es dasselbe tut. dist/ wurde BEWUSST NICHT neu gebaut,
 * weil an dem gebauten Bundle der Dateiname-Hash haengt, mit dem die
 * H3a-/H4-Belege ihre byteidentische Reproduktion belegen (heute nachgemessen:
 * derselbe Hash `fcank-runtime-NJ5ECR3D.js`). Ein Neubau dort waere eine
 * Verhaltens-neutrale Aenderung, die eine Beweiskette entwertet.
 *
 * Damit diese Drift nicht still bleibt, wird sie hier GEMESSEN und beziffert.
 * Sie gehoert in das Haeppchen, das die Laufzeit das naechste Mal wirklich
 * ausliefert (H3b/H7) — dann neu bauen und die Belege mit neuem Hash erneuern.
 */
const DIST_ERWARTETE_DRIFT_BYTES = 4;

export function distAktuell() {
  const dist = join(PLUGIN_WURZEL, "dist/fcank-runtime.js");
  if (!existsSync(dist)) return unklar("dist/fcank-runtime.js nicht gebaut.");
  let esbuild;
  try {
    esbuild = require_(resolve(KLON, "node_modules/esbuild/lib/main.js"));
  } catch (f) {
    return unklar(`esbuild nicht ladbar: ${f instanceof Error ? f.message : String(f)}`);
  }
  let neu;
  try {
    const r = esbuild.buildSync({
      entryPoints: [join(PLUGIN_WURZEL, "kern/runtime.ts")],
      outfile: join(PLUGIN_WURZEL, "dist/fcank-runtime.js"),
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2020",
      minify: true,
      legalComments: "none",
      logLevel: "silent",
    });
    neu = r.outputFiles.find((f) => f.path.endsWith(".js"))?.text ?? "";
  } catch (f) {
    return ab(`kern/ laesst sich nicht mehr buendeln: ${f instanceof Error ? f.message : String(f)}`);
  }
  const alt = readFileSync(dist, "utf8");
  if (neu === alt) return ok("dist/ ist auf dem Stand von kern/ (byteidentisch)");
  const delta = Math.abs(Buffer.byteLength(neu) - Buffer.byteLength(alt));
  return delta <= DIST_ERWARTETE_DRIFT_BYTES
    ? warn(
        `dist/ weicht um ${delta} Byte von kern/ ab — das ist die in H6 bewusst stehengelassene ` +
          "Minifier-Umordnung (Anker-Vertrag nach wirt/ gezogen). Neubau gehoert in das Haeppchen, " +
          "das die Laufzeit das naechste Mal ausliefert; dann auch die H3a/H4-Belege mit neuem Hash erneuern.",
      )
    : ab(
        `dist/ weicht um ${delta} Byte von kern/ ab — mehr als die bekannte Umordnung ` +
          `(${DIST_ERWARTETE_DRIFT_BYTES} Byte). Es wurde in kern/ geaendert, ohne neu zu bauen: ` +
          "die ausgelieferte Laufzeit ist nicht der Quelltext. `bun run scripts/build-runtime.mjs`.",
      );
}

/** H2 hat gemessen: genau diese 5 Module emittieren `data-og-id`. */
const ERWARTETE_HTMLATTR_MODULE = ["button", "container", "image", "link", "text"];

export function htmlattrModulmenge() {
  const basis = resolve(KLON, "src/modules/base");
  if (!existsSync(basis)) return unklar("src/modules/base nicht gefunden.");
  const gefunden = [];
  for (const eintrag of readdirSync(basis, { withFileTypes: true })) {
    if (!eintrag.isDirectory()) continue;
    const p = join(basis, eintrag.name, "index.ts");
    if (!existsSync(p)) continue;
    const sf = quelle(p);
    const nutzt = importQuellen(sf).length > 0 && aufrufe(sf, "htmlAttributesAttr").length > 0;
    if (nutzt) gefunden.push(eintrag.name);
  }
  gefunden.sort();
  const gleich =
    gefunden.length === ERWARTETE_HTMLATTR_MODULE.length &&
    gefunden.every((m, i) => m === ERWARTETE_HTMLATTR_MODULE[i]);
  return gleich
    ? ok(`Attribut-Zweitweg unveraendert: ${gefunden.join(", ")}`)
    : warn(
        `htmlAttributesAttr wird jetzt von [${gefunden.join(", ")}] emittiert statt von ` +
          `[${ERWARTETE_HTMLATTR_MODULE.join(", ")}]. Fuer uns keine Gefahr (der Zweitweg ist nicht tragend), ` +
          "aber ein Signal, dass der Attribut-Vertrag sich bewegt.",
      );
}

/*
 * Unser eigener Code ausserhalb von wirt/ darf Instatic-INTERNA nicht direkt
 * anfassen. Zwei Dinge werden dabei unterschieden, und der Unterschied ist
 * beim ersten Lauf dieser Pruefung aufgefallen:
 *
 *   (a) INTERNA  — `instatic/src/...`, `instatic/server/...`, `@instatic/...`.
 *       Das ist der Wirt. Ausserhalb von wirt/ ein Bruch der Kapselung.
 *
 *   (b) WERKZEUG — `instatic/node_modules/...`. Das ist NICHT Instatic,
 *       sondern eine Fremdbibliothek (Playwright), die wir uns aus der
 *       Installation des Klons leihen, statt sie ein zweites Mal zu
 *       installieren. Ein Instatic-Update kann sie umhaengen, aber es kann
 *       keinen Vertrag darin brechen — sie gehoert Instatic gar nicht.
 *       Deshalb WARNUNG statt Bruch: sichtbar bleiben soll es trotzdem, denn
 *       wenn der Klon seine Abhaengigkeiten aufraeumt, stehen unsere
 *       Messskripte ohne Browser da.
 *
 * Die Trennung wird ueber den Pfad gemacht, nicht ueber eine Ausnahmeliste mit
 * Dateinamen — sonst waere sie beim naechsten neuen Skript wieder falsch.
 */
const GATE_ORDNER = ["kern", "scripts"];
const INSTATIC_INTERNA = /(^|\/)instatic\/(src|server|public|scripts)\//;
const INSTATIC_WERKZEUG = /(^|\/)instatic\/node_modules\//;

export function importGate() {
  const interna = [];
  const werkzeug = [];
  const geprueft = [];
  for (const ordner of GATE_ORDNER) {
    const wurzel = join(PLUGIN_WURZEL, ordner);
    if (!existsSync(wurzel)) continue;
    for (const datei of dateienRekursiv(wurzel)) {
      geprueft.push(datei);
      const kurz = datei.slice(PLUGIN_WURZEL.length + 1);
      let sf;
      try {
        sf = quelle(datei);
      } catch (f) {
        interna.push({ datei: kurz, grund: `nicht parsebar: ${f instanceof Error ? f.message : String(f)}` });
        continue;
      }
      for (const { spezifizierer, zeile } of importQuellen(sf)) {
        if (spezifizierer === ERLAUBTE_DIREKT_FLAECHE) continue;
        if (INSTATIC_WERKZEUG.test(spezifizierer)) werkzeug.push({ datei: kurz, zeile, spezifizierer });
        else if (spezifizierer.startsWith("@instatic/") || INSTATIC_INTERNA.test(spezifizierer)) {
          interna.push({ datei: kurz, zeile, spezifizierer });
        }
      }
    }
  }
  const zeig = (liste) =>
    liste.map((v) => `${v.datei}${v.zeile ? `:${v.zeile}` : ""} -> ${v.spezifizierer ?? v.grund}`).join("; ");

  if (interna.length > 0) {
    return ab(
      `Instatic-Interna ausserhalb von wirt/: ${zeig(interna)}. Ausnahme ist NUR ${ERLAUBTE_DIREKT_FLAECHE} (E3).`,
    );
  }
  if (werkzeug.length > 0) {
    return warn(
      `${geprueft.length} Dateien geprueft, keine Instatic-Interna ausserhalb wirt/. ` +
        `Aber ${werkzeug.length} Fremdbibliothek(en) aus der Installation des Klons geliehen: ${zeig(werkzeug)}. ` +
        "Kein Vertragsbruch (gehoert Instatic nicht), aber die Messskripte haengen an dessen node_modules.",
    );
  }
  return ok(`${geprueft.length} Dateien in ${GATE_ORDNER.join("/, ")}/ — kein Instatic-Import ausserhalb wirt/`);
}

function dateienRekursiv(wurzel) {
  const raus = [];
  for (const e of readdirSync(wurzel, { withFileTypes: true })) {
    const p = join(wurzel, e.name);
    if (e.isDirectory()) raus.push(...dateienRekursiv(p));
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) raus.push(p);
  }
  return raus;
}

/** Check-Id -> Implementierung. */
export const CHECKS = {
  "bp01-action-vorhanden": bp01ActionVorhanden,
  "bp01-store-export": bp01StoreExport,
  "bp01-plugin-store-read": bp01PluginStoreRead,
  "bp02-klassen-aktionen": bp02KlassenAktionen,
  "bp02-klassennamen-aufloeser": bp02KlassennamenAufloeser,
  "bp02-node-classids": bp02NodeClassIds,
  "bp03-injectclassids-unbedingt": bp03InjectClassIdsUnbedingt,
  "bp03-injectnodeid-bedingt-gegenprobe": bp03InjectNodeIdGegenprobe,
  "bp03-injectclassids-export": bp03InjectClassIdsExport,
  "bp03-dist-prefix": bp03DistPraefix,
  "bp04-unbekannte-keys-ueberleben": bp04UnbekannteKeysUeberleben,
  "bp04-props-record-offen": bp04PropsRecordOffen,
  "bp05-publishpage-export": bp05PublishPageExport,
  "bp05-preview-route": bp05PreviewRoute,
  "bp05-preview-nutzt-publishpage": bp05PreviewNutztPublishPage,
  "bp06-sitefile-typ-script": bp06SiteFileTypScript,
  "bp06-script-defaults": bp06ScriptDefaults,
  "bp06-bundler-export": bp06BundlerExport,
  "bp07-marker-vorhanden": bp07MarkerVorhanden,
  "bp08-editorapi-vertrag": bp08EditorApiVertrag,
  "bp08-overlay-typ": bp08OverlayTyp,
  "bp08-host-hooks-exports": bp08HostHooksExports,
  "bp08-runtime-impl": bp08RuntimeImpl,
  "bp09-parser-exporte": bp09ParserExporte,
  "pin-stand": pinStand,
  "htmlattr-modulmenge": htmlattrModulmenge,
  "import-gate": importGate,
  "dist-aktuell": distAktuell,
};
