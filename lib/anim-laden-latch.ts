/* anim-laden-latch.ts — merkt die Entscheidung „gespeicherte Animation einer
 * Seite beim Öffnen als Bühne laden?" je Seite + Seiten-Stand (M15).
 *
 * Hintergrund: Wird eine eigene Seite als Animator-Bühne gewählt und trägt sie
 * ein gespeichertes Animations-Abbild, während der Animator selbst schon
 * Grafiken hat, fragte der Editor früher bei JEDEM Öffnen per nativem
 * confirm() nach (nervt bei jedem Reload). Statt jedes Mal zu fragen, wird die
 * Wahl hier persistiert:
 *   - Schlüssel  : `wee-anim-laden:<seite>`
 *   - Wert (JSON): { wahl: "laden" | "behalten", stand: <gespeichert-Stempel> }
 *
 * Der `stand` ist der `gespeichert`-Zeitstempel der Seite (siehe
 * /api/puck-seite/lade). Ändert sich der Seiten-Stand (neu gespeichert), passt
 * der gemerkte `stand` nicht mehr → es wird EINMALIG neu gefragt. So bleibt die
 * gemerkte Wahl an den konkreten Seiten-Stand gebunden und veraltet nicht still.
 *
 * Reines Browser-Feature: alle Zugriffe sind SSR-sicher (typeof window) und in
 * try/catch gekapselt (privater Modus / gesperrter Storage → einfach „kein
 * Merker", der Editor fällt dann auf den Dialog zurück). */

export type AnimLadenWahl = "laden" | "behalten";

export interface AnimLadenLatch {
  /** Gemerkte Entscheidung des Nutzers für diese Seite + diesen Stand. */
  wahl: AnimLadenWahl;
  /** `gespeichert`-Zeitstempel der Seite, für den die Wahl gilt. */
  stand: string;
}

const PRAEFIX = "wee-anim-laden:";

/** localStorage-Schlüssel für eine Seite (kapselt das Präfix an einer Stelle). */
function schluessel(seite: string): string {
  return `${PRAEFIX}${seite}`;
}

/** Gemerkte Wahl für eine Seite lesen — `null`, wenn keine gemerkt ist oder der
 *  Eintrag unlesbar/kaputt ist (dann fragt der Editor wieder). */
export function leseAnimLadenLatch(seite: string): AnimLadenLatch | null {
  if (typeof window === "undefined" || !seite) return null;
  try {
    const roh = window.localStorage.getItem(schluessel(seite));
    if (!roh) return null;
    const wert = JSON.parse(roh) as unknown;
    if (
      wert &&
      typeof wert === "object" &&
      "wahl" in wert &&
      "stand" in wert &&
      ((wert as AnimLadenLatch).wahl === "laden" || (wert as AnimLadenLatch).wahl === "behalten") &&
      typeof (wert as AnimLadenLatch).stand === "string"
    ) {
      return { wahl: (wert as AnimLadenLatch).wahl, stand: (wert as AnimLadenLatch).stand };
    }
    return null;
  } catch {
    return null;
  }
}

/** Wahl für eine Seite + einen Seiten-Stand merken (überschreibt eine ältere
 *  Wahl derselben Seite — es gilt immer nur der zuletzt bestätigte Stand). */
export function schreibeAnimLadenLatch(seite: string, wahl: AnimLadenWahl, stand: string): void {
  if (typeof window === "undefined" || !seite) return;
  try {
    const wert: AnimLadenLatch = { wahl, stand };
    window.localStorage.setItem(schluessel(seite), JSON.stringify(wert));
  } catch {
    /* Storage nicht schreibbar → keine Persistenz; der Editor fragt weiter. */
  }
}

/** Gemerkte Wahl einer Seite vergessen — beim nächsten Öffnen wird wieder
 *  gefragt (der „wieder fragen"-Knopf im Speichern-Reiter hängt hier dran). */
export function loescheAnimLadenLatch(seite: string): void {
  if (typeof window === "undefined" || !seite) return;
  try {
    window.localStorage.removeItem(schluessel(seite));
  } catch {
    /* Storage nicht erreichbar → nichts zu tun. */
  }
}
