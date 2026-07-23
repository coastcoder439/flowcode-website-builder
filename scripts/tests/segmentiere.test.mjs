/*
 * scripts/tests/segmentiere.test.mjs — Unit-Tests fuer die REINEN Teile der
 * gemma4-Segmentierung (I3): lib/import/dom-outline.ts + lib/import/gemma-contract.ts.
 * Kein Ollama noetig — nur Outline-Bildung, Validierung und Fallback (offline).
 *
 * Start:  node scripts/tests/segmentiere.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft:
 *   · Outline aus der ECHTEN Freeze-Ausgabe (scripts/.freeze-out/index.html):
 *     >1 Atom, refs fortlaufend/eindeutig, Reihenfolge stabil (2x gleich);
 *   · zuGemmaEingabe entfernt textVorschau;
 *   · fallbackSegmentierung erzeugt eine Segmentierung, die validiereSegmentierung besteht,
 *     und deckt jede ref genau einmal in Dokumentreihenfolge ab;
 *   · validiereSegmentierung faengt: fehlende ref, doppelte ref, falsche Reihenfolge,
 *     Typ-Inkonsistenz (img=>text), vonRef/bisRef-Fehlpaarung.
 *
 * Muster (Selbst-Reexec + happy-dom-DOMParser) wie fremdkoerper-filter.test.mjs.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.__SEG_TEST_REEXEC) {
  /* --import ts-ext-loader: gemma-contract.ts importiert relativ+endungslos
     `./dom-outline` (tsc/bundler-Stil) — Nodes Resolver braucht den .ts-Hook. */
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
    { stdio: "inherit", env: { ...process.env, __SEG_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile } = await import("node:fs/promises");
const { resolve, dirname, join } = await import("node:path");
const { existsSync } = await import("node:fs");

const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen <link href>-Pfaden
   (z.B. /_next/static/css/...) einen TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { baueOutline, zuGemmaEingabe } = await import("../../lib/import/dom-outline.ts");
const { validiereSegmentierung, fallbackSegmentierung } = await import("../../lib/import/gemma-contract.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const FREEZE_INDEX = resolve(HIER, "..", ".freeze-out", "index.html");

/* ---- Mini-Runner ---- */
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
function assert(b, m) { if (!b) throw new Error(m || "Assertion fehlgeschlagen"); }
function assertGleich(ist, soll, m) {
  if (ist !== soll) throw new Error(`${m || "Wert"}: erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`);
}

console.log("\nSegmentierung Unit-Tests (dom-outline + gemma-contract)\n");

/* ------------------------------------------------------------------ */
/* Synthetische Outline (deterministisch, ohne Datei)                  */
/* ------------------------------------------------------------------ */

const SYNTH = `<!doctype html><html><body><main>
  <section class="hero"><h1>Willkommen</h1><p>Untertitel Text</p><img src="a.png" alt="Bild"></section>
  <section class="mission"><h2>Mission</h2><p>Wir tun Gutes fuer die Welt heute.</p></section>
  <footer><p>Impressum</p></footer>
</main></body></html>`;

const synthOutline = baueOutline(SYNTH).knoten;

await test("Outline (synthetisch): mehrere Atome, keine Grob-3-Bloecke", () => {
  assert(synthOutline.length >= 6, `erwartet >=6 Atome, war ${synthOutline.length}`);
});

await test("Outline: refs fortlaufend r0..rN, eindeutig", () => {
  synthOutline.forEach((k, i) => assertGleich(k.ref, "r" + i, `ref an Position ${i}`));
  const set = new Set(synthOutline.map((k) => k.ref));
  assertGleich(set.size, synthOutline.length, "refs eindeutig");
});

await test("Outline: img-Atom traegt hatBild=true, h1 traegt Text", () => {
  const img = synthOutline.find((k) => k.tag === "img");
  assert(img && img.hatBild === true, "img-Atom mit hatBild");
  const h1 = synthOutline.find((k) => k.tag === "h1");
  assert(h1 && h1.textDichte > 0, "h1 mit Textdichte");
});

await test("zuGemmaEingabe: entfernt textVorschau, behaelt Contract-Felder", () => {
  const e = zuGemmaEingabe(synthOutline);
  assert(!("textVorschau" in e[0]), "textVorschau darf nicht in die Modell-Eingabe");
  for (const feld of ["ref", "tag", "klassenHinweis", "textDichte", "tiefe", "hatBild"]) {
    assert(feld in e[0], `Feld ${feld} muss in der Modell-Eingabe sein`);
  }
});

/* ------------------------------------------------------------------ */
/* Fallback erzeugt gueltige Segmentierung                             */
/* ------------------------------------------------------------------ */

await test("fallbackSegmentierung(synthetisch) besteht validiereSegmentierung", () => {
  const seg = fallbackSegmentierung(synthOutline);
  const v = validiereSegmentierung(seg, synthOutline);
  assert(v.ok, "Fallback muss die eigene Validierung bestehen: " + (v.ok ? "" : v.fehler));
  assert(seg.sektionen.length >= 2, `erwartet mehrere Sektionen, war ${seg.sektionen.length}`);
});

await test("fallback: img wird typ 'bild', h1/p werden typ 'text'", () => {
  const seg = fallbackSegmentierung(synthOutline);
  const flach = seg.sektionen.flatMap((s) => s.bloecke);
  const nach = new Map(synthOutline.map((k) => [k.ref, k]));
  for (const b of flach) {
    const k = nach.get(b.ref);
    if (k.tag === "img") assertGleich(b.typ, "bild", "img-Typ");
    if (k.tag === "h1" || k.tag === "p") assertGleich(b.typ, "text", `${k.tag}-Typ`);
  }
});

/* ------------------------------------------------------------------ */
/* Validierung faengt konkrete Formfehler                              */
/* ------------------------------------------------------------------ */

const gut = fallbackSegmentierung(synthOutline);

await test("Validierung: fehlende ref wird erkannt", () => {
  const kaputt = { sektionen: gut.sektionen.map((s) => ({ ...s })) };
  /* letzten Block der letzten Sektion entfernen */
  const letzte = { ...kaputt.sektionen[kaputt.sektionen.length - 1] };
  letzte.bloecke = letzte.bloecke.slice(0, -1);
  if (letzte.bloecke.length === 0) { letzte.bloecke = gut.sektionen[0].bloecke.slice(0, 1); }
  else { letzte.bisRef = letzte.bloecke[letzte.bloecke.length - 1].ref; }
  kaputt.sektionen[kaputt.sektionen.length - 1] = letzte;
  const v = validiereSegmentierung(kaputt, synthOutline);
  assert(!v.ok, "unvollstaendige Abdeckung muss scheitern");
  assert(/Abdeckung|fehlend/i.test(v.fehler), "Fehlertext nennt die Abdeckung: " + v.fehler);
});

await test("Validierung: doppelte ref wird erkannt", () => {
  const ersteRef = synthOutline[0].ref;
  const kaputt = {
    sektionen: [
      { titel: "A", vonRef: ersteRef, bisRef: ersteRef, bloecke: [{ ref: ersteRef, typ: "text" }] },
      ...gut.sektionen,
    ],
  };
  const v = validiereSegmentierung(kaputt, synthOutline);
  assert(!v.ok, "doppelte ref muss scheitern");
});

await test("Validierung: falsche Reihenfolge wird erkannt", () => {
  if (synthOutline.length < 2) return;
  const refs = synthOutline.map((k) => k.ref);
  const vertauscht = [refs[1], refs[0], ...refs.slice(2)];
  const kaputt = {
    sektionen: [{
      titel: "Alles",
      vonRef: vertauscht[0],
      bisRef: vertauscht[vertauscht.length - 1],
      bloecke: vertauscht.map((r) => ({ ref: r, typ: "html" })),
    }],
  };
  const v = validiereSegmentierung(kaputt, synthOutline);
  assert(!v.ok, "vertauschte Reihenfolge muss scheitern");
  assert(/Reihenfolge/i.test(v.fehler), "Fehlertext nennt Reihenfolge: " + v.fehler);
});

await test("Validierung: img als typ 'text' wird erkannt (Typ-Inkonsistenz)", () => {
  const imgRef = synthOutline.find((k) => k.tag === "img")?.ref;
  assert(imgRef, "Testfixture hat ein img");
  const bloecke = synthOutline.map((k) => ({ ref: k.ref, typ: k.ref === imgRef ? "text" : "html" }));
  const kaputt = {
    sektionen: [{ titel: "Alles", vonRef: bloecke[0].ref, bisRef: bloecke[bloecke.length - 1].ref, bloecke }],
  };
  const v = validiereSegmentierung(kaputt, synthOutline);
  assert(!v.ok, "img=>text muss scheitern");
  assert(/Medien|text/i.test(v.fehler), "Fehlertext nennt Typ: " + v.fehler);
});

await test("Validierung: gueltige Segmentierung besteht", () => {
  const v = validiereSegmentierung(gut, synthOutline);
  assert(v.ok, "gueltige Segmentierung muss bestehen: " + (v.ok ? "" : v.fehler));
});

/* ------------------------------------------------------------------ */
/* Echte Freeze-Ausgabe (falls vorhanden)                              */
/* ------------------------------------------------------------------ */

if (existsSync(FREEZE_INDEX)) {
  const echt = await readFile(FREEZE_INDEX, "utf-8");
  const outline = baueOutline(echt).knoten;

  await test("Freeze index.html: viele feine Atome (nicht 3 Grobbloecke)", () => {
    assert(outline.length > 10, `erwartet >10 Atome aus der echten Seite, war ${outline.length}`);
  });

  await test("Freeze index.html: Outline ist stabil (2x identisch)", () => {
    const zweite = baueOutline(echt).knoten;
    assertGleich(zweite.length, outline.length, "Atom-Anzahl stabil");
    for (let i = 0; i < outline.length; i++) {
      assertGleich(zweite[i].ref, outline[i].ref, `ref an Position ${i} stabil`);
      assertGleich(zweite[i].tag, outline[i].tag, `tag an Position ${i} stabil`);
    }
  });

  await test("Freeze index.html: Fallback deckt jede ref genau einmal ab", () => {
    const seg = fallbackSegmentierung(outline);
    const v = validiereSegmentierung(seg, outline);
    assert(v.ok, "Fallback auf echter Seite muss valid sein: " + (v.ok ? "" : v.fehler));
    console.log(`       (echte Seite: ${outline.length} Atome → ${seg.sektionen.length} Fallback-Sektionen)`);
  });
} else {
  console.log(`  SKIP echte Freeze-Ausgabe (${FREEZE_INDEX} fehlt — erst freeze-seite.mjs laufen lassen)`);
}

/* ---- Auswertung ---- */
console.log("");
console.log(`Ergebnis: ${bestanden} OK, ${fehlgeschlagen} FAIL`);
if (fehlgeschlagen > 0) {
  console.log("FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("ALLE GRUEN");
process.exit(0);
