"use client";

/*
 * FlussObjektBild – der Inhalt des „Bild"-Reiters, wenn auf /editor das
 * Fluss-Objekt den Fokus hat (Bauvorlage §1/§2: der „Objekt"-Reiter ist
 * kontextuell — Grafik → GrafikInspector, Fluss → Fluss-Eigenschaften). Zeigt
 * die früheren Fluss-Reiter als aufklappbare Sektionen (native <details>,
 * tastatur- und screenreader-zugänglich) statt als separates rke-Panel.
 *
 * Der „Objekt"-Reiter zeigt für den Fluss genau die vier Eigenschafts-Sektionen
 * Fluss · Wasser · Front · Nebel (Bauvorlage §2). Die Fluss-PROFILE (Speichern/
 * Laden, Inventar §1.R) sind seit Welle 2b-2 in den Reiter „Speichern"
 * umgezogen — dort neben den Grafik-Setups, weil beide „Stand sichern" bedeuten.
 * Nichts geht verloren, nur logischer einsortiert.
 */

import { FlussSektion } from "./sektionen/FlussSektion";
import { WasserSektion } from "./sektionen/WasserSektion";
import { FrontSektion } from "./sektionen/FrontSektion";
import { NebelSektion } from "./sektionen/NebelSektion";
import type { FlussKnotenSteuerung } from "./useFlussKnoten";

interface FlussObjektBildProps {
  steuerung: FlussKnotenSteuerung;
}

export function FlussObjektBild({ steuerung: s }: FlussObjektBildProps) {
  const ctx = s.ctx;
  return (
    <div className="gre-fluss-objekt">
      <div className="gre-reiter-kopf">
        <span>🌊 Fluss</span>
        <span className="gre-meta">{s.nodes?.length ?? 0} Knoten</span>
      </div>
      <div className="gre-hilfe">
        Der Fluss ist ausgewählt. Ziehe die Knoten-Punkte auf der Seite; hier passt du Wasser,
        Front, Nebel und gespeicherte Profile an.
      </div>

      <details className="gre-fluss-sektion" open>
        <summary>Fluss (Knoten)</summary>
        <FlussSektion
          gelockt={s.gelockt}
          vollAufgedeckt={ctx.vollAufgedeckt}
          setVollAufgedeckt={ctx.setVollAufgedeckt}
          knotenHinzufuegen={s.knotenHinzufuegen}
          knotenLoeschen={s.knotenLoeschen}
          geradeZuruecksetzen={s.geradeZuruecksetzen}
        />
      </details>

      <details className="gre-fluss-sektion">
        <summary>Wasser</summary>
        <WasserSektion anim={ctx.anim} setAnim={ctx.setAnim} />
      </details>

      <details className="gre-fluss-sektion">
        <summary>Front</summary>
        <FrontSektion anim={ctx.anim} setAnim={ctx.setAnim} />
      </details>

      <details className="gre-fluss-sektion">
        <summary>Nebel</summary>
        <NebelSektion anim={ctx.anim} setAnim={ctx.setAnim} />
      </details>

      {/* Fluss-Profile (Speichern/Laden) sind bewusst NICHT hier, sondern im
          Reiter „Speichern" — s. Datei-Kommentar oben. */}
      <div className="gre-hilfe">
        Fluss speichern/laden findest du im Reiter <b>Speichern</b>.
      </div>

      {s.status && <div className="gre-status">{s.status}</div>}
    </div>
  );
}
