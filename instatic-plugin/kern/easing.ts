/*
 * easing.ts – Kubische Bezier-Easing, kompatibel zu CSS cubic-bezier(x1,y1,x2,y2):
 * P0 = (0,0) und P3 = (1,1) liegen fix in den Ecken, nur die beiden mittleren
 * Kontrollpunkte P1=(x1,y1) und P2=(x2,y2) sind frei (s. GrafikKeyframe.easing
 * in grafik-types.ts, EasingKurve.tsx für den sichtbaren Kurven-Editor).
 *
 * Gebraucht wird die Funktion y = f(x): zu einem linearen Fortschritt x (hier:
 * das Lerp-t zwischen zwei Keyframes, s. zustandBei in grafik-types.ts) den
 * passenden Kurven-Wert y liefern. Der Bezier ist aber nur PARAMETRISCH
 * gegeben (x(s), y(s)) — deshalb wird zuerst s mit x(s) = x aufgelöst
 * (Newton-Raphson, mit Bisektion als Fallback, wenn die Ableitung zu klein
 * wird) und danach y(s) berechnet. Dasselbe Vorgehen wie in Browser-Engines
 * (z.B. WebKits UnitBezier).
 *
 * Rein numerisch, deterministisch (keine Zufallszahlen, kein Zeitbezug),
 * keine Bibliothek, kein `any`.
 */

/** Kubische Bezier-Kontrollpunkte (x1,y1,x2,y2) wie CSS cubic-bezier(). */
export type Bezier4 = readonly [number, number, number, number];

/** Weicher Standard-Verlauf (CSS ease-in-out) — greift, wenn ein Keyframe
 *  kein eigenes easing hat (s. grafik-types.ts zustandBei). */
export const EASING_DEFAULT: Bezier4 = [0.42, 0, 0.58, 1];

/** Bezier-Komponente (X ODER Y, je nachdem welche Kontrollpunkte reinkommen)
 *  an Kurvenparameter s∈[0,1]. P0=0 und P3=1 sind fest eingerechnet:
 *  B(s) = 3(1-s)²s·p1 + 3(1-s)s²·p2 + s³. */
function bezierWert(s: number, p1: number, p2: number): number {
  const einS = 1 - s;
  return 3 * einS * einS * s * p1 + 3 * einS * s * s * p2 + s * s * s;
}

/** Ableitung von bezierWert nach s — Standardformel B'(s) = 3(1-s)²(P1-P0) +
 *  6(1-s)s(P2-P1) + 3s²(P3-P2), mit P0=0/P3=1 eingesetzt. Für Newton-Raphson. */
function bezierAbleitung(s: number, p1: number, p2: number): number {
  const einS = 1 - s;
  return 3 * einS * einS * p1 + 6 * einS * s * (p2 - p1) + 3 * s * s * (1 - p2);
}

const NEWTON_ITERATIONEN = 8;
const NEWTON_EPSILON = 1e-6;
const BISEKTION_ITERATIONEN = 20;

/** Löst bezierWert(s, x1, x2) = x nach s auf (x ist hier IMMER echt zwischen
 *  0 und 1 — die Ränder behandelt cubicBezierEasing separat, s.u.).
 *  Newton-Raphson zuerst (schnell, wenige Iterationen reichen für
 *  Bildschirm-Präzision); fällt auf Bisektion zurück, wenn die Ableitung zu
 *  klein wird (Newton kann dort divergieren/überschießen) — deckt auch
 *  extreme Kontrollpunkte robust ab, exakt wie gängige Browser-Implementierungen. */
function loeseKurvenparameter(x: number, x1: number, x2: number): number {
  let s = x;
  for (let i = 0; i < NEWTON_ITERATIONEN; i++) {
    const differenz = bezierWert(s, x1, x2) - x;
    if (Math.abs(differenz) < NEWTON_EPSILON) return s;
    const ableitung = bezierAbleitung(s, x1, x2);
    if (Math.abs(ableitung) < NEWTON_EPSILON) break;
    s -= differenz / ableitung;
  }
  let unten = 0;
  let oben = 1;
  s = x;
  for (let i = 0; i < BISEKTION_ITERATIONEN; i++) {
    s = (unten + oben) / 2;
    const wert = bezierWert(s, x1, x2) - x;
    if (Math.abs(wert) < NEWTON_EPSILON) break;
    if (wert < 0) unten = s;
    else oben = s;
  }
  return s;
}

/** Baut aus (x1,y1,x2,y2) eine Easing-Funktion t -> y. t wird auf [0,1]
 *  geklemmt, 0 und 1 werden dabei IMMER exakt 0 bzw. 1 zurückgegeben (P0/P3
 *  liegen fix in den Ecken) statt iterativ angenähert — an den Rändern ist
 *  die Ableitung von x(s) oft 0, dort wäre Newton instabil. y darf bei
 *  Überschwinger-Kurven (P1/P2 außerhalb 0..1) auch außerhalb 0..1 liegen. */
export function cubicBezierEasing(punkte: Bezier4): (t: number) => number {
  const [x1, y1, x2, y2] = punkte;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const s = loeseKurvenparameter(t, x1, x2);
    return bezierWert(s, y1, y2);
  };
}
