/*
 * Verifikations-Harness für das Fluss-Feature ("Der Fluss", WP5 – Fluss-
 * Verifikation). Läuft gegen den Dev-Server (Port 3113) mit dem
 * System-Chrome/Edge, nach dem Muster von scripts/verify.mjs (TitleCurtain-
 * Harness): frische Contexts je Prüfbereich, Pixel-/DOM-Belege, JSON-Ausgabe.
 *
 *   node scripts/verify-river.mjs
 *
 * Prüft: Naht Vorhang↔Fluss (Pixel), Reveal-Monotonie, Wellen-Atmung +
 * Pause außerhalb des Viewports, Geburts-Phasen (Tropfen/Splash/Quelle),
 * prefers-reduced-motion, Mobile-Overflow, Flora-Sichtbarkeit (mit
 * begrenzter Wegpunkt-Nachjustierung in river.config.json, falls Flora
 * hinter opaken Karten verschwindet), Konsolen-Fehler. Screenshots → docs/.
 * Am Ende zusätzlich scripts/verify.mjs (Vorhang-Regression).
 */
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { decodePng } from "./lib-png.mjs";

const BASE = "http://localhost:3113";
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DOCS = fileURLToPath(new URL("../docs/", import.meta.url));
const RIVER_CONFIG_PATH = fileURLToPath(new URL("../river.config.json", import.meta.url));
mkdirSync(DOCS, { recursive: true });

const DESKTOP_VIEWPORT = { width: 1920, height: 1000 };
const MOBILE_VIEWPORT = { width: 375, height: 812 };
/* Intro-Sequenz (Bäume gestaffelt, siehe TitleCurtain.tsx INTRO_*) braucht
   bis zu ~3,5-4,5s bis alles ruhig steht; 2.6s reichen für einen
   scroll-stabilen Zustand (Intro blockiert Scroll-Messungen nicht, dient
   hier nur als Sicherheitsabstand vor der ersten Scroll-Aktion). */
const INTRO_SETTLE_MS = 2600;
/* REVEAL_SPRING in RiverFlow.tsx: stiffness 120 / damping 30 – 900ms
   Wartezeit lässt den Spring nach einem harten Scroll-Sprung einschwingen. */
const SPRING_SETTLE_MS = 900;
/* Sprout-Transition in river.css: transition: transform 640ms. */
const SPROUT_SETTLE_MS = 700;

const result = { checks: {}, waypointAdjustments: [], errors: [] };
const allConsoleErrors = [];

/* ------------------------------------------------------------------ */
/* Setup-Helfer                                                        */
/* ------------------------------------------------------------------ */

async function launch() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* nächster Kanal */
    }
  }
  throw new Error("Weder Edge noch Chrome als Playwright-Channel startbar");
}

function attachConsoleCapture(page) {
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) {
      allConsoleErrors.push(m.text());
    }
  });
}

async function loadFresh(page) {
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(INTRO_SETTLE_MS);
}

/** Identisches Scroll-Muster wie scripts/verify.mjs: p=0..1 über die
 *  Vorhang-Driver-Scrollstrecke. */
const scrollDriverTo = (page, p) =>
  page.evaluate((pp) => {
    const d = document.querySelector(".tc-driver");
    const U = d.getBoundingClientRect().height - innerHeight;
    window.scrollTo({ top: Math.round(pp * U), behavior: "instant" });
  }, p);

async function withRetry(fn, label) {
  try {
    return await fn();
  } catch (err) {
    result.errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Pixel-Sampling (lib-png.mjs, gemeinsame Basis wie validate-assets.mjs)*/
/* ------------------------------------------------------------------ */

const WATER_TOKENS = [
  { r: 0x26, g: 0x4b, b: 0x57 }, // --water-900
  { r: 0x43, g: 0x95, b: 0xa7 }, // --water-800
  { r: 0x52, g: 0xa8, b: 0xb6 }, // --water-700
  { r: 0x68, g: 0xba, b: 0xc4 }, // --water-600
  { r: 0x81, g: 0xca, b: 0xd4 }, // --water-500
  { r: 0x96, g: 0xd5, b: 0xd5 }, // --water-400
  { r: 0xbc, g: 0xe8, b: 0xe5 }, // --water-300
  { r: 0xcd, g: 0xa4, b: 0x75 }, // --bank-500
  { r: 0xdc, g: 0xc0, b: 0x94 }, // --bank-400
];
/* Abstand innerhalb der Wasser-/Ufer-Familie liegt bei ~15-30, zum
   Seiten-Hintergrund (Grün/Sand/Weiß) bei >100 – 42 trennt beides sicher. */
const WATER_TOLERANCE = 42;

function nearestTokenDistance(rgb, tokens) {
  let best = Infinity;
  for (const t of tokens) {
    const d = Math.sqrt((rgb.r - t.r) ** 2 + (rgb.g - t.g) ** 2 + (rgb.b - t.b) ** 2);
    if (d < best) best = d;
  }
  return best;
}

function isWaterish(rgb) {
  return nearestTokenDistance(rgb, WATER_TOKENS) < WATER_TOLERANCE;
}

/** Nimmt einen kleinen Clip um (xCss,yCss) auf und liest den Mittelpixel. */
async function samplePixel(page, xCss, yCss) {
  const x = Math.max(0, Math.round(xCss) - 2);
  const y = Math.max(0, Math.round(yCss) - 2);
  const buf = await page.screenshot({ clip: { x, y, width: 5, height: 5 } });
  const img = decodePng(buf);
  const cx = Math.min(img.width - 1, 2);
  const cy = Math.min(img.height - 1, 2);
  const idx = (cy * img.width + cx) * img.channels;
  return { r: img.pixels[idx], g: img.pixels[idx + 1], b: img.pixels[idx + 2] };
}

/** Scrollt exakt zum Driver-Ende (Progress 1.0) und dann so viel weiter,
 *  dass die Naht Vorhang→Fluss-Zone bei einer komfortablen Viewport-Y-
 *  Position landet (statt am äußersten unteren Bildschirmrand). */
async function scrollToSeamView(page, desiredSeamY) {
  await scrollDriverTo(page, 1.0);
  await page.waitForTimeout(300);
  const bottom = await page.evaluate(
    () => document.querySelector(".tc-driver").getBoundingClientRect().bottom,
  );
  const extra = bottom - desiredSeamY;
  if (extra > 0) {
    await page.evaluate((px) => window.scrollBy(0, px), extra);
    await page.waitForTimeout(300);
  }
  return page.evaluate(() => {
    const driver = document.querySelector(".tc-driver");
    const zone = document.querySelector(".river-zone");
    const dr = driver.getBoundingClientRect();
    const zr = zone.getBoundingClientRect();
    return { seamY: (dr.bottom + zr.top) / 2, zoneLeft: zr.left, zoneWidth: zr.width };
  });
}

/* ------------------------------------------------------------------ */
/* river.config.json lesen/schreiben (nur waypoints[].xPct/widthPx/      */
/* features[].side werden je Fix-Iteration angefasst)                    */
/* ------------------------------------------------------------------ */

function readRiverConfig() {
  return JSON.parse(readFileSync(RIVER_CONFIG_PATH, "utf8"));
}
function writeRiverConfig(cfg) {
  writeFileSync(RIVER_CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

const FLORA_MAP = {
  baum: { anchor: "#haltung", panel: "#haltung .section__inner" },
  efeu: { anchor: "#oasis-prose", panel: "#oasis-prose .section__inner" },
  gras: { anchor: "#projekte", panel: "#projekte .section__inner" },
};

/* ------------------------------------------------------------------ */
/* Wellen-Pfade selektieren (RiverWaves rendert sie ohne eigene Klasse – */
/* Fill-Token + fehlendes stroke-Attribut grenzt sie vom Basispfad ab)   */
/* ------------------------------------------------------------------ */

const WAVE_FILLS = [
  "var(--water-700)",
  "var(--water-600)",
  "var(--water-500)",
  "var(--water-400)",
  "var(--water-300)",
];

const getWaveDs = (fills) =>
  Array.from(document.querySelectorAll(".river-svg path"))
    .filter((p) => fills.includes(p.getAttribute("fill")) && !p.hasAttribute("stroke"))
    .map((p) => p.getAttribute("d"));

/* ------------------------------------------------------------------ */
/* Flora-Geometrie messen (Check 7)                                     */
/* ------------------------------------------------------------------ */

async function measureFloraAt(page, variant, anchorSelector, panelSelector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
  }, anchorSelector);
  await page.waitForTimeout(300);
  /* Sprout wird direkt erzwungen statt über den Scroll-Trigger abgewartet
     – isoliert die Geometrie-/Occlusion-Frage von der (an anderer Stelle
     bereits geprüften) Reveal-Timing-Logik. */
  await page.evaluate((v) => {
    const el = document.querySelector(`.rf-flora--${v}`);
    if (el) el.classList.add("rf-flora--sprout");
  }, variant);
  await page.waitForTimeout(SPROUT_SETTLE_MS);

  return page.evaluate(
    ({ variant, panelSelector }) => {
      const flora = document.querySelector(`.rf-flora--${variant}`);
      const zone = document.querySelector(".river-zone");
      if (!flora) return { present: false };
      const fr = flora.getBoundingClientRect();
      const zr = zone.getBoundingClientRect();
      const panel = panelSelector ? document.querySelector(panelSelector) : null;
      let panelRect = null;
      let overlapRatio = 0;
      if (panel) {
        const pr = panel.getBoundingClientRect();
        panelRect = { x: pr.x, y: pr.y, w: pr.width, h: pr.height };
        const ix = Math.max(0, Math.min(fr.right, pr.right) - Math.max(fr.left, pr.left));
        const iy = Math.max(0, Math.min(fr.bottom, pr.bottom) - Math.max(fr.top, pr.top));
        const floraArea = Math.max(1, fr.width * fr.height);
        overlapRatio = (ix * iy) / floraArea;
      }
      const cx = fr.left + fr.width / 2;
      const cy = fr.top + fr.height / 2;
      const inViewport = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
      const topEl = inViewport ? document.elementFromPoint(cx, cy) : null;
      const centerInsidePanel = !!(topEl && panel && panel.contains(topEl));
      return {
        present: true,
        floraRect: { x: fr.x, y: fr.y, w: fr.width, h: fr.height },
        panelRect,
        zoneRect: { left: zr.left, width: zr.width },
        overlapRatio,
        centerInsidePanel,
        /* "vollständig verdeckt" statt jeder Teil-Überlappung – Sandufer-
           Rand-Überschneidungen sind laut Auftrag erlaubt. */
        hidden: overlapRatio >= 0.85 || centerInsidePanel,
      };
    },
    { variant, panelSelector },
  );
}

async function measureAllFlora(page) {
  const out = {};
  for (const [variant, sel] of Object.entries(FLORA_MAP)) {
    out[variant] = await measureFloraAt(page, variant, sel.anchor, sel.panel);
  }
  return out;
}

/** Verschiebt den Wegpunkt eines verdeckten Flora-Triggers so weit vom
 *  Kartenrand weg, dass er rechnerisch außerhalb der opaken .section__inner
 *  landet (mit Sicherheitsabstand). Nur xPct/side werden angefasst – Anker
 *  und Struktur bleiben unverändert (Fix-Rahmen der Aufgabe). */
function nudgeWaypoint(cfg, variant, measurement) {
  const { anchor } = FLORA_MAP[variant];
  const wp = cfg.waypoints.find((w) => w.anchor === anchor);
  const feature = wp?.features?.find((f) => f.variant === variant);
  if (!wp || !feature || !measurement.panelRect) return null;

  const MARGIN_PX = 24;
  const FLORA_CLEARANCE_PX = 22;
  const { zoneRect, panelRect } = measurement;
  const before = { xPct: wp.xPct, widthPx: wp.widthPx, side: feature.side };

  if (feature.side === "right") {
    const neededXViewport = panelRect.x + panelRect.w + MARGIN_PX + FLORA_CLEARANCE_PX;
    const neededXPct = ((neededXViewport - zoneRect.left) / zoneRect.width) * 100;
    wp.xPct = Math.min(93, Math.max(wp.xPct + 6, Math.round(neededXPct)));
    if (wp.xPct >= 92) feature.side = "left"; // Zonenrand erreicht, Seite tauschen
  } else {
    const neededXViewport = panelRect.x - MARGIN_PX - FLORA_CLEARANCE_PX;
    const neededXPct = ((neededXViewport - zoneRect.left) / zoneRect.width) * 100;
    wp.xPct = Math.max(7, Math.min(wp.xPct - 6, Math.round(neededXPct)));
    if (wp.xPct <= 8) feature.side = "right";
  }

  return { variant, before, after: { xPct: wp.xPct, widthPx: wp.widthPx, side: feature.side } };
}

/* ==================================================================== */
/* Browser starten                                                       */
/* ==================================================================== */

const browser = await launch();

/* ---------- Check 1: naht (Frischer Context, Progress 1.0) ---------- */
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await loadFresh(page);

  const seam = await scrollToSeamView(page, 500);
  const cfg = readRiverConfig();
  const seamX = seam.zoneLeft + (seam.zoneWidth * cfg.sourceExit.xPct) / 100;

  await page.screenshot({ path: DOCS + "river-final-geburt.png" });

  const offsets = [-8, -4, -1, 1, 4, 8];
  const sampledColors = {};
  let allWater = true;
  for (const off of offsets) {
    const rgb = await samplePixel(page, seamX, seam.seamY + off);
    sampledColors[off] = rgb;
    if (!isWaterish(rgb)) allWater = false;
  }
  result.checks.naht = { seamContinuous: allWater, sampledColors, seamX, seamY: seam.seamY };
  await ctx.close();
}, "naht");

/* ---------- Check 2: revealMonotonie ---------- */
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await loadFresh(page);
  await scrollDriverTo(page, 1.0);
  await page.waitForTimeout(300);

  const bounds = await page.evaluate(() => {
    const zone = document.querySelector(".river-zone");
    const r = zone.getBoundingClientRect();
    const zoneTopDoc = r.top + window.scrollY;
    return { zoneTopDoc, zoneBottomDoc: zoneTopDoc + r.height, vh: innerHeight };
  });
  /* Deckt sich mit RiverFlow.REVEAL_OFFSET = ["start 0.95","end 0.95"]. */
  const startScrollY = bounds.zoneTopDoc - 0.95 * bounds.vh;
  const endScrollY = bounds.zoneBottomDoc - 0.95 * bounds.vh;

  const heights = [];
  const fractions = [0.15, 0.4, 0.65, 0.9];
  for (let i = 0; i < fractions.length; i++) {
    const y = startScrollY + (endScrollY - startScrollY) * fractions[i];
    await page.evaluate((yy) => window.scrollTo({ top: Math.max(0, yy), behavior: "instant" }), y);
    await page.waitForTimeout(SPRING_SETTLE_MS);
    const h = await page.evaluate(() => {
      const rect = document.querySelector(".river-svg clipPath rect");
      return rect ? parseFloat(rect.getAttribute("height")) : null;
    });
    heights.push(h);
    if (i === 1) await page.screenshot({ path: DOCS + "river-final-reise-1.png" });
  }
  let strictlyIncreasing = true;
  for (let i = 1; i < heights.length; i++) {
    if (!(heights[i] > heights[i - 1])) strictlyIncreasing = false;
  }
  result.checks.revealMonotonie = { heights, strictlyIncreasing };
  await ctx.close();
}, "revealMonotonie");

/* ---------- Check 3: wellenLaufen + wellenPausieren ---------- */
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await loadFresh(page);
  await scrollDriverTo(page, 1.0);
  await page.waitForTimeout(200);

  const bounds = await page.evaluate(() => {
    const zone = document.querySelector(".river-zone");
    const r = zone.getBoundingClientRect();
    return { zoneTopDoc: r.top + window.scrollY, zoneHeight: r.height, vh: innerHeight };
  });
  const midY = bounds.zoneTopDoc + bounds.zoneHeight * 0.4 - bounds.vh * 0.5;
  await page.evaluate((y) => window.scrollTo({ top: Math.max(0, y), behavior: "instant" }), midY);
  await page.waitForTimeout(500);

  const before = await page.evaluate(getWaveDs, WAVE_FILLS);
  await page.waitForTimeout(600);
  const after = await page.evaluate(getWaveDs, WAVE_FILLS);
  const diffCount = before.filter((d, i) => d !== after[i]).length;
  result.checks.wellenLaufen = { present: before.length > 0, waveCount: before.length, diffCount };

  /* Zone weit aus dem Viewport scrollen (zurück zum Seitenanfang, weit vor
     der 660vh-Vorhangstrecke + Fluss-Zone). */
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(600); // IntersectionObserver + pauseAnimations()

  const pausedBefore = await page.evaluate(getWaveDs, WAVE_FILLS);
  const animationsPaused = await page.evaluate(() => {
    const svg = document.querySelector(".river-svg");
    return svg ? svg.animationsPaused() : null;
  });
  await page.waitForTimeout(600);
  const pausedAfter = await page.evaluate(getWaveDs, WAVE_FILLS);
  const pausedDiffCount = pausedBefore.filter((d, i) => d !== pausedAfter[i]).length;
  result.checks.wellenPausieren = {
    diffCount: pausedDiffCount,
    animationsPaused,
    pass: pausedDiffCount === 0 && animationsPaused === true,
  };
  await ctx.close();
}, "wellen");

/* ---------- Check 4: birthPhasen ---------- */
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await loadFresh(page);

  const stages = {};
  for (const [label, p] of [
    ["tropfen", 0.75],
    ["splash", 0.9],
  ]) {
    await scrollDriverTo(page, p);
    await page.waitForTimeout(400);
    await page.screenshot({ path: DOCS + `birth-check-${label}.png` });
    stages[label] = { p };
  }

  const cfg = readRiverConfig();
  const seam = await scrollToSeamView(page, 500);
  const seamX = seam.zoneLeft + (seam.zoneWidth * cfg.sourceExit.xPct) / 100;
  await page.screenshot({ path: DOCS + "birth-check-quelle.png" });
  const rgb = await samplePixel(page, seamX, seam.seamY - 2);
  stages.quelle = { p: 1.0, waterAtBottomEdge: isWaterish(rgb), sampledColor: rgb };

  result.checks.birthPhasen = stages;
  await ctx.close();
}, "birthPhasen");

/* ---------- Check 7: floraSichtbar (mit begrenzter Nachjustierung) ---------- */
const MAX_FLORA_ITERATIONS = 4;
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await loadFresh(page);

  let measurements = await measureAllFlora(page);
  const adjustments = [];

  for (let iter = 0; iter < MAX_FLORA_ITERATIONS; iter++) {
    const hidden = Object.entries(measurements).filter(([, m]) => m.present && m.hidden);
    if (hidden.length === 0) break;

    const cfg = readRiverConfig();
    let changed = false;
    for (const [variant, m] of hidden) {
      const adj = nudgeWaypoint(cfg, variant, m);
      if (adj) {
        adjustments.push({ iteration: iter + 1, ...adj });
        changed = true;
      }
    }
    if (!changed) break;
    writeRiverConfig(cfg);
    await page.waitForTimeout(900); // Datei-Watcher/Rebuild anstoßen
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(INTRO_SETTLE_MS - 400);
    measurements = await measureAllFlora(page);
  }

  const stillHidden = Object.entries(measurements).filter(([, m]) => m.present && m.hidden);
  result.checks.floraSichtbar = {
    measurements,
    iterationsUsed: adjustments.length
      ? Math.max(...adjustments.map((a) => a.iteration))
      : 0,
    allVisible: stillHidden.length === 0,
    stillHidden: stillHidden.map(([v]) => v),
  };
  result.waypointAdjustments = adjustments;
  await ctx.close();
}, "floraSichtbar");

/* ---------- Check 5: reducedMotion ---------- */
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(900);

  const state = await page.evaluate(() => {
    const rect = document.querySelector(".river-svg clipPath rect");
    const zone = document.querySelector(".river-zone");
    const animateMotionCount = document.querySelectorAll(".river-svg animateMotion").length;
    const hero = document.querySelector(".hero");
    const heroVisible = !!hero && getComputedStyle(hero).display !== "none";
    const curtainInstant = !document.querySelector(".tc-driver--active");
    const floraEls = Array.from(document.querySelectorAll(".rf-flora"));
    const floraFullyGrown = floraEls.length
      ? floraEls.every((el) => {
          const t = getComputedStyle(el).transform;
          return t === "none" || !t.startsWith("matrix(0,");
        })
      : null;
    return {
      rectHeight: rect ? parseFloat(rect.getAttribute("height")) : null,
      zoneOffsetHeight: zone ? zone.offsetHeight : null,
      animateMotionCount,
      heroVisible,
      curtainInstant,
      floraFullyGrown,
      floraCount: floraEls.length,
    };
  });
  const rectFullHeight =
    state.rectHeight !== null &&
    state.zoneOffsetHeight !== null &&
    Math.abs(state.rectHeight - state.zoneOffsetHeight) < 2;

  result.checks.reducedMotion = { ...state, rectFullHeight };
  await ctx.close();
}, "reducedMotion");

/* ---------- Check 6: mobile ---------- */
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: MOBILE_VIEWPORT });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await loadFresh(page);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  await scrollDriverTo(page, 1.0);
  await page.waitForTimeout(400);
  const riverPresent = await page.evaluate(() => !!document.querySelector(".river-svg"));

  await page.evaluate(() => {
    /* .cta-band selbst ist ein hoher Block (Titel+Intro+Ask-Grid) – Center
       darauf schiebt den Titel oben aus dem Viewport. Direkt auf den Titel
       zielen, damit er tatsächlich mittig landet. */
    const el = document.querySelector(".cta-band__title");
    if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await page.waitForTimeout(500);
  const ctaReadable = await page.evaluate(() => {
    const el = document.querySelector(".cta-band__title");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 5) return false;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return !!top && el.contains(top);
  });

  await page.screenshot({ path: DOCS + "river-final-mobile.png" });
  result.checks.mobile = {
    noHorizontalOverflow: Math.abs(overflow.scrollWidth - overflow.clientWidth) <= 1,
    overflow,
    riverPresent,
    ctaReadable,
  };
  await ctx.close();
}, "mobile");

/* ---------- Zusätzliche Belege: Box-Wasserfall + Tal (finaler Config-Stand) ---------- */
await withRetry(async () => {
  const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
  const page = await ctx.newPage();
  attachConsoleCapture(page);
  await loadFresh(page);
  await scrollDriverTo(page, 1.0);
  await page.waitForTimeout(200);

  await page.evaluate(() => {
    const el = document.querySelector("#bausteine .card:nth-child(3)");
    if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: DOCS + "river-final-boxfall.png" });

  await page.evaluate(() => {
    const el = document.querySelector("#tal .cta-band");
    if (el) el.scrollIntoView({ behavior: "instant", block: "center" });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: DOCS + "river-final-tal.png" });

  await ctx.close();
}, "belegeBoxfallTal");

await browser.close();

/* ---------- Check 8: konsole (über den gesamten Lauf) ---------- */
result.checks.konsole = { consoleErrors: allConsoleErrors, pass: allConsoleErrors.length === 0 };

/* ---------- Vorhang-Regression: scripts/verify.mjs muss grün bleiben ---------- */
try {
  const stdout = execFileSync(process.execPath, ["scripts/verify.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120000,
  });
  const parsed = JSON.parse(stdout);
  const c = parsed.checks ?? {};
  result.verifyRegression = {
    raw: parsed,
    pass:
      (c.consoleErrors ?? []).length === 0 &&
      c.curtainAfterReload === true &&
      c.mobileOverflow?.split(" vs ")[0] === c.mobileOverflow?.split(" vs ")[1],
  };
} catch (err) {
  result.verifyRegression = {
    pass: false,
    error: err instanceof Error ? err.message : String(err),
  };
}

console.log(JSON.stringify(result, null, 1));
