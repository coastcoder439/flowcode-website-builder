/*
 * /api/assets – der Bilderordner des PROJEKTS, serverseitig gelesen.
 *
 * Warum nicht die File System Access API (showDirectoryPicker)?
 * Die braucht bei jedem Start eine Nutzergeste plus einen ABSOLUTEN Pfad —
 * auf einem anderen Rechner liegt der woanders. Der Server dagegen loest
 * `public/` relativ zum Projekt auf: keine Klick-Erlaubnis, keine
 * Rechner-Bindung, laeuft bei jedem sofort.
 *
 * Assets kommen als URL zurueck, nicht als Data-URL: Next liefert public/
 * unter der URL-Wurzel aus, also reicht "/curtain/trees/tree-1-0.png".
 * Damit gibt es weder Base64-Aufblaehung noch ein Groessenlimit.
 *
 * NUR fuer die lokale Entwicklung gedacht (der Editor laeuft eh nur unter
 * next dev — im statischen Export gibt es keine Routen).
 */

import { readdir, writeFile, mkdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AnfrageFehler, pruefeUrsprung } from "@/lib/api/server-helfer";

/* NUR POST, kein GET — und das ist Absicht:
   Mit output:"export" verlangt Next von jeder GET-Route, dass sie statisch
   vorgerendert werden kann (sonst 500: 'force-static not configured'). Eine
   vorgerenderte Liste waere aber genau falsch — sie soll den Ordner bei
   JEDEM Aufruf frisch lesen, damit neue Dateien sofort auftauchen.
   POST umgeht das Vorrendern komplett; die Vektorisier-Route laeuft aus
   demselben Grund problemlos. Die Aktion steht deshalb im Body. */
export const runtime = "nodejs";

/** Wurzel = public/ des Projekts. process.cwd() ist bei next dev der Projektordner. */
const WURZEL = resolve(process.cwd(), "public");

/** Unterordner fuer selbst erzeugte Dateien (vektorisierte SVGs). */
const AUSGABE_ORDNER = "vektor";

const BILD_ENDUNGEN = /\.(svg|png|apng|jpe?g|webp|gif|avif|json|lottie|mp4|webm)$/i;

/** Ordner, die nie durchsucht werden — spart Zeit und haelt Muell draussen. */
const UEBERSPRINGEN = new Set([".git", "node_modules", ".next"]);

const MAX_DATEIEN = 500;
const MAX_SCHREIB_BYTES = 8_000_000;

interface AssetEintrag {
  /** Dateiname, z.B. "tree-1-0.png" */
  name: string;
  /** Pfad relativ zu public/, mit Schraegstrichen, z.B. "curtain/trees/tree-1-0.png" */
  pfad: string;
  /** Direkt verwendbare URL, z.B. "/curtain/trees/tree-1-0.png" */
  url: string;
  /** Ordner relativ zu public/, "" fuer die Wurzel — fuers Gruppieren in der UI. */
  ordner: string;
  groesse: number;
}

async function sammle(verzeichnis: string, treffer: AssetEintrag[]): Promise<void> {
  if (treffer.length >= MAX_DATEIEN) return;
  let eintraege;
  try {
    eintraege = await readdir(verzeichnis, { withFileTypes: true });
  } catch {
    return; // Ordner weg oder nicht lesbar: einfach nichts liefern.
  }
  /* Sortiert einlesen, damit die Reihenfolge auf jedem Rechner gleich ist. */
  eintraege.sort((a, b) => a.name.localeCompare(b.name));

  for (const e of eintraege) {
    if (treffer.length >= MAX_DATEIEN) return;
    if (e.name.startsWith(".") || UEBERSPRINGEN.has(e.name)) continue;
    const voll = join(verzeichnis, e.name);
    if (e.isDirectory()) {
      await sammle(voll, treffer);
      continue;
    }
    if (!BILD_ENDUNGEN.test(e.name)) continue;

    const rel = relative(WURZEL, voll).split(sep).join("/");
    const ordner = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    let groesse = 0;
    try {
      const { size } = await (await import("node:fs/promises")).stat(voll);
      groesse = size;
    } catch {
      /* Groesse ist nur Anzeige — ohne sie geht es auch. */
    }
    treffer.push({ name: e.name, pfad: rel, url: `/${rel}`, ordner, groesse });
  }
}

async function liste() {
  try {
    const treffer: AssetEintrag[] = [];
    await sammle(WURZEL, treffer);
    return NextResponse.json({
      assets: treffer,
      wurzel: "public",
      abgeschnitten: treffer.length >= MAX_DATEIEN,
    });
  } catch {
    return NextResponse.json({ fehler: "Bilderordner nicht lesbar" }, { status: 500 });
  }
}

/**
 * Body { aktion: "liste" }                      -> Bilderordner auflisten
 * Body { aktion: "schreibe", name, dataUrl }    -> Datei nach public/<AUSGABE_ORDNER>/ schreiben
 */
export async function POST(req: NextRequest) {
  try {
    /* CSRF-Gate der Agenten-Schnittstelle (lib/api/server-helfer.ts):
       fremder Browser-Origin -> 403; CLI-/Agenten-Aufrufe ohne Origin ok. */
    try {
      pruefeUrsprung(req);
    } catch (e) {
      if (e instanceof AnfrageFehler) {
        return NextResponse.json({ fehler: e.message }, { status: e.status });
      }
      throw e;
    }
    const body = (await req.json()) as {
      aktion?: unknown;
      name?: unknown;
      dataUrl?: unknown;
    };
    if (body.aktion !== "schreibe") return liste();

    const rohName = typeof body.name === "string" ? body.name : "";
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";

    /* Nur der reine Dateiname zaehlt. Alles mit Pfad-Anteil, ".." oder
       Laufwerksbuchstabe fliegt raus — sonst koennte ein Aufruf ausserhalb
       von public/ schreiben. */
    const name = rohName.replace(/^.*[\\/]/, "").trim();
    if (!name || name.length > 120 || !BILD_ENDUNGEN.test(name) || name.includes("..")) {
      return NextResponse.json({ fehler: "Ungültiger Dateiname" }, { status: 400 });
    }
    if (!/^data:(image|video|application)\/[\w+.-]+;base64,/.test(dataUrl)) {
      return NextResponse.json({ fehler: "Ungültige Daten" }, { status: 400 });
    }

    const daten = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    if (daten.length === 0 || daten.length > MAX_SCHREIB_BYTES) {
      return NextResponse.json({ fehler: "Datei leer oder zu groß" }, { status: 400 });
    }

    const zielOrdner = join(WURZEL, AUSGABE_ORDNER);
    const ziel = join(zielOrdner, name);
    /* Guertel und Hosentraeger: auch nach dem Saeubern nochmal pruefen, dass
       das Ziel wirklich unter public/ liegt. */
    if (!resolve(ziel).startsWith(resolve(WURZEL) + sep)) {
      return NextResponse.json({ fehler: "Pfad außerhalb des Bilderordners" }, { status: 400 });
    }

    await mkdir(zielOrdner, { recursive: true });
    await writeFile(ziel, daten);

    const rel = `${AUSGABE_ORDNER}/${name}`;
    return NextResponse.json({ name, pfad: rel, url: `/${rel}`, ordner: AUSGABE_ORDNER });
  } catch (e) {
    console.error("[assets] Schreiben fehlgeschlagen:", e);
    return NextResponse.json({ fehler: "Konnte nicht schreiben" }, { status: 500 });
  }
}
