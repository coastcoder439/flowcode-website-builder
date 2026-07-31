/*
 * build-runtime.mjs — buendelt kern/runtime.ts zu einem selbsttragenden
 * IIFE-Script: instatic-plugin/dist/fcank-runtime.js
 *
 * Muster: scripts/build-embed.mjs des Builders. Unterschiede, alle bewusst:
 *   - kein CSS-Sonderfall (der Kern importiert keine CSS-Datei),
 *   - keine React/Next-Abhaengigkeit (der Kern hat KEINE Imports ausser sich
 *     selbst — s. `bun`-freier Grep in der H3a-Beweisfuehrung),
 *   - `format: "iife"`, damit das Ergebnis auch als Instatic-Site-Script mit
 *     `format: "classic"` laeuft, nicht nur als ES-Modul.
 *
 * Zusaetzlich wird eine FERTIGE Site-Script-Datei geschrieben
 * (dist/fcank-site-script.js): Config-Literal + Bundle in EINER Datei. Instatic
 * buendelt Site-Scripts pro Seite; eine Datei statt zwei heisst ein Script-Tag
 * und eine garantierte Reihenfolge (die Config steht physisch vor dem Bundle,
 * das sie liest).
 */
import { build } from "esbuild";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const entry = path.join(pluginRoot, "kern/runtime.ts");
const distDir = path.join(pluginRoot, "dist");
const outfile = path.join(distDir, "fcank-runtime.js");
const configFile = path.join(pluginRoot, "beispiel-config.json");
const siteScriptFile = path.join(distDir, "fcank-site-script.js");

function kb(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function main() {
  mkdirSync(distDir, { recursive: true });

  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    legalComments: "none",
    logLevel: "info",
  });

  const js = result.outputFiles.find((f) => f.path.endsWith(".js"));
  if (!js) throw new Error("esbuild hat keine JS-Ausgabe erzeugt.");

  writeFileSync(outfile, js.text, "utf8");
  const roh = Buffer.byteLength(js.text, "utf8");
  console.log(`[build-runtime] dist/fcank-runtime.js: ${kb(roh)} roh, ${kb(gzipSync(js.text).length)} gzip.`);

  /* Site-Script: Config-Literal + Bundle. Die Config steht ZUERST, weil das
     Bundle sie beim Autostart von `window.FCANK_CONFIG` liest. */
  const config = JSON.parse(readFileSync(configFile, "utf8"));
  const kopf =
    `/* fcank Site-Script — erzeugt von instatic-plugin/scripts/build-runtime.mjs.\n` +
    `   Anker-Vertrag: Element mit class="fcank-<id>" wird von der Grafik mit\n` +
    `   derselben id angetrieben. Nicht von Hand bearbeiten. */\n` +
    `window.FCANK_CONFIG = ${JSON.stringify(config)};\n`;
  const siteScript = kopf + js.text;
  writeFileSync(siteScriptFile, siteScript, "utf8");
  const rohSite = Buffer.byteLength(siteScript, "utf8");
  console.log(
    `[build-runtime] dist/fcank-site-script.js: ${kb(rohSite)} roh, ${kb(gzipSync(siteScript).length)} gzip ` +
      `(Config: ${config.grafiken.length} Grafik(en), Anker: ${config.grafiken.map((g) => g.id).join(", ")}).`,
  );
}

main().catch((err) => {
  console.error("[build-runtime] Fehlgeschlagen:", err);
  process.exitCode = 1;
});
