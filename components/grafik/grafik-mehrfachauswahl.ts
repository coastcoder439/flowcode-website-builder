/*
 * grafik-mehrfachauswahl.ts – reine Hilfsfunktionen für die Mehrfachauswahl
 * im Grafik-Editor (additiv zur bestehenden Einzelauswahl ctx.auswahl, s.
 * GrafikContext.tsx). Eigene Datei statt Inline-Logik in GrafikEditor.tsx
 * (das ist bereits sehr groß) — reine Funktionen ohne Seiteneffekte, leicht
 * durch Aufruf mit Beispielwerten nachvollziehbar. Wird ausschließlich vom
 * Fenster-Pointer-Effekt in GrafikEditor.tsx aufgerufen.
 */

/** Volle effektive Mehrfachauswahl: die primäre Auswahl (falls gesetzt)
 *  PLUS die zusätzlichen IDs — dedupliziert, primäre zuerst. */
export function volleAuswahl(auswahl: string | null, auswahlMehr: string[]): string[] {
  const menge = new Set<string>(auswahlMehr);
  if (auswahl) menge.delete(auswahl);
  return auswahl ? [auswahl, ...menge] : [...menge];
}

export interface ShiftKlickErgebnis {
  auswahl: string | null;
  auswahlMehr: string[];
}

/** Shift-Klick auf `id`: toggelt ihre Mitgliedschaft in der Mehrfachauswahl.
 *  - Noch nicht ausgewählt + bislang NICHTS ausgewählt → wird gleich primär
 *    (verhält sich dann wie ein normaler Klick).
 *  - Noch nicht ausgewählt + schon eine Auswahl da → kommt zu auswahlMehr dazu.
 *  - War sie die PRIMÄRE Auswahl → rückt die nächste aus auswahlMehr nach
 *    (Objektmenü/Inspector zeigen weiterhin sinnvoll GENAU EIN Element).
 *  - War sie nur in auswahlMehr → wird dort einfach herausgefiltert. */
export function shiftKlickToggle(
  auswahl: string | null,
  auswahlMehr: string[],
  id: string,
): ShiftKlickErgebnis {
  const voll = volleAuswahl(auswahl, auswahlMehr);
  if (!voll.includes(id)) {
    if (!auswahl) return { auswahl: id, auswahlMehr };
    return { auswahl, auswahlMehr: [...auswahlMehr.filter((x) => x !== id), id] };
  }
  if (id === auswahl) {
    const rest = auswahlMehr.filter((x) => x !== id);
    return { auswahl: rest[0] ?? null, auswahlMehr: rest.slice(1) };
  }
  return { auswahl, auswahlMehr: auswahlMehr.filter((x) => x !== id) };
}

/** true, wenn `t` innerhalb der Editor-Chrome liegt (Seitenpanel,
 *  schwebendes Objektmenü, Vektorisieren-/Zuschneiden-Overlay, Tutorial,
 *  Hilfe-Popover) — dort darf NIE ein Auswahl-Rechteck (Rubber-Band)
 *  starten, sonst wären Knopf-Klicks/Texteingaben im Panel kaputt. */
export function istEditorChrome(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return false;
  return !!t.closest(
    ".gre-panel, .gre-objektmenue, .gre-vektor-overlay, .gre-crop-overlay, .gre-tutorial-hintergrund, .gre-hilfe-popover",
  );
}

/** Achsenausgerichtetes Rechteck aus zwei beliebigen Eckpunkten — beim
 *  Ziehen eines Auswahl-Rechtecks kann die Zugrichtung in jede der vier
 *  Richtungen gehen. */
export interface Rechteck {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function rechteckAus(x1: number, y1: number, x2: number, y2: number): Rechteck {
  return {
    left: Math.min(x1, x2),
    right: Math.max(x1, x2),
    top: Math.min(y1, y2),
    bottom: Math.max(y1, y2),
  };
}

/** true, wenn sich zwei Rechtecke überlappen (nicht nur berühren). */
export function schneidenSich(a: Rechteck, b: Rechteck): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
