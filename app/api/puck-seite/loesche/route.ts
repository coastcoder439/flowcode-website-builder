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
    await loescheSeite(name);
    return NextResponse.json({ name, geloescht: true });
  } catch (e) {
    return fehlerAntwort(e, "puck-seite/loesche");
  }
}
