/*
 * lib/import/css-rewrite.ts — Import-Endlevel Schritt V (M7-Rest, C):
 * AST-basierte CSS-Reparatur. Spec: docs/plan-analyse/lens-import.md §3-Schritt-V,
 * docs/import-endlevel.md.
 *
 * Zweck: die beim Import kopierten CSS-Dateien enthalten `url()`-Verweise auf
 * Fonts/Bilder/Medien (z.B. `/_next/static/media/…`, `../media/…`). Diese Assets
 * werden heute NICHT mitkopiert und loesen relativ zu UNSERER Origin auf → 404
 * (Flag FLAG_CSS_URL in ordner-import.ts). Dieses Modul loest die Verweise
 * mechanisch auf, damit der unreine Aufrufer (import-fein.mjs / ordner-import.ts)
 * die Dateien mitkopieren und die Pfade rebasen kann.
 *
 * REIN (wie html-zu-puck.ts): dieses Modul fasst KEINE Dateien an und macht KEIN
 * Netz. Es liefert nur (a) die Liste der aufzuloesenden Verweise und (b) eine
 * reine Umschreibe-Funktion, die einen fertigen url→url-Ersatz einsetzt. Das
 * eigentliche Finden/Kopieren/Hochladen bleibt beim unreinen Aufrufer.
 *
 * AST STATT REGEX (bewusst, s. Spec): drei getrennte AST-Ebenen —
 *   · postcss                → CSS in Regeln/Deklarationen zerlegen,
 *   · postcss-value-parser   → `url(...)` INNERHALB eines Deklarationswerts
 *                              robust finden (Anfuehrungszeichen, data:-URIs,
 *                              `format('woff2')`-Nachbarn, mehrere url() je src),
 *   · postcss-selector-parser→ `:root`→`:scope` NUR im Selektor-Kontext.
 * So werden `url()` in Kommentaren/`content:"…"`-Strings NICHT faelschlich
 * getroffen — genau die Grenze, an der die alte `css.replace(/:root\b/g,…)`-
 * Kaskade in SeitenStyles.tsx zerbrach.
 */

import postcss from "postcss";
import valueParser from "postcss-value-parser";
import selectorParser from "postcss-selector-parser";

/** Ein in der CSS gefundener, LOKAL aufzuloesender url()-Verweis. */
export interface CssAssetRef {
  /** Exakt wie in `url(...)` geschrieben (Schluessel fuer den Ersatz). */
  rohUrl: string;
  /** Aufgeloester Pfad relativ zur Ordnerwurzel (Kandidat fuer die Datei-Map). */
  pfad: string;
  /** Basisname (Ziel-Dateiname beim Mitkopieren). */
  name: string;
}

/** Ergebnis der Umschreibung: neue CSS + ob sie ueberhaupt geparst werden konnte
 *  (bei Syntaxfehler bleibt die Original-CSS unveraendert → geparst=false). */
export interface CssUmschreibErgebnis {
  css: string;
  geparst: boolean;
}

/* ------------------------------------------------------------------ */
/* Hilfen                                                               */
/* ------------------------------------------------------------------ */

/** Extern/nicht-kopierbar: absolute URLs, protokoll-relative `//host`, data:/
 *  blob:-URIs und reine SVG-Fragment-Verweise (`url(#gradient)`). Nur alles
 *  andere ist ein LOKALER Datei-Verweis, den wir mitkopieren. */
function istLokalerVerweis(url: string): boolean {
  const u = url.trim();
  if (u === "") return false;
  if (u.startsWith("#")) return false; // SVG-Fragment im selben Dokument
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return false; // http:, https:, data:, blob:, file: …
  if (u.startsWith("//")) return false; // protokoll-relativ = extern
  return true;
}

/**
 * Loest einen relativen/root-relativen url()-Pfad gegen das Verzeichnis der
 * CSS-Datei auf und normalisiert `.`/`..` — REIN (kein node:path, browsertauglich).
 *   basisDir  Verzeichnis der CSS-Datei relativ zur Ordnerwurzel, z.B.
 *             "_next/static/css" (leer = Wurzel).
 *   url       roher url()-Inhalt (Query/Hash werden fuer die Pfadsuche entfernt).
 * Ergebnis: Pfad relativ zur Ordnerwurzel, z.B. "_next/static/media/x.woff2".
 */
export function loeseCssPfad(basisDir: string, url: string): string {
  const ohneQuery = url.split("#")[0].split("?")[0].trim();
  const wurzelRelativ = ohneQuery.startsWith("/");
  const roh = wurzelRelativ ? ohneQuery.replace(/^\/+/, "") : ohneQuery;
  const segmente = wurzelRelativ
    ? roh.split("/")
    : [...basisDir.split("/"), ...roh.split("/")];
  const out: string[] = [];
  for (const s of segmente) {
    if (s === "" || s === ".") continue;
    if (s === "..") {
      out.pop();
      continue;
    }
    out.push(s);
  }
  return out.join("/");
}

/** Liest den url()-Inhalt aus einem value-parser-FunctionNode (`url(...)`):
 *  erster String-/Word-Knoten. null, wenn leer. */
function urlInhalt(fn: valueParser.FunctionNode): valueParser.Node | null {
  for (const n of fn.nodes) {
    if (n.type === "string" || n.type === "word") return n;
  }
  return null;
}

/** Fuehrt einen Callback fuer jeden lokalen `url(...)`-Verweis in einem
 *  Deklarationswert aus. `mutiere` darf den inneren Knoten aendern; die
 *  Funktion gibt den (ggf. neu serialisierten) Wert zurueck. */
function jederUrlVerweis(
  wert: string,
  besuch: (roh: string, setze: (neu: string) => void) => void,
): string {
  const geparst = valueParser(wert);
  let veraendert = false;
  geparst.walk((node) => {
    if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
    const inner = urlInhalt(node);
    if (!inner) return;
    const roh = inner.value;
    if (!istLokalerVerweis(roh)) return;
    besuch(roh, (neu) => {
      inner.value = neu;
      veraendert = true;
    });
  });
  return veraendert ? valueParser.stringify(geparst.nodes) : wert;
}

/* ------------------------------------------------------------------ */
/* 1) Verweise SAMMELN (rein)                                           */
/* ------------------------------------------------------------------ */

/**
 * Sammelt alle LOKALEN url()-Verweise einer CSS-Datei (Fonts/Bilder/Medien),
 * dedupliziert nach rohem url()-Text. Externe (http/data/#frag) werden
 * uebersprungen. Bei Syntaxfehler in der CSS: leere Liste (der Aufrufer flaggt
 * den Roh-Kopie-Fall).
 *   basisDir = Verzeichnis der CSS-Datei relativ zur Ordnerwurzel.
 */
export function sammleCssAssets(css: string, basisDir: string): CssAssetRef[] {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch {
    return [];
  }
  const gesehen = new Set<string>();
  const refs: CssAssetRef[] = [];
  root.walkDecls((decl) => {
    jederUrlVerweis(decl.value, (roh) => {
      if (gesehen.has(roh)) return;
      gesehen.add(roh);
      const pfad = loeseCssPfad(basisDir, roh);
      const name = (pfad.split("/").pop() ?? "").trim();
      if (name === "") return;
      refs.push({ rohUrl: roh, pfad, name });
    });
  });
  return refs;
}

/* ------------------------------------------------------------------ */
/* 2) Verweise UMSCHREIBEN (rein)                                       */
/* ------------------------------------------------------------------ */

/**
 * Ersetzt in der CSS jeden lokalen url()-Verweis, fuer den `urlMap` einen neuen
 * Ziel-Pfad enthaelt (roher url()-Text → neue absolute URL, z.B.
 * "/import/<slug>/x.woff2"). Verweise ohne Map-Eintrag bleiben unveraendert.
 * Bei Syntaxfehler: Original-CSS + geparst=false.
 */
export function schreibeCssUrls(css: string, urlMap: Record<string, string>): CssUmschreibErgebnis {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch {
    return { css, geparst: false };
  }
  root.walkDecls((decl) => {
    const neu = jederUrlVerweis(decl.value, (roh, setze) => {
      const ziel = urlMap[roh];
      if (ziel !== undefined) setze(ziel);
    });
    if (neu !== decl.value) decl.value = neu;
  });
  return { css: root.toString(), geparst: true };
}

/* ------------------------------------------------------------------ */
/* 3) :root → :scope (rein, NUR Selektoren)                             */
/* ------------------------------------------------------------------ */

const rootZuScope = selectorParser((selektoren) => {
  selektoren.walkPseudos((p) => {
    if (p.value === ":root") p.value = ":scope";
  });
});

/**
 * Verlegt `:root` auf `:scope` — AST-basiert, ausschliesslich im SELEKTOR-Kontext.
 * Ersetzt die fragile `css.replace(/:root\b/g,…)`-Kaskade aus SeitenStyles.tsx,
 * die auch `:root` in `content:"…"`/`url()`/Kommentaren traf. Werte, Strings und
 * Kommentare bleiben unberuehrt. Bei Syntaxfehler: Original-CSS unveraendert.
 *
 * Nur fuer die INLINE-@scope-Buehne noetig (dort matcht `:root` sonst das <html>
 * ausserhalb der Buehne). Im iframe-/Export-Pfad bleibt `:root` erhalten — daher
 * NICHT in die gespeicherte Datei backen, sondern zur Render-Zeit anwenden.
 */
export function rootAufScope(css: string): string {
  let root: postcss.Root;
  try {
    root = postcss.parse(css);
  } catch {
    return css;
  }
  root.walkRules((rule) => {
    if (!rule.selector.includes(":root")) return;
    try {
      rule.selector = rootZuScope.processSync(rule.selector);
    } catch {
      /* Ein unparsbarer Selektor bleibt unveraendert — nie die ganze Datei kippen. */
    }
  });
  return root.toString();
}
