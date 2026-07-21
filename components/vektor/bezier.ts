/*
 * bezier.ts – Eckenerhaltende kubische Bezier-Anpassung + SVG-Pfad-Teilstring.
 *
 * "Ecken erhalten" heißt konkret: an einer Ecke bekommt die Kurve exakt die
 * Kontrollpunkte einer Geraden (bei 1/3 und 2/3 der Kantenlänge – eine kubische
 * Bezierkurve mit diesen Kontrollpunkten verläuft mathematisch identisch zu einer
 * Strecke). An glatten Punkten wird stattdessen ein Catmull-Rom-artiger Tangenten-
 * vektor aus den Nachbarpunkten verwendet, skaliert über `glaettung`. Jede Kante
 * klassifiziert ihre beiden Endpunkte unabhängig – ein Segment zwischen einer Ecke
 * und einem glatten Punkt bekommt so ganz natürlich einen halb geraden, halb
 * kurvigen Verlauf statt eines harten Bruchs.
 */

import type { Punkt } from "./typen";

const ECKEN_WINKEL_SCHWELLE_RAD = (40 * Math.PI) / 180;
const TANGENTE_MIN = 0.15;
const TANGENTE_GLAETTUNG_SPANNE = 0.25;
const DEZIMALSTELLEN_FAKTOR = 10; // 1 Nachkommastelle im SVG-Output

/** Baut EINEN geschlossenen Teilpfad ("M...C...Z") aus einem bereits vereinfachten, geschlossenen Punktzug. */
export function polygonZuBezierPfad(punkte: Punkt[], glaettung: number): string {
  if (punkte.length < 3) return "";

  const n = punkte.length;
  const ecken = erkenneEcken(punkte);
  const tangentenFaktor = TANGENTE_MIN + glaettung * TANGENTE_GLAETTUNG_SPANNE;

  const teile: string[] = [`M ${formatPunkt(punkte[0])}`];
  for (let i = 0; i < n; i++) {
    const cp1 = kontrollpunktStart(punkte, i, ecken, tangentenFaktor);
    const cp2 = kontrollpunktEnde(punkte, i, ecken, tangentenFaktor);
    const ziel = punkte[(i + 1) % n];
    teile.push(`C ${formatPunkt(cp1)} ${formatPunkt(cp2)} ${formatPunkt(ziel)}`);
  }
  teile.push("Z");

  return teile.join(" ");
}

function erkenneEcken(punkte: Punkt[]): Uint8Array {
  const n = punkte.length;
  const ecken = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const vorher = punkte[(i - 1 + n) % n];
    const nachher = punkte[(i + 1) % n];
    if (istEcke(vorher, punkte[i], nachher)) ecken[i] = 1;
  }
  return ecken;
}

function istEcke(vorher: Punkt, aktuell: Punkt, nachher: Punkt): boolean {
  const einX = aktuell.x - vorher.x;
  const einY = aktuell.y - vorher.y;
  const ausX = nachher.x - aktuell.x;
  const ausY = nachher.y - aktuell.y;

  const einLaenge = Math.sqrt(einX * einX + einY * einY);
  const ausLaenge = Math.sqrt(ausX * ausX + ausY * ausY);
  if (einLaenge < 1e-6 || ausLaenge < 1e-6) return false; // keine Richtungsinfo -> defensiv als glatt werten

  const cosWinkel = clamp((einX * ausX + einY * ausY) / (einLaenge * ausLaenge), -1, 1);
  return Math.acos(cosWinkel) > ECKEN_WINKEL_SCHWELLE_RAD;
}

/** Kontrollpunkt beim Verlassen von punkte[i] (Segment i -> i+1). */
function kontrollpunktStart(punkte: Punkt[], i: number, ecken: Uint8Array, tangentenFaktor: number): Punkt {
  const n = punkte.length;
  const a = punkte[i];
  const b = punkte[(i + 1) % n];

  if (ecken[i]) {
    return { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 };
  }

  const vorherVonA = punkte[(i - 1 + n) % n];
  const richtung = normalisiere(b.x - vorherVonA.x, b.y - vorherVonA.y);
  const laenge = distanz(a, b) * tangentenFaktor;
  return { x: a.x + richtung.x * laenge, y: a.y + richtung.y * laenge };
}

/** Kontrollpunkt beim Ankommen an punkte[i+1] (Segment i -> i+1). */
function kontrollpunktEnde(punkte: Punkt[], i: number, ecken: Uint8Array, tangentenFaktor: number): Punkt {
  const n = punkte.length;
  const a = punkte[i];
  const bIdx = (i + 1) % n;
  const b = punkte[bIdx];

  if (ecken[bIdx]) {
    return { x: b.x - (b.x - a.x) / 3, y: b.y - (b.y - a.y) / 3 };
  }

  const nachherVonB = punkte[(i + 2) % n];
  const richtung = normalisiere(nachherVonB.x - a.x, nachherVonB.y - a.y);
  const laenge = distanz(a, b) * tangentenFaktor;
  // Tangente an b zeigt vorwärts (Richtung a -> ... -> nachherVonB); der Kontrollpunkt
  // muss von b aus GEGEN diese Richtung liegen, um in die Kurve hineinzuführen.
  return { x: b.x - richtung.x * laenge, y: b.y - richtung.y * laenge };
}

function normalisiere(x: number, y: number): Punkt {
  const laenge = Math.sqrt(x * x + y * y);
  if (laenge < 1e-9) return { x: 0, y: 0 };
  return { x: x / laenge, y: y / laenge };
}

function distanz(a: Punkt, b: Punkt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function formatPunkt(p: Punkt): string {
  return `${rund(p.x)},${rund(p.y)}`;
}

// Zahl->String über Number.prototype.toString normalisiert -0 bereits auf "0", kein
// Sonderfall nötig (verifiziert: String(Math.round(-0.3)/10) === "0").
function rund(n: number): number {
  return Math.round(n * DEZIMALSTELLEN_FAKTOR) / DEZIMALSTELLEN_FAKTOR;
}
