/*
 * vereinfachen.ts – Ramer-Douglas-Peucker, iterativ (expliziter Stack statt Rekursion).
 *
 * Bei einer großen, wenig vereinfachten Region kann der Ausgangs-Punktzug (vom
 * Moore-Tracing) mehrere tausend Punkte haben; eine rekursive RDP-Implementierung
 * könnte im pathologischen Fall (z.B. spiralförmige Kontur) entsprechend tief
 * schachteln. Ein Array-Stack umgeht das unabhängig vom Call-Stack-Limit.
 *
 * Hinweis zur Naht: die Kontur ist ein geschlossener Ring, aber RDP arbeitet mit
 * zwei festen Ankerpunkten (erster/letzter Punkt der Liste). Die schließende Kante
 * zwischen letztem und erstem Punkt wird dadurch selbst nie vereinfacht – im
 * ungünstigsten Fall bleibt dort ein einzelner, geometrisch unnötiger Punkt stehen.
 * Für Baumsilhouetten ist das ein vernachlässigbarer kosmetischer Nebeneffekt.
 */

import type { Punkt } from "./typen";

export function vereinfachePolygon(punkte: Punkt[], toleranz: number): Punkt[] {
  if (punkte.length < 3) return [...punkte];

  const behalten = new Uint8Array(punkte.length);
  behalten[0] = 1;
  behalten[punkte.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, punkte.length - 1]];
  while (stack.length > 0) {
    const [startIdx, endIdx] = stack.pop() as [number, number];
    if (endIdx <= startIdx + 1) continue;

    let maxAbstand = -1;
    let maxIdx = -1;
    for (let i = startIdx + 1; i < endIdx; i++) {
      const abstand = senkrechterAbstand(punkte[i], punkte[startIdx], punkte[endIdx]);
      if (abstand > maxAbstand) {
        maxAbstand = abstand;
        maxIdx = i;
      }
    }

    if (maxAbstand > toleranz) {
      behalten[maxIdx] = 1;
      stack.push([startIdx, maxIdx]);
      stack.push([maxIdx, endIdx]);
    }
  }

  const ergebnis: Punkt[] = [];
  for (let i = 0; i < punkte.length; i++) {
    if (behalten[i]) ergebnis.push(punkte[i]);
  }
  return ergebnis;
}

function senkrechterAbstand(p: Punkt, a: Punkt, b: Punkt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const laengeQuadrat = dx * dx + dy * dy;

  if (laengeQuadrat === 0) {
    // a und b fallen zusammen (degenerierte "Linie") – dann ist der euklidische
    // Abstand zu a die einzig sinnvolle Definition.
    const ax = p.x - a.x;
    const ay = p.y - a.y;
    return Math.sqrt(ax * ax + ay * ay);
  }

  const zaehler = Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy);
  return zaehler / Math.sqrt(laengeQuadrat);
}
