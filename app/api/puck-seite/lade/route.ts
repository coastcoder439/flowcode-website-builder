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
      /* Welle 4c: das Animations-Abbild mitliefern (falls vorhanden), damit der
         Animator es beim Laden der Seite als Buehne uebernehmen kann. */
      ...(datei.anim ? { anim: datei.anim } : {}),
    });
  } catch (e) {
    return fehlerAntwort(e, "puck-seite/lade");
  }
}
