/*
 * app/api/abbild/route.ts – Abbilder des Grafik-Editors: der GEBAUTE ZUSTAND
 * (welche Grafik wo mit welchen Keyframes) als Datei auf der Platte statt im
 * Browserspeicher. Der Builder legt sich über die Seite und speichert immer
 * nur ein ABBILD ihrer Grafiken — er ändert nie die Editor-Komponenten,
 * curtain.config.json o.ä. (s. Auftragsbeschreibung).
 *
 * EIGENER ORDNER "abbilder/" (nicht public/): public/ sind die BILDER der
 * Seite, ein Abbild ist der Editor-ZUSTAND (welche Grafik wo, welche
 * Keyframes) — zwei verschiedene Dinge, die sich sonst vermischen würden.
 *
 * AUSNAHME "standard": schreibt NICHT nach abbilder/, sondern nach
 * grafik.config.json im Projektwurzelverzeichnis — das ist die Datei, die
 * GrafikContext.tsx als Startzustand der ECHTEN Landing importiert
 * (import grafikConfig from "../../grafik.config.json"). Format dort bewusst
 * schlanker (kein pool/version/name), weil die Landing nur ".grafiken"
 * ausliest.
 *
 * NUR POST, kein GET (gleiches Muster wie app/api/assets/route.ts): mit
 * output:"export" verlangt Next von jeder GET-Route ein statisches
 * Vorrendern, sonst 500 ("force-static not configured"). Die Aktion steht
 * deshalb im Body.
 */

import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import type { Asset, Grafik } from "@/components/grafik/grafik-types";

export const runtime = "nodejs";

const PROJEKT_WURZEL = process.cwd();
/** Abbilder liegen NEBEN public/ und grafik.config.json, nicht darin. */
const ABBILD_ORDNER = resolve(PROJEKT_WURZEL, "abbilder");
const STANDARD_DATEI = resolve(PROJEKT_WURZEL, "grafik.config.json");

const MAX_NAME_LAENGE = 100;
/** Grenze für den gesamten Request-Body: Abbilder sind reines JSON (Bilder
 *  aus public/ stehen als URL drin, s. Auftrag) — 8 MB ist großzügig, fängt
 *  aber eine versehentlich eingebettete Base64-Datei ab, bevor sie den
 *  Dev-Server in die Knie zwingt. */
const MAX_BODY_BYTES = 8_000_000;
/** Schutz gegen einen ausufernden Ordner (Anzeige-/Lesekosten der Liste). */
const MAX_ABBILDER = 200;
const AKTUELLE_VERSION = 1;

/* --- Fehler ------------------------------------------------------------ */

/** Gezielter, dem Client zeigbarer Fehler mit HTTP-Status (Muster aus
 *  vektorisieren/route.ts). Alles andere (unerwartete Exceptions) wird als
 *  500 mit generischer Meldung beantwortet — niemals der echte Stacktrace. */
class AnfrageFehler extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/* --- Namen / Pfade ------------------------------------------------------
 * Analog zum Muster in app/api/assets/route.ts, aber ohne Dateiendung (die
 * hängt die Route selbst an) — der Client schickt nur den Setup-Namen. */

/** Säubert einen vom Client kommenden Namen zu einem reinen
 *  Dateinamen-Baustein: kein Pfadanteil, kein "..", kein Laufwerksbuchstabe/
 *  Doppelpunkt, nur unbedenkliche Zeichen. Wirft statt still zu kürzen —
 *  ein verstümmelter Name wäre für Leon verwirrender als eine Fehlermeldung. */
function saubererName(roh: unknown): string {
  if (typeof roh !== "string") throw new AnfrageFehler(400, "Name fehlt");
  const ohnePfad = roh.replace(/^.*[\\/]/, "").trim();
  if (!ohnePfad) throw new AnfrageFehler(400, "Name fehlt");
  if (ohnePfad.length > MAX_NAME_LAENGE) throw new AnfrageFehler(400, "Name zu lang");
  if (ohnePfad.includes("..") || ohnePfad.includes(":")) {
    throw new AnfrageFehler(400, "Ungültiger Name");
  }
  /* Unicode-Buchstaben zulassen (\p{L}), nicht nur a-z: Leon benennt seine
     Abbilder auf Deutsch, und "bäume-oben" ist kein Pfad-Risiko. Gefährlich
     sind Pfadtrenner, ".." und ":" — die fängt die Prüfung darüber bereits
     ab; hier bleiben zusätzlich die Windows-Sonderzeichen * ? " < > | und
     Steuerzeichen draussen. */
  if (!/^[\p{L}\p{N} _.-]+$/u.test(ohnePfad)) {
    throw new AnfrageFehler(400, "Ungültiger Name");
  }
  /* Windows verschluckt Namen, die auf Punkt oder Leerzeichen enden — das
     Ergebnis läge dann unter einem anderen Dateinamen als gemeldet. */
  if (/[. ]$/.test(ohnePfad)) throw new AnfrageFehler(400, "Name darf nicht auf . oder Leerzeichen enden");
  return ohnePfad;
}

/** Ziel-Pfad für einen Abbild-Namen, MIT Gegenprobe (Gürtel und
 *  Hosenträger wie in app/api/assets/route.ts): auch nach dem Säubern
 *  nochmal prüfen, dass das Ergebnis wirklich unter abbilder/ liegt. */
function abbildPfad(name: string): string {
  const ziel = join(ABBILD_ORDNER, `${name}.json`);
  if (!resolve(ziel).startsWith(resolve(ABBILD_ORDNER) + sep)) {
    throw new AnfrageFehler(400, "Pfad außerhalb des Abbild-Ordners");
  }
  return ziel;
}

/* --- Validierung der Abbild-Nutzlast ------------------------------------
 * Nur die Felder prüfen, die für Sicherheit/Rendering entscheidend sind
 * (id/name/src/art/breitePx/z/keyframes) — optionale Flags (modus,
 * versteckt, gesperrt, stumm) laufen unvalidiert durch: im schlimmsten Fall
 * rendert eine Grafik falsch, es entsteht kein Schaden am Server oder an
 * anderen Dateien. */

function istZahl(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const MEDIENARTEN = new Set(["bild", "lottie", "video"]);

function istKeyframe(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const k = v as Record<string, unknown>;
  return (
    istZahl(k.scrollY) &&
    istZahl(k.x) &&
    istZahl(k.y) &&
    istZahl(k.scale) &&
    istZahl(k.opacity) &&
    istZahl(k.rotation)
  );
}

function istGrafik(v: unknown): v is Grafik {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.id === "string" &&
    typeof g.name === "string" &&
    typeof g.src === "string" &&
    typeof g.art === "string" &&
    MEDIENARTEN.has(g.art) &&
    istZahl(g.breitePx) &&
    istZahl(g.z) &&
    Array.isArray(g.keyframes) &&
    g.keyframes.length > 0 &&
    g.keyframes.every(istKeyframe)
  );
}

function istAsset(v: unknown): v is Asset {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    typeof a.src === "string" &&
    typeof a.art === "string" &&
    MEDIENARTEN.has(a.art)
  );
}

interface AbbildMeta {
  viewportW: number;
  viewportH: number;
  docH: number;
}

function pruefeMeta(v: unknown): AbbildMeta {
  const m = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  return {
    viewportW: istZahl(m.viewportW) ? m.viewportW : 0,
    viewportH: istZahl(m.viewportH) ? m.viewportH : 0,
    docH: istZahl(m.docH) ? m.docH : 0,
  };
}

interface AbbildEingabe {
  meta: AbbildMeta;
  grafiken: Grafik[];
  pool: Asset[];
  uebernommen: string[];
}

/** Prüft die vom Client gesendete "abbild"-Nutzlast. Wirft bei Formfehlern
 *  statt still etwas Falsches auf die Platte zu schreiben (fail fast). */
function pruefeAbbild(v: unknown): AbbildEingabe {
  if (typeof v !== "object" || v === null) throw new AnfrageFehler(400, "Abbild fehlt");
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.grafiken) || !o.grafiken.every(istGrafik)) {
    throw new AnfrageFehler(400, "abbild.grafiken ungültig");
  }
  if (o.pool !== undefined && (!Array.isArray(o.pool) || !o.pool.every(istAsset))) {
    throw new AnfrageFehler(400, "abbild.pool ungültig");
  }
  /* uebernommen ist reine Anzeige-/Filterlogik (welche Vorhang-Plaetze der
     Client ueberspringt) — wie modus/versteckt/gesperrt bei Grafik nur auf
     die FORM geprueft (Array aus Strings), nicht auf Inhalt: eine falsche ID
     matcht im schlimmsten Fall einfach keinen Platz, kein Schaden moeglich. */
  if (
    o.uebernommen !== undefined &&
    (!Array.isArray(o.uebernommen) || !o.uebernommen.every((x) => typeof x === "string"))
  ) {
    throw new AnfrageFehler(400, "abbild.uebernommen ungültig");
  }
  return {
    meta: pruefeMeta(o.meta),
    grafiken: o.grafiken as Grafik[],
    pool: (o.pool as Asset[] | undefined) ?? [],
    uebernommen: (o.uebernommen as string[] | undefined) ?? [],
  };
}

/* --- Aktionen ------------------------------------------------------------ */

interface AbbildDateiForm {
  $doc: string;
  $koordinaten: string;
  version: number;
  name: string;
  gespeichert: string;
  meta: AbbildMeta;
  grafiken: Grafik[];
  pool: Asset[];
  uebernommen: string[];
}

/* Als Vorlagen-Literale (Backticks) statt "..." geschrieben: der Text
   enthält selbst ASCII-Anführungszeichen (Knopf-/Aktionsnamen in „…") — in
   einem "..."-String würde das erste " davon den String vorzeitig beenden. */
const ABBILD_DOC =
  `Vom Grafik-Editor-Builder erzeugtes Abbild (app/api/abbild/route.ts, Aktion ` +
  `„speichere"). EIN Schnappschuss von Position/Größe/Keyframes ALLER platzierten ` +
  `Grafiken samt Bibliothek UND den vom Vorhang uebernommenen Plaetzen ` +
  `(uebernommen, s. components/grafik/GrafikSeiteTab.tsx) — exakt so ` +
  `wiederherstellbar. Ändert NIE die Editor-Komponenten oder ` +
  `curtain.config.json, nur dieses Abbild. Format = Grafik[]/Asset[] aus ` +
  `components/grafik/grafik-types.ts.`;
const ABBILD_KOORDINATEN =
  `keyframes[].x/y sind DOKUMENT-Koordinaten des Grafik-MITTELPUNKTS, ` +
  `keyframes[].scrollY ist die Scrollposition, bei der dieser Zustand gilt. ` +
  `Zwischen zwei Keyframes wird linear interpoliert, davor/danach geklemmt.`;
const STANDARD_DOC =
  `Fest hinterlegte Scroll-Grafiken der Landing (GrafikLayer in app/page.tsx). ` +
  `ÜBERGABE-WEG: im Grafik-Editor (/grafik-editor), Reiter „Setups", auf „Als ` +
  `Standard setzen" klicken — der Builder (app/api/abbild/route.ts, Aktion ` +
  `„standard") schreibt den aktuellen Editor-Zustand direkt hierher. Format = ` +
  `exakt Grafik[] aus components/grafik/grafik-types.ts. Leer = die Landing ` +
  `zeigt keine Grafiken (Ausgangszustand). Der Editor lädt diese Liste ` +
  `weiterhin als Startpunkt, damit man den LIVE-Stand weiterbearbeitet statt ` +
  `bei Null anzufangen. uebernommen listet zusaetzlich die vom Vorhang in ` +
  `die Grafiken uebernommenen Plaetze (s. GrafikSeiteTab.tsx) — TitleCurtain ` +
  `ueberspringt genau diese beim Rendern.`;
const STANDARD_META_DOC =
  `viewport, unter dem das Setup gebaut wurde (nur zur Nachvollziehbarkeit, ` +
  `wird nicht ausgewertet).`;

async function aktionListe() {
  let dateien: string[];
  try {
    dateien = (await readdir(ABBILD_ORDNER))
      .filter((n) => n.endsWith(".json"))
      .sort()
      .slice(0, MAX_ABBILDER);
  } catch {
    return NextResponse.json({ abbilder: [] }); // Ordner existiert noch nicht.
  }
  const abbilder = await Promise.all(
    dateien.map(async (dateiname) => {
      const name = dateiname.slice(0, -".json".length);
      try {
        const roh = await readFile(join(ABBILD_ORDNER, dateiname), "utf-8");
        const inhalt = JSON.parse(roh) as Partial<AbbildDateiForm>;
        return {
          name,
          gespeichert: typeof inhalt.gespeichert === "string" ? inhalt.gespeichert : "",
          grafikenAnzahl: Array.isArray(inhalt.grafiken) ? inhalt.grafiken.length : 0,
          poolAnzahl: Array.isArray(inhalt.pool) ? inhalt.pool.length : 0,
        };
      } catch {
        /* Datei kaputt/unlesbar: trotzdem auflisten, nur ohne Zahlen — eine
           einzelne kaputte Datei soll nicht die ganze Liste verschlucken. */
        return { name, gespeichert: "", grafikenAnzahl: 0, poolAnzahl: 0 };
      }
    }),
  );
  abbilder.sort((a, b) => (a.gespeichert < b.gespeichert ? 1 : -1));
  return NextResponse.json({ abbilder });
}

async function aktionLade(name: string) {
  const pfad = abbildPfad(name);
  let roh: string;
  try {
    roh = await readFile(pfad, "utf-8");
  } catch {
    throw new AnfrageFehler(404, `„${name}" nicht gefunden`);
  }
  let abbild: unknown;
  try {
    abbild = JSON.parse(roh);
  } catch {
    throw new AnfrageFehler(500, "Abbild-Datei ist kein gültiges JSON");
  }
  return NextResponse.json({ name, abbild });
}

async function aktionSpeichere(name: string, roheNutzlast: unknown) {
  const eingabe = pruefeAbbild(roheNutzlast);
  const pfad = abbildPfad(name);
  const datei: AbbildDateiForm = {
    $doc: ABBILD_DOC,
    $koordinaten: ABBILD_KOORDINATEN,
    version: AKTUELLE_VERSION,
    name,
    gespeichert: new Date().toISOString(),
    meta: eingabe.meta,
    grafiken: eingabe.grafiken,
    pool: eingabe.pool,
    uebernommen: eingabe.uebernommen,
  };
  await mkdir(ABBILD_ORDNER, { recursive: true });
  await writeFile(pfad, JSON.stringify(datei, null, 2), "utf-8");
  return NextResponse.json({ name, pfad: `abbilder/${name}.json`, gespeichert: datei.gespeichert });
}

async function aktionLoesche(name: string) {
  const pfad = abbildPfad(name);
  try {
    await unlink(pfad);
  } catch {
    throw new AnfrageFehler(404, `„${name}" nicht gefunden`);
  }
  return NextResponse.json({ name, geloescht: true });
}

/** "Als Standard setzen": schreibt NACH grafik.config.json (Projektwurzel),
 *  nicht nach abbilder/ — s. Datei-Kopfkommentar. */
async function aktionStandard(roheNutzlast: unknown) {
  const eingabe = pruefeAbbild(roheNutzlast);
  const datei = {
    $doc: STANDARD_DOC,
    $koordinaten: ABBILD_KOORDINATEN,
    $meta: STANDARD_META_DOC,
    meta: eingabe.meta,
    grafiken: eingabe.grafiken,
    uebernommen: eingabe.uebernommen,
  };
  await writeFile(STANDARD_DATEI, JSON.stringify(datei, null, 2), "utf-8");
  return NextResponse.json({ pfad: "grafik.config.json", grafikenAnzahl: eingabe.grafiken.length });
}

/* --- Route --------------------------------------------------------------- */

/**
 * Body { aktion: "liste" }                              -> Namen aller Abbilder (abbilder/)
 * Body { aktion: "lade", name }                         -> ein Abbild laden
 * Body { aktion: "speichere", name, abbild }            -> Abbild nach abbilder/<name>.json schreiben
 * Body { aktion: "loesche", name }                      -> abbilder/<name>.json löschen
 * Body { aktion: "standard", abbild }                   -> nach grafik.config.json schreiben
 */
export async function POST(req: NextRequest) {
  try {
    const roh = await req.text();
    if (Buffer.byteLength(roh, "utf-8") > MAX_BODY_BYTES) {
      return NextResponse.json({ fehler: "Anfrage zu groß" }, { status: 400 });
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(roh) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ fehler: "Ungültiges JSON" }, { status: 400 });
    }
    const aktion = typeof body.aktion === "string" ? body.aktion : "";

    switch (aktion) {
      case "liste":
        return await aktionListe();
      case "lade":
        return await aktionLade(saubererName(body.name));
      case "speichere":
        return await aktionSpeichere(saubererName(body.name), body.abbild);
      case "loesche":
        return await aktionLoesche(saubererName(body.name));
      case "standard":
        return await aktionStandard(body.abbild);
      default:
        return NextResponse.json({ fehler: "Unbekannte Aktion" }, { status: 400 });
    }
  } catch (e) {
    if (e instanceof AnfrageFehler) {
      return NextResponse.json({ fehler: e.message }, { status: e.status });
    }
    console.error("[abbild] Fehlgeschlagen:", e);
    return NextResponse.json({ fehler: "Interner Fehler" }, { status: 500 });
  }
}
