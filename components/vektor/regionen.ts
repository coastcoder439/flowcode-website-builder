/*
 * regionen.ts – Zusammenhangskomponenten (4er-Nachbarschaft) je Palettenfarbe.
 *
 * BFS mit einer WIEDERVERWENDETEN Int32Array-Queue (Bump-Allocator-Stil) statt
 * Rekursion: bei ~400k Pixeln würde eine rekursive Flutfüllung den Call-Stack
 * sprengen. Die Queue wird EINMAL für das ganze Bild angelegt, nicht pro Region –
 * `naechsterFreierSlot` wird als Rückgabewert durchgereicht statt (teuer) neu
 * ermittelt zu werden, sonst würde jede neue Region den bisherigen Füllstand
 * per Scan neu suchen müssen (O(Regionen×Pixel) statt O(Pixel)).
 */

import type { Region } from "./typen";

export interface RegionsErgebnis {
  /** Gefilterte Regionen (Fläche ≥ minFlaechePx), in Scan-Fundreihenfolge. */
  readonly regionen: Region[];
  /** Pro Pixel: Index in `regionen`, oder -1 (transparent oder verworfene Kleinstregion). */
  readonly regionMap: Int32Array;
}

export function findeRegionen(
  labelBuffer: Int16Array,
  breite: number,
  hoehe: number,
  minFlaechePx: number,
): RegionsErgebnis {
  const anzahlPixel = breite * hoehe;
  const regionMap = new Int32Array(anzahlPixel).fill(-1);
  const zugewiesen = new Uint8Array(anzahlPixel);
  const queue = new Int32Array(anzahlPixel);
  const regionen: Region[] = [];
  let naechsterFreierSlot = 0;

  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const startIdx = y * breite + x;
      if (zugewiesen[startIdx] || labelBuffer[startIdx] === -1) continue;

      const farbe = labelBuffer[startIdx];
      const ergebnis = fluteKomponente(
        labelBuffer,
        zugewiesen,
        queue,
        breite,
        hoehe,
        startIdx,
        farbe,
        naechsterFreierSlot,
      );
      naechsterFreierSlot = ergebnis.queueEnde;

      if (ergebnis.flaeche >= minFlaechePx) {
        const neuerIndex = regionen.length;
        for (let i = ergebnis.queueStart; i < ergebnis.queueEnde; i++) {
          regionMap[queue[i]] = neuerIndex;
        }
        regionen.push({
          paletteIndex: farbe,
          flaeche: ergebnis.flaeche,
          startX: x,
          startY: y,
          minX: ergebnis.minX,
          minY: ergebnis.minY,
          maxX: ergebnis.maxX,
          maxY: ergebnis.maxY,
        });
      }
      // Zu kleine Komponenten: regionMap bleibt -1 (Initialwert), nichts weiter zu tun –
      // `zugewiesen` verhindert trotzdem, dass diese Pixel nochmal angefasst werden.
    }
  }

  return { regionen, regionMap };
}

interface FlutErgebnis {
  readonly queueStart: number;
  readonly queueEnde: number;
  readonly flaeche: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * BFS ab `startIdx` über alle 4er-Nachbarn mit identischem Label, beginnend am
 * übergebenen `queueStart` (= Füllstand der geteilten Queue nach der vorherigen
 * Komponente). Jede Komponente belegt danach ihre eigene, zusammenhängende
 * Teilspanne [queueStart, queueEnde) in `queue`.
 */
function fluteKomponente(
  labelBuffer: Int16Array,
  zugewiesen: Uint8Array,
  queue: Int32Array,
  breite: number,
  hoehe: number,
  startIdx: number,
  farbe: number,
  queueStart: number,
): FlutErgebnis {
  let tail = queueStart;
  let head = queueStart;

  queue[tail++] = startIdx;
  zugewiesen[startIdx] = 1;

  const startX = startIdx % breite;
  const startY = (startIdx / breite) | 0;
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % breite;
    const cy = (cur / breite) | 0;

    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;

    if (cx > 0) tail = pruefeNachbar(labelBuffer, zugewiesen, queue, tail, cur - 1, farbe);
    if (cx < breite - 1) tail = pruefeNachbar(labelBuffer, zugewiesen, queue, tail, cur + 1, farbe);
    if (cy > 0) tail = pruefeNachbar(labelBuffer, zugewiesen, queue, tail, cur - breite, farbe);
    if (cy < hoehe - 1) tail = pruefeNachbar(labelBuffer, zugewiesen, queue, tail, cur + breite, farbe);
  }

  return { queueStart, queueEnde: tail, flaeche: tail - queueStart, minX, minY, maxX, maxY };
}

function pruefeNachbar(
  labelBuffer: Int16Array,
  zugewiesen: Uint8Array,
  queue: Int32Array,
  tail: number,
  nachbarIdx: number,
  farbe: number,
): number {
  if (zugewiesen[nachbarIdx] || labelBuffer[nachbarIdx] !== farbe) return tail;
  zugewiesen[nachbarIdx] = 1;
  queue[tail] = nachbarIdx;
  return tail + 1;
}
