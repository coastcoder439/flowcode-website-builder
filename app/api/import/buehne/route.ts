/*
 * POST /api/import/buehne — I8-FIX (Konsolen-Fehler-Reduktion):
 * meldet, OB zu einem Seiten-Slug eine lebendige Bühnen-Fassung
 * public/import/<slug>/buehne.html vorliegt — als JSON { vorhanden: boolean },
 * IMMER mit HTTP 200.
 *
 * Body: { slug }
 *
 * WARUM eigener Endpoint statt direktem GET auf die Datei: die Quellen-Weiche
 * (components/backdrop/Backdrop.tsx: BackdropPuckSeite) prüfte die Existenz
 * bisher per fetch("/import/<slug>/buehne.html"). Für native Puck-Seiten OHNE
 * Bühne (der Normalfall) liefert das ein 404 — der Browser protokolliert JEDEN
 * fehlgeschlagenen Netzwerk-Request als Konsolen-Fehler, unabhängig davon, dass
 * der Client den 404 sauber als „keine Bühne → Render-Fallback" behandelt. Diese
 * by-design-404 verletzte die Abnahme „0 Konsolen-Errors". Der Existenz-Check
 * hier ist ein reiner 200-Pfad und erzeugt keinen Fehler.
 *
 * WARUM POST (nicht GET): das Projekt baut mit output:"export"; ein GET-Handler
 * würde Next zur statischen Analyse zwingen (Fehler „dynamic force-static nötig").
 * Alle dynamischen Routen hier sind POST (vgl. puck-seite/lade, das ebenfalls
 * einen Slug LIEST) — diese Route folgt derselben Konvention.
 *
 * IMMER HTTP 200: ein ungültiger/fehlender Slug oder eine fehlende Datei ist KEIN
 * Fehler, sondern schlicht „keine Bühne" — nur so bleibt die Konsole beim
 * Normalfall sauber. Reines Lesen (Existenz), keine Zustandsänderung.
 */

import { access } from "node:fs/promises";
import { constants as FS } from "node:fs";
import { join, resolve, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { leseJsonBody, saubererName } from "@/lib/api/server-helfer";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 10_000;

/** Wurzel = public/import/ des Projekts. */
const IMPORT_WURZEL = resolve(process.cwd(), "public", "import");

export async function POST(req: NextRequest) {
  try {
    const body = await leseJsonBody(req, MAX_BODY_BYTES);
    /* saubererName wirft bei Pfad-Bestandteilen („..", "/", ":") / leer. */
    const slug = saubererName(body.slug);

    const ziel = join(IMPORT_WURZEL, slug, "buehne.html");
    /* Guertel und Hosentraeger: Ziel muss echt unter public/import/ liegen. */
    if (!resolve(ziel).startsWith(resolve(IMPORT_WURZEL) + sep)) {
      return NextResponse.json({ vorhanden: false });
    }

    await access(ziel, FS.R_OK);
    return NextResponse.json({ vorhanden: true });
  } catch {
    /* Body-/saubererName-Wurf ODER fehlende Datei → keine Bühne (kein Fehler). */
    return NextResponse.json({ vorhanden: false });
  }
}
