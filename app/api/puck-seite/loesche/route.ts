/* POST /api/puck-seite/loesche — eine Puck-Seite loeschen.
 * Body: { name } */

import { NextResponse, type NextRequest } from "next/server";
import { fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";
import { loescheSeite } from "@/lib/api/seiten-speicher";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 10_000;

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);
    const name = saubererName(body.name);
    /* U7/N2: loescheSeite verschiebt in den Papierkorb (reversibel) und liefert
       den Papierkorb-Dateinamen zurueck — reicht ihn dem Client fuer Undo/Logs. */
    const papierkorb = await loescheSeite(name);
    return NextResponse.json({ name, geloescht: true, papierkorb });
  } catch (e) {
    return fehlerAntwort(e, "puck-seite/loesche");
  }
}
