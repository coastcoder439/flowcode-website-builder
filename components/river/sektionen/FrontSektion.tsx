"use client";

/*
 * FrontSektion – Inhalt des früheren Fluss-Editor-Reiters „Front" (intern
 * id=blasen, Fließfront-Partikel), aus RiverKursEditor.tsx herausgelöst
 * (Welle 2b-1, verhaltensgleich). Bekommt anim/setAnim aus dem
 * RiverKurs-Context. Zum geteilten „Animation zurücksetzen"-Knopf s.
 * WasserSektion.tsx.
 */

import { ANIM_DEFAULTS, type AnimEinstellungen } from "../RiverKursContext";
import { Regler, type AnimRegler } from "./Regler";

/** Regler des „Front"-Reiters (Partikelwolke der Fließfront). Die BREITE
 *  fehlt bewusst — sie ist fest an die Flussbreite gekoppelt. */
const REGLER_BLASEN: AnimRegler[] = [
  { key: "foamCount", label: "Partikel", min: 10, max: 320, step: 5, einheit: "" },
  { key: "foamLeadPx", label: "Vorpreschen", min: 0, max: 140, step: 2, einheit: "px" },
  { key: "foamSpeed", label: "Tempo", min: 0.2, max: 4, step: 0.1, einheit: "×" },
  { key: "foamSizeK", label: "Größe", min: 0.3, max: 3, step: 0.1, einheit: "×" },
  { key: "foamJitterPx", label: "Springen", min: 0, max: 40, step: 1, einheit: "px" },
];

interface FrontSektionProps {
  anim: AnimEinstellungen;
  setAnim: (a: AnimEinstellungen) => void;
}

export function FrontSektion({ anim, setAnim }: FrontSektionProps) {
  return (
    <>
      <div className="rke-hilfe">
        Partikelwolke der Fließfront aus 3 Schichten: Gischt (klein, schnell, prescht weit vor),
        Schaum (mittel, reitet auf der Front), Nachlauf (driftet zurück). Größe/Tempo/Weg streuen pro
        Partikel. Die Breite ist fest an den Fluss gekoppelt.
      </div>
      {REGLER_BLASEN.map((r) => (
        <Regler key={r.key} r={r} anim={anim} setAnim={setAnim} />
      ))}
      <div className="rke-row">
        <button onClick={() => setAnim({ ...ANIM_DEFAULTS })}>Animation zurücksetzen</button>
      </div>
    </>
  );
}
