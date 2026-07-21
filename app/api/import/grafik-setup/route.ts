/*
 * POST /api/import/grafik-setup — Website-Importer Stufe A als API
 * (docs/agent-schnittstelle.md §5, Schritt 3): deterministischer Adapter
 * GrafikSetup -> Puck-Data (lib/import/grafik-setup-to-puck.ts), als
 * Endpunkt fuer Agenten (printed CLI / Paperclip-Worker) und Menschen.
 *
 * Body:
 *   { setup }                 GrafikSetup direkt (Export des Grafik-Editors)
 *   ODER { abbildName }       gespeichertes Abbild aus abbilder/<name>.json
 *   zielSeite?                Name der Ziel-Seite (Default: setup.name)
 *   dryRun?                   Default TRUE — nur Bericht, nichts schreiben
 *                             ("read-only by default", §3 der Doku)
 *   erwartetGespeichert?/ueberschreibe?   Konflikt-Optionen beim Schreiben
 */

import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { GrafikSetup } from "@/components/grafik/grafik-types";
import { grafikSetupToPuck } from "@/lib/import/grafik-setup-to-puck";
import { AnfrageFehler, fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";
import { pruefeAbbild } from "@/lib/api/grafik-validierung";
import { pruefePuckData, speichereSeite } from "@/lib/api/seiten-speicher";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 8_000_000;

const ABBILD_ORDNER = resolve(process.cwd(), "abbilder");

/** Abbild-Datei lesen (gleiches Pfad-Guard-Muster wie app/api/abbild/route.ts). */
async function ladeAbbildAlsSetup(abbildName: string): Promise<GrafikSetup> {
  const name = saubererName(abbildName);
  const pfad = join(ABBILD_ORDNER, `${name}.json`);
  if (!resolve(pfad).startsWith(resolve(ABBILD_ORDNER) + sep)) {
    throw new AnfrageFehler(400, "Pfad außerhalb des Abbild-Ordners");
  }
  let roh: string;
  try {
    roh = await readFile(pfad, "utf-8");
  } catch {
    throw new AnfrageFehler(404, `Abbild „${name}" nicht gefunden`);
  }
  let inhalt: unknown;
  try {
    inhalt = JSON.parse(roh);
  } catch {
    throw new AnfrageFehler(500, "Abbild-Datei ist kein gültiges JSON");
  }
  const gepr = pruefeAbbild(inhalt);
  const gespeichert =
    typeof (inhalt as Record<string, unknown>).gespeichert === "string"
      ? ((inhalt as Record<string, unknown>).gespeichert as string)
      : "";
  return { name, gespeichert, meta: gepr.meta, grafiken: gepr.grafiken, pool: gepr.pool, uebernommen: gepr.uebernommen };
}

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);

    let setup: GrafikSetup;
    let quelle: string;
    if (body.abbildName !== undefined) {
      setup = await ladeAbbildAlsSetup(body.abbildName as string);
      quelle = `abbilder/${setup.name}.json`;
    } else if (body.setup !== undefined) {
      const s = body.setup as Record<string, unknown>;
      const gepr = pruefeAbbild(s); // grafiken/pool/uebernommen/meta — dieselben Guards wie /api/abbild
      setup = {
        name: typeof s.name === "string" && s.name.trim() ? s.name : "import",
        gespeichert: typeof s.gespeichert === "string" ? s.gespeichert : "",
        meta: gepr.meta,
        grafiken: gepr.grafiken,
        pool: gepr.pool,
        uebernommen: gepr.uebernommen,
      };
      quelle = "setup (Body)";
    } else {
      throw new AnfrageFehler(400, "Entweder setup oder abbildName angeben");
    }

    /* Deterministischer Adapter + dasselbe Gate wie beim direkten Speichern
       (Registry-Klemme + migrate) — eine Pipeline fuer alle Schreibwege. */
    const data = pruefePuckData(grafikSetupToPuck(setup));

    const dryRun = body.dryRun !== false; // Default: true
    const zielSeite = saubererName(body.zielSeite ?? setup.name);
    const bericht = {
      quelle,
      zielSeite,
      grafikenAnzahl: setup.grafiken.length,
      contentAnzahl: data.content.length,
      typen: [...new Set(data.content.map((c) => c.type))],
      dryRun,
    };
    if (dryRun) return NextResponse.json(bericht);

    const datei = await speichereSeite(zielSeite, data, {
      erwartetGespeichert: typeof body.erwartetGespeichert === "string" ? body.erwartetGespeichert : undefined,
      ueberschreibe: body.ueberschreibe === true,
    });
    return NextResponse.json({ ...bericht, pfad: `seiten/${datei.name}.json`, gespeichert: datei.gespeichert });
  } catch (e) {
    return fehlerAntwort(e, "import/grafik-setup");
  }
}
