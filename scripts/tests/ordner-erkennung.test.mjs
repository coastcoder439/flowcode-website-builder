/*
 * scripts/tests/ordner-erkennung.test.mjs — Unit-Tests fuer die REINE Ordner-
 * Klassifikation lib/import/ordner-erkennung.ts (M9 + Welle 5a). Kein
 * Test-Framework im Projekt -> reines Node-Skript mit Mini-Runner.
 *
 * Start:  node scripts/tests/ordner-erkennung.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft (M9-Deliverable, „Funktion muss einen gruenen Node-Unit-Test haben"):
 *   · istNextQuellordner: package.json + app/ -> true (Quellcode-Zweig);
 *   · istNextQuellordner: package.json + next.config.mjs -> true;
 *   · istNextQuellordner: nur package.json (ohne app/ + ohne next.config) -> false;
 *   · istNextQuellordner: gebauter out/-Ordner (_next/ + index.html) -> false;
 *   · istNextQuellordner: leerer/website-freier Ordner -> false;
 *   · istNextQuellordner: verschachtelter Quellordner (unterordner/package.json
 *     + unterordner/app/...) -> true (Pfad-Praefixe greifen auch verschachtelt);
 *   · hatNextStruktur: erkennt _next/ (Wurzel, verschachtelt) und lehnt sonst ab.
 *
 * WARUM Selbst-Reexec: das Modul ist TypeScript (erasable) — wir starten uns
 * einmal mit --experimental-transform-types neu (bewaehrtes Repo-Muster, s.
 * scripts/tests/fremdkoerper-filter.test.mjs). Die Funktionen lesen nur
 * `map.keys()`, deshalb reicht als Map-Wert ein Platzhalter (der `File`-Typ ist
 * zur Laufzeit erased) — kein DOM/happy-dom noetig.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit TS-Transform ---- */
if (!process.env.__ORDNER_ERKENNUNG_TEST_REEXEC) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-transform-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __ORDNER_ERKENNUNG_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { hatNextStruktur, istNextQuellordner } = await import("../../lib/import/ordner-erkennung.ts");

/* ------------------------------------------------------------------ */
/* Mini-Test-Runner                                                    */
/* ------------------------------------------------------------------ */

let bestanden = 0;
let fehlgeschlagen = 0;

function test(name, fn) {
  try {
    fn();
    bestanden++;
    console.log(`  OK   ${name}`);
  } catch (err) {
    fehlgeschlagen++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err && err.message ? err.message : err}`);
  }
}

function assertGleich(ist, soll, nachricht) {
  if (ist !== soll) {
    throw new Error(`${nachricht || "Wert"}: erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`);
  }
}

/** Baut eine Ordner-Map aus einer Pfad-Liste (Wert ist Platzhalter — die
 *  Funktionen lesen ausschliesslich die Schluessel). */
function ordner(...pfade) {
  return new Map(pfade.map((p) => [p, {}]));
}

console.log("\nOrdner-Erkennung Unit-Tests (lib/import/ordner-erkennung.ts)\n");

/* ------------------------------------------------------------------ */
/* 1 · istNextQuellordner — der QUELLCODE-Zweig (M9: true)             */
/* ------------------------------------------------------------------ */

test("Quellordner: package.json + app/-Struktur -> true", () => {
  const map = ordner("package.json", "app/page.tsx", "app/layout.tsx", "tsconfig.json");
  assertGleich(istNextQuellordner(map), true, "package.json + app/ ist ein Quellordner");
});

test("Quellordner: package.json + next.config.mjs -> true (ohne app/)", () => {
  const map = ordner("package.json", "next.config.mjs", "components/Kopf.tsx");
  assertGleich(istNextQuellordner(map), true, "package.json + next.config.* ist ein Quellordner");
});

test("Quellordner: package.json + next.config.ts -> true", () => {
  const map = ordner("package.json", "next.config.ts");
  assertGleich(istNextQuellordner(map), true, "next.config.ts zaehlt als Next-Config");
});

test("Quellordner: verschachtelt (projekt/package.json + projekt/app/...) -> true", () => {
  const map = ordner("projekt/package.json", "projekt/app/page.tsx");
  assertGleich(istNextQuellordner(map), true, "Pfad-Praefixe greifen auch bei verschachtelter Wahl");
});

/* ------------------------------------------------------------------ */
/* 2 · istNextQuellordner — NICHT-Quellordner (M9: false)             */
/* ------------------------------------------------------------------ */

test("Kein Quellordner: nur package.json (kein app/, kein next.config) -> false", () => {
  const map = ordner("package.json", "README.md", "index.js");
  assertGleich(istNextQuellordner(map), false, "package.json allein reicht nicht");
});

test("Kein Quellordner: gebauter out/-Ordner (_next/ + index.html) -> false", () => {
  const map = ordner("index.html", "_next/static/chunks/main.js", "bild.png");
  assertGleich(istNextQuellordner(map), false, "der gebaute Export ist KEIN Quellordner (kein package.json)");
});

test("Kein Quellordner: leerer/website-freier Ordner -> false", () => {
  const map = ordner("notizen.txt", "foto.jpg");
  assertGleich(istNextQuellordner(map), false, "website-freier Ordner faellt in die alte Meldung");
});

test("Kein Quellordner: app/ ohne package.json -> false (nur package.json ist Pflicht-Anker)", () => {
  const map = ordner("app/page.tsx", "next.config.mjs");
  assertGleich(istNextQuellordner(map), false, "ohne package.json kein Quellordner-Urteil");
});

/* ------------------------------------------------------------------ */
/* 3 · hatNextStruktur — gebauter Export erkennen (Welle 5a)           */
/* ------------------------------------------------------------------ */

test("hatNextStruktur: _next/ in der Wurzel -> true", () => {
  assertGleich(hatNextStruktur(ordner("index.html", "_next/static/x.js")), true, "_next/-Praefix erkannt");
});

test("hatNextStruktur: verschachteltes /_next/ -> true", () => {
  assertGleich(hatNextStruktur(ordner("unter/_next/static/x.js")), true, "/_next/ verschachtelt erkannt");
});

test("hatNextStruktur: reine statische Seite ohne _next/ -> false", () => {
  assertGleich(hatNextStruktur(ordner("index.html", "style.css", "bild.png")), false, "kein _next/ -> false");
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
