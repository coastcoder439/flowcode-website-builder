/*
 * RiverSnapshotSvg – portabler Fluss-Renderer, OHNE jede Abhängigkeit von
 * riverPath.ts/river.config.json/dem Landing-DOM. Bekommt exakt die
 * eingefrorene Geometrie + Farben eines Snapshots (siehe
 * RiverKursEditor.speichern() bzw. riverSnapshot.ts) und zeichnet daraus
 * den Fluss-KÖRPER (Sandufer + Wasserfläche + Wellen-Ausgangsframe „a").
 * Das ist der Baustein, der NUR die Datei braucht — kein Live-DOM, keine
 * Config, keine river-Engine.
 *
 * Kein Hook/State/Effect nötig → bewusst OHNE "use client": läuft als
 * gewöhnliche (auch serverseitig renderbare) Komponente und kann trotzdem
 * problemlos aus einer "use client"-Umgebung (z. B. RiverKursEditor)
 * heraus verwendet werden.
 *
 * EHRLICH: Laufzeit-Partikel (Schaumfront/Glitzer/Nebel) sind NICHT Teil
 * dieser Komponente — die entstehen im Original per JS/rAF (RiverWaves.tsx/
 * RiverFeatures.tsx) und werden hier bewusst nicht vorgetäuscht.
 */

import type { CSSProperties } from "react";
import { leseFarbe, type FlussFarben, type FlussGeometrieSnapshot } from "./riverSnapshot";

export interface RiverSnapshotSvgProps {
  geometrie: FlussGeometrieSnapshot;
  farben: FlussFarben;
  /** viewBox-Breite (Design-Einheiten). Default = RIVER_DESIGN_WIDTH_PX aus
   *  riverPath.ts (1200) — hier als Zahl dupliziert, damit diese Komponente
   *  ohne den Import auskommt (siehe Datei-Kopf). */
  designWidth?: number;
  /** viewBox-Höhe (Design-Einheiten, entspricht meta.zoneHDesign eines
   *  Snapshots). */
  zoneHDesign: number;
  className?: string;
  style?: CSSProperties;
}

/** Wellenfarben in Zeichenreihenfolge (dunkel unten/hinten → hell oben/vorn) —
 *  dieselbe Reihenfolge wie WAVE_COLOR_TOKENS in RiverWaves.tsx bzw.
 *  WELLEN_FARB_KEYS in riverSnapshot.ts. */
const WELLEN_FARB_KEYS = ["--water-700", "--water-600", "--water-500", "--water-400", "--water-300"];

/** Rendert den Fluss-KÖRPER rein aus eingefrorenen Pfad-Strings + Farben. */
export function RiverSnapshotSvg({
  geometrie,
  farben,
  designWidth = 1200,
  zoneHDesign,
  className,
  style,
}: RiverSnapshotSvgProps) {
  return (
    <svg
      className={className}
      style={style}
      viewBox={`0 0 ${designWidth} ${zoneHDesign}`}
      preserveAspectRatio="xMidYMin meet"
      role="img"
      aria-label="Fluss (eingefrorener Stand)"
    >
      {geometrie.sandD && <path d={geometrie.sandD} fill={leseFarbe(farben, "--bank-500")} />}
      <path d={geometrie.bankD} fill={leseFarbe(farben, "--water-800")} />
      {geometrie.waves.map((w, i) => (
        <path
          key={i}
          d={w.a}
          fill={leseFarbe(farben, WELLEN_FARB_KEYS[Math.min(i, WELLEN_FARB_KEYS.length - 1)])}
        />
      ))}
    </svg>
  );
}
