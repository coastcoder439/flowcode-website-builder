/* POST /api/puck-seite/speichere — eine Puck-Seite schreiben.
 * Body: { name, data, erwartetGespeichert?, ueberschreibe? }
 * 409 bei Konflikt (Seite existiert mit anderem Stand) — Konflikt-Modell
 * in lib/api/seiten-speicher.ts. data wird strukturgeprueft, auf
 * registrierte Komponenten-Typen geklemmt und durch Pucks migrate() gehoben. */

import { NextResponse, type NextRequest } from "next/server";
import { AnfrageFehler, fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";
import { pruefeAnim, pruefePuckData, pruefeStyles, speichereSeite } from "@/lib/api/seiten-speicher";

export const runtime = "nodejs";
/* Wie /api/abbild: reine JSON-Nutzlast (Assets stehen als URL drin) —
   8 MB faengt versehentlich eingebettete Base64-Dateien ab. */
const MAX_BODY_BYTES = 8_000_000;

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);
    const name = saubererName(body.name);
    const data = pruefePuckData(body.data);
    if (body.erwartetGespeichert !== undefined && typeof body.erwartetGespeichert !== "string") {
      throw new AnfrageFehler(400, "erwartetGespeichert muss ein String sein");
    }
    /* Welle 4c: optionales Animations-Abbild. Nur pruefen/setzen, wenn wirklich
       mitgeschickt — sonst bleibt ein bestehendes anim erhalten (speichereSeite). */
    const anim = body.anim !== undefined ? pruefeAnim(body.anim) : undefined;
    /* Welle 5a: optionale uebernommene Styles. Nur pruefen/setzen, wenn wirklich
       mitgeschickt — sonst bleibt ein bestehendes styles erhalten. */
    const styles = body.styles !== undefined ? pruefeStyles(body.styles) : undefined;
    const datei = await speichereSeite(name, data, {
      erwartetGespeichert: body.erwartetGespeichert as string | undefined,
      ueberschreibe: body.ueberschreibe === true,
      anim,
      styles,
    });
    return NextResponse.json({
      name: datei.name,
      pfad: `seiten/${datei.name}.json`,
      gespeichert: datei.gespeichert,
      contentAnzahl: datei.data.content.length,
    });
  } catch (e) {
    return fehlerAntwort(e, "puck-seite/speichere");
  }
}
