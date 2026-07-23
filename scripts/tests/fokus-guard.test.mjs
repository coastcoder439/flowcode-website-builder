/*
 * scripts/tests/fokus-guard.test.mjs — Unit-Tests fuer den zentralen
 * Fokus-Guard (components/undo/fokus-guard.ts, U3 / Ziel-Architektur §2.4).
 *
 * Start:  node scripts/tests/fokus-guard.test.mjs   (Exit 0 = alles gruen)
 *
 * Geprueft: sollUndoShortcutGreifen (Slider greift, Textfeld nicht — der N9-
 * Kern) und istEingabeFokussiert (breite Alt-Regel fuer Pfeil-/Esc-Tasten).
 * Der Guard klassifiziert per Duck-Typing (nicht instanceof HTMLElement), also
 * genuegen schlichte {tagName,type,isContentEditable}-Attrappen ohne DOM.
 *
 * TS-Import wie undo-bus.test.mjs: einmal mit --experimental-transform-types
 * re-exec, damit `import("…fokus-guard.ts")` unabhaengig vom Node-Default laeuft.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit TS-Transform ---- */
if (!process.env.__FOKUS_GUARD_TEST_REEXEC) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-transform-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __FOKUS_GUARD_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { sollUndoShortcutGreifen, istEingabeFokussiert, greiftBusBei } = await import(
  "../../components/undo/fokus-guard.ts"
);

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

/** Attrappe eines fokussierten Elements (Duck-Typing genuegt dem Guard). */
function feld(tagName, type, isContentEditable = false) {
  return { tagName, type, isContentEditable };
}

console.log("\nFokus-Guard Unit-Tests (components/undo/fokus-guard.ts)\n");

/* ------------------------------------------------------------------ */
/* 1 · sollUndoShortcutGreifen — der N9-Kern                            */
/* ------------------------------------------------------------------ */

test("Slider (input[type=range]) → Bus greift (N9)", () => {
  assertGleich(sollUndoShortcutGreifen(feld("INPUT", "range")), true, "range");
});

test("Textfeld (input[type=text]) → Bus greift NICHT (natives Zeichen-Undo)", () => {
  assertGleich(sollUndoShortcutGreifen(feld("INPUT", "text")), false, "text");
});

test("input ohne type (Default text) → Bus greift NICHT", () => {
  assertGleich(sollUndoShortcutGreifen(feld("INPUT", undefined)), false, "kein type");
});

test("input[type=number] (Textcursor) → Bus greift NICHT", () => {
  assertGleich(sollUndoShortcutGreifen(feld("INPUT", "number")), false, "number");
});

test("search/url/email/tel/password → Bus greift NICHT", () => {
  for (const t of ["search", "url", "email", "tel", "password"]) {
    assertGleich(sollUndoShortcutGreifen(feld("INPUT", t)), false, t);
  }
});

test("checkbox/radio/button/submit/reset → Bus greift", () => {
  for (const t of ["checkbox", "radio", "button", "submit", "reset"]) {
    assertGleich(sollUndoShortcutGreifen(feld("INPUT", t)), true, t);
  }
});

test("TEXTAREA → Bus greift NICHT", () => {
  assertGleich(sollUndoShortcutGreifen(feld("TEXTAREA", undefined)), false, "textarea");
});

test("contentEditable → Bus greift NICHT", () => {
  assertGleich(sollUndoShortcutGreifen(feld("DIV", undefined, true)), false, "contenteditable");
});

test("SELECT → Bus greift", () => {
  assertGleich(sollUndoShortcutGreifen(feld("SELECT", undefined)), true, "select");
});

test("Buehne/Body/Nicht-Element (null) → Bus greift", () => {
  assertGleich(sollUndoShortcutGreifen(null), true, "null");
  assertGleich(sollUndoShortcutGreifen(feld("DIV", undefined)), true, "div");
  assertGleich(sollUndoShortcutGreifen({}), true, "kein tagName");
});

/* Case-Insensitivitaet des Typs (der Guard lowercased). */
test("Gross-/Kleinschreibung des type egal (RANGE == range)", () => {
  assertGleich(sollUndoShortcutGreifen(feld("INPUT", "RANGE")), true, "RANGE");
});

/* ------------------------------------------------------------------ */
/* 2 · greiftBusBei — die reine Entscheidung direkt                    */
/* ------------------------------------------------------------------ */

test("greiftBusBei(null) → true", () => {
  assertGleich(greiftBusBei(null), true, "null");
});

test("greiftBusBei range/text konsistent zur Wrapper-Funktion", () => {
  assertGleich(greiftBusBei({ tag: "INPUT", typ: "range", contentEditable: false }), true, "range");
  assertGleich(greiftBusBei({ tag: "INPUT", typ: "text", contentEditable: false }), false, "text");
});

/* ------------------------------------------------------------------ */
/* 3 · istEingabeFokussiert — breite Alt-Regel (Pfeile/Esc)            */
/* ------------------------------------------------------------------ */

test("istEingabeFokussiert: JEDES input (auch Slider) → true", () => {
  assertGleich(istEingabeFokussiert(feld("INPUT", "range")), true, "range");
  assertGleich(istEingabeFokussiert(feld("INPUT", "text")), true, "text");
});

test("istEingabeFokussiert: TEXTAREA/contentEditable → true", () => {
  assertGleich(istEingabeFokussiert(feld("TEXTAREA", undefined)), true, "textarea");
  assertGleich(istEingabeFokussiert(feld("DIV", undefined, true)), true, "contenteditable");
});

test("istEingabeFokussiert: Buehne/Body/null → false", () => {
  assertGleich(istEingabeFokussiert(null), false, "null");
  assertGleich(istEingabeFokussiert(feld("DIV", undefined)), false, "div");
  assertGleich(istEingabeFokussiert(feld("SELECT", undefined)), false, "select");
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
