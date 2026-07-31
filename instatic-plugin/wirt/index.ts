/*
 * wirt/index.ts — Sammelstelle fuer die REALM-NEUTRALEN Teile der Wirt-Schicht.
 *
 * ============================================================================
 * WAS HIER BEWUSST FEHLT
 * ============================================================================
 * `wirt/publish.ts` (BP-05/BP-06) und `wirt/daten.ts` (BP-09) sind NICHT
 * re-exportiert. Sie importieren echten Instatic-Server-Code bzw. `bun:sqlite`;
 * ein Barrel, das sie mitzieht, wuerde beim Buendeln der Browser-Laufzeit den
 * halben Wirt-Server einsammeln. Wer sie braucht (Messskripte unter `bun`),
 * importiert sie direkt:
 *
 *     import { rendereSeiteZuHtml } from "../wirt/publish";
 *     import { leseInstaticStand }  from "../wirt/daten";
 *
 * ============================================================================
 * DIE REGEL
 * ============================================================================
 * Kein Teil unseres Codes ausserhalb von wirt/ fasst Instatic-Interna direkt
 * an. Einzige Ausnahme: `@instatic/host-ui` (Entscheidung E3 — die einzige
 * Flaeche mit einem eigenen Paritaets-Gate-Test der Plattform).
 * Durchgesetzt von scripts/70-wirt-smoke.mjs, Pruefung `import-gate`.
 */

/* BP-03 — Anker-Vertrag (import-frei, wird in die Laufzeit gebuendelt). */
export { ANKER_KLASSEN_PREFIX, ANKER_ATTRIBUT, ankerKlasse, ankerStyleRuleName } from "./anker-vertrag";

/* BP-01, BP-02, BP-04 — Editor-Realm. */
export {
  schreibeNodeProps,
  setzeAnkerKlasse,
  verboteneSchreibwege,
  GRAFIK_PROP_SCHLUESSEL,
  liesGrafikAusNode,
  grafikPatch,
  type WirtStore,
} from "./editor";

/* BP-07 — Canvas-/DOM-Marker. */
export {
  CANVAS_MARKER,
  findeCanvasWurzel,
  liesCanvasAnsicht,
  findeBreakpointFrame,
  findeNodeElement,
  markerBericht,
  type CanvasAnsicht,
} from "./canvas-dom";

/* BP-08 — Plugin-SDK-Flaechen. */
export {
  PLUGIN_SDK_FLAECHEN,
  HOST_MODULE,
  BENOETIGTE_HOST_HOOKS,
  montiereEditorFlaechen,
  holeEditorStore,
  type WirtPluginApi,
  type MontageErgebnis,
} from "./plugin-sdk";

/* Der Katalog — reine Daten, von der Smoke-Suite gelesen. */
export {
  VERTRAEGE,
  QUERPRUEFUNGEN,
  MESSBEFEHL,
  ERLAUBTE_DIREKT_FLAECHE,
  volatilitaetFuer,
  alleWirtDateien,
  type HostVertrag,
  type WirtDatei,
  type Volatilitaet,
} from "./vertraege";
