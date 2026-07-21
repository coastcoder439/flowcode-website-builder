/*
 * moore.ts – Generischer Moore-Nachbarschafts-Randverfolger (8er-Nachbarschaft).
 *
 * Läuft im Uhrzeigersinn um eine Vordergrund-Fläche (per Prädikat definiert) und
 * liefert die Randpixel als geschlossenen Punktzug. Wird in konturen.ts sowohl für
 * den äußeren Rand einer Region als auch für Lochränder verwendet – das Prädikat
 * entscheidet jeweils, was "Vordergrund" bedeutet, moore.ts kennt nur Pixel-Logik,
 * keine Region-/Lochbegriffe.
 */

import type { Punkt } from "./typen";

// Acht Richtungen im Uhrzeigersinn, Start Ost. Der Index dient als "Kompass"-Zustand
// zwischen den Trace-Schritten (siehe naechsteRichtung).
const RICHTUNGEN: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // Ost
  [1, 1], // Suedost
  [0, 1], // Sued
  [-1, 1], // Suedwest
  [-1, 0], // West
  [-1, -1], // Nordwest
  [0, -1], // Nord
  [1, -1], // Nordost
];

const ANZAHL_RICHTUNGEN = RICHTUNGEN.length;
const STANDARD_SICHERHEITSLIMIT = 1_000_000;

export type VordergrundPraedikat = (x: number, y: number) => boolean;

/**
 * Moore-Neighbor-Tracing mit Jacob's Stopping Criterion.
 *
 * VORBEDINGUNG: `startX/startY` ist der beim zeilenweisen Scan zuerst gefundene
 * Vordergrund-Pixel der Fläche (oberste-dann-linkeste Position). Daraus folgt ohne
 * weitere Suche, dass der Pixel westlich davon Hintergrund ist – das ist die
 * initiale Backtrack-Richtung, von der aus im Uhrzeigersinn gescannt wird.
 *
 * `maxSchritte` ist ein reiner Sicherheitsdeckel gegen ein fehlerhaftes Prädikat
 * (z.B. eines, das nie "false" liefert); bei einer echten geschlossenen Kontur
 * greift immer zuerst Jacob's Stopping Criterion.
 */
export function verfolgeRand(
  istVordergrund: VordergrundPraedikat,
  startX: number,
  startY: number,
  maxSchritte: number = STANDARD_SICHERHEITSLIMIT,
): Punkt[] {
  if (!istVordergrund(startX, startY)) return [];

  const rand: Punkt[] = [{ x: startX, y: startY }];
  const startTreffer = naechsteRichtung(istVordergrund, startX, startY, 4 /* West */);
  if (!startTreffer) return rand; // isolierter Einzelpixel ohne Vordergrund-Nachbarn

  const p1: Punkt = {
    x: startX + RICHTUNGEN[startTreffer.richtung][0],
    y: startY + RICHTUNGEN[startTreffer.richtung][1],
  };
  rand.push(p1);

  let curX = p1.x;
  let curY = p1.y;
  let backtrackRichtung = startTreffer.neueBacktrackRichtung;

  for (let schritt = 0; schritt < maxSchritte; schritt++) {
    const treffer = naechsteRichtung(istVordergrund, curX, curY, backtrackRichtung);
    if (!treffer) break; // bei einer bereits betretenen Randfläche eigentlich unerreichbar, defensiv

    const naechsterX = curX + RICHTUNGEN[treffer.richtung][0];
    const naechsterY = curY + RICHTUNGEN[treffer.richtung][1];

    // Jacob's Stopping Criterion: wir sind zurück am Startpixel UND der nächste
    // Schritt wiederholt exakt den allerersten Schritt -> Kontur einmal komplett umrundet.
    if (curX === startX && curY === startY && naechsterX === p1.x && naechsterY === p1.y) {
      break;
    }

    rand.push({ x: naechsterX, y: naechsterY });
    curX = naechsterX;
    curY = naechsterY;
    backtrackRichtung = treffer.neueBacktrackRichtung;
  }

  return rand;
}

interface RichtungsTreffer {
  readonly richtung: number;
  readonly neueBacktrackRichtung: number;
}

/**
 * Sucht im Uhrzeigersinn ab (backtrackRichtung+1) den ersten Vordergrund-Nachbarn
 * von (x,y). Die neue Backtrack-Richtung fürs nächste Zentrum ist die Gegenrichtung
 * von `richtung` (der Nachbar, von dem aus wir kamen) – Standardformulierung des
 * Moore-Algorithmus ("hug the foreground clockwise").
 */
function naechsteRichtung(
  istVordergrund: VordergrundPraedikat,
  x: number,
  y: number,
  backtrackRichtung: number,
): RichtungsTreffer | null {
  for (let i = 1; i <= ANZAHL_RICHTUNGEN; i++) {
    const richtung = (backtrackRichtung + i) % ANZAHL_RICHTUNGEN;
    const [dx, dy] = RICHTUNGEN[richtung];
    if (istVordergrund(x + dx, y + dy)) {
      return { richtung, neueBacktrackRichtung: (richtung + 4) % ANZAHL_RICHTUNGEN };
    }
  }
  return null;
}
