/*
 * scripts/tests/fremdkoerper-filter.test.mjs — Unit-Tests fuer den reinen
 * Fremdkoerper-/Framework-Filter (lib/import/fremdkoerper-filter.ts, N15).
 * Kein Test-Framework im Projekt → reines Node-Skript mit Mini-Runner.
 *
 * Start:  node scripts/tests/fremdkoerper-filter.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft (I2-Deliverable):
 *   · gegen die ECHTE test-sites/wee-website-v3/out/index.html: das site-gate
 *     wird entfernt, genau 1 Flag, /_next/static/ als Framework erkannt;
 *   · ein HTML OHNE Gate bleibt unveraendert (entfernt: [], Inhalt erhalten);
 *   · erkenntFramework unterscheidet next-static vs. unbekannt.
 *
 * WARUM Selbst-Reexec: der Filter ist TypeScript (erasable) — wir starten uns
 * einmal mit --experimental-transform-types neu (bewaehrtes Repo-Muster, s.
 * scripts/import-ben.mjs / scripts/tests/undo-bus.test.mjs).
 * WARUM happy-dom: der Filter braucht `DOMParser` (im Browser vorhanden); in
 * Node stellen wir ihn ueber das bereits installierte happy-dom bereit (reines
 * Parsen, kein Ausfuehren).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit TS-Transform ---- */
if (!process.env.__FREMDKOERPER_TEST_REEXEC) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-transform-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __FREMDKOERPER_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile } = await import("node:fs/promises");
const { resolve, dirname } = await import("node:path");

/* DOMParser als Global bereitstellen, BEVOR der Filter geladen wird. */
const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen <link href>-Pfaden
   (z.B. /_next/static/css/...) einen TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { entferneFremdkoerper, erkenntFramework } = await import("../../lib/import/fremdkoerper-filter.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const OUT_INDEX = resolve(HIER, "..", "..", "test-sites", "wee-website-v3", "out", "index.html");

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

console.log("\nFremdkoerper-Filter Unit-Tests (lib/import/fremdkoerper-filter.ts)\n");

/* ------------------------------------------------------------------ */
/* 1 · Echter Testfall: out/index.html                                 */
/* ------------------------------------------------------------------ */

const echtHtml = await readFile(OUT_INDEX, "utf-8");

await test("out/index.html: enthaelt das site-gate als Fremdkoerper (Vorbedingung)", () => {
  assert(echtHtml.includes("site-gate__panel"), "Testfixture sollte das Passwort-Gate enthalten");
});

await test("out/index.html: site-gate wird entfernt, GENAU 1 Flag", () => {
  const r = entferneFremdkoerper(echtHtml);
  assertGleich(r.entfernt.length, 1, "Anzahl entfernter Fremdkoerper");
  assertGleich(r.entfernt[0].selector, ".site-gate", "Treffer-Selektor (spezifischste Regel zuerst)");
  assert(!r.html.includes("site-gate__panel"), "Gate-Panel darf danach nicht mehr im Markup stehen");
  assert(!r.html.includes('class="site-gate"'), "Gate-Wurzel darf danach nicht mehr im Markup stehen");
  assert(r.entfernt[0].beschreibung.length > 0, "jeder Treffer traegt eine Begruendung");
});

await test("out/index.html: Framework wird als next-static erkannt (/_next/static/)", () => {
  const fw = erkenntFramework(echtHtml);
  assertGleich(fw.typ, "next-static", "Framework-Typ");
  assert(fw.marker.includes("/_next/static/"), "Marker /_next/static/ gelistet");
});

await test("out/index.html: echter Seiteninhalt bleibt nach dem Filtern erhalten", () => {
  const r = entferneFremdkoerper(echtHtml);
  /* Der Filter darf NUR das Gate anfassen — z.B. der <footer> bleibt. */
  assert(r.html.includes("footer"), "Seiteninhalt (footer) muss erhalten bleiben");
});

/* ------------------------------------------------------------------ */
/* 2 · HTML ohne Gate bleibt unveraendert                              */
/* ------------------------------------------------------------------ */

await test("HTML ohne Gate: unveraendert, keine Flags", () => {
  const roh = "<!doctype html><html><head></head><body><main><h1>Hallo</h1><p>Welt</p></main></body></html>";
  const r = entferneFremdkoerper(roh);
  assertGleich(r.entfernt.length, 0, "keine Fremdkoerper → keine Flags");
  assertGleich(r.html, roh, "ohne Treffer wird die Original-Zeichenkette unveraendert zurueckgegeben");
});

await test("HTML ohne Gate: Framework unbekannt (kein /_next/static/)", () => {
  const fw = erkenntFramework("<html><body><h1>rein statisch</h1></body></html>");
  assertGleich(fw.typ, "unbekannt", "Framework-Typ ohne Next-Marker");
  assertGleich(fw.marker.length, 0, "keine Marker");
});

/* ------------------------------------------------------------------ */
/* 3 · Synthetischer Gate-Fall: nur EIN Flag trotz Doppel-Regel        */
/* ------------------------------------------------------------------ */

await test("Synthetisches Gate: .site-gate + role=dialog treffen denselben Knoten → 1 Flag", () => {
  const roh =
    '<html><body><main><h1>Inhalt</h1></main>' +
    '<div class="site-gate" role="dialog" aria-modal="true" aria-label="Passwortschutz">' +
    '<form class="site-gate__panel"><input type="password"/></form></div></body></html>';
  const r = entferneFremdkoerper(roh);
  assertGleich(r.entfernt.length, 1, "derselbe Knoten wird nur EINMAL gezaehlt");
  assert(!r.html.includes("site-gate"), "Gate vollstaendig entfernt");
  assert(r.html.includes("<h1>Inhalt</h1>"), "eigentlicher Inhalt bleibt erhalten");
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
