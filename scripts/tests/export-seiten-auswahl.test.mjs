/*
 * scripts/tests/export-seiten-auswahl.test.mjs — Unit-Tests fuer die reine
 * Seiten-Auswahl des Multi-Page-Exports (app/editor/export-seiten-auswahl.ts,
 * Station 4 / X3). Spec: docs/plan-analyse/lens-preview-export.md §3-S3 + E5.
 *
 * Start:  node scripts/tests/export-seiten-auswahl.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft (AAA-Muster): Zuordnung „aktive Website" → Seiten-Set an den echten
 * seiten/wee-v3-fein*-Namen (Startseite + Unterseiten, Fremd-Seite
 * „wee-website-v3" ausgeschlossen), Slug-Ableitung, Praefix-Segmentgrenze,
 * Startseite-zuerst-Reihung, verwaiste/leere aktive Website.
 *
 * WARUM Selbst-Reexec: die Quelle ist TypeScript (erasable) — einmal mit
 * --experimental-transform-types neu starten, ts-ext-loader.mjs haengt `.ts` an
 * (bewaehrtes Repo-Muster, s. ordner-export.test.mjs). Das Modul ist DOM-frei.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

if (!process.env.__EXPORT_AUSWAHL_TEST_REEXEC) {
  const ladeHook = new URL("../lib/ts-ext-loader.mjs", import.meta.url).href;
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-transform-types",
      "--import",
      ladeHook,
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", env: { ...process.env, __EXPORT_AUSWAHL_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { waehleWebsiteSeiten } = await import("../../app/editor/export-seiten-auswahl.ts");

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

/* Reale Seiten-Namen (Ausschnitt aus seiten/): eine ganze Website
   „wee-v3-fein" (Start + Unterseiten) plus eine FREMDE Seite. */
const ECHTE_NAMEN = [
  "wee-v3-fein-404",
  "wee-v3-fein-bildung-aquaponik",
  "wee-v3-fein-bildung",
  "wee-v3-fein-organisation-team",
  "wee-v3-fein-organisation",
  "wee-v3-fein",
  "wee-website-v3", // fremde Seite — darf NICHT zur Website „wee-v3-fein" zaehlen
];

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

test("Startseite (Name === aktiv) kommt zuerst und ist istStart", () => {
  // Arrange
  const namen = ECHTE_NAMEN;
  // Act
  const plan = waehleWebsiteSeiten(namen, "wee-v3-fein");
  // Assert
  assert.equal(plan[0].name, "wee-v3-fein");
  assert.equal(plan[0].istStart, true);
  assert.equal(plan[0].slug, "");
});

test("Unterseiten bekommen istStart=false und Slug ohne aktiv-Praefix", () => {
  // Arrange
  const namen = ECHTE_NAMEN;
  // Act
  const plan = waehleWebsiteSeiten(namen, "wee-v3-fein");
  const nachName = Object.fromEntries(plan.map((p) => [p.name, p]));
  // Assert
  assert.equal(nachName["wee-v3-fein-bildung"].istStart, false);
  assert.equal(nachName["wee-v3-fein-bildung"].slug, "bildung");
  assert.equal(nachName["wee-v3-fein-bildung-aquaponik"].slug, "bildung-aquaponik");
  assert.equal(nachName["wee-v3-fein-organisation-team"].slug, "organisation-team");
});

test("Fremde Seite (kein aktiv-Praefix) wird ausgeschlossen", () => {
  // Arrange
  const namen = ECHTE_NAMEN;
  // Act
  const plan = waehleWebsiteSeiten(namen, "wee-v3-fein");
  // Assert
  assert.ok(!plan.some((p) => p.name === "wee-website-v3"));
  assert.equal(plan.length, 6); // Start + 5 Unterseiten
});

test("Unterseiten sind alphabetisch nach Namen (deterministisch), Start zuerst", () => {
  // Arrange
  const namen = ECHTE_NAMEN;
  // Act
  const plan = waehleWebsiteSeiten(namen, "wee-v3-fein");
  const namenReihe = plan.map((p) => p.name);
  // Assert
  assert.deepEqual(namenReihe, [
    "wee-v3-fein",
    "wee-v3-fein-404",
    "wee-v3-fein-bildung",
    "wee-v3-fein-bildung-aquaponik",
    "wee-v3-fein-organisation",
    "wee-v3-fein-organisation-team",
  ]);
});

test("Praefix greift nur an der Segmentgrenze (aktiv- mit Trenn-Strich)", () => {
  // Arrange: „wee-v3" ist ein echter Teil-Substring von „wee-v3-fein…",
  // aber als aktive Website soll es NUR an der „-"-Grenze matchen.
  const namen = ["wee-v3", "wee-v3-fein", "wee-v3neben"];
  // Act
  const plan = waehleWebsiteSeiten(namen, "wee-v3");
  const namenReihe = plan.map((p) => p.name);
  // Assert: „wee-v3" (Start) + „wee-v3-fein" (Unter); „wee-v3neben" NICHT.
  assert.deepEqual(namenReihe, ["wee-v3", "wee-v3-fein"]);
  assert.equal(plan.find((p) => p.name === "wee-v3-fein").slug, "fein");
});

test("Verwaiste aktive Website (Start fehlt): nur Unterseiten, kein istStart", () => {
  // Arrange: die Startseite „wee-v3-fein" fehlt in der Liste.
  const namen = ["wee-v3-fein-bildung", "wee-v3-fein-404"];
  // Act
  const plan = waehleWebsiteSeiten(namen, "wee-v3-fein");
  // Assert
  assert.equal(plan.length, 2);
  assert.ok(plan.every((p) => p.istStart === false));
});

test("Leerer / whitespace aktiv-Name → leerer Plan", () => {
  // Arrange
  const namen = ECHTE_NAMEN;
  // Act + Assert
  assert.deepEqual(waehleWebsiteSeiten(namen, ""), []);
  assert.deepEqual(waehleWebsiteSeiten(namen, "   "), []);
});

test("Leere Namensliste → leerer Plan", () => {
  // Arrange + Act + Assert
  assert.deepEqual(waehleWebsiteSeiten([], "wee-v3-fein"), []);
});

/* ------------------------------------------------------------------ */
/* Abschluss                                                           */
/* ------------------------------------------------------------------ */

console.log(`\n  ${bestanden} bestanden, ${fehlgeschlagen} fehlgeschlagen`);
process.exit(fehlgeschlagen === 0 ? 0 : 1);
