/*
 * app/api/vektorisieren/route.ts – Server-Route für den Raster→SVG-Vektorisierer.
 *
 * WICHTIG (Architektur-Konflikt, nicht Teil dieser Aufgabe): next.config.mjs
 * setzt `output: "export"` (reiner Static Export, keine Server-Laufzeit).
 * Next.js unterstützt POST-Route-Handler im Static Export NICHT (dort ist nur
 * rein statisches GET erlaubt) – ein `next build` bricht ab, sobald diese
 * Datei existiert. Unter `next dev` (so wird der Editor laut README genutzt,
 * Port 3113) läuft die Route normal, weil der Dev-Server immer den vollen
 * Node-Server fährt, unabhängig von `output`. Diese Route ist ohnehin nur für
 * das lokale Editor-Werkzeug gedacht, nicht für die öffentliche Seite.
 *
 * WARUM NODEJS-RUNTIME: sharp nutzt native Bindings (libvips) – im
 * Edge-Runtime nicht verfügbar.
 */

import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { vektorisiere, type VektorErgebnis, type VektorOptionen } from "@/components/vektor/vektorisieren";

export const runtime = "nodejs";

/* --- Schutzgrenzen -------------------------------------------------------
 * Das ist ein offener Endpunkt im Dev-Tool (kein Login, kein Rate-Limit) –
 * die Grenzen verhindern, dass ein riesiger/kaputter Request den Dev-Server
 * in die Knie zwingt. */

/** Rohe Anfrage (JSON mit Base64-Data-URL). Base64 blaeht ~33% auf, das
 *  deckt also grob Bilder bis ~9 MB Originalgroesse ab. */
const MAX_BODY_BYTES = 12 * 1024 * 1024;
/** Darueber wird abgelehnt statt verkleinert – schuetzt vor absichtlich
 *  riesigen Eingaben (Speicher/CPU beim Rohpixel-Dekodieren: 4000×4000 RGBA
 *  sind schon 64 MB Rohdaten). */
const MAX_KANTE_HART = 4000;
/** Darueber (aber unter der harten Grenze) wird vor der Vektorisierung
 *  skaliert – Canva-Baumgrafiken brauchen fuer Farbflaechen keine
 *  bildschirmfuellende Aufloesung, und die Laufzeit haengt stark an der
 *  Pixelzahl. */
const MAX_KANTE_ARBEIT = 1600;

const DATA_URL_MUSTER = /^data:image\/[a-zA-Z0-9.+-]+;base64,([a-zA-Z0-9+/=]+)$/;

/** Zusatzfeld gegenueber VektorErgebnis (das Kern-Interface bleibt fest,
 *  s. components/vektor/vektorisieren.ts und wird hier NICHT veraendert) –
 *  informiert den Editor, falls das Bild vor der Vektorisierung verkleinert
 *  wurde. Bewusst NICHT exportiert: der Editor (Client-Komponente) dupliziert
 *  diese Form lokal, statt ein Server-only-Modul (sharp!) in seinen
 *  Import-Graphen zu ziehen. */
interface VektorisierenAntwort extends VektorErgebnis {
  herunterskaliert?: { vonBreite: number; vonHoehe: number };
}

/** Gezielter, dem Client zeigbarer Fehler mit HTTP-Status. Alles andere
 *  (unerwartete Exceptions aus sharp/vektorisiere) wird als 500 mit
 *  generischer Meldung beantwortet – niemals der echte Fehlertext/Stack. */
class AnfrageFehler extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Liest den Body gestreamt und bricht ab, sobald `max` Bytes ueberschritten
 *  sind. Prueft zusaetzlich Content-Length vorab (schneller Ausstieg ohne
 *  jedes Chunk zu lesen) – die Stream-Zaehlung bleibt aber die eigentliche
 *  Grenze, falls der Header fehlt oder falsch ist (chunked transfer). */
async function leseBegrenzt(request: NextRequest, max: number): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > max) {
    throw new AnfrageFehler(413, `Anfrage zu groß (max ${Math.round(max / 1024 / 1024)} MB)`);
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const stuecke: Buffer[] = [];
  let gesamt = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    gesamt += value.byteLength;
    if (gesamt > max) {
      await reader.cancel().catch(() => {});
      throw new AnfrageFehler(413, `Anfrage zu groß (max ${Math.round(max / 1024 / 1024)} MB)`);
    }
    stuecke.push(Buffer.from(value));
  }
  return Buffer.concat(stuecke).toString("utf8");
}

/** Zahl aus unbekanntem JSON-Wert lesen, auf [min, max] klemmen statt sie roh
 *  durchzureichen – unkontrollierte Werte (negativ, NaN, riesig) koennten die
 *  Kern-Funktion crashen lassen oder zu absurden Laufzeiten fuehren.
 *  `undefined` bei fehlendem/ungueltigem Wert: die Kern-Funktion nutzt dann
 *  ihren eigenen Default (alle VektorOptionen-Felder sind optional). */
function zahlOptional(wert: unknown, min: number, max: number): number | undefined {
  if (typeof wert !== "number" || !Number.isFinite(wert)) return undefined;
  return Math.min(max, Math.max(min, wert));
}

function leseOptionen(wert: unknown): VektorOptionen | undefined {
  if (typeof wert !== "object" || wert === null) return undefined;
  const o = wert as Record<string, unknown>;
  return {
    maxFarben: zahlOptional(o.maxFarben, 2, 16),
    minFlaechePx: zahlOptional(o.minFlaechePx, 1, 4000),
    glaettung: zahlOptional(o.glaettung, 0, 1),
    alphaSchwelle: zahlOptional(o.alphaSchwelle, 0, 255),
  };
}

/** Body-Text parsen + Grundform pruefen (unknown → validierte Anfrage). */
function parseAnfrage(text: string): { dataUrl: string; optionen?: VektorOptionen } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AnfrageFehler(400, "Ungültiges JSON");
  }
  if (typeof json !== "object" || json === null) {
    throw new AnfrageFehler(400, "Ungültiger Anfrage-Body");
  }
  const koerper = json as Record<string, unknown>;
  if (typeof koerper.dataUrl !== "string" || !DATA_URL_MUSTER.test(koerper.dataUrl)) {
    throw new AnfrageFehler(400, `„dataUrl" muss eine image/*-Data-URL (base64) sein`);
  }
  return { dataUrl: koerper.dataUrl, optionen: leseOptionen(koerper.optionen) };
}

/** Rohe RGBA-Pixel aus der Data-URL laden – inkl. Groessen-Schutzgrenzen und
 *  optionalem Downscale vor dem eigentlichen Dekodieren. */
async function ladeRaster(dataUrl: string): Promise<{
  rgba: Uint8ClampedArray;
  breite: number;
  hoehe: number;
  herunterskaliert?: { vonBreite: number; vonHoehe: number };
}> {
  const treffer = DATA_URL_MUSTER.exec(dataUrl);
  /* parseAnfrage hat das Muster schon geprueft – treffer ist hier nie null,
     der Guard bleibt als Typ-Absicherung stehen. */
  if (!treffer) throw new AnfrageFehler(400, "Ungültige Bilddaten");
  const bild = Buffer.from(treffer[1], "base64");

  let meta;
  try {
    meta = await sharp(bild, { limitInputPixels: MAX_KANTE_HART * MAX_KANTE_HART }).metadata();
  } catch {
    throw new AnfrageFehler(
      400,
      "Bild konnte nicht gelesen werden (beschädigt oder nicht unterstütztes Format)",
    );
  }
  const breiteRoh = meta.width;
  const hoeheRoh = meta.height;
  if (!breiteRoh || !hoeheRoh) {
    throw new AnfrageFehler(400, "Bildabmessungen konnten nicht gelesen werden");
  }
  if (breiteRoh > MAX_KANTE_HART || hoeheRoh > MAX_KANTE_HART) {
    throw new AnfrageFehler(
      400,
      `Bild zu groß (${breiteRoh}×${hoeheRoh}px, max ${MAX_KANTE_HART}×${MAX_KANTE_HART}px)`,
    );
  }

  let pipeline = sharp(bild).ensureAlpha();
  let herunterskaliert: { vonBreite: number; vonHoehe: number } | undefined;
  if (breiteRoh > MAX_KANTE_ARBEIT || hoeheRoh > MAX_KANTE_ARBEIT) {
    pipeline = pipeline.resize({
      width: MAX_KANTE_ARBEIT,
      height: MAX_KANTE_ARBEIT,
      fit: "inside",
      withoutEnlargement: true,
    });
    herunterskaliert = { vonBreite: breiteRoh, vonHoehe: hoeheRoh };
  }

  try {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    return {
      rgba: new Uint8ClampedArray(data),
      breite: info.width,
      hoehe: info.height,
      herunterskaliert,
    };
  } catch {
    throw new AnfrageFehler(400, "Bild konnte nicht dekodiert werden");
  }
}

function fehlerAntwort(status: number, meldung: string): NextResponse<{ fehler: string }> {
  return NextResponse.json({ fehler: meldung }, { status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const text = await leseBegrenzt(request, MAX_BODY_BYTES);
    const { dataUrl, optionen } = parseAnfrage(text);
    const { rgba, breite, hoehe, herunterskaliert } = await ladeRaster(dataUrl);
    const ergebnis = vektorisiere(rgba, breite, hoehe, optionen);
    const antwort: VektorisierenAntwort = herunterskaliert
      ? { ...ergebnis, herunterskaliert }
      : ergebnis;
    return NextResponse.json(antwort);
  } catch (error) {
    if (error instanceof AnfrageFehler) {
      return fehlerAntwort(error.status, error.message);
    }
    // Nie den echten Fehler/Stack nach außen geben – nur serverseitig loggen.
    console.error("[vektorisieren] Unerwarteter Fehler:", error);
    return fehlerAntwort(500, "Interner Fehler bei der Vektorisierung");
  }
}
