/*
 * riverSnapshot.ts – Daten-Vertrag + reine Hilfsfunktionen für den
 * SELBSTTRAGENDEN Fluss-Snapshot (behebt den Export-Bug: der alte Export
 * enthielt NUR Rohknoten (RiverNode[]), keine fertige Geometrie/Farben —
 * ein Empfänger ohne denselben riverPath.ts/river.config.json-Stand sah
 * einen anderen Fluss). Kein DOM-Zugriff, kein React — nur Typen/Parsing/
 * String-Bau, damit RiverKursEditor.tsx (UI), RiverFlow.tsx (Publisher) und
 * RiverSnapshotSvg.tsx (portabler Renderer) dieselbe Quelle nutzen statt
 * Kopien zu pflegen.
 *
 * WARUM „selbsttragend": centerD/bankD/sandD/kontur/waves sind bereits
 * AUFGELÖSTE SVG-Pfade (keine Knoten, keine Config nötig) und farben sind
 * bereits AUFGELÖSTE Hex-/rgb-Werte (keine CSS-Variablen mehr) – ein
 * Empfänger ohne river.config.json/riverPath.ts kann daraus exakt denselben
 * Fluss-KÖRPER zeichnen. NICHT enthalten sind die Laufzeit-Partikel
 * (Schaumfront/Glitzer/Nebel) — die entstehen per JS/rAF (RiverWaves.tsx/
 * RiverFeatures.tsx) und sind konstruktionsbedingt kein statischer Pfad.
 */

import type { AnimEinstellungen } from "./RiverKursContext";
import type { RiverNode } from "./river-types";

/** Teilmenge von RiverGeometry (riverPath.ts), die für die 1:1-Reproduktion
 *  des Fluss-KÖRPERS reicht — bewusst OHNE featureTriggers/segments/
 *  waterfalls/nodes (das sind Bau-Zwischenstände bzw. Laufzeit-Trigger,
 *  kein Teil der gezeichneten Form). */
export interface FlussGeometrieSnapshot {
  centerD: string;
  bankD: string;
  sandD?: string;
  kontur?: { down: number[]; up: number[]; ys: number[] };
  waves: { a: string; b: string }[];
}

/** Aufgelöste CSS-Farbwerte: Key = CSS-Variablenname (z. B. "--water-800"),
 *  Wert = der von getComputedStyle aufgelöste Hex-/rgb-String. */
export type FlussFarben = Record<string, string>;

/** Alle CSS-Variablen, die ein Snapshot einfriert: Wellen dunkel→hell
 *  (--water-900..300, 900/800 = Basis-Fill/Tiefe), Sandufer (--bank-500/
 *  -400) und der innere Wasser-Schatten-Stroke (--green-900). Reihenfolge
 *  bewusst wie in app/design-tokens.css. */
export const FARBEN_TOKEN_KEYS = [
  "--water-900",
  "--water-800",
  "--water-700",
  "--water-600",
  "--water-500",
  "--water-400",
  "--water-300",
  "--bank-500",
  "--bank-400",
  "--green-900",
] as const;

/** Wellenfarben in Zeichenreihenfolge (dunkel unten/hinten → hell oben/vorn),
 *  exakt WAVE_COLOR_TOKENS aus RiverWaves.tsx — hier dupliziert (als reine
 *  Farb-KEYS statt CSS-var()-Strings), weil dieses Modul KEIN CSS/DOM kennen
 *  darf und die aufgelösten Hex-Werte selbst nachschlägt. */
const WELLEN_FARB_KEYS = ["--water-700", "--water-600", "--water-500", "--water-400", "--water-300"];

/** Ein gespeicherter/exportierter Fluss-Verlauf. Nur `nodes` ist zwingend —
 *  ältere Verläufe ohne meta/geometrie/farben (vor diesem Fix) bleiben damit
 *  weiter ladbar (siehe istImportierterVerlauf für den noch toleranteren
 *  Re-Import-Fall). */
export interface FlussVerlauf {
  schema?: "wee-fluss-snapshot";
  version?: number;
  name: string;
  gespeichert: string;
  meta: {
    viewportW: number;
    viewportH: number;
    zoneHDesign: number;
    designWidth?: number;
  };
  nodes: RiverNode[];
  anim?: AnimEinstellungen;
  /** Eingefrorene Geometrie — der 1:1-Garant. Fehlt bei Verläufen, die vor
   *  diesem Fix gespeichert wurden. */
  geometrie?: FlussGeometrieSnapshot;
  /** Eingefrorene, bereits aufgelöste Farben (kein CSS mehr nötig). */
  farben?: FlussFarben;
}

/** Minimal-Form für den Re-Import: nur was der Editor tatsächlich braucht,
 *  um den Fluss sofort wieder live zu zeigen (nodes+anim). Absichtlich
 *  toleranter als FlussVerlauf — lässt auch Dateien ohne meta/geometrie/
 *  farben zu (z. B. sehr alte Exporte oder von Hand gekürzte Dateien). */
export interface ImportierterVerlauf {
  name?: string;
  nodes: RiverNode[];
  anim?: Partial<AnimEinstellungen>;
}

function istRiverNode(v: unknown): v is RiverNode {
  if (typeof v !== "object" || v === null) return false;
  const n = v as Record<string, unknown>;
  return typeof n.x === "number" && typeof n.y === "number" && typeof n.breite === "number";
}

/** Prüft, ob ein unbekannter JSON-Wert genug Struktur für den Re-Import hat
 *  (mind. ein nicht-leeres, gültiges nodes-Array). Wird sowohl auf den
 *  Datei-Wurzelwert (Einzel-Snapshot) als auch auf jeden Wert einer
 *  Verlaufs-Map ("Export JSON (alle)") angewendet. */
export function istImportierterVerlauf(v: unknown): v is ImportierterVerlauf {
  if (typeof v !== "object" || v === null) return false;
  const kandidat = v as Record<string, unknown>;
  return (
    Array.isArray(kandidat.nodes) && kandidat.nodes.length > 0 && kandidat.nodes.every(istRiverNode)
  );
}

const FARBE_FALLBACK = "#4395A7";

/** Liest eine aufgelöste Farbe, mit Fallback für fehlende Keys (ältere
 *  Snapshots ohne farben-Feld, oder ein einzelner fehlender Key). */
export function leseFarbe(farben: FlussFarben | null | undefined, key: string): string {
  return farben?.[key] ?? FARBE_FALLBACK;
}

/** Baut den vollständigen `<svg>`-String des Fluss-KÖRPERS (Sandufer +
 *  Wasserfläche + Wellen-Startframe „a") aus eingefrorener Geometrie +
 *  Farben — für den Download-Export ("Als SVG exportieren"). Reine
 *  String-Konkatenation ohne Escaping: sicher, weil sowohl die Pfad-Strings
 *  (nur Ziffern/Befehlsbuchstaben aus riverPath.ts) als auch die Farbwerte
 *  (aus getComputedStyle unserer eigenen design-tokens.css) keine
 *  Nutzereingabe enthalten.
 *
 *  EHRLICH: das ist NUR der Fluss-KÖRPER. Schaumfront/Glitzer/Nebel sind
 *  Laufzeit-Partikel (JS/rAF, RiverWaves.tsx/RiverFeatures.tsx) und
 *  konstruktionsbedingt NICHT Teil eines statischen SVG-Exports. */
export function buildSnapshotSvgMarkup(
  geometrie: FlussGeometrieSnapshot,
  farben: FlussFarben,
  designWidth: number,
  zoneHDesign: number,
): string {
  const sand = geometrie.sandD
    ? `<path d="${geometrie.sandD}" fill="${leseFarbe(farben, "--bank-500")}" />`
    : "";
  const wasser = `<path d="${geometrie.bankD}" fill="${leseFarbe(farben, "--water-800")}" />`;
  const wellen = geometrie.waves
    .map((w, i) => {
      const farbe = leseFarbe(farben, WELLEN_FARB_KEYS[Math.min(i, WELLEN_FARB_KEYS.length - 1)]);
      return `<path d="${w.a}" fill="${farbe}" />`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${designWidth} ${zoneHDesign}" ` +
    `preserveAspectRatio="xMidYMin meet" role="img" aria-label="Fluss (eingefrorener Stand)">` +
    `${sand}${wasser}${wellen}</svg>`
  );
}
