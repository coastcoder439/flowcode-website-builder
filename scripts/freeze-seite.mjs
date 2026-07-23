/*
 * scripts/freeze-seite.mjs — Import-Endlevel Schritt I1 (M4): Freeze des
 * gerenderten Endzustands. Spec: docs/plan-analyse/lens-import.md §3-Schritt-I,
 * docs/editor-vereinheitlichung.md §11 (6a), docs/import-endlevel.md §1.
 *
 * PROBLEM (M4): Bens Next-Export friert Entrance-Animationen im Roh-HTML mit
 * `opacity:0` ein (34× in out/index.html). Der heutige DOMParser-Import uebernimmt
 * genau diesen unsichtbaren Zustand → Texte fehlen. Loesung: die Seite echt
 * rendern, alle Animationen in den Endzustand treiben, dann den sichtbaren
 * End-DOM abgreifen.
 *
 * ABLAUF je Seite:
 *   Mini-Static-Server ueber out/  →  Playwright(-core, Kanal „chrome" = System-
 *   Chrome, kein Browser-Download)  →  goto(networkidle) = Hydration abwarten
 *   (die /_next/static/-Chunks sind dann geladen)  →  Scroll-Sweep bis Seitenende
 *   (IntersectionObserver-Entrance/Lazy ausloesen)  →  getAnimations().finish()
 *   →  verbleibende opacity:0-Inline-Styles an Text-tragenden Elementen auf ihren
 *   Computed-Endwert fixieren  →  self-contained End-HTML (documentElement.outerHTML,
 *   relative Asset-Pfade beibehalten — Assets kopiert spaeter I5/I6).
 *
 * CLI:
 *   node scripts/freeze-seite.mjs --ordner test-sites/wee-website-v3/out --seite .
 *   node scripts/freeze-seite.mjs --ordner test-sites/wee-website-v3/out --seite bildung
 * Ausgabe: scripts/.freeze-out/<slug>.html  +  scripts/.freeze-out/<slug>.json
 *   (Protokoll: opacityVorher/Nachher, Dauer, Marker).
 *
 * E4-GRUNDSTEIN: die Kernlogik ist als `friereOrdnerEin()` / `friereSeiteMitPage()`
 * exportiert (lib-faehig), damit I6 sie in einer dev-only-API-Route wiederverwenden
 * kann, ohne dieses CLI zu duplizieren.
 *
 * ABHAENGIGKEIT: devDep `playwright-core` (per `npm install` im Root ergaenzt;
 * `npm run build` bleibt verboten). Kanal „chrome" nutzt das installierte System-
 * Chrome — kein Chromium-Download noetig. Ueberschreibbar via FREEZE_KANAL=msedge.
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright-core";

import { starteStaticServer } from "./lib/static-server.mjs";

const HIER = dirname(fileURLToPath(import.meta.url));
const AUSGABE_ORDNER = join(HIER, ".freeze-out");

/* Viewport fuer den Render: fester Desktop-Schnitt → reproduzierbare Geometrie
   (die spaeter I3 als bbox-Signal fuer die Segmentierung nutzt). */
const VIEWPORT = { width: 1440, height: 900 };

/* ================================================================== */
/* Kernlogik (lib-faehig, von I6 wiederverwendbar)                     */
/* ================================================================== */

/**
 * Friert EINE bereits geladene Playwright-Page in ihren sichtbaren Endzustand
 * und gibt die self-contained End-HTML + Messwerte zurueck. Erwartet, dass
 * `page` bereits auf die Ziel-URL navigiert wurde (Aufrufer steuert goto).
 *
 * @param {import("playwright-core").Page} page
 * @returns {Promise<{ html: string, opacityVorFix: number, opacityNachher: number,
 *   markerNext: number, siteGate: boolean, textFixes: number, animationen: number }>}
 */
export async function friereSeiteMitPage(page) {
  /* --- Scroll-Sweep: Entrance-/Lazy-Trigger ueber die volle Hoehe wecken. --- */
  await page.evaluate(async () => {
    const schlaf = (ms) => new Promise((r) => setTimeout(r, ms));
    const schritt = Math.max(200, Math.floor(window.innerHeight * 0.8));
    const hoehe = () => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y <= hoehe(); y += schritt) {
      window.scrollTo(0, y);
      await schlaf(120);
    }
    window.scrollTo(0, hoehe());
    await schlaf(250);
    window.scrollTo(0, 0);
    await schlaf(150);
  });

  /* Kurze Settle-Phase, damit nach dem Sweep angestossene Animationen laufen. */
  await page.waitForTimeout(250);

  /* --- Endzustand erzwingen + fixieren + End-DOM abgreifen (alles in-page). --- */
  return page.evaluate(() => {
    /* Zaehlt inline `opacity:0` im aktuell serialisierten DOM (nicht opacity:0.5). */
    const zaehleOpacity = () =>
      (document.documentElement.outerHTML.match(/opacity:\s*0(?![.\d])/g) || []).length;

    /* (1) Alle laufenden/pausierten Animationen (WAAPI, inkl. motion) in den
       Endzustand treiben. Einzelne finish()-Fehler (unendliche Loops) ignorieren. */
    let animationen = 0;
    for (const a of document.getAnimations()) {
      try {
        a.finish();
        animationen++;
      } catch {
        /* z. B. unendliche Animationen: nicht finishbar → egal. */
      }
    }

    const opacityVorFix = zaehleOpacity();

    /* (2) Verbleibende opacity:0-Inline-Styles an TEXT-tragenden Elementen auf
       ihren Computed-Endwert fixieren. Texttraeger = Element mit sichtbarem
       Textinhalt (Ueberschriften, Absaetze, Buttons, ganze Hero-Bloecke).
       Rein dekorative aria-hidden-Layer ohne Text werden bewusst NICHT angefasst. */
    const istTextTraeger = (el) => {
      if (el.getAttribute("aria-hidden") === "true") return false;
      return (el.textContent || "").trim().length > 0;
    };
    let textFixes = 0;
    for (const el of document.querySelectorAll('[style*="opacity"]')) {
      const inline = el.style.opacity;
      if (inline === "" || parseFloat(inline) !== 0) continue;
      if (!istTextTraeger(el)) continue;
      /* Computed-Endwert ermitteln: Inline-0 entfernen, den vom Stylesheet
         vorgesehenen Wert lesen; deckt das Stylesheet auch 0 ab (echt versteckt),
         auf 1 anheben — der Entrance-Zielwert, damit der Text sichtbar wird. */
      el.style.removeProperty("opacity");
      const berechnet = parseFloat(getComputedStyle(el).opacity);
      el.style.opacity = berechnet > 0 ? String(berechnet) : "1";
      textFixes++;
    }

    const opacityNachher = zaehleOpacity();
    const markerNext = (document.documentElement.outerHTML.match(/\/_next\/static\//g) || []).length;
    const siteGate = !!document.querySelector(".site-gate__panel, .site-gate");
    const html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;

    return { html, opacityVorFix, opacityNachher, markerNext, siteGate, textFixes, animationen };
  });
}

/**
 * Vollstaendiger Freeze einer Seite aus einem out/-Ordner: startet Static-Server,
 * launched den Browser, rendert, friert ein und liefert HTML + Protokoll.
 * Diese Funktion ist der wiederverwendbare Kern fuer I6 (dev-only-API-Route).
 *
 * @param {object} opts
 * @param {string} opts.ordner - Pfad zum out/-Ordner.
 * @param {string} opts.seite  - Seiten-Pfad relativ zur Wurzel (".", "bildung", "bildung/aquaponik").
 * @param {string} [opts.kanal] - Playwright-Kanal (Default "chrome"; FREEZE_KANAL override).
 * @returns {Promise<{ html: string, protokoll: object }>}
 */
export async function friereOrdnerEin({ ordner, seite, kanal }) {
  const t0 = Date.now();
  const wurzel = resolve(ordner);
  const seitenSlug = seiteZuSlug(seite);
  const seitenPfad = seiteZuUrlPfad(seite);

  /* opacityVorher aus der ROH-Datei (das ist die Messlatte: 34× in index.html). */
  const rohHtml = await leseRohDatei(wurzel, seite);
  const opacityVorher = rohHtml
    ? (rohHtml.match(/opacity:\s*0(?![.\d])/g) || []).length
    : null;

  const server = await starteStaticServer(wurzel);
  const gewaehlterKanal = kanal || process.env.FREEZE_KANAL || "chrome";
  let browser;
  try {
    browser = await chromium.launch({ channel: gewaehlterKanal, headless: true });
    const kontext = await browser.newContext({ viewport: VIEWPORT });
    const page = await kontext.newPage();
    const zielUrl = server.url + seitenPfad;
    await page.goto(zielUrl, { waitUntil: "networkidle", timeout: 60_000 });
    /* networkidle impliziert geladene /_next/static/-Chunks; kurze Hydration-Ruhe. */
    await page.waitForTimeout(400);

    const gefroren = await friereSeiteMitPage(page);
    await kontext.close();

    const protokoll = {
      slug: seitenSlug,
      seite: seite === "." || seite === "" ? "(Startseite)" : seite,
      ordner: wurzel,
      zielUrl,
      kanal: gewaehlterKanal,
      opacityVorher, // Roh-Datei (Messlatte)
      opacityVorFix: gefroren.opacityVorFix, // gerenderter DOM nach finish(), vor Text-Fix
      opacityNachher: gefroren.opacityNachher, // gefrorene Ausgabe
      textFixes: gefroren.textFixes,
      animationenFinished: gefroren.animationen,
      markerNext: gefroren.markerNext,
      siteGateGefunden: gefroren.siteGate,
      dauerMs: Date.now() - t0,
    };
    return { html: gefroren.html, protokoll };
  } finally {
    if (browser) await browser.close();
    await server.schliessen();
  }
}

/* ================================================================== */
/* Hilfsfunktionen                                                     */
/* ================================================================== */

/** ".", "" → "index"; "bildung" → "bildung"; "bildung/aquaponik" → "bildung-aquaponik". */
function seiteZuSlug(seite) {
  const s = (seite || "").replace(/^\.?\/?/, "").replace(/\/+$/, "");
  return s === "" ? "index" : s.replace(/\//g, "-");
}

/** ".", "" → "/"; "bildung" → "/bildung/" (Trailing-Slash → Static-Server nimmt index.html). */
function seiteZuUrlPfad(seite) {
  const s = (seite || "").replace(/^\.?\/?/, "").replace(/\/+$/, "");
  return s === "" ? "/" : `/${s}/`;
}

/** Liest die zugehoerige index.html direkt aus dem Ordner (fuer opacityVorher). */
async function leseRohDatei(wurzel, seite) {
  const s = (seite || "").replace(/^\.?\/?/, "").replace(/\/+$/, "");
  const rel = s === "" ? "index.html" : join(s, "index.html");
  try {
    return await readFile(join(wurzel, rel), "utf-8");
  } catch {
    return null;
  }
}

function argWert(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/* ================================================================== */
/* CLI                                                                 */
/* ================================================================== */

async function cli() {
  const ordner = argWert("--ordner", "test-sites/wee-website-v3/out");
  const seite = argWert("--seite", ".");

  console.log(`Freeze → Ordner „${ordner}", Seite „${seite}"`);
  console.log(`  (Kanal: ${process.env.FREEZE_KANAL || "chrome"} = System-Browser, kein Download)\n`);

  let ergebnis;
  try {
    ergebnis = await friereOrdnerEin({ ordner, seite });
  } catch (fehler) {
    console.error(`✗ Freeze fehlgeschlagen: ${fehler?.message ?? fehler}`);
    if (/Executable doesn't exist|channel|chrome/i.test(String(fehler?.message))) {
      console.error("  Hinweis: Kanal 'chrome' braucht ein installiertes System-Chrome.");
      console.error("  Alternative: FREEZE_KANAL=msedge  oder  npx playwright install chromium (dann Kanal weglassen).");
    }
    process.exit(1);
  }

  const { html, protokoll } = ergebnis;
  await mkdir(AUSGABE_ORDNER, { recursive: true });
  const htmlPfad = join(AUSGABE_ORDNER, `${protokoll.slug}.html`);
  const jsonPfad = join(AUSGABE_ORDNER, `${protokoll.slug}.json`);
  await writeFile(htmlPfad, html, "utf-8");
  await writeFile(jsonPfad, JSON.stringify(protokoll, null, 2), "utf-8");

  console.log("Freeze-Protokoll:");
  console.log(`  opacity:0 Roh-Datei:   ${protokoll.opacityVorher ?? "?"}`);
  console.log(`  opacity:0 nach Render: ${protokoll.opacityVorFix} (nach getAnimations().finish())`);
  console.log(`  opacity:0 gefroren:    ${protokoll.opacityNachher}  ← Text-Fixes: ${protokoll.textFixes}`);
  console.log(`  Animationen finished:  ${protokoll.animationenFinished}`);
  console.log(`  /_next/static/-Marker: ${protokoll.markerNext}`);
  console.log(`  site-gate gefunden:    ${protokoll.siteGateGefunden ? "ja (Filter folgt in I2)" : "nein"}`);
  console.log(`  Dauer:                 ${protokoll.dauerMs} ms`);
  console.log(`\n✓ Geschrieben:`);
  console.log(`  ${htmlPfad}`);
  console.log(`  ${jsonPfad}`);
}

/* Nur als CLI ausfuehren, nicht beim Import (E4: Wiederverwendung ohne Seiteneffekt). */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await cli();
}
