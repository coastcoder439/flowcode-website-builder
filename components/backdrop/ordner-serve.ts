/*
 * ordner-serve.ts – "Ordner öffnen"-Backdrop: liest eine vom Nutzer
 * gepickte, mehrdateiige statische Website (index.html + CSS + Bilder) via
 * File System Access API rekursiv ein, schreibt sie in den Cache Storage
 * "wee-site" und registriert einen Service Worker (public/wee-site-sw.js,
 * scope "/wee-site/"), der GET-Anfragen unter /wee-site/ aus diesem Cache
 * beantwortet. Backdrop.tsx rendert danach nur noch ein simples
 * <iframe src="/wee-site/"> — same-origin, kein srcDoc-Trick noetig (anders
 * als der HTML-Backdrop), weil der Browser den iframe-Inhalt normal ueber
 * eine Netzwerk-Anfrage laedt und der Service Worker dahinter antwortet.
 *
 * WARUM SERVICE WORKER (nicht z.B. viele Blob-URLs mit umgeschriebenen
 * relativen Pfaden): ein gepickter Ordner kann beliebig viele relative
 * Referenzen enthalten (CSS -> Bilder, HTML -> CSS -> Fonts, Unterordner) —
 * die alle im Voraus umzuschreiben ist fehleranfaellig (Regex/Parser fuer
 * beliebiges HTML/CSS) und bricht bei Unterordnern leicht. Der Service
 * Worker beantwortet dagegen JEDE Anfrage unter /wee-site/ so, wie ein
 * echter Server es taete — die Originalpfade bleiben unveraendert gueltig.
 *
 * Gleiches Grundmuster wie components/grafik/grafik-store.ts (Ordner-Picker
 * + Handle-Persistenz in IndexedDB + stille queryPermission-Pruefung), hier
 * eigenstaendig nachgebaut statt importiert: backdrop-store.ts ist bewusst
 * eine EIGENE, editor-uebergreifende Datenbank (s. dortiger Dateikopf).
 */

import { idbGet, idbSet } from "./backdrop-store";

const CACHE_NAME = "wee-site";
const SW_SCOPE = "/wee-site/";
const SW_URL = "/wee-site-sw.js";
const K_ORDNER_HANDLE = "ordnerHandle";

/** Sicherheitsgrenzen gegen pathologische Ordner (sehr viele Dateien oder
 *  sehr tiefe/zyklische Verzeichnisbaeume) — ein internes Editor-Tool muss
 *  hier nicht jeden Fall abdecken, aber auch nicht haengen bleiben. */
const MAX_DATEIEN = 2000;
const MAX_TIEFE = 12;

/* ------------------------------------------------------------------ */
/* Minimal-Typen (File System Access API)                              */
/* ------------------------------------------------------------------ */
/* Die API steckt (noch) nicht in der Standard-TS-DOM-Lib dieses Projekts
   (s. grafik-store.ts) — deshalb ein schlankes Eigen-Interface statt „any".
   Ein Verzeichnis-Eintrag ist bei kind:"directory" strukturell identisch zu
   OrdnerHandle (hat selbst wieder .values()) — deshalb teilen sich beide
   dieselbe Form. */

export interface OrdnerEintrag {
  kind: string;
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<OrdnerEintrag>;
}

export interface OrdnerHandle {
  name: string;
  values: () => AsyncIterable<OrdnerEintrag>;
  queryPermission?: (o?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (o?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
}

type MitPicker = Window & {
  showDirectoryPicker?: (o?: { mode?: "read" | "readwrite" }) => Promise<OrdnerHandle>;
};

export function ordnerApiDa(): boolean {
  return typeof window !== "undefined" && !!(window as MitPicker).showDirectoryPicker;
}

/* ------------------------------------------------------------------ */
/* Ordner-Picker + Handle-Persistenz (wie grafik-store.ts)             */
/* ------------------------------------------------------------------ */

/** Oeffnet den nativen Ordner-Dialog (braucht eine Nutzergeste!) und merkt
 *  den Handle dauerhaft in der Backdrop-IndexedDB. Nur Lesezugriff — der
 *  Ordner-Backdrop schreibt nie in den Nutzer-Ordner zurueck. */
export async function ordnerWaehlen(): Promise<OrdnerHandle | null> {
  const w = window as MitPicker;
  if (!w.showDirectoryPicker) return null;
  const handle = await w.showDirectoryPicker({ mode: "read" });
  await idbSet(K_ORDNER_HANDLE, handle);
  return handle;
}

/** Gemerkten Ordner-Handle holen. `fragen=false` prueft nur still per
 *  queryPermission (z.B. beim Laden der Seite) — requestPermission braucht
 *  zwingend eine Nutzergeste und wuerde sonst scheitern. */
export async function ordnerHolen(fragen: boolean): Promise<OrdnerHandle | null> {
  const handle = await idbGet<OrdnerHandle>(K_ORDNER_HANDLE);
  if (!handle) return null;
  const status = (await handle.queryPermission?.({ mode: "read" })) ?? "granted";
  if (status === "granted") return handle;
  if (!fragen) return null;
  const neu = (await handle.requestPermission?.({ mode: "read" })) ?? "denied";
  return neu === "granted" ? handle : null;
}

/* ------------------------------------------------------------------ */
/* Rekursiv einlesen -> Cache Storage                                   */
/* ------------------------------------------------------------------ */

const MIME_TYPEN: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  webmanifest: "application/manifest+json",
};

function mimeVon(pfad: string): string {
  const punkt = pfad.lastIndexOf(".");
  const endung = punkt >= 0 ? pfad.slice(punkt + 1).toLowerCase() : "";
  return MIME_TYPEN[endung] ?? "application/octet-stream";
}

interface GesammelteDatei {
  pfad: string;
  datei: File;
}

async function rekursivSammeln(
  handle: OrdnerHandle,
  praefix: string,
  tiefe: number,
  out: GesammelteDatei[],
): Promise<void> {
  if (tiefe > MAX_TIEFE) return;
  for await (const eintrag of handle.values()) {
    if (out.length >= MAX_DATEIEN) return;
    const pfad = praefix + eintrag.name;
    if (eintrag.kind === "file" && eintrag.getFile) {
      out.push({ pfad, datei: await eintrag.getFile() });
    } else if (eintrag.kind === "directory" && eintrag.values) {
      await rekursivSammeln(eintrag as OrdnerHandle, `${pfad}/`, tiefe + 1, out);
    }
  }
}

/** Liest den kompletten Ordner rekursiv und schreibt jede Datei als
 *  Cache-Eintrag unter /wee-site/<relativer-Pfad> (ueberschreibt
 *  bestehende Eintraege desselben Pfads — ein erneuter Aufruf aktualisiert
 *  den Cache also einfach). Gibt die Anzahl geschriebener Dateien zurueck. */
export async function ordnerInCacheLaden(handle: OrdnerHandle): Promise<number> {
  const dateien: GesammelteDatei[] = [];
  await rekursivSammeln(handle, "", 0, dateien);

  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    dateien.map(({ pfad, datei }) =>
      cache.put(
        `${SW_SCOPE}${pfad}`,
        new Response(datei, { headers: { "Content-Type": mimeVon(pfad) } }),
      ),
    ),
  );
  return dateien.length;
}

/* ------------------------------------------------------------------ */
/* Service-Worker-Registrierung                                        */
/* ------------------------------------------------------------------ */

/** Registriert public/wee-site-sw.js mit Scope /wee-site/. Idempotent: ein
 *  bereits registrierter, inhaltsgleicher Worker auf demselben Scope wird
 *  vom Browser selbst erkannt, kein Doppel-Setup noetig. Wirft nie — fehlt
 *  die API (kein Secure Context, alter Browser) oder schlaegt die
 *  Registrierung fehl, gibt die Funktion still `false` zurueck. */
export async function swRegistrieren(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
    await navigator.serviceWorker.ready;
    return true;
  } catch {
    return false;
  }
}

/** Cache leeren + gefundene Registrierung(en) auf dem Scope abmelden — nur
 *  fuer Tests/Aufraeumen bzw. ein bewusstes "von vorn" gedacht, keine
 *  UI-Aktion des laufenden Editors ruft das aktuell auf. */
export async function ordnerAufraeumen(): Promise<void> {
  await caches.delete(CACHE_NAME);
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
  await reg?.unregister();
}

/** Bequemlichkeits-Wrapper fuer den UI-Fluss (BackdropAuswahl.tsx,
 *  Backdrop.tsx): Ordner in den Cache lesen UND den Service Worker
 *  bereitstellen. Wirft, wenn eines von beidem fehlschlaegt — der Aufrufer
 *  faengt das ab und zeigt eine Statuszeile (gleiche Konvention wie die
 *  bild/html-Handler in BackdropAuswahl.tsx). */
export async function ordnerBereitstellen(handle: OrdnerHandle): Promise<number> {
  const anzahl = await ordnerInCacheLaden(handle);
  const ok = await swRegistrieren();
  if (!ok) throw new Error("Service Worker konnte nicht registriert werden");
  return anzahl;
}
