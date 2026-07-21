/*
 * POST /api/builder/status — Discovery-/Health-Ziel der Autoren-API
 * (docs/agent-schnittstelle.md §3/§5: das "doctor"-Ziel des printed CLI).
 * POST statt GET aus demselben Grund wie alle Routen hier: output:"export"
 * wuerde eine GET-Route statisch vorrendern (s. app/api/assets/route.ts).
 */

import { NextResponse, type NextRequest } from "next/server";
import { fehlerAntwort, pruefeUrsprung } from "@/lib/api/server-helfer";
import { SEITEN_VERSION } from "@/lib/api/seiten-speicher";
import { PUCK_KOMPONENTEN_TYPEN } from "@/lib/puck-registry";
/* Default-Import statt named export: Webpack deprecates benannte Exports
   aus JSON-Modulen ("only default export is available soon"). */
import paketInfo from "@/package.json";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    return NextResponse.json({
      name: "flowcode-website-builder",
      version: paketInfo.version,
      apiVersion: SEITEN_VERSION,
      zeit: new Date().toISOString(),
      komponentenTypen: PUCK_KOMPONENTEN_TYPEN,
      routen: [
        "/api/builder/status",
        "/api/puck-seite/liste",
        "/api/puck-seite/lade",
        "/api/puck-seite/speichere",
        "/api/puck-seite/loesche",
        "/api/import/grafik-setup",
        "/api/abbild",
        "/api/assets",
        "/api/vektorisieren",
      ],
    });
  } catch (e) {
    return fehlerAntwort(e, "builder/status");
  }
}
