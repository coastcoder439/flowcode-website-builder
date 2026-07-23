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
 *
 * WELLE 5a (docs/editor-vereinheitlichung.md §10/5a): zusaetzlich zu Bildern
 * duerfen jetzt auch .css-Dateien kopiert werden (Styles einer eigenen
 * gebauten Seite uebernehmen). Die Endungs- UND die data-URL-MIME-Whitelist
 * bleiben eng: .css nur mit data:text/css, Bilder nur mit image/video/
 * application — nichts anderes wird geschrieben.
 *
 * IMPORT-ENDLEVEL Schritt V (M7, lens-import.md §3-Schritt-V): die in CSS-
 * Dateien per url() referenzierten Fonts (woff/woff2/ttf/otf/eot) und gaengigen
 * Medien (mp4/webm/ogg/mp3/wav/m4a) duerfen jetzt ebenfalls kopiert werden, damit
 * css-rewrite.ts sie rebasen kann (sonst 404). Die enge Endung↔MIME-Kopplung
 * bleibt: jede Endungs-Gruppe akzeptiert nur ihre eigene MIME-Familie.
 *
 * IMPORT-ENDLEVEL Schritt VI (M6/M3, lens-import.md §3-Schritt-VI + „Re-Import-
 * Verhalten"): neuer aktion="leeren"-Zweig. Vor einem Re-Import wird der bisherige
 * Asset-Ordner public/import/<slug>/ geleert, damit Waisen aus dem Vorlauf (Bilder/
 * CSS/Fonts, die diesmal nicht mehr referenziert werden) nicht liegen bleiben. Das
 * Leeren ist REVERSIBEL (R1, wie der Seiten-Papierkorb): der Ordner wird nicht hart
 * geloescht, sondern nach public/import/.papierkorb/<slug>-<zeitstempel>/ verschoben.
 * Fehlt der Ordner, ist das ein No-op (geleert:false). Ohne aktion (bzw.
 * aktion="schreibe") bleibt das Kopier-Verhalten unveraendert.
 */

import { writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AnfrageFehler, fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";

export const runtime = "nodejs";

/** Wurzel = public/import/ des Projekts. */
const IMPORT_WURZEL = resolve(process.cwd(), "public", "import");
/* Papierkorb der Asset-Ordner (Schritt VI): mit fuehrendem Punkt, damit ein
   geleerter Slug-Ordner reversibel bleibt und nicht als eigener Import-Slug
   erscheint. Parallel zu seiten/.papierkorb/ (lib/api/seiten-speicher.ts). */
const ASSET_PAPIERKORB = resolve(IMPORT_WURZEL, ".papierkorb");
const MAX_BODY_BYTES = 12_000_000;
const MAX_SCHREIB_BYTES = 8_000_000;
const BILD_ENDUNGEN = /\.(svg|png|apng|jpe?g|webp|gif|avif|ico)$/i;
/** Welle 5a: uebernommene Stylesheets. */
const CSS_ENDUNG = /\.css$/i;
/** Schritt V: in CSS referenzierte Fonts + gaengige Medien. */
const FONT_ENDUNGEN = /\.(woff2?|ttf|otf|eot)$/i;
const MEDIEN_ENDUNGEN = /\.(mp4|webm|ogg|ogv|mp3|wav|m4a)$/i;
const BILD_MIME = /^data:(image|video|application)\/[\w+.-]+;base64,/;
const CSS_MIME = /^data:text\/css;base64,/;
/* Fonts: font/* (woff2/woff/ttf/otf) oder application/* (eot =
   application/vnd.ms-fontobject, Legacy application/font-woff). Medien:
   video/audio/* (oder application/* fuer ogg-Container). */
const FONT_MIME = /^data:(font|application)\/[\w+.-]+;base64,/;
const MEDIEN_MIME = /^data:(video|audio|application)\/[\w+.-]+;base64,/;

/** Klassifiziert einen Ziel-Namen nach Endung und liefert die eng gekoppelte
 *  MIME-Whitelist dazu. null = Endung nicht erlaubt. CSS liegt gebuendelt unter
 *  <slug>/css/, alles andere direkt unter <slug>/. */
function klassifiziere(name: string): { art: "css" | "asset"; mime: RegExp } | null {
  if (CSS_ENDUNG.test(name)) return { art: "css", mime: CSS_MIME };
  if (BILD_ENDUNGEN.test(name)) return { art: "asset", mime: BILD_MIME };
  if (FONT_ENDUNGEN.test(name)) return { art: "asset", mime: FONT_MIME };
  if (MEDIEN_ENDUNGEN.test(name)) return { art: "asset", mime: MEDIEN_MIME };
  return null;
}

/** Filesystem-sicherer, lexikografisch=chronologisch sortierbarer Zeitstempel
 *  (kein ":"/".": Windows-tauglich) — wie papierkorbZeitstempel in
 *  lib/api/seiten-speicher.ts. */
function papierkorbZeitstempel(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * aktion="leeren" (Schritt VI): den Asset-Ordner eines Slugs REVERSIBEL leeren,
 * bevor ein Re-Import ihn neu befuellt (Waisen-Vermeidung). Verschiebt
 * public/import/<slug>/ nach public/import/.papierkorb/<slug>-<zeitstempel>/.
 * Fehlt der Ordner, ist es ein No-op. Gibt Anzahl der verschobenen Eintraege
 * (fuer den Import-Bericht) zurueck.
 */
async function leereSlugOrdner(slug: string): Promise<{ geleert: boolean; dateien: number; verschobenNach?: string }> {
  const quelle = join(IMPORT_WURZEL, slug);
  /* Guertel und Hosentraeger: Quelle muss echt unter public/import/ liegen. */
  if (!resolve(quelle).startsWith(resolve(IMPORT_WURZEL) + sep)) {
    throw new AnfrageFehler(400, "Pfad außerhalb des Import-Ordners");
  }
  let eintraege: string[];
  try {
    eintraege = await readdir(quelle);
  } catch {
    return { geleert: false, dateien: 0 }; // Ordner existiert nicht → nichts zu leeren
  }
  const zielName = `${slug}-${papierkorbZeitstempel()}`;
  const ziel = join(ASSET_PAPIERKORB, zielName);
  if (!resolve(ziel).startsWith(resolve(ASSET_PAPIERKORB) + sep)) {
    throw new AnfrageFehler(400, "Pfad außerhalb des Import-Papierkorbs");
  }
  await mkdir(ASSET_PAPIERKORB, { recursive: true });
  await rename(quelle, ziel);
  return { geleert: true, dateien: eintraege.length, verschobenNach: `public/import/.papierkorb/${zielName}` };
}

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);

    /* Schritt VI: aktion="leeren" — Asset-Ordner reversibel leeren (Re-Import). */
    if (body.aktion === "leeren") {
      const slug = saubererName(body.slug);
      const ergebnis = await leereSlugOrdner(slug);
      return NextResponse.json({ slug, aktion: "leeren", ...ergebnis });
    }

    /* Default (kein aktion / aktion="schreibe"): Asset kopieren (unveraendert). */
    /* slug + name reine Dateinamen-Bausteine (kein Pfad, kein "..", kein ":"). */
    const slug = saubererName(body.slug);
    const name = saubererName(body.name);
    const klasse = klassifiziere(name);
    if (!klasse) {
      throw new AnfrageFehler(
        400,
        "Nur Bilder (svg/png/jpg/webp/gif/avif/ico), Fonts (woff/woff2/ttf/otf/eot), Medien (mp4/webm/ogg/mp3/wav/m4a) oder .css",
      );
    }
    const istCss = klasse.art === "css";

    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    /* MIME muss zur Endung passen — .css nur mit text/css, Bilder nur mit
       image/video/application, Fonts nur mit font/application, Medien nur mit
       video/audio/application. Verhindert, dass ueber die .css-Endung beliebige
       Text-Inhalte oder ueber eine Bild-/Font-Endung fremde Inhalte reingeschmuggelt
       werden (enge Kopplung Endung↔MIME). */
    if (!klasse.mime.test(dataUrl)) {
      throw new AnfrageFehler(400, "Ungültige Daten (data-URL passt nicht zur Endung)");
    }
    const daten = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    if (daten.length === 0 || daten.length > MAX_SCHREIB_BYTES) {
      throw new AnfrageFehler(400, "Datei leer oder zu groß");
    }

    /* CSS liegt gebuendelt unter <slug>/css/ (§10/5a), Bilder direkt unter
       <slug>/. saubererName hat Slashes bereits entfernt — den Unterordner
       fuegen wir hier kontrolliert (fixer Literal) an, kein Nutzer-Pfad. */
    const relOrdner = istCss ? `import/${slug}/css` : `import/${slug}`;
    const zielOrdner = join(IMPORT_WURZEL, ...(istCss ? [slug, "css"] : [slug]));
    const ziel = join(zielOrdner, name);
    /* Guertel und Hosentraeger: nach dem Saeubern nochmal pruefen, dass Ziel
       wirklich unter public/import/ liegt. */
    if (!resolve(ziel).startsWith(resolve(IMPORT_WURZEL) + sep)) {
      throw new AnfrageFehler(400, "Pfad außerhalb des Import-Ordners");
    }

    await mkdir(zielOrdner, { recursive: true });
    await writeFile(ziel, daten);

    const rel = `${relOrdner}/${name}`;
    return NextResponse.json({ slug, name, pfad: `public/${rel}`, url: `/${rel}` });
  } catch (e) {
    return fehlerAntwort(e, "import/asset");
  }
}
