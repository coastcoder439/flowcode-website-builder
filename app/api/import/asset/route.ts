/*
 * POST /api/import/asset — Welle 4b (Ordner-Import): grosse Bild-Assets aus
 * dem importierten Ordner nach public/import/<slug>/<name> kopieren
 * (docs/editor-vereinheitlichung.md §9/4b). Kleine Bilder (<300 KB) bettet der
 * Client als Data-URL ein; groessere landen hierueber als echte Datei, damit
 * die Seiten-JSON nicht durch Base64 aufgeblaeht wird.
 *
 * Body: { slug, name, dataUrl }
 *   slug     Ziel-Unterordner (= Seiten-Slug), reiner Dateinamen-Baustein
 *   name     Ziel-Dateiname (reiner Basisname, Bild-Endung)
 *   dataUrl  data:image|video|application/...;base64,...
 *
 * Guards wie /api/assets aktion=schreibe: Origin-Gate (CSRF), Pfad-Guards
 * (kein Ausbruch aus public/import/), Groessenlimit, Endungs-Whitelist.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AnfrageFehler, fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";

export const runtime = "nodejs";

/** Wurzel = public/import/ des Projekts. */
const IMPORT_WURZEL = resolve(process.cwd(), "public", "import");
const MAX_BODY_BYTES = 12_000_000;
const MAX_SCHREIB_BYTES = 8_000_000;
const BILD_ENDUNGEN = /\.(svg|png|apng|jpe?g|webp|gif|avif|ico)$/i;

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);

    /* slug + name reine Dateinamen-Bausteine (kein Pfad, kein "..", kein ":"). */
    const slug = saubererName(body.slug);
    const name = saubererName(body.name);
    if (!BILD_ENDUNGEN.test(name)) {
      throw new AnfrageFehler(400, "Nur Bild-Assets (svg/png/jpg/webp/gif/avif/ico)");
    }

    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!/^data:(image|video|application)\/[\w+.-]+;base64,/.test(dataUrl)) {
      throw new AnfrageFehler(400, "Ungültige Daten (data-URL erwartet)");
    }
    const daten = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    if (daten.length === 0 || daten.length > MAX_SCHREIB_BYTES) {
      throw new AnfrageFehler(400, "Datei leer oder zu groß");
    }

    const zielOrdner = join(IMPORT_WURZEL, slug);
    const ziel = join(zielOrdner, name);
    /* Guertel und Hosentraeger: nach dem Saeubern nochmal pruefen, dass Ziel
       wirklich unter public/import/ liegt. */
    if (!resolve(ziel).startsWith(resolve(IMPORT_WURZEL) + sep)) {
      throw new AnfrageFehler(400, "Pfad außerhalb des Import-Ordners");
    }

    await mkdir(zielOrdner, { recursive: true });
    await writeFile(ziel, daten);

    const rel = `import/${slug}/${name}`;
    return NextResponse.json({ slug, name, pfad: `public/${rel}`, url: `/${rel}` });
  } catch (e) {
    return fehlerAntwort(e, "import/asset");
  }
}
