/*
 * scripts/tests/css-rewrite.test.mjs — Unit-Tests fuer die reine, AST-basierte
 * CSS-url()-Reparatur (lib/import/css-rewrite.ts, Import-Endlevel Schritt V / M7).
 * Kein Test-Framework im Projekt → reines Node-Skript mit Mini-Runner.
 *
 * Start:  node scripts/tests/css-rewrite.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft (I5-Deliverable):
 *   · gegen die ECHTE Next-Font-CSS (test-sites/.../ab46371bceea4ec2.css):
 *     genau die 8 woff2-Fonts werden als lokale Refs erkannt, die vielen
 *     data:image/svg-Hintergruende NICHT;
 *   · schreibeCssUrls rebased nur gemappte Refs, laesst data: unberuehrt;
 *   · loeseCssPfad loest relative (../) und root-relative Pfade korrekt auf;
 *   · rootAufScope ersetzt :root NUR im Selektor (nicht in content:/url()/
 *     Kommentar) — genau die alte Regex-Grenze aus SeitenStyles.tsx;
 *   · kaputtes CSS bricht nichts (leere Liste / unveraendert).
 *
 * WARUM Selbst-Reexec: das Modul ist TypeScript (erasable) — einmal mit
 * --experimental-transform-types neu starten (bewaehrtes Repo-Muster). KEIN
 * happy-dom noetig: postcss/value-parser/selector-parser sind reines JS.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit TS-Transform ---- */
if (!process.env.__CSS_REWRITE_TEST_REEXEC) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-transform-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __CSS_REWRITE_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile } = await import("node:fs/promises");
const { resolve, dirname } = await import("node:path");

const { sammleCssAssets, schreibeCssUrls, rootAufScope, loeseCssPfad } = await import(
  "../../lib/import/css-rewrite.ts"
);

const HIER = dirname(fileURLToPath(import.meta.url));
const FONT_CSS = resolve(
  HIER, "..", "..", "test-sites", "wee-website-v3", "out", "_next", "static", "css", "ab46371bceea4ec2.css",
);

/* ------------------------------------------------------------------ */
/* Mini-Test-Runner                                                    */
/* ------------------------------------------------------------------ */

let bestanden = 0;
let fehlgeschlagen = 0;

async function test(name, fn) {
  try {
    await fn();
    bestanden++;
    console.log(`  OK   ${name}`);
  } catch (err) {
    fehlgeschlagen++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err && err.message ? err.message : err}`);
  }
}

function assert(bedingung, nachricht) {
  if (!bedingung) throw new Error(nachricht || "Assertion fehlgeschlagen");
}

function assertGleich(ist, soll, nachricht) {
  if (ist !== soll) {
    throw new Error(`${nachricht || "Wert"}: erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`);
  }
}

console.log("\nCSS-url()-Reparatur Unit-Tests (lib/import/css-rewrite.ts)\n");

/* ------------------------------------------------------------------ */
/* 1 · Echte Next-Font-CSS: nur woff2-Fonts, keine data:-SVGs          */
/* ------------------------------------------------------------------ */

const fontCss = await readFile(FONT_CSS, "utf-8");

await test("Font-CSS: enthaelt die woff2-Font-Verweise (Vorbedingung)", () => {
  assert(fontCss.includes("/_next/static/media/") && /\.woff2\)/i.test(fontCss), "Fixture erwartet woff2-Fonts");
});

await test("Font-CSS: genau die 8 woff2-Fonts als lokale Refs, keine data:-SVG", () => {
  const refs = sammleCssAssets(fontCss, "_next/static/css");
  assertGleich(refs.length, 8, "Anzahl lokaler Font-Refs (aus 29 Vorkommen dedupliziert)");
  assert(refs.every((r) => /\.woff2$/i.test(r.name)), "alle Refs sind woff2-Fonts");
  assert(!refs.some((r) => r.rohUrl.startsWith("data:")), "kein data:-SVG faelschlich als lokal");
  assert(refs.every((r) => r.pfad.startsWith("_next/static/media/")), "root-relativ zur Ordnerwurzel aufgeloest");
});

await test("Font-CSS: schreibeCssUrls rebased gemappte Fonts, laesst data: unberuehrt", () => {
  const refs = sammleCssAssets(fontCss, "_next/static/css");
  const urlMap = {};
  for (const r of refs) urlMap[r.rohUrl] = `/import/testslug/${r.name}`;
  const { css, geparst } = schreibeCssUrls(fontCss, urlMap);
  assert(geparst, "CSS wurde geparst");
  assert(css.includes("/import/testslug/"), "neue Ziel-URLs eingesetzt");
  assert(!css.includes("/_next/static/media/"), "keine alte Font-URL mehr uebrig");
  const vorher = (fontCss.match(/data:image\/svg/g) || []).length;
  const nachher = (css.match(/data:image\/svg/g) || []).length;
  assertGleich(nachher, vorher, "data:-SVG-Hintergruende bleiben unveraendert");
});

/* ------------------------------------------------------------------ */
/* 2 · Pfad-Aufloesung (rein, ohne node:path)                          */
/* ------------------------------------------------------------------ */

await test("loeseCssPfad: relativer ../-Pfad wird gegen das CSS-Verzeichnis aufgeloest", () => {
  assertGleich(loeseCssPfad("_next/static/css", "../media/x.woff2"), "_next/static/media/x.woff2");
});

await test("loeseCssPfad: root-relativer Pfad loest ab der Ordnerwurzel auf", () => {
  assertGleich(loeseCssPfad("_next/static/css", "/assets/font.woff2"), "assets/font.woff2");
});

await test("loeseCssPfad: Query/Hash werden fuer die Datei-Suche abgeschnitten", () => {
  assertGleich(loeseCssPfad("css", "a.woff2?v=3#iefix"), "css/a.woff2");
});

/* ------------------------------------------------------------------ */
/* 3 · sammleCssAssets: externe Verweise werden nie mitkopiert         */
/* ------------------------------------------------------------------ */

await test("Externe/Fragment-Verweise (http/data/#) werden ignoriert", () => {
  const css =
    '@font-face{src:url(https://cdn.example/a.woff2)}\n' +
    '.a{background:url(data:image/png;base64,AAAA)}\n' +
    '.b{clip-path:url(#frag)}\n' +
    '.c{background:url(//cdn.example/b.png)}\n' +
    '.d{background:url(bild.png)}';
  const refs = sammleCssAssets(css, "");
  assertGleich(refs.length, 1, "nur der lokale Verweis zaehlt");
  assertGleich(refs[0].name, "bild.png", "der lokale Verweis ist bild.png");
});

/* ------------------------------------------------------------------ */
/* 4 · rootAufScope: AST-Grenze (das war der SeitenStyles-Regex-Bug)   */
/* ------------------------------------------------------------------ */

await test("rootAufScope: :root-Selektor wird zu :scope", () => {
  const rs = rootAufScope(":root{--c:red}");
  assert(/:scope\s*\{/.test(rs) && !rs.includes(":root"), ":root-Selektor ersetzt");
});

await test("rootAufScope: :root in content:/url()/Kommentar bleibt UNBERUEHRT", () => {
  const css = '.a::before{content:":root"}\n/* :root */\n.b{background:url("img/:root.png")}';
  const rs = rootAufScope(css);
  assert(rs.includes('content:":root"'), 'content-String ":root" unveraendert');
  assert(rs.includes("/* :root */"), "Kommentar unveraendert");
  assert(rs.includes('url("img/:root.png")'), "url()-String unveraendert");
  assert(!rs.includes(":scope"), "keine faelschliche :scope-Ersetzung");
});

await test("rootAufScope: .my-root (Klasse ohne Pseudo) bleibt unveraendert", () => {
  const rs = rootAufScope(".my-root{color:blue}");
  assert(rs.includes(".my-root") && !rs.includes(":scope"), "Klassenname mit -root nicht angefasst");
});

/* ------------------------------------------------------------------ */
/* 5 · Fehlertoleranz: kaputtes CSS bricht nichts                      */
/* ------------------------------------------------------------------ */

await test("Kaputtes CSS: sammleCssAssets → leere Liste (kein Wurf)", () => {
  assertGleich(sammleCssAssets("total kaputt {{{ [[[", "").length, 0);
});

await test("Kaputtes CSS: schreibeCssUrls → Original + geparst=false", () => {
  const kaputt = "total kaputt {{{ [[[";
  const r = schreibeCssUrls(kaputt, { x: "/y" });
  assertGleich(r.geparst, false, "geparst=false bei Syntaxfehler");
  assertGleich(r.css, kaputt, "Original unveraendert zurueck");
});

/* ------------------------------------------------------------------ */
/* Auswertung                                                          */
/* ------------------------------------------------------------------ */

console.log("");
console.log(`Ergebnis: ${bestanden} OK, ${fehlgeschlagen} FAIL`);
if (fehlgeschlagen > 0) {
  console.log("FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("ALLE GRUEN");
process.exit(0);
