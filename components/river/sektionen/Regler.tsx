"use client";

/*
 * Regler – ein beschrifteter Schieberegler mit Live-Wert, aus
 * RiverKursEditor.tsx herausgelöst (Welle 2b-1). Geteilt von den
 * Animations-Sektionen Wasser/Front/Nebel. Rein darstellend: liest genau
 * einen Schlüssel aus den Animations-Einstellungen und meldet Änderungen per
 * setAnim zurück (Immutabilität: neues Objekt statt Mutation).
 */

import type { AnimEinstellungen } from "../RiverKursContext";

/** Ein Regler des Animations-Menüs. */
export interface AnimRegler {
  key: keyof AnimEinstellungen;
  label: string;
  min: number;
  max: number;
  step: number;
  einheit: string;
}

interface ReglerProps {
  r: AnimRegler;
  anim: AnimEinstellungen;
  setAnim: (a: AnimEinstellungen) => void;
}

export function Regler({ r, anim, setAnim }: ReglerProps) {
  const wert = anim[r.key] as number;
  return (
    <div className="rke-regler">
      <div className="rke-regler-kopf">
        <span>{r.label}</span>
        <span className="rke-wert">
          {Number.isInteger(wert) ? wert : wert.toFixed(2)}
          {r.einheit}
        </span>
      </div>
      <input
        type="range"
        min={r.min}
        max={r.max}
        step={r.step}
        value={wert}
        onChange={(e) => setAnim({ ...anim, [r.key]: Number(e.target.value) })}
      />
    </div>
  );
}
