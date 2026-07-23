/*
 * lib/import/struktur-injektion.ts — Phase 4b (struktur-erhaltender Import,
 * docs/editor-vereinheitlichung.md): die REINE Injektions-Logik des
 * StrukturBlock-Bausteins.
 *
 * WARUM DIESER BAUSTEIN (Leons Befund 2026-07-23): Das feine Import-Mapping
 * (htmlZuPuckMitSegmentierung) zerlegt eine Sektion in lose Geschwister-
 * Bausteine (BildBlock + TextBlock nebeneinander) und ZERSTOERT damit das
 * Layout — ein absolut ueber dem Bild liegender Hero-Text wird zum Stapel, ein
 * Zweispalten-Block zur Einspalte. Der StrukturBlock kehrt das um: die Sektion
 * behaelt ihr ORIGINAL-MARKUP 1:1 als Layout-Traeger (`template`), Editierbar-
 * keit kommt durch INJEKTION an Marker-Positionen.
 *
 * MARKER-MECHANIK: Der (in einer SEPARATEN Aufgabe gebaute) Segmentier-/
 * Injektions-Schritt versieht die inhaltstragenden Original-Elemente mit
 * data-Attributen, OHNE ihren Inhalt zu ersetzen:
 *   · Text:  <h1 data-fc-text="t1">Leben ermoeglichen.</h1>
 *   · Bild:  <img data-fc-bild="b1" src="/import/…/hero.png" alt="…">
 * Die Prop-Werte (texte[].wert, bilder[].src/alt) werden mit den ORIGINAL-
 * Inhalten initialisiert. Dadurch ist das UN-injizierte `template` bereits ein
 * gueltiger, korrekt aussehender Zustand (Original-Inhalt) — wichtig fuers
 * server-seitige Vorrendern (siehe StrukturBlock.tsx, SSR-Zweig): der Baustein
 * zeigt nie leere Platzhalter, nur echten Inhalt. Der Client injiziert nach dem
 * Mount die (ggf. editierten) Prop-Werte an dieselben Marker-Positionen.
 *
 * BEWUSSTER TRADE-OFF (Treue vor Granularitaet, Leons Prioritaet): Einzel-
 * element-Drag INNERHALB einer Sektion gibt es nicht — die Sektion ist EIN
 * Block (verschieb-/loeschbar), Text/Bild sind ueber die Puck-Sidebar
 * editierbar. Inline-Markup eines Text-Markers geht bei Injektion verloren
 * (textContent-Ersatz), wie beim TextBlock — dafuer ist der Wert sicher.
 *
 * SICHERHEIT (Vorbild: HtmlBlock-Entschaerfung): kein XSS ueber Props.
 *   1. Das `template` wird mit entschaerfeHtml (html-zu-puck.ts) entschaerft —
 *      derselbe getestete Sanitizer wie beim HtmlBlock (<script>/<iframe>/
 *      on*-Attribute/javascript:-URLs raus). data-* (inkl. data-og-id der
 *      3b-Anker-Mechanik) bleiben unberuehrt.
 *   2. Text-Props werden als TEXT-KNOTEN injiziert (Element.textContent), NIE
 *      als HTML — der Browser escaped sie, ein "<script>…" landet als sicht-
 *      barer Text, nie als aktives Element.
 *   3. Bild-Quellen werden ge-whitelistet (istErlaubteBildQuelle): nur
 *      data:image/, http(s):// oder schemafreie (relative/root-relative) Pfade;
 *      jedes andere Schema (javascript:, data:text/html, vbscript:) wird
 *      verworfen (src entfernt).
 *
 * REIN/DETERMINISTISCH: gleiche Eingabe -> gleiche Ausgabe, kein Seiteneffekt.
 * Einzige Aussenwelt ist der browser-seitige DOMParser (parst nur, fuehrt
 * nichts aus). Ohne DOMParser (Server-Prerender) wird das entschaerfte Template
 * unveraendert zurueckgegeben (der Marker traegt den Original-Inhalt).
 */

import { entschaerfeHtml, type ImportFlag } from "./html-zu-puck";

/* ---- Baustein-Prop-Typen (geteilte Wahrheit mit app/puck/puck.config.tsx) ---- */

/** Ein editierbarer Text an einer Marker-Position (data-fc-text="<id>"). */
export interface StrukturText {
  id: string;
  /** Sprechendes Feld-Label fuer die Sidebar (gekuerzter Original-Inhalt). */
  label: string;
  /** Aktueller Textwert — als TEXT-Knoten injiziert (nie als HTML). */
  wert: string;
}

/** Ein editierbares Bild an einer Marker-Position (data-fc-bild="<id>"). */
export interface StrukturBild {
  id: string;
  /** Sprechendes Feld-Label fuer die Sidebar. */
  label: string;
  /** Bildquelle — beim Injizieren ge-whitelistet (istErlaubteBildQuelle). */
  src: string;
  alt: string;
}

export interface StrukturBlockProps {
  id: string;
  /** Original-Sektion-HTML mit Marker-Attributen, bereits entschaerft; im
   *  Render defensiv erneut entschaerft (Vorbild HtmlBlock). */
  template: string;
  texte: StrukturText[];
  bilder: StrukturBild[];
}

/** Marker-Attribut fuer eine Text-Position. Wert = zugehoerige StrukturText.id. */
export const MARKER_TEXT = "data-fc-text";
/** Marker-Attribut fuer eine Bild-Position. Wert = zugehoerige StrukturBild.id. */
export const MARKER_BILD = "data-fc-bild";

export interface StrukturErgebnis {
  html: string;
  flags: ImportFlag[];
}

/**
 * Whitelist fuer Bildquellen (Prop-getriebene src). Erlaubt:
 *   · data:image/…      (serialisiertes Inline-SVG u.a.)
 *   · http(s)://…        (absolute Web-Quelle)
 *   · schemafreie Pfade  (relativ/root-relativ, z.B. /import/<slug>/bild.png)
 * Verworfen wird jede Quelle mit einem ANDEREN Schema (javascript:, vbscript:,
 * data:text/html, file: …) — Verteidigung in der Tiefe, obwohl <img src>
 * ohnehin kein JS ausfuehrt und on*-Attribute schon entschaerft sind.
 */
/** Kollabiert Whitespace + trimmt — fuer den „un-editiert?"-Vergleich zwischen
 *  Prop-Wert und Marker-Inhalt (textContent traegt Layout-Whitespace des Markups). */
function normWs(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function istErlaubteBildQuelle(src: string): boolean {
  const s = (src ?? "").trim();
  if (!s) return false;
  if (/^data:image\//i.test(s)) return true;
  if (/^https?:\/\//i.test(s)) return true;
  // Irgendein anderes explizites Schema (`name:`) -> ablehnen.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false;
  // Schemafrei: relativer oder root-relativer Pfad.
  return true;
}

/**
 * Injiziert die Prop-Werte an ihre Marker-Positionen im (entschaerften)
 * Template und liefert das fertige, sichere HTML zurueck. Rein/deterministisch.
 *
 * Ohne DOMParser (Server-Prerender): das entschaerfte Template kommt
 * unveraendert zurueck — der Marker traegt bereits den Original-Inhalt, es
 * fehlen also keine Inhalte (nur eine ggf. editierte Fassung wird erst nach dem
 * Client-Mount sichtbar).
 */
export function injiziereStruktur(
  template: string,
  texte: readonly StrukturText[] = [],
  bilder: readonly StrukturBild[] = [],
): StrukturErgebnis {
  /* 1) Entschaerfen mit dem GETESTETEN HtmlBlock-Sanitizer. */
  const { html: sicher, flags } = entschaerfeHtml(template ?? "");
  if (typeof DOMParser === "undefined") {
    return { html: sicher, flags };
  }

  /* 2) Sicheres Markup parsen (fuehrt nichts aus) und an Markern injizieren. */
  const doc = new DOMParser().parseFromString(`<div data-fc-wrap>${sicher}</div>`, "text/html");
  const wrap = doc.body.firstElementChild;
  if (!wrap) return { html: "", flags };

  const textWert = new Map<string, string>();
  for (const t of texte) textWert.set(t.id, t.wert ?? "");
  wrap.querySelectorAll(`[${MARKER_TEXT}]`).forEach((el) => {
    const id = el.getAttribute(MARKER_TEXT);
    if (!id || !textWert.has(id)) return;
    const wert = textWert.get(id) ?? "";
    /* UN-EDITIERT → Original-Markup BEWAHREN (Fix K3, Leons Layout-Treue):
       Ist der Prop-Wert (space-normiert) identisch mit dem aktuellen Inhalt des
       Markers, wurde der Text NICHT editiert — dann NICHTS ueberschreiben, damit
       inline-Markup (z.B. <h2>Unsere <span class="accent">Mission</span></h2>)
       erhalten bleibt. Sonst plaettete die textContent-Zuweisung den Span zu
       EINEM Textknoten und veraenderte damit den DIREKTEN Textinhalt des Elements
       (aus „Unsere " wird „Unsere Mission") — was die Original-Optik verfaelscht
       (Gradient-Akzent weg) und Geometrie-/Hero-Messungen gegen das Original
       kippen laesst. Erst eine ECHTE Aenderung (Sidebar-Edit) plaettet bewusst zu
       reinem Text (dokumentierter Trade-off). Vergleich space-normiert, weil
       textContent Layout-Whitespace des Markups traegt. */
    if (normWs(el.textContent) === normWs(wert)) return;
    /* TEXT-Knoten: der Browser escaped den Wert — kein HTML-Pfad. */
    el.textContent = wert;
  });

  const bildNach = new Map<string, StrukturBild>();
  for (const b of bilder) bildNach.set(b.id, b);
  wrap.querySelectorAll(`[${MARKER_BILD}]`).forEach((el) => {
    const id = el.getAttribute(MARKER_BILD);
    if (!id) return;
    const b = bildNach.get(id);
    if (!b) return;
    if (istErlaubteBildQuelle(b.src)) el.setAttribute("src", b.src);
    else el.removeAttribute("src");
    el.setAttribute("alt", b.alt ?? "");
  });

  return { html: wrap.innerHTML, flags };
}
