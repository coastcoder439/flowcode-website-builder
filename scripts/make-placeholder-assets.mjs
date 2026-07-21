/*
 * Platzhalter-Assets für den v3-Vorhangeffekt (Bens Asset-Konvention, §3.2).
 *
 * Baut aus der handgezeichneten v2-Flora drei Ebenen-Paare als transparente
 * PNGs nach public/curtain/ – sofort lauffähig, später 1:1 durch Canva-/
 * Upload-Assets ersetzbar (gleiche Dateinamen, kein Code-Eingriff).
 *
 * Ebenen-Hierarchie (§2.2: je näher am Benutzer, desto filigraner):
 *   ebene-3  hinterste  – Wipfelband (simple Fläche, "Schatten")
 *   ebene-2  mittlere   – Baum (Stamm/Äste/Kronen) + Kronen-Arm
 *   ebene-1  vorderste  – dunkelste Vorder-Polster
 * Konturlinien der v2-Flora entfallen bewusst: §2.3 "Nur Flächen, keine
 * Outlines". Rechts-Assets werden fertig gespiegelt gerendert (eigenständige
 * Grafiken, keine Code-Spiegelung).
 *
 *   node scripts/make-placeholder-assets.mjs
 *
 * Voraussetzung: Microsoft Edge (headless Rendering mit transparentem BG).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = resolve(ROOT, "scripts/.tmp");
const OUT = resolve(ROOT, "public/curtain");
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

/* FLORA-Objekt aus der TS-Datei extrahieren (das Literal ist valides JSON) */
const ts = readFileSync(
  resolve(ROOT, "components/title-curtain/flora-paths.ts"),
  "utf8",
);
const start = ts.indexOf("= {") + 2;
const end = ts.lastIndexOf("};") + 1;
const FLORA = JSON.parse(ts.slice(start, end));

/* Ebenen-Definition: Pfade + eingebrannte Token-Farbe (PNG = fertiges Asset).
   Farben liegen bewusst AUSSERHALB des BG-Verlaufs #3F6E3A→#1E4530 (§2.3,
   validate-assets.mjs): hinten hell (Atmosphäre), vorn dunkel (Nähe). */
const LAYERS = {
  "ebene-3": { fill: "#72AC43", paths: (s) => s.band },
  "ebene-2": {
    fill: "#0E2117",
    paths: (s) => [...s.tree.wood, ...s.tree.crown.map((c) => c.d), ...s.armPads],
  },
  "ebene-1": { fill: "#16201A", paths: (s) => s.front },
};

function svgFor(layer, side) {
  const variant = side === "links" ? "a" : "b";
  const def = LAYERS[layer];
  const paths = def.paths(FLORA[variant])
    .map((d) => `<path d="${d}"/>`)
    .join("\n");
  /* Rechts: fertige Spiegelung ins Asset einbrennen */
  const flip = side === "rechts" ? ` transform="translate(720 0) scale(-1 1)"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 1000" width="720" height="1000">
<g fill="${def.fill}"${flip}>
${paths}
</g>
</svg>`;
}

for (const layer of Object.keys(LAYERS)) {
  for (const side of ["links", "rechts"]) {
    const name = `${layer}-${side}`;
    const svgPath = resolve(TMP, `${name}.svg`);
    const pngPath = resolve(OUT, `${name}.png`);
    writeFileSync(svgPath, svgFor(layer, side));
    execFileSync(EDGE, [
      "--headless=new",
      "--disable-gpu",
      "--default-background-color=00000000",
      "--window-size=720,1000",
      `--screenshot=${pngPath}`,
      `file:///${svgPath.replace(/\\/g, "/")}`,
    ]);
    console.log("geschrieben:", pngPath);
  }
}

/* Titelbild (Ziel des Dissolves, §3.2) – Default aus den Projekt-Assets */
const titelbild = resolve(OUT, "titelbild.jpg");
if (!existsSync(titelbild)) {
  copyFileSync(resolve(ROOT, "public/images/hero-fields-aerial.jpg"), titelbild);
  console.log("geschrieben:", titelbild, "(Default, austauschbar)");
}
