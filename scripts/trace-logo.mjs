/*
 * trace-logo.mjs – Exakter Silhouetten-Trace des WEE-Logo-Tropfens (F1b).
 *
 *   node scripts/trace-logo.mjs
 *
 * Liest public/images/logo-weiss.png (512x512 RGBA), baut aus dem
 * Alpha-Kanal (Schwelle 24) die GEFÜLLTE Tropfen-Silhouette (das Logo
 * besteht aus 22 Teilflächen mit Löchern – für den fallenden Tropfen zählt
 * nur die Außenform: Löcher werden per Flood-Fill von außen geschlossen).
 * Das Logo hat zusätzlich 6 frei schwebende Blätter AUSSERHALB der
 * Tropfenkontur – die gehören nicht zur Tropfen-Form, deshalb wird nur die
 * größte zusammenhängende Komponente (= der Tropfen) getraced: äußere
 * Kontur per Marching Squares, Douglas-Peucker-Vereinfachung, Ausgabe nach
 * components/river/logo-drop-path.ts.
 *
 * Zur Selbstkontrolle rastert das Skript das Ergebnis-Polygon zurück auf
 * 512x512 und meldet die Überlappung (IoU) mit der Silhouette – Ziel >=95%.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodePng } from "./lib-png.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LOGO = ROOT + "public/images/logo-weiss.png";
const OUT = ROOT + "components/river/logo-drop-path.ts";
const ALPHA_SCHWELLE = 24;
/* Douglas-Peucker-Toleranz in Pixel (512er-Raster): glatt, aber formtreu
   (1.0 = knapp über dem Pixel-Treppen-Rauschen: glatt, ~100-200 Stützpunkte). */
const DP_TOLERANZ = 1.0;

/* ---------------- 1. Alpha-Maske + gefüllte Silhouette ---------------- */

const png = decodePng(readFileSync(LOGO));
const W = png.width;
const H = png.height;

const maske = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  maske[i] = png.pixels[i * 4 + 3] > ALPHA_SCHWELLE ? 1 : 0;
}

/* Flood-Fill von den Bildrändern über transparente Pixel: alles, was von
   außen NICHT erreichbar ist, gehört zur gefüllten Silhouette. */
const aussen = new Uint8Array(W * H);
const stapel = [];
for (let x = 0; x < W; x++) {
  if (!maske[x]) stapel.push(x);
  if (!maske[(H - 1) * W + x]) stapel.push((H - 1) * W + x);
}
for (let y = 0; y < H; y++) {
  if (!maske[y * W]) stapel.push(y * W);
  if (!maske[y * W + W - 1]) stapel.push(y * W + W - 1);
}
for (const i of stapel) aussen[i] = 1;
while (stapel.length) {
  const i = stapel.pop();
  const x = i % W;
  const y = (i / W) | 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const j = ny * W + nx;
    if (!aussen[j] && !maske[j]) {
      aussen[j] = 1;
      stapel.push(j);
    }
  }
}
const gefuellt = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) gefuellt[i] = aussen[i] ? 0 : 1;

/* Größte 4er-zusammenhängende Komponente = der Tropfen (die 6 schwebenden
   Blätter daneben fallen raus). */
const silhouette = new Uint8Array(W * H);
let silFlaeche = 0;
{
  const gesehen = new Uint8Array(W * H);
  let besteGroesse = 0;
  let beste = null;
  for (let i = 0; i < W * H; i++) {
    if (!gefuellt[i] || gesehen[i]) continue;
    const komp = [i];
    const queue = [i];
    gesehen[i] = 1;
    while (queue.length) {
      const k = queue.pop();
      const x = k % W;
      const y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (gefuellt[j] && !gesehen[j]) {
          gesehen[j] = 1;
          komp.push(j);
          queue.push(j);
        }
      }
    }
    if (komp.length > besteGroesse) {
      besteGroesse = komp.length;
      beste = komp;
    }
  }
  if (!beste) throw new Error("keine Silhouetten-Komponente gefunden");
  for (const i of beste) silhouette[i] = 1;
  silFlaeche = besteGroesse;
}

/* ---------------- 2. Marching Squares (äußere Kontur) ----------------- */

/** Pixel-Abfrage mit Rand = 0. */
function pix(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  return silhouette[y * W + x];
}

/* Startpunkt: erster gesetzter Pixel (Zeilen-Scan) – seine linke obere
   Ecke ist ein Konturpunkt. Der Walk läuft auf dem Eckpunkt-Gitter; der
   Zellzustand kommt aus den 4 angrenzenden Pixeln. Sattel-Fälle (6/9)
   werden über die vorherige Laufrichtung aufgelöst (Standard-Verfahren). */
let startX = -1;
let startY = -1;
suche: for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (silhouette[y * W + x]) {
      startX = x;
      startY = y;
      break suche;
    }
  }
}
if (startX < 0) throw new Error("Silhouette leer – kein Startpixel gefunden");

const kontur = [];
{
  let x = startX;
  let y = startY;
  let vorher = null;
  do {
    const ol = pix(x - 1, y - 1);
    const or_ = pix(x, y - 1);
    const ul = pix(x - 1, y);
    const ur = pix(x, y);
    let zustand = 0;
    if (ol) zustand |= 1;
    if (or_) zustand |= 2;
    if (ul) zustand |= 4;
    if (ur) zustand |= 8;

    let richtung;
    switch (zustand) {
      case 1: richtung = "hoch"; break;
      case 2: richtung = "rechts"; break;
      case 3: richtung = "rechts"; break;
      case 4: richtung = "links"; break;
      case 5: richtung = "hoch"; break;
      case 6: richtung = vorher === "hoch" ? "links" : "rechts"; break;
      case 7: richtung = "rechts"; break;
      case 8: richtung = "runter"; break;
      case 9: richtung = vorher === "rechts" ? "hoch" : "runter"; break;
      case 10: richtung = "runter"; break;
      case 11: richtung = "runter"; break;
      case 12: richtung = "links"; break;
      case 13: richtung = "hoch"; break;
      case 14: richtung = "links"; break;
      default:
        throw new Error(`Marching Squares: ungültiger Zustand ${zustand} bei ${x},${y}`);
    }
    kontur.push([x, y]);
    if (richtung === "hoch") y--;
    else if (richtung === "runter") y++;
    else if (richtung === "links") x--;
    else x++;
    vorher = richtung;
    if (kontur.length > W * H) throw new Error("Kontur-Walk terminiert nicht");
  } while (x !== startX || y !== startY);
}

/* ---------------- 3. Douglas-Peucker-Vereinfachung -------------------- */

function senkrechtAbstand(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

function douglasPeucker(punkte, toleranz) {
  if (punkte.length < 3) return punkte;
  let maxAbstand = 0;
  let index = 0;
  const a = punkte[0];
  const b = punkte[punkte.length - 1];
  for (let i = 1; i < punkte.length - 1; i++) {
    const d = senkrechtAbstand(punkte[i], a, b);
    if (d > maxAbstand) {
      maxAbstand = d;
      index = i;
    }
  }
  if (maxAbstand <= toleranz) return [a, b];
  const links = douglasPeucker(punkte.slice(0, index + 1), toleranz);
  const rechts = douglasPeucker(punkte.slice(index), toleranz);
  return links.slice(0, -1).concat(rechts);
}

/* Geschlossenes Polygon: an den zwei am weitesten entfernten Punkten in
   zwei offene Ketten teilen, beide getrennt vereinfachen. */
let fernIndex = 1;
{
  let fern = 0;
  for (let i = 1; i < kontur.length; i++) {
    const d = Math.hypot(kontur[i][0] - kontur[0][0], kontur[i][1] - kontur[0][1]);
    if (d > fern) {
      fern = d;
      fernIndex = i;
    }
  }
}
const kette1 = douglasPeucker(kontur.slice(0, fernIndex + 1), DP_TOLERANZ);
const kette2 = douglasPeucker(kontur.slice(fernIndex).concat([kontur[0]]), DP_TOLERANZ);
const vereinfacht = kette1.slice(0, -1).concat(kette2.slice(0, -1));

/* ---------------- 4. Selbstkontrolle: IoU gegen Silhouette ------------ */

/** Scanline-Füllung (even-odd) des Polygons auf dem Pixelraster. */
function rasterisiere(poly) {
  const raster = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const yc = y + 0.5;
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      if (y1 === y2) continue;
      if ((yc >= y1 && yc < y2) || (yc >= y2 && yc < y1)) {
        xs.push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const von = Math.max(0, Math.ceil(xs[k] - 0.5));
      const bis = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = von; x <= bis; x++) raster[y * W + x] = 1;
    }
  }
  return raster;
}

const raster = rasterisiere(vereinfacht);
let schnitt = 0;
let vereinigung = 0;
for (let i = 0; i < W * H; i++) {
  if (raster[i] && silhouette[i]) schnitt++;
  if (raster[i] || silhouette[i]) vereinigung++;
}
const iou = schnitt / vereinigung;

/* ---------------- 5. TypeScript-Modul schreiben ----------------------- */

/* Koordinaten auf den Bildmittelpunkt zentrieren (Logo wird als ganzes
   512er-Bild gerendert → Elementmitte == Bildmitte): RiverBirth kann den
   Pfad direkt um (0,0) skalieren/squashen. */
const cx = W / 2;
const cy = H / 2;
const d =
  vereinfacht
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${(x - cx).toFixed(1)},${(y - cy).toFixed(1)}`)
    .join(" ") + " Z";

const ts = `/*
 * logo-drop-path.ts – generiert via trace-logo.mjs, NICHT von Hand editieren.
 *
 * Exakte äußere Silhouette des WEE-Logo-Tropfens (public/images/logo-weiss.png,
 * Alpha-Schwelle ${ALPHA_SCHWELLE}, Marching Squares + Douglas-Peucker ${DP_TOLERANZ}px,
 * ${vereinfacht.length} Punkte). IoU gegen die gefüllte Tropfen-Komponente des
 * Logo-Alphas (ohne die 6 schwebenden Blätter daneben): ${(iou * 100).toFixed(2)}%.
 *
 * Koordinaten: zentriert auf die Bildmitte des ${W}x${H}er Logos – ein Punkt
 * (0,0) im Pfad entspricht der Mitte des gerenderten Logo-<img>. Skalierung
 * auf Anzeigegröße: faktor = gerenderteLogoBreitePx / LOGO_DROP_IMG_SIZE.
 */

/** Kantenlänge des Quell-Logos in Pixel (quadratisch). */
export const LOGO_DROP_IMG_SIZE = ${W};

/** Äußere Tropfen-Silhouette, zentriert auf (0,0). */
export const LOGO_DROP_PATH =
  "${d}";
`;

writeFileSync(OUT, ts);
console.log(
  `Kontur: ${kontur.length} Punkte roh -> ${vereinfacht.length} vereinfacht | ` +
    `Silhouette ${silFlaeche}px | IoU ${(iou * 100).toFixed(2)}% | -> ${OUT}`,
);
if (iou < 0.95) {
  console.error("WARNUNG: IoU unter 95% – Toleranz/Trace prüfen!");
  process.exitCode = 1;
}
