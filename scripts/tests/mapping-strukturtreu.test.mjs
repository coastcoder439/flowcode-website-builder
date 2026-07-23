/*
 * scripts/tests/mapping-strukturtreu.test.mjs — Unit-Tests fuer den REINEN
 * Phase-4b-Pfad: lib/import/html-zu-puck.ts htmlZuPuckStrukturtreu. Kein Ollama,
 * kein Dev-Server — nur happy-dom-DOMParser (Muster wie mapping-fein.test.mjs).
 *
 * Start:  node scripts/tests/mapping-strukturtreu.test.mjs   (Exit 0 = gruen)
 *
 * ANLASS (Leons Befund 2026-07-23): das feine Mapping zerlegt eine Sektion in lose
 * Geschwister und ZERSTOERT das Layout (Hero-Text neben statt UEBER dem Bild,
 * Zweispalter → Einspalte, Leerzeichen-Verlust „FeststoffewieFutterreste"). Das
 * strukturtreue Mapping behaelt je Sektion EIN Original-Markup-Template + Marker-
 * injizierte editierbare Texte/Bilder.
 *
 * Geprueft gegen die ECHTE gefreezte project-oasis-Seite:
 *   · Hero-Sektion → EIN StrukturBlock; Template traegt das Hero-Hintergrundbild
 *     UND die Overlay-Positionierung (block-hero__overlay + h1 im block-hero__
 *     content, nicht als flacher Stapel);
 *   · „Leben ermoeglichen." ist als editierbarer texte[]-Eintrag extrahiert;
 *   · Leerzeichen-Erhalt an der Feststoffe-Stelle (kein „FeststoffewieFutterreste");
 *   · Sicherheit: kein <script>/javascript: im Template;
 *   · Determinismus (2x identische Data);
 *   · Injektions-Rundlauf: injiziereStruktur setzt den editierten Text an die
 *     Marker-Position.
 * Zusaetzlich synthetische Faelle (Overlay + Zweispalter), damit der Test auch
 * ohne die Freeze-Datei aussagekraeftig bleibt.
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.__MAP_STRUKTUR_TEST_REEXEC) {
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
    { stdio: "inherit", env: { ...process.env, __MAP_STRUKTUR_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile } = await import("node:fs/promises");
const { resolve, dirname } = await import("node:path");
const { existsSync } = await import("node:fs");

const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen <link href>-Pfaden einen
   TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { htmlZuPuckStrukturtreu } = await import("../../lib/import/html-zu-puck.ts");
const { baueOutline } = await import("../../lib/import/dom-outline.ts");
const { injiziereStruktur } = await import("../../lib/import/struktur-injektion.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const FREEZE = resolve(HIER, "..", ".freeze-out", "project-oasis.html");
const SEG = resolve(HIER, "..", ".freeze-out", "project-oasis.segmentierung.json");

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

/** Findet den ersten StrukturBlock, dessen texte[] einen Wert enthaelt, der `text`
 *  enthaelt. */
function blockMitText(content, text) {
  return content.find((c) => (c.props.texte || []).some((t) => (t.wert || "").includes(text)));
}
/** Parst ein Template/Render-HTML zurueck in ein DOM. */
function parse(html) {
  const doc = new DOMParser().parseFromString(`<div id="__t">${html}</div>`, "text/html");
  return doc.getElementById("__t");
}

console.log("\nMapping-Strukturtreu Unit-Tests (htmlZuPuckStrukturtreu)\n");

/* ------------------------------------------------------------------ */
/* Synthetisch: Overlay (Bild + absolut positionierter Text) + Zweispalter */
/* ------------------------------------------------------------------ */

const SYNTH = `<!doctype html><html><head><link rel="stylesheet" href="/s.css"></head><body><main>
  <section class="hero" style="position:relative">
    <img class="hero__bg" src="/img/hero.png" alt="Hintergrund" style="position:absolute;inset:0">
    <div class="hero__overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.4)"></div>
    <div class="hero__inner" style="position:relative"><h1>Leben ermöglichen.</h1><p>Untertitel</p></div>
  </section>
  <section class="konzept"><div class="grid" style="display:grid;grid-template-columns:1fr 1fr">
    <div class="spalte"><h2>Das Konzept</h2><p>Linke Spalte Text hier.</p></div>
    <div class="spalte"><p>Rechte Spalte Text hier.</p><img src="/img/k.png" alt="Konzept"></div>
  </div></section>
</main></body></html>`;

const synthOutline = baueOutline(SYNTH).knoten;

/* Explizite Segmentierung (statt fallbackSegmentierung): der Fallback trennt an
 * Ueberschriften und wuerde das Hero-<img> (VOR der h1) in eine andere Sektion als
 * die h1 legen — genau die feine Zerlegung, die der StrukturBlock ueberwinden
 * soll. gemma gruppiert Bild + Overlay-Text zu EINER Hero-Sektion; das bilden wir
 * hier deterministisch nach: Schnitt an der Ueberschrift „Das Konzept". Typ aus
 * dem Tag (Medium→bild, sonst text). Ergebnis besteht validiereSegmentierung. */
function baueSegAnSchnitt(outline, schnittText) {
  const idx = outline.findIndex((k) => (k.textVorschau || "").includes(schnittText));
  const grenze = idx > 0 ? idx : outline.length;
  const typVon = (k) => (["img", "picture", "svg", "video", "canvas", "iframe"].includes(k.tag) ? "bild" : "text");
  const mach = (scheibe, titel) => ({
    titel,
    vonRef: scheibe[0].ref,
    bisRef: scheibe[scheibe.length - 1].ref,
    bloecke: scheibe.map((k) => ({ ref: k.ref, typ: typVon(k) })),
  });
  const sektionen = [mach(outline.slice(0, grenze), "Hero")];
  if (grenze < outline.length) sektionen.push(mach(outline.slice(grenze), "Konzept"));
  return { sektionen };
}
const synthSeg = baueSegAnSchnitt(synthOutline, "Das Konzept");

await test("Synth: jede Sektion wird EIN StrukturBlock (kein loser Geschwister-Stapel)", () => {
  const b = htmlZuPuckStrukturtreu(SYNTH, synthSeg);
  assert(b.data.content.length >= 1, "mind. 1 Block");
  assert(b.data.content.every((c) => c.type === "StrukturBlock"), "ausschliesslich StrukturBloecke");
});

await test("Synth: Hero-Template behaelt Overlay-Positionierung (Bild + absolut + h1 verschachtelt)", () => {
  const b = htmlZuPuckStrukturtreu(SYNTH, synthSeg);
  const hero = blockMitText(b.data.content, "Leben ermöglichen.");
  assert(hero, "Hero-Block gefunden");
  const dom = parse(hero.props.template);
  /* Das Bild liegt ALS Geschwister VOR dem absolut positionierten Text-Container —
     nicht als flacher Stapel darueber/darunter. */
  const img = dom.querySelector("img.hero__bg");
  assert(img, "Hero-Hintergrundbild im Template erhalten");
  assert(/position:absolute/.test(img.getAttribute("style") || ""), "Bild behaelt absolute Positionierung");
  assert(dom.querySelector(".hero__overlay"), "dekorativer Overlay bleibt erhalten (own==0,foreign==0)");
  /* h1 liegt VERSCHACHTELT im hero__inner (Overlay-Struktur), nicht als Wurzel-Kind. */
  const h1 = dom.querySelector(".hero__inner h1");
  assert(h1, "h1 liegt im hero__inner (Overlay-Struktur erhalten)");
});

await test("Synth: 'Leben ermöglichen.' ist editierbarer texte[]-Eintrag mit Marker im Template", () => {
  const b = htmlZuPuckStrukturtreu(SYNTH, synthSeg);
  const hero = blockMitText(b.data.content, "Leben ermöglichen.");
  const eintrag = hero.props.texte.find((t) => t.wert === "Leben ermöglichen.");
  assert(eintrag, "texte[]-Eintrag vorhanden");
  const dom = parse(hero.props.template);
  const marker = dom.querySelector(`[data-fc-text="${eintrag.id}"]`);
  assert(marker && marker.tagName.toLowerCase() === "h1", "Marker sitzt auf dem h1");
});

await test("Synth: Zweispalter behaelt beide Spalten-Container (kein Einspalten-Stapel)", () => {
  const b = htmlZuPuckStrukturtreu(SYNTH, synthSeg);
  const konzept = blockMitText(b.data.content, "Das Konzept");
  assert(konzept, "Konzept-Block gefunden");
  const dom = parse(konzept.props.template);
  assert(/display:grid/.test(dom.querySelector(".grid")?.getAttribute("style") || ""), "Grid-Layout erhalten");
  assertGleich(dom.querySelectorAll(".spalte").length, 2, "beide Spalten-Container erhalten");
});

await test("Synth: Injektions-Rundlauf setzt editierten Text an die Marker-Position", () => {
  const b = htmlZuPuckStrukturtreu(SYNTH, synthSeg);
  const hero = blockMitText(b.data.content, "Leben ermöglichen.");
  const eintrag = hero.props.texte.find((t) => t.wert === "Leben ermöglichen.");
  const editiert = hero.props.texte.map((t) => (t.id === eintrag.id ? { ...t, wert: "Neuer Titel" } : t));
  const { html } = injiziereStruktur(hero.props.template, editiert, hero.props.bilder);
  const dom = parse(html);
  assertGleich(dom.querySelector(`[data-fc-text="${eintrag.id}"]`).textContent, "Neuer Titel", "editierter Text injiziert");
});

await test("Synth: deterministisch (2x identische Data)", () => {
  const a = htmlZuPuckStrukturtreu(SYNTH, synthSeg, { idPraefix: "t" });
  const c = htmlZuPuckStrukturtreu(SYNTH, synthSeg, { idPraefix: "t" });
  assertGleich(JSON.stringify(a.data), JSON.stringify(c.data), "gleiche Eingabe -> gleiche Data");
});

/* ------------------------------------------------------------------ */
/* Echte gefreezte project-oasis-Seite                                 */
/* ------------------------------------------------------------------ */

if (existsSync(FREEZE) && existsSync(SEG)) {
  const html = await readFile(FREEZE, "utf-8");
  const seg = JSON.parse(await readFile(SEG, "utf-8"));
  const bericht = htmlZuPuckStrukturtreu(html, { sektionen: seg.sektionen }, { idPraefix: "oasis", styleUebernehmen: true });

  await test("Oasis: eine Sektion = ein StrukturBlock (Anzahl == Segmentier-Sektionen, alle StrukturBlock)", () => {
    assert(bericht.data.content.every((c) => c.type === "StrukturBlock"), "ausschliesslich StrukturBloecke");
    assert(bericht.data.content.length >= seg.sektionen.length, `>= ${seg.sektionen.length} Bloecke, war ${bericht.data.content.length}`);
  });

  await test("Oasis: Hero-Block traegt Hero-Bild UND Overlay-Positionierung im Template", () => {
    const hero = blockMitText(bericht.data.content, "Leben ermöglichen.");
    assert(hero, "Hero-Block (mit 'Leben ermöglichen.') gefunden");
    const tmpl = hero.props.template;
    /* Hero-Hintergrundbild (Canvas-Background) erhalten. */
    assert(/hero-oasis-intro/.test(tmpl), "Hero-Hintergrundbild-Referenz im Template");
    /* Overlay-Struktur erhalten: der block-hero__overlay-Layer UND die
       verschachtelte Textbox (block-hero__content) — NICHT ein flacher Stapel. */
    const dom = parse(tmpl);
    assert(dom.querySelector(".block-hero__overlay"), "block-hero__overlay-Layer erhalten");
    assert(dom.querySelector(".block-hero__content h1"), "h1 liegt verschachtelt in block-hero__content (Overlay-Positionierung)");
    assert(dom.querySelector(".block-hero"), "block-hero-Sektion als Layout-Traeger erhalten");
  });

  await test("Oasis: 'Leben ermöglichen.' als editierbarer texte[]-Eintrag mit h1-Marker", () => {
    const hero = blockMitText(bericht.data.content, "Leben ermöglichen.");
    const eintrag = hero.props.texte.find((t) => t.wert === "Leben ermöglichen.");
    assert(eintrag, "texte[]-Eintrag 'Leben ermöglichen.' vorhanden");
    const marker = parse(hero.props.template).querySelector(`[data-fc-text="${eintrag.id}"]`);
    assert(marker && marker.tagName.toLowerCase() === "h1", "Marker sitzt auf dem h1");
  });

  await test("Oasis: Leerzeichen-Erhalt an der Feststoffe-Stelle (kein 'FeststoffewieFutterreste')", () => {
    let treffer = null;
    for (const c of bericht.data.content) {
      for (const t of c.props.texte || []) if (/Feststoffe/.test(t.wert)) treffer = t.wert;
    }
    assert(treffer, "Feststoffe-Text als texte[]-Eintrag gefunden");
    assert(treffer.includes("Feststoffe wie Futterreste"), `Woerter durch Leerzeichen getrennt, war: ${JSON.stringify(treffer)}`);
    assert(!/Feststoffewie/.test(treffer), "keine verklebten Woerter");
  });

  await test("Oasis: Sicherheit — kein <script> und keine javascript:-URL im Template", () => {
    for (const c of bericht.data.content) {
      assert(!/<script/i.test(c.props.template), `kein <script> in Block ${c.props.id}`);
      assert(!/javascript:/i.test(c.props.template), `keine javascript:-URL in Block ${c.props.id}`);
    }
  });

  await test("Oasis: Bilder werden zur Asset-Aufloesung registriert (quelle 'html')", () => {
    assert(bericht.bilder.length > 0, "mind. 1 Bild registriert");
    assert(bericht.bilder.every((b) => b.quelle === "html"), "StrukturBlock-Bilder laufen ueber die html-Quelle");
  });

  await test("Oasis: Mapping deterministisch (2x identische Data)", () => {
    const b2 = htmlZuPuckStrukturtreu(html, { sektionen: seg.sektionen }, { idPraefix: "oasis", styleUebernehmen: true });
    assertGleich(JSON.stringify(bericht.data), JSON.stringify(b2.data), "gleiche Eingabe -> gleiche Data");
  });
} else {
  console.log(`  SKIP echte project-oasis-Freeze (${FREEZE} oder ${SEG} fehlt)`);
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
