"use client";

/*
 * RiverKursContext – Brücke zwischen dem Fluss-Editor (/fluss-editor) und
 * der Fluss-Engine (RiverFlow), OHNE die normale Landing-Page zu verändern:
 * auf der Landing existiert kein Provider → useRiverKurs() liefert null und
 * RiverFlow baut den Fluss aus seinen Standard-Knoten (gerader Fluss bzw.
 * später ein fest hinterlegter, von Leon exportierter Verlauf).
 *
 * Im Editor liefert der Provider:
 *  - nodes: die aktuell bearbeiteten Fluss-Knoten (SIND der Fluss)
 *  - live: die von der Engine zuletzt benutzten Knoten (Ausgangslage)
 *  - vollAufgedeckt: Reveal auf volle Höhe (optionale Editier-Hilfe)
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import riverConfigJson from "../../river.config.json";
import type { RiverGeometry, RiverNode } from "./river-types";

/** Alle Stellschrauben der SVG-Animation (Spiegel der Animations-Werte aus
 *  river.config.json). Im Editor live änderbar und wird mit dem Verlauf
 *  gespeichert/exportiert — auf der Landing gelten die Config-Werte. */
export interface AnimEinstellungen {
  /** Wellen-Atmung: Dauer einer vollen Hin-und-Her-Bewegung (Sekunden). */
  breathPeriodS: number;
  /** Glitzer/Blubberblasen an oder aus. */
  sparkleMode: "dezent" | "aus";
  /** Blasen pro Spur (3 Spuren). */
  sparklePerTrail: number;
  /** Umlaufdauer einer Spur (Sekunden) — kleiner = schnellere Blasen. */
  sparkleTrailDurS: number;
  /** Sichtbarkeitsdauer eines Aufblitzens (Sekunden). */
  sparkleFlashS: number;
  /** Sandufer-Breite (Design-px). */
  bankStrokePx: number;
  /* Fließfront-Partikel. Die BREITE ist bewusst KEIN Regler — sie ist fest
     an die Flussbreite gekoppelt (Kundenvorgabe). */
  /** Partikelanzahl. */
  foamCount: number;
  /** Vorpresch-Weg in Kanalmitte (Design-px). */
  foamLeadPx: number;
  /** Tempo-Faktor aller Partikel-Zyklen. */
  foamSpeed: number;
  /** Größen-Faktor der Partikel. */
  foamSizeK: number;
  /** Sprung-Weg (wirkt in alle Richtungen). */
  foamJitterPx: number;
  /* Nebelkante an der Fließfront — eigene Schicht, getrennt von den
     Partikeln (deckt die Clip-Kante zu). */
  mistCount: number;
  mistSizePx: number;
  mistOpacity: number;
  mistSpeed: number;
  mistBlurPx: number;
}

const cfg = riverConfigJson as unknown as {
  breath: { periodS: number };
  sparkle: { mode: string; perTrail: number; trailDurS: number; flashS: number };
  bank: { strokePx: number };
};

/** Startwerte = exakt die Kundenwerte aus river.config.json. */
export const ANIM_DEFAULTS: AnimEinstellungen = {
  breathPeriodS: cfg.breath.periodS,
  sparkleMode: cfg.sparkle.mode === "aus" ? "aus" : "dezent",
  sparklePerTrail: cfg.sparkle.perTrail,
  sparkleTrailDurS: cfg.sparkle.trailDurS,
  sparkleFlashS: cfg.sparkle.flashS,
  bankStrokePx: cfg.bank.strokePx,
  foamCount: 90,
  foamLeadPx: 34,
  foamSpeed: 1,
  foamSizeK: 1,
  foamJitterPx: 10,
  mistCount: 9,
  mistSizePx: 26,
  mistOpacity: 0.5,
  mistSpeed: 1,
  mistBlurPx: 7,
};

interface RiverKursCtx {
  nodes: RiverNode[] | null;
  setNodes: (n: RiverNode[] | null) => void;
  live: RiverNode[] | null;
  setLive: (n: RiverNode[]) => void;
  vollAufgedeckt: boolean;
  setVollAufgedeckt: (v: boolean) => void;
  anim: AnimEinstellungen;
  setAnim: (a: AnimEinstellungen) => void;
  /** Aufgelöste Fluss-Geometrie des letzten RiverFlow-Rebuilds (kompletter
   *  Rückgabewert von buildRiverGeometry, riverPath.ts) — Grundlage für den
   *  selbsttragenden Snapshot-Export (behebt den Export-Bug: der alte Export
   *  enthielt nur Rohknoten, keinen fertigen Fluss). Anders als
   *  river.config.json/riverPath.ts sind das bereits FERTIGE Pfad-Strings,
   *  die 1:1 reproduzieren, was gerade gezeichnet wird. */
  liveGeometrie: RiverGeometry | null;
  setLiveGeometrie: (g: RiverGeometry | null) => void;
  /** Aufgelöste CSS-Farbwerte (Wasser-/Sandufer-/Grün-Töne — echte
   *  Hex-Strings) desselben Rebuilds — zusammen mit liveGeometrie der
   *  1:1-Garant, unabhängig von der Umgebung des Empfängers. */
  liveFarben: Record<string, string> | null;
  setLiveFarben: (f: Record<string, string> | null) => void;
}

const Ctx = createContext<RiverKursCtx | null>(null);

export function useRiverKurs(): RiverKursCtx | null {
  return useContext(Ctx);
}

export function RiverKursProvider({ children }: { children: ReactNode }) {
  const [nodes, setNodes] = useState<RiverNode[] | null>(null);
  const [live, setLive] = useState<RiverNode[] | null>(null);
  /* Default AUS: der Editor zeigt die ORIGINALE Scroll-Animation des
     Flusses inkl. Vorhang/Tropfen — sonst editiert Leon einen Zustand,
     den es auf der Seite nie gibt. */
  const [vollAufgedeckt, setVollAufgedeckt] = useState(false);
  const [anim, setAnim] = useState<AnimEinstellungen>(ANIM_DEFAULTS);
  const [liveGeometrie, setLiveGeometrie] = useState<RiverGeometry | null>(null);
  const [liveFarben, setLiveFarben] = useState<Record<string, string> | null>(null);
  return (
    <Ctx.Provider
      value={{
        nodes,
        setNodes,
        live,
        setLive,
        vollAufgedeckt,
        setVollAufgedeckt,
        anim,
        setAnim,
        liveGeometrie,
        setLiveGeometrie,
        liveFarben,
        setLiveFarben,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
