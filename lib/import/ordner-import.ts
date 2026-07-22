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
  const flags: ImportFlag[] = [];

  for (const { id, src } of bericht.bilder) {
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
    if (datei.size < DATAURL_MAX) {
      ersatz[id] = await alsDataUrl(datei);
    } else {
      const dataUrl = await alsDataUrl(datei);
      const url = await ladeAssetHoch(slug, name, dataUrl);
      if (url) ersatz[id] = url;
      else flags.push({ grund: FLAG_BILD_UPLOAD, detail: src });
    }
  }

  return { data: ersetzeBildQuellen(bericht.data, ersatz), flags };
}
