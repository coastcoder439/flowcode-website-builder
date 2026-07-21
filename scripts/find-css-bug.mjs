/*
 * Findet die CSS-Regel, an der der Production-Build scheitert.
 * cssnano parst beim Minifizieren JEDEN Selektor und wirft dort
 * "Unexpected '/'". Ein Selektor darf kein nacktes / enthalten — hier laeuft
 * postcss ueber jede Datei und meldet jede Regel, deren Selektor eines hat.
 * Das sagt WELCHE Regel es ist, statt nur eine Zeilennummer im fertigen
 * Buendel.
 *
 * Beruehrt .next NICHT, stoert also keinen laufenden Dev-Server.
 * Lauf:  node scripts/find-css-bug.mjs
 */

import { readFileSync } from "node:fs";
import postcss from "postcss";

const DATEIEN = [
  "app/design-tokens.css",
  "app/globals.css",
  "components/grafik/grafik-editor.css",
  "components/grafik/grafik-layer.css",
  "components/river/river-birth.css",
  "components/river/river-kurs-editor.css",
  "components/river/river.css",
  "components/title-curtain/title-curtain.css",
];

let treffer = 0;

for (const datei of DATEIEN) {
  let css;
  try {
    css = readFileSync(datei, "utf8");
  } catch {
    console.log(`(nicht da: ${datei})`);
    continue;
  }

  let wurzel;
  try {
    wurzel = postcss.parse(css, { from: datei });
  } catch (e) {
    console.log(`\n!!! ${datei} — postcss kann die Datei nicht parsen: ${e.message}`);
    treffer++;
    continue;
  }

  wurzel.walkRules((regel) => {
    if (regel.selector.includes("/")) {
      const zeile = regel.source?.start?.line ?? "?";
      console.log(`\n!!! TREFFER  ${datei}:${zeile}`);
      console.log(`    Selektor: ${JSON.stringify(regel.selector.slice(0, 200))}`);
      treffer++;
    }
  });

  /* Auch At-Regeln pruefen (@media/@supports-Bedingungen laufen durch einen
     eigenen Parser, koennen aber ebenso stolpern). */
  wurzel.walkAtRules((at) => {
    if (at.params.includes("/") && !at.params.includes("url(")) {
      const zeile = at.source?.start?.line ?? "?";
      console.log(`\n?   At-Regel  ${datei}:${zeile}  @${at.name} ${at.params.slice(0, 120)}`);
    }
  });
}

console.log(
  treffer === 0
    ? "\nKeine Regel hat ein / im Selektor — die Ursache liegt woanders (evtl. in einer CSS-Datei aus node_modules oder in styled-jsx)."
    : `\n${treffer} problematische Stelle(n).`,
);
