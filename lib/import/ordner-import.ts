/*
 * lib/import/ordner-import.ts — Welle 4b (Ordner-Import): der BROWSER-Teil des
 * Import-Flows (docs/editor-vereinheitlichung.md §9/4b). Unrein per Natur
 * (File System Access + fetch) — bewusst getrennt vom reinen, testbaren
 * HTML->Puck-Adapter (lib/import/html-zu-puck.ts).
 *
 * Aufgaben:
 *   1. Ordner waehlen (eigener Picker — NICHT der Backdrop-Handle, damit ein
 *      Import den „Ordner öffnen"-Hintergrund nicht ueberschreibt).
 *   2. Dateien rekursiv sammeln (Pfad -> File), HTML-Dateien listen.
 *   3. Bild-Assets aufloesen: <300 KB -> Data-URL (in die Seite eingebettet),
 *      sonst POST /api/import/asset -> public/import/<slug>/. Das Ergebnis
 *      wird ueber die reine `ersetzeBildQuellen` in die Puck-Data geschrieben.
 *
 * Muster (Ordner-Picker + Rekursion + Grenzen) aus components/backdrop/
 * ordner-serve.ts uebernommen; hier eigenstaendig, weil dort der Handle
 * dauerhaft als Backdrop gemerkt wird — das wollen wir beim Import nicht.
 */

import type { OrdnerEintrag, OrdnerHandle } from "@/components/backdrop/ordner-serve";
import { ordnerApiDa } from "@/components/backdrop/ordner-serve";
import { ersetzeBildQuellen, type ImportBericht, type ImportFlag } from "./html-zu-puck";
import type { Data } from "@puckeditor/core";

const MAX_DATEIEN = 2000;
const MAX_TIEFE = 12;
/** Ab dieser Groesse wird ein Bild nicht mehr als Data-URL eingebettet,
 *  sondern als echte Datei kopiert (§9/4b). */
const DATAURL_MAX = 300 * 1024;

type MitPicker = Window & {
  showDirectoryPicker?: (o?: { mode?: "read" | "readwrite" }) => Promise<OrdnerHandle>;
};

export { ordnerApiDa };

/** Oeffnet den nativen Ordner-Dialog (braucht eine Nutzergeste!). Merkt den
 *  Handle NICHT — ein Import ist einmalig. Gibt null zurueck, wenn die API
 *  fehlt; wirft nur, wenn der Nutzer abbricht (Aufrufer faengt das ab). */
export async function waehleImportOrdner(): Promise<OrdnerHandle | null> {
  const w = window as MitPicker;
  if (!w.showDirectoryPicker) return null;
  return w.showDirectoryPicker({ mode: "read" });
}

/* ------------------------------------------------------------------ */
/* Dateien sammeln                                                      */
/* ------------------------------------------------------------------ */

async function rekursivSammeln(
  handle: OrdnerHandle,
  praefix: string,
  tiefe: number,
  out: Map<string, File>,
): Promise<void> {
  if (tiefe > MAX_TIEFE) return;
  for await (const eintrag of handle.values()) {
    if (out.size >= MAX_DATEIEN) return;
    const pfad = praefix + eintrag.name;
    if (eintrag.kind === "file" && eintrag.getFile) {
      out.set(pfad, await eintrag.getFile());
    } else if (eintrag.kind === "directory" && eintrag.values) {
      await rekursivSammeln(eintrag as OrdnerHandle, `${pfad}/`, tiefe + 1, out);
    }
  }
}

/** Liest den Ordner rekursiv in eine Map „relativer Pfad (mit /) -> File". */
export async function sammleImportDateien(handle: OrdnerHandle): Promise<Map<string, File>> {
  const map = new Map<string, File>();
  await rekursivSammeln(handle, "", 0, map);
  return map;
}

/** HTML-Dateien der Map, index.html zuerst, danach alphabetisch. */
export function listeHtmlDateien(map: Map<string, File>): string[] {
  const html = [...map.keys()].filter((p) => /\.html?$/i.test(p));
  html.sort((a, b) => {
    const ai = /(^|\/)index\.html?$/i.test(a) ? 0 : 1;
    const bi = /(^|\/)index\.html?$/i.test(b) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
  return html;
}

/** Text einer Datei aus der Map lesen. */
export async function leseText(map: Map<string, File>, pfad: string): Promise<string> {
  const datei = map.get(pfad);
  if (!datei) throw new Error(`Datei „${pfad}" nicht im Ordner`);
  return datei.text();
}

/* ------------------------------------------------------------------ */
/* Bild-Aufloesung                                                      */
/* ------------------------------------------------------------------ */

/** Normalisiert eine HTML-src auf einen Map-Schluessel-Kandidaten
 *  (relativ, ohne Query/Hash, ohne fuehrende ./ oder /). */
function normalisiereSrc(src: string): string {
  let s = src.split("#")[0].split("?")[0].trim();
  s = s.replace(/^\.\//, "").replace(/^\/+/, "");
  return s;
}

/** Findet die File zu einer HTML-src: exakter Pfad zuerst, sonst Basisname
 *  (Ordner-Struktur der Seite muss nicht exakt der Map entsprechen). */
function findeDatei(map: Map<string, File>, src: string): File | null {
  const norm = normalisiereSrc(src);
  const direkt = map.get(norm);
  if (direkt) return direkt;
  const basis = norm.split("/").pop() ?? norm;
  for (const [pfad, datei] of map) {
    if ((pfad.split("/").pop() ?? pfad) === basis) return datei;
  }
  return null;
}

function alsDataUrl(datei: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leser = new FileReader();
    leser.onload = () => resolve(leser.result as string);
    leser.onerror = () => reject(leser.error ?? new Error("Lesefehler"));
    leser.readAsDataURL(datei);
  });
}

/** Laedt ein grosses Asset ueber /api/import/asset hoch und gibt die neue URL
 *  zurueck (oder null bei Fehler — der Aufrufer flaggt das). */
async function ladeAssetHoch(slug: string, name: string, dataUrl: string): Promise<string | null> {
  try {
    const res = await fetch("/api/import/asset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, name, dataUrl }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { url?: string };
    return typeof json.url === "string" ? json.url : null;
  } catch {
    return null;
  }
}

const FLAG_BILD_FEHLT = "Bild nicht gefunden";
const FLAG_BILD_EXTERN = "Externes Bild belassen";
const FLAG_BILD_UPLOAD = "Bild-Upload fehlgeschlagen";

/**
 * Loest die Bildquellen eines Import-Berichts gegen den gewaehlten Ordner auf
 * und schreibt sie ueber die reine `ersetzeBildQuellen` in die Data zurueck.
 * Gibt die neue Data plus zusaetzliche Flags (fehlende/externe/fehlgeschlagene
 * Bilder) zurueck. Externe (http/data:) Quellen bleiben unveraendert.
 */
export async function aufloeseBilderAusOrdner(
  bericht: ImportBericht,
  map: Map<string, File>,
  slug: string,
): Promise<{ data: Data; flags: ImportFlag[] }> {
  const ersatz: Record<string, string> = {};
  /** Welle 5a: Original-src -> neue URL fuer Bilder INNERHALB von HtmlBloecken
   *  (Rueckschrift per String-Ersatz, s. ersetzeBildQuellen). */
  const htmlErsatz: Record<string, string> = {};
  const flags: ImportFlag[] = [];

  for (const { id, src, quelle } of bericht.bilder) {
    if (/^(data:|https?:)/i.test(src)) {
      flags.push({ grund: FLAG_BILD_EXTERN, detail: src });
      continue; // externe Quelle: nichts zu kopieren
    }
    const datei = findeDatei(map, src);
    if (!datei) {
      flags.push({ grund: FLAG_BILD_FEHLT, detail: src });
      continue;
    }
    const name = (normalisiereSrc(src).split("/").pop() ?? "bild").trim() || "bild";
    /* html-interne Bilder IMMER kopieren: das Markup bleibt schlank (Pfad statt
       Riesen-data-URL) und die Datei landet real unter public/import/<slug>/.
       Eigenstaendige BildBloecke wie bisher: klein -> data-URL, gross -> Upload. */
    if (quelle === "html") {
      const url = await ladeAssetHoch(slug, name, await alsDataUrl(datei));
      if (url) htmlErsatz[src] = url;
      else flags.push({ grund: FLAG_BILD_UPLOAD, detail: src });
    } else if (datei.size < DATAURL_MAX) {
      ersatz[id] = await alsDataUrl(datei);
    } else {
      const url = await ladeAssetHoch(slug, name, await alsDataUrl(datei));
      if (url) ersatz[id] = url;
      else flags.push({ grund: FLAG_BILD_UPLOAD, detail: src });
    }
  }

  return { data: ersetzeBildQuellen(bericht.data, ersatz, htmlErsatz), flags };
}

/* ------------------------------------------------------------------ */
/* Styles uebernehmen (Welle 5a)                                        */
/* ------------------------------------------------------------------ */

const FLAG_CSS_FEHLT = "Stylesheet nicht gefunden";
const FLAG_CSS_UPLOAD = "Stylesheet-Upload fehlgeschlagen";
const FLAG_CSS_URL = "CSS-Verweise auf nicht-kopierte Assets bleiben unaufgeloest";

/** Kodiert CSS-Text als `data:text/css;base64,…` (UTF-8-sicher, auch fuer
 *  Nicht-ASCII wie „ä" in Kommentaren/content:). Passt exakt auf die
 *  CSS_MIME-Whitelist von /api/import/asset. */
function textAlsCssDataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binaer = "";
  for (const b of bytes) binaer += String.fromCharCode(b);
  return `data:text/css;base64,${btoa(binaer)}`;
}

/**
 * Uebernimmt die im Bericht gesammelten Styles (Welle 5a, §10/5a): kopiert jede
 * same-origin CSS-Datei nach public/import/<slug>/css/ und fasst alle Inline-
 * <style>-Bloecke zu EINER Datei zusammen. Gibt die Liste der neuen URLs (in
 * Dokument-Reihenfolge: erst die verlinkten Stylesheets, dann die Inline-Datei
 * zuletzt — so gewinnt Inline-CSS wie im Original) plus Flags zurueck.
 *
 * EHRLICHE GRENZE (als Flag benannt): url()-Verweise IN den CSS-Dateien (Fonts,
 * Hintergrundbilder, z.B. /_next/static/media/…) werden NICHT mitkopiert — sie
 * zeigen nach dem Import auf unsere Origin und laufen dort ggf. ins Leere. Die
 * Kern-Regeln (Layout/Farben/Abstaende) greifen, mediengebundene Details evtl.
 * nicht.
 */
export async function uebernimmStyles(
  bericht: ImportBericht,
  map: Map<string, File>,
  slug: string,
): Promise<{ styles: string[]; flags: ImportFlag[] }> {
  const styles: string[] = [];
  const flags: ImportFlag[] = [];

  for (const href of bericht.stylesheets) {
    const datei = findeDatei(map, href);
    if (!datei) {
      flags.push({ grund: FLAG_CSS_FEHLT, detail: href });
      continue;
    }
    const text = await datei.text();
    const name = (normalisiereSrc(href).split("/").pop() ?? "stil.css").trim() || "stil.css";
    const url = await ladeAssetHoch(slug, name, textAlsCssDataUrl(text));
    if (url) styles.push(url);
    else flags.push({ grund: FLAG_CSS_UPLOAD, detail: href });
  }

  if (bericht.inlineStyles.length > 0) {
    const zusammengefasst = bericht.inlineStyles.join("\n\n");
    const url = await ladeAssetHoch(slug, `${slug}-inline.css`, textAlsCssDataUrl(zusammengefasst));
    if (url) styles.push(url);
    else flags.push({ grund: FLAG_CSS_UPLOAD, detail: "Inline-<style>-Sammeldatei" });
  }

  /* Grenze nur dann ehrlich anzeigen, wenn ueberhaupt Styles uebernommen
     wurden (sonst waere der Hinweis irrefuehrend). */
  if (styles.length > 0) {
    flags.push({ grund: FLAG_CSS_URL, detail: `${styles.length} CSS-Datei(en) übernommen` });
  }

  return { styles, flags };
}
