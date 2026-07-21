/*
 * Visueller Beleg: weiche Gras-Reaktion beim Maus-Wischen (GrassField.tsx
 * Physik-Überarbeitung). Läuft gegen den Dev-Server (Port 3113) mit dem
 * System-Chrome/Edge, wischt die Maus in 3 Schritten durchs Gras und legt
 * je einen Screenshot nach docs/grass-soft-{1,2,3}.png.
 *
 *   node scripts/verify-grass-soft.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:3113";
const DOCS = fileURLToPath(new URL("../docs/", import.meta.url));
mkdirSync(DOCS, { recursive: true });

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
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });

const scrollTo = (p) =>
  page.evaluate((pp) => {
    const d = document.querySelector(".tc-driver");
    const U = d.getBoundingClientRect().height - innerHeight;
    window.scrollTo({ top: Math.round(pp * U), behavior: "instant" });
  }, p);

await scrollTo(0.4);
await page.waitForTimeout(2200); // Intro fertig + Wind eingeschwungen

const grassBox = await page.evaluate(() => {
  const g = document.querySelector(".tc-grass");
  const r = g.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});

// Enger Ausschnitt um die Wisch-Spur herum, stark gezoomt, damit einzelne
// Halm-Krümmungen im Screenshot erkennbar sind.
const wipeCenterX = grassBox.x + 220;
const clip = {
  x: Math.max(0, wipeCenterX - 260),
  y: grassBox.y + grassBox.h * 0.15,
  width: 520,
  height: grassBox.h * 0.85,
};
const yWipe = grassBox.y + grassBox.h * 0.68;

// Maus startet weit außerhalb des Feldes, damit Schritt 1 den unberührten
// Ruhezustand mit reiner Wind-Bewegung zeigt.
await page.mouse.move(-200, yWipe);
await page.waitForTimeout(500);
await page.screenshot({ path: DOCS + "grass-soft-1.png", clip });

// Schritt 2: zügiger Wisch mitten durch den Ausschnitt – der
// Geschwindigkeits-Impuls soll die getroffenen Halme sichtbar mitreißen.
await page.mouse.move(wipeCenterX, yWipe, { steps: 6 });
await page.waitForTimeout(60); // kurz nach dem Impuls, bevor er stark abklingt
await page.screenshot({ path: DOCS + "grass-soft-2.png", clip });

// Schritt 3: kurz danach, Wisch-Geschwindigkeit klingt ab – Halme sollen
// hier weich zurückpendeln statt hart zurückzuschnappen.
await page.waitForTimeout(220);
await page.screenshot({ path: DOCS + "grass-soft-3.png", clip });

console.log(JSON.stringify({ grassBox, consoleErrors }, null, 1));

await ctx.close();
await browser.close();
