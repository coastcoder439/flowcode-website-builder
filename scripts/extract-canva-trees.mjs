/*
 * Extrahiert die Einzelbäume aus dem Canva-Referenzexport als freigestellte
 * Sprite-PNGs (pixelgenau per Flood-Fill – keine Rechteck-Crop-Fragmente
 * überlappender Nachbarn).
 *
 * Ausgabe: .assets-src/trees/tree-{reihe}-{index}.png + trees-manifest.json
 * (reihe 1 = oberste Reihe = hinterste Ebene 3, Plan §2.2; index von links).
 *
 *   node scripts/extract-canva-trees.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng, encodePng } from "./lib-png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
/* Quelle als Argument übergebbar: node extract-canva-trees.mjs <datei.png> */
const SRC = resolve(
  HERE,
  ".assets-src",
  process.argv[2] ?? "canva-baeume-transparent.png",
);
const OUT = resolve(HERE, ".assets-src/trees");
mkdirSync(OUT, { recursive: true });

const img = decodePng(readFileSync(SRC));
const { width: W, height: H } = img;
const ALPHA_MIN = 24;
/* auflösungsunabhängig: ~0,05 % der Bildfläche (Streuartefakte-Filter) */
const MIN_PIXELS = Math.round(W * H * 0.0005);

/* ---------- Flood-Fill-Komponenten (8er-Nachbarschaft, iterativ) ---------- */

const label = new Int32Array(W * H).fill(-1);
const comps = [];
const stack = new Int32Array(W * H);

for (let start = 0; start < W * H; start++) {
  if (label[start] !== -1) continue;
  if (img.pixels[start * 4 + 3] <= ALPHA_MIN) continue;

  const id = comps.length;
  let sp = 0;
  stack[sp++] = start;
  label[start] = id;
  const comp = { id, count: 0, x0: W, x1: 0, y0: H, y1: 0, sumY: 0 };

  while (sp > 0) {
    const idx = stack[--sp];
    const x = idx % W;
    const y = (idx / W) | 0;
    comp.count++;
    comp.sumY += y;
    if (x < comp.x0) comp.x0 = x;
    if (x > comp.x1) comp.x1 = x;
    if (y < comp.y0) comp.y0 = y;
    if (y > comp.y1) comp.y1 = y;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nIdx = ny * W + nx;
        if (label[nIdx] !== -1) continue;
        if (img.pixels[nIdx * 4 + 3] <= ALPHA_MIN) continue;
        label[nIdx] = id;
        stack[sp++] = nIdx;
      }
    }
  }
  comps.push(comp);
}

/* Reihen-Trennlinien: sehr breite, flache Komponenten (vom Nutzer als
   explizite Ebenen-Marker eingefügt) – liefern die Band-Grenzen und
   werden NICHT als Sprites exportiert. */
const isSeparator = (c) =>
  c.x1 - c.x0 > W * 0.5 && c.y1 - c.y0 < H * 0.04;

const separators = comps
  .filter((c) => c.count >= 200 && isSeparator(c))
  .map((c) => (c.y0 + c.y1) / 2)
  .sort((a, b) => a - b);

const trees = comps.filter((c) => c.count >= MIN_PIXELS && !isSeparator(c));
console.log(
  `Komponenten gesamt: ${comps.length}, Trennlinien: ${separators.length}, Bäume (>=${MIN_PIXELS}px): ${trees.length}`,
);

/* ---------- Reihen-Zuordnung ---------- */

trees.forEach((t) => (t.cy = t.sumY / t.count));

if (separators.length === 2) {
  /* explizite Marker des Nutzers */
  trees.forEach((t) => {
    t.row = t.cy < separators[0] ? 1 : t.cy < separators[1] ? 2 : 3;
  });
} else {
  /* Fallback: größte zwei Lücken im y-Schwerpunkt trennen die Reihen */
  const sorted = [...trees].sort((a, b) => a.cy - b.cy);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++)
    gaps.push({ i, gap: sorted[i].cy - sorted[i - 1].cy });
  gaps.sort((a, b) => b.gap - a.gap);
  const cuts = gaps.slice(0, 2).map((g) => g.i).sort((a, b) => a - b);
  sorted.forEach((t, i) => {
    t.row = i < cuts[0] ? 1 : i < cuts[1] ? 2 : 3;
  });
}

/* ---------- Sprites schreiben (maskiert: nur eigene Komponenten-Pixel) ---------- */

const manifest = [];
for (const row of [1, 2, 3]) {
  const inRow = trees.filter((t) => t.row === row).sort((a, b) => a.x0 - b.x0);
  inRow.forEach((t, i) => {
    const w = t.x1 - t.x0 + 1;
    const h = t.y1 - t.y0 + 1;
    const rgba = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcIdx = (t.y0 + y) * W + (t.x0 + x);
        if (label[srcIdx] === t.id) {
          img.pixels.copy(rgba, (y * w + x) * 4, srcIdx * 4, srcIdx * 4 + 4);
        }
      }
    }
    const file = `tree-${row}-${i}.png`;
    writeFileSync(resolve(OUT, file), encodePng(w, h, rgba));
    manifest.push({ row, index: i, w, h, file });
  });
}

writeFileSync(
  resolve(HERE, ".assets-src/trees-manifest.json"),
  JSON.stringify(manifest, null, 1),
);
console.log(
  "Manifest:",
  [1, 2, 3]
    .map((r) => `Reihe ${r}: ${manifest.filter((m) => m.row === r).length} Bäume`)
    .join(" | "),
);
