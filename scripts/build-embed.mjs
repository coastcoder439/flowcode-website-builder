// build-embed.mjs – baut den standalone Embed-Bundle (Phase 2):
// components/embed/embed-entry.tsx -> public/wee-embed.js. EIN IIFE-Script,
// das React/react-dom/motion/lottie-web (dynamisch importiert von
// GrafikMedium.tsx) mit einbuendelt (keine externals) und auf JEDER Seite
// per <script src> laeuft – ohne Next und ohne dass die Host-Seite selbst
// React nutzt.
//
// CSS-Sonderfall: esbuild kann CSS, das aus einem JS/TS-Einstiegspunkt
// importiert wird (river.css/grafik-layer.css, beide bereits von
// RiverFromSnapshot.tsx/GrafikLayer.tsx importiert – hier nicht angefasst),
// nur als EIGENE .css-Ausgabedatei buendeln, nicht direkt in die IIFE. Fuer
// ein wirklich SELBSTTRAGENDES Ein-Datei-Artefakt bauen wir daher zweistufig:
// esbuild in den Speicher (write:false), dann den CSS-Text von Hand als
// <style>-Injektion vor den JS-Text setzen und ALS EINE Datei schreiben.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const entry = path.join(projectRoot, "components/embed/embed-entry.tsx");
const outfile = path.join(projectRoot, "public/wee-embed.js");

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

async function main() {
  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    minify: true,
    legalComments: "none",
    loader: { ".css": "css" },
    // Ohne diesen Define baut react-dom seinen DEVELOPMENT-Zweig mit ein
    // (Warnungen/Checks, um Groessenordnungen groesser) – esbuild kann den
    // toten Zweig nur wegfalten, wenn process.env.NODE_ENV als Konstante
    // sichtbar ist.
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "info",
  });

  const jsFile = result.outputFiles.find((f) => f.path.endsWith(".js"));
  const cssFile = result.outputFiles.find((f) => f.path.endsWith(".css"));
  if (!jsFile) {
    throw new Error("esbuild hat keine JS-Ausgabe erzeugt.");
  }

  const cssText = cssFile ? cssFile.text : "";
  const cssInject = cssText
    ? `(function(){var s=document.createElement("style");s.textContent=${JSON.stringify(cssText)};document.head.appendChild(s);})();\n`
    : "";
  const finalSource = cssInject + jsFile.text;

  writeFileSync(outfile, finalSource, "utf8");

  const rawBytes = Buffer.byteLength(finalSource, "utf8");
  const gzipBytes = gzipSync(finalSource).length;
  console.log(
    `[build-embed] public/wee-embed.js geschrieben: ${formatKb(rawBytes)} roh, ${formatKb(gzipBytes)} gzip.`,
  );
  if (cssFile) {
    console.log(
      `[build-embed] CSS eingebettet (${formatKb(Buffer.byteLength(cssText, "utf8"))}) statt separater .css-Datei.`,
    );
  } else {
    console.log("[build-embed] Kein CSS-Anteil gefunden (unerwartet – river.css/grafik-layer.css pruefen).");
  }
}

main().catch((err) => {
  console.error("[build-embed] Fehlgeschlagen:", err);
  process.exitCode = 1;
});
