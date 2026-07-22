"use client";

/*
 * FlussSektion – Inhalt des früheren Fluss-Editor-Reiters „Fluss"
 * (Knoten-Editing), aus RiverKursEditor.tsx herausgelöst (Welle 2b-1,
 * verhaltensgleich). Rein darstellend: bekommt die Knoten-Aktionen als
 * Callbacks, der Zustand lebt weiter im RiverKurs-Context.
 */

interface FlussSektionProps {
  /** Index des eingeloggten Knotens (null = keiner) — steuert „− Knoten". */
  gelockt: number | null;
  vollAufgedeckt: boolean;
  setVollAufgedeckt: (v: boolean) => void;
  knotenHinzufuegen: () => void;
  knotenLoeschen: () => void;
  geradeZuruecksetzen: () => void;
}

export function FlussSektion({
  gelockt,
  vollAufgedeckt,
  setVollAufgedeckt,
  knotenHinzufuegen,
  knotenLoeschen,
  geradeZuruecksetzen,
}: FlussSektionProps) {
  return (
    <>
      <div className="rke-hilfe">
        Ziehen = Position · Klick = einloggen (gelb) → Scrollrad = Breite/Perspektive · ESC =
        ausloggen
      </div>
      <div className="rke-row">
        <button onClick={knotenHinzufuegen}>+ Knoten</button>
        <button onClick={knotenLoeschen} disabled={gelockt === null}>
          − Knoten
        </button>
      </div>
      <div className="rke-row">
        <button onClick={geradeZuruecksetzen}>Gerade zurücksetzen</button>
      </div>
      <label className="rke-row">
        <input
          type="checkbox"
          checked={vollAufgedeckt}
          onChange={(e) => setVollAufgedeckt(e.target.checked)}
        />
        Fluss komplett aufdecken
      </label>
    </>
  );
}
