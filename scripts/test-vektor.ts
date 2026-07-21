/*
 * Prueft den Vektorisierer an den ECHTEN Baum-PNGs statt an synthetischen
 * Bildern: nur am echten Motiv zeigt sich, ob Anti-Aliasing sauber weggeht
 * und ob die Bueschel als getrennte Flaechen herauskommen.
 *
 * Lauf:  npx tsx scripts/test-vektor.ts
 * Ergebnis-SVGs landen in .vektor-test/ (gitignoriert, reine Sichtpruefung).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { vektorisiere } from "../components/vektor/vektorisieren";

const TREES = join(process.cwd(), "public", "curtain", "trees");
const RAUS = join(process.cwd(), ".vektor-test");

/** Baeume aus jeder der drei Ebenen — die sind unterschiedlich gross/detailliert. */
const PROBEN = ["tree-1-0.png", "tree-2-0.png", "tree-3-0.png", "tree-3-5.png"];

async function main() {
  mkdirSync(RAUS, { recursive: true });
  let fehler = 0;

  for (const datei of PROBEN) {
    const pfad = join(TREES, datei);
    let roh;
    try {
      roh = await sharp(pfad)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch (e) {
      console.log(`FEHLT   ${datei} — ${(e as Error).message}`);
      continue;
    }

    const { data, info } = roh;
    const t0 = performance.now();
    let erg;
    try {
      erg = vektorisiere(new Uint8ClampedArray(data), info.width, info.height);
    } catch (e) {
      console.log(`CRASH   ${datei} — ${(e as Error).message}`);
      console.log((e as Error).stack);
      fehler++;
      continue;
    }
    const dauer = performance.now() - t0;

    const pfade = erg.gruppen.reduce((s, g) => s + g.pfade, 0);
    const kb = Math.round(erg.svg.length / 1024);
    writeFileSync(join(RAUS, datei.replace(".png", ".svg")), erg.svg);

    /* Die harten Kriterien: laeuft es, ist es schnell, kommen ueberhaupt
       trennbare Flaechen raus, und ist das SVG wohlgeformt? */
    const probleme: string[] = [];
    if (dauer > 2000) probleme.push(`ZU LANGSAM (${Math.round(dauer)}ms)`);
    if (pfade < 2) probleme.push(`NUR ${pfade} PFAD — nichts zu animieren`);
    if (pfade > 400) probleme.push(`${pfade} PFADE — Anti-Aliasing nicht weg?`);
    if (!erg.svg.startsWith("<svg")) probleme.push("kein <svg> am Anfang");
    if (!erg.svg.trimEnd().endsWith("</svg>")) probleme.push("kein </svg> am Ende");
    if (erg.svg.includes("NaN")) probleme.push("NaN im Pfad!");
    if (erg.svg.includes("undefined")) probleme.push("undefined im SVG!");

    const status = probleme.length ? "PROBLEM" : "ok     ";
    console.log(
      `${status} ${datei.padEnd(14)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)} ` +
        `${String(Math.round(dauer)).padStart(5)}ms  ${String(erg.gruppen.length).padStart(2)} Gruppen  ` +
        `${String(pfade).padStart(3)} Pfade  ${String(kb).padStart(4)} kB`,
    );
    for (const g of erg.gruppen) {
      console.log(`          ${g.farbe}  ${g.name.padEnd(22)} ${g.pfade} Flaeche(n)`);
    }
    for (const p of probleme) {
      console.log(`          !! ${p}`);
      fehler++;
    }
  }

  /* Randfaelle: duerfen nicht abstuerzen. */
  console.log("\n--- Randfaelle ---");
  const faelle: [string, Uint8ClampedArray, number, number][] = [
    ["komplett transparent", new Uint8ClampedArray(40 * 40 * 4), 40, 40],
    ["1x1 Pixel", new Uint8ClampedArray([255, 0, 0, 255]), 1, 1],
    ["leeres Bild", new Uint8ClampedArray(0), 0, 0],
  ];
  for (const [name, buf, b, h] of faelle) {
    try {
      const e = vektorisiere(buf, b, h);
      console.log(`ok      ${name.padEnd(22)} -> ${e.gruppen.length} Gruppen`);
    } catch (err) {
      console.log(`CRASH   ${name.padEnd(22)} -> ${(err as Error).message}`);
      fehler++;
    }
  }

  /* Determinismus: zweimal derselbe Input muss byte-gleich rauskommen,
     sonst waere das Ergebnis in einer Design-Pipeline wertlos. */
  console.log("\n--- Determinismus ---");
  const p = join(TREES, PROBEN[0]);
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = vektorisiere(new Uint8ClampedArray(data), info.width, info.height).svg;
  const b = vektorisiere(new Uint8ClampedArray(data), info.width, info.height).svg;
  if (a === b) {
    console.log("ok      zwei Laeufe byte-gleich");
  } else {
    console.log("CRASH   zwei Laeufe UNTERSCHIEDLICH — nicht deterministisch!");
    fehler++;
  }

  console.log(`\n=== ${fehler === 0 ? "ALLES GRUEN" : `${fehler} PROBLEM(E)`} ===`);
  console.log(`SVGs zum Ansehen: ${RAUS}`);
  process.exit(fehler === 0 ? 0 : 1);
}

void main();
