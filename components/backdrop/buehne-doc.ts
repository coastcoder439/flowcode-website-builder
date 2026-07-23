/*
 * buehne-doc.ts – Registry der LEBENDIGEN Bühne (I8/M8, Spec
 * docs/plan-analyse/lens-import.md §2-Ziel).
 *
 * PROBLEM: Der Animator zeigt eine importierte Seite bisher als eingefrorene
 * <Render>-Puck-Bühne INLINE im Editor-Dokument — die data-og-id-Anker der
 * Bausteine liegen dann im selben `document` und der OG-Anker-Mechanismus
 * (WebsiteOg.tsx / GrafikEditor.tsx) findet sie per `document.querySelector`.
 *
 * Für die lebendige Bühne (Backdrop.tsx: BackdropLebendeSeite) liegt die Seite
 * dagegen in einem SAME-ORIGIN <iframe> (public/import/<slug>/buehne.html) — die
 * getaggten Elemente stehen im `contentDocument` des iframes, NICHT im Editor-
 * Dokument. Damit der bestehende Anker-Mechanismus unverändert weiterläuft, muss
 * er wissen: „scanne/miss gegen DIESES Dokument, und rechne Koordinaten um den
 * iframe-Versatz um".
 *
 * Diese winzige Modul-Registry ist der SAUBERE NAHT dafür: die lebendige Bühne
 * meldet beim Laden ihr contentDocument + ihr iframe-Element an; WebsiteOg /
 * GrafikEditor lesen den aktiven Bühnen-Kontext hier ab (Default = null →
 * `document`, also NULL Regression für die Inline-<Render>-Bühne und die native
 * Landing). Bewusst ein Modul-Singleton statt Context: der iframe wird tief in
 * RiverFlow gerendert, der Anker-Mechanismus sitzt im Panel — ein Context müsste
 * durch beide Bäume gefädelt werden; die Registry ist entkoppelt und mit
 * Subscribe versehen, damit der OG-Scan bei Bühnen-Wechsel neu einliest.
 *
 * KOORDINATEN-MODELL (load-bearing): der Bühnen-iframe ist VOLL-HÖHE (height =
 * content.scrollHeight, s. Backdrop.tsx), scrollt also NIE intern — die Host-
 * Seite scrollt ihn als einen Block. Ein Element E im iframe hat daher
 *   Host-Viewport-y(E) = iframe.rect.top + E.rect.top   (iframe-Intern-Scroll = 0)
 *   Host-Dokument-y(E) = iframe.rect.top + E.rect.top + window.scrollY
 * Der iframe-Versatz kommt live aus iframe.getBoundingClientRect() (enthält den
 * Host-Scroll bereits) — deshalb hält die Registry das iframe-ELEMENT, nicht eine
 * eingefrorene Rect.
 */

export interface BuehneKontext {
  /** contentDocument des lebendigen Bühnen-iframes (same-origin, lesbar). */
  doc: Document;
  /** Das iframe-Element im Host-Dokument — für den Versatz (getBoundingClientRect
   *  live pro Messung, nie gecacht: der iframe wandert beim Scrollen). */
  iframe: HTMLIFrameElement;
}

let aktuell: BuehneKontext | null = null;
const hoerer = new Set<() => void>();

function melde(): void {
  for (const cb of hoerer) {
    try {
      cb();
    } catch {
      /* Ein defekter Hörer darf die anderen nicht mitreißen. */
    }
  }
}

/** Meldet die lebendige Bühne an (Backdrop.tsx beim iframe-onLoad) oder ab
 *  (`null` beim Unmount / Wechsel auf eine Nicht-lebendige Bühne). Idempotent:
 *  derselbe Kontext löst keine Doppel-Meldung aus. */
export function setzeBuehneDoc(kontext: BuehneKontext | null): void {
  if (aktuell === kontext) return;
  if (
    aktuell &&
    kontext &&
    aktuell.doc === kontext.doc &&
    aktuell.iframe === kontext.iframe
  ) {
    return;
  }
  aktuell = kontext;
  melde();
}

/** Aktiver Bühnen-Kontext ODER null (= Inline-/Landing-Bühne → `document`).
 *  Verteidigt gegen einen bereits abgebauten iframe (contentDocument wird beim
 *  Entfernen null): ist die Verbindung tot, gilt „keine lebendige Bühne". */
export function holeBuehneDoc(): BuehneKontext | null {
  if (aktuell && aktuell.iframe.contentDocument !== aktuell.doc) {
    /* iframe wurde ausgetauscht/entfernt → veralteter Kontext, verwerfen. */
    aktuell = null;
  }
  return aktuell;
}

/** Abonniert Bühnen-Wechsel (An-/Abmelden). Gibt eine Abmelde-Funktion zurück.
 *  GrafikEditor nutzt das, um den OG-Ist-Stand neu einzulesen, sobald die
 *  lebendige Bühne geladen ist oder gewechselt wurde. */
export function abonniereBuehneDoc(cb: () => void): () => void {
  hoerer.add(cb);
  return () => {
    hoerer.delete(cb);
  };
}
