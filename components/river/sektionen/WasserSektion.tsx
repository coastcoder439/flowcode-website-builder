"use client";

/*
 * WasserSektion – Inhalt des früheren Fluss-Editor-Reiters „Wasser"
 * (Wellen/Glitzer/Ufer), aus RiverKursEditor.tsx herausgelöst (Welle 2b-1,
 * verhaltensgleich). Bekommt anim/setAnim aus dem RiverKurs-Context.
 *
 * Der „Animation zurücksetzen"-Knopf lag früher als EIN geteilter Knopf unter
 * dem jeweils aktiven Reiter (Wasser/Front/Nebel). Beim Zerlegen wandert er in
 * jede der drei Sektionen — Wirkung identisch (setAnim(ANIM_DEFAULTS) setzt
 * ALLE Animationswerte zurück), aber jede Sektion bleibt selbsttragend und in
 * beiden Oberflächen (altes Panel + /editor) einsetzbar.
 */

import { ANIM_DEFAULTS, type AnimEinstellungen } from "../RiverKursContext";
import { Regler, type AnimRegler } from "./Regler";

/** Regler des „Wasser"-Reiters (Wellen/Glitzer/Ufer). */
const REGLER_WASSER: AnimRegler[] = [
  { key: "breathPeriodS", label: "Wellen-Atmung", min: 0.5, max: 20, step: 0.5, einheit: "s" },
  { key: "sparkleTrailDurS", label: "Glitzer-Tempo", min: 10, max: 300, step: 5, einheit: "s" },
  { key: "sparklePerTrail", label: "Glitzer pro Spur", min: 0, max: 40, step: 1, einheit: "" },
  { key: "sparkleFlashS", label: "Aufblitzen", min: 0.2, max: 10, step: 0.1, einheit: "s" },
  { key: "bankStrokePx", label: "Sandufer-Breite", min: 0, max: 160, step: 2, einheit: "px" },
];

interface WasserSektionProps {
  anim: AnimEinstellungen;
  setAnim: (a: AnimEinstellungen) => void;
}

export function WasserSektion({ anim, setAnim }: WasserSektionProps) {
  return (
    <>
      <div className="rke-hilfe">Wellen-Atmung, Glitzer und Sandufer.</div>
      <label className="rke-row">
        <input
          type="checkbox"
          checked={anim.sparkleMode === "dezent"}
          onChange={(e) => setAnim({ ...anim, sparkleMode: e.target.checked ? "dezent" : "aus" })}
        />
        Glitzer an
      </label>
      {REGLER_WASSER.map((r) => (
        <Regler key={r.key} r={r} anim={anim} setAnim={setAnim} />
      ))}
      <div className="rke-row">
        <button onClick={() => setAnim({ ...ANIM_DEFAULTS })}>Animation zurücksetzen</button>
      </div>
    </>
  );
}
