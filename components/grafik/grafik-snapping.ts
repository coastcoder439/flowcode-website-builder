/*
 * grafik-snapping.ts – Einrasten (Snapping) beim Ziehen im Grafik-Editor.
 * Rechnet ausschließlich in VIEWPORT-Pixeln (getBoundingClientRect-Raum):
 * ein Bildschirm-Pixel-Delta ist identisch zu einem Dokument-Pixel-Delta
 * (nur der Nullpunkt verschiebt sich um den Scroll-Offset, der sich in einer
 * DELTA-Rechnung heraushebt) — genau wie GrafikEditor.tsx onMove schon
 * (dx/dy aus clientX/clientY, direkt auf die Dokument-Koordinaten addiert).
 * Dadurch lassen sich echte gerenderte Rechtecke (inkl. Rotation/
 * Seitenverhältnis) per getBoundingClientRect nutzen, ohne Bildgeometrie
 * ein zweites Mal nachzurechnen.
 *
 * Eigene Datei statt Inline-Logik in GrafikEditor.tsx (das ist bereits sehr
 * groß) — nur `andereSnapBoxen` fasst den DOM an (Ziel-Rechtecke einsammeln),
 * der Rest ist reine Geometrie, leicht durch Aufruf mit Beispielwerten
 * nachvollziehbar.
 */

export interface SnapBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
}

export function snapBoxAusRect(r: { left: number; top: number; width: number; height: number }): SnapBox {
  return {
    left: r.left,
    right: r.left + r.width,
    top: r.top,
    bottom: r.top + r.height,
    centerX: r.left + r.width / 2,
    centerY: r.top + r.height / 2,
  };
}

/** Tentative (noch nicht eingerastete) Box einer Grafik an einer gedachten
 *  Dokument-Mittelpunkt-Position — Breite/Höhe kommen vom AKTUELLEN
 *  DOM-Rechteck (ändern sich während eines reinen Positions-Zugs nicht, nur
 *  links/oben wären veraltet — die werden hier ohnehin neu aus der
 *  Zug-Position berechnet, nicht aus dem alten rect). null, wenn das Element
 *  gerade nicht im DOM steht (z.B. ausgeblendet). */
export function tentativeBox(
  el: Element,
  mitteXDoc: number,
  mitteYDoc: number,
  scrollX: number,
  scrollY: number,
): SnapBox {
  const rect = el.getBoundingClientRect();
  const cx = mitteXDoc - scrollX;
  const cy = mitteYDoc - scrollY;
  return {
    left: cx - rect.width / 2,
    right: cx + rect.width / 2,
    top: cy - rect.height / 2,
    bottom: cy + rect.height / 2,
    centerX: cx,
    centerY: cy,
  };
}

/** Sammelt die Snap-Ziel-Rechtecke aller ANDEREN platzierten (sichtbaren)
 *  Grafiken im DOM — einzige DOM-lesende Funktion dieser Datei. */
export function andereSnapBoxen(ausserId: string): SnapBox[] {
  const boxen: SnapBox[] = [];
  document.querySelectorAll<HTMLElement>("[data-grafik-id]").forEach((el) => {
    const id = el.getAttribute("data-grafik-id");
    if (!id || id === ausserId) return;
    boxen.push(snapBoxAusRect(el.getBoundingClientRect()));
  });
  return boxen;
}

export interface SnapErgebnis {
  /** Versatz (Viewport-px), der die tentative Box einrasten lässt. */
  dx: number;
  dy: number;
  /** X-Positionen (Viewport-px) aktiver senkrechter Hilfslinien. */
  vertikaleLinien: number[];
  /** Y-Positionen (Viewport-px) aktiver waagerechter Hilfslinien. */
  horizontaleLinien: number[];
}

/** Nächstgelegenes Ziel unter `ziele` für `wert` — null, wenn keins
 *  innerhalb `schwelle` liegt (kein Snap auf dieser Kante). */
function naechstesZiel(wert: number, ziele: number[], schwelle: number): number | null {
  let bestesZiel: number | null = null;
  let besterAbstand = Infinity;
  for (const ziel of ziele) {
    const abstand = Math.abs(ziel - wert);
    if (abstand <= schwelle && abstand < besterAbstand) {
      besterAbstand = abstand;
      bestesZiel = ziel;
    }
  }
  return bestesZiel;
}

/** Für die drei Kanten einer Achse (Anfang/Mitte/Ende) das jeweils beste
 *  Ziel suchen und die Kante mit dem KLEINSTEN Versatz gewinnen lassen —
 *  Design-Tool-üblich (Ausrichten an jeder Kante, nicht nur der Mitte). */
function besteAchse(kanten: number[], ziele: number[], schwelle: number): { versatz: number; ziel: number } | null {
  let bestes: { versatz: number; ziel: number } | null = null;
  for (const kante of kanten) {
    const ziel = naechstesZiel(kante, ziele, schwelle);
    if (ziel === null) continue;
    const versatz = ziel - kante;
    if (!bestes || Math.abs(versatz) < Math.abs(bestes.versatz)) bestes = { versatz, ziel };
  }
  return bestes;
}

/** Zielwerte für ein Raster nahe den beiden übergebenen Kanten (Anfang und
 *  Ende der tentativen Box) — nicht das komplette Raster, nur die jeweils
 *  nächstliegende Linie je Kante reicht als Kandidat. */
function rasterZiele(a: number, b: number, raster: number): number[] {
  if (raster <= 0) return [];
  return [Math.round(a / raster) * raster, Math.round(b / raster) * raster];
}

/** Berechnet den Einrast-Versatz (dx, dy) für eine gezogene Box gegen
 *  Viewport-Mitte, ein Raster UND die Kanten/Mitten anderer Grafiken — pro
 *  Achse UNABHÄNGIG (X und Y können an unterschiedlichen Zielen einrasten).
 *  `tentativ` ist die Box an der Roh-Zugposition (VOR dem Snap). */
export function berechneSnap(
  tentativ: SnapBox,
  andere: SnapBox[],
  viewport: { breite: number; hoehe: number },
  rasterPx: number,
  schwellePx: number,
): SnapErgebnis {
  const xZiele = [viewport.breite / 2, ...rasterZiele(tentativ.left, tentativ.right, rasterPx)];
  const yZiele = [viewport.hoehe / 2, ...rasterZiele(tentativ.top, tentativ.bottom, rasterPx)];
  for (const a of andere) {
    xZiele.push(a.left, a.centerX, a.right);
    yZiele.push(a.top, a.centerY, a.bottom);
  }

  const xTreffer = besteAchse([tentativ.left, tentativ.centerX, tentativ.right], xZiele, schwellePx);
  const yTreffer = besteAchse([tentativ.top, tentativ.centerY, tentativ.bottom], yZiele, schwellePx);

  return {
    dx: xTreffer?.versatz ?? 0,
    dy: yTreffer?.versatz ?? 0,
    vertikaleLinien: xTreffer ? [xTreffer.ziel] : [],
    horizontaleLinien: yTreffer ? [yTreffer.ziel] : [],
  };
}
