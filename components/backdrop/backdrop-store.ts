/*
 * backdrop-store.ts – Persistenz des Backdrop-Modus.
 *
 * GLEICHES MUSTER wie components/grafik/grafik-store.ts: IndexedDB statt
 * localStorage, weil ein Screenshot-Backdrop als Data-URL leicht mehrere MB
 * gross ist — localStorage ist hart bei ~5 MB pro Domain gedeckelt.
 *
 * EIGENE Datenbank ("wee-backdrop") statt Mitbenutzung von "wee-grafik":
 * der Backdrop ist ein editor-uebergreifendes Konzept (Grafik-Editor UND
 * Fluss-Editor lesen/schreiben denselben Zustand), keine Zustaendigkeit
 * EINES Editors — eine eigene, kleine Datenbank haelt das sauber getrennt.
 */

import type { Backdrop } from "./backdrop-types";

const DB_NAME = "wee-backdrop";
const DB_VERSION = 1;
const STORE = "keyval";
const KEY_AKTUELL = "aktuell";

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

/** Generischer Lesezugriff auf den Backdrop-Store — fuer Werte AUSSERHALB
 *  des eigentlichen Backdrop-Objekts (aktuell: der gemerkte Ordner-Handle
 *  des "ordner"-Modus, s. ordner-serve.ts). Gleiches Muster wie
 *  grafik-store.ts' idbGet/idbSet — eigene Kopie statt Import, damit
 *  backdrop-store.ts (eigene Datenbank, s. Dateikopf) nicht von
 *  grafik-store.ts abhaengt. */
export async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((res, rej) => {
    const req = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => res(req.result as T | undefined);
    req.onerror = () => rej(req.error);
  });
}

export async function idbSet(key: string, wert: unknown): Promise<void> {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(wert, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Gemerkten Backdrop laden — null, wenn noch keiner gewaehlt wurde (bzw. auf
 *  "echte Seite" zurueckgesetzt). Schlaegt IndexedDB fehl (privater Modus,
 *  Quota, …), gilt das wie "kein Backdrop" statt eines harten Fehlers — der
 *  Editor faellt dann einfach auf die echte Landing zurueck. */
export async function backdropLaden(): Promise<Backdrop | null> {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(KEY_AKTUELL);
      req.onsuccess = () => res((req.result as Backdrop | undefined) ?? null);
      req.onerror = () => rej(req.error);
    });
  } catch {
    return null;
  }
}

/** Backdrop merken (bzw. mit `null` auf "echte Seite" zuruecksetzen). Wirft
 *  NICHT bei Speicherfehlern — der Aufrufer zeigt dem Nutzer stattdessen eine
 *  Statuszeile (s. BackdropAuswahl.tsx), ein kaputter Speicher darf den
 *  Editor nie blockieren. */
export async function backdropSpeichern(b: Backdrop | null): Promise<void> {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(STORE, "readwrite");
    if (b) tx.objectStore(STORE).put(b, KEY_AKTUELL);
    else tx.objectStore(STORE).delete(KEY_AKTUELL);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/** Datei als Data-URL lesen (Screenshot-Backdrop). */
export function alsDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** Datei als Text lesen (HTML-Backdrop — der rohe Dateiinhalt wird 1:1 als
 *  iframe-srcdoc gerendert, s. Backdrop.tsx). */
export function alsText(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(f);
  });
}
