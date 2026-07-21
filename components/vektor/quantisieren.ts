/*
 * quantisieren.ts – Der kritischste Schritt der Pipeline.
 *
 * Die PNGs sind kantengeglättet: an jeder Farbgrenze liegt ein Saum aus
 * Mischfarben. Würde man DIREKT nach Regionen suchen, entstünde pro Kante
 * eine dünne Extra-Region aus lauter Einzelpixeln – Tausende Mini-Pfade
 * statt sauberer Flächen. Deshalb: erst auf eine kleine Palette schnappen
 * (Median-Cut), DANN erst Zusammenhangskomponenten suchen (regionen.ts).
 */

import type { RGB } from "./typen";

export interface QuantisierungsErgebnis {
  readonly palette: RGB[];
  /** Pro Pixel: Index in `palette`, oder -1 = transparent. */
  readonly labelBuffer: Int16Array;
}

interface FarbEintrag {
  readonly rgb: RGB;
  readonly anzahl: number;
}

interface Spannen {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface Kuebel {
  readonly eintraege: FarbEintrag[];
}

type Kanal = "r" | "g" | "b";

export function quantisieren(
  rgba: Uint8ClampedArray,
  breite: number,
  hoehe: number,
  alphaSchwelle: number,
  maxFarben: number,
): QuantisierungsErgebnis {
  const anzahlPixel = breite * hoehe;
  const eintraege = baueHistogramm(rgba, anzahlPixel, alphaSchwelle);

  if (eintraege.length === 0) {
    return { palette: [], labelBuffer: new Int16Array(anzahlPixel).fill(-1) };
  }

  const palette = bauePalette(eintraege, maxFarben);
  const rohLabel = new Int16Array(anzahlPixel);
  schnappeAufPalette(rgba, anzahlPixel, alphaSchwelle, palette, rohLabel);
  const labelBuffer = mehrheitsfilter(rohLabel, breite, hoehe);

  return { palette, labelBuffer };
}

function pixelSchluessel(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * Zählt distinkte Farben. Nutzt bewusst eine Zahl->Zahl-Map (kein Objekt pro Pixel) –
 * die {rgb,anzahl}-Objekte werden erst NACH dem Scan angelegt, einmal pro distinkter
 * Farbe (typischerweise wenige Dutzend), nicht pro Pixel (hunderttausende).
 */
function baueHistogramm(rgba: Uint8ClampedArray, anzahlPixel: number, alphaSchwelle: number): FarbEintrag[] {
  const zaehler = new Map<number, number>();
  for (let i = 0; i < anzahlPixel; i++) {
    const basis = i * 4;
    if (rgba[basis + 3] < alphaSchwelle) continue;
    const schluessel = pixelSchluessel(rgba[basis], rgba[basis + 1], rgba[basis + 2]);
    zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + 1);
  }

  const eintraege: FarbEintrag[] = [];
  for (const [schluessel, anzahl] of zaehler) {
    eintraege.push({
      rgb: { r: (schluessel >> 16) & 0xff, g: (schluessel >> 8) & 0xff, b: schluessel & 0xff },
      anzahl,
    });
  }
  return eintraege;
}

function bauePalette(eintraege: FarbEintrag[], maxFarben: number): RGB[] {
  if (eintraege.length <= maxFarben) {
    // Exakter Fall (Vorgabe): distinkte Farben passen direkt in die Palette, unverändert
    // übernehmen – Mittelwertbildung würde z.B. dünne Outline-Farben unnötig verwässern.
    return sortiereNachHaeufigkeit(eintraege).map((e) => e.rgb);
  }

  let kuebel: Kuebel[] = [{ eintraege: sortiereNachHaeufigkeit(eintraege) }];
  while (kuebel.length < maxFarben) {
    const splitIndex = waehleGroesstenTeilbarenKuebel(kuebel);
    if (splitIndex === -1) break; // kein Kübel mehr teilbar (nur noch 1 distinkte Farbe je Kübel)
    const [a, b] = teileKuebel(kuebel[splitIndex]);
    kuebel = [...kuebel.slice(0, splitIndex), a, b, ...kuebel.slice(splitIndex + 1)];
  }

  return kuebel.map(repraesentativeFarbe);
}

function sortiereNachHaeufigkeit(eintraege: FarbEintrag[]): FarbEintrag[] {
  // Deterministische Reihenfolge (kein Object.values/Map-Iterationszufall über Läufe hinweg):
  // häufigste Farbe zuerst, bei Gleichstand nach RGB-Wert aufsteigend.
  return [...eintraege].sort(
    (x, y) => y.anzahl - x.anzahl || vergleichRgb(x.rgb, y.rgb),
  );
}

function vergleichRgb(a: RGB, b: RGB): number {
  return pixelSchluessel(a.r, a.g, a.b) - pixelSchluessel(b.r, b.g, b.b);
}

function berechneSpannen(eintraege: FarbEintrag[]): Spannen {
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;
  for (const e of eintraege) {
    const { r, g, b } = e.rgb;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  return { r: maxR - minR, g: maxG - minG, b: maxB - minB };
}

function breitesterKanal(spannen: Spannen): Kanal {
  if (spannen.r >= spannen.g && spannen.r >= spannen.b) return "r";
  if (spannen.g >= spannen.b) return "g";
  return "b";
}

/** Größter Kübel (nach Kanalspannweite) unter denen mit ≥2 distinkten Farben, sonst -1. */
function waehleGroesstenTeilbarenKuebel(kuebel: Kuebel[]): number {
  let bestIndex = -1;
  let besteSpanne = -1;
  for (let i = 0; i < kuebel.length; i++) {
    if (kuebel[i].eintraege.length < 2) continue;
    const s = berechneSpannen(kuebel[i].eintraege);
    const spanne = Math.max(s.r, s.g, s.b);
    if (spanne > besteSpanne) {
      besteSpanne = spanne;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Teilt an der nach Pixelzahl gewichteten Mediangrenze entlang des breitesten Kanals. */
function teileKuebel(kuebel: Kuebel): [Kuebel, Kuebel] {
  const kanal = breitesterKanal(berechneSpannen(kuebel.eintraege));
  const sortiert = [...kuebel.eintraege].sort(
    (a, b) => a.rgb[kanal] - b.rgb[kanal] || vergleichRgb(a.rgb, b.rgb),
  );

  const gesamt = sortiert.reduce((summe, e) => summe + e.anzahl, 0);
  let kumuliert = 0;
  let splitIndex = sortiert.length - 2;
  for (let i = 0; i < sortiert.length; i++) {
    kumuliert += sortiert[i].anzahl;
    if (kumuliert >= gesamt / 2) {
      splitIndex = i;
      break;
    }
  }
  // Beide Hälften müssen nicht-leer bleiben (waehleGroesstenTeilbarenKuebel garantiert
  // ≥2 distinkte Farben, hier trotzdem sicherheitshalber geklemmt).
  const sichererSplit = Math.min(Math.max(splitIndex, 0), sortiert.length - 2);

  return [
    { eintraege: sortiert.slice(0, sichererSplit + 1) },
    { eintraege: sortiert.slice(sichererSplit + 1) },
  ];
}

function repraesentativeFarbe(kuebel: Kuebel): RGB {
  let summeR = 0;
  let summeG = 0;
  let summeB = 0;
  let summeAnzahl = 0;
  for (const e of kuebel.eintraege) {
    summeR += e.rgb.r * e.anzahl;
    summeG += e.rgb.g * e.anzahl;
    summeB += e.rgb.b * e.anzahl;
    summeAnzahl += e.anzahl;
  }
  return {
    r: Math.round(summeR / summeAnzahl),
    g: Math.round(summeG / summeAnzahl),
    b: Math.round(summeB / summeAnzahl),
  };
}

/** Schnappt jeden opaken Pixel auf die euklidisch nächste Palettenfarbe (Gleichstand → kleinster Index). */
function schnappeAufPalette(
  rgba: Uint8ClampedArray,
  anzahlPixel: number,
  alphaSchwelle: number,
  palette: RGB[],
  ziel: Int16Array,
): void {
  for (let i = 0; i < anzahlPixel; i++) {
    const basis = i * 4;
    if (rgba[basis + 3] < alphaSchwelle) {
      ziel[i] = -1;
      continue;
    }
    const r = rgba[basis];
    const g = rgba[basis + 1];
    const b = rgba[basis + 2];

    let bestIndex = 0;
    let besterAbstand = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const pal = palette[p];
      const dr = r - pal.r;
      const dg = g - pal.g;
      const db = b - pal.b;
      const abstand = dr * dr + dg * dg + db * db;
      if (abstand < besterAbstand) {
        besterAbstand = abstand;
        bestIndex = p;
      }
    }
    ziel[i] = bestIndex;
  }
}

/**
 * EIN Mehrheitsfilter-Durchgang (3x3) gegen Restrauschen, das der Snap an harten
 * Kantenübergängen übriglässt. Liest ausschließlich aus `quelle` und schreibt in
 * einen NEUEN Puffer – ein In-Place-Update würde je nach Scan-Richtung bereits
 * gefilterte Nachbarn nochmal einbeziehen und so reihenfolge-abhängige Ergebnisse
 * erzeugen (Determinismus-Anforderung).
 */
function mehrheitsfilter(quelle: Int16Array, breite: number, hoehe: number): Int16Array {
  const ziel = new Int16Array(quelle.length);
  const beruehrteLabels: number[] = [];
  const zaehlung = new Map<number, number>();

  for (let y = 0; y < hoehe; y++) {
    for (let x = 0; x < breite; x++) {
      const idx = y * breite + x;
      const eigenesLabel = quelle[idx];
      if (eigenesLabel === -1) {
        ziel[idx] = -1;
        continue;
      }

      zaehlung.clear();
      beruehrteLabels.length = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= hoehe) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= breite) continue;
          const nachbarLabel = quelle[ny * breite + nx];
          if (nachbarLabel === -1) continue;
          const bisher = zaehlung.get(nachbarLabel);
          if (bisher === undefined) beruehrteLabels.push(nachbarLabel);
          zaehlung.set(nachbarLabel, (bisher ?? 0) + 1);
        }
      }

      ziel[idx] = mehrheitsLabel(beruehrteLabels, zaehlung, eigenesLabel);
    }
  }

  return ziel;
}

/**
 * Häufigstes Label unter `kandidaten` (distinkte Werte, mindestens das Zentrum selbst
 * ist immer dabei). Gleichstand: eigenes Label gewinnt (Pixel bleibt lieber, wie er ist),
 * sonst der kleinste Label-Index – beides deterministisch und unabhängig von Map-
 * Iterationsreihenfolge.
 */
function mehrheitsLabel(kandidaten: number[], zaehlung: Map<number, number>, eigenesLabel: number): number {
  let bestesLabel = kandidaten[0];
  let besteAnzahl = zaehlung.get(kandidaten[0]) ?? 0;

  for (let i = 1; i < kandidaten.length; i++) {
    const label = kandidaten[i];
    const anzahl = zaehlung.get(label) ?? 0;
    if (anzahl > besteAnzahl) {
      besteAnzahl = anzahl;
      bestesLabel = label;
    } else if (anzahl === besteAnzahl) {
      if (label === eigenesLabel) {
        bestesLabel = label;
      } else if (bestesLabel !== eigenesLabel && label < bestesLabel) {
        bestesLabel = label;
      }
    }
  }
  return bestesLabel;
}
