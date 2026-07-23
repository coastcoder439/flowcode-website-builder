/*
 * scripts/n13-verify.mjs — N13-Verifikations-Harness (Spec §3-S6, Mangel N13).
 *
 * Prueft dreiwertig, ob „Together, WEE can." + die CTA-Buttons in der
 * Station-4-Vorschau UND im echten Ordner-Export SICHTBAR sind — nicht nur laut
 * DOM, sondern in einem ECHTEN, sichtbaren Chrome (headed). Der frueher
 * verdaechtigte Blur-/Scroll-/Canvas-Screenshot-Kanal des Automations-Browsers
 * wird damit umgangen: headless:false, channel:"chrome" = das systemeigene
 * Chrome mit echter GPU/Compositor-Pipeline.
 *
 * Ablauf:
 *   1. Dev-Server (3113, laeuft schon) — aktive Website per localStorage setzen.
 *   2. Station 4 (?station=preview) oeffnen, In-Memory-Vorschau abgreifen,
 *      Hero-Sichtbarkeit im iframe messen + Screenshot.
 *   3. „Als Ordner exportieren" ausloesen → export/<slug>/ + public/export/<slug>/.
 *   4. export/<slug>/index.html DIREKT via file:// im selben Chrome oeffnen,
 *      Hero-Sichtbarkeit messen + Screenshot.
 *
 * Screenshots → scripts/.abnahme/n13-*.png. Kein Datei-Schreiben ausser den
 * Screenshots + dem Export (den die App selbst schreibt).
 *
 * Lauf:  node scripts/n13-verify.mjs
 */

import { createRequire } from "node:module";
import { mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require_ = createRequire(import.meta.url);
const { chromium } = require_("playwright-core");

const BASIS = "http://127.0.0.1:3113";
const SLUG = "wee-v3-fein"; // Startseite der aktiven WEE-Website (traegt den Hero)
const RAUS = join(process.cwd(), "scripts", ".abnahme");
const HERO_TEXT = "Together, WEE can.";
const BUTTONS = ["Über uns", "Unterstütze uns hier"];

mkdirSync(RAUS, { recursive: true });

/* Sichtbarkeits-Messung EINES Textknotens im gegebenen document: liefert
 *  bbox, Deckkraft der Farbe, ob im Viewport, und — fuer weissen Text
 *  entscheidend — ob ein Vorfahre eine geladene Hintergrundfarbe/-bild traegt.
 *  Reine DOM-Wahrheit; das echte Auge ist der Screenshot. */
const MESS_FN = `(function(gesuchterText, buttonTexte){
  function sichtbar(el){
    if(!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      text: (el.textContent||"").trim().slice(0,60),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      imViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth,
      color: cs.color,
      opacity: cs.opacity,
      visibility: cs.visibility,
      display: cs.display,
    };
  }
  // Hero-Ueberschrift finden
  let hero = null;
  const alle = Array.from(document.querySelectorAll("h1,h2,h3,div,span,p"));
  for(const el of alle){
    if((el.textContent||"").trim() === gesuchterText){ hero = el; break; }
  }
  if(!hero){
    for(const el of alle){ if((el.textContent||"").includes(gesuchterText)){ hero = el; break; } }
  }
  // naechster Sektions-Vorfahre mit Hintergrund (fuer weissen Text)
  let hgInfo = null;
  let p = hero;
  while(p && p !== document.body){
    const cs = getComputedStyle(p);
    if((cs.backgroundImage && cs.backgroundImage !== "none") ||
       (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent")){
      hgInfo = { tag: p.tagName, bgImage: cs.backgroundImage.slice(0,120), bgColor: cs.backgroundColor };
      break;
    }
    p = p.parentElement;
  }
  // Hintergrund-<img> im Hero-Bereich (viele Puck-Heros nutzen <img> statt CSS-bg)
  let heroImg = null;
  const sekt = hero ? hero.closest("section,header,div") : null;
  if(sekt){
    const img = sekt.querySelector("img");
    if(img){
      heroImg = {
        src: (img.currentSrc||img.src||"").slice(-80),
        complete: img.complete,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
        geladen: img.complete && img.naturalWidth > 0,
      };
    }
  }
  // Buttons
  const btnTreffer = [];
  const btnEls = Array.from(document.querySelectorAll("a,button"));
  for(const wort of buttonTexte){
    const el = btnEls.find(b => (b.textContent||"").trim().includes(wort));
    btnTreffer.push({ wort, gefunden: !!el, info: el ? sichtbar(el) : null });
  }
  return {
    heroGefunden: !!hero,
    hero: sichtbar(hero),
    hintergrund: hgInfo,
    heroImg,
    buttons: btnTreffer,
    docHoehe: document.documentElement.scrollHeight,
    scrollY: window.scrollY,
  };
})(${JSON.stringify(HERO_TEXT)}, ${JSON.stringify(BUTTONS)})`;

const log = (...a) => console.log(...a);
const abschnitt = (t) => log("\n=== " + t + " ===");

let browser;
try {
  browser = await chromium.launch({ headless: false, channel: "chrome" });
} catch (e) {
  log("channel:chrome fehlgeschlagen (" + e.message + ") → Fallback executablePath");
  const CHROME = `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`;
  browser = await chromium.launch({ headless: false, executablePath: CHROME });
}

const ergebnis = { memory: null, exportDatei: null, exportPfad: null, fehler: [] };

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const seite = await ctx.newPage();
  seite.on("pageerror", (e) => ergebnis.fehler.push("pageerror: " + e.message));

  // 1 · Origin etablieren + aktive Website setzen
  abschnitt("1 · Editor laden + aktive Website setzen");
  await seite.goto(`${BASIS}/editor`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await seite.evaluate((slug) => {
    localStorage.setItem("wee-aktive-seite", slug);
  }, SLUG);
  log("aktive Website = " + SLUG);

  // 2 · Station 4 oeffnen
  abschnitt("2 · Station 4 (Vorschau) — In-Memory-iframe");
  await seite.goto(`${BASIS}/editor?station=preview`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await seite.waitForSelector(".s4-flaeche", { timeout: 30000 });
  log("Station-4-Flaeche da");
  // Warten bis das Memory-iframe bereit ist
  await seite.waitForSelector("iframe.s4-iframe", { timeout: 40000 });
  const frame = seite.frameLocator("iframe.s4-iframe");
  // Hero im iframe erscheinen lassen (srcdoc-Runtime baut auf)
  await frame.locator("body").waitFor({ timeout: 30000 });
  await seite.waitForTimeout(3500); // Runtime/Fonts/Bilder im iframe setzen lassen

  // Hero in Sicht scrollen (innerhalb des iframes)
  const iframeHandle = await seite.$("iframe.s4-iframe");
  const memMess = await iframeHandle.contentFrame().then((f) =>
    f.evaluate(`(async () => {
      const el = Array.from(document.querySelectorAll("h1,h2,h3")).find(e => (e.textContent||"").includes(${JSON.stringify(HERO_TEXT)}));
      if(el) el.scrollIntoView({ block: "center" });
      await new Promise(r => setTimeout(r, 1200));
      return ${MESS_FN};
    })()`),
  );
  ergebnis.memory = memMess;
  log("Memory-Messung:", JSON.stringify(memMess, null, 2));
  await seite.screenshot({ path: join(RAUS, "n13-station4-full.png") });
  // nur den iframe-Bereich
  const box = await iframeHandle.boundingBox();
  if (box) {
    await seite.screenshot({ path: join(RAUS, "n13-memory-iframe.png"), clip: box });
  }
  log("Screenshots: n13-station4-full.png, n13-memory-iframe.png");

  // 3 · Ordner-Export ausloesen
  abschnitt("3 · Ordner-Export ausloesen");
  await seite.click(".s4-export-toggle");
  await seite.waitForSelector(".s4-export-primaer button", { timeout: 10000 });
  await seite.click(".s4-export-primaer button");
  log("Als-Ordner-exportieren geklickt — warte auf Bericht…");
  await seite.waitForSelector(".s4-export-erfolg, .s4-export-fehler", { timeout: 120000 });
  const exportOk = await seite.$(".s4-export-erfolg");
  if (exportOk) {
    const berichtText = await seite.$eval(".s4-export-bericht", (el) => el.textContent || "");
    log("Export-Bericht: " + berichtText.replace(/\s+/g, " ").trim().slice(0, 400));
  } else {
    const fehlerText = await seite.$eval(".s4-export-fehler", (el) => el.textContent || "");
    ergebnis.fehler.push("Export-Fehler: " + fehlerText);
    log("EXPORT FEHLGESCHLAGEN: " + fehlerText);
  }

  // 4 · export/<slug>/index.html direkt via file:// im echten Chrome
  abschnitt("4 · Ordner-Artefakt direkt (file://) im echten Chrome");
  const indexPfad = resolve(process.cwd(), "export", SLUG, "index.html");
  ergebnis.exportPfad = indexPfad;
  if (existsSync(indexPfad)) {
    const fileUrl = pathToFileURL(indexPfad).href;
    log("oeffne " + fileUrl);
    const seite2 = await ctx.newPage();
    seite2.on("pageerror", (e) => ergebnis.fehler.push("export pageerror: " + e.message));
    await seite2.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await seite2.waitForTimeout(3500);
    const exMess = await seite2.evaluate(`(async () => {
      const el = Array.from(document.querySelectorAll("h1,h2,h3")).find(e => (e.textContent||"").includes(${JSON.stringify(HERO_TEXT)}));
      if(el) el.scrollIntoView({ block: "center" });
      await new Promise(r => setTimeout(r, 1500));
      return ${MESS_FN};
    })()`);
    ergebnis.exportDatei = exMess;
    log("Export-Datei-Messung:", JSON.stringify(exMess, null, 2));
    await seite2.screenshot({ path: join(RAUS, "n13-export-index.png"), fullPage: false });
    // ganze Seite fuer Kontext
    await seite2.screenshot({ path: join(RAUS, "n13-export-index-full.png"), fullPage: true });
    log("Screenshots: n13-export-index.png, n13-export-index-full.png");
  } else {
    ergebnis.fehler.push("export/" + SLUG + "/index.html nicht auf der Platte gefunden");
    log("KEINE export index.html: " + indexPfad);
  }

  abschnitt("ERGEBNIS (roh, JSON)");
  log(JSON.stringify(ergebnis, null, 2));
} catch (e) {
  log("HARNESS-FEHLER: " + (e && e.stack ? e.stack : e));
  ergebnis.fehler.push("harness: " + (e && e.message ? e.message : String(e)));
} finally {
  await seite_schliessen();
}

async function seite_schliessen() {
  try {
    await browser.close();
  } catch {}
}
