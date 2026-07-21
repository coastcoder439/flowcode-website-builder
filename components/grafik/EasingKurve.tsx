"use client";

/*
 * EasingKurve – sichtbarer, ziehbarer Kurven-Editor für eine kubische
 * Bezier-Easing (s. easing.ts, GrafikKeyframe.easing in grafik-types.ts).
 * Rendert die Kurve als SVG-Pfad UND zwei ziehbare Kontrollpunkt-Griffe
 * (P1, P2 — P0=(0,0)/P3=(1,1) liegen fix in den Ecken, wie bei jedem
 * cubic-bezier()-Editor).
 *
 * Ziehen ruft onChange bei JEDER Bewegung auf — genau wie ein
 * <input type="range">. Der Aufrufer (GrafikEditor.tsx, Reiter „Keyframes")
 * übernimmt Commit/Gruppierung selbst, exakt nach demselben Muster wie die
 * Deckkraft-/Drehungs-Regler dort (ctx.commit mit Gruppen-Schlüssel +
 * 600ms-Fenster) — diese Datei kennt den Verlauf (Undo/Redo) bewusst NICHT,
 * um nicht zwei Stellen zu haben, die wissen, wie ein Commit aussieht.
 */

import { useCallback, useRef, useState } from "react";
import { cubicBezierEasing, type Bezier4 } from "./easing";
import "./grafik-easing.css";

const GROESSE = 120;
/** Rand um das SVG-Feld, damit die Griffe an den Kanten nicht abgeschnitten
 *  werden (P1/P2 dürfen X∈[0,1] und Y auch außerhalb 0..1 liegen). */
const RAND = 14;
const FELD = GROESSE - RAND * 2;

const PRESETS: { label: string; wert: Bezier4 }[] = [
  { label: "linear", wert: [0, 0, 1, 1] },
  { label: "ease-in", wert: [0.42, 0, 1, 1] },
  { label: "ease-out", wert: [0, 0, 0.58, 1] },
  { label: "ease-in-out", wert: [0.42, 0, 0.58, 1] },
];

function rund2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bezier-Koordinate (x oder y, 0..1-Raum) -> SVG-Pixel. Y ist im SVG
 *  UMGEDREHT (0 oben) — die Kurve soll unten-links -> oben-rechts laufen,
 *  wie in gängigen Kurven-Editoren. */
function zuPixel(x: number, y: number): [number, number] {
  return [RAND + x * FELD, RAND + (1 - y) * FELD];
}

function ausPixel(px: number, py: number): [number, number] {
  return [(px - RAND) / FELD, 1 - (py - RAND) / FELD];
}

export interface EasingKurveProps {
  value: Bezier4;
  onChange: (next: Bezier4) => void;
}

export function EasingKurve({ value, onChange }: EasingKurveProps) {
  const feldRef = useRef<SVGSVGElement>(null);
  /** Welcher Griff gerade gezogen wird (0 = P1, 1 = P2) — null = keiner. */
  const [zieht, setZieht] = useState<0 | 1 | null>(null);

  const [x1, y1, x2, y2] = value;
  const kurve = cubicBezierEasing(value);
  /* Kurve als Polyline-Näherung — reicht für die visuelle Rückmeldung, kein
     Anspruch auf exakte Bezier-Segmente. */
  const PUNKTE = 24;
  const pfad = Array.from({ length: PUNKTE + 1 }, (_, i) => {
    const t = i / PUNKTE;
    const [px, py] = zuPixel(t, kurve(t));
    return `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`;
  }).join(" ");

  const clientZuWert = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = feldRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    const px = ((clientX - rect.left) / rect.width) * GROESSE;
    const py = ((clientY - rect.top) / rect.height) * GROESSE;
    const [x, y] = ausPixel(px, py);
    /* X auf 0..1 klemmen (CSS-Bezier-Konvention: nur dann ist x(s) monoton
       und als Zeitfunktion gültig). Y bewusst GROSSZÜGIGER (-1..2) statt auf
       0..1 geklemmt — Überschwinger/Bounce-Kurven sind erlaubt. */
    return [Math.min(1, Math.max(0, rund2(x))), Math.min(2, Math.max(-1, rund2(y)))];
  }, []);

  const onGriffDown = (griff: 0 | 1) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setZieht(griff);
  };

  const onMove = (e: React.PointerEvent) => {
    if (zieht === null) return;
    const [x, y] = clientZuWert(e.clientX, e.clientY);
    onChange(zieht === 0 ? [x, y, x2, y2] : [x1, y1, x, y]);
  };

  const onUp = () => setZieht(null);

  const [gx1, gy1] = zuPixel(x1, y1);
  const [gx2, gy2] = zuPixel(x2, y2);

  return (
    <div className="gre-easing">
      <svg
        ref={feldRef}
        className="gre-easing-feld"
        viewBox={`0 0 ${GROESSE} ${GROESSE}`}
        width={GROESSE}
        height={GROESSE}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <rect x={RAND} y={RAND} width={FELD} height={FELD} className="gre-easing-rahmen" />
        <line
          x1={RAND}
          y1={RAND + FELD}
          x2={RAND + FELD}
          y2={RAND}
          className="gre-easing-diagonale"
        />
        <path d={pfad} className="gre-easing-kurve" />
        <line x1={RAND} y1={RAND + FELD} x2={gx1} y2={gy1} className="gre-easing-griffleine" />
        <line
          x1={RAND + FELD}
          y1={RAND}
          x2={gx2}
          y2={gy2}
          className="gre-easing-griffleine"
        />
        <circle
          cx={gx1}
          cy={gy1}
          r={6}
          className="gre-easing-griff"
          onPointerDown={onGriffDown(0)}
        >
          <title>Kontrollpunkt 1 ({x1.toFixed(2)}, {y1.toFixed(2)})</title>
        </circle>
        <circle
          cx={gx2}
          cy={gy2}
          r={6}
          className="gre-easing-griff"
          onPointerDown={onGriffDown(1)}
        >
          <title>Kontrollpunkt 2 ({x2.toFixed(2)}, {y2.toFixed(2)})</title>
        </circle>
      </svg>
      <div className="gre-row gre-easing-presets">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" onClick={() => onChange(p.wert)}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
