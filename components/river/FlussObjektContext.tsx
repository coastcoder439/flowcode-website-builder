"use client";

/*
 * FlussObjektContext – macht den Fluss auf /editor zu einem OBJEKT im
 * gemeinsamen Grafik-Panel (Welle 2b-1, docs/editor-vereinheitlichung.md §1).
 * Hält ZWEI Dinge zentral, damit Grafik-Panel (Ebenen-Eintrag + „Bild"-Reiter)
 * und Handle-Ebene (FlussHandlesEbene) DIESELBE Quelle teilen:
 *   - `fokus`: hat das Fluss-Objekt gerade den Bearbeitungs-Fokus? Nur dann
 *     sind die Knoten-Handles aktiv und der „Bild"-Reiter zeigt die
 *     Fluss-Sektionen. Die gegenseitige Ausschließlichkeit mit der
 *     Grafik-Auswahl (Bauvorlage §1) verdrahtet GrafikEditor (dort liegen
 *     beide Contexts vor).
 *   - `steuerung`: die komplette Fluss-Maschinerie (useFlussKnoten).
 *
 * WARUM ein eigener Provider (nicht in RiverKursContext): RiverKursContext ist
 * die Daten-/Engine-Brücke (Knoten, Animation, Geometrie). Der EDITOR-Fokus
 * ist reiner Oberflächenzustand von /editor — er gehört nicht in die
 * Engine-Brücke, die auch die Landing speist. Auf der alten Route
 * (RiverKursEditor) gibt es diesen Provider bewusst NICHT: dort sind die
 * Handles immer sichtbar, es gibt keinen konkurrierenden Grafik-Fokus.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFlussKnoten, type FlussKnotenSteuerung } from "./useFlussKnoten";
import { sollUndoShortcutGreifen } from "@/components/undo/UndoBus";

interface FlussObjektCtx {
  /** Hat das Fluss-Objekt den Bearbeitungs-Fokus? */
  fokus: boolean;
  setFokus: (v: boolean) => void;
  /** Die Fluss-Maschinerie (null, solange kein RiverKurs-Provider da ist). */
  steuerung: FlussKnotenSteuerung | null;
}

const Ctx = createContext<FlussObjektCtx | null>(null);

/** Liefert null außerhalb des Providers (z.B. auf der alten Route oder der
 *  Landing) — Aufrufer behandeln das als „kein Fluss-Objekt vorhanden". */
export function useFlussObjekt(): FlussObjektCtx | null {
  return useContext(Ctx);
}

export function FlussObjektProvider({ children }: { children: ReactNode }) {
  const steuerung = useFlussKnoten();
  const [fokus, setFokus] = useState(false);

  /* Stabiler Zugriff auf die aktuelle Steuerung für die Fenster-Listener unten
     — useFlussKnoten gibt bei jedem Render ein neues Objekt zurück, ein Ref
     verhindert das ständige Ab-/Anmelden der Listener. */
  const steuerungRef = useRef(steuerung);
  steuerungRef.current = steuerung;

  /* Fokus verloren → eingeloggten Knoten ausloggen. Sonst bliebe das
     Scrollrad an einen unsichtbaren Fluss-Knoten gekapert, obwohl der Nutzer
     längst eine Grafik ausgewählt hat (Risiko 8: Mausrad-Wirkung muss zum
     fokussierten Objekttyp passen). setGelockt aus useState ist stabil. */
  const setGelockt = steuerung?.setGelockt;
  useEffect(() => {
    if (!fokus && setGelockt) setGelockt(null);
  }, [fokus, setGelockt]);

  /* Typ-abhängige Entf-Taste (Bauvorlage §5, Risiko 8): bei Fluss-Fokus UND
     eingeloggtem Knoten löscht Entf/Backspace genau diesen Knoten — über die
     bestehende Knoten-Lösch-Logik (knotenLoeschen, Minimum 2 Knoten). Die
     Grafik-Entf-Logik bleibt unangetastet: bei Fluss-Fokus ist keine Grafik
     ausgewählt, ihr Handler ist also ohnehin ein No-Op. Textfeld-Fokus wird
     respektiert; die Capture-Guards des Grafik-Editors (Crop/Freistellen)
     laufen bei Fluss-Fokus nicht (sie brauchen eine ausgewählte Grafik). */
  useEffect(() => {
    if (!fokus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      /* In einem Textfeld löscht Entf ein Zeichen, keinen Knoten — zentraler
         Guard (U3, §2.4): Textfeld → nativ, Slider/Bühne → Knoten löschen. */
      if (!sollUndoShortcutGreifen(e.target)) return;
      const s = steuerungRef.current;
      if (!s || s.gelockt === null) return;
      e.preventDefault();
      s.knotenLoeschen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fokus]);

  return <Ctx.Provider value={{ fokus, setFokus, steuerung }}>{children}</Ctx.Provider>;
}
