/*
 * lib/api/server-helfer.ts — geteilter Unterbau aller Autoren-API-Routen
 * (app/api/*). Herausgeloest aus app/api/abbild/route.ts, als die API zur
 * Agenten-Schnittstelle wurde (docs/agent-schnittstelle.md §5, Schritt 1/2):
 * Route-Dateien duerfen in Next nur HTTP-Methoden exportieren, geteilte
 * Bausteine muessen deshalb hier leben.
 *
 * SICHERHEITSMODELL der Autoren-API: Sie laeuft NUR unter `next dev` auf
 * 127.0.0.1 (package.json bindet per -H; im Static-Export-Deploy existieren
 * keine Routen). Schutzziel ist deshalb nicht "Internet-Auth", sondern
 * CSRF: eine fremde Website im selben Browser darf die lokale API nicht
 * per fetch ansteuern koennen. Browser senden bei Cross-Origin-POSTs immer
 * einen Origin-Header -> fremder Origin wird abgelehnt. Aufrufe OHNE
 * Origin-Header (printed CLI, curl, Paperclip-Worker, same-origin-Fetches
 * aelterer Browser) sind bewusst erlaubt — das sind genau die Agenten.
 */

import { NextResponse, type NextRequest } from "next/server";

/** Gezielter, dem Client zeigbarer Fehler mit HTTP-Status. */
export class AnfrageFehler extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Einheitliche Fehler-Antwort ohne Stacktrace-Leak; unerwartete Fehler
 *  werden serverseitig geloggt und generisch beantwortet. */
export function fehlerAntwort(e: unknown, kontext: string): NextResponse {
  if (e instanceof AnfrageFehler) {
    return NextResponse.json({ fehler: e.message }, { status: e.status });
  }
  console.error(`[${kontext}] Fehlgeschlagen:`, e);
  return NextResponse.json({ fehler: "Interner Fehler" }, { status: 500 });
}

/* localhost / 127.0.0.1 / [::1] sind dieselbe lokale Maschine — fuer das Gate
   aequivalent, damit der Browser-Zugriff ueber beide Schreibweisen geht. */
function normalisiereLoopbackHost(host: string): string {
  return host.replace(/^(localhost|127\.0\.0\.1|\[::1\])(?=:|$)/, "loopback");
}

/** CSRF-Gate (s. Kopfkommentar): fremder Origin -> 403, fehlender Origin ok.
 *  Same-Origin wird DYNAMISCH gegen den Host-Header des Requests geprueft
 *  statt gegen eine hartkodierte Port-Liste — sonst bricht der Editor, sobald
 *  der Dev-Server auf einem anderen Port laeuft (Welle-3-Verify-Befund:
 *  Ausweich-Port 3118 lief in 403). Browser senden bei Cross-Origin-POSTs
 *  immer den fremden Origin, waehrend der Host-Header der unsere bleibt —
 *  der Vergleich trennt die Faelle sauber. */
export function pruefeUrsprung(req: NextRequest): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // CLI/Agenten ohne Origin — gewollt erlaubt
  const host = req.headers.get("host") ?? "";
  try {
    const o = new URL(origin);
    const passt =
      (o.protocol === "http:" || o.protocol === "https:") &&
      normalisiereLoopbackHost(o.host) === normalisiereLoopbackHost(host);
    if (passt) return;
  } catch {
    /* unparsebarer Origin -> ablehnen */
  }
  throw new AnfrageFehler(403, "Fremder Ursprung");
}

/** Request-Body mit Groessenlimit lesen und als JSON-Objekt parsen. */
export async function leseJsonBody(req: NextRequest, maxBytes: number): Promise<Record<string, unknown>> {
  const roh = await req.text();
  if (Buffer.byteLength(roh, "utf-8") > maxBytes) {
    throw new AnfrageFehler(400, "Anfrage zu groß");
  }
  try {
    const geparst: unknown = JSON.parse(roh);
    if (typeof geparst !== "object" || geparst === null || Array.isArray(geparst)) {
      throw new Error("kein Objekt");
    }
    return geparst as Record<string, unknown>;
  } catch {
    throw new AnfrageFehler(400, "Ungültiges JSON");
  }
}

const MAX_NAME_LAENGE = 100;

/** Saeubert einen vom Client kommenden Namen zu einem reinen
 *  Dateinamen-Baustein: kein Pfadanteil, kein "..", kein Laufwerksbuchstabe/
 *  Doppelpunkt, nur unbedenkliche Zeichen. Wirft statt still zu kuerzen —
 *  ein verstuemmelter Name waere verwirrender als eine Fehlermeldung.
 *  (1:1 das Muster aus app/api/abbild/route.ts, jetzt geteilt.) */
export function saubererName(roh: unknown): string {
  if (typeof roh !== "string") throw new AnfrageFehler(400, "Name fehlt");
  const ohnePfad = roh.replace(/^.*[\\/]/, "").trim();
  if (!ohnePfad) throw new AnfrageFehler(400, "Name fehlt");
  if (ohnePfad.length > MAX_NAME_LAENGE) throw new AnfrageFehler(400, "Name zu lang");
  if (ohnePfad.includes("..") || ohnePfad.includes(":")) {
    throw new AnfrageFehler(400, "Ungültiger Name");
  }
  /* Unicode-Buchstaben zulassen (\p{L}), nicht nur a-z — deutsche Namen wie
     "bäume-oben" sind kein Pfad-Risiko. Gefaehrlich sind Pfadtrenner, ".."
     und ":" (oben abgefangen); zusaetzlich bleiben Windows-Sonderzeichen
     * ? " < > | und Steuerzeichen draussen. */
  if (!/^[\p{L}\p{N} _.-]+$/u.test(ohnePfad)) {
    throw new AnfrageFehler(400, "Ungültiger Name");
  }
  /* Windows verschluckt Namen, die auf Punkt oder Leerzeichen enden. */
  if (/[. ]$/.test(ohnePfad)) {
    throw new AnfrageFehler(400, "Name darf nicht auf . oder Leerzeichen enden");
  }
  return ohnePfad;
}
