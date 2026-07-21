"use client";

/*
 * BackdropContext – Brücke zwischen der Backdrop-Auswahl (BackdropAuswahl,
 * sitzt im Panel BEIDER Editoren) und den Editor-Seiten (/grafik-editor,
 * /fluss-editor), die daraus entscheiden, ob HomePage die echte Landing oder
 * den Backdrop-Slot rendert (s. app/page.tsx).
 *
 * GLEICHES MUSTER wie GrafikContext/RiverKursContext: React-Context statt
 * Prop-Drilling durch GrafikEditor/RiverKursEditor hindurch — beide Editoren
 * bekommen ihren EIGENEN <BackdropProvider> (s. jeweilige page.tsx), der
 * Zustand ist also NICHT seitenübergreifend live (kein Tab-Sync), sondern
 * lädt beim Öffnen aus IndexedDB — bewusst einfach, ein Tab-Sync-Mechanismus
 * wäre für dieses interne Tool über das Ziel hinaus.
 *
 * Auf der echten Landing (/) existiert kein Provider — dort wird dieser
 * Context nie gebraucht, HomePage bekommt dort schlicht kein backdrop-Prop.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { backdropLaden, backdropSpeichern } from "./backdrop-store";
import type { Backdrop } from "./backdrop-types";

interface BackdropCtx {
  /** null = keiner gewaehlt bzw. "Zurück zur echten Seite". */
  backdrop: Backdrop | null;
  /** Setzt UND persistiert (IndexedDB) — Aufrufer muss nichts weiter tun. */
  setBackdrop: (b: Backdrop | null) => void;
  /** true, solange der gemerkte Backdrop noch aus IndexedDB geladen wird —
   *  verhindert, dass die Seite kurz "echte Landing" aufblitzt, bevor der
   *  gespeicherte Backdrop eintrifft. */
  laedt: boolean;
}

const Ctx = createContext<BackdropCtx | null>(null);

export function useBackdropCtx(): BackdropCtx | null {
  return useContext(Ctx);
}

export function BackdropProvider({ children }: { children: ReactNode }) {
  const [backdrop, setBackdropState] = useState<Backdrop | null>(null);
  const [laedt, setLaedt] = useState(true);

  useEffect(() => {
    let tot = false;
    void backdropLaden().then((b) => {
      if (!tot) {
        setBackdropState(b);
        setLaedt(false);
      }
    });
    return () => {
      tot = true;
    };
  }, []);

  const setBackdrop = (b: Backdrop | null) => {
    setBackdropState(b);
    void backdropSpeichern(b);
  };

  return <Ctx.Provider value={{ backdrop, setBackdrop, laedt }}>{children}</Ctx.Provider>;
}
