/*
 * scripts/tests/mapping-fein.test.mjs — Unit-Tests fuer den REINEN Schritt-IV-
 * Pfad: lib/import/html-zu-puck.ts htmlZuPuckMitSegmentierung. Kein Ollama, kein
 * Dev-Server noetig — nur Outline + Fallback-Segmentierung + Mapping (offline).
 *
 * Start:  node scripts/tests/mapping-fein.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft:
 *   · aus einem Segmentier-Urteil entstehen SektionBloecke mit feinen Kindern
 *     (TextBlock/BildBlock/HtmlBlock), NICHT die Grob-Bloecke von htmlZuPuck;
 *   · img->BildBlock, h1/p->TextBlock;
 *   · Determinismus (2x gleiche Ausgabe);
 *   · Verlustschutz: jede Segment-ref landet als Baustein (kein Atom verloren);
 *   · echte Freeze-Ausgabe: der HtmlBlock-ANTEIL (html / alle Blattatome) sinkt
 *     drastisch, sektionen/texte/bilder steigen gegenueber htmlZuPuck.
 *     WICHTIG (Leon-Befund 2026-07-23): verglichen wird der ANTEIL, nicht die
 *     absolute HtmlBlock-Zahl. grob liefert wenige MONOLITHISCHE Bloecke (das
 *     ganze <header>/<main>/<footer> je EIN Block, texte==0); fein zerlegt in
 *     viele feine Blattatome (74 Texte + 23 Bilder) samt kleiner html-Reste
 *     (Links/Buttons/Canvas). Die absolute html-Zahl KANN dabei steigen (20>9) —
 *     das ist erwuenscht, nicht ein Regress. Aussagekraeftig ist einzig, dass
 *     html in fein vom dominierenden zum Rest-Format wird (Anteil ~41%→~17%).
 *
 * Muster (Selbst-Reexec + happy-dom-DOMParser) wie segmentiere.test.mjs.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.__MAP_FEIN_TEST_REEXEC) {
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
    { stdio: "inherit", env: { ...process.env, __MAP_FEIN_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile } = await import("node:fs/promises");
const { resolve, dirname } = await import("node:path");
const { existsSync } = await import("node:fs");

const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen <link href>-Pfaden
   (z.B. /_next/static/css/...) einen TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { htmlZuPuck, htmlZuPuckMitSegmentierung } = await import("../../lib/import/html-zu-puck.ts");
const { baueOutline } = await import("../../lib/import/dom-outline.ts");
const { fallbackSegmentierung } = await import("../../lib/import/gemma-contract.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const FREEZE_INDEX = resolve(HIER, "..", ".freeze-out", "index.html");
const SEG_INDEX = resolve(HIER, "..", ".freeze-out", "index.segmentierung.json");

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

/** Sammelt alle Bausteine (Wurzel + Slot-Kinder rekursiv) eines Puck-Baums. */
function alleBausteine(content) {
  const out = [];
  const rein = (items) => {
    for (const it of items) {
      out.push(it);
      for (const wert of Object.values(it.props ?? {})) {
        if (Array.isArray(wert) && wert.every((e) => e && typeof e === "object" && typeof e.type === "string")) {
          rein(wert);
        }
      }
    }
  };
  rein(content);
  return out;
}
function zaehleTyp(content, typ) {
  return alleBausteine(content).filter((b) => b.type === typ).length;
}

console.log("\nMapping-Fein Unit-Tests (htmlZuPuckMitSegmentierung)\n");

/* ------------------------------------------------------------------ */
/* Synthetische Seite                                                  */
/* ------------------------------------------------------------------ */

const SYNTH = `<!doctype html><html><head>
  <link rel="stylesheet" href="/styles.css">
</head><body><main>
  <section class="hero"><h1>Willkommen</h1><p>Untertitel Text</p><img src="a.png" alt="Bild"></section>
  <section class="mission"><h2>Mission</h2><p>Wir tun Gutes fuer die Welt heute.</p></section>
  <footer><p>Impressum</p></footer>
</main></body></html>`;

const synthOutline = baueOutline(SYNTH).knoten;
const synthSeg = fallbackSegmentierung(synthOutline);

await test("Mapping: jede Sektion wird ein SektionBlock mit feinen Kindern", () => {
  const b = htmlZuPuckMitSegmentierung(SYNTH, synthSeg);
  const sektionen = b.data.content.filter((c) => c.type === "SektionBlock");
  assert(sektionen.length >= 1, `erwartet >=1 SektionBlock, war ${sektionen.length}`);
  assertGleich(b.statistik.sektionen, sektionen.length, "statistik.sektionen == SektionBloecke");
  /* Kinder liegen im Slot props.kinder, nicht auf oberster Ebene. */
  for (const s of sektionen) {
    assert(Array.isArray(s.props.kinder) && s.props.kinder.length > 0, "SektionBlock hat Kinder im Slot");
  }
});

await test("Mapping: img->BildBlock, h1/p->TextBlock", () => {
  const b = htmlZuPuckMitSegmentierung(SYNTH, synthSeg);
  assert(zaehleTyp(b.data.content, "BildBlock") >= 1, "mind. 1 BildBlock aus dem img");
  assert(zaehleTyp(b.data.content, "TextBlock") >= 3, "h1 + 2x p + footer-p => mind. 3 TextBlock");
});

await test("Mapping: Verlustschutz — jede Segment-ref wird ein Baustein", () => {
  const b = htmlZuPuckMitSegmentierung(SYNTH, synthSeg);
  const refAnzahl = synthSeg.sektionen.reduce((n, s) => n + s.bloecke.length, 0);
  const bausteine = zaehleTyp(b.data.content, "TextBlock") + zaehleTyp(b.data.content, "BildBlock") + zaehleTyp(b.data.content, "HtmlBlock");
  assertGleich(bausteine, refAnzahl, "Baustein-Anzahl == Segment-ref-Anzahl (nichts verloren)");
});

await test("Mapping: deterministisch (2x identische Ausgabe)", () => {
  const a = htmlZuPuckMitSegmentierung(SYNTH, synthSeg, { idPraefix: "t" });
  const b = htmlZuPuckMitSegmentierung(SYNTH, synthSeg, { idPraefix: "t" });
  assertGleich(JSON.stringify(a.data), JSON.stringify(b.data), "gleiche Eingabe -> gleiche Data");
});

await test("Mapping: styleUebernehmen sammelt das Stylesheet statt es zu flaggen", () => {
  const b = htmlZuPuckMitSegmentierung(SYNTH, synthSeg, { styleUebernehmen: true });
  assert(b.stylesheets.includes("/styles.css"), "same-origin Stylesheet gesammelt");
});

/* ------------------------------------------------------------------ */
/* Echte Freeze-Ausgabe + echtes Segmentier-Urteil                     */
/* ------------------------------------------------------------------ */

if (existsSync(FREEZE_INDEX) && existsSync(SEG_INDEX)) {
  const echt = await readFile(FREEZE_INDEX, "utf-8");
  const seg = JSON.parse(await readFile(SEG_INDEX, "utf-8"));

  const grob = htmlZuPuck(echt, { idPraefix: "wee-v3-fein", styleUebernehmen: true });
  const fein = htmlZuPuckMitSegmentierung(echt, { sektionen: seg.sektionen }, { idPraefix: "wee-v3-fein", styleUebernehmen: true });

  await test("Freeze index.html: fein hat viele SektionBloecke (nicht 2-3 Grobbloecke)", () => {
    assert(fein.statistik.sektionen >= 4, `erwartet >=4 Sektionen, war ${fein.statistik.sektionen}`);
  });

  await test("Freeze index.html: HtmlBlock-ANTEIL sinkt drastisch (fein << grob)", () => {
    /* Anteil = HtmlBloecke / alle Blattatome (Texte+Bilder+HtmlBloecke). Die
       ABSOLUTE html-Zahl vergleichen waere Aepfel↔Birnen (grob: wenige riesige
       Monolith-Bloecke; fein: viele winzige Rest-Bloecke) — sie kann in fein
       sogar hoeher liegen. Der Fidelity-Gewinn steckt darin, dass html vom
       DOMINIERENDEN zum RESTLICHEN Format wird: der Anteil sinkt drastisch. */
    const anteil = (s) => s.htmlBloecke / (s.texte + s.bilder + s.htmlBloecke || 1);
    const grobAnteil = anteil(grob.statistik);
    const feinAnteil = anteil(fein.statistik);
    assert(
      feinAnteil < grobAnteil * 0.6,
      `fein HtmlBlock-Anteil (${(feinAnteil * 100).toFixed(1)}%) muss << grob (${(grobAnteil * 100).toFixed(1)}%)`,
    );
    console.log(`       (grob→fein  html-Anteil ${(grobAnteil * 100).toFixed(0)}%→${(feinAnteil * 100).toFixed(0)}%, htmlBloecke ${grob.statistik.htmlBloecke}→${fein.statistik.htmlBloecke}, texte ${grob.statistik.texte}→${fein.statistik.texte}, bilder ${grob.statistik.bilder}→${fein.statistik.bilder}, sektionen ${grob.statistik.sektionen}→${fein.statistik.sektionen})`);
  });

  await test("Freeze index.html: texte + bilder steigen gegenueber grob", () => {
    assert(fein.statistik.texte > grob.statistik.texte, `texte fein (${fein.statistik.texte}) > grob (${grob.statistik.texte})`);
    assert(fein.statistik.bilder >= grob.statistik.bilder, `bilder fein (${fein.statistik.bilder}) >= grob (${grob.statistik.bilder})`);
  });

  await test("Freeze index.html: Mapping deterministisch (2x identisch)", () => {
    const b = htmlZuPuckMitSegmentierung(echt, { sektionen: seg.sektionen }, { idPraefix: "wee-v3-fein", styleUebernehmen: true });
    assertGleich(JSON.stringify(fein.data), JSON.stringify(b.data), "gleiche Eingabe -> gleiche Data");
  });
} else {
  console.log(`  SKIP echte Freeze/Segmentierung (${FREEZE_INDEX} oder ${SEG_INDEX} fehlt)`);
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
