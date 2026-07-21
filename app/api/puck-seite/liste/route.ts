/* POST /api/puck-seite/liste — alle gespeicherten Puck-Seiten (seiten/).
 * Kein Body noetig. Getrennte POST-Pfade statt aktion-Dispatch, damit jede
 * Operation eine eigene OpenAPI-Operation/ein eigenes Agenten-Tool ist
 * (docs/agent-schnittstelle.md §5, Schritt 2). */

import { NextResponse, type NextRequest } from "next/server";
import { fehlerAntwort, pruefeUrsprung } from "@/lib/api/server-helfer";
import { listeSeiten } from "@/lib/api/seiten-speicher";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    return NextResponse.json({ seiten: await listeSeiten() });
  } catch (e) {
    return fehlerAntwort(e, "puck-seite/liste");
  }
}
