/* POST /api/puck-seite/lade — eine Puck-Seite laden.
 * Body: { name } -> { name, gespeichert, version, data } */

import { NextResponse, type NextRequest } from "next/server";
import { fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";
import { ladeSeite } from "@/lib/api/seiten-speicher";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 10_000;

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);
    const name = saubererName(body.name);
    const datei = await ladeSeite(name);
    return NextResponse.json({
      name: datei.name,
      gespeichert: datei.gespeichert,
      version: datei.version,
      data: datei.data,
    });
  } catch (e) {
    return fehlerAntwort(e, "puck-seite/lade");
  }
}
