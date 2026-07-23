/*
 * POST /api/import/freeze — Import-Endlevel E4 (dev-only, docs/plan-webbuilder-
 * umbau-gesamt.md Entscheidung E4; lens-import.md §3-Schritt-VI + §6-Frage-1).
 *
 * ZWECK: Der UI-Ordner-Import (File System Access im Browser) kann kein
 * Playwright fahren — das braucht der Freeze (I1, M4: gerenderten End-DOM
 * abgreifen, damit `opacity:0`-Entrance-Animationen nicht als unsichtbarer
 * Zustand eingefroren werden). Diese Route fuehrt die I1-Freeze-KERNLOGIK
 * SERVERSEITIG aus, damit der UI-Import dieselbe Freeze-Qualitaet wie das
 * Skript (scripts/import-fein.mjs) bekommt. Der Browser reicht die Ordner-
 * Inhalte hoch (File System Access bleibt der Zugriffsweg); die Route
 * materialisiert sie in einen Temp-Ordner und rendert daraus.
 *
 * EINGABE (eines von beiden):
 *   { ordnerPfad, seiten? }   Direktpfad zu einem out/-Ordner auf DIESER Maschine
 *                             (Agent/CLI-Weg — kein Upload noetig).
 *   { dateien, seiten? }      Hochgereichte Ordner-Inhalte [{ pfad, dataUrl|text }]
 *                             (UI-Weg — werden in einen Temp-Ordner materialisiert).
 *   seiten: string[]          Seiten-Pfade (".", "bildung", "bildung/aquaponik");
 *                             Default ["."] (nur Startseite).
 *
 * AUSGABE: { modus, seiten: [{ seite, slug, ok, html?, protokoll?, fehler? }] }
 *   html = self-contained gefrorene End-HTML (0× opacity:0 an Texttraegern).
 *   Der Client zerlegt sie danach wie gewohnt (lib/import/html-zu-puck) — jetzt
 *   aber auf dem SICHTBAREN Endzustand statt dem rohen opacity:0-Markup.
 *
 * WARUM KINDPROZESS statt Import: freeze-seite.mjs importiert `playwright-core`.
 * Als Kindprozess (wie scripts/import-fein.mjs es faehrt) bleibt Playwright aus
 * dem Next-Bundle heraus (AGPL-/Grossbinary-Disziplin: nie in den Produktkern
 * linken — hier reicht ein externer Node-Prozess, der ohnehin nur unter
 * `next dev` existiert).
 *
 * SICHERHEIT: Origin-Gate wie die Geschwister-Routen (lib/api/server-helfer.ts).
 * Diese Route existiert NUR unter `next dev` (output:"export" hat keine Routen)
 * und ist bewusst dev-/autoren-seitig. Pfad-Guards halten die Materialisierung
 * im Temp-Ordner; `seiten`-Eintraege duerfen nicht aus dem Ordner ausbrechen.
 */

import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, rm, access } from "node:fs/promises";
import { join, resolve, dirname, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AnfrageFehler, fehlerAntwort, leseJsonBody, pruefeUrsprung } from "@/lib/api/server-helfer";

export const runtime = "nodejs";

/* Dev-only, Loopback: der Upload eines ganzen out/-Ordners (Bilder/Videos/CSS/JS)
   ist gross — 200 MB Kappe faengt Missbrauch ab, laesst reale Sites aber durch. */
const MAX_BODY_BYTES = 200_000_000;
const SKRIPTE = resolve(process.cwd(), "scripts");
const FREEZE_OUT = join(SKRIPTE, ".freeze-out");
const FREEZE_TMP = join(SKRIPTE, ".freeze-tmp");
const MAX_DATEIEN = 5000;

/** ".", "" → "index"; "bildung/aquaponik" → "bildung-aquaponik" (identisch zu
 *  scripts/freeze-seite.mjs — bestimmt den .freeze-out/<slug>.html-Namen). */
function seiteZuSlug(seite: string): string {
  const s = seite.replace(/^\.?\/?/, "").replace(/\/+$/, "");
  return s === "" ? "index" : s.replace(/\//g, "-");
}

/** Validiert einen Seiten-Pfad: relativ, kein Ausbruch, keine Windows-/
 *  Sonderzeichen. "." (Startseite) ist erlaubt. */
function pruefeSeite(roh: unknown): string {
  if (typeof roh !== "string") throw new AnfrageFehler(400, "seiten[] muss Strings sein");
  const s = roh.trim();
  if (s === "." || s === "") return ".";
  if (s.startsWith("/") || s.includes("..") || s.includes("\\") || /[:*?"<>|]/.test(s)) {
    throw new AnfrageFehler(400, `Ungültiger Seiten-Pfad: ${roh}`);
  }
  return s.replace(/\/+$/, "");
}

/** Schreibt eine hochgereichte Datei sicher unter die Temp-Wurzel (Pfad-Guard
 *  gegen Ausbruch via "../"). Inhalt kommt als data-URL (base64) oder als text. */
async function materialisiereDatei(
  tmpWurzel: string,
  eintrag: { pfad?: unknown; dataUrl?: unknown; text?: unknown },
): Promise<void> {
  if (typeof eintrag.pfad !== "string" || !eintrag.pfad) {
    throw new AnfrageFehler(400, "dateien[].pfad fehlt");
  }
  /* Pfad normalisieren (Backslash → Slash, fuehrende Slashes weg). */
  const rel = eintrag.pfad.replace(/\\/g, "/").replace(/^\/+/, "");
  const ziel = join(tmpWurzel, rel);
  if (!resolve(ziel).startsWith(resolve(tmpWurzel) + sep)) {
    throw new AnfrageFehler(400, `Pfad außerhalb des Import-Ordners: ${eintrag.pfad}`);
  }
  let daten: Buffer;
  if (typeof eintrag.dataUrl === "string" && eintrag.dataUrl.includes(",")) {
    daten = Buffer.from(eintrag.dataUrl.slice(eintrag.dataUrl.indexOf(",") + 1), "base64");
  } else if (typeof eintrag.text === "string") {
    daten = Buffer.from(eintrag.text, "utf-8");
  } else {
    throw new AnfrageFehler(400, `dateien[] „${rel}": dataUrl oder text fehlt`);
  }
  await mkdir(dirname(ziel), { recursive: true });
  await writeFile(ziel, daten);
}

/** Friert EINE Seite ueber den bestehenden CLI-Kindprozess ein und liest das
 *  Ergebnis aus .freeze-out/<slug>.{html,json}. */
function friereEine(ordner: string, seite: string): { ok: boolean; code: number | null } {
  const r = spawnSync(
    process.execPath,
    [join(SKRIPTE, "freeze-seite.mjs"), "--ordner", ordner, "--seite", seite],
    { stdio: ["ignore", "inherit", "inherit"], timeout: 180_000 },
  );
  return { ok: r.status === 0, code: r.status };
}

export async function POST(req: NextRequest) {
  let tmpWurzel: string | null = null;
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);

    /* Seiten bestimmen (Default: nur Startseite). */
    const seitenRoh = Array.isArray(body.seiten) && body.seiten.length > 0 ? body.seiten : ["."];
    const seiten = seitenRoh.map(pruefeSeite);

    /* Ordner bestimmen: Direktpfad (Agent/CLI) ODER Materialisierung (UI-Upload). */
    let ordner: string;
    let modus: "ordnerPfad" | "dateien";
    if (typeof body.ordnerPfad === "string" && body.ordnerPfad.trim()) {
      modus = "ordnerPfad";
      ordner = resolve(body.ordnerPfad.trim());
      try {
        await access(join(ordner, "index.html"));
      } catch {
        /* Startseite kann auch als <seite>/index.html liegen — nur pruefen, dass
           der Ordner ueberhaupt existiert. */
        try {
          await access(ordner);
        } catch {
          throw new AnfrageFehler(400, `ordnerPfad nicht lesbar: ${ordner}`);
        }
      }
    } else if (Array.isArray(body.dateien)) {
      if (body.dateien.length === 0) throw new AnfrageFehler(400, "dateien ist leer");
      if (body.dateien.length > MAX_DATEIEN) throw new AnfrageFehler(400, "Zu viele Dateien");
      modus = "dateien";
      tmpWurzel = join(FREEZE_TMP, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      await mkdir(tmpWurzel, { recursive: true });
      for (const eintrag of body.dateien) {
        await materialisiereDatei(tmpWurzel, eintrag as Record<string, unknown>);
      }
      ordner = tmpWurzel;
    } else {
      throw new AnfrageFehler(400, "Entweder ordnerPfad oder dateien angeben");
    }

    /* Jede Seite einfrieren + Ergebnis aus .freeze-out/ lesen. */
    const ergebnisse = [];
    for (const seite of seiten) {
      const slug = seiteZuSlug(seite);
      const { ok, code } = friereEine(ordner, seite);
      if (!ok) {
        ergebnisse.push({ seite, slug, ok: false, fehler: `Freeze-Prozess Exit ${code}` });
        continue;
      }
      try {
        const html = await readFile(join(FREEZE_OUT, `${slug}.html`), "utf-8");
        let protokoll: unknown = null;
        try {
          protokoll = JSON.parse(await readFile(join(FREEZE_OUT, `${slug}.json`), "utf-8"));
        } catch {
          /* Protokoll ist optional — HTML zaehlt. */
        }
        ergebnisse.push({ seite, slug, ok: true, html, protokoll });
      } catch {
        ergebnisse.push({ seite, slug, ok: false, fehler: "Freeze-Ausgabe nicht lesbar" });
      }
    }

    return NextResponse.json({ modus, seiten: ergebnisse });
  } catch (e) {
    return fehlerAntwort(e, "import/freeze");
  } finally {
    /* Materialisierten Temp-Ordner wieder aufraeumen (best effort). */
    if (tmpWurzel) {
      await rm(tmpWurzel, { recursive: true, force: true }).catch(() => {});
    }
  }
}
