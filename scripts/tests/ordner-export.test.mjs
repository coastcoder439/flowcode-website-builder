/*
 * scripts/tests/ordner-export.test.mjs — Unit-Tests fuer den Export-Generator-Kern
 * (components/embed/ordner-export.ts, Station 4 / S1).
 * Spec: docs/plan-analyse/lens-preview-export.md §3-S1.
 *
 * Start:  node scripts/tests/ordner-export.test.mjs   (Exit 0 = gruen)
 *
 * Geprueft (S1-Deliverable), im AAA-Muster:
 *   · Referenz-Sammlung VOLLSTAENDIG: BildBlock.src, GrafikLayer.src,
 *     HtmlBlock-<img>/url(), verschachtelte SektionBlock-Slot-Kinder,
 *     anim.grafiken[].src + keyframes[].srcOverride, styles[] + CSS-url()-Sub-Assets;
 *   · Klassifikation (data/projekt/extern) + Endung + stabiler Hash;
 *   · Pfad-Umschreibung RELATIV korrekt (Startseite "" vs. Unterseite "../");
 *   · INLINE == bisheriges Format (baueSeiteHtml byte-identisch);
 *   · ORDNER-Dateiliste KONSISTENT: jede nicht-externe Referenz hat genau ein Ziel;
 *   · Hash-Stabilitaet (gleiche Quelle → gleicher Dateiname).
 *
 * WARUM Selbst-Reexec: die Module sind TypeScript (erasable) — einmal mit
 * --experimental-transform-types neu starten (bewaehrtes Repo-Muster). KEIN
 * happy-dom noetig: der Generator-Kern ist DOM-frei (reine Funktionen).
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit TS-Transform + Endungs-Aufloese-Hook ----
 * ordner-export.ts importiert Geschwister-Module RELATIV OHNE Endung
 * (`./embed-export`, `../../lib/import/css-rewrite`, …), wie es tsc mit
 * moduleResolution "bundler" verlangt. Nodes nativer ESM-Resolver macht keine
 * Endungsprobe → ts-ext-loader.mjs haengt `.ts` an (bewaehrtes Repo-Muster,
 * s. mapping-fein.test.mjs). */
if (!process.env.__ORDNER_EXPORT_TEST_REEXEC) {
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
    { stdio: "inherit", env: { ...process.env, __ORDNER_EXPORT_TEST_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const {
  sammleAssetReferenzen,
  sammleMarkupReferenzen,
  baueOrdnerArtefakt,
  klassifiziere,
  istUnaufloesbar,
  endungAus,
  stabilerHash,
  assetDateiname,
  hrefPfadZuSlug,
  schreibeInterneLinks,
} = await import("../../components/embed/ordner-export.ts");

const { baueSeiteHtml } = await import("../../components/embed/embed-export.ts");

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

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/* Puck-Data mit verschachtelter Sektion (Slot-Kinder) + allen Bausteinarten. */
function baueData() {
  return {
    root: {},
    content: [
      { type: "BildBlock", props: { id: "b1", src: "/import/wee/held.png", alt: "", breiteProzent: 100 } },
      {
        type: "SektionBlock",
        props: {
          id: "s1",
          hintergrund: "transparent",
          kinder: [
            { type: "BildBlock", props: { id: "b2", src: "/import/wee/tief.jpg", alt: "", breiteProzent: 50 } },
            {
              type: "HtmlBlock",
              props: {
                id: "h1",
                html: `<div style="background-image:url('/import/wee/bg.webp')"><img src="/import/wee/inline.gif" /><img src="https://cdn.fremd.example/extern.png" /></div>`,
              },
            },
          ],
        },
      },
      { type: "GrafikLayer", props: { id: "g1", name: "Blatt", src: "/vektor/blatt.svg", art: "bild", breitePx: 100, z: 1, scale: 1, opacity: 1, rotation: 0 } },
    ],
  };
}

/* anim mit Grafik-src + Keyframe-srcOverride (Data-URL). */
function baueAnim() {
  return {
    grafiken: [
      {
        id: "ag1",
        name: "Fisch",
        src: "/curtain/fisch.png",
        art: "bild",
        breitePx: 80,
        z: 2,
        keyframes: [
          { scrollY: 0, x: 0, y: 0, scale: 1, opacity: 1, rotation: 0 },
          { scrollY: 500, x: 10, y: 20, scale: 1, opacity: 1, rotation: 0, srcOverride: "data:image/png;base64,AAAA" },
        ],
      },
    ],
  };
}

const STYLE_HREF = "/import/wee/css/haupt.css";
const CSS_TEXT = `@font-face{font-family:x;src:url('../media/font.woff2') format('woff2')} .a{background:url(../media/pixel.png)} .b{color:red;background:url(data:image/svg+xml,<svg/>)}`;

/* Minimale EmbedConfig + Runtime fuer die Bau-Tests. */
function baueConfig() {
  return {
    grafiken: [
      {
        id: "ag1", name: "Fisch", src: "/curtain/fisch.png", art: "bild", breitePx: 80, z: 2,
        keyframes: [
          { scrollY: 0, x: 0, y: 0, scale: 1, opacity: 1, rotation: 0 },
          { scrollY: 500, x: 10, y: 20, scale: 1, opacity: 1, rotation: 0, srcOverride: "data:image/png;base64,AAAA" },
        ],
      },
    ],
    grafikenDocH: 3000,
  };
}
const RUNTIME = "/* wee-embed runtime */ console.log('wee');";

console.log("\nOrdner-Export Generator-Kern Unit-Tests (components/embed/ordner-export.ts)\n");

/* ------------------------------------------------------------------ */
/* 1 · Referenz-Sammlung vollstaendig                                  */
/* ------------------------------------------------------------------ */

await test("Sammlung: alle Bausteinarten + verschachtelte Slot-Kinder erfasst", () => {
  // Arrange
  const data = baueData();
  // Act
  const { assets } = sammleAssetReferenzen(data, null, null);
  const rohs = assets.map((a) => a.roh);
  // Assert
  assert(rohs.includes("/import/wee/held.png"), "BildBlock (oberste Ebene)");
  assert(rohs.includes("/import/wee/tief.jpg"), "BildBlock im SektionBlock-Slot (verschachtelt)");
  assert(rohs.includes("/import/wee/inline.gif"), "HtmlBlock <img>");
  assert(rohs.includes("/import/wee/bg.webp"), "HtmlBlock url() im style");
  assert(rohs.includes("/vektor/blatt.svg"), "GrafikLayer.src");
});

await test("Sammlung: externe Referenzen markiert (extern), nicht als Ziel", () => {
  // Arrange
  const data = baueData();
  // Act
  const { assets } = sammleAssetReferenzen(data, null, null);
  const extern = assets.find((a) => a.roh === "https://cdn.fremd.example/extern.png");
  // Assert
  assert(extern, "externe HtmlBlock-Quelle erfasst");
  assertGleich(extern.klasse, "extern", "als extern klassifiziert");
});

await test("Sammlung: anim.grafiken[].src + keyframes[].srcOverride", () => {
  // Arrange
  const data = { root: {}, content: [] };
  // Act
  const { assets } = sammleAssetReferenzen(data, baueAnim(), null);
  const rohs = assets.map((a) => a.roh);
  const override = assets.find((a) => a.roh === "data:image/png;base64,AAAA");
  // Assert
  assert(rohs.includes("/curtain/fisch.png"), "anim-src");
  assert(override, "keyframe srcOverride erfasst");
  assertGleich(override.klasse, "data", "Data-URL als data klassifiziert");
});

await test("Sammlung: styles[] als CSS-Datei + url()-Sub-Assets via css-rewrite", () => {
  // Arrange
  const data = { root: {}, content: [] };
  const cssInhalte = { [STYLE_HREF]: CSS_TEXT };
  // Act
  const { css } = sammleAssetReferenzen(data, null, [STYLE_HREF], cssInhalte);
  // Assert
  assertGleich(css.length, 1, "eine CSS-Datei");
  assertGleich(css[0].name, "haupt.css", "Basisname");
  const unterRohs = css[0].unterAssets.map((a) => a.roh);
  assert(unterRohs.includes("/import/wee/media/font.woff2"), "woff2-Font aufgeloest (relativ ../media)");
  assert(unterRohs.includes("/import/wee/media/pixel.png"), "Hintergrundbild aufgeloest");
  assert(!unterRohs.some((r) => r.startsWith("data:")), "data:-SVG NICHT als lokal");
});

await test("Sammlung: ohne cssInhalte → CSS-Datei ohne Sub-Assets (keine Aufloesung)", () => {
  // Arrange
  const data = { root: {}, content: [] };
  // Act
  const { css } = sammleAssetReferenzen(data, null, [STYLE_HREF], null);
  // Assert
  assertGleich(css.length, 1, "CSS-Datei trotzdem erfasst");
  assertGleich(css[0].unterAssets.length, 0, "ohne Text keine Sub-Assets");
});

await test("Sammlung: Deduplizierung nach roh (gleiche Quelle nur einmal)", () => {
  // Arrange — zwei BildBloecke mit identischer src
  const data = {
    root: {}, content: [
      { type: "BildBlock", props: { id: "b1", src: "/import/dop.png", alt: "", breiteProzent: 100 } },
      { type: "BildBlock", props: { id: "b2", src: "/import/dop.png", alt: "", breiteProzent: 100 } },
    ],
  };
  // Act
  const { assets } = sammleAssetReferenzen(data, null, null);
  const treffer = assets.filter((a) => a.roh === "/import/dop.png");
  // Assert
  assertGleich(treffer.length, 1, "dedupliziert");
});

/* ------------------------------------------------------------------ */
/* 2 · Klassifikation / Endung / Hash                                  */
/* ------------------------------------------------------------------ */

await test("Klassifikation: projekt / data / extern", () => {
  assertGleich(klassifiziere("/import/x.png"), "projekt", "Projektpfad");
  assertGleich(klassifiziere("data:image/png;base64,AA"), "data", "Data-URL");
  assertGleich(klassifiziere("https://x.example/a.png"), "extern", "http");
  assertGleich(klassifiziere("//x.example/a.png"), "extern", "protokoll-relativ");
  assertGleich(klassifiziere("#gradient"), "extern", "SVG-Fragment");
});

await test("Endung: aus Data-URL-MIME und aus Pfad (Query/Hash abgeschnitten)", () => {
  assertGleich(endungAus("data:image/png;base64,AA"), "png");
  assertGleich(endungAus("data:image/svg+xml,<svg/>"), "svg");
  assertGleich(endungAus("data:image/jpeg;base64,AA"), "jpg");
  assertGleich(endungAus("/import/a/held.WEBP?v=2"), "webp");
  assertGleich(endungAus("/import/ohne-endung"), "bin");
});

await test("Hash-Stabilitaet: gleiche Quelle → gleicher Dateiname, andere → anders", () => {
  // Arrange / Act
  const a1 = assetDateiname("/import/wee/held.png");
  const a2 = assetDateiname("/import/wee/held.png");
  const b = assetDateiname("/import/wee/anders.png");
  // Assert
  assertGleich(a1, a2, "deterministisch");
  assert(a1 !== b, "verschiedene Quellen kollidieren nicht");
  assert(/^[0-9a-f]{8}\.png$/.test(a1), `Form <hash8>.<ext>, war ${a1}`);
  assertGleich(stabilerHash("abc"), stabilerHash("abc"), "reiner Hash reproduzierbar");
});

/* ------------------------------------------------------------------ */
/* 3 · INLINE == bisheriges Format                                     */
/* ------------------------------------------------------------------ */

await test("INLINE: Dateiinhalt byte-identisch zu baueSeiteHtml", () => {
  // Arrange
  const config = baueConfig();
  const markup = `<main><h1>Hallo</h1></main>`;
  const seite = { slug: "start", istStart: true, data: baueData(), config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js", markup };
  // Act
  const artefakt = baueOrdnerArtefakt([seite], "inline");
  const erwartet = baueSeiteHtml(config, { runtimeJs: RUNTIME, embedUrl: "wee-embed.js", seitenMarkup: markup });
  // Assert
  assertGleich(artefakt.dateien.length, 1, "eine Datei");
  assertGleich(artefakt.dateien[0].pfad, "index.html", "Startseite = index.html");
  assertGleich(artefakt.dateien[0].inhalt, erwartet, "identisch zu baueSeiteHtml");
});

/* ------------------------------------------------------------------ */
/* 4 · ORDNER: Pfad-Umschreibung relativ + Dateiliste konsistent       */
/* ------------------------------------------------------------------ */

function baueSeiten() {
  const config = baueConfig();
  const markup = `<img src="/import/wee/held.png" />`;
  return [
    { slug: "start", istStart: true, data: baueData(), anim: baueAnim(), styles: [STYLE_HREF], cssInhalte: { [STYLE_HREF]: CSS_TEXT }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js", markup },
    { slug: "ueber-uns", istStart: false, data: baueData(), anim: baueAnim(), styles: [STYLE_HREF], cssInhalte: { [STYLE_HREF]: CSS_TEXT }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js", markup },
    { slug: "blog/post", istStart: false, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js", markup: "<p>x</p>" },
  ];
}

await test("ORDNER: Seiten-Pfade (Startseite Wurzel, Unterseiten <slug>/index.html)", () => {
  // Act
  const { dateien } = baueOrdnerArtefakt(baueSeiten(), "ordner");
  const pfade = dateien.map((d) => d.pfad);
  // Assert
  assert(pfade.includes("index.html"), "Startseite");
  assert(pfade.includes("ueber-uns/index.html"), "Unterseite Tiefe 1");
  assert(pfade.includes("blog/post/index.html"), "Unterseite Tiefe 2");
});

await test("ORDNER: relatives Praefix je Tiefe korrekt", () => {
  // Act
  const { dateien } = baueOrdnerArtefakt(baueSeiten(), "ordner");
  const start = dateien.find((d) => d.pfad === "index.html").inhalt;
  const t1 = dateien.find((d) => d.pfad === "ueber-uns/index.html").inhalt;
  const t2 = dateien.find((d) => d.pfad === "blog/post/index.html").inhalt;
  // Assert — Startseite ohne Praefix, Tiefe 1 = ../, Tiefe 2 = ../../
  assert(start.includes(`src="wee-embed.js"`), "Startseite: Runtime relativ ohne Praefix");
  assert(start.includes(`href="css/haupt.css"`), "Startseite: css ohne Praefix");
  assert(start.includes(`assets/${assetDateiname("/import/wee/held.png")}`), "Startseite: Markup-Asset umgeschrieben");
  assert(t1.includes(`src="../wee-embed.js"`), "Tiefe 1: ../wee-embed.js");
  assert(t1.includes(`href="../css/haupt.css"`), "Tiefe 1: ../css/");
  assert(t1.includes(`../assets/${assetDateiname("/import/wee/held.png")}`), "Tiefe 1: ../assets/ im Markup");
  assert(t2.includes(`src="../../wee-embed.js"`), "Tiefe 2: ../../wee-embed.js");
});

await test("ORDNER: externe Markup-Referenz bleibt unveraendert", () => {
  // Arrange
  const config = baueConfig();
  const seite = { slug: "start", istStart: true, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js", markup: `<img src="https://cdn.fremd.example/x.png" />` };
  // Act
  const { dateien } = baueOrdnerArtefakt([seite], "ordner");
  const html = dateien.find((d) => d.pfad === "index.html").inhalt;
  // Assert
  assert(html.includes("https://cdn.fremd.example/x.png"), "externe URL nicht umgeschrieben");
});

await test("ORDNER: Config-Assets (Grafik.src + srcOverride) umgeschrieben", () => {
  // Act
  const { dateien } = baueOrdnerArtefakt(baueSeiten(), "ordner");
  const start = dateien.find((d) => d.pfad === "index.html").inhalt;
  // Assert — /curtain/fisch.png und die Data-URL landen als assets/<hash>
  assert(start.includes(`assets/${assetDateiname("/curtain/fisch.png")}`), "Grafik.src in Config umgeschrieben");
  assert(start.includes(`assets/${assetDateiname("data:image/png;base64,AAAA")}`), "srcOverride (Data-URL) umgeschrieben");
  assert(!start.includes("/curtain/fisch.png"), "kein roher Projektpfad mehr in der Config");
});

await test("ORDNER: jede nicht-externe Referenz hat genau ein Ziel (Konsistenz)", () => {
  // Arrange
  const seiten = baueSeiten();
  // Act
  const { dateien } = baueOrdnerArtefakt(seiten, "ordner");
  const zielPfade = new Set(dateien.map((d) => d.pfad));
  // Sammle die erwarteten Ziele aus den Referenzen aller Seiten
  const erwartet = new Set();
  for (const s of seiten) {
    const { assets, css } = sammleAssetReferenzen(s.data, s.anim, s.styles, s.cssInhalte);
    for (const a of [...assets, ...css.flatMap((c) => c.unterAssets)]) {
      if (a.klasse !== "extern") erwartet.add(`assets/${assetDateiname(a.roh)}`);
    }
    for (const c of css) erwartet.add(`css/${c.name}`);
  }
  // Assert — jedes erwartete Ziel existiert als Datei
  for (const ziel of erwartet) {
    assert(zielPfade.has(ziel), `Ziel fehlt: ${ziel}`);
  }
  assert(zielPfade.has("wee-embed.js"), "Runtime-Datei");
  assert(zielPfade.has("README.txt"), "README");
});

await test("ORDNER: geteilte Assets/CSS/Runtime nur EINMAL (dedupliziert ueber Seiten)", () => {
  // Act
  const { dateien } = baueOrdnerArtefakt(baueSeiten(), "ordner");
  const pfade = dateien.map((d) => d.pfad);
  const zaehle = (p) => pfade.filter((x) => x === p).length;
  // Assert
  assertGleich(zaehle("wee-embed.js"), 1, "Runtime einmal");
  assertGleich(zaehle("css/haupt.css"), 1, "CSS einmal");
  assertGleich(zaehle(`assets/${assetDateiname("/import/wee/held.png")}`), 1, "Asset einmal (2 Seiten teilen es)");
});

await test("ORDNER: CSS url() auf ../assets/ rebased (aus css-rewrite)", () => {
  // Act
  const { dateien } = baueOrdnerArtefakt(baueSeiten(), "ordner");
  const css = dateien.find((d) => d.pfad === "css/haupt.css").inhalt;
  // Assert
  assert(css.includes(`../assets/${assetDateiname("/import/wee/media/font.woff2")}`), "woff2 rebased");
  assert(!css.includes("../media/font.woff2"), "alter relativer Pfad weg");
  assert(css.includes("data:image/svg+xml"), "data:-SVG unveraendert");
});

/* ------------------------------------------------------------------ */
/* 5 · Markup-Referenz-Scan + absolute-Referenz-Umschreibung (Defekt b) */
/* ------------------------------------------------------------------ */

await test("Markup-Scan: src / srcset (je Kandidat) / poster / style-url() erfasst", () => {
  // Arrange — genau die vier asset-tragenden Stellen aus sammleMarkupReferenzen.
  const markup = `
    <img src="/import/wee-v3-fein/logo.png"
         srcset="/import/wee-v3-fein/logo.png 1x, /import/wee-v3-fein/logo@2x.png 2x" />
    <video poster="/import/wee-v3-fein/hero-poster.jpg"></video>
    <div style="background-image:url('/import/wee-v3-fein/hero-bg.webp')"></div>`;
  // Act
  const refs = sammleMarkupReferenzen(markup);
  const rohs = refs.map((r) => r.roh);
  // Assert
  assert(rohs.includes("/import/wee-v3-fein/logo.png"), "src");
  assert(rohs.includes("/import/wee-v3-fein/logo@2x.png"), "srcset 2. Kandidat (Deskriptor abgeschnitten)");
  assert(rohs.includes("/import/wee-v3-fein/hero-poster.jpg"), "poster");
  assert(rohs.includes("/import/wee-v3-fein/hero-bg.webp"), "style url()");
  for (const r of refs) {
    if (r.roh.startsWith("/import/")) assertGleich(r.klasse, "projekt", `${r.roh} als projekt`);
  }
});

await test("ORDNER: absolute Markup-Referenzen (srcset + style-url) → relative assets/ + Kopier-Ziel", () => {
  // Arrange — Unterseite (Tiefe 1 → Praefix ../), Refs NUR im Markup (nicht in Data).
  const config = baueConfig();
  const markup =
    `<img srcset="/import/wee-v3-fein/logo.png 1x, /import/wee-v3-fein/logo@2x.png 2x" />` +
    `<div style="background-image:url('/import/wee-v3-fein/hero-bg.webp')"></div>`;
  const seite = { slug: "ueber-uns", istStart: false, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js", markup };
  // Act
  const { dateien } = baueOrdnerArtefakt([seite], "ordner");
  const html = dateien.find((d) => d.pfad === "ueber-uns/index.html").inhalt;
  const pfade = new Set(dateien.map((d) => d.pfad));
  // Assert — Markup umgeschrieben auf ../assets/<hash>, kein Dev-Pfad mehr
  assert(html.includes(`../assets/${assetDateiname("/import/wee-v3-fein/logo@2x.png")}`), "srcset-Kandidat umgeschrieben");
  assert(html.includes(`../assets/${assetDateiname("/import/wee-v3-fein/hero-bg.webp")}`), "style-url umgeschrieben");
  assert(!html.includes("/import/wee-v3-fein/"), "kein absoluter Dev-Pfad mehr im Markup");
  // Assert — jede Referenz ist als Kopier-Datei registriert (Quelle = roher Projektpfad)
  const zielLogo = `assets/${assetDateiname("/import/wee-v3-fein/logo.png")}`;
  assert(pfade.has(zielLogo), "logo als Kopier-Ziel");
  assert(pfade.has(`assets/${assetDateiname("/import/wee-v3-fein/hero-bg.webp")}`), "bg als Kopier-Ziel");
  const kopier = dateien.find((d) => d.pfad === zielLogo);
  assertGleich(kopier.quellUrl, "/import/wee-v3-fein/logo.png", "Kopier-Quelle = roher Projektpfad");
});

await test("Markup-Scan: url() mit HTML-Entity-Quotes (&quot;) → sauberer Projektpfad, KEINE Warnung", () => {
  // Arrange — so serialisiert der Browser ein inline style="…" mit inneren "…":
  // aus url("/import/…") wird url(&quot;/import/…&quot;) (Hero-/Hintergrundbilder).
  const markup = `<div style="background-image:url(&quot;/import/wee-v3-fein/hero-home-valley.webp&quot;)"></div>`;
  // Act — Scan liefert den GESAEUBERTEN Pfad (ohne Entities), als projekt klassifiziert
  const refs = sammleMarkupReferenzen(markup);
  const treffer = refs.find((r) => r.roh === "/import/wee-v3-fein/hero-home-valley.webp");
  // Assert
  assert(treffer, "Entity-Quotes abgeschnitten → reiner /import/-Pfad");
  assertGleich(treffer.klasse, "projekt", "als projekt (bekommt Ziel), nicht extern");

  // Act 2 — ganzer ORDNER-Bau: umgeschrieben auf assets/, kein Dev-Pfad, keine Warnung
  const config = baueConfig();
  const seite = { slug: "start", istStart: true, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js", markup };
  const { dateien, warnungen } = baueOrdnerArtefakt([seite], "ordner");
  const html = dateien.find((d) => d.pfad === "index.html").inhalt;
  // Assert 2 — reiner Pfad weg, assets/-Ziel drin (die &quot;-Klammern bleiben Delimiter)
  assert(html.includes(`assets/${assetDateiname("/import/wee-v3-fein/hero-home-valley.webp")}`), "auf assets/ umgeschrieben");
  assert(!html.includes("/import/wee-v3-fein/hero-home-valley.webp"), "kein absoluter Dev-Pfad mehr");
  assertGleich(warnungen.length, 0, "aufgeloest → keine Warnung");
});

/* ------------------------------------------------------------------ */
/* 6 · Unaufloesbare Referenzen → Warnung (Defekt b, Bericht-Ehrlichkeit) */
/* ------------------------------------------------------------------ */

await test("istUnaufloesbar: nur relative lokale Pfade, nicht /projekt / extern / data / #", () => {
  assert(istUnaufloesbar("bilder/x.png"), "relativer Pfad");
  assert(istUnaufloesbar("./x.png"), "punkt-relativ");
  assert(istUnaufloesbar("../x.png"), "eltern-relativ");
  assert(!istUnaufloesbar("/import/x.png"), "projekt (bekommt Ziel)");
  assert(!istUnaufloesbar("https://x.example/a.png"), "http");
  assert(!istUnaufloesbar("//x.example/a.png"), "protokoll-relativ");
  assert(!istUnaufloesbar("data:image/png;base64,AA"), "data");
  assert(!istUnaufloesbar("#frag"), "fragment");
  assert(!istUnaufloesbar(""), "leer");
});

await test("ORDNER: unaufloesbare Referenz (relativer Pfad) → Warnung, saubere Seite → keine", () => {
  // Arrange — Seite mit relativem lokalem src UND relativem url()
  const config = baueConfig();
  const kaputt = {
    slug: "kaputt", istStart: false, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js",
    markup: `<img src="bilder/relativ.png" /><div style="background:url(../weiter/oben.jpg)"></div>`,
  };
  // Act
  const { warnungen } = baueOrdnerArtefakt([kaputt], "ordner");
  const rohs = warnungen.map((w) => w.roh);
  // Assert — beide relativen Pfade als Warnung, mit Seiten-Label
  assert(rohs.includes("bilder/relativ.png"), "relativer src als Warnung");
  assert(rohs.includes("../weiter/oben.jpg"), "relativer url() als Warnung");
  assert(warnungen.every((w) => w.seite === "kaputt/index.html"), "Warnung nennt die Seite");

  // Arrange/Act — saubere Seite: /projekt + extern + data → keine Warnung
  const sauber = {
    slug: "start", istStart: true, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js",
    markup: `<img src="/import/ok.png" /><img src="https://cdn.example/x.png" /><img src="data:image/png;base64,AA" />`,
  };
  const res = baueOrdnerArtefakt([sauber], "ordner");
  // Assert
  assertGleich(res.warnungen.length, 0, "saubere Seite → keine Warnung");
});

/* ------------------------------------------------------------------ */
/* 7 · Multi-Page: interne <a>-Verlinkung relativ (E5 / X5)            */
/* ------------------------------------------------------------------ */

await test("hrefPfadZuSlug: Wurzel/Einsegment/Mehrsegment/index.html verflacht", () => {
  assertGleich(hrefPfadZuSlug("/"), "", "Wurzel = Startseite");
  assertGleich(hrefPfadZuSlug("/project-oasis/"), "project-oasis", "ein Segment");
  assertGleich(hrefPfadZuSlug("/bildung/aquaponik/"), "bildung-aquaponik", "mehrsegmentig → verflacht");
  assertGleich(hrefPfadZuSlug("/organisation/team/index.html"), "organisation-team", "index.html + verflacht");
  assertGleich(hrefPfadZuSlug("/faq"), "faq", "ohne Trailing-Slash");
});

await test("schreibeInterneLinks: Startseite (Tiefe 0) — eigene Sublinks + Home relativ", () => {
  // Arrange
  const markup =
    `<a href="/">Home</a>` +
    `<a class="nav" href="/project-oasis/">Oasis</a>` +
    `<a href="/bildung/aquaponik/#kurs">Aquaponik</a>`;
  const zielSlugs = new Set(["project-oasis", "bildung-aquaponik"]);
  // Act
  const { markup: out, ungeloest } = schreibeInterneLinks(markup, zielSlugs, true, 0);
  // Assert
  assert(out.includes(`href="index.html"`), "Home → index.html (kein Praefix)");
  assert(out.includes(`href="project-oasis/index.html"`), "Sublink relativ ohne Praefix");
  assert(out.includes(`href="bildung-aquaponik/index.html#kurs"`), "Mehrsegment + Anker erhalten");
  assertGleich(ungeloest.length, 0, "alle aufgeloest");
});

await test("schreibeInterneLinks: Unterseite (Tiefe 1) — Praefix ../, Home + Geschwister", () => {
  // Arrange
  const markup = `<a href="/">Home</a><a href="/pilot-projekt/">Pilot</a>`;
  const zielSlugs = new Set(["project-oasis", "pilot-projekt"]);
  // Act
  const { markup: out } = schreibeInterneLinks(markup, zielSlugs, true, 1);
  // Assert
  assert(out.includes(`href="../index.html"`), "Home aus Tiefe 1 = ../index.html");
  assert(out.includes(`href="../pilot-projekt/index.html"`), "Geschwister aus Tiefe 1 = ../<slug>/index.html");
});

await test("schreibeInterneLinks: extern / Anker / mailto unangetastet", () => {
  // Arrange
  const markup =
    `<a href="https://x.example/a">ext</a>` +
    `<a href="//cdn.example/b">proto</a>` +
    `<a href="#content">skip</a>` +
    `<a href="mailto:info@world-eden-era.org">mail</a>`;
  // Act
  const { markup: out, ungeloest } = schreibeInterneLinks(markup, new Set(), true, 0);
  // Assert
  assertGleich(out, markup, "keine externen/Anker/mailto-Links umgeschrieben");
  assertGleich(ungeloest.length, 0, "nicht als ungeloest gezaehlt (kein interner Pfad)");
});

await test("schreibeInterneLinks: interner Pfad ohne Ziel-Seite → ungeloest + unveraendert", () => {
  // Arrange — /faq/ ist nicht importiert (nicht in zielSlugs)
  const markup = `<a href="/faq/">FAQ</a><a href="/project-oasis/">Oasis</a>`;
  const zielSlugs = new Set(["project-oasis"]);
  // Act
  const { markup: out, ungeloest } = schreibeInterneLinks(markup, zielSlugs, true, 0);
  // Assert
  assert(out.includes(`href="/faq/"`), "unaufloesbarer interner Link bleibt roh");
  assert(out.includes(`href="project-oasis/index.html"`), "aufloesbarer Link umgeschrieben");
  assertGleich(ungeloest.length, 1, "genau eine ungeloeste");
  assertGleich(ungeloest[0], "/faq/", "die richtige gemeldet");
});

await test("ORDNER: interne Links relativ verlinkt + tote Links als Warnung", () => {
  // Arrange — Start verlinkt Unterseite + toten /faq/; Unterseite verlinkt Home + Start-Asset
  const config = baueConfig();
  const seiten = [
    {
      slug: "", istStart: true, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js",
      markup: `<a href="/project-oasis/">Oasis</a><a href="/faq/">FAQ</a><img src="/import/wee/held.png" />`,
    },
    {
      slug: "project-oasis", istStart: false, data: { root: {}, content: [] }, config, runtimeJs: RUNTIME, embedUrl: "wee-embed.js",
      markup: `<a href="/">Home</a>`,
    },
  ];
  // Act
  const { dateien, warnungen } = baueOrdnerArtefakt(seiten, "ordner");
  const start = dateien.find((d) => d.pfad === "index.html").inhalt;
  const sub = dateien.find((d) => d.pfad === "project-oasis/index.html").inhalt;
  // Assert — relative Verlinkung untereinander
  assert(start.includes(`href="project-oasis/index.html"`), "Start → Unterseite relativ");
  assert(sub.includes(`href="../index.html"`), "Unterseite → Home relativ (../)");
  assert(!sub.includes(`href="/"`), "kein absoluter Home-Link mehr");
  // Assert — Asset + Link koexistieren (disjunkte Umschreibung)
  assert(start.includes(`assets/${assetDateiname("/import/wee/held.png")}`), "Asset weiterhin umgeschrieben");
  // Assert — toter interner Link als Warnung (herkunft a-href), roh unveraendert
  assert(start.includes(`href="/faq/"`), "toter interner Link bleibt roh");
  const linkWarn = warnungen.find((w) => w.roh === "/faq/");
  assert(linkWarn, "toter Link als Warnung gemeldet");
  assertGleich(linkWarn.herkunft, "a-href", "als a-href klassifiziert");
  assertGleich(linkWarn.seite, "index.html", "Warnung nennt die Quell-Seite");
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
