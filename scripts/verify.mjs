/*
 * Verifikations-Harness für den TitleCurtain v2 (Plan Phase 5).
 * Läuft gegen den Dev-Server (Port 3112) mit dem System-Chrome/Edge.
 *
 *   node scripts/verify.mjs
 *
 * Prüft: Intro-Wachstum, Occlusion bei p=0, Sway-Animationen, Scroll-Kurven,
 * Mobile-Overflow, prefers-reduced-motion, Reload-Regel. Screenshots → docs/.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3113";
/* fileURLToPath dekodiert %20 korrekt – der frühere pathname-Hack legte
   auf Windows URL-encodete Geister-Ordner an. */
const DOCS = fileURLToPath(new URL("../docs/", import.meta.url));
mkdirSync(DOCS, { recursive: true });

const result = { checks: {}, errors: [] };

async function launch() {
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* nächster Kanal */
    }
  }
  throw new Error("Weder Chrome noch Edge als Playwright-Channel startbar");
}

const browser = await launch();

/* ---------- Desktop-Durchlauf ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

  // Intro-Sequenz: Frames kurz nach Load
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: DOCS + "v3-intro-0.3s.png" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: DOCS + "v3-intro-0.8s.png" });
  await page.waitForTimeout(1900); // Intro (Delays bis 0.85s + 1.05s Dauer) fertig
  await page.screenshot({ path: DOCS + "v3-closed-p0.png" });

  // Occlusion-Check: Was liegt visuell über der Titel-Mitte?
  result.checks.occlusionAtP0 = await page.evaluate(() => {
    const title = document.querySelector(".tc-title");
    if (!title) return "NO TITLE";
    const r = title.getBoundingClientRect();
    const probe = [0.25, 0.5, 0.75].map((f) => {
      const el = document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2);
      return el ? el.tagName + "." + (el.getAttribute("class") || el.getAttribute("fill") || "") : "none";
    });
    return probe;
  });

  // Sway aktiv?
  result.checks.swayAnimations = await page.evaluate(
    () => document.getAnimations().filter((a) => a.animationName === "tc-sway-rock").length,
  );

  // Scroll-Zustände
  const scrollTo = (p) =>
    page.evaluate((pp) => {
      const d = document.querySelector(".tc-driver");
      const U = d.getBoundingClientRect().height - innerHeight;
      window.scrollTo({ top: Math.round(pp * U), behavior: "instant" });
    }, p);

  await scrollTo(0.4);
  await page.waitForTimeout(200);
  await page.screenshot({ path: DOCS + "v3-ruhe-p40.png" });
  result.checks.titleVisibleAtRest = await page.evaluate(() => {
    const title = document.querySelector(".tc-title");
    const r = title.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el ? el.tagName + "." + (el.getAttribute("class") || "") : "none";
  });

  await scrollTo(0.72);
  await page.waitForTimeout(200);
  await page.screenshot({ path: DOCS + "v3-exit-p72.png" });

  await scrollTo(0.97);
  await page.waitForTimeout(200);
  await page.screenshot({ path: DOCS + "v3-ende-p97.png" });
  result.checks.heroOpacityAtEnd = await page.evaluate(
    () => getComputedStyle(document.querySelector(".tc-hero")).opacity,
  );

  // Gras-Interaktion: Maus in die Gras-Zone → Halme biegen sich (Pixel-Diff)
  await scrollTo(0.4);
  await page.waitForTimeout(700); // Wind einschwingen lassen
  const grassBox = await page.evaluate(() => {
    const g = document.querySelector(".tc-grass");
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  if (grassBox) {
    const shot = () =>
      page.screenshot({
        clip: { x: grassBox.x, y: grassBox.y + grassBox.h * 0.3, width: 420, height: grassBox.h * 0.7 },
      });
    await page.mouse.move(-100, -100);
    await page.waitForTimeout(450);
    const before = await shot();
    await page.mouse.move(grassBox.x + 160, grassBox.y + grassBox.h * 0.7, { steps: 8 });
    await page.waitForTimeout(250);
    const after = await shot();
    let diff = 0;
    const n = Math.min(before.length, after.length);
    for (let i = 0; i < n; i += 97) if (before[i] !== after[i]) diff++;
    result.checks.grassReactsToMouse = { sampledDiffs: diff, present: true };
    await page.screenshot({ path: DOCS + "v3-grass-mouse.png" });
  } else {
    result.checks.grassReactsToMouse = { present: false };
  }

  // Reload-Regel: Latch gesetzt, aber echter Reload → Curtain wieder da
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  result.checks.curtainAfterReload = await page.evaluate(
    () => !!document.querySelector(".tc-driver--active"),
  );

  result.checks.consoleErrors = consoleErrors.filter((e) => !e.includes("favicon"));
  await ctx.close();
}

/* ---------- Mobile-Durchlauf ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: DOCS + "v3-mobile-p0.png" });
  result.checks.mobileOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth + " vs " + innerWidth,
  );
  await page.evaluate(() => {
    const d = document.querySelector(".tc-driver");
    const U = d.getBoundingClientRect().height - innerHeight;
    window.scrollTo({ top: Math.round(0.4 * U), behavior: "instant" });
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: DOCS + "v3-mobile-ruhe.png" });
  await ctx.close();
}

/* ---------- Reduced Motion ---------- */
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(600);
  result.checks.reducedMotion = await page.evaluate(() => ({
    curtainDom: !!document.querySelector(".tc-driver"),
    animations: document.getAnimations().length,
    heroVisible: !!document.querySelector(".hero"),
  }));
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(result, null, 1));
