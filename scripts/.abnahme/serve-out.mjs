/* Abnahme-Hilfe (I9): serviert test-sites/wee-website-v3/out/ als echte http-
 * Origin (Next-Export-Logik: Ordner → index.html), damit Chrome die ORIGINAL-
 * Seite als Vergleich zur Puck-Vorschau/Bühne rendern kann. Zufalls-Port →
 * URL-Zeile nach stdout; Prozess bleibt offen bis Kill. Nur Prüf-/Protokollarbeit,
 * kein Produktkern. */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { starteStaticServer } from "../lib/static-server.mjs";

const hier = dirname(fileURLToPath(import.meta.url));
const out = resolve(hier, "..", "..", "test-sites", "wee-website-v3", "out");
const srv = await starteStaticServer(out);
console.log(`ORIGINAL_URL=${srv.url}`);
process.on("SIGTERM", () => srv.schliessen());
setInterval(() => {}, 1 << 30); // offen halten
