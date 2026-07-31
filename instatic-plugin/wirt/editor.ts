/*
 * editor.ts — die Wirt-Schicht im EDITOR-Realm.
 *
 * Kapselt BP-01 (Schreibpfad), BP-02 (Anker-Klasse vergeben) und BP-04
 * (Keyframe-Ablage in Node-Props). Details, Volatilitaet und Bruch-Reaktion je
 * Punkt stehen in wirt/vertraege.ts — hier steht der Code.
 *
 * ============================================================================
 * DIE EINE REGEL, DIE HIER DURCHGESETZT WIRD
 * ============================================================================
 * Node-Props werden AUSSCHLIESSLICH ueber `store.updateNodeProps(...)`
 * geschrieben. NIE ueber `api.editor.store.transaction(...)`, NIE ueber
 * `setState`. Das ist kein Stilgeschmack, sondern der teuerste in H1 belegte
 * Fehlermodus:
 *
 *   `transaction` macht die Seite nie "schmutzig" -> die Schreibung landet
 *   nicht im Save-PUT (leerer `changedPages`-Array im mitgeschnittenen Body),
 *   ueberlebt keinen Reload und haengt nicht im Undo. ABER: sie ueberlebt
 *   DOCH, sobald irgendetwas anderes dieselbe Seite schmutzig macht
 *   ("Trittbrettfahrer-Effekt", dreimal unabhaengig reproduziert). Der Fehler
 *   ist damit SPORADISCH statt deterministisch — er faellt im Test nicht auf
 *   und beim Nutzer schon.
 *
 * `verboteneSchreibwege()` macht diese Regel maschinenlesbar; die Smoke-Suite
 * und ein spaeterer Lint koennen sie durchsetzen, statt sie nur zu dokumentieren.
 *
 * ============================================================================
 * TYPEN, ABER KEINE LAUFZEIT-ABHAENGIGKEIT
 * ============================================================================
 * Die Instatic-Importe hier sind `import type` — sie verschwinden beim
 * Kompilieren restlos. Dieses Modul zieht zur Laufzeit KEINE Zeile
 * Instatic-Code; es bekommt den Store uebergeben (aus
 * `api.editor.store.read()`), statt ihn sich zu holen. Das ist der Grund,
 * warum es ohne installiertes Plugin testbar bleibt.
 */

import type { StyleRule } from "./typen";
import { ankerStyleRuleName } from "./anker-vertrag";

/* ---------------------------------------------------------------------------
 * Der Store — nur der Ausschnitt, den wir wirklich brauchen
 * ------------------------------------------------------------------------- */

/**
 * Wir tippen NICHT gegen `EditorStore` aus dem Klon.
 *
 * Grund: `EditorStore` ist ein leeres Interface, das jede Slice-Datei per
 * `declare module` erweitert (s. store/types.ts:39). Dieser Trick funktioniert
 * nur INNERHALB des Instatic-Compilers — von aussen aufgeloest ist der Typ
 * leer und `store.updateNodeProps` waere ein Typfehler. Ein struktureller
 * Ausschnitt ist hier also nicht Bequemlichkeit, sondern der einzige Weg, der
 * traegt — und er hat den Nebeneffekt, dass genau hier steht, welche vier
 * Aktionen wir vom Wirt brauchen.
 */
export interface WirtStore {
  /** BP-01 — der EINZIGE erlaubte Schreibpfad fuer Node-Props. */
  updateNodeProps: (nodeId: string, patch: Record<string, unknown>) => void;
  /** BP-02 — Stilregel anlegen. Wirft, wenn der Name schon existiert. */
  createClass: (name: string, styles?: Record<string, unknown>) => StyleRule;
  /** BP-02 — Regel an einen Node haengen. */
  addNodeClass: (nodeId: string, classId: string) => void;
  /** BP-02 — Regel von einem Node loesen (fuer die Duplizieren-Heilung, H7). */
  removeNodeClass: (nodeId: string, classId: string) => void;
  /** Lesender Zugriff auf die Regel-Registry (Namens-Suche). */
  styleRules?: Record<string, StyleRule | undefined>;
}

/** Die Aktionen, ohne die die Wirt-Schicht nicht arbeiten kann. */
const PFLICHT_AKTIONEN = ["updateNodeProps", "createClass", "addNodeClass"] as const;

/**
 * Schreibwege, die es GIBT, die wir aber nie benutzen duerfen. Maschinenlesbar,
 * damit die Regel pruefbar ist statt nur dokumentiert (s. Kopfkommentar).
 */
export function verboteneSchreibwege(): { weg: string; grund: string }[] {
  return [
    {
      weg: "api.editor.store.transaction(...)",
      grund:
        "macht die Seite nie schmutzig -> nicht im Save-PUT, ueberlebt keinen Reload, nicht im Undo (H1). Ueberlebt sporadisch als Trittbrettfahrer — der teuerste Fehlermodus.",
    },
    {
      weg: "useEditorStore.setState(...)",
      grund: "umgeht mutateActiveTree und damit Dirty-Marker, Undo-Coalescing und Autosave (dieselbe Wirkung wie transaction).",
    },
    {
      weg: "node.props direkt mutieren",
      grund: "der Store friert seine Zustaende ein (mutative enableAutoFreeze); die Mutation wirft oder verpufft.",
    },
  ];
}

/** Wirft mit klarer Ansage, wenn der Wirt eine Pflicht-Aktion verloren hat. */
function pruefeStore(store: unknown): asserts store is WirtStore {
  if (!store || typeof store !== "object") {
    throw new Error("[fcank/wirt] BP-01: kein Editor-Store uebergeben (erwartet: api.editor.store.read()).");
  }
  const s = store as Record<string, unknown>;
  const fehlend = PFLICHT_AKTIONEN.filter((name) => typeof s[name] !== "function");
  if (fehlend.length > 0) {
    throw new Error(
      `[fcank/wirt] BP-01/BP-02: Der Instatic-Store hat ${fehlend.join(", ")} nicht (mehr). ` +
        "Das ist ein Wirt-Bruch, kein Bedienfehler. NICHT auf transaction/setState ausweichen — " +
        "das persistiert nachweislich nicht (H1). Auf dem gepinnten Stand bleiben (E4) und " +
        "scripts/70-wirt-smoke.mjs laufen lassen.",
    );
  }
}

/* ---------------------------------------------------------------------------
 * BP-01 — Schreibpfad
 * ------------------------------------------------------------------------- */

/**
 * BP-01: Der einzige Weg, wie unser Code Node-Props schreibt.
 *
 * `patch` wird flach in `node.props` gemerged (so arbeitet die Wirt-Aktion);
 * ein Key mit Wert `undefined` loescht nicht, er setzt `undefined` — wer
 * loeschen will, schreibt den Key mit `null` oder benutzt `grafikPatch(null)`.
 */
export function schreibeNodeProps(
  store: unknown,
  nodeId: string,
  patch: Record<string, unknown>,
): void {
  pruefeStore(store);
  if (!nodeId) throw new Error("[fcank/wirt] BP-01: nodeId fehlt.");
  store.updateNodeProps(nodeId, patch);
}

/* ---------------------------------------------------------------------------
 * BP-02 — Anker-Klasse vergeben
 * ------------------------------------------------------------------------- */

/** Sucht eine bestehende Stilregel ueber ihren Namen. */
function regelNachName(store: WirtStore, name: string): StyleRule | null {
  const registry = store.styleRules;
  if (!registry) return null;
  for (const regel of Object.values(registry)) {
    if (regel && (regel as { name?: string }).name === name) return regel;
  }
  return null;
}

/**
 * BP-02: Haengt den Anker `ankerId` an den Node.
 *
 * Zwei Schritte, weil Instatic sie trennt: eine Stilregel `fcank-<id>` muss
 * EXISTIEREN (sie liefert beim Rendern den Klassennamen), und ihre `id` muss
 * in `node.classIds` stehen. Der Node traegt nie den Namen, immer nur die Id.
 *
 * Idempotent: existiert die Regel schon, wird sie wiederverwendet
 * (`createClass` wuerde sonst werfen).
 *
 * Bewusst NICHT geloest: die in H2 belegte Duplizieren-Kollision
 * (`duplicateNode` uebernimmt classIds woertlich -> zwei Elemente mit
 * demselben Anker). Sie wird in der Laufzeit GEMESSEN (`ankerKollisionen`)
 * und gehoert geheilt in die Editor-Flaeche (H7) — eine automatische Heilung
 * hier wuerde beim Duplizieren still die Absicht des Nutzers aendern.
 */
export function setzeAnkerKlasse(store: unknown, nodeId: string, ankerId: string): string {
  pruefeStore(store);
  if (!nodeId) throw new Error("[fcank/wirt] BP-02: nodeId fehlt.");
  if (!ankerId) throw new Error("[fcank/wirt] BP-02: ankerId fehlt.");

  const name = ankerStyleRuleName(ankerId);
  const vorhanden = regelNachName(store, name);
  const regel = vorhanden ?? store.createClass(name);
  const classId = (regel as { id?: string }).id;
  if (!classId) {
    throw new Error(
      `[fcank/wirt] BP-02: createClass("${name}") hat keine Regel-Id geliefert. ` +
        "Der Rueckgabe-Vertrag von createClass hat sich geaendert — Wirt-Bruch.",
    );
  }
  store.addNodeClass(nodeId, classId);
  return classId;
}

/* ---------------------------------------------------------------------------
 * BP-04 — Keyframe-Ablage in Node-Props
 * ------------------------------------------------------------------------- */

/**
 * BP-04: Der Schluessel, unter dem unsere Grafik-/Keyframe-Daten in
 * `node.props` liegen.
 *
 * Warum das traegt: `node.props` ist ein offenes Record
 * (`baseNode.ts:55`), und `validateNodeProps` — der einzige Ort, der Props
 * gegen das Modul-Schema normalisiert — ERHAELT unbekannte Keys: der
 * Fast-Path gibt `rawProps` unveraendert zurueck, der Slow-Path merged
 * `{ ...rawProps, ...cleaned }`. Das ist dort ausdruecklich als Design-Zwang
 * dokumentiert ("Unknown/injected keys survive"), nicht als Zufall.
 *
 * Der Praefix `fcank` ist derselbe wie bei der Anker-Klasse — ein Namensraum
 * fuer alles, was von uns kommt, damit man es im Datenbestand des Nutzers
 * sofort erkennt und rueckstandsfrei entfernen kann.
 */
export const GRAFIK_PROP_SCHLUESSEL = "fcankGrafik";

/** Liest unsere Grafik-Daten aus einem Node-Props-Bag. */
export function liesGrafikAusNode(props: Record<string, unknown> | undefined): unknown {
  if (!props) return undefined;
  return props[GRAFIK_PROP_SCHLUESSEL];
}

/**
 * Baut den Patch fuer `schreibeNodeProps`. `null` entfernt unsere Daten
 * wieder — der Node bleibt ein normaler Instatic-Node zurueck.
 */
export function grafikPatch(grafik: unknown): Record<string, unknown> {
  return { [GRAFIK_PROP_SCHLUESSEL]: grafik ?? null };
}
