/*
 * Browser-Test des Grafik-Editors gegen den laufenden Dev-Server.
 *
 * Nutzt playwright-core aus dem npx-Zwischenspeicher und startet ein EIGENES,
 * frisches Chromium — bewusst NICHT das gemeinsame MCP-Chrome-Profil, das von
 * parallelen Claude-Sitzungen belegt wird und dann hart blockiert.
 *
 * Lauf:  node scripts/test-editor.mjs    (Dev-Server muss auf 3113 laufen)
 */

import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const require_ = createRequire(import.meta.url);
const { chromium } = require_(
  "C:/Users/Lonsinator/AppData/Local/npm-cache/_npx/a80a913f4f8f2557/node_modules/playwright-core",
);
/* BEWUSST das systemeigene Chrome, nicht Playwrights mitgeliefertes Chromium:
   letzteres startet auf diesem Rechner gar nicht ("Side-by-Side-Konfiguration
   ungueltig" = fehlende VC++-Runtime). Playwright legt beim launch() ein
   eigenes Wegwerf-Profil an, das laufende Chrome bleibt also unberuehrt. */
const CHROME = `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`;

const URL_ = "http://localhost:3113/grafik-editor/";
const RAUS = join(process.cwd(), ".vektor-test");
const BAUM = join(process.cwd(), "public", "curtain", "trees", "tree-1-0.png");

let fehler = 0;
const ok = (t) => console.log(`ok      ${t}`);
const bad = (t) => {
  console.log(`PROBLEM ${t}`);
  fehler++;
};

mkdirSync(RAUS, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const seite = await browser.newPage({ viewport: { width: 1500, height: 950 } });

const konsolFehler = [];
seite.on("console", (m) => {
  if (m.type() === "error") konsolFehler.push(m.text());
});
seite.on("pageerror", (e) => konsolFehler.push(`pageerror: ${e.message}`));

try {
  console.log("--- Seite laden ---");
  const antwort = await seite.goto(URL_, { waitUntil: "domcontentloaded", timeout: 90000 });
  if (antwort?.status() === 200) ok(`geladen (${antwort.status()})`);
  else bad(`Status ${antwort?.status()}`);
  await seite.waitForSelector(".gre-panel", { timeout: 30000 });
  ok("Editor-Panel da");

  console.log("\n--- Regler-Block (Bibliothek) ---");
  const regler = seite.locator("details.gre-vektor-regler");
  if ((await regler.count()) === 1) {
    ok("Regler-Block vorhanden");
    await regler.locator("summary").click();
    const offen = await regler.evaluate((el) => el.open);
    if (offen) ok("klappt auf");
    else bad("klappt NICHT auf");

    const schieber = regler.locator('input[type="range"]');
    const n = await schieber.count();
    if (n === 3) ok(`${n} Schieberegler (maxFarben, minFlaeche, glaettung)`);
    else bad(`${n} Schieberegler statt 3`);

    /* Wert wirklich veraendern und pruefen, dass die Anzeige mitgeht. */
    const vorher = await regler.locator(".gre-wert").first().textContent();
    await schieber.first().fill("4");
    const nachher = await regler.locator(".gre-wert").first().textContent();
    if (vorher !== nachher) ok(`Wertanzeige folgt (${vorher?.trim()} -> ${nachher?.trim()})`);
    else bad(`Wertanzeige bleibt auf ${vorher?.trim()} stehen`);
  } else {
    bad(`Regler-Block ${await regler.count()}x gefunden (erwartet 1)`);
  }

  console.log("\n--- Bild laden (ohne Ordner -> landet als Ebene) ---");
  /* setInputFiles() erreicht Reacts onChange an dem VERSTECKTEN Feld nicht.
     Deshalb bauen wir das File im Browser selbst und feuern das change-
     Ereignis ueber Reacts nativen Setter — so, wie es ein echter Dateidialog
     tut. */
  await seite.evaluate(async () => {
    const antwort = await fetch("/curtain/trees/tree-1-0.png");
    const blob = await antwort.blob();
    const datei = new File([blob], "tree-1-0.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(datei);
    const feld = document.querySelector('input[type="file"]:not([webkitdirectory])');
    if (!feld) throw new Error("Datei-Feld nicht gefunden");
    feld.files = dt.files;
    feld.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await seite.waitForTimeout(2500);

  /* Was sagt der Editor selbst dazu? Ohne das taeppt man im Dunkeln. */
  const statusNachUpload = (await seite.locator(".gre-status").first().textContent().catch(() => null)) ?? "(keine Statuszeile)";
  console.log(`        Status nach Upload: „${statusNachUpload.trim()}"`);
  const ebenenZahl = await seite.locator("[data-grafik-id]").count();
  console.log(`        Ebenen im Dokument: ${ebenenZahl}`);

  await seite.locator("button.gre-tab", { hasText: "Ebenen" }).click();
  await seite.waitForTimeout(400);
  const ebenenText = (await seite.locator(".gre-panel").textContent()) ?? "";
  console.log(`        Ebenen-Reiter sagt: „${ebenenText.slice(0, 150).replace(/\s+/g, " ").trim()}"`);

  const vektorKnopf = seite.locator('button[title*="In SVG umwandeln"]');
  if ((await vektorKnopf.count()) > 0) {
    ok(`Ebene angelegt, ⬡-Knopf da (${await vektorKnopf.count()}x)`);

    console.log("\n--- Vektorisieren ausloesen ---");
    const t0 = Date.now();
    await vektorKnopf.first().click();

    /* Ladeanzeige MUSS erscheinen — sonst weiss der Nutzer nicht, dass etwas
       laeuft. Kurzes Fenster, weil die Route in ~1s antwortet. */
    try {
      await seite.waitForSelector(".gre-vektor-overlay", { timeout: 2500 });
      ok("Ladeanzeige erscheint");
    } catch {
      bad("Ladeanzeige erscheint NICHT (oder war zu schnell weg)");
    }

    await seite.waitForSelector(".gre-vektor-overlay", { state: "detached", timeout: 40000 });
    ok(`Ladeanzeige verschwindet wieder (nach ${Date.now() - t0}ms)`);

    const status = (await seite.locator(".gre-status").first().textContent()) ?? "";
    if (/\d+\s*Gruppen?/i.test(status) && /\d+\s*Pfade?/i.test(status)) {
      ok(`Statuszeile: „${status.trim()}"`);
    } else {
      bad(`Statuszeile unbrauchbar: „${status.trim()}"`);
    }

    console.log("\n--- Ergebnis in der Bibliothek? ---");
    await seite.locator("button.gre-tab", { hasText: "Bibliothek" }).click();
    await seite.waitForTimeout(500);
    const svgAssets = await seite
      .locator(".gre-pool-item span, .gre-asset .gre-name")
      .evaluateAll((els) => els.map((e) => e.textContent ?? e.value ?? "").filter((t) => /\.svg$/i.test(t)));
    if (svgAssets.length > 0) ok(`SVG in der Bibliothek: ${svgAssets.join(", ")}`);
    else bad("kein SVG-Asset in der Bibliothek gelandet");
  } else {
    bad("keine Ebene/kein ⬡-Knopf nach dem Laden — Bild kam nicht an");
  }

  console.log("\n--- Bestandsfunktionen unversehrt? ---");
  for (const reiter of ["Bibliothek", "Ebenen", "Keyframes", "Setups"]) {
    try {
      await seite.locator("button.gre-tab", { hasText: reiter }).click({ timeout: 5000 });
      await seite.waitForTimeout(250);
      ok(`Reiter „${reiter}" oeffnet`);
    } catch {
      bad(`Reiter „${reiter}" nicht bedienbar`);
    }
  }

  await seite.locator("button.gre-tab", { hasText: "Bibliothek" }).click();
  await seite.locator("details.gre-vektor-regler summary").click().catch(() => {});
  await seite.waitForTimeout(400);
  await seite.screenshot({ path: join(RAUS, "editor.png") });
  console.log(`\n(Screenshot: ${join(RAUS, "editor.png")})`);

  console.log("\n--- Konsole ---");
  if (konsolFehler.length === 0) ok("keine Konsolenfehler");
  else {
    for (const f of konsolFehler.slice(0, 6)) bad(`Konsole: ${f.slice(0, 160)}`);
  }
} catch (e) {
  bad(`Test abgebrochen: ${e.message}`);
  await seite.screenshot({ path: join(RAUS, "editor-fehler.png") }).catch(() => {});
} finally {
  await browser.close();
}

console.log(`\n=== ${fehler === 0 ? "EDITOR STEHT" : `${fehler} PROBLEM(E)`} ===`);
process.exit(fehler === 0 ? 0 : 1);
