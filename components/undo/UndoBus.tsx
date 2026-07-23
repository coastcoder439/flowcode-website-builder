"use client";

/*
 * UndoBus.tsx — EINE kohaerente Undo-Architektur (Ziel-Architektur §2), duenne
 * React-Bindung um den reinen Scope-Speicher aus coalesce.ts.
 *
 * Statt vier voneinander getrennter Undo-Welten (Grafik-, Fluss-, Puck-,
 * Backdrop-Stapel) mit fokusbasiertem Router gibt es EINEN Bus: eine
 * chronologische Befehl-Timeline pro Station (Scope). Ctrl+Z wirkt immer nur
 * auf den AKTIVEN Scope. Der Bus haelt keine Stapel selbst, sondern spiegelt
 * nur canUndo/canRedo/aktiverScope als State (fuer Knopf-Zustaende/Rerenders);
 * die eigentliche Buchfuehrung lebt im mutablen Closure-Speicher (Ref), genau
 * aus dem Rerender-Grund der Ref-Stapel in GrafikContext.
 *
 * STAND U0: nur das Geruest. Noch NIRGENDS gemountet — App-Verhalten
 * unveraendert. Producer (Grafik/Fluss/Backdrop/Pool) und die Mount-Punkte
 * folgen in U1 ff.
 */

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  type Befehl,
  type BusAdapter,
  type ScopeSpeicher,
  erzeugeScopeSpeicher,
} from "./coalesce";

export type { Befehl, BusAdapter } from "./coalesce";
export { sollUndoShortcutGreifen, istEingabeFokussiert } from "./fokus-guard";

/** Oeffentlicher Bus-Vertrag (Ziel-Architektur §2.1). `canUndo`/`canRedo`/
 *  `aktiverScope` sind React-State (loesen Rerender aus); alles andere sind
 *  stabile Callbacks. */
export interface UndoBus {
  /** Legt einen Befehl auf den aktiven Scope (ersetzt alle heutigen commit()). */
  push: (b: Befehl) => void;
  /** Macht die letzte Aktion des aktiven Scopes rueckgaengig, gibt ihr Label
   *  zurueck (Statuszeile) — null, wenn nichts da ist. */
  undo: () => string | null;
  redo: () => string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Leert die Historie des aktiven Scopes (z. B. bei Setup-Wechsel). */
  resetHistory: () => void;
  /** Aktiviert einen Stations-Scope (optional als Bruecke an eine fremde
   *  Historie, z. B. Puck). Bestehende Scope-Historie bleibt erhalten. */
  pushScope: (id: string, adapter?: BusAdapter) => void;
  /** Verlaesst den obersten Scope, der darunterliegende wird wieder aktiv. */
  popScope: () => void;
  aktiverScope: string | null;
}

const Ctx = createContext<UndoBus | null>(null);

/** Liefert den Bus — null, wenn kein Provider darueber haengt (wie useGrafiken:
 *  Seiten ohne Editor bleiben unberuehrt). */
export function useUndoBus(): UndoBus | null {
  return useContext(Ctx);
}

export function UndoBusProvider({ children }: { children: ReactNode }) {
  /* Der reine Speicher lebt genau einmal pro Provider-Instanz in einem Ref
     (aendert sich oft, soll nicht selbst rerendern). */
  const speicherRef = useRef<ScopeSpeicher | null>(null);
  if (speicherRef.current === null) speicherRef.current = erzeugeScopeSpeicher();
  const speicher = speicherRef.current;

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [aktiverScope, setAktiverScope] = useState<string | null>(null);

  /* Nach jeder Operation die drei State-Spiegel aus dem Speicher nachziehen. */
  const sync = useCallback(() => {
    setCanUndo(speicher.canUndo());
    setCanRedo(speicher.canRedo());
    setAktiverScope(speicher.aktiverScope());
  }, [speicher]);

  const push = useCallback(
    (b: Befehl) => {
      speicher.push(b);
      sync();
    },
    [speicher, sync],
  );

  const undo = useCallback((): string | null => {
    const label = speicher.undo();
    sync();
    return label;
  }, [speicher, sync]);

  const redo = useCallback((): string | null => {
    const label = speicher.redo();
    sync();
    return label;
  }, [speicher, sync]);

  const resetHistory = useCallback(() => {
    speicher.resetHistory();
    sync();
  }, [speicher, sync]);

  const pushScope = useCallback(
    (id: string, adapter?: BusAdapter) => {
      speicher.pushScope(id, adapter);
      sync();
    },
    [speicher, sync],
  );

  const popScope = useCallback(() => {
    speicher.popScope();
    sync();
  }, [speicher, sync]);

  const wert: UndoBus = {
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
    pushScope,
    popScope,
    aktiverScope,
  };

  return <Ctx.Provider value={wert}>{children}</Ctx.Provider>;
}
