/*
 * coalesce.ts — Reine (React-freie) Kern-Logik des Undo-Bus.
 *
 * Die Coalesce-/Limit-/Gruppen-/Zukunft-Invalidierungs-Mechanik ist 1:1 aus
 * components/grafik/GrafikContext.tsx (Funktion `commit`, ~Z. 148-168) hierher
 * GEHOBEN — Umzug, kein Neubau: gleiches 600 ms-Fenster, gleicher
 * Gruppen-Schluessel, gleiches Limit 50, gleiche Zukunft-Invalidierung. Der
 * einzige Unterschied zur Vorlage: der Bus fuehrt domaenenunabhaengige
 * `Befehl`e (undo/redo als Closures) statt konkreter {grafiken, uebernommen}-
 * Snapshots — die Stapel-Buchfuehrung selbst ist identisch.
 *
 * Bewusst OHNE React/JSX, damit die Logik per
 * `node scripts/tests/undo-bus.test.mjs` direkt pruefbar ist; UndoBus.tsx ist
 * nur die duenne React-Bindung darum (haelt diesen Speicher in einem Ref und
 * spiegelt canUndo/canRedo als State fuer Rerenders).
 */

/** Maximale Stapeltiefe je Scope — wie GrafikContext VERLAUF_LIMIT. Ein
 *  Snapshot/Befehl ist billig (nur Closures/Array-Referenzen), auch 50 tief. */
export const VERLAUF_LIMIT = 50;

/** Coalesce-Fenster in ms — wie GrafikContext VERLAUF_COALESCE_MS. Aenderungen
 *  an DERSELBEN Gruppe (Regler ziehen, tippen) innerhalb dieses Fensters
 *  werden zu EINEM Verlaufseintrag zusammengefasst; sonst waere ein Slider-Zug
 *  hunderte Schritte lang. Diskrete Aktionen (ohne Gruppe) coalescen nie. */
export const VERLAUF_COALESCE_MS = 600;

/** Ein undo-barer Schritt, domaenenunabhaengig (Grafik, Fluss, Backdrop, Pool,
 *  Puck …). `undo` stellt den Vor-Zustand her, `redo` den Nach-Zustand — beide
 *  als Closures ueber den jeweiligen Snapshot (s. Ziel-Architektur §2.1). */
export interface Befehl {
  /** Statuszeile: „Rückgängig: <label>". */
  label: string;
  /** Coalesce-Schluessel (600 ms). Ohne Gruppe: immer ein eigener Eintrag
   *  (diskrete Aktionen wie Löschen/Duplizieren). Producer praefixen ihre
   *  Schluessel domaenenspezifisch (z. B. „grafik:opacity:<id>"), damit nicht
   *  ueber Domaenengrenzen hinweg coalesct wird (Risiko R-f). */
  gruppe?: string;
  undo: () => void;
  redo: () => void;
}

/** Befehl mit Buchfuehrungs-Zeitstempel (ms) des letzten Commits seiner
 *  Gruppe — nur intern fuers Coalesce-Fenster relevant. */
export interface StapelEintrag extends Befehl {
  zeit: number;
}

/** Ein Rückgängig-/Wiederholen-Stapelpaar EINES Scopes. Immutabel gefuehrt:
 *  jede Operation liefert ein neues Paar zurueck (Coding-Style: keine
 *  In-place-Mutation). */
export interface Stapelpaar {
  rueckgaengig: StapelEintrag[];
  wiederholen: StapelEintrag[];
}

/** Leeres Stapelpaar (frischer Scope / nach resetHistory). */
export function leererStapel(): Stapelpaar {
  return { rueckgaengig: [], wiederholen: [] };
}

/**
 * Legt einen Befehl auf den Rückgängig-Stapel — mit Coalesce, Limit und
 * Zukunft-Invalidierung, 1:1 nach GrafikContext.commit.
 *
 * - Gleiche Gruppe + letzter Commit derselben Gruppe < 600 ms her → KEIN neuer
 *   Eintrag: die laufende Geste zaehlt weiter als EIN Schritt. Der
 *   urspruengliche `undo` (= Vor-Zustand vor der ersten Aenderung) bleibt das
 *   Rückgängig-Ziel; der `redo` wird auf den NEUESTEN Nach-Zustand nachgezogen
 *   (in der Vorlage wird der Redo-Stand live beim Undo gelesen — hier explizit
 *   als Closure gefuehrt, semantisch aequivalent).
 * - Sonst neuer Eintrag; ueberschreitet der Stapel VERLAUF_LIMIT, faellt der
 *   aelteste weg.
 * - Jede neue (nicht coalesc-te) Aktion macht die „Zukunft" (Wiederholen)
 *   ungueltig — Standardverhalten jedes Undo-Managers.
 */
export function pushMitCoalesce(paar: Stapelpaar, befehl: Befehl, jetzt: number): Stapelpaar {
  const { rueckgaengig, wiederholen } = paar;
  const oben = rueckgaengig[rueckgaengig.length - 1];

  if (
    befehl.gruppe &&
    oben &&
    oben.gruppe === befehl.gruppe &&
    jetzt - oben.zeit < VERLAUF_COALESCE_MS
  ) {
    /* Laufende Geste: Fenster verlaengern, KEIN neuer Eintrag. Der Wiederholen-
       Stapel bleibt unberuehrt (die Geste laeuft ja gerade, es gibt keine neu
       zu invalidierende Zukunft im Sinne der Vorlage). */
    const neuOben: StapelEintrag = { ...oben, zeit: jetzt, redo: befehl.redo };
    return {
      rueckgaengig: [...rueckgaengig.slice(0, -1), neuOben],
      wiederholen,
    };
  }

  const eintrag: StapelEintrag = { ...befehl, zeit: jetzt };
  let neu = [...rueckgaengig, eintrag];
  if (neu.length > VERLAUF_LIMIT) neu = neu.slice(neu.length - VERLAUF_LIMIT);
  return { rueckgaengig: neu, wiederholen: [] };
}

/** Ergebnis eines Undo-/Redo-Schritts: das neue Stapelpaar plus der bewegte
 *  Eintrag (null = nichts da). Der AUFRUFER ruft `eintrag.undo()`/`.redo()` —
 *  diese Funktionen halten die Stapel-Buchfuehrung frei von Seiteneffekten. */
export interface SchrittErgebnis {
  paar: Stapelpaar;
  eintrag: StapelEintrag | null;
}

/** Nimmt den obersten Rückgängig-Eintrag herunter und legt ihn (unter Limit)
 *  auf den Wiederholen-Stapel. Ruft SELBST kein undo() — das macht der Bus. */
export function undoSchritt(paar: Stapelpaar): SchrittErgebnis {
  const rueckgaengig = [...paar.rueckgaengig];
  const eintrag = rueckgaengig.pop();
  if (!eintrag) return { paar, eintrag: null };
  let wiederholen = [...paar.wiederholen, eintrag];
  if (wiederholen.length > VERLAUF_LIMIT) wiederholen = wiederholen.slice(wiederholen.length - VERLAUF_LIMIT);
  return { paar: { rueckgaengig, wiederholen }, eintrag };
}

/** Spiegelbild von undoSchritt: obersten Wiederholen-Eintrag zurueck auf den
 *  Rückgängig-Stapel. Ruft SELBST kein redo() — das macht der Bus. */
export function redoSchritt(paar: Stapelpaar): SchrittErgebnis {
  const wiederholen = [...paar.wiederholen];
  const eintrag = wiederholen.pop();
  if (!eintrag) return { paar, eintrag: null };
  let rueckgaengig = [...paar.rueckgaengig, eintrag];
  if (rueckgaengig.length > VERLAUF_LIMIT) rueckgaengig = rueckgaengig.slice(rueckgaengig.length - VERLAUF_LIMIT);
  return { paar: { rueckgaengig, wiederholen }, eintrag };
}

/* --- Scope-Speicher (Stations-Segmentierung, Ziel-Architektur §2.3) -------
 *
 * EIN Bus-Abstraktum, aber pro Station EIN Scope; Ctrl+Z wirkt immer nur auf
 * den AKTIVEN Scope. Der Speicher fuehrt die Scopes als Stapel (pushScope/
 * popScope) — Wechsel Animator→Puck→Animator reaktiviert den bestehenden
 * Scope samt Historie, statt sie zu vermischen (Risiko R-d). Ein Scope kann
 * statt eines eigenen Befehl-Stapels an eine fremde Historie DELEGIEREN
 * (BusAdapter, z. B. Puck-History-Bridge in U6).
 *
 * Bewusst mutabler Closure-Speicher (nicht React-State): er aendert sich oft
 * (jeder Regler-Tick), soll aber nicht selbst rerendern — genau die Begruendung
 * der Ref-Stapel in GrafikContext. Die React-Bindung (UndoBus.tsx) spiegelt nur
 * die zwei Verfuegbarkeits-Booleans als State.
 */

/** Bruecken-Scope: delegiert undo/redo an eine fremde Historie (z. B. Pucks
 *  `usePuck().history`), statt einen eigenen Befehl-Stapel zu fuehren. Fehlt
 *  der Adapter, fuehrt der Scope den normalen Stapel. */
export interface BusAdapter {
  undo: () => string | null;
  redo: () => string | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/** Reine, React-freie Scope-Mechanik des Bus — von UndoBus.tsx umschlossen und
 *  von den Unit-Tests direkt geprueft. */
export interface ScopeSpeicher {
  push: (b: Befehl) => void;
  undo: () => string | null;
  redo: () => string | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  resetHistory: () => void;
  pushScope: (id: string, adapter?: BusAdapter) => void;
  popScope: () => void;
  aktiverScope: () => string | null;
}

export function erzeugeScopeSpeicher(): ScopeSpeicher {
  /* Befehl-Stapel je Scope-Id (bleiben ueber popScope hinweg erhalten, damit
     ein spaeteres pushScope desselben Scopes die Historie wiederfindet). */
  const stapel = new Map<string, Stapelpaar>();
  /* Bruecken-Adapter je Scope-Id (nur fuer delegierende Scopes gesetzt). */
  const adapter = new Map<string, BusAdapter>();
  /* Aktiv-Stapel der Scope-Ids; oberster = aktiver Scope. */
  let aktiv: string[] = [];

  const aktuelleId = (): string | null => aktiv[aktiv.length - 1] ?? null;

  return {
    push(b: Befehl): void {
      const id = aktuelleId();
      if (!id) return; // kein aktiver Scope → nirgends aufzuzeichnen
      if (adapter.has(id)) return; // Bruecken-Scope fuehrt eigene Historie
      const paar = stapel.get(id) ?? leererStapel();
      stapel.set(id, pushMitCoalesce(paar, b, Date.now()));
    },

    undo(): string | null {
      const id = aktuelleId();
      if (!id) return null;
      const bruecke = adapter.get(id);
      if (bruecke) return bruecke.undo();
      const paar = stapel.get(id);
      if (!paar) return null;
      const { paar: neu, eintrag } = undoSchritt(paar);
      if (!eintrag) return null;
      stapel.set(id, neu);
      eintrag.undo();
      return eintrag.label;
    },

    redo(): string | null {
      const id = aktuelleId();
      if (!id) return null;
      const bruecke = adapter.get(id);
      if (bruecke) return bruecke.redo();
      const paar = stapel.get(id);
      if (!paar) return null;
      const { paar: neu, eintrag } = redoSchritt(paar);
      if (!eintrag) return null;
      stapel.set(id, neu);
      eintrag.redo();
      return eintrag.label;
    },

    canUndo(): boolean {
      const id = aktuelleId();
      if (!id) return false;
      const bruecke = adapter.get(id);
      if (bruecke) return bruecke.canUndo();
      return (stapel.get(id)?.rueckgaengig.length ?? 0) > 0;
    },

    canRedo(): boolean {
      const id = aktuelleId();
      if (!id) return false;
      const bruecke = adapter.get(id);
      if (bruecke) return bruecke.canRedo();
      return (stapel.get(id)?.wiederholen.length ?? 0) > 0;
    },

    resetHistory(): void {
      const id = aktuelleId();
      if (!id) return;
      if (adapter.has(id)) return; // fremde Historie nicht anfassen
      stapel.set(id, leererStapel());
    },

    pushScope(id: string, ad?: BusAdapter): void {
      if (!stapel.has(id)) stapel.set(id, leererStapel());
      if (ad) adapter.set(id, ad);
      aktiv.push(id);
    },

    popScope(): void {
      aktiv.pop();
      /* Historie im `stapel`-Map bleibt bewusst erhalten (Scopes sind wenige,
         eine je Station) — Wiedereintritt findet den Stand wieder. */
    },

    aktiverScope(): string | null {
      return aktuelleId();
    },
  };
}
