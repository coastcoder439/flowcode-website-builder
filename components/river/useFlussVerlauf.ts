"use client";

/*
 * useFlussVerlauf – der Rückgängig/Wiederholen-Verlauf des FLUSSES
 * (Welle 2c-1, docs/editor-vereinheitlichung.md §3, löst Risiko 2 additiv).
 *
 * BAUGLEICH zum ausgereiften Grafik-Verlauf (GrafikContext.tsx): Limit 50,
 * Coalesce-Fenster 600 ms, Gruppen-Schlüssel zum Zusammenfassen einer
 * laufenden Geste (Regler ziehen, Wheel-Zug), EIN Zug = EIN Commit. Der
 * Grafik-Verlauf wird bewusst NICHT angefasst — dieser hier ist ein zweiter,
 * eigener Stapel für den Fluss, sodass Knoten-Ops erstmals rückgängig werden,
 * ohne die etablierte Grafik-Coalesce-Logik zu riskieren.
 *
 * SNAPSHOT-UMFANG: nodes + anim. Die PROFIL-Liste (localStorage) ist bewusst
 * NICHT dabei — Profile sind Persistenz, kein Canvas-Zustand (Bauvorlage §3a).
 *
 * WARUM ein eigener Hook statt in RiverKursContext: RiverKursContext ist die
 * Engine-Brücke, die AUCH die Landing speist. Undo/Redo ist reiner
 * /editor-Oberflächenzustand (genau die Trennung, die FlussObjektContext
 * bereits für den Fokus zieht). Der Hook lebt daher in useFlussKnoten, wo auch
 * alle mutierenden Fluss-Ops liegen (die Commit-Punkte) und wo der zu
 * sichernde Zustand (nodes + anim aus dem RiverKurs-Context) ohnehin
 * vorliegt — kein zusätzlicher Durchgriff nötig.
 *
 * STABILITÄT: commit/undo/redo lesen den Live-Stand (nodes/anim + Setter) aus
 * EINEM Ref statt aus der Closure — so bleiben die Callbacks stabil (leere
 * Deps) und die Fenster-Listener/Effekte in useFlussKnoten müssen sich nicht
 * bei jedem Regler-Tick neu ab-/anmelden, sehen aber trotzdem immer den
 * frischen Stand. (GrafikContext erreicht dasselbe über die Provider-Closure,
 * die bei jeder State-Änderung neu bindet; hier ist der Ref der passendere Weg,
 * weil die Consumer den Verlauf über die Steuerung einbinden.)
 */

import { useCallback, useRef, useState } from "react";
import type { AnimEinstellungen } from "./RiverKursContext";
import type { RiverNode } from "./river-types";

/** Baugleich zu GrafikContext: 50 Schritte tief, 600 ms Coalesce-Fenster. */
const VERLAUF_LIMIT = 50;
const VERLAUF_COALESCE_MS = 600;

/** Der zu sichernde Fluss-Canvas-Zustand: Knoten + Animationswerte. */
export interface FlussVerlaufZustand {
  nodes: RiverNode[];
  anim: AnimEinstellungen;
}

interface FlussVerlaufEintrag extends FlussVerlaufZustand {
  /** Kurzbeschreibung für die Statuszeile ("Rückgängig (Fluss): <label>"). */
  label: string;
  /** Gruppierungsschlüssel zum Zusammenfassen schneller Folgeänderungen
   *  (z.B. "fluss-breite:<idx>"). Ohne Gruppe: immer ein eigener Eintrag
   *  (diskrete Aktionen wie Knoten hinzufügen/löschen). */
  gruppe?: string;
  /** Zeitstempel (ms) des letzten Commits in dieser Gruppe. */
  zeit: number;
}

export interface FlussVerlaufSteuerung {
  /** Sichert den AKTUELLEN (Vor-Änderungs-)Zustand — IMMER VOR der eigentlichen
   *  Änderung aufrufen. `gruppe` gesetzt + letzter Commit derselben Gruppe
   *  < 600 ms her → kein neuer Eintrag (die laufende Geste zählt weiter als EIN
   *  Schritt). `zustand` überschreibt den live gelesenen Vor-Zustand — für den
   *  Knoten-Zug (Drag), der erst beim Loslassen committet, mit dem am Zug-Start
   *  gemerkten Stand. */
  commit: (label: string, gruppe?: string, zustand?: FlussVerlaufZustand) => void;
  /** Macht den letzten Verlaufseintrag rückgängig, gibt sein Label zurück
   *  (für die Statuszeile) — null, wenn nichts da ist. */
  undo: () => string | null;
  redo: () => string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Leert beide Stapel — z.B. beim IMPORT eines Profils aus Datei: ein
   *  Rückgängig über einen Import hinweg würde in einen fremden Stand springen
   *  (analog resetHistory bei Setup-Wechsel im Grafik-Editor). */
  resetHistory: () => void;
}

/** Live-Stand + Setter, in einem Ref gehalten (s. Datei-Kopf, "STABILITÄT"). */
interface LiveRef {
  nodes: RiverNode[] | null;
  anim: AnimEinstellungen | null;
  setNodes: ((n: RiverNode[]) => void) | undefined;
  setAnim: ((a: AnimEinstellungen) => void) | undefined;
}

export function useFlussVerlauf(
  nodes: RiverNode[] | null,
  anim: AnimEinstellungen | null,
  setNodes: ((n: RiverNode[]) => void) | undefined,
  setAnim: ((a: AnimEinstellungen) => void) | undefined,
): FlussVerlaufSteuerung {
  /* Stapel in Refs (nicht State): ändern sich oft (jeder Regler-Tick), sollen
     aber NICHT bei jeder Änderung neu rendern — nur die zwei
     Verfügbarkeits-Booleans unten sind fürs UI (Knopf-Zustand) relevant. */
  const rueckgaengigStapel = useRef<FlussVerlaufEintrag[]>([]);
  const wiederholenStapel = useRef<FlussVerlaufEintrag[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const liveRef = useRef<LiveRef>({ nodes, anim, setNodes, setAnim });
  liveRef.current = { nodes, anim, setNodes, setAnim };

  const aktualisiereVerfuegbarkeit = useCallback(() => {
    setCanUndo(rueckgaengigStapel.current.length > 0);
    setCanRedo(wiederholenStapel.current.length > 0);
  }, []);

  const commit = useCallback(
    (label: string, gruppe?: string, zustand?: FlussVerlaufZustand) => {
      const live = liveRef.current;
      const basis =
        zustand ?? (live.nodes && live.anim ? { nodes: live.nodes, anim: live.anim } : null);
      /* Noch kein Fluss vorhanden (nodes/anim nicht bereit) → nichts Sinnvolles
         zu sichern, still aussteigen. */
      if (!basis) return;
      const jetzt = Date.now();
      const stapel = rueckgaengigStapel.current;
      const oben = stapel[stapel.length - 1];
      if (gruppe && oben && oben.gruppe === gruppe && jetzt - oben.zeit < VERLAUF_COALESCE_MS) {
        /* Laufende Geste: Fenster verlängern, KEIN neuer Eintrag — der
           ursprüngliche "vorher"-Stand bleibt das Rückgängig-Ziel. */
        oben.zeit = jetzt;
        return;
      }
      stapel.push({ ...basis, label, gruppe, zeit: jetzt });
      if (stapel.length > VERLAUF_LIMIT) stapel.shift();
      /* Jede neue Aktion macht die "Zukunft" ungültig (Standard jedes
         Undo-Managers). */
      wiederholenStapel.current = [];
      aktualisiereVerfuegbarkeit();
    },
    [aktualisiereVerfuegbarkeit],
  );

  const undo = useCallback((): string | null => {
    const eintrag = rueckgaengigStapel.current.pop();
    if (!eintrag) return null;
    const live = liveRef.current;
    if (live.nodes && live.anim) {
      wiederholenStapel.current.push({
        nodes: live.nodes,
        anim: live.anim,
        label: eintrag.label,
        zeit: Date.now(),
      });
      if (wiederholenStapel.current.length > VERLAUF_LIMIT) wiederholenStapel.current.shift();
    }
    live.setNodes?.(eintrag.nodes);
    live.setAnim?.(eintrag.anim);
    aktualisiereVerfuegbarkeit();
    return eintrag.label;
  }, [aktualisiereVerfuegbarkeit]);

  const redo = useCallback((): string | null => {
    const eintrag = wiederholenStapel.current.pop();
    if (!eintrag) return null;
    const live = liveRef.current;
    if (live.nodes && live.anim) {
      rueckgaengigStapel.current.push({
        nodes: live.nodes,
        anim: live.anim,
        label: eintrag.label,
        zeit: Date.now(),
      });
      if (rueckgaengigStapel.current.length > VERLAUF_LIMIT) rueckgaengigStapel.current.shift();
    }
    live.setNodes?.(eintrag.nodes);
    live.setAnim?.(eintrag.anim);
    aktualisiereVerfuegbarkeit();
    return eintrag.label;
  }, [aktualisiereVerfuegbarkeit]);

  const resetHistory = useCallback(() => {
    rueckgaengigStapel.current = [];
    wiederholenStapel.current = [];
    aktualisiereVerfuegbarkeit();
  }, [aktualisiereVerfuegbarkeit]);

  return { commit, undo, redo, canUndo, canRedo, resetHistory };
}
