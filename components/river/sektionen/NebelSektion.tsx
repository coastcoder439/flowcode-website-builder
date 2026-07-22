"use client";

/*
 * NebelSektion – Inhalt des früheren Fluss-Editor-Reiters „Nebel"
 * (Wolkenkante über der Front), aus RiverKursEditor.tsx herausgelöst
 * (Welle 2b-1, verhaltensgleich). Bekommt anim/setAnim aus dem
 * RiverKurs-Context. Zum geteilten „Animation zurücksetzen"-Knopf s.
 * WasserSektion.tsx.
 */

import { ANIM_DEFAULTS, type AnimEinstellungen } from "../RiverKursContext";
import { Regler, type AnimRegler } from "./Regler";

/** Regler des „Nebel"-Reiters: die weiche Wolkenkante über der Front —
 *  bewusst getrennt von den Partikeln (Kundenvorgabe). */
const REGLER_NEBEL: AnimRegler[] = [
  { key: "mistCount", label: "Wolken", min: 0, max: 30, step: 1, einheit: "" },
  { key: "mistSizePx", label: "Wolkengröße", min: 4, max: 90, step: 2, einheit: "px" },
  { key: "mistOpacity", label: "Deckkraft", min: 0, max: 1, step: 0.05, einheit: "" },
  { key: "mistBlurPx", label: "Weichheit", min: 0, max: 24, step: 1, einheit: "px" },
  { key: "mistSpeed", label: "Waber-Tempo", min: 0.2, max: 4, step: 0.1, einheit: "×" },
];

interface NebelSektionProps {
  anim: AnimEinstellungen;
  setAnim: (a: AnimEinstellungen) => void;
}

export function NebelSektion({ anim, setAnim }: NebelSektionProps) {
  return (
    <>
      <div className="rke-hilfe">
        Weiche Wolkenkante ÜBER der Front — deckt die Schnittkante zu und gibt der Front Volumen.
        Läuft über ein CSS-blur() (GPU), nicht über teure SVG-Filter.
      </div>
      {REGLER_NEBEL.map((r) => (
        <Regler key={r.key} r={r} anim={anim} setAnim={setAnim} />
      ))}
      <div className="rke-row">
        <button onClick={() => setAnim({ ...ANIM_DEFAULTS })}>Animation zurücksetzen</button>
      </div>
    </>
  );
}
