/*
 * publish.ts — BP-05 (Render-/Preview-Pfad) und BP-06 (Auslieferung unserer
 * Laufzeit als Site-Script).
 *
 * ============================================================================
 * NUR IM BUN-REALM
 * ============================================================================
 * Dieses Modul importiert echten Instatic-Code (nicht nur Typen) und laeuft
 * ausschliesslich in unseren Messskripten unter `bun`. Es gehoert NICHT ins
 * Browser-Bundle. Deshalb ist es NICHT aus wirt/index.ts re-exportiert — wer
 * es braucht, importiert es direkt. (Ein Barrel, das es mitzieht, wuerde
 * Instatics halben Server in das Laufzeit-Bundle ziehen.)
 *
 * ============================================================================
 * BP-05 — WARUM DIREKT `publishPage()` UND NICHT DIE HTTP-ROUTE
 * ============================================================================
 * Es gibt zwei Wege zum server-gerenderten HTML einer Seite:
 *
 *   (a) POST /admin/api/cms/runtime/preview  — braucht eine Admin-Session
 *   (b) publishPage(page, site, registry)    — der Kern, den (a) aufruft
 *
 * (a) ist derzeit verschlossen (Login-Wand), und der ECHTE Publish
 * (POST /admin/api/cms/publish) verlangt zusaetzlich eine
 * Passwort-Wiedereingabe — ein Agent kann in Instatic nicht veroeffentlichen
 * (Plan §8). (b) ist derselbe Render-Pfad ohne Auth-Mantel: die Preview-Route
 * ruft ihn nachweislich selbst auf (previewRuntime.ts:88).
 *
 * WAS DAMIT NICHT BEWIESEN IST — und das gehoert hierher, nicht in eine
 * Fussnote: die Optionsdifferenz zwischen Preview und echtem Publish betrifft
 * die CSS-/Asset-/Loop-Auslieferung. Fuer die Anker- und Node-Fragen ist (b)
 * aussagekraeftig; fuer eine AUSLIEFERUNGS-Messung (Publish-Dauer, Bytes,
 * H3b) ist es das NICHT.
 *
 * ============================================================================
 * BP-06 — DIE BETRIEBSART, DIE WIR GESCHENKT BEKOMMEN (UND DIE STILL KIPPEN KANN)
 * ============================================================================
 * Ein `SiteFile { type: 'script' }` ohne weitere Angaben bekommt von Instatic
 * `DEFAULT_SCRIPT_RUNTIME_CONFIG` (runtimeConfig.ts:44):
 *
 *     enabled: true · runInCanvas: true · format: 'module'
 *     placement: 'body-end' · timing: 'dom-ready' · scope: all-pages · priority: 100
 *
 * Das ist genau, was wir brauchen — und genau deshalb gefaehrlich: aendert
 * Instatic einen dieser Defaults, rendert die Seite weiterhin fehlerfrei,
 * unser Script laeuft nur nicht mehr (oder zu frueh). Ein STILLER Bruch.
 * Zwei Gegenmassnahmen, beide hier:
 *   1. Die Suite prueft die Defaults (bp06-script-defaults).
 *   2. `laufzeitSiteFile(inhalt, { betriebsartFestnageln: true })` schreibt
 *      die Betriebsart explizit in `site.runtime.scripts[fileId]`, statt sich
 *      auf den Default zu verlassen. Standardmaessig AUS, damit die
 *      H3a-/H4-Renderings byteidentisch reproduzierbar bleiben.
 */

/* Modul-Registry fuellen — ohne diesen Seiteneffekt-Import kennt der
   Publisher keine base.*-Module und rendert leere Knoten. */
import "../../instatic/src/modules/base";
import { registry } from "../../instatic/src/core/module-engine";
import { publishPage } from "../../instatic/src/core/publisher";
import { buildSiteRuntimeScripts } from "../../instatic/server/publish/runtime/bundleScripts";
import type { Page, SiteDocument } from "./typen";

/* Die reinen Daten von BP-05/BP-06 liegen in publish-vertrag.ts — importfrei,
   damit die Smoke-Suite sie lesen kann, ohne den Wirt zu laden. */
import {
  PREVIEW_ROUTE,
  ERWARTETE_SCRIPT_BETRIEBSART,
  LAUFZEIT_DATEI_ID,
  LAUFZEIT_DATEI_PFAD,
} from "./publish-vertrag";

export { PREVIEW_ROUTE, ERWARTETE_SCRIPT_BETRIEBSART, LAUFZEIT_DATEI_ID, LAUFZEIT_DATEI_PFAD };

export interface LaufzeitDateiOptionen {
  /** Betriebsart explizit setzen statt sich auf den Wirt-Default zu verlassen
   *  (s. Kopfkommentar). Default: false — Rendering bleibt byteidentisch. */
  betriebsartFestnageln?: boolean;
}

/**
 * BP-06: Unsere Laufzeit als `SiteFile`.
 *
 * Rueckgabe ist absichtlich der ROHE Datensatz und kein fertiges
 * SiteDocument: wer ihn einhaengt, entscheidet selbst, wo. `runtimeEintrag`
 * ist `null`, solange wir uns auf den Wirt-Default verlassen.
 */
export function laufzeitSiteFile(
  inhalt: string,
  optionen: LaufzeitDateiOptionen = {},
): {
  datei: { id: string; path: string; type: "script"; content: string };
  runtimeEintrag: { fileId: string; config: Record<string, unknown> } | null;
} {
  if (typeof inhalt !== "string" || inhalt.length === 0) {
    throw new Error("[fcank/wirt] BP-06: leerer Script-Inhalt — das Bundle wurde nicht gebaut?");
  }
  return {
    datei: {
      id: LAUFZEIT_DATEI_ID,
      path: LAUFZEIT_DATEI_PFAD,
      type: "script",
      content: inhalt,
    },
    runtimeEintrag: optionen.betriebsartFestnageln
      ? { fileId: LAUFZEIT_DATEI_ID, config: { ...ERWARTETE_SCRIPT_BETRIEBSART } }
      : null,
  };
}

/**
 * BP-06: Site-Scripts buendeln (esbuild, im Wirt). Reicht 1:1 durch — die
 * Kapselung liegt darin, dass NUR diese Datei den Wirt-Pfad kennt.
 */
export function baueLaufzeitScripts(eingabe: {
  site: SiteDocument;
  page: Page;
  target: "publish" | "canvas";
  assetBasePath: string;
}) {
  return buildSiteRuntimeScripts(eingabe as Parameters<typeof buildSiteRuntimeScripts>[0]);
}

/**
 * BP-05: Seite -> HTML. Derselbe Pfad, den die Preview-Route nimmt.
 *
 * `registry` wird bewusst NICHT als Parameter durchgereicht: es gibt genau
 * eine Modul-Registry, und sie muss vorher durch den Seiteneffekt-Import oben
 * gefuellt sein. Wer sie selbst uebergeben duerfte, koennte still gegen eine
 * leere rendern — und das Ergebnis waere eine Seite aus lauter leeren Knoten,
 * die auf den ersten Blick "funktioniert".
 */
export function rendereSeiteZuHtml(
  seite: Page,
  site: SiteDocument,
  optionen: Parameters<typeof publishPage>[3] = {},
): ReturnType<typeof publishPage> {
  if (registry.list().length === 0) {
    throw new Error(
      "[fcank/wirt] BP-05: Die Modul-Registry ist leer. Der Seiteneffekt-Import " +
        "'instatic/src/modules/base' hat nicht gewirkt — jede Seite wuerde als leere Knoten rendern.",
    );
  }
  return publishPage(seite, site, registry, optionen);
}

/** Nur fuer Skripte, die den rohen Registry-Wert brauchen (z.B. Diagnose). */
export { registry as modulRegistry };
