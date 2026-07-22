"use client";

/*
 * lib/aktive-seite.ts — Welle 5b (docs/editor-vereinheitlichung.md §10/5b:
 * „der Ein-System-Zustand"). Merkt sich, WELCHE Puck-Seite die „aktive
 * Website" ist — also die eigentliche, echte Seite des Produkts (im Gegensatz
 * zur eingebauten WEE-Demo-Landing). Diese Seite ist:
 *   - im Seiten-Bereich deutlich markiert (SeitenBereich.tsx),
 *   - die Default-Buehne des Animators (app/editor/page.tsx, EditorInner),
 *   - nach einem Import automatisch gesetzt (SeitenBereich onFertig).
 *
 * WARUM localStorage statt IndexedDB (anders als der Backdrop-Store): hier
 * wird nur ein kurzer Seiten-NAME (String) gemerkt, kein groesserer Blob —
 * localStorage ist dafuer das einfachste, synchron lesbare Mittel. Der
 * Backdrop-Zustand (IndexedDB, wee-backdrop) bleibt davon voellig getrennt
 * (Inventar §4.1/Risiko 5): die aktive Website ist der DEFAULT, ein explizit
 * gewaehlter Backdrop schlaegt sie weiterhin.
 *
 * Same-Tab-Benachrichtigung: das native `storage`-Event feuert NUR in ANDEREN
 * Tabs. Fuer Live-Updates im SELBEN Tab (Seiten-Bereich setzt → Animator-Panel
 * liest) senden setzen/entfernen zusaetzlich ein CustomEvent, auf das der
 * useAktiveSeite-Hook hoert.
 */

import { useEffect, useState } from "react";

const SCHLUESSEL = "wee-aktive-seite";
/** Same-Tab-Signal (das native storage-Event deckt nur fremde Tabs ab). */
const EREIGNIS = "wee-aktive-seite-geaendert";

/** Name der aktiven Website (ohne .json) oder null, wenn keine gesetzt ist.
 *  SSR-sicher (null auf dem Server) und fehlertolerant (gesperrter Storage). */
export function leseAktiveSeite(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const wert = window.localStorage.getItem(SCHLUESSEL);
    return wert && wert.length > 0 ? wert : null;
  } catch {
    return null;
  }
}

/** Setzt die aktive Website und benachrichtigt Zuhoerer im selben Tab. */
export function setzeAktiveSeite(name: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCHLUESSEL, name);
    window.dispatchEvent(new CustomEvent(EREIGNIS, { detail: name }));
  } catch {
    /* Storage gesperrt → aktive Website bleibt ungemerkt, kein harter Fehler. */
  }
}

/** Vergisst die aktive Website (z.B. wenn die Seite geloescht wurde). */
export function entferneAktiveSeite(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SCHLUESSEL);
    window.dispatchEvent(new CustomEvent(EREIGNIS, { detail: null }));
  } catch {
    /* siehe setzeAktiveSeite */
  }
}

/** React-Hook: der Name der aktiven Website, live aktualisiert bei Aenderungen
 *  im selben Tab (CustomEvent) UND in anderen Tabs (storage-Event). Startet
 *  null (SSR/erste Client-Runde) und korrigiert im Effekt — hydration-sicher,
 *  gleiches Muster wie der Bereichs-Umschalter in app/editor/page.tsx. */
export function useAktiveSeite(): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    setName(leseAktiveSeite());
    const beiAenderung = () => setName(leseAktiveSeite());
    window.addEventListener(EREIGNIS, beiAenderung);
    window.addEventListener("storage", beiAenderung);
    return () => {
      window.removeEventListener(EREIGNIS, beiAenderung);
      window.removeEventListener("storage", beiAenderung);
    };
  }, []);

  return name;
}
