/*
 * app/editor/stationen.ts — die EINE URL-Wahrheit der Vier-Stationen-Shell
 * (Phase 1 / F2, docs/plan-analyse/lens-flow.md §3-S3).
 *
 * Hier liegen die geteilten Typen (Station/Sub/Zustand) UND die reinen
 * Lese-/Schreib-Helfer fuer den Query-Param — bewusst frei von React, damit
 * page.tsx (Shell) und SeitenBereich.tsx (Sub-Zustand) dieselbe Wahrheit lesen,
 * ohne dass eine der beiden ihren EIGENEN popstate-Listener fuehrt. Genau diese
 * Doppel-Listener-Asymmetrie war die Wurzel von N20 (Puck-Oeffnen legte keinen
 * History-Eintrag an, Vorschau schon) — jetzt schreibt NUR der zentrale
 * navigiere()-Reducer in page.tsx, alle Wechsel laufen ueber urlVon().
 *
 * URL-Wahrheit:
 *   - `?station=import|bauen|animator|preview`  (Default `import` → sauberer Pfad)
 *   - Sub-Zustaende der Station „bauen":
 *       `?station=bauen&seite=<name>`    → Puck-Editor fuer <name> offen
 *       `?station=bauen&vorschau=<name>` → statische Vollbild-Vorschau von <name>
 *   - Abwaertskompatibel: `?bereich=seiten` → Station „bauen".
 *
 * Deep-Link-Heilung (Phase 1 / F3, docs/plan-analyse/lens-flow.md §3-S4 → N21):
 * `leseZustand()` faengt geteilte/gekuerzte/vertippte Links ab, statt sie stumm
 * auf Import oder Animator fallen zu lassen. Die drei Heil-Regeln (Reihenfolge =
 * Vorrang) stehen unten direkt am Code. Kernzusagen:
 *   - Die VORSCHAU-Absicht gewinnt: ein blosser `?vorschau=<name>` — oder einer
 *     mit fehlender/falscher Station — loest IMMER auf die statische Vorschau in
 *     Station „bauen" auf (der Hilfe-Dialog bewirbt den Vorschau-Link als teilbar,
 *     SeitenBereich.tsx). Damit landet er nie mehr auf dem Animator (N21).
 *   - Die kuenftige Vorschau-Link-Form `?station=preview&seite=<name>` (Station 4
 *     wird in Phase 5 zur Export-Wahrheit) nennt eine konkrete Seite; sie wird
 *     ueber die heutige statische Vorschau erfuellt statt `seite` zu verwerfen.
 *   - Unbekannte/leere `?station`-Werte → Default „import" (kein Crash), nie eine
 *     tote Ansicht.
 */

/** Die vier Stationen in Flow-Reihenfolge (R3). */
export type Station = "import" | "bauen" | "animator" | "preview";

/** Sub-Zustand INNERHALB einer Station (heute nur „bauen"): der offene
 *  Puck-Editor bzw. die statische Vorschau — beide reload-fest im Query-Param. */
export type Sub =
  | { art: "puck"; seite: string }
  | { art: "vorschau"; seite: string }
  | null;

/** Vollstaendiger Navigations-Zustand = Station + optionaler Sub-Zustand. */
export interface Zustand {
  station: Station;
  sub: Sub;
}

/** Liest den kompletten Zustand aus der aktuellen URL — mit Deep-Link-Heilung
 *  (F3/N21, siehe Datei-Kopf). SSR → Default „import". Wirft nie: jeder
 *  fehlende/leere/unbekannte Wert faellt kontrolliert auf einen gueltigen Zustand. */
export function leseZustand(): Zustand {
  if (typeof window === "undefined") return { station: "import", sub: null };
  const p = new URLSearchParams(window.location.search);

  /* Werte defensiv lesen: getrimmt, damit reine Whitespace-Werte (z. B. aus
     schlecht gekuerzten Links) wie „fehlt" behandelt werden — nicht wie ein
     gueltiger Name. */
  const rohStation = (p.get("station") ?? "").trim();
  const vorschau = (p.get("vorschau") ?? "").trim();
  const seite = (p.get("seite") ?? "").trim();

  /* Nur ein EXPLIZIT gueltiger Stationswert (oder der Alt-Link) zaehlt. Alles
     andere — unbekannt, vertippt, leer — bleibt `null` und wird unten geheilt.
     So gibt es fuer `?station=<muell>` keine tote Ansicht und keinen Crash. */
  const explizit: Station | null =
    rohStation === "import" ||
    rohStation === "bauen" ||
    rohStation === "animator" ||
    rohStation === "preview"
      ? rohStation
      : p.get("bereich") === "seiten"
        ? "bauen" /* Abwaertskompatibel: Alt-Link `?bereich=seiten` */
        : null;

  /* (Heilung 1) Die Vorschau-Absicht gewinnt: `?vorschau=<name>` ist der
     teilbare, gern von Hand gekuerzte Vorschau-Link (N21). Er nennt eine Seite
     fuer die statische Vollbild-Vorschau und loest IMMER auf Station „bauen" auf
     — egal ob die Station fehlt, falsch (z. B. `station=animator`) oder gueltig
     ist. Damit landet ein blosser `?vorschau=X` nie mehr stumm auf dem Animator. */
  if (vorschau) return { station: "bauen", sub: { art: "vorschau", seite: vorschau } };

  /* (Heilung 2) Kuenftige Vorschau-Link-Form `?station=preview&seite=<name>`
     (lens-flow.md §3-S4): Station 4 zeigt heute nur die AKTIVE Website, kann also
     keine beliebig benannte Seite darstellen. Statt `seite` stumm zu verwerfen
     und die (evtl. ganz andere) aktive Seite zu zeigen, wird die Vorschau-Absicht
     fuer genau diese Seite ueber die heutige statische Vorschau erfuellt. Ein
     blosses `?station=preview` (ohne Seite) bleibt unberuehrt die Aktiv-Vorschau. */
  if (explizit === "preview" && seite) {
    return { station: "bauen", sub: { art: "vorschau", seite } };
  }

  /* (Heilung 3) Puck-Editor-Deeplink `?seite=<name>`: gehoert ausschliesslich zur
     Station „bauen" und oeffnet den Editor nur, wenn die Station auch wirklich
     „bauen" ist (explizit oder via Alt-Link). Eine andere Station bleibt Herr der
     Ansicht — `seite` wird dort ignoriert, nicht fehlgedeutet. */
  if (seite && explizit === "bauen") {
    return { station: "bauen", sub: { art: "puck", seite } };
  }

  /* Kein Sub: die explizit gueltige Station, sonst der Flow-Start „import". */
  return { station: explizit ?? "import", sub: null };
}

/** Baut die URL zu einem Zustand (Default-Station „import" ohne Sub → sauberer
 *  Pfad ohne Query, damit die Start-URL nackt bleibt). Nur client-seitig. */
export function urlVon({ station, sub }: Zustand): string {
  const p = new URLSearchParams();
  if (station !== "import") p.set("station", station);
  if (sub?.art === "vorschau") p.set("vorschau", sub.seite);
  else if (sub?.art === "puck") p.set("seite", sub.seite);
  const qs = p.toString();
  return qs ? `?${qs}` : window.location.pathname;
}

/** Verlaesst der Wechsel alt→neu einen OFFENEN Puck-Editor? (Dirty-Guard-Frage.)
 *  Wahr, wenn alt einen Puck offen hatte und neu NICHT exakt denselben Puck
 *  zeigt. Bleibt derselbe Puck offen (z. B. Klick auf dieselbe Station), ist es
 *  kein Verlassen. */
export function verlaesstOffenenPuck(alt: Zustand, neu: Zustand): boolean {
  if (alt.sub?.art !== "puck") return false;
  return !(neu.sub?.art === "puck" && neu.sub.seite === alt.sub.seite);
}
