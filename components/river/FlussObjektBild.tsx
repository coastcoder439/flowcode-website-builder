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
import type { AnimEinstellungen } from "./RiverKursContext";
import type { FlussKnotenSteuerung } from "./useFlussKnoten";

interface FlussObjektBildProps {
  steuerung: FlussKnotenSteuerung;
}

export function FlussObjektBild({ steuerung: s }: FlussObjektBildProps) {
  const ctx = s.ctx;

  /* Anim-Regler in den Verlauf einbinden (Welle 2c-1, Bauvorlage §3b), OHNE
     die rein darstellenden Sektionen/Regler anzufassen: der Diff sagt, WELCHE
     Felder sich ändern. Genau EINES = ein Regler-Zug/eine Checkbox → coalesced
     pro Feld (ein Slider-Zug = ein Schritt). MEHRERE auf einmal = „Animation
     zurücksetzen" (ANIM_DEFAULTS) → ein diskreter Schritt. VOR dem Anwenden
     committen (Vor-Zug-Stand bleibt Rückgängig-Ziel). Nur auf /editor aktiv;
     das alte rke-Panel gibt weiter ctx.setAnim direkt durch (kein Fluss-Undo
     dort). */
  const setAnimMitVerlauf = (next: AnimEinstellungen) => {
    const vorher = ctx.anim;
    let anzahl = 0;
    let einzelKey: keyof AnimEinstellungen | null = null;
    (Object.keys(next) as (keyof AnimEinstellungen)[]).forEach((k) => {
      if (next[k] !== vorher[k]) {
        anzahl += 1;
        einzelKey = k;
      }
    });
    if (anzahl === 1 && einzelKey) s.verlauf.commit("Animation geändert", `fluss-anim:${einzelKey}`);
    else if (anzahl > 1) s.verlauf.commit("Animation zurückgesetzt");
    ctx.setAnim(next);
  };

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
        <WasserSektion anim={ctx.anim} setAnim={setAnimMitVerlauf} />
      </details>

      <details className="gre-fluss-sektion">
        <summary>Front</summary>
        <FrontSektion anim={ctx.anim} setAnim={setAnimMitVerlauf} />
      </details>

      <details className="gre-fluss-sektion">
        <summary>Nebel</summary>
        <NebelSektion anim={ctx.anim} setAnim={setAnimMitVerlauf} />
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
