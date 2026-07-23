/*
 * fokus-guard.ts — EIN zentraler Fokus-Guard des Undo-Bus (Ziel-Architektur
 * §2.4, fixt N9). Bisher lag die „feuert ein Tastenkürzel jetzt oder nicht?"-
 * Regel DOPPELT und zu grob im Code:
 *   - components/grafik/GrafikEditor.tsx  (istEingabeFokussiert)
 *   - components/river/FlussObjektContext.tsx (inEingabefeld, wortgleiches Duplikat)
 * Beide gaben für JEDES <input> `true` zurück — auch für einen `type="range"`-
 * Regler. Dadurch verschluckte ein fokussierter Slider das Strg+Z (N9), obwohl
 * ein Slider gar kein natives Zeichen-Undo hat.
 *
 * Hier zentral und DIFFERENZIERT (§2.4):
 *   sollUndoShortcutGreifen(target)  → für die Undo-/Redo-/Entf-/Einfüge-Kürzel:
 *     Textfelder (Textcursor) → false  = Bus greift NICHT, natives Zeichen-Undo
 *     Slider/Checkbox/Button/… → true  = Bus greift (N9 gefixt)
 *   istEingabeFokussiert(target)     → BREITERE Regel, unverändert wie zuvor:
 *     jedes INPUT/TEXTAREA/contentEditable → true. Nur noch für die Tasten mit
 *     nativer Formular-Bedeutung (Pfeile: Slider-Wert/Cursor; Esc) gebraucht,
 *     damit U3 die dokumentierte Invariante feature-inventar §5.8/§5.9
 *     („globale Shortcuts feuern nie in einem Eingabefeld", native Pfeil-/Entf-
 *     Bedienung des Feldes bleibt erhalten) NICHT bricht. Ein pauschales
 *     Umbiegen der Pfeiltasten auf sollUndoShortcutGreifen würde die native
 *     Slider-Bedienung (Pfeil = Wert ±) kapern — bewusst vermieden.
 *
 * Bewusst OHNE React/DOM-Bindung (reine Klassifizierung per Duck-Typing statt
 * `instanceof HTMLElement`), damit die Regeln per
 * `node scripts/tests/fokus-guard.test.mjs` ohne Browser prüfbar sind.
 */

/** Die für die Guard-Entscheidung nötigen Felder eines Fokus-Ziels. */
interface FokusInfo {
  /** Grossgeschriebener Tag-Name, z. B. "INPUT", "TEXTAREA", "SELECT". */
  tag: string;
  /** Kleingeschriebener input-Typ ("range", "text", …) — "" für Nicht-Inputs. */
  typ: string;
  /** Steht der Cursor in einem contentEditable-Bereich (Rich-Text)? */
  contentEditable: boolean;
}

/** input-Typen OHNE Textcursor: hier hat das Feld kein natives Zeichen-Undo,
 *  also darf der Bus greifen (§2.4). Alles andere (`text`, `search`, `url`,
 *  `email`, `tel`, `password`, `number`, `date`, …) zählt als Textfeld. */
const BUS_INPUT_TYPEN: ReadonlySet<string> = new Set([
  "range",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
]);

/** Liest die Klassifizierungs-Felder aus einem EventTarget. null, wenn das Ziel
 *  gar kein Element ist (Window/Document/Bühnen-Root) — dort greift der Bus.
 *  Duck-Typing statt `instanceof HTMLElement`, damit ohne DOM testbar. */
function leseFokus(target: EventTarget | null): FokusInfo | null {
  const kandidat = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown } | null;
  if (!kandidat || typeof kandidat.tagName !== "string") return null;
  return {
    tag: kandidat.tagName,
    typ: typeof kandidat.type === "string" ? kandidat.type.toLowerCase() : "",
    contentEditable: kandidat.isContentEditable === true,
  };
}

/** Reine Entscheidung „greift der Bus bei diesem Fokus?" — für Unit-Tests
 *  direkt mit einer FokusInfo aufrufbar. */
export function greiftBusBei(fokus: FokusInfo | null): boolean {
  if (!fokus) return true; // kein Element (Bühne/Body/Window) → Bus greift
  if (fokus.contentEditable) return false; // Rich-Text → natives Zeichen-Undo
  if (fokus.tag === "TEXTAREA") return false; // mehrzeilig → natives Zeichen-Undo
  if (fokus.tag === "INPUT") return BUS_INPUT_TYPEN.has(fokus.typ);
  // SELECT, Buttons, Bühnen-Elemente, alles Übrige → Bus greift.
  return true;
}

/**
 * Soll das Undo-/Redo-/Entf-/Einfüge-Kürzel vom Bus (bzw. der Editor-Logik)
 * behandelt werden — statt dem Feld sein natives Verhalten zu lassen?
 *
 * - Textfeld/Textarea/contentEditable → `false`: Feld behält Zeichen-Undo,
 *   Zeichen-Löschen, native Einfüge-Behandlung.
 * - Slider (`range`)/Checkbox/Radio/Button/Select/Bühne/Body → `true`:
 *   der Bus greift. Fixt N9 (Slider schluckte Strg+Z).
 */
export function sollUndoShortcutGreifen(target: EventTarget | null): boolean {
  return greiftBusBei(leseFokus(target));
}

/**
 * Breiterer Guard (unveränderte Alt-Semantik von istEingabeFokussiert/
 * inEingabefeld): true, sobald der Fokus in IRGENDEINEM Eingabefeld sitzt
 * (jedes INPUT — auch Slider —, TEXTAREA oder contentEditable).
 *
 * Nur für Tasten gedacht, die im fokussierten Feld eine native Bedeutung haben
 * und dort NICHT vom Editor gekapert werden dürfen: Pfeiltasten (Slider-Wert,
 * Zahl-Spinner, Textcursor) und Esc. So bleibt die feature-inventar-§5.8/§5.9-
 * Invariante erhalten, während Strg+Z/Entf über sollUndoShortcutGreifen den
 * Slider-Sonderfall (N9) korrekt behandeln.
 */
export function istEingabeFokussiert(target: EventTarget | null): boolean {
  const fokus = leseFokus(target);
  if (!fokus) return false;
  return fokus.tag === "INPUT" || fokus.tag === "TEXTAREA" || fokus.contentEditable;
}
