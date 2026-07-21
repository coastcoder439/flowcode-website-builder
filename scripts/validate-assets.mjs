/*
 * Asset-Validierung für den Vorhangeffekt (VORHANG-WORKFLOW-PLAN.md §2.3):
 *
 *   "Nur Flächen, keine Outlines. Daraus folgt: Elemente dürfen niemals die
 *    Hintergrundfarbe haben (sonst unsichtbar)."
 *
 * Geprüft wird für jedes public/curtain/ebene-*.png:
 *   1. Datei existiert (vollständiger Satz nach Naming-Konvention §3.2)
 *   2. PNG hat einen Alpha-Kanal und nennenswerte Transparenz (>= 25 %)
 *      – Flächen-Grafik auf transparentem Grund, kein Vollbild
 *   3. Kein sichtbarer Pixel liegt farblich nahe am Hintergrund-Verlauf
 *      (background.start → background.end aus curtain.config.json)
 *
 * Dependency-frei: eigener Mini-PNG-Decoder (8-bit RGB/RGBA,
 * non-interlaced) über Nodes eingebautes zlib.
 *
 *   node scripts/validate-assets.mjs   → Exit 0 = PASS, Exit 1 = FAIL
 */
import { readFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "public/curtain");
const config = JSON.parse(readFileSync(resolve(ROOT, "curtain.config.json"), "utf8"));

/* ---------- Mini-PNG-Decoder (8-bit, non-interlaced) ---------- */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("kein PNG");
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("IHDR fehlt");
  if (ihdr.bitDepth !== 8 || ihdr.interlace !== 0)
    throw new Error(`nicht unterstützt: bitDepth=${ihdr.bitDepth} interlace=${ihdr.interlace}`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.colorType];
  if (!channels) throw new Error(`colorType ${ihdr.colorType} nicht unterstützt`);

  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels;
  const stride = ihdr.width * bpp;
  const out = Buffer.alloc(ihdr.height * stride);

  let p = 0;
  for (let y = 0; y < ihdr.height; y++) {
    const filter = raw[p++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[p + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= bpp && prev ? prev[x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          val = rawByte + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Filter ${filter} unbekannt`);
      }
      row[x] = val & 0xff;
    }
    p += stride;
  }
  return { ...ihdr, channels, pixels: out };
}

/* ---------- Farb-Regeln ---------- */

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/* Verbotene Zone: der gesamte Hintergrund-Verlauf start→end, gesampelt */
const bgStops = [];
const s = hex(config.background.start);
const e = hex(config.background.end);
for (let t = 0; t <= 10; t++) {
  bgStops.push([
    s[0] + ((e[0] - s[0]) * t) / 10,
    s[1] + ((e[1] - s[1]) * t) / 10,
    s[2] + ((e[2] - s[2]) * t) / 10,
  ]);
}
const TOLERANCE = 26; // euklidische RGB-Distanz

function nearBackground(r, g, b) {
  for (const [br, bg_, bb] of bgStops) {
    const d = Math.hypot(r - br, g - bg_, b - bb);
    if (d < TOLERANCE) return true;
  }
  return false;
}

/* ---------- Prüfen ---------- */

/* Zu prüfende Assets: alle in der Config referenzierten Baum-Sprites */
const FILES = [
  ...new Set(
    Object.entries(config.layers)
      .filter(([key]) => key.startsWith("ebene-"))
      .flatMap(([, plane]) =>
        ["links", "rechts"].flatMap((side) =>
          (plane[side] ?? []).map((tree) => `trees/${tree.file}`),
        ),
      ),
  ),
];

const report = { pass: true, files: {} };

for (const name of FILES) {
  const path = resolve(DIR, name);
  const entry = { checks: {} };
  report.files[name] = entry;

  if (!existsSync(path)) {
    entry.checks.exists = "FAIL (fehlt)";
    report.pass = false;
    continue;
  }
  entry.checks.exists = "PASS";

  let img;
  try {
    img = decodePng(readFileSync(path));
  } catch (err) {
    entry.checks.decode = `FAIL (${err.message})`;
    report.pass = false;
    continue;
  }

  if (img.channels !== 4) {
    entry.checks.alpha = "FAIL (kein Alpha-Kanal)";
    report.pass = false;
    continue;
  }

  let transparent = 0;
  let visible = 0;
  let bgHits = 0;
  const total = img.width * img.height;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const a = img.pixels[o + 3];
    if (a < 16) {
      transparent++;
    } else {
      visible++;
      if (nearBackground(img.pixels[o], img.pixels[o + 1], img.pixels[o + 2])) bgHits++;
    }
  }

  const tRatio = transparent / total;
  entry.checks.transparenz =
    tRatio >= 0.25 ? `PASS (${(tRatio * 100).toFixed(0)} % transparent)` : `FAIL (nur ${(tRatio * 100).toFixed(0)} % transparent – Flächen-Grafik auf transparentem Grund erwartet)`;
  if (tRatio < 0.25) report.pass = false;

  const bgRatio = visible ? bgHits / visible : 0;
  entry.checks.hintergrundfarbe =
    bgRatio <= 0.01
      ? `PASS (${(bgRatio * 100).toFixed(2)} % der sichtbaren Pixel in BG-Nähe)`
      : `FAIL (${(bgRatio * 100).toFixed(1)} % der sichtbaren Pixel liegen im Hintergrund-Verlauf ${config.background.start}→${config.background.end} – Element würde unsichtbar)`;
  if (bgRatio > 0.01) report.pass = false;
}

report.files["titelbild"] = {
  checks: {
    exists:
      existsSync(resolve(DIR, "titelbild.jpg")) || existsSync(resolve(DIR, "titelbild.png"))
        ? "PASS"
        : "FAIL (titelbild.jpg|png fehlt – Ziel des Dissolves)",
  },
};
if (report.files["titelbild"].checks.exists.startsWith("FAIL")) report.pass = false;

console.log(JSON.stringify(report, null, 1));
process.exit(report.pass ? 0 : 1);
