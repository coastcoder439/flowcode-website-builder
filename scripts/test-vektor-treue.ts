/*
 * Formtreue-Pruefung: rendert das erzeugte SVG zurueck zu PNG und vergleicht
 * es Pixel fuer Pixel mit dem Original. Beantwortet die einzige Frage, die
 * zaehlt — hat der Vektorisierer die Formen erhalten oder verhunzt?
 *
 * Verglichen wird auf der ALPHA-Maske und den Farben getrennt:
 *   - Silhouetten-Abweichung: wo ist Deckung/keine Deckung unterschiedlich
 *   - Farb-Abweichung: wo beide deckend sind, wie weit liegen die Farben
 * Anti-Aliasing-Raender zaehlen dabei bewusst mit — deshalb sind ein paar
 * Prozent Silhouetten-Abweichung normal und kein Mangel.
 *
 * Lauf:  npx tsx scripts/test-vektor-treue.ts
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { vektorisiere } from "../components/vektor/vektorisieren";

const TREES = join(process.cwd(), "public", "curtain", "trees");
const RAUS = join(process.cwd(), ".vektor-test");
const PROBEN = ["tree-1-0.png", "tree-2-0.png", "tree-3-0.png", "tree-3-5.png"];

/** Ab hier gilt ein Pixel als deckend (gleiche Schwelle wie im Vektorisierer). */
const ALPHA_SCHWELLE = 128;
/** Farbabstand, ab dem eine Flaeche als falsch eingefaerbt gilt. */
const FARB_TOLERANZ = 30;

async function main() {
  let fehler = 0;
  console.log("Datei          Silhouette   Farbe        Urteil");
  console.log("-".repeat(62));

  for (const datei of PROBEN) {
    const pfad = join(TREES, datei);
    const orig = await sharp(pfad).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: B, height: H } = orig.info;

    const erg = vektorisiere(new Uint8ClampedArray(orig.data), B, H);
    const svgPfad = join(RAUS, datei.replace(".png", ".svg"));
    writeFileSync(svgPfad, erg.svg);

    /* SVG in exakt derselben Groesse zurueckrastern. */
    const zurueck = await sharp(Buffer.from(erg.svg))
      .resize(B, H, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const a = orig.data;
    const b = zurueck.data;
    let gesamt = 0;
    let silhouetteFalsch = 0;
    let farbeVerglichen = 0;
    let farbeFalsch = 0;

    for (let i = 0; i < B * H; i++) {
      const p = i * 4;
      const aDeckt = a[p + 3] >= ALPHA_SCHWELLE;
      const bDeckt = b[p + 3] >= ALPHA_SCHWELLE;
      gesamt++;
      if (aDeckt !== bDeckt) {
        silhouetteFalsch++;
        continue;
      }
      if (!aDeckt) continue;
      farbeVerglichen++;
      const d =
        Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
      if (d / 3 > FARB_TOLERANZ) farbeFalsch++;
    }

    const silPct = (silhouetteFalsch / gesamt) * 100;
    const farbPct = farbeVerglichen ? (farbeFalsch / farbeVerglichen) * 100 : 0;

    /* Schwellen: die Silhouette darf am AA-Rand abweichen, die Farbe nicht.
       Eine hohe Farbabweichung hiesse, Flaechen liegen falsch uebereinander. */
    const probleme: string[] = [];
    if (silPct > 3) probleme.push(`Silhouette ${silPct.toFixed(2)}% > 3%`);
    if (farbPct > 2) probleme.push(`Farbe ${farbPct.toFixed(2)}% > 2%`);

    console.log(
      `${datei.padEnd(14)} ${silPct.toFixed(2).padStart(6)}%     ${farbPct.toFixed(2).padStart(6)}%     ` +
        (probleme.length ? `PROBLEM: ${probleme.join(", ")}` : "ok"),
    );
    fehler += probleme.length;

    /* Differenzbild zum Draufschauen: rot = Silhouette weicht ab. */
    const diff = Buffer.alloc(B * H * 4);
    for (let i = 0; i < B * H; i++) {
      const p = i * 4;
      const aDeckt = a[p + 3] >= ALPHA_SCHWELLE;
      const bDeckt = b[p + 3] >= ALPHA_SCHWELLE;
      if (aDeckt !== bDeckt) {
        diff[p] = 255;
        diff[p + 3] = 255;
      } else if (aDeckt) {
        diff[p] = diff[p + 1] = diff[p + 2] = 220;
        diff[p + 3] = 255;
      }
    }
    await sharp(diff, { raw: { width: B, height: H, channels: 4 } })
      .png()
      .toFile(join(RAUS, datei.replace(".png", "-diff.png")));
  }

  console.log(`\n=== ${fehler === 0 ? "FORMTREU" : `${fehler} ABWEICHUNG(EN)`} ===`);
  console.log(`Differenzbilder (rot = Abweichung): ${RAUS}`);
  process.exit(fehler === 0 ? 0 : 1);
}

void main();
