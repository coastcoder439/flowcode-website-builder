/*
 * scripts/tests/struktur-block.test.mjs — Unit-Tests fuer den REINEN
 * Injektions-Kern des StrukturBlock (Phase 4b): lib/import/struktur-injektion.ts
 * injiziereStruktur + istErlaubteBildQuelle. Kein Dev-Server, kein Ollama —
 * nur happy-dom-DOMParser (Muster wie mapping-fein.test.mjs).
 *
 * Start:  node scripts/tests/struktur-block.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft:
 *   · Text-Injektion landet an der richtigen Marker-Position (data-fc-text);
 *   · Bild-Injektion setzt src/alt an der richtigen Marker-Position (data-fc-bild);
 *   · data-og-id der Sektion bleibt erhalten (Anker-Mechanik);
 *   · KEINE Script-Ausfuehrung: <script> im Template raus, Injektionsversuch im
 *     Text-Wert wird als Text escaped, javascript:-Bildquelle wird verworfen;
 *   · Leerzeichen im Wert bleiben erhalten (Gegen den bekannten Extraktions-Bug);
 *   · Determinismus (2x identische Ausgabe).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.__STRUKTUR_TEST_REEXEC) {
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
    { stdio: "inherit", env: { ...process.env, __STRUKTUR_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { Window } = await import("happy-dom");
/* url noetig: ohne Basis wirft happy-dom bei relativen href-Pfaden einen
   TypeError Invalid URL gegen about:blank. */
globalThis.DOMParser = new Window({ url: "http://import.local/" }).DOMParser;

const { injiziereStruktur, istErlaubteBildQuelle } = await import(
  "../../lib/import/struktur-injektion.ts"
);

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
function assert(b, m) {
  if (!b) throw new Error(m || "Assertion fehlgeschlagen");
}
function assertGleich(ist, soll, m) {
  if (ist !== soll) throw new Error(`${m || "Wert"}: erwartet ${JSON.stringify(soll)}, war ${JSON.stringify(ist)}`);
}

/** Parst ein Render-Ergebnis zurueck in ein DOM, um Positionen zu pruefen. */
function parse(html) {
  const doc = new DOMParser().parseFromString(`<div id="__t">${html}</div>`, "text/html");
  return doc.getElementById("__t");
}

console.log("\nStrukturBlock Unit-Tests (injiziereStruktur)\n");

/* ------------------------------------------------------------------ */
/* Whitelist                                                           */
/* ------------------------------------------------------------------ */

await test("istErlaubteBildQuelle: erlaubte Quellen", () => {
  assert(istErlaubteBildQuelle("/import/x/hero.png"), "root-relativ erlaubt");
  assert(istErlaubteBildQuelle("bilder/a.jpg"), "relativ erlaubt");
  assert(istErlaubteBildQuelle("https://example.com/a.png"), "https erlaubt");
  assert(istErlaubteBildQuelle("http://example.com/a.png"), "http erlaubt");
  assert(istErlaubteBildQuelle("data:image/svg+xml,%3Csvg%3E"), "data:image erlaubt");
});

await test("istErlaubteBildQuelle: verworfene Quellen", () => {
  assert(!istErlaubteBildQuelle("javascript:alert(1)"), "javascript: verworfen");
  assert(!istErlaubteBildQuelle("  javascript:alert(1)"), "javascript: mit Leerraum verworfen");
  assert(!istErlaubteBildQuelle("data:text/html,<script>"), "data:text/html verworfen");
  assert(!istErlaubteBildQuelle("vbscript:msgbox"), "vbscript: verworfen");
  assert(!istErlaubteBildQuelle(""), "leer verworfen");
});

/* ------------------------------------------------------------------ */
/* Injektion an der richtigen Position                                 */
/* ------------------------------------------------------------------ */

const TEMPLATE = `<section data-og-id="og:hero" data-og-typ="sektion" class="hero">
  <img data-fc-bild="b1" src="PLATZHALTER.png" alt="alt-platzhalter">
  <div class="overlay"><h1 data-fc-text="t1">PLATZHALTER-TITEL</h1></div>
  <p data-fc-text="t2">PLATZHALTER-ABSATZ</p>
</section>`;

const TEXTE = [
  { id: "t1", label: "Titel", wert: "Leben ermöglichen." },
  { id: "t2", label: "Absatz", wert: "Feststoffe wie Futterreste werden abgebaut." },
];
const BILDER = [{ id: "b1", label: "Hero-Bild", src: "/import/oasis/hero.png", alt: "Hero" }];

await test("Text-Injektion landet an der data-fc-text-Position", () => {
  const { html } = injiziereStruktur(TEMPLATE, TEXTE, BILDER);
  const dom = parse(html);
  const h1 = dom.querySelector('[data-fc-text="t1"]');
  const p = dom.querySelector('[data-fc-text="t2"]');
  assert(h1 && h1.tagName.toLowerCase() === "h1", "h1-Marker vorhanden");
  assertGleich(h1.textContent, "Leben ermöglichen.", "h1-Text injiziert");
  assertGleich(p.textContent, "Feststoffe wie Futterreste werden abgebaut.", "p-Text injiziert");
  assert(!html.includes("PLATZHALTER-TITEL"), "Platzhalter-Titel ersetzt");
  assert(!html.includes("PLATZHALTER-ABSATZ"), "Platzhalter-Absatz ersetzt");
});

await test("Leerzeichen im Wert bleiben erhalten (kein Extraktions-Bug)", () => {
  const { html } = injiziereStruktur(TEMPLATE, TEXTE, BILDER);
  const dom = parse(html);
  const p = dom.querySelector('[data-fc-text="t2"]');
  assert(p.textContent.includes("Feststoffe wie Futterreste"), "Woerter durch Leerzeichen getrennt");
  assert(!p.textContent.includes("FeststoffewieFutterreste"), "keine verklebten Woerter");
});

await test("Bild-Injektion setzt src/alt an der data-fc-bild-Position", () => {
  const { html } = injiziereStruktur(TEMPLATE, TEXTE, BILDER);
  const dom = parse(html);
  const img = dom.querySelector('[data-fc-bild="b1"]');
  assert(img && img.tagName.toLowerCase() === "img", "img-Marker vorhanden");
  assertGleich(img.getAttribute("src"), "/import/oasis/hero.png", "src injiziert");
  assertGleich(img.getAttribute("alt"), "Hero", "alt injiziert");
  assert(!html.includes("PLATZHALTER.png"), "Platzhalter-src ersetzt");
});

await test("data-og-id der Sektion bleibt erhalten (Anker-Mechanik)", () => {
  const { html } = injiziereStruktur(TEMPLATE, TEXTE, BILDER);
  const dom = parse(html);
  const sektion = dom.querySelector("[data-og-id]");
  assert(sektion, "Element mit data-og-id vorhanden");
  assertGleich(sektion.getAttribute("data-og-id"), "og:hero", "data-og-id unveraendert");
  assertGleich(sektion.getAttribute("data-og-typ"), "sektion", "data-og-typ unveraendert");
});

/* ------------------------------------------------------------------ */
/* Sicherheit                                                          */
/* ------------------------------------------------------------------ */

await test("Sicherheit: <script> im Template wird entfernt", () => {
  const t = `<section><script>window.__pwn=1</script><p data-fc-text="t1">x</p></section>`;
  const { html } = injiziereStruktur(t, [{ id: "t1", label: "x", wert: "sauber" }], []);
  const dom = parse(html);
  assert(!dom.querySelector("script"), "kein <script> im Ergebnis");
  assert(!/window\.__pwn/.test(html), "Skript-Inhalt weg");
});

await test("Sicherheit: HTML im Text-Wert wird als Text escaped, nicht ausgefuehrt", () => {
  const boese = '<img src=x onerror="window.__pwn=1"><script>window.__pwn=1</script>';
  const { html } = injiziereStruktur(TEMPLATE, [{ id: "t1", label: "T", wert: boese }], BILDER);
  const dom = parse(html);
  const h1 = dom.querySelector('[data-fc-text="t1"]');
  /* Der boese String liegt WORTWOERTLICH als Textinhalt vor (Text-Knoten). */
  assertGleich(h1.textContent, boese, "Wert als Literal-Text vorhanden");
  /* Innerhalb des Markers entstand KEIN echtes <script>/<img>-Element aus dem Wert. */
  assert(!h1.querySelector("script"), "kein injiziertes <script> im Marker");
  assert(!h1.querySelector("img"), "kein injiziertes <img> im Marker");
  /* Serialisiert ist "<" escaped. */
  assert(html.includes("&lt;script&gt;"), "spitze Klammern escaped im Serialisat");
});

await test("Sicherheit: javascript:-Bildquelle wird verworfen", () => {
  const { html } = injiziereStruktur(
    TEMPLATE,
    TEXTE,
    [{ id: "b1", label: "B", src: "javascript:alert(1)", alt: "x" }],
  );
  const dom = parse(html);
  const img = dom.querySelector('[data-fc-bild="b1"]');
  const src = img.getAttribute("src") ?? "";
  assert(!/javascript:/i.test(src), "keine javascript:-src");
  assert(!/javascript:/i.test(html), "keine javascript:-URL im Serialisat");
});

await test("Sicherheit: on*-Attribut im Template wird entfernt", () => {
  const t = `<section data-og-id="og:x"><p data-fc-text="t1" onclick="window.__pwn=1">x</p></section>`;
  const { html } = injiziereStruktur(t, [{ id: "t1", label: "x", wert: "y" }], []);
  assert(!/onclick/i.test(html), "onclick entfernt");
});

/* ------------------------------------------------------------------ */
/* Determinismus                                                       */
/* ------------------------------------------------------------------ */

await test("Injektion ist deterministisch (2x identisch)", () => {
  const a = injiziereStruktur(TEMPLATE, TEXTE, BILDER);
  const b = injiziereStruktur(TEMPLATE, TEXTE, BILDER);
  assertGleich(a.html, b.html, "gleiche Eingabe -> gleiche Ausgabe");
});

await test("Fehlende Prop-Werte lassen Marker unangetastet (kein Absturz)", () => {
  const { html } = injiziereStruktur(TEMPLATE, [], []);
  const dom = parse(html);
  /* Ohne Injektion bleibt der Original-Inhalt der Marker stehen. */
  assert(dom.querySelector('[data-fc-text="t1"]').textContent.includes("PLATZHALTER-TITEL"), "Original-Text bleibt");
});

/* ---- Auswertung ---- */
console.log("");
console.log(`Ergebnis: ${bestanden} OK, ${fehlgeschlagen} FAIL`);
if (fehlgeschlagen > 0) {
  console.log("FEHLGESCHLAGEN");
  process.exit(1);
}
console.log("ALLE GRUEN");
process.exit(0);
