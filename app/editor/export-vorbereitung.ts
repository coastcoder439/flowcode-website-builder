"use client";

/*
 * app/editor/export-vorbereitung.ts — Station 4, X4/X5-Verkabelung.
 * Spec: docs/plan-analyse/lens-preview-export.md §3-S4/S5 (+ §2 Ziel-Architektur).
 *
 * BRUECKE zwischen dem Seiten-Abgriff (ExportSammler/X3) und dem Generator-Kern
 * (ordner-export/X1): reichert die vom Sammler gelieferten SammlerSeiten um die
 * restlichen OrdnerSeite-Zutaten an (config, runtimeJs, embedUrl, cssInhalte)
 * und baut aus dem INLINE-Modus des Generators das iframe-srcdoc der Preview.
 *
 * Bewusst getrennt von den Komponenten (Station4Preview/Station4ExportPanel):
 * die UNREINE fetch-Kette (Runtime laden, uebernommene CSS laden, Bilder ueber
 * baueEmbedConfig) liegt an EINER Stelle, die Preview UND Ordner-Export teilen —
 * so kann keine Drift zwischen „was die Vorschau zeigt" und „was der Export
 * schreibt" entstehen (M23: Preview = Export-Wahrheit).
 *
 * WICHTIG — grafikenDocH wird BEWUSST NICHT ausgeliefert: SeitenAnim
 * (lib/api/seiten-speicher.ts) speichert die autorierte Dokumenthoehe nicht.
 * Beim self-contained Seiten-Export ist die exportierte Seite SELBST die Buehne,
 * gegen die die Keyframes autoriert wurden → keine Re-Skalierung noetig, faktor 1
 * ist korrekt (GrafikLayer: faktor = aktuelleDocH/authoredDocH; authoredDocH
 * fehlt → faktor 1). Ein GERATENER docH wuerde die Grafiken proportional
 * verschieben — deshalb lieber gar keinen mitgeben (ehrliche, dokumentierte
 * Grenze; dieselbe „statisch eingefroren"-Linie wie die Anker im Export).
 */

import { baueEmbedConfig } from "@/components/embed/embed-export";
import { baueOrdnerArtefakt, type OrdnerSeite } from "@/components/embed/ordner-export";
import type { EmbedConfig } from "@/components/embed/EmbedRoot";
import type { SammlerSeite } from "./ExportSammler";

/** Wo wee-embed.js auf DIESEM Projekt liegt (identisch zu GrafikExportPanel/
 *  public/embed-demo.html) — der INLINE-Modus buendelt die Runtime ohnehin
 *  inline; die URL steht nur im Anleitungs-Kommentar des Artefakts. */
export const EMBED_URL = "/wee-embed.js";

export interface VorbereitungsOptionen {
  /** Bilder als Data-URL einbetten? Fuer den Ordner-Export FALSE (Projektpfade
   *  bleiben stehen → der Generator lagert sie nach assets/ aus und kopiert sie);
   *  fuer die dev-served Preview ebenfalls FALSE (die /import/…-Pfade loesen im
   *  iframe-srcdoc gegen die Dev-Origin auf und laden direkt). */
  bilderInline: boolean;
}

/** Runtime-Text (wee-embed.js) — je Sitzung einmal geladen (statisches
 *  Artefakt). Bewusst modulweit gecacht, damit ein Multi-Page-Export sie nicht
 *  je Seite erneut holt. */
let runtimeCache: string | null = null;

async function ladeRuntime(): Promise<string> {
  if (runtimeCache !== null) return runtimeCache;
  const res = await fetch(EMBED_URL);
  if (!res.ok) throw new Error(`Runtime (wee-embed.js) nicht ladbar: HTTP ${res.status}`);
  runtimeCache = await res.text();
  return runtimeCache;
}

/** Laedt die Text-Inhalte der uebernommenen Stylesheets (href → CSS-Text) — der
 *  Ordner-Export braucht sie, um lokale url()-Sub-Assets aufzuloesen und die
 *  CSS-Dateien mit rebasten Pfaden zu schreiben (ordner-export.sammleAssetReferenzen).
 *  Fehlt eine Datei (Netzfehler/404), bleibt sie hier weg → der Generator kopiert
 *  sie dann roh (quellUrl), statt den Export abzubrechen. */
async function ladeCssInhalte(styles: string[] | null | undefined): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const href of styles ?? []) {
    try {
      const res = await fetch(href);
      if (res.ok) out[href] = await res.text();
    } catch {
      /* CSS nicht ladbar → ordner-export faellt auf Roh-Kopie zurueck. */
    }
  }
  return out;
}

/**
 * Reichert die gesammelten Seiten (X3) zu vollstaendigen OrdnerSeiten (X1) an.
 * Runtime einmal, Config + CSS je Seite. Die Config kommt OHNE grafikenDocH
 * (s. Datei-Kopf).
 */
export async function reichereZuOrdnerSeiten(
  seiten: SammlerSeite[],
  opts: VorbereitungsOptionen,
): Promise<OrdnerSeite[]> {
  const runtimeJs = await ladeRuntime();
  const ausgabe: OrdnerSeite[] = [];
  for (const s of seiten) {
    const vollConfig = await baueEmbedConfig(s.anim?.grafiken ?? [], null, {
      bilderInline: opts.bilderInline,
      docH: 0, // wird sofort entfernt — s. Datei-Kopf
    });
    /* grafikenDocH herausnehmen (Rest-Destructuring auf eine frische Kopie): der
       Export laeuft ohne Hoehen-Normalisierung (faktor 1). */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { grafikenDocH: _ohneDocH, ...config } = vollConfig;
    const cssInhalte = await ladeCssInhalte(s.styles);
    ausgabe.push({ ...s, config: config as EmbedConfig, runtimeJs, embedUrl: EMBED_URL, cssInhalte });
  }
  return ausgabe;
}

/**
 * Baut das iframe-srcdoc der Live-Preview EINER Seite: das INLINE-Artefakt des
 * Generators (byte-identisch zum „Ganze Seite (HTML)"-Export) plus die
 * uebernommenen Stylesheets als <link> im <head>.
 *
 * Warum die Styles NUR hier (nicht im Datei-Artefakt) zugehaengt werden: das
 * INLINE-Datei-Format bleibt unveraendert (X1-Invariante). Fuer die
 * BILDSCHIRM-Vorschau aber braucht die Seite ihr echtes Aussehen — die
 * /import/…-Stylesheets loesen im srcdoc gegen die Dev-Origin auf und laden
 * direkt (dieselbe CSS wie im Ordner-Export, nur ueber den Dev-Pfad statt
 * ueber ./css/). `:root` bleibt dabei `:root` (das iframe IST ein eigenes
 * Dokument — kein @scope noetig, s. lib/import/css-rewrite.ts).
 */
export function baueVorschauSrcdoc(seite: OrdnerSeite): string {
  const artefakt = baueOrdnerArtefakt([seite], "inline");
  const html = artefakt.dateien[0]?.inhalt ?? "";
  const links = (seite.styles ?? [])
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");
  if (links === "") return html;
  /* baueSeiteHtml emittiert genau EIN </head>. */
  return html.replace("</head>", `${links}\n</head>`);
}
