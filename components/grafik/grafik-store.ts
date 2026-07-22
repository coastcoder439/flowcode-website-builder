/*
 * grafik-store.ts – Persistenz des Grafik-Editors.
 *
 * WARUM NICHT localStorage: der ist hart bei ~5 MB pro Domain gedeckelt und
 * speichert nur Text — Bilder müssten als Base64-Data-URL rein und werden
 * dabei ~33 % GRÖSSER. Eine Canva-PNG-Bibliothek sprengt das sofort.
 * IndexedDB hat praktisch keine solche Grenze (Hunderte MB bis GB) und
 * speichert Blobs/Handles direkt.
 *
 * WARUM DIRECTORY-HANDLE: FileSystemDirectoryHandle ist strukturiert
 * klonbar und kann deshalb IN IndexedDB liegen. Nach einem Neustart ist der
 * Ordner damit wieder verknüpft — es braucht nur noch EIN Klick-OK für die
 * Berechtigung (das erzwingt der Browser, das lässt sich nicht umgehen).
 */

import type { AnimationsPreset } from "./grafik-types";

const DB_NAME = "wee-grafik";
const DB_VERSION = 1;
const STORE = "keyval";

/** Schlüssel im Store. */
export const K_SETUPS = "setups";
export const K_ORDNER = "ordnerHandle";
/** Animations-Presets ("voranimierte Assets", s. grafik-types AnimationsPreset).
 *  Eigener Schlüssel im selben Store wie K_SETUPS — reiner Bewegungs-Datensatz
 *  (kein Handle, keine Bytes), daher genügt idbGet/idbSet ohne Sondermuster. */
export const K_PRESETS = "presets";

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

/* --- Animations-Presets ------------------------------------------- */

/** Alle gespeicherten Presets holen (leere Liste, wenn noch keine da sind). */
export async function presetsHolen(): Promise<AnimationsPreset[]> {
  return (await idbGet<AnimationsPreset[]>(K_PRESETS)) ?? [];
}

/** Preset-Liste komplett schreiben (der Aufrufer hält die Liste in Ordnung —
 *  Muster wie beim Setup-Speichern: ganze Sammlung ersetzen statt patchen). */
export async function presetsSetzen(liste: AnimationsPreset[]): Promise<void> {
  await idbSet(K_PRESETS, liste);
}

/* ------------------------------------------------------------------ */
/* File System Access API                                              */
/* ------------------------------------------------------------------ */

/** Minimal-Typen: die API steckt (noch) nicht in der Standard-TS-DOM-Lib. */
export interface OrdnerEintrag {
  kind: string;
  name: string;
  getFile: () => Promise<File>;
}
export interface OrdnerHandle {
  name: string;
  values: () => AsyncIterable<OrdnerEintrag>;
  getFileHandle: (
    name: string,
    o?: { create?: boolean },
  ) => Promise<{ createWritable: () => Promise<{ write: (d: unknown) => Promise<void>; close: () => Promise<void> }> }>;
  queryPermission?: (o?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
}
type MitPicker = Window & {
  showDirectoryPicker?: (o?: { mode?: "read" | "readwrite" }) => Promise<OrdnerHandle>;
};

export function ordnerApiDa(): boolean {
  return typeof window !== "undefined" && !!(window as MitPicker).showDirectoryPicker;
}

/** Ordner wählen und den Handle dauerhaft merken (IndexedDB). */
export async function ordnerWaehlen(): Promise<OrdnerHandle | null> {
  const w = window as MitPicker;
  if (!w.showDirectoryPicker) return null;
  const handle = await w.showDirectoryPicker({ mode: "readwrite" });
  await idbSet(K_ORDNER, handle);
  return handle;
}

/** Gemerkten Ordner holen. `fragen=false` prüft nur still (beim Start —
 *  requestPermission braucht eine Nutzergeste und würde sonst scheitern). */
export async function ordnerHolen(fragen: boolean): Promise<OrdnerHandle | null> {
  const handle = await idbGet<OrdnerHandle>(K_ORDNER);
  if (!handle) return null;
  const status = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
  if (status === "granted") return handle;
  if (!fragen) return null;
  const neu = (await handle.requestPermission?.({ mode: "readwrite" })) ?? "denied";
  return neu === "granted" ? handle : null;
}

const BILD_ENDUNGEN = /\.(svg|png|jpe?g|webp|gif|avif)$/i;

/** Alle Bilder/SVGs eines Ordners lesen. */
export async function ordnerDateien(handle: OrdnerHandle, max = 500): Promise<File[]> {
  const out: File[] = [];
  for await (const e of handle.values()) {
    if (e.kind !== "file" || !BILD_ENDUNGEN.test(e.name)) continue;
    out.push(await e.getFile());
    if (out.length >= max) break;
  }
  return out;
}

/** Datei IN den verbundenen Ordner schreiben (Strg+V / Drag&Drop aus Canva
 *  landet damit direkt in der Bibliothek statt nur im Browser-Speicher). */
export async function inOrdnerSchreiben(
  handle: OrdnerHandle,
  name: string,
  daten: Blob,
): Promise<void> {
  const fh = await handle.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(daten);
  await w.close();
}
