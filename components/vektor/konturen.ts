/*
 * konturen.ts – Kontur je Region: äußerer Rand + Löcher.
 *
 * Arbeitet auf einer LOKALEN, gepolsterten Kopie der Region (Bounding-Box + 1px
 * Rand) statt auf dem ganzen Bild: hält den Aufwand pro Region proportional zu
 * ihrer eigenen Größe statt zur Bildgröße. Der 1px-Rand garantiert außerdem, dass
 * der Hintergrund am Maskenrand IMMER zusammenhängt – das ist der garantierte
 * Startpunkt für die Loch-Flutung (kein Loch kann die Region "von außen"
 * berühren, sonst wäre es kein Loch).
 */

import type { Kontur, Punkt, Region } from "./typen";
import { verfolgeRand } from "./moore";

/** Sicherheitsdeckel fürs Moore-Tracing, proportional zur lokalen Maskengröße. */
const MOORE_SICHERHEITSFAKTOR = 8;

/** Reservierte Komponenten-ID für "von außen erreichbarer Hintergrund" (siehe findeLoecher). */
const KOMPONENTE_AUSSEN = 0;

export function traceKontur(
  regionMap: Int32Array,
  breite: number,
  hoehe: number,
  region: Region,
  regionIndex: number,
): Kontur {
  const lokaleBreite = region.maxX - region.minX + 1 + 2;
  const lokaleHoehe = region.maxY - region.minY + 1 + 2;
  const ursprungX = region.minX - 1;
  const ursprungY = region.minY - 1;

  const maske = baueLokaleMaske(regionMap, breite, region, regionIndex, lokaleBreite, lokaleHoehe, ursprungX, ursprungY);
  const sicherheitsLimit = lokaleBreite * lokaleHoehe * MOORE_SICHERHEITSFAKTOR;

  const aussenLokal = verfolgeRand(
    (x, y) => leseSicher(maske, lokaleBreite, lokaleHoehe, x, y) === 1,
    region.startX - ursprungX,
    region.startY - ursprungY,
    sicherheitsLimit,
  );

  const loecherLokal = findeLoecher(maske, lokaleBreite, lokaleHoehe, sicherheitsLimit);

  return {
    aussen: verschiebeGlobal(aussenLokal, ursprungX, ursprungY),
    loecher: loecherLokal.map((l) => verschiebeGlobal(l, ursprungX, ursprungY)),
  };
}

/** Bounds-geprüfter Zugriff auf ein lokales Raster; außerhalb -> -1 (passt nie zu einem echten Maskenwert/einer ID ≥0). */
function leseSicher(arr: ArrayLike<number>, breite: number, hoehe: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= breite || y >= hoehe) return -1;
  return arr[y * breite + x];
}

function verschiebeGlobal(punkte: Punkt[], ursprungX: number, ursprungY: number): Punkt[] {
  return punkte.map((p) => ({ x: p.x + ursprungX, y: p.y + ursprungY }));
}

function baueLokaleMaske(
  regionMap: Int32Array,
  breite: number,
  region: Region,
  regionIndex: number,
  lokaleBreite: number,
  lokaleHoehe: number,
  ursprungX: number,
  ursprungY: number,
): Uint8Array {
  const maske = new Uint8Array(lokaleBreite * lokaleHoehe);
  // Nur über die bekannte bbox iterieren, nicht über die Polsterung – Polsterzellen
  // bleiben beim Uint8Array-Default (0) und gehören per Definition nie zur Region.
  for (let gy = region.minY; gy <= region.maxY; gy++) {
    const zeilenBasis = gy * breite;
    const lokaleZeilenBasis = (gy - ursprungY) * lokaleBreite;
    for (let gx = region.minX; gx <= region.maxX; gx++) {
      if (regionMap[zeilenBasis + gx] === regionIndex) {
        maske[lokaleZeilenBasis + (gx - ursprungX)] = 1;
      }
    }
  }
  return maske;
}

/**
 * Löcher = Hintergrund-Komponenten (4er-Nachbarschaft) innerhalb der lokalen Maske,
 * die NICHT von außen (Maskenrand) erreichbar sind. Beide Flutungen (der einmalige
 * "was ist außen"-Lauf UND jede Loch-Komponente) laufen über dieselbe
 * `komponente`-ID-Fläche: ID 0 ist reserviert für "außen", jedes Loch bekommt die
 * nächste freie ID. Eine Zelle mit ID ≠ -1 gilt in JEDEM Fall als "schon gesehen" –
 * das verhindert von selbst, dass ein Loch-Lauf in bereits als "außen" markierte
 * Zellen einbricht.
 */
function findeLoecher(maske: Uint8Array, lokaleBreite: number, lokaleHoehe: number, sicherheitsLimit: number): Punkt[][] {
  const anzahlZellen = lokaleBreite * lokaleHoehe;
  const komponente = new Int32Array(anzahlZellen).fill(-1);
  const queue = new Int32Array(anzahlZellen);

  // (0,0) ist wegen der 1px-Polsterung immer Hintergrund und immer der äußere Rand.
  flute(maske, komponente, queue, lokaleBreite, lokaleHoehe, 0, KOMPONENTE_AUSSEN);

  const loecher: Punkt[][] = [];
  let naechsteLochId = KOMPONENTE_AUSSEN + 1;

  for (let ly = 0; ly < lokaleHoehe; ly++) {
    for (let lx = 0; lx < lokaleBreite; lx++) {
      const idx = ly * lokaleBreite + lx;
      if (maske[idx] === 1 || komponente[idx] !== -1) continue;

      // (lx,ly) ist wegen Zeilen-für-Zeilen-Scan garantiert oberster-dann-linkester
      // Punkt dieser Loch-Komponente -> korrekter Moore-Startpunkt ohne weitere Suche.
      const dieseLochId = naechsteLochId++;
      flute(maske, komponente, queue, lokaleBreite, lokaleHoehe, idx, dieseLochId);

      const kontur = verfolgeRand(
        (x, y) => leseSicher(komponente, lokaleBreite, lokaleHoehe, x, y) === dieseLochId,
        lx,
        ly,
        sicherheitsLimit,
      );
      if (kontur.length >= 3) loecher.push(kontur);
    }
  }

  return loecher;
}

/** 4er-BFS über zusammenhängenden, noch nicht zugeordneten Hintergrund ab `startIdx`, markiert mit `id`. */
function flute(
  maske: Uint8Array,
  komponente: Int32Array,
  queue: Int32Array,
  breite: number,
  hoehe: number,
  startIdx: number,
  id: number,
): void {
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;
  komponente[startIdx] = id;

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % breite;
    const cy = (cur / breite) | 0;
    if (cx > 0) tail = pruefeFlutNachbar(maske, komponente, queue, tail, cur - 1, id);
    if (cx < breite - 1) tail = pruefeFlutNachbar(maske, komponente, queue, tail, cur + 1, id);
    if (cy > 0) tail = pruefeFlutNachbar(maske, komponente, queue, tail, cur - breite, id);
    if (cy < hoehe - 1) tail = pruefeFlutNachbar(maske, komponente, queue, tail, cur + breite, id);
  }
}

function pruefeFlutNachbar(
  maske: Uint8Array,
  komponente: Int32Array,
  queue: Int32Array,
  tail: number,
  nachbarIdx: number,
  id: number,
): number {
  if (maske[nachbarIdx] === 1 || komponente[nachbarIdx] !== -1) return tail;
  komponente[nachbarIdx] = id;
  queue[tail] = nachbarIdx;
  return tail + 1;
}
