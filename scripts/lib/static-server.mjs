/*
 * scripts/lib/static-server.mjs — Mini-Static-Server ueber einen out/-Ordner.
 *
 * Zweck (Import-Endlevel Schritt I1, lens-import.md §3-Schritt-I): der Freeze-Pass
 * braucht die gebaute Next-Export-Seite unter einer echten http-Origin, damit
 * Playwright sie wie im Betrieb rendert (absolute Asset-Pfade `/_next/static/…`
 * loesen nur gegen einen Web-Root auf, nicht gegen file://).
 *
 * Bewusst winzig und abhaengigkeitsfrei (node:http/node:fs): kein Framework, kein
 * Verzeichnis-Listing, nur „Datei ausliefern bzw. index.html je Ordner". Freier
 * Port via listen(0) → keine Kollision mit dem Dev-Server (:3113) oder Ollama.
 *
 * Verwendung:
 *   const srv = await starteStaticServer("test-sites/wee-website-v3/out");
 *   // srv.url == "http://127.0.0.1:<freierPort>"
 *   await srv.schliessen();
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, resolve, extname, sep } from "node:path";

/* Endung → Content-Type. Deckt HTML, die Next-Chunks und alle Asset-/Font-Typen
   ab, die in Bens Export vorkommen. Unbekanntes faellt auf octet-stream. */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

function mimeFuer(pfad) {
  return MIME[extname(pfad).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Loest einen URL-Pfad auf eine Datei im Wurzel-Ordner auf.
 * Next-Export-Logik: Ordner bzw. endungsloser Pfad → dessen index.html.
 * Gibt null zurueck, wenn nichts Passendes existiert (→ 404).
 * Schuetzt gegen Pfad-Ausbruch (normalize + Praefix-Pruefung).
 */
async function findeDatei(root, urlPfad) {
  let rel = decodeURIComponent(urlPfad.split("?")[0].split("#")[0]);
  if (rel === "" || rel === "/") rel = "/index.html";
  const abs0 = normalize(join(root, rel));
  /* Traversal-Schutz: aufgeloester Pfad muss der Wurzel-Ordner selbst oder ein
     echtes Kind davon sein (kein „../"-Ausbruch). */
  if (abs0 !== root && !abs0.startsWith(root + sep)) return null;
  let abs = abs0;

  const st = await stat(abs).catch(() => null);
  if (st && st.isDirectory()) {
    abs = join(abs, "index.html");
  } else if (!st && !extname(abs)) {
    /* endungsloser Pfad (z. B. /bildung) → /bildung/index.html */
    abs = join(abs, "index.html");
  }
  const st2 = await stat(abs).catch(() => null);
  if (!st2 || !st2.isFile()) return null;
  return abs;
}

/**
 * Startet den Static-Server auf einem freien Port (nur 127.0.0.1).
 * @param {string} wurzel - Pfad zum out/-Ordner.
 * @returns {Promise<{ url: string, port: number, schliessen: () => Promise<void> }>}
 */
export async function starteStaticServer(wurzel) {
  const root = resolve(wurzel);

  const server = createServer(async (req, res) => {
    try {
      const abs = await findeDatei(root, req.url ?? "/");
      if (!abs) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("nicht gefunden");
        return;
      }
      const daten = await readFile(abs);
      res.writeHead(200, { "Content-Type": mimeFuer(abs), "Cache-Control": "no-store" });
      res.end(daten);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("serverfehler");
    }
  });

  await new Promise((aufloesen, ablehnen) => {
    server.once("error", ablehnen);
    server.listen(0, "127.0.0.1", aufloesen);
  });

  const adresse = server.address();
  const port = typeof adresse === "object" && adresse ? adresse.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    schliessen() {
      return new Promise((r) => server.close(() => r()));
    },
  };
}
