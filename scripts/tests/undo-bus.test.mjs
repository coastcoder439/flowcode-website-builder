/*
 * scripts/tests/undo-bus.test.mjs — Unit-Tests fuer die reine Undo-Kern-Logik
 * (components/undo/coalesce.ts). Kein Test-Framework im Projekt → reines
 * Node-Skript mit eigenem Mini-Runner.
 *
 * Start:  node scripts/tests/undo-bus.test.mjs   (Exit 0 = alles gruen)
 *
 * Geprueft (U0-Deliverable): Coalesce-Fenster (600 ms), Gruppen-Schluessel,
 * Limit 50, Redo-Invalidierung nach neuem Push, Scope-Trennung (inkl.
 * Bruecken-Adapter).
 *
 * TS-Import: coalesce.ts ist reine Typ-TS (erasable). Wir re-exec einmal mit
 * --experimental-transform-types (bewaehrtes Repo-Muster, s. scripts/import-
 * ben.mjs), damit `import("…coalesce.ts")` unabhaengig vom Node-Default laeuft.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit TS-Transform ---- */
if (!process.env.__UNDO_BUS_TEST_REEXEC) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-transform-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __UNDO_BUS_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const {
  VERLAUF_LIMIT,
  VERLAUF_COALESCE_MS,
  leererStapel,
  pushMitCoalesce,
  undoSchritt,
  redoSchritt,
  erzeugeScopeSpeicher,
} = await import("../../components/undo/coalesce.ts");

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

function assert(bedingung, nachricht) {
  if (!bedingung) throw new Error(nachricht || "Assertion fehlgeschlagen");
}

function assertGleich(ist, soll, nachricht) {
  if (ist !== soll) {
    throw new Error(`${nachricht || "Wert"}: erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`);
  }
}

/** Baut einen Befehl, dessen undo/redo in ein Protokoll-Array schreiben —
 *  so laesst sich pruefen, WELCHER Befehl bei undo/redo tatsaechlich lief. */
function befehl(label, protokoll, gruppe) {
  return {
    label,
    gruppe,
    undo: () => protokoll.push(`undo:${label}`),
    redo: () => protokoll.push(`redo:${label}`),
  };
}

console.log("\nUndo-Bus Unit-Tests (components/undo/coalesce.ts)\n");

/* ------------------------------------------------------------------ */
/* 1 · Konstanten stimmen mit der Vorlage (GrafikContext) ueberein      */
/* ------------------------------------------------------------------ */

test("Konstanten: Limit 50 und Coalesce-Fenster 600 ms", () => {
  assertGleich(VERLAUF_LIMIT, 50, "VERLAUF_LIMIT");
  assertGleich(VERLAUF_COALESCE_MS, 600, "VERLAUF_COALESCE_MS");
});

/* ------------------------------------------------------------------ */
/* 2 · Coalesce-Fenster                                                */
/* ------------------------------------------------------------------ */

test("Coalesce: gleiche Gruppe innerhalb 600 ms → EIN Eintrag", () => {
  const p = protokollLos();
  let paar = leererStapel();
  paar = pushMitCoalesce(paar, befehl("A", p, "grafik:opacity:1"), 1000);
  paar = pushMitCoalesce(paar, befehl("A2", p, "grafik:opacity:1"), 1100); // +100 ms
  paar = pushMitCoalesce(paar, befehl("A3", p, "grafik:opacity:1"), 1500); // +400 ms (kumuliert < 600 je Schritt)
  assertGleich(paar.rueckgaengig.length, 1, "Stapeltiefe nach 3 Coalesce-Pushes");
  assertGleich(paar.rueckgaengig[0].label, "A", "Original-Label bleibt Rückgängig-Ziel");
});

test("Coalesce: gleiche Gruppe, Luecke ≥ 600 ms → NEUER Eintrag", () => {
  const p = protokollLos();
  let paar = leererStapel();
  paar = pushMitCoalesce(paar, befehl("A", p, "grafik:opacity:1"), 1000);
  paar = pushMitCoalesce(paar, befehl("B", p, "grafik:opacity:1"), 1600); // +600 ms = Grenze, NICHT mehr <600
  assertGleich(paar.rueckgaengig.length, 2, "Stapeltiefe bei Fenster-Grenze");
});

test("Coalesce: Undo trifft den Vor-Zustand des ERSTEN Befehls der Gruppe", () => {
  const p = protokollLos();
  let paar = leererStapel();
  paar = pushMitCoalesce(paar, befehl("erst", p, "g"), 1000);
  paar = pushMitCoalesce(paar, befehl("zweit", p, "g"), 1100);
  const { eintrag } = undoSchritt(paar);
  eintrag.undo();
  assertGleich(eintrag.label, "erst", "Label des coalesc-ten Eintrags");
  assertGleich(p.join(","), "undo:erst", "es lief der undo des ERSTEN Befehls");
});

test("Coalesce: Redo zieht auf den NEUESTEN Nach-Zustand der Gruppe nach", () => {
  const p = protokollLos();
  let paar = leererStapel();
  paar = pushMitCoalesce(paar, befehl("erst", p, "g"), 1000);
  paar = pushMitCoalesce(paar, befehl("zweit", p, "g"), 1100);
  let s = undoSchritt(paar);
  s.eintrag.undo();
  s = redoSchritt(s.paar);
  s.eintrag.redo();
  // undo stammt vom ersten, redo vom neuesten Befehl der Gruppe.
  assertGleich(p.join(","), "undo:erst,redo:zweit", "undo erst / redo zweit");
});

/* ------------------------------------------------------------------ */
/* 3 · Gruppen-Schluessel                                              */
/* ------------------------------------------------------------------ */

test("Gruppen-Schluessel: verschiedene Gruppen coalescen NICHT", () => {
  const p = protokollLos();
  let paar = leererStapel();
  paar = pushMitCoalesce(paar, befehl("A", p, "grafik:opacity:1"), 1000);
  paar = pushMitCoalesce(paar, befehl("B", p, "grafik:breite:2"), 1100); // gleiche Zeit-Naehe, andere Gruppe
  assertGleich(paar.rueckgaengig.length, 2, "verschiedene Gruppen → zwei Eintraege");
});

test("Gruppen-Schluessel: OHNE Gruppe wird nie coalesct (diskrete Aktionen)", () => {
  const p = protokollLos();
  let paar = leererStapel();
  paar = pushMitCoalesce(paar, befehl("loeschen", p), 1000);
  paar = pushMitCoalesce(paar, befehl("loeschen2", p), 1001); // 1 ms spaeter, aber keine Gruppe
  assertGleich(paar.rueckgaengig.length, 2, "gruppenlose Pushes bleiben getrennt");
});

/* ------------------------------------------------------------------ */
/* 4 · Limit 50                                                        */
/* ------------------------------------------------------------------ */

test("Limit 50: 60 diskrete Pushes → Tiefe 50, aelteste 10 fallen weg", () => {
  const p = protokollLos();
  let paar = leererStapel();
  for (let i = 0; i < 60; i++) {
    paar = pushMitCoalesce(paar, befehl(`b${i}`, p), 1000 + i * 1000);
  }
  assertGleich(paar.rueckgaengig.length, 50, "Stapeltiefe nach 60 Pushes");
  assertGleich(paar.rueckgaengig[0].label, "b10", "aeltester verbleibender Eintrag");
  assertGleich(paar.rueckgaengig[49].label, "b59", "neuester Eintrag");
});

test("Limit 50: auch der Wiederholen-Stapel ist gedeckelt", () => {
  const p = protokollLos();
  let paar = leererStapel();
  for (let i = 0; i < 55; i++) {
    paar = pushMitCoalesce(paar, befehl(`b${i}`, p), 1000 + i * 1000);
  }
  // 50 im Rückgängig; alle nach Wiederholen schieben:
  for (let i = 0; i < 50; i++) {
    const s = undoSchritt(paar);
    paar = s.paar;
  }
  assert(paar.wiederholen.length <= VERLAUF_LIMIT, "Wiederholen-Stapel ueber Limit");
  assertGleich(paar.wiederholen.length, 50, "Wiederholen-Tiefe");
});

/* ------------------------------------------------------------------ */
/* 5 · Redo-Invalidierung nach neuem Push                              */
/* ------------------------------------------------------------------ */

test("Redo-Invalidierung: neuer Push nach Undo leert die Zukunft", () => {
  const p = protokollLos();
  let paar = leererStapel();
  paar = pushMitCoalesce(paar, befehl("A", p), 1000);
  paar = pushMitCoalesce(paar, befehl("B", p), 2000);
  let s = undoSchritt(paar); // B → Wiederholen
  paar = s.paar;
  assertGleich(paar.wiederholen.length, 1, "Zukunft nach einem Undo");
  paar = pushMitCoalesce(paar, befehl("C", p), 3000); // neue Aktion
  assertGleich(paar.wiederholen.length, 0, "Zukunft nach neuem Push invalidiert");
  assertGleich(paar.rueckgaengig.length, 2, "Rückgängig: A + C");
  assertGleich(paar.rueckgaengig[1].label, "C", "oberster Eintrag");
});

/* ------------------------------------------------------------------ */
/* 6 · Scope-Trennung (ScopeSpeicher-Routing)                          */
/* ------------------------------------------------------------------ */

test("Scope-Trennung: Push im einen Scope beruehrt den anderen nicht", () => {
  const p = protokollLos();
  const bus = erzeugeScopeSpeicher();

  bus.pushScope("animator");
  bus.push(befehl("grafik-1", p));
  assertGleich(bus.aktiverScope(), "animator", "aktiver Scope nach pushScope");
  assert(bus.canUndo(), "animator sollte etwas zum Undo haben");

  bus.pushScope("puck");
  assertGleich(bus.aktiverScope(), "puck", "aktiver Scope nach zweitem pushScope");
  assert(!bus.canUndo(), "frischer puck-Scope hat NICHTS zum Undo");
  assertGleich(bus.undo(), null, "undo im leeren puck-Scope liefert null");
  assertGleich(p.length, 0, "kein fremder Befehl wurde ausgefuehrt");

  bus.popScope(); // zurueck zu animator
  assertGleich(bus.aktiverScope(), "animator", "aktiver Scope nach popScope");
  assert(bus.canUndo(), "animator-Historie ueberlebt den Scope-Wechsel");
  assertGleich(bus.undo(), "grafik-1", "animator-Undo liefert sein Label");
  assertGleich(p.join(","), "undo:grafik-1", "nur der animator-Befehl lief");
});

test("Scope-Trennung: resetHistory betrifft nur den aktiven Scope", () => {
  const p = protokollLos();
  const bus = erzeugeScopeSpeicher();
  bus.pushScope("a");
  bus.push(befehl("a1", p));
  bus.pushScope("b");
  bus.push(befehl("b1", p));
  bus.resetHistory(); // leert nur b
  assert(!bus.canUndo(), "b nach reset leer");
  bus.popScope();
  assert(bus.canUndo(), "a bleibt vom reset in b unberuehrt");
});

test("Bruecken-Adapter: delegiert undo/redo/canUndo an fremde Historie, Push ist No-Op", () => {
  const rufe = [];
  const adapter = {
    undo: () => {
      rufe.push("undo");
      return "puck-block";
    },
    redo: () => {
      rufe.push("redo");
      return "puck-block";
    },
    canUndo: () => true,
    canRedo: () => false,
  };
  const p = protokollLos();
  const bus = erzeugeScopeSpeicher();
  bus.pushScope("puck-bridge", adapter);
  bus.push(befehl("ignoriert", p)); // Bruecken-Scope nimmt keine eigenen Befehle an
  assertGleich(p.length, 0, "Push im Bruecken-Scope ist No-Op");
  assert(bus.canUndo(), "canUndo kommt vom Adapter (true)");
  assert(!bus.canRedo(), "canRedo kommt vom Adapter (false)");
  assertGleich(bus.undo(), "puck-block", "undo delegiert ans Adapter");
  assertGleich(bus.redo(), "puck-block", "redo delegiert ans Adapter");
  assertGleich(rufe.join(","), "undo,redo", "Adapter-Methoden wurden gerufen");
});

/* ------------------------------------------------------------------ */
/* Hilfen + Auswertung                                                 */
/* ------------------------------------------------------------------ */

function protokollLos() {
  return [];
}

console.log("");
console.log(`Ergebnis: ${bestanden} OK, ${fehlgeschlagen} FAIL`);
if (fehlgeschlagen > 0) {
  console.log("FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("ALLE GRUEN");
process.exit(0);
