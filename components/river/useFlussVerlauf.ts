"use client";

/*
 * useFlussVerlauf – der Rückgängig/Wiederholen-PRODUZENT des FLUSSES.
 *
 * FRÜHER (Welle 2c-1): ein zweiter, physisch getrennter Snapshot-Stapel neben
 * dem Grafik-Stapel, gedispatcht von einem fokusbasierten Router — genau die
 * Föderation, die N8/M11 verursachte (ein Strg+Z ging ENTWEDER an Fluss ODER an
 * Grafik, nie chronologisch an „die letzte Aktion").
 *
 * SEIT U2 (docs/plan-analyse/lens-undo.md §2.2, §3-U2): der Fluss ist nur noch
 * PRODUZENT auf dem EINEN gemeinsamen Undo-Bus. `commit` erzeugt einen
 * domänenunabhängigen `Befehl` ({nodes, anim}-Snapshot-Closures) und legt ihn
 * auf den Bus (aktiver Scope „animator" — derselbe, den auch der Grafik-Produzent
 * bedient). `undo/redo/canUndo/canRedo/resetHistory` delegieren dorthin. Damit
 * macht Strg+Z chronologisch die LETZTE Aktion rückgängig, egal ob Grafik oder
 * Fluss zuletzt dran war — der Fokus-Router entfällt (GrafikEditor ruft
 * bus.undo()/redo() direkt).
 *
 * SNAPSHOT-UMFANG unverändert: nodes + anim. Die PROFIL-Liste (localStorage) ist
 * bewusst NICHT dabei — Profile sind Persistenz, kein Canvas-Zustand.
 *
 * COALESCE unverändert: 600-ms-Fenster, Gruppen-Schlüssel, Limit 50 — jetzt
 * zentral im Bus (components/undo/coalesce.ts). Der Produzent PRÄFIXT seine
 * Gruppen-Schlüssel mit „fluss:" (Risiko R-f), damit eine laufende Fluss-Geste
 * nie versehentlich mit einem gleichnamigen Grafik-Befehl auf DEMSELBEN Scope
 * zusammengefasst wird.
 *
 * WARUM weiterhin ein eigener Hook (statt in RiverKursContext): RiverKursContext
 * ist die Engine-Brücke, die AUCH die Landing speist. Undo/Redo ist reiner
 * /editor-Oberflächenzustand (genau die Trennung, die FlussObjektContext bereits
 * für den Fokus zieht). Der Hook lebt daher in useFlussKnoten, wo alle
 * mutierenden Fluss-Ops liegen (die Commit-Punkte) und wo der zu sichernde
 * Zustand (nodes + anim) ohnehin vorliegt.
 *
 * GEMEINSAMER Redo-Halter je Geste (s. commit): Der Nach-Zustand wird — wie in
 * der alten Mechanik — erst BEIM Undo live eingefangen. Der Bus behält beim
 * Zusammenfassen (Coalesce) das `undo` des ERSTEN Befehls, übernimmt aber das
 * `redo` des NEUESTEN. Damit das überlebende `redo` denselben eingefangenen Stand
 * liest, teilen sich alle Befehle EINER Geste EINEN Halter (identisch zum
 * Grafik-Produzenten, GrafikContext.tsx).
 */

import { useCallback, useRef } from "react";
import { useUndoBus, type Befehl } from "../undo/UndoBus";
import { VERLAUF_COALESCE_MS } from "../undo/coalesce";
import type { AnimEinstellungen } from "./RiverKursContext";
import type { RiverNode } from "./river-types";

/** Der zu sichernde Fluss-Canvas-Zustand: Knoten + Animationswerte. */
export interface FlussVerlaufZustand {
  nodes: RiverNode[];
  anim: AnimEinstellungen;
}

export interface FlussVerlaufSteuerung {
  /** Sichert den AKTUELLEN (Vor-Änderungs-)Zustand als Befehl auf dem Bus —
   *  IMMER VOR der eigentlichen Änderung aufrufen. `gruppe` gesetzt + letzter
   *  Commit derselben (fluss-präfixierten) Gruppe < 600 ms her → der Bus fasst
   *  zusammen (die laufende Geste zählt weiter als EIN Schritt). `zustand`
   *  überschreibt den live gelesenen Vor-Zustand — für den Knoten-Zug (Drag),
   *  der erst beim Loslassen committet, mit dem am Zug-Start gemerkten Stand. */
  commit: (label: string, gruppe?: string, zustand?: FlussVerlaufZustand) => void;
  /** Macht die letzte Aktion des aktiven Bus-Scopes rückgängig, gibt ihr Label
   *  zurück (für die Statuszeile) — null, wenn nichts da ist. Domänenübergreifend
   *  (Grafik ODER Fluss), da der Bus EINE chronologische Timeline führt. */
  undo: () => string | null;
  redo: () => string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Leert die Historie des aktiven Scopes — z.B. beim IMPORT eines Profils aus
   *  Datei: ein Rückgängig über einen Import hinweg würde in einen fremden Stand
   *  springen (analog resetHistory bei Setup-Wechsel im Grafik-Editor). */
  resetHistory: () => void;
}

/** Live-Stand + Setter, in einem Ref gehalten, damit die commit-Callbacks stabil
 *  bleiben (leere Deps) und die Fenster-Listener/Effekte in useFlussKnoten sich
 *  nicht bei jedem Regler-Tick neu ab-/anmelden, aber trotzdem immer den frischen
 *  Stand sehen. Die Befehl-Closures (undo/redo) lesen daraus den jüngsten Stand. */
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
  /* Der gemeinsame Undo-Bus (in /editor über der Shell gemountet, aktiver Scope
     „animator"). null, falls kein Provider darüber hängt — dann bleibt der Fluss
     ohne Historie (commit/undo werden zu No-Ops); passiert im Editor nicht, ist
     aber ein defensiver Schutz (z.B. alte Route ohne UndoBusProvider). */
  const bus = useUndoBus();

  const liveRef = useRef<LiveRef>({ nodes, anim, setNodes, setAnim });
  liveRef.current = { nodes, anim, setNodes, setAnim };

  /* Gemeinsamer Redo-Halter der laufenden Coalesce-Geste (gleiche Gruppe im
     600-ms-Fenster) — s. Datei-Kopf. Fenster/Konstante identisch zum Bus
     (VERLAUF_COALESCE_MS), damit Halter-Wiederverwendung und Bus-Zusammenfassung
     deckungsgleich bleiben. */
  const gestenHalterRef = useRef<{
    gruppe: string;
    zeit: number;
    halter: { nach: FlussVerlaufZustand | null };
  } | null>(null);

  const commit = useCallback(
    (label: string, gruppe?: string, zustand?: FlussVerlaufZustand) => {
      if (!bus) return;
      const live = liveRef.current;
      const vor =
        zustand ?? (live.nodes && live.anim ? { nodes: live.nodes, anim: live.anim } : null);
      /* Noch kein Fluss vorhanden (nodes/anim nicht bereit) → nichts Sinnvolles
         zu sichern, still aussteigen. */
      if (!vor) return;
      const jetzt = Date.now();

      /* Halter der laufenden Geste wiederverwenden (gleiche Gruppe im Fenster),
         sonst einen frischen anlegen; ohne Gruppe (diskrete Aktion) die Geste
         beenden, damit ein folgender gruppierter Commit frisch startet. Der
         Vergleich läuft über die ROH-Gruppe (Halter ist produzenten-intern). */
      let halter: { nach: FlussVerlaufZustand | null };
      const laufend = gestenHalterRef.current;
      if (gruppe && laufend && laufend.gruppe === gruppe && jetzt - laufend.zeit < VERLAUF_COALESCE_MS) {
        halter = laufend.halter;
        laufend.zeit = jetzt;
      } else {
        halter = { nach: null };
        gestenHalterRef.current = gruppe ? { gruppe, zeit: jetzt, halter } : null;
      }

      const befehl: Befehl = {
        label,
        /* Domänen-Präfix „fluss:" (Risiko R-f): der Bus coalesct nur bei
           gleicher Gruppe — das Präfix verhindert das Zusammenfassen mit einem
           gleichnamigen Grafik-Befehl auf demselben „animator"-Scope. */
        gruppe: gruppe ? `fluss:${gruppe}` : undefined,
        undo: () => {
          /* Vor dem Zurücksetzen den aktuellen (Nach-)Zustand fürs spätere Redo
             einfangen — exakt das „Live-Lesen beim Undo" der alten Mechanik. */
          const jetztLive = liveRef.current;
          if (jetztLive.nodes && jetztLive.anim) {
            halter.nach = { nodes: jetztLive.nodes, anim: jetztLive.anim };
          }
          jetztLive.setNodes?.(vor.nodes);
          jetztLive.setAnim?.(vor.anim);
        },
        redo: () => {
          const nach = halter.nach;
          if (!nach) return;
          const jetztLive = liveRef.current;
          jetztLive.setNodes?.(nach.nodes);
          jetztLive.setAnim?.(nach.anim);
        },
      };
      bus.push(befehl);
    },
    [bus],
  );

  /* undo/redo/canUndo/canRedo/resetHistory delegieren an den aktiven Scope des
     Bus (in /editor: „animator"). Rückgabe von undo/redo = Label für die
     Statuszeile, null wenn nichts da ist — identisch zur alten Signatur. */
  const undo = useCallback((): string | null => bus?.undo() ?? null, [bus]);
  const redo = useCallback((): string | null => bus?.redo() ?? null, [bus]);

  const resetHistory = useCallback(() => {
    bus?.resetHistory();
    gestenHalterRef.current = null;
  }, [bus]);

  return {
    commit,
    undo,
    redo,
    canUndo: bus?.canUndo ?? false,
    canRedo: bus?.canRedo ?? false,
    resetHistory,
  };
}
