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
import { useUndoBus } from "../undo/UndoBus";

interface BackdropCtx {
  /** null = keiner gewaehlt bzw. "Zurück zur echten Seite". */
  backdrop: Backdrop | null;
  /** Setzt UND persistiert (IndexedDB) — Aufrufer muss nichts weiter tun.
   *  DIREKTPFAD OHNE HISTORIE: fuer programmatische Wechsel (Self-Heal,
   *  Fallback), die NICHT per Strg+Z rueckgaengig sein sollen. Nutzer-Wechsel
   *  in der BackdropAuswahl laufen ueber setBackdropMitUndo (U4). */
  setBackdrop: (b: Backdrop | null) => void;
  /** Wie setBackdrop (setzt + persistiert), legt aber zusaetzlich einen
   *  undo-baren Befehl auf den gemeinsamen Undo-Bus (M12, lens-undo.md §2.2):
   *  Strg+Z stellt den VORIGEN Backdrop wieder her (statt — mangels Historie —
   *  faelschlich die letzte Grafik-Platzierung zurueckzunehmen). undo/redo
   *  fuehren die IndexedDB-Persistenz ueber DENSELBEN setBackdrop-Pfad mit, damit
   *  State und Speicher nicht divergieren (Risiko R-c). Ohne Bus (kein Provider
   *  darueber) faellt der Aufruf still auf reines Setzen zurueck. */
  setBackdropMitUndo: (b: Backdrop | null, label: string) => void;
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

  /* Der gemeinsame Undo-Bus (in /editor ueber der Shell gemountet, aktiver
     Scope „animator" waehrend der Animator-Station). null, falls kein Provider
     darueber haengt — dann bleibt der Backdrop-Wechsel ohne Historie
     (setBackdropMitUndo verhaelt sich wie setBackdrop); defensiv, im Editor tritt
     das nicht auf. */
  const bus = useUndoBus();

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

  /* Direktpfad: setzt + persistiert, OHNE Historie — fuer programmatische
     Wechsel (Self-Heal / Fallback). undo/redo aus setBackdropMitUndo rufen
     bewusst DIESEN Pfad, damit die IndexedDB-Persistenz auch beim Rueckgaengig-
     machen mitlaeuft (Risiko R-c). Er push't SELBST nichts auf den Bus → kein
     Rekursions-/Doppel-Eintrag beim undo/redo. */
  const setBackdrop = (b: Backdrop | null) => {
    setBackdropState(b);
    void backdropSpeichern(b);
  };

  /* Undo-barer Nutzer-Wechsel (M12): den ALTEN Backdrop einfangen, den neuen
     setzen und einen diskreten Befehl (keine Gruppe → nie coalesct) auf den
     aktiven Scope legen. undo/redo verschieben nur zwischen zwei bekannten
     Staenden — ueber den setBackdrop-Direktpfad, also inkl. Persistenz. */
  const setBackdropMitUndo = (b: Backdrop | null, label: string) => {
    const alt = backdrop;
    setBackdrop(b);
    bus?.push({
      label,
      undo: () => setBackdrop(alt),
      redo: () => setBackdrop(b),
    });
  };

  return (
    <Ctx.Provider value={{ backdrop, setBackdrop, setBackdropMitUndo, laedt }}>{children}</Ctx.Provider>
  );
}
