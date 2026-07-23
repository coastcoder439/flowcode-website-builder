/*
 * scripts/abnahme-deckung.mjs — Phase-4b-Abnahme („Deckungsgleichheit").
 *
 * ZWECK (Leons Befund 2026-07-23, Auftrag K3): Der struktur-erhaltende Import
 * (StrukturBlock) muss BEWEISEN, dass die Puck-Vorschau einer Seite GEOMETRISCH
 * deckungsgleich mit dem gefreezten Original ist — nicht „ungefaehr aehnlich",
 * sondern an konkreten Landmarken gemessen. Der alte feine Import zerlegte
 * Sektionen in lose Geschwister (Hero-Text UNTER statt UEBER dem Bild); dieses
 * Skript ist die harte Messlatte, die genau das ausschliesst.
 *
 * VERFAHREN je Seite (Chromium via playwright-core, Viewport-Breite 1280):
 *   (a) ORIGINAL — das gefreezte HTML aus scripts/.freeze-out/<freezeSlug>.html,
 *       serviert ueber einen Mini-Static-Server, dessen Asset-Pfade (/images,
 *       /_next, /curtain, Fonts) gegen test-sites/wee-website-v3/out/ aufloesen.
 *       · Das Passwort-/Vorschau-Gate (.site-gate) wird ueber DENSELBEN reinen
 *         Filter wie der Import entfernt (lib/import/fremdkoerper-filter.ts) —
 *         sonst deckte das Overlay die Seite ab.
 *       · Kontext mit javaScriptEnabled:false → keine Re-Hydration, der
 *         eingefrorene Endzustand bleibt stabil (fair + deterministisch; der
 *         Puck-Render ist ebenfalls ein statischer Endzustand).
 *   (b) PUCK-VORSCHAU — /editor?vorschau=<zielSlug> am laufenden Dev-Server
 *       (:3113). JS aktiv (React/StrukturBlock injiziert nach dem Mount).
 *
 * MESSUNG: In beiden Renderings werden fuer die 5 LAENGSTEN Texte der Seite die
 * Bounding-Boxen erfasst und je Rendering auf seinen eigenen Inhalts-Wurzel
 * normiert: x relativ zur Wurzel-Breite (~Viewportbreite), y relativ zur
 * Dokument-/Inhaltshoehe. Deckung gilt, wenn |Δx| < 8 % UND |Δy| < 8 % der
 * normierten Skala. So heben sich Chrome-Versatz und leichte Gesamthoehen-
 * Unterschiede heraus; verschobene Sektionen fallen sofort auf.
 *
 * HERO-SPEZIFISCH: Zusaetzlich wird geprueft, dass der Hero-Haupttext (groesste
 * Schrift im oberen Bereich) die Bounding-Box des Hero-Bilds (groesstes Bild im
 * ersten Screen) UEBERLAPPT — genau das Overlay, das der alte Import zerstoerte.
 * Bedingung: zeigt das Original diese Ueberlappung, MUSS die Vorschau sie auch
 * zeigen.
 *
 * AUSGABE: scripts/.abnahme/deckung-protokoll.json (Messwerte je Seite/Landmarke)
 * + Screenshot-Paare deckung-<kurz>-{original,puck}.png fuer Startseite,
 * project-oasis, bildung, faq.
 *
 * CLI:
 *   node scripts/abnahme-deckung.mjs                 (alle 16 Seiten)
 *   node scripts/abnahme-deckung.mjs --nur project-oasis   (eine Seite, Debug)
 *   FREEZE_KANAL=msedge node scripts/abnahme-deckung.mjs   (Browser-Kanal)
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/* ---- Selbst-Reexec mit TS-Transform ----
   Der reine Fremdkoerper-Filter (lib/import/fremdkoerper-filter.ts) ist TypeScript
   und braucht `DOMParser`. Bewaehrtes Repo-Muster (import-fein.mjs, buehne-
   schreiben.mjs): EINMAL mit --experimental-transform-types neu starten. Aufrufer
   merken davon nichts (identische CLI). */
if (!process.env.__DECKUNG_REEXEC) {
  const r = spawnSync(
    process.execPath,
    ["--experimental-transform-types", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, __DECKUNG_REEXEC: "1" } },
  );
  process.exit(r.status ?? 1);
}

const { readFile, writeFile, mkdir, stat } = await import("node:fs/promises");
const { createServer } = await import("node:http");
const { dirname, join, resolve, normalize, extname, sep } = await import("node:path");
const { Window } = await import("happy-dom");
const { chromium } = await import("playwright-core");

/* DOMParser global bereitstellen, BEVOR der reine Filter geladen wird (er nutzt
   `new DOMParser()`; url-Basis noetig, sonst wirft happy-dom bei relativen Pfaden
   „Invalid URL"). */
globalThis.DOMParser = new Window({ url: "http://deckung.local/" }).DOMParser;
const { entferneFremdkoerper } = await import("../lib/import/fremdkoerper-filter.ts");

const HIER = dirname(fileURLToPath(import.meta.url));
const FREEZE_ORDNER = join(HIER, ".freeze-out");
const OUT_ORDNER = resolve(HIER, "..", "test-sites", "wee-website-v3", "out");
const ABNAHME_ORDNER = join(HIER, ".abnahme");

const DEV_BASIS = process.env.DECKUNG_BASIS || "http://127.0.0.1:3113";
const VIEWPORT_BREITE = 1280;
const VIEWPORT_HOEHE = 900;
const SCHWELLE = 0.08; // 8 % der normierten Skala
const KANAL = process.env.FREEZE_KANAL || "chrome";

/* ------------------------------------------------------------------ */
/* Seiten-Katalog: freezeSlug (Datei in .freeze-out) → zielSlug (seiten/)  */
/* ------------------------------------------------------------------ */

/** zielSlug wie import-fein.mjs slugFuerSeite: index → wee-v3-fein, sonst Praefix. */
function zielSlugVon(freezeSlug) {
  return freezeSlug === "index" ? "wee-v3-fein" : `wee-v3-fein-${freezeSlug}`;
}

/* Die 16 Kandidat-Seiten. Kurzname steuert die Screenshot-Dateinamen. */
const SEITEN = [
  { freeze: "index", kurz: "startseite", screenshot: true },
  { freeze: "project-oasis", kurz: "project-oasis", screenshot: true },
  { freeze: "bildung", kurz: "bildung", screenshot: true },
  { freeze: "faq", kurz: "faq", screenshot: true },
  { freeze: "404", kurz: "404" },
  { freeze: "barrierefreiheit", kurz: "barrierefreiheit" },
  { freeze: "bildung-aquaponik", kurz: "bildung-aquaponik" },
  { freeze: "bildung-permakultur", kurz: "bildung-permakultur" },
  { freeze: "bildung-vergleich-landwirtschaft", kurz: "bildung-vergleich-landwirtschaft" },
  { freeze: "bildung-wissenschaft", kurz: "bildung-wissenschaft" },
  { freeze: "datenschutz", kurz: "datenschutz" },
  { freeze: "impressum", kurz: "impressum" },
  { freeze: "organisation", kurz: "organisation" },
  { freeze: "organisation-grundsaetze", kurz: "organisation-grundsaetze" },
  { freeze: "organisation-team", kurz: "organisation-team" },
  { freeze: "pilot-projekt", kurz: "pilot-projekt" },
];

/* ------------------------------------------------------------------ */
/* (a) Static-Server: Original-Freeze + out/-Assets                     */
/* ------------------------------------------------------------------ */

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".map": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".avif": "image/avif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8",
};
const mimeFuer = (p) => MIME[extname(p).toLowerCase()] ?? "application/octet-stream";

/** Loest einen Asset-URL-Pfad traversalsicher auf eine Datei in out/ auf. */
async function findeOutDatei(urlPfad) {
  let rel = decodeURIComponent(urlPfad.split("?")[0].split("#")[0]);
  if (rel === "" || rel === "/") return null;
  const abs = normalize(join(OUT_ORDNER, rel));
  if (abs !== OUT_ORDNER && !abs.startsWith(OUT_ORDNER + sep)) return null;
  const st = await stat(abs).catch(() => null);
  return st && st.isFile() ? abs : null;
}

/**
 * Startet den Original-Server. Der HTML-Endpunkt /__original__ liefert das
 * (per Variable gesetzte) gefreezte, gate-freie HTML der aktuellen Seite; jeder
 * andere Pfad wird als Asset aus out/ ausgeliefert. So loesen die absoluten
 * /images-, /_next-, /curtain-Pfade des Freezes gegen das echte Web-Root auf.
 */
async function starteOriginalServer() {
  const zustand = { html: "<!doctype html><title>leer</title>" };
  const server = createServer(async (req, res) => {
    try {
      const pfad = (req.url ?? "/").split("?")[0];
      if (pfad === "/__original__" || pfad === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(zustand.html);
        return;
      }
      const abs = await findeOutDatei(pfad);
      if (!abs) { res.writeHead(404).end("nicht gefunden"); return; }
      res.writeHead(200, { "Content-Type": mimeFuer(abs), "Cache-Control": "no-store" });
      res.end(await readFile(abs));
    } catch {
      res.writeHead(500).end("serverfehler");
    }
  });
  await new Promise((ok, weg) => { server.once("error", weg); server.listen(0, "127.0.0.1", ok); });
  const port = server.address().port;
  return {
    url: `http://127.0.0.1:${port}`,
    setzeHtml(html) { zustand.html = html; },
    schliessen() { return new Promise((r) => server.close(() => r())); },
  };
}

/** Liest den gefreezten Roh-HTML, entfernt das Gate (reiner Import-Filter). */
async function ladeOriginalHtml(freezeSlug) {
  const roh = await readFile(join(FREEZE_ORDNER, `${freezeSlug}.html`), "utf-8");
  return entferneFremdkoerper(roh).html;
}

/* ------------------------------------------------------------------ */
/* Geometrie-Extraktion (im Browser)                                    */
/* ------------------------------------------------------------------ */

/*
 * Sammelt je Rendering die messbaren Elemente unter `wurzelSelektor`,
 * normiert auf die Inhalts-Wurzel:
 *   nx = (rect.left - wurzel.left) / wurzelBreite
 *   ny = (rect.top  - wurzel.top ) / wurzelHoehe   (wurzelHoehe = scrollHeight)
 * Texte tragen ihren direkten (nicht ererbten) Textinhalt, whitespace-normiert.
 * Unsichtbare Elemente (display:none, opacity<0.05, visibility:hidden, 0-Flaeche)
 * fallen raus, damit Hover-Menues/Deko-Canvases keine Landmarke werden.
 */
const EXTRAKT_FN = `(wurzelSelektor) => {
  const wurzel = document.querySelector(wurzelSelektor) || document.body;
  const wr = wurzel.getBoundingClientRect();
  const wurzelBreite = wr.width || 1;
  const wurzelHoehePx = Math.max(wurzel.scrollHeight, wr.height) || 1;
  const norm = (r) => ({
    nx: (r.left - wr.left) / wurzelBreite,
    ny: (r.top - wr.top) / wurzelHoehePx,
    nw: r.width / wurzelBreite,
    nh: r.height / wurzelHoehePx,
  });
  const sichtbar = (el, cs, r) => {
    if (r.width < 2 || r.height < 2) return false;
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (parseFloat(cs.opacity || "1") < 0.05) return false;
    return true;
  };
  const direkterText = (el) => {
    let s = "";
    for (const n of el.childNodes) if (n.nodeType === 3) s += n.textContent;
    return s.replace(/\\s+/g, " ").trim();
  };
  const texte = [];
  const bilder = [];
  const alle = wurzel.querySelectorAll("*");
  for (const el of alle) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!sichtbar(el, cs, r)) continue;
    const t = direkterText(el);
    if (t.length >= 8) {
      texte.push({ text: t, fontSize: parseFloat(cs.fontSize) || 0, tag: el.tagName.toLowerCase(), ...norm(r) });
    }
    const tag = el.tagName.toLowerCase();
    const bg = cs.backgroundImage;
    const istBg = bg && bg !== "none" && /url\\(/i.test(bg);
    if (tag === "img" || istBg) {
      bilder.push({
        src: tag === "img" ? (el.getAttribute("src") || "") : (bg.match(/url\\(["']?([^"')]+)/i)?.[1] || "bg"),
        areaPx: r.width * r.height,
        ...norm(r),
      });
    }
  }
  return { wurzelBreite, wurzelHoehePx, viewportHoehe: window.innerHeight, texte, bilder };
}`;

async function extrahiere(page, wurzelSelektor) {
  return page.evaluate(new Function("return " + EXTRAKT_FN)(), wurzelSelektor);
}

/* ------------------------------------------------------------------ */
/* Landmarken-Auswahl + Vergleich (in Node)                             */
/* ------------------------------------------------------------------ */

/** Die 5 laengsten, eindeutigen Texte des Originals (mind. 12 Zeichen). */
function waehleLandmarken(originalTexte) {
  const gesehen = new Set();
  const sortiert = [...originalTexte].sort((a, b) => b.text.length - a.text.length);
  const gewaehlt = [];
  for (const e of sortiert) {
    if (e.text.length < 12) continue;
    const key = e.text.toLowerCase();
    if (gesehen.has(key)) continue;
    gesehen.add(key);
    gewaehlt.push(e);
    if (gewaehlt.length >= 5) break;
  }
  return gewaehlt;
}

/** Findet die beste Entsprechung eines Landmarken-Texts im Ziel-Rendering. */
function findePendant(text, zielTexte) {
  const key = text.toLowerCase();
  const exakt = zielTexte.filter((e) => e.text.toLowerCase() === key);
  if (exakt.length > 0) {
    /* Bei Mehrfachtreffer den flaechenkleinsten (das eigentliche Textelement,
       nicht einen umschliessenden Wrapper mit gleichem direktem Text). */
    return exakt.sort((a, b) => a.nw * a.nh - b.nw * b.nh)[0];
  }
  /* Fallback: enthaelt-Vergleich (Rest-Whitespace-Differenzen). */
  const teil = zielTexte.filter((e) => e.text.toLowerCase().includes(key) || key.includes(e.text.toLowerCase()));
  return teil.length > 0 ? teil.sort((a, b) => a.nw * a.nh - b.nw * b.nh)[0] : null;
}

/** Ueberlappen zwei normierte Boxen (nx,ny,nw,nh)? */
function ueberlappt(a, b) {
  return a.nx < b.nx + b.nw && a.nx + a.nw > b.nx && a.ny < b.ny + b.nh && a.ny + a.nh > b.ny;
}

/**
 * SPALTEN-TREUE (Fix K3, Nicht-OK-Check 3b): die reine Landmarken-Positionsmetrik
 * (5 laengste Texte) erkennt eine Spalten-STAPELUNG NICHT zuverlaessig — wenn die
 * zwei nebeneinander liegenden Spalten-Texte zufaellig nicht unter den 5 laengsten
 * sind, bleibt der Fehler unsichtbar (genau Leons project-oasis-Befund). Diese
 * Pruefung ist dagegen STRUKTURELL: sie sucht im ORIGINAL die klarste Zweispalten-
 * Reihe (zwei Texte gleicher Zeile, weit auseinander) und verlangt, dass die
 * Vorschau sie WEITERHIN nebeneinander (gleiche Zeile, erhaltener Horizontal-
 * Abstand) zeigt — stapeln sie, schlaegt es fehl.
 *
 * Rueckgabe: "n/a" (Seite hat keine erkennbare Zweispalten-Reihe → keine Forderung),
 * "ok" (Reihe bleibt nebeneinander) oder "fehlgeschlagen" (Reihe stapelt in der
 * Vorschau) — plus die Mess-Details fuers Protokoll.
 */
function spaltenTreue(original, puck) {
  const ZEILE = 0.035; // gleiche Zeile: |Δny| darunter
  const MIN_SPREIZUNG = 0.3; // klare Zweispaltigkeit: nx-Abstand darueber
  const MAX_SPREIZUNG = 0.9; // groesser = kein echtes Spaltenpaar (Off-Screen-Artefakt)
  /* Nur ON-SCREEN-Texte: off-screen positionierte Helfer (Skip-Link „Zum Inhalt
     springen" bei left:-9999px → nx≈-7.8) taeuschten sonst eine Riesen-„Spreizung"
     vor und machten die Pruefung wertlos. nx in [0,1[ und rechter Rand im Viewport. */
  const kandidaten = original.texte.filter(
    (e) => e.text.length >= 15 && e.nx >= 0 && e.nx < 1 && e.nx + (e.nw || 0) <= 1.05,
  );
  /* Die Reihe mit der groessten horizontalen Spreizung finden (leftmost↔rightmost
     zweier Texte gleicher Zeile). */
  let best = null;
  for (let i = 0; i < kandidaten.length; i++) {
    for (let j = i + 1; j < kandidaten.length; j++) {
      const a = kandidaten[i];
      const b = kandidaten[j];
      if (Math.abs(a.ny - b.ny) > ZEILE) continue;
      const spreizung = Math.abs(a.nx - b.nx);
      if (spreizung < MIN_SPREIZUNG || spreizung > MAX_SPREIZUNG) continue;
      if (!best || spreizung > best.spreizung) {
        const [links, rechts] = a.nx <= b.nx ? [a, b] : [b, a];
        best = { links, rechts, spreizung };
      }
    }
  }
  if (!best) return { status: "n/a" };

  const pl = findePendant(best.links.text, puck.texte);
  const pr = findePendant(best.rechts.text, puck.texte);
  if (!pl || !pr) {
    /* Pendants nicht auffindbar → keine harte Aussage moeglich (kein Fehlurteil). */
    return {
      status: "n/a",
      hinweis: "Spalten-Pendant nicht gefunden",
      links: best.links.text.slice(0, 40),
      rechts: best.rechts.text.slice(0, 40),
    };
  }
  const gleicheZeile = Math.abs(pl.ny - pr.ny) < 0.06;
  const spreizungErhalten = Math.abs(pl.nx - pr.nx) > 0.2;
  const nebeneinander = gleicheZeile && spreizungErhalten;
  return {
    status: nebeneinander ? "ok" : "fehlgeschlagen",
    original: { spreizung: +best.spreizung.toFixed(3), links: +best.links.nx.toFixed(3), rechts: +best.rechts.nx.toFixed(3) },
    puck: { spreizung: +Math.abs(pl.nx - pr.nx).toFixed(3), dny: +Math.abs(pl.ny - pr.ny).toFixed(3) },
    links: best.links.text.slice(0, 40),
    rechts: best.rechts.text.slice(0, 40),
  };
}

/** Hero-Text (groesste Schrift oben) + Hero-Bild (groesstes Bild im 1. Screen). */
function heroPaar(info) {
  const topFraktion = info.viewportHoehe / info.wurzelHoehePx;
  const obenText = info.texte.filter((e) => e.ny < topFraktion * 1.25 && e.text.length >= 4);
  const heroText = obenText.sort((a, b) => b.fontSize - a.fontSize || b.text.length - a.text.length)[0] || null;
  const obenBild = info.bilder.filter((e) => e.ny < topFraktion * 1.05);
  const heroBild = obenBild.sort((a, b) => b.areaPx - a.areaPx)[0] || null;
  return { heroText, heroBild };
}

/** Bewertet eine Seite: Landmarken-Deckung + Hero-Ueberlappung. */
function bewerte(original, puck) {
  const landmarken = waehleLandmarken(original.texte);
  const ergebnisse = [];
  for (const lm of landmarken) {
    const p = findePendant(lm.text, puck.texte);
    if (!p) {
      ergebnisse.push({
        text: lm.text.slice(0, 60), gefunden: false, bestanden: false,
        original: { nx: +lm.nx.toFixed(4), ny: +lm.ny.toFixed(4) },
      });
      continue;
    }
    const dx = Math.abs(lm.nx - p.nx);
    const dy = Math.abs(lm.ny - p.ny);
    const bestanden = dx < SCHWELLE && dy < SCHWELLE;
    ergebnisse.push({
      text: lm.text.slice(0, 60), gefunden: true, bestanden,
      dx: +dx.toFixed(4), dy: +dy.toFixed(4),
      original: { nx: +lm.nx.toFixed(4), ny: +lm.ny.toFixed(4) },
      puck: { nx: +p.nx.toFixed(4), ny: +p.ny.toFixed(4) },
    });
  }

  /* Hero-Ueberlappung. */
  const ho = heroPaar(original);
  const hp = heroPaar(puck);
  const origUeberlappt = ho.heroText && ho.heroBild ? ueberlappt(ho.heroText, ho.heroBild) : false;
  const puckUeberlappt = hp.heroText && hp.heroBild ? ueberlappt(hp.heroText, hp.heroBild) : false;
  let heroStatus;
  if (!origUeberlappt) heroStatus = "n/a"; // Original hat kein Hero-Overlay → keine Forderung
  else heroStatus = puckUeberlappt ? "ok" : "fehlgeschlagen";

  /* Spalten-Treue (3b): eine erkennbare Zweispalten-Reihe darf nicht stapeln. */
  const spalten = spaltenTreue(original, puck);

  const gemessen = ergebnisse.filter((e) => e.gefunden);
  const fehlgeschlagen = ergebnisse.filter((e) => !e.bestanden);
  const bestanden =
    gemessen.length >= 3 &&
    fehlgeschlagen.length === 0 &&
    heroStatus !== "fehlgeschlagen" &&
    spalten.status !== "fehlgeschlagen";

  return {
    bestanden,
    landmarkenGesamt: landmarken.length,
    landmarkenGemessen: gemessen.length,
    landmarkenBestanden: ergebnisse.filter((e) => e.bestanden).length,
    hero: {
      status: heroStatus,
      originalHeroText: ho.heroText ? ho.heroText.text.slice(0, 50) : null,
      originalUeberlappt: origUeberlappt,
      puckUeberlappt,
    },
    spalten,
    landmarken: ergebnisse,
    hoehen: { originalPx: Math.round(original.wurzelHoehePx), puckPx: Math.round(puck.wurzelHoehePx) },
  };
}

/* ------------------------------------------------------------------ */
/* Rendering-Runden                                                     */
/* ------------------------------------------------------------------ */

/** Rendert das gefreezte Original (JS aus) und extrahiert die Geometrie. */
async function renderOriginal(browser, server, freezeSlug, screenshotPfad) {
  server.setzeHtml(await ladeOriginalHtml(freezeSlug));
  const kontext = await browser.newContext({
    viewport: { width: VIEWPORT_BREITE, height: VIEWPORT_HOEHE },
    javaScriptEnabled: false,
  });
  const page = await kontext.newPage();
  try {
    await page.goto(server.url + "/__original__", { waitUntil: "load", timeout: 60_000 });
    /* Bilder/Fonts abwarten (ohne JS kein networkidle-Signal → explizit). */
    await page.evaluate(`() => Promise.all(
      [...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))
    )`).catch(() => {});
    await page.evaluate(`() => (document.fonts ? document.fonts.ready : Promise.resolve())`).catch(() => {});
    await page.waitForTimeout(300);
    const info = await extrahiere(page, "body");
    if (screenshotPfad) await page.screenshot({ path: screenshotPfad, fullPage: true });
    return info;
  } finally {
    await kontext.close();
  }
}

/** Rendert die Puck-Vorschau (JS an) und extrahiert die Geometrie. */
async function renderPuck(browser, zielSlug, screenshotPfad) {
  const kontext = await browser.newContext({
    viewport: { width: VIEWPORT_BREITE, height: VIEWPORT_HOEHE },
  });
  const page = await kontext.newPage();
  try {
    const url = `${DEV_BASIS}/editor?vorschau=${encodeURIComponent(zielSlug)}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    /* Auf die Vorschau-Buehne + injizierte StrukturBloecke warten (Client-Mount). */
    await page.waitForSelector("[data-fc-vorschau-buehne]", { timeout: 30_000 });
    await page.waitForFunction(
      `() => {
        const b = document.querySelector("[data-fc-vorschau-buehne]");
        if (!b) return false;
        const bloecke = b.querySelectorAll(".fc-struktur-block");
        if (bloecke.length === 0) return false;
        return (b.innerText || "").replace(/\\s+/g, "").length > 40;
      }`,
      { timeout: 30_000 },
    ).catch(() => {});
    await page.evaluate(`() => Promise.all(
      [...document.images].filter((i) => !i.complete).map((i) => new Promise((r) => { i.onload = i.onerror = r; }))
    )`).catch(() => {});
    await page.evaluate(`() => (document.fonts ? document.fonts.ready : Promise.resolve())`).catch(() => {});
    await page.waitForTimeout(500);
    const info = await extrahiere(page, "[data-fc-vorschau-buehne]");
    /* Screenshot-Sonderfall: die Vorschau ist ein position:fixed-Portal (z-1200)
       — fullPage misst nur die scrollHeight des Basis-Dokuments und schneidet das
       Overlay auf einen Viewport ab. Den Viewport zu vergroessern hilft NICHT,
       weil 100vh-Hero-Boxen dann mitwachsen (Hero absurd hoch). Stattdessen das
       fixed-Portal fuer den Screenshot in den normalen Fluss zwingen (position
       static, Hoehe auto) — der Viewport (→ vh-Einheiten) bleibt bei 900, und
       fullPage kann die ganze Inhaltshoehe erfassen. Nur fuer den Screenshot. */
    if (screenshotPfad) {
      await page.addStyleTag({
        content:
          ".seiten-vorschau{position:static !important;height:auto !important;min-height:0 !important;overflow:visible !important}" +
          ".seiten-vorschau-buehne{overflow:visible !important}" +
          ".seiten-vorschau-zurueck{display:none !important}",
      });
      await page.waitForTimeout(400);
      await page.screenshot({ path: screenshotPfad, fullPage: true });
    }
    return info;
  } finally {
    await kontext.close();
  }
}

/* ------------------------------------------------------------------ */
/* Hauptlauf                                                            */
/* ------------------------------------------------------------------ */

function argWert(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function devErreichbar() {
  try {
    const r = await fetch(DEV_BASIS + "/", { method: "HEAD" });
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
}

async function main() {
  const nur = argWert("--nur", null);
  const seiten = nur ? SEITEN.filter((s) => s.freeze === nur || s.kurz === nur) : SEITEN;
  if (seiten.length === 0) {
    console.error(`✗ Keine Seite passt zu --nur „${nur}".`);
    process.exit(1);
  }

  if (!(await devErreichbar())) {
    console.error(`✗ Dev-Server ${DEV_BASIS} nicht erreichbar — Abbruch (die Puck-Vorschau braucht ihn).`);
    process.exit(1);
  }

  await mkdir(ABNAHME_ORDNER, { recursive: true });
  const server = await starteOriginalServer();
  let browser;
  const protokoll = { datum: new Date().toISOString(), viewportBreite: VIEWPORT_BREITE, schwelle: SCHWELLE, seiten: [] };

  try {
    browser = await chromium.launch({ channel: KANAL, headless: true });
    for (const s of seiten) {
      const zielSlug = zielSlugVon(s.freeze);
      const shotOrig = s.screenshot ? join(ABNAHME_ORDNER, `deckung-${s.kurz}-original.png`) : null;
      const shotPuck = s.screenshot ? join(ABNAHME_ORDNER, `deckung-${s.kurz}-puck.png`) : null;
      process.stderr.write(`\n── ${s.kurz}  (freeze „${s.freeze}" → ziel „${zielSlug}") ──\n`);
      try {
        const original = await renderOriginal(browser, server, s.freeze, shotOrig);
        const puck = await renderPuck(browser, zielSlug, shotPuck);
        const wert = bewerte(original, puck);
        protokoll.seiten.push({ kurz: s.kurz, freezeSlug: s.freeze, zielSlug, ...wert });
        process.stderr.write(
          `   ${wert.bestanden ? "✓ BESTANDEN" : "✗ GESCHEITERT"} · Landmarken ${wert.landmarkenBestanden}/${wert.landmarkenGemessen} (von ${wert.landmarkenGesamt}) · Hero ${wert.hero.status} · Spalten ${wert.spalten.status}\n`,
        );
        for (const lm of wert.landmarken) {
          const kennz = lm.bestanden ? "  ok " : lm.gefunden ? "  !! " : "  ?? ";
          const zahlen = lm.gefunden ? `Δx=${lm.dx} Δy=${lm.dy}` : "nicht in Vorschau gefunden";
          process.stderr.write(`   ${kennz}${zahlen}  „${lm.text}"\n`);
        }
      } catch (fehler) {
        process.stderr.write(`   ✗ FEHLER: ${fehler?.message ?? fehler}\n`);
        protokoll.seiten.push({ kurz: s.kurz, freezeSlug: s.freeze, zielSlug, bestanden: false, fehler: String(fehler?.message ?? fehler) });
      }
    }
  } finally {
    if (browser) await browser.close();
    await server.schliessen();
  }

  const bestanden = protokoll.seiten.filter((s) => s.bestanden).length;
  protokoll.zusammenfassung = {
    seitenGesamt: protokoll.seiten.length,
    bestanden,
    gescheitert: protokoll.seiten.length - bestanden,
    schwelleErfuellt: bestanden >= 13,
    pflichtSeiten: {
      startseite: protokoll.seiten.find((s) => s.kurz === "startseite")?.bestanden ?? false,
      "project-oasis": protokoll.seiten.find((s) => s.kurz === "project-oasis")?.bestanden ?? false,
    },
  };

  const protokollPfad = join(ABNAHME_ORDNER, "deckung-protokoll.json");
  await writeFile(protokollPfad, JSON.stringify(protokoll, null, 2), "utf-8");

  process.stderr.write(`\n══ Fertig: ${bestanden}/${protokoll.seiten.length} bestanden ══\n`);
  process.stderr.write(`   Protokoll: ${protokollPfad}\n`);
  process.stdout.write(JSON.stringify(protokoll.zusammenfassung) + "\n");

  /* Kein harter Exit-Fehler bei einzelnen Seiten — das Protokoll ist die Wahrheit;
     der Aufrufer entscheidet anhand von schwelleErfuellt + pflichtSeiten. */
}

await main();
