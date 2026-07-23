/*
 * app/editor/export-seiten-auswahl.ts — reine Seiten-Auswahl fuer den
 * Multi-Page-Export (Station 4, X3). Spec: docs/plan-analyse/lens-preview-export.md
 * §3-S3 + plan-webbuilder-umbau-gesamt.md E5 („Ganze aktive Website").
 *
 * BEWUSST DOM-/React-FREI und ohne Netz: nur String-Logik, damit die Auswahl
 * ohne Browser unit-testbar ist (scripts/tests/export-seiten-auswahl.test.mjs) —
 * gleiches Muster wie der DOM-freie Generator-Kern ordner-export.ts. Der
 * eigentliche Markup-Abgriff (verstecktes <Render>) liegt in ExportSammler.tsx.
 *
 * ZUORDNUNG „aktive Website" → Seiten-Set (mit der Spec abgeglichen):
 * Die „aktive Website" ist EIN Seiten-Name (lib/aktive-seite.ts, ein String).
 * Der Import legt die Startseite als `<basis>` und jede Unterseite als
 * `<basis>-<unterpfad>` ab (app/editor/SeitenImport.tsx, slugVonSeite; verifiziert
 * an den seiten/wee-v3-fein*.json). Also ist die ganze Website:
 *   · die Seite mit Namen === aktiv         → Startseite (index.html),
 *   · plus alle Seiten mit Praefix `aktiv-`  → Unterseiten (<slug>/index.html).
 * Der Praefix bekommt bewusst das Trenn-„-" angehaengt, damit ein Geschwister
 * mit laengerem Namen (z.B. aktiv „wee-v3" faengt „wee-v3-fein" NICHT als
 * Teil-Substring, sondern nur an der Segmentgrenze) sauber greift.
 */

/** Eine eingeplante Seite der aktiven Website — Eingabe fuer den Markup-Abgriff
 *  (ExportSammler) und, angereichert, fuer den Generator (ordner-export.ts). */
export interface WebsiteSeitenPlan {
  /** Seiten-Name (Datei ohne .json) — Schluessel fuer /api/puck-seite/lade. */
  name: string;
  /** Ordner-Segment relativ zur Website-Wurzel (leer fuer die Startseite).
   *  = Name ohne den `aktiv-`-Praefix; „/" bleibt als „-" flach (der Import
   *  hat Unterpfade bereits zu „-" verflacht — nicht umkehrbar, aber als
   *  flaches Segment eindeutig und kollisionsfrei, da Namen eindeutig sind). */
  slug: string;
  /** Startseite? → landet als index.html in der Wurzel (ordner-export.seitenPfad). */
  istStart: boolean;
}

/**
 * Waehlt aus ALLEN gespeicherten Seiten-Namen die Seiten der aktiven Website und
 * plant je Seite ihr Ordner-Segment. Reihenfolge: Startseite zuerst, danach die
 * Unterseiten alphabetisch (deterministisch → stabile Export-/Fortschritts-Reihung).
 *
 * Ist `aktiv` nicht in der Liste (verwaiste aktive Website), enthaelt der Plan
 * KEINE Startseite — evtl. vorhandene Unterseiten werden trotzdem geplant; der
 * Aufrufer (ExportSammler-Bericht) macht das sichtbar, statt still zu schlucken.
 * Ist `aktiv` leer/whitespace, ist der Plan leer.
 */
export function waehleWebsiteSeiten(alleNamen: string[], aktiv: string): WebsiteSeitenPlan[] {
  const basis = (aktiv ?? "").trim();
  if (basis === "") return [];

  const praefix = `${basis}-`;
  const start: WebsiteSeitenPlan[] = [];
  const unter: WebsiteSeitenPlan[] = [];

  for (const name of alleNamen) {
    if (name === basis) {
      start.push({ name, slug: "", istStart: true });
    } else if (name.startsWith(praefix)) {
      unter.push({ name, slug: name.slice(praefix.length), istStart: false });
    }
  }

  unter.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return [...start, ...unter];
}
