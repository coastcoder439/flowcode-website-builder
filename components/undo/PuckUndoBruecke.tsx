"use client";

/*
 * PuckUndoBruecke.tsx — U6: Puck-History-Bridge (docs/plan-analyse/lens-undo.md
 * §2.3, fixt N4). Station 2 (Puck) bekommt einen EIGENEN Undo-Scope, der NICHT
 * einen zweiten Befehl-Stapel fuehrt, sondern an Pucks interne Historie
 * DELEGIERT (BusAdapter, coalesce.ts §2.3). „Kein Nachbau von Pucks Undo — nur
 * Anschluss."
 *
 * WARUM das den N4-Fight aufloest:
 * N4 war ein Drei-Ebenen-Kampf um Strg+Z im Puck-Editor — natives Textarea-
 * Zeichen-Undo vs. Pucks History-Undo vs. unser globaler Editor-Handler, der
 * „auf derselben Station mitlas". Nach dem Phase-1-Shell-Umbau ist der Animator
 * (GrafikEditor mit dem globalen Strg+Z-Handler, GrafikEditor.tsx) auf der
 * Puck-Station GAR NICHT mehr gemountet — UNSER globaler Handler ist dort also
 * schon strukturell INAKTIV (Scope-Grenze). Es bleibt aber ein ZWEITER Kaempfer:
 *
 *   Puck registriert SELBST einen globalen Strg+Z-/Strg+Y-Hotkey (0.22:
 *   monitorHotkeys(document) in der Bubble-Phase, node_modules/@puckeditor/core
 *   .../chunk-KJQTOPIV.mjs; useRegisterHistorySlice → useHotkey(ctrl+z, back)).
 *   Dieser Hotkey prueft NICHT, ob der Fokus in einem Textfeld sitzt — er feuert
 *   in JEDEM Fall history.back(). Und history.back() stellt einen KOMPLETTEN
 *   alten AppState wieder her (Daten + `ui.itemSelector`, tidyState in
 *   chunk-KJQTOPIV.mjs:804). Tippt man also in das HtmlBlock-Textfeld (eine
 *   `type:"textarea"`-Feld-Textarea im Props-Panel, HAUPT-Dokument) und drueckt
 *   Strg+Z, macht Pucks Hotkey einen Block-/Daten-Undo UND setzt dabei die
 *   Auswahl auf den Vor-Tipp-Snapshot zurueck (meist gar keine Auswahl → das
 *   Props-Panel springt auf „Page", das Sidebar-Tab auf „Blocks"). Genau der
 *   beobachtete N4-„springt-auf-leer"-Sprung.
 *
 * DIE BEHEBUNG (§2.4, Textfeld-Zeile): ein Capture-Phasen-Tastatur-Guard auf
 * dem Haupt-Dokument. Sitzt der Fokus in einem Textfeld (der U3-Guard
 * sollUndoShortcutGreifen liefert dort „nicht greifen") und ist die Taste ein
 * Undo-/Redo-Kuerzel, stoppen wir die Weitergabe an Pucks Bubble-Hotkey per
 * stopImmediatePropagation — OHNE preventDefault. So laeuft das native
 * Zeichen-Undo des Feldes ungestoert, Pucks history.back() feuert NICHT, die
 * Block-Auswahl bleibt. Ausserhalb eines Textfelds tun wir nichts → Pucks
 * Block-Undo greift wie gehabt.
 *
 * Warum Capture: Pucks Hotkey haengt in der Bubble-Phase an `document`. Ein
 * Bubble-Listener von uns kaeme (Registrier-Reihenfolge) NACH Pucks — zu spaet.
 * In der Capture-Phase laufen wir vor jedem Bubble-Listener und koennen den
 * Puck-Hotkey gezielt aussperren. stopImmediatePropagation stoppt nur die
 * Listener-Weitergabe, NICHT die Default-Aktion (natives Feld-Undo) — DOM-
 * Semantik: nur preventDefault wuerde diese abbrechen, das tun wir bewusst nicht.
 *
 * Zusaetzlich meldet die Bruecke dem Bus, dass auf der Puck-Station der aktive
 * Scope an Pucks Historie delegiert. So ist das Undo-Modell ueber alle vier
 * Stationen EINS (ein Scope-Vertrag), und ein spaeter (Design-Lens, §5)
 * ergaenzter Shell-Undo-Knopf / ein zentrales Strg+Z wuerde auf dieser Station
 * automatisch Pucks back()/forward() bedienen — ohne Pucks Handler zu verdoppeln.
 *
 * Mount-Punkt: als `overrides.puck` von <Puck> (SeitenBereich.tsx). Puck rendert
 * diesen Override als <CustomPuck>{default-UI}</CustomPuck> INNERHALB seines
 * Store-Providers — daher ist `usePuck()` hier verfuegbar, und `children` ist die
 * komplette Default-Chrome, die wir unveraendert durchreichen (layout-neutral,
 * wie Pucks DefaultOverride).
 *
 * Der Override MUSS eine STABILE Komponenten-Referenz sein (nicht inline pro
 * Render neu erzeugt): Puck merkt sich `overrides.puck` via useMemo und rendert
 * es als Komponenten-TYP. Eine neue Funktions-Identitaet pro Render wuerde diese
 * Komponente bei jedem Render neu mounten und damit den pushScope/popScope-Effekt
 * durchpruegeln. Deshalb wird PuckUndoBruecke als benannte Modul-Komponente
 * direkt gesetzt (`overrides={{ puck: PuckUndoBruecke }}`), nicht als
 * `({children}) => <PuckUndoBruecke>…`.
 */

import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import { createUsePuck } from "@puckeditor/core";
import { useUndoBus, sollUndoShortcutGreifen, type BusAdapter } from "./UndoBus";

/** Puck fuehrt keine per-Schritt-Labels — ein generisches Label reicht fuer die
 *  Statuszeile („Rückgängig: <label>"). */
const PUCK_LABEL = "Baustein-Änderung";

/* Selektor-Hook (Puck 0.22 empfohlen ggue. dem selektor-losen usePuck(): weniger
   Rerenders, keine Konsolen-Warnung). Modul-Ebene, damit die Hook-Identitaet
   stabil ist. Wir abonnieren nur die vier benoetigten history-Felder — jedes
   fuer sich snapshot-stabil (Funktions-Referenzen bzw. Booleans), daher kein
   React-„getSnapshot"-Problem. Optional-Chaining haelt den R-b-Fallback: fehlt
   `history` in einer kuenftigen Puck-Version, liefern die Selektoren undefined
   statt zu werfen. */
const usePuckState = createUsePuck();

/** Wrapper um Pucks Default-Chrome, der Station 2 an den Undo-Bus anschliesst.
 *  Rendert `children` (die komplette Default-Puck-UI) unveraendert. */
export function PuckUndoBruecke({ children }: { children: ReactNode }): ReactElement {
  const bus = useUndoBus();
  const back = usePuckState((s) => s.history?.back);
  const forward = usePuckState((s) => s.history?.forward);
  const hasPast = usePuckState((s) => s.history?.hasPast === true);
  const hasFuture = usePuckState((s) => s.history?.hasFuture === true);

  /* Die abonnierten history-Felder aendern sich mit jeder Bearbeitung. Der
     Bruecken-Adapter wird aber nur EINMAL (beim pushScope) im Scope-Speicher
     registriert — er liest den jeweils aktuellen Stand ueber diesen Ref, nie
     einen eingefrorenen. */
  const historyRef = useRef({ back, forward, hasPast, hasFuture });
  historyRef.current = { back, forward, hasPast, hasFuture };

  const pushScope = bus?.pushScope;
  const popScope = bus?.popScope;

  /* N4-Behebung: Pucks eigenen globalen Undo-/Redo-Hotkey im Textfeld
     aussperren (siehe Datei-Kopf). Haengt NICHT am Bus (rein Puck-bezogen,
     greift auch ohne Provider). Einmalig fuer die Lebensdauer des Editors. */
  useEffect(() => {
    /* Erkennt Pucks Undo-/Redo-Kombinationen: Strg/Cmd+Z (Undo),
       Strg/Cmd+Umschalt+Z und Strg/Cmd+Y (Redo). Pucks Hotkey-Katalog
       (chunk-KJQTOPIV.mjs:908-913) deckt genau diese ab. */
    const istUndoRedoKuerzel = (e: KeyboardEvent): boolean => {
      if (!(e.ctrlKey || e.metaKey)) return false;
      const taste = e.key.toLowerCase();
      return taste === "z" || taste === "y";
    };
    const aufKeyDownCapture = (e: KeyboardEvent) => {
      if (!istUndoRedoKuerzel(e)) return;
      /* sollUndoShortcutGreifen === false ⇒ Fokus in Textarea/Text-Input/
         contentEditable → natives Zeichen-Undo soll greifen, Pucks Bubble-
         Hotkey darf NICHT feuern. stopImmediatePropagation (Capture) sperrt
         ihn aus, ohne die Default-Aktion (Feld-Undo) abzubrechen. Ausserhalb
         eines Textfelds (true) tun wir nichts → Pucks Block-Undo greift. */
      if (!sollUndoShortcutGreifen(e.target)) {
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("keydown", aufKeyDownCapture, true);
    return () => document.removeEventListener("keydown", aufKeyDownCapture, true);
  }, []);

  useEffect(() => {
    if (!pushScope || !popScope) return;

    /* Bruecken-Adapter: delegiert an Pucks eigene Historie statt einen zweiten
       Befehl-Stapel zu fuehren. R-b-Fallback: fehlt/abweicht die API (kein
       back/forward, keine hasPast/hasFuture), liefert der Adapter canUndo/
       canRedo=false und undo/redo sind No-Ops → Pucks natives Strg+Z bleibt
       voellig ungestoert (kein Bridge-Zwang). */
    const adapter: BusAdapter = {
      undo: () => {
        const h = historyRef.current;
        if (typeof h.back !== "function" || !h.hasPast) return null;
        h.back();
        return PUCK_LABEL;
      },
      redo: () => {
        const h = historyRef.current;
        if (typeof h.forward !== "function" || !h.hasFuture) return null;
        h.forward();
        return PUCK_LABEL;
      },
      canUndo: () => historyRef.current.hasPast,
      canRedo: () => historyRef.current.hasFuture,
    };

    pushScope("puck", adapter);
    return () => {
      popScope();
    };
  }, [pushScope, popScope]);

  return <>{children}</>;
}
