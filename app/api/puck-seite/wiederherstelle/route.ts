/* POST /api/puck-seite/wiederherstelle — eine in den Papierkorb verschobene
 * Puck-Seite zurueckholen (U7/N2, docs/plan-analyse/lens-undo.md §2.5).
 * Body: { name }
 * Stellt die JUENGSTE Papierkorb-Fassung her. 404, wenn nichts im Papierkorb
 * liegt; 409, wenn die Ziel-Seite inzwischen wieder existiert (R-e). */

import { NextResponse, type NextRequest } from "next/server";
import { fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";
import { stelleSeiteWieder } from "@/lib/api/seiten-speicher";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 10_000;

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);
    const name = saubererName(body.name);
    const datei = await stelleSeiteWieder(name);
    return NextResponse.json({
      name: datei.name,
      pfad: `seiten/${datei.name}.json`,
      gespeichert: datei.gespeichert,
      wiederhergestellt: true,
    });
  } catch (e) {
    return fehlerAntwort(e, "puck-seite/wiederherstelle");
  }
}
