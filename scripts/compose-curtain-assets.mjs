/*
 * Komponiert die Vorhang-Ebenen-Assets aus den freigestellten Canva-
 * Baum-Sprites (erzeugt von extract-canva-trees.mjs).
 *
 * Reihen-Mapping (Plan §2.2): Reihe 1 (oben) → ebene-3 (hinterste,
 * simpel) … Reihe 3 (unten) → ebene-1 (vorderste, am filigransten).
 * Links/Rechts bekommen UNTERSCHIEDLICHE Bäume derselben Reihe
 * (keine Spiegelung). Bäume stehen am Boden (bottom-bündig).
 *
 *   node scripts/extract-canva-trees.mjs   (einmalig davor)
 *   node scripts/compose-curtain-assets.mjs
 *   node scripts/validate-assets.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const TREES = resolve(HERE, ".assets-src/trees");
const TMP = resolve(HERE, ".tmp");
const OUT = resolve(ROOT, "public/curtain");
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const manifest = JSON.parse(
  readFileSync(resolve(HERE, ".assets-src/trees-manifest.json"), "utf8"),
);
const byRow = (row) => manifest.filter((m) => m.row === row);

/* ---------- Kompositionen (heightPct relativ zur Asset-Höhe 1000) ----------
   tree-Index wird modulo Reihenlänge aufgelöst; ausgeschlossene Bäume
   (Farbregel §2.3, validate-assets-Befunde) im Kommentar. */
const PLANS = {
  "ebene-3": {
    row: 1,
    links: [
      { tree: 0, heightPct: 60, x: 0, bottom: 40 },
      { tree: 2, heightPct: 48, x: 240, bottom: 42 },
      { tree: 4, heightPct: 38, x: 460, bottom: 46 },
    ],
    rechts: [
      { tree: 1, heightPct: 60, x: 0, bottom: 40 },
      { tree: 3, heightPct: 46, x: 250, bottom: 42 },
      { tree: 5, heightPct: 38, x: 470, bottom: 46 },
    ],
  },
  "ebene-2": {
    row: 2,
    links: [
      { tree: 1, heightPct: 76, x: 0, bottom: 18 },
      { tree: 3, heightPct: 58, x: 300, bottom: 18 },
    ],
    rechts: [
      { tree: 4, heightPct: 76, x: 0, bottom: 18 },
      { tree: 0, heightPct: 56, x: 310, bottom: 18 },
    ],
  },
  "ebene-1": {
    row: 3,
    links: [
      { tree: 1, heightPct: 90, x: 0, bottom: 0 },
      { tree: 3, heightPct: 66, x: 330, bottom: 0 },
    ],
    rechts: [
      /* tree 4 verletzte als Rechteck-Crop die BG-Farbregel – mit
         maskierten Sprites neu prüfbar; vorerst konservativ tree 2 */
      { tree: 2, heightPct: 90, x: 0, bottom: 0 },
      { tree: 0, heightPct: 66, x: 340, bottom: 0 },
    ],
  },
};

/* ---------- HTML-Kompositor + Edge-Render ---------- */

const W = 720;
const H = 1000;

function assetHtml(plan, side) {
  const row = byRow(plan.row);
  const items = plan[side]
    .map((p) => {
      const t = row[p.tree % row.length];
      const targetH = (p.heightPct / 100) * H;
      const targetW = (t.w / t.h) * targetH;
      const xCss = side === "links" ? `left:${p.x}px;` : `right:${p.x}px;`;
      const url = `file:///${resolve(TREES, t.file).replace(/\\/g, "/")}`;
      return `<img src="${url}" style="position:absolute;${xCss}bottom:${p.bottom}px;width:${targetW.toFixed(1)}px;height:${targetH.toFixed(1)}px;" />`;
    })
    .join("\n");
  return `<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;width:${W}px;height:${H}px;overflow:hidden}</style></head>
<body>${items}</body></html>`;
}

for (const [layer, plan] of Object.entries(PLANS)) {
  for (const side of ["links", "rechts"]) {
    const name = `${layer}-${side}`;
    const htmlPath = resolve(TMP, `${name}.html`);
    const pngPath = resolve(OUT, `${name}.png`);
    writeFileSync(htmlPath, assetHtml(plan, side));
    execFileSync(EDGE, [
      "--headless=new",
      "--disable-gpu",
      "--default-background-color=00000000",
      `--window-size=${W},${H}`,
      `--screenshot=${pngPath}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ]);
    console.log("geschrieben:", pngPath);
  }
}
console.log("Fertig. Jetzt: node scripts/validate-assets.mjs");
