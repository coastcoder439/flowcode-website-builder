/*
 * lib/import/html-zu-puck.ts — Welle 4b, Ordner-Import Stufe-C-light
 * (docs/editor-vereinheitlichung.md §9/4b): deterministische, REINE
 * Uebersetzung einer statischen HTML-Datei in das Puck-Datenmodell.
 *
 * KEIN LLM, KEINE Heuristik ueber das dokumentierte Mapping hinaus, KEIN
 * Seiteneffekt (Netzwerk/FS/Storage) — gleiche Eingabe -> gleiche Ausgabe.
 * Die einzige Aussenwelt ist der Browser-`DOMParser` (rein: parst nur, fuehrt
 * nichts aus — <script> im geparsten Dokument laeuft nicht). Diese Datei wird
 * ausschliesslich clientseitig importiert (der ganze Import-Flow lebt im
 * Browser hinter der File System Access API), nie in einer API-Route.
 *
 * MAPPING (deterministisch, §9/4b):
 *   body-Kinder                          -> Sektionen (SektionBlock)
 *     Container-Tags (section/header/footer/main/div) auf oberster Ebene
 *     werden je EIN SektionBlock; ihr Inneres wandert in den Slot `kinder`.
 *     Nicht-Container auf oberster Ebene (streunendes h1/p/img/...) werden
 *     direkt als Baustein an die Wurzel gehaengt.
 *   innerhalb einer Sektion / an der Wurzel:
 *     h1..h6            -> TextBlock (variante h1|h2|h3, h3..h6 -> h3)
 *     p                 -> TextBlock (variante p)
 *     img               -> BildBlock (src/alt/breiteProzent)
 *     uebriges Markup   -> HtmlBlock (outerHTML, ENTSCHAERFT)
 *
 * ENTSCHAERFUNG (deterministisch, dokumentiert; KEIN externer Sanitizer — die
 * Grenze wird ehrlich benannt): entfernt + flaggt <script>, <iframe>,
 * <object>/<embed>, on*-Attribute, javascript:-URLs, <link rel=stylesheet>
 * (extern). <style> wird NICHT uebernommen und als geflaggt notiert — beim
 * Stufe-C-light-Import geht Styling ehrlicherweise verloren.
 *
 * WELLE 5a — Styles uebernehmen (docs/editor-vereinheitlichung.md §10/5a):
 * Fuer eine EIGENE gebaute Seite (Next-`out/`) laesst sich das Standard-
 * Verwerfen abschalten: mit opts.styleUebernehmen werden same-origin
 * <link rel=stylesheet> (href, relativ/root-relativ) und <style>-Bloecke
 * (Inhalt) NICHT geflaggt, sondern im Bericht gesammelt (stylesheets +
 * inlineStyles). Der unreine Teil (CSS-Datei finden + kopieren) liegt wie bei
 * den Bildern getrennt in lib/import/ordner-import.ts. <script> bleibt IMMER
 * geflaggt. Cross-origin-Stylesheets bleiben ebenfalls geflaggt (aus einer
 * fremden Herkunft laesst sich deterministisch nichts kopieren).
 *
 * ASSETS bleiben hier unangetastet: BildBlock.src traegt die Original-Referenz
 * aus dem HTML. Die (asynchrone, unreine) Aufloesung gegen den gewaehlten
 * Ordner passiert getrennt (lib/import/ordner-import.ts) und schreibt die
 * neuen Quellen ueber die reine `ersetzeBildQuellen` zurueck.
 */

import type { ComponentData, Data, Slot } from "@puckeditor/core";
import { entferneFremdkoerper, erkenntFramework, type FrameworkErkennung } from "./fremdkoerper-filter";
import { baueOutlineMitElementen } from "./dom-outline";
import { validiereSegmentierung, type BlockTyp, type Segmentierung } from "./gemma-contract";
/* Phase 4b (struktur-erhaltendes Mapping): Marker-Attribut-Namen + Prop-Typen des
 * StrukturBlock. Import statt Neu-Definition = eine Quelle der Wahrheit (die
 * Injektion in struktur-injektion.ts liest exakt dieselben Marker). Der Import ist
 * ZYKLISCH (struktur-injektion importiert entschaerfeHtml/ImportFlag von hier),
 * aber sicher: beide Seiten nutzen die importierten Namen NUR in Funktionsruempfen,
 * nie auf Modul-Init-Ebene. */
import {
  MARKER_BILD,
  MARKER_TEXT,
  type StrukturBild,
  type StrukturBlockProps,
  type StrukturText,
} from "./struktur-injektion";

/* ---- Baustein-Prop-Typen (geteilte Wahrheit mit app/puck/puck.config.tsx) ----
 * puck.config.tsx importiert diese Typen (wie GrafikLayerBlockProps aus
 * grafik-setup-to-puck.ts) — so bleiben Import-Adapter und Puck-Config
 * garantiert synchron. Die `id` verwaltet Puck fuer Wurzel-Items selbst; im
 * Import (auch fuer verschachtelte Slot-Kinder) vergeben wir sie stabil. */

export type TextVariante = "h1" | "h2" | "h3" | "p";

export interface TextBlockProps {
  id: string;
  text: string;
  variante: TextVariante;
}

export interface BildBlockProps {
  id: string;
  src: string;
  alt: string;
  /** Anzeigebreite in Prozent der Spalte (Hoehe folgt dem Seitenverhaeltnis). */
  breiteProzent: number;
}

export interface HtmlBlockProps {
  id: string;
  /** Bereits ENTSCHAERFTES Markup (s. Dateikopf) — im Puck-render defensiv
   *  erneut entschaerft. */
  html: string;
}

export interface SektionBlockProps {
  id: string;
  /** CSS-Farbe des Sektions-Hintergrunds ("transparent" = keiner). */
  hintergrund: string;
  /** Puck-Slot: die Kind-Bausteine der Sektion (ComponentData[]). */
  kinder: Slot;
}

/* ---- Bericht-Typen ---- */

/** Ein entferntes/nicht-uebernommenes Element mit Begruendung — ehrliches
 *  Flagging als fester Teil des Import-Berichts (§9/4b). */
export interface ImportFlag {
  grund: string;
  detail: string;
}

export interface ImportStatistik {
  sektionen: number;
  texte: number;
  bilder: number;
  htmlBloecke: number;
}

export interface ImportBericht {
  data: Data;
  flags: ImportFlag[];
  statistik: ImportStatistik;
  /** Jede erzeugte Bildquelle mit ihrer Baustein-id und HERKUNFT — Grundlage
   *  der getrennten, asynchronen Asset-Aufloesung.
   *  quelle="bild": eigenstaendiger BildBlock → Rueckschrift ueber die id.
   *  quelle="html": Bild-/Hintergrund-Referenz INNERHALB eines HtmlBlock-Markups
   *  (Welle 5a) → Rueckschrift ueber String-Ersatz der Original-src (s.
   *  ersetzeBildQuellen). So bleiben Bens Klassen/Layout im HtmlBlock erhalten
   *  (nur HtmlBlock traegt die uebernommene CSS), die Bilder werden trotzdem
   *  echte, existierende Quellen. */
  bilder: { id: string; src: string; quelle: "bild" | "html" }[];
  /** Welle 5a: same-origin Stylesheet-Referenzen (href), in Dokument-
   *  Reihenfolge, dedupliziert. Nur gefuellt, wenn opts.styleUebernehmen —
   *  sonst leer (die Stylesheets wurden dann als Flag verworfen). */
  stylesheets: string[];
  /** Welle 5a: Inhalte aller <style>-Bloecke, in Dokument-Reihenfolge,
   *  dedupliziert. Nur gefuellt, wenn opts.styleUebernehmen. Der Aufrufer
   *  fasst sie zu EINER Datei zusammen (§10/5a). */
  inlineStyles: string[];
  /** N15: erkanntes Framework (Marker /_next/static/) — Diagnose fuer den
   *  Bericht, spaeter Strategie-Steuernd (fremdkoerper-filter.ts). */
  framework: FrameworkErkennung;
}

/** Welle 5a: Sammelbehaelter fuer uebernommene Styles. Wird durch den
 *  Bau-Kontext gereicht (null = nicht uebernehmen → altes Verwerf-/Flag-
 *  Verhalten). */
interface StilSammler {
  stylesheets: string[];
  inlineStyles: string[];
}

/** Same-origin heißt hier: relativ oder root-relativ (kein absolutes
 *  http(s):// und kein protokoll-relatives //host). Nur solche Referenzen kann
 *  der Ordner-Import deterministisch im gewaehlten Ordner wiederfinden. */
function istSelbeHerkunft(href: string): boolean {
  return !/^(https?:)?\/\//i.test(href.trim());
}

/** Welle 5a: kopierbare, same-origin Bildquelle — ein relativer/root-relativer
 *  ECHTER Pfad. KEIN data:/http(s):/blob:/protokoll-relativ/reiner Anker. Nur
 *  solche Referenzen lassen sich deterministisch im Import-Ordner wiederfinden
 *  (schaerfer als istSelbeHerkunft, das data: faelschlich als „selbe" wertete). */
function istLokaleBildQuelle(src: string): boolean {
  const s = src.trim();
  if (!s) return false;
  return !/^(data:|https?:|blob:|\/\/|#)/i.test(s);
}

/** Findet alle url(...)-Pfade in einem CSS-Text/Style-Attribut (Hintergrund-
 *  bilder u.a.) und gibt die ROHEN Pfad-Zeichenketten zurueck — genau so, wie
 *  sie im Markup stehen (Grundlage des spaeteren String-Ersatzes). */
function urlPfade(css: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) out.push(m[2].trim());
  return out;
}

/* ---- Konstanten ---- */

const CONTAINER_TAGS = new Set(["SECTION", "HEADER", "FOOTER", "MAIN", "DIV", "ARTICLE", "ASIDE", "NAV"]);
const UEBERSCHRIFT_TAGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
/* Elemente, die betriebsfremd sind und komplett entfernt + geflaggt werden. */
const GEFAEHRLICH_SELEKTOR = "script, iframe, object, embed";
const URL_ATTRIBUTE = ["href", "src", "action", "formaction", "xlink:href"];

const FLAG_SCRIPT = "Skript entfernt";
const FLAG_IFRAME = "Eingebetteter Rahmen entfernt";
const FLAG_OBJEKT = "Objekt/Embed entfernt";
const FLAG_STYLE = "Styling nicht uebernommen";
const FLAG_LINK = "Externes Stylesheet entfernt";
const FLAG_ON_ATTR = "Ereignis-Attribut entfernt";
const FLAG_JS_URL = "javascript:-URL entfernt";
/* N15: bekannter Hosting-/Vorschau-Fremdkoerper (z.B. Passwort-Gate) — VOR dem
   Mapping entfernt, damit er nicht als HtmlBlock mitexportiert wird. */
const FLAG_FREMDKOERPER = "Fremdkoerper entfernt";
/* Schritt IV: die Segmentierung passt nicht exakt zur frisch gebildeten Outline
   (z.B. weil das gemappte HTML von dem der Segmentierung abweicht). Best-effort-
   Mapping laeuft trotzdem — die Abweichung wird ehrlich gemeldet. */
const FLAG_SEG_ABWEICHUNG = "Segmentierung weicht von der Outline ab";
/* Schritt IV: eine Segment-ref liess sich nicht auf ein Element zurueckfuehren. */
const FLAG_SEG_REF_FEHLT = "Segment-Knoten ohne Element";
/* Schritt IV: Outline-Atome, die die Segmentierung nicht abgedeckt hat, wurden in
   einer Rest-Sektion aufgefangen (Verlustschutz). */
const FLAG_SEG_REST = "Nicht segmentierte Atome in Rest-Sektion";
/* Phase 4b (strukturtreu): eine DOM-Sektions-Wurzel lieferte kein Template (leer
   nach Entschaerfung) — kein Block erzeugt. */
const FLAG_STRUKTUR_LEER = "Struktur-Sektion ohne aufloesbare Atome uebersprungen";

/** Deterministischer id-Zaehler pro Import (stabil bei identischer Eingabe). */
class IdZaehler {
  private n = 0;
  constructor(private readonly praefix: string) {}
  naechste(typ: string): string {
    this.n += 1;
    return `imp-${this.praefix}${typ}-${this.n}`;
  }
}

/* ------------------------------------------------------------------ */
/* Entschaerfung                                                       */
/* ------------------------------------------------------------------ */

/** Entschaerft ein Element IN PLACE (Aufrufer uebergibt einen Klon) und sammelt
 *  Flags. Entfernt betriebsfremde Knoten, on*-Attribute und javascript:-URLs.
 *
 *  `stil` (Welle 5a): ist ein Sammler gesetzt, werden <style>-Inhalte und
 *  same-origin <link rel=stylesheet> dort gesammelt statt geflaggt (und in
 *  jedem Fall aus dem Markup entfernt — der Stil lebt danach in der eigenen
 *  Styles-Datei, nicht mehr im HtmlBlock). Ohne Sammler (Default) gilt das
 *  bisherige Verwerf-/Flag-Verhalten. */
function entschaerfeElement(el: Element, stil: StilSammler | null = null): ImportFlag[] {
  const flags: ImportFlag[] = [];

  const flagge = (grund: string, detail: string) => flags.push({ grund, detail });

  /* <style>: uebernehmen (sammeln) oder verwerfen (flaggen) — immer entfernen. */
  el.querySelectorAll("style").forEach((s) => {
    const text = (s.textContent ?? "").trim();
    if (stil) {
      if (text) stil.inlineStyles.push(text);
    } else {
      flagge(FLAG_STYLE, `<style>-Block (${text.length} Zeichen) verworfen`);
    }
    s.remove();
  });
  /* <link rel=stylesheet>: same-origin uebernehmen (sammeln), sonst flaggen. */
  el.querySelectorAll('link[rel~="stylesheet"]').forEach((l) => {
    const href = l.getAttribute("href") ?? "";
    if (stil && href && istSelbeHerkunft(href)) {
      stil.stylesheets.push(href);
    } else {
      flagge(FLAG_LINK, href || "<link rel=stylesheet>");
    }
    l.remove();
  });
  /* Skripte / Rahmen / Objekte. */
  el.querySelectorAll(GEFAEHRLICH_SELEKTOR).forEach((n) => {
    const tag = n.tagName.toLowerCase();
    if (tag === "script") flagge(FLAG_SCRIPT, n.getAttribute("src") ?? "<script> (inline)");
    else if (tag === "iframe") flagge(FLAG_IFRAME, n.getAttribute("src") ?? "<iframe>");
    else flagge(FLAG_OBJEKT, `<${tag}>`);
    n.remove();
  });

  /* on*-Attribute + javascript:-URLs auf allen verbleibenden Elementen
     (inklusive des Wurzel-Elements selbst). */
  const alle = [el, ...Array.from(el.querySelectorAll("*"))];
  for (const knoten of alle) {
    for (const attr of Array.from(knoten.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on")) {
        flagge(FLAG_ON_ATTR, `${knoten.tagName.toLowerCase()} [${name}]`);
        knoten.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRIBUTE.includes(name) && /^\s*javascript:/i.test(attr.value)) {
        flagge(FLAG_JS_URL, `${knoten.tagName.toLowerCase()} [${name}]`);
        knoten.removeAttribute(attr.name);
      }
    }
  }
  return flags;
}

/** Entschaerft rohes HTML-Markup (defensiver Render-Pfad des HtmlBlock).
 *  SSR-sicher: ohne DOMParser (Server-Prerender) unveraendert zurueck — das
 *  Markup ist beim Import bereits entschaerft worden. */
export function entschaerfeHtml(html: string): { html: string; flags: ImportFlag[] } {
  if (typeof DOMParser === "undefined") return { html, flags: [] };
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const huelle = doc.body.firstElementChild;
  if (!huelle) return { html: "", flags: [] };
  const flags = entschaerfeElement(huelle);
  return { html: huelle.innerHTML, flags };
}

/* ------------------------------------------------------------------ */
/* Mapping HTML -> Puck                                                 */
/* ------------------------------------------------------------------ */

interface BauKontext {
  ids: IdZaehler;
  flags: ImportFlag[];
  statistik: ImportStatistik;
  bilder: { id: string; src: string; quelle: "bild" | "html" }[];
  /** Welle 5a: gesetzt → Styles uebernehmen; null → verwerfen/flaggen. */
  stil: StilSammler | null;
  /** Welle 5a: bereits registrierte html-interne Bildquellen — dieselbe
   *  /images/…-Datei wird ueber alle HtmlBloecke hinweg nur einmal aufgeloest. */
  htmlBildSrcs: Set<string>;
}

/** Variante fuer eine Ueberschrift: h1->h1, h2->h2, h3..h6->h3. */
function ueberschriftVariante(tag: string): TextVariante {
  if (tag === "H1") return "h1";
  if (tag === "H2") return "h2";
  return "h3";
}

/** Erzeugt einen TextBlock aus reinem Textinhalt. */
function textBlock(ctx: BauKontext, text: string, variante: TextVariante): ComponentData {
  ctx.statistik.texte += 1;
  const props: TextBlockProps = { id: ctx.ids.naechste("text"), text, variante };
  return { type: "TextBlock", props };
}

/** Erzeugt einen BildBlock aus einem <img>. */
function bildBlock(ctx: BauKontext, img: HTMLImageElement): ComponentData {
  ctx.statistik.bilder += 1;
  const id = ctx.ids.naechste("bild");
  const src = img.getAttribute("src") ?? "";
  const props: BildBlockProps = {
    id,
    src,
    alt: img.getAttribute("alt") ?? "",
    breiteProzent: 100,
  };
  if (src) ctx.bilder.push({ id, src, quelle: "bild" });
  return { type: "BildBlock", props };
}

/** Welle 5a: registriert die Bild- und Hintergrund-Referenzen INNERHALB eines
 *  (bereits entschaerften) Markup-Elements als kopierbare Assets — dedupliziert
 *  ueber ctx.htmlBildSrcs. Das Markup selbst bleibt hier unveraendert; die
 *  Original-src wird erst nach der (unreinen) Aufloesung per String-Ersatz in
 *  ersetzeBildQuellen umgebogen (s. dort). Ohne diese Registrierung blieben
 *  Bens <img>/background-image-Pfade (/images/…, /curtain/…) im HtmlBlock roh
 *  stehen und liefen auf dem Builder-Server ins 404. */
function registriereHtmlBilder(ctx: BauKontext, el: Element): void {
  const kandidaten: string[] = [];
  /* <img src> irgendwo im Markup. */
  el.querySelectorAll("img[src]").forEach((img) => kandidaten.push(img.getAttribute("src") ?? ""));
  /* Inline-style url(...) (Hintergrundbilder u.a.) — Element selbst + Nachfahren. */
  for (const knoten of [el, ...Array.from(el.querySelectorAll("[style]"))]) {
    const style = knoten.getAttribute("style");
    if (style) kandidaten.push(...urlPfade(style));
  }
  for (const src of kandidaten) {
    if (!istLokaleBildQuelle(src)) continue;
    if (ctx.htmlBildSrcs.has(src)) continue;
    ctx.htmlBildSrcs.add(src);
    ctx.statistik.bilder += 1;
    ctx.bilder.push({ id: ctx.ids.naechste("himg"), src, quelle: "html" });
  }
}

/** Erzeugt einen HtmlBlock aus beliebigem uebrigem Markup (entschaerft). */
function htmlBlock(ctx: BauKontext, el: Element): ComponentData | null {
  const klon = el.cloneNode(true) as Element;
  const flags = entschaerfeElement(klon, ctx.stil);
  ctx.flags.push(...flags);
  /* Welle 5a: Bilder im Markup fuer die Asset-Aufloesung anmelden (das Markup
     bleibt roh — die Original-src wird erst nach der Aufloesung ersetzt). */
  registriereHtmlBilder(ctx, klon);
  const markup = klon.outerHTML.trim();
  if (!markup) return null;
  ctx.statistik.htmlBloecke += 1;
  const props: HtmlBlockProps = { id: ctx.ids.naechste("html"), html: markup };
  return { type: "HtmlBlock", props };
}

/** Bildet eine Liste von DOM-Kindknoten auf Puck-Bausteine ab (eine Ebene —
 *  verschachtelte Container landen als HtmlBlock, s. Dateikopf). */
function mappeKinder(ctx: BauKontext, knoten: NodeListOf<ChildNode> | ChildNode[]): ComponentData[] {
  const out: ComponentData[] = [];
  for (const kind of Array.from(knoten)) {
    if (kind.nodeType === 3 /* Text */) {
      const text = (kind.textContent ?? "").trim();
      if (text) out.push(textBlock(ctx, text, "p"));
      continue;
    }
    if (kind.nodeType !== 1 /* Element */) continue;
    const el = kind as Element;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "IFRAME" || tag === "OBJECT" || tag === "EMBED" || tag === "STYLE") {
      /* Betriebsfremd — entfernen + flaggen, nichts erzeugen. <style> wird bei
         styleUebernehmen stattdessen gesammelt (Welle 5a). */
      if (tag === "SCRIPT") ctx.flags.push({ grund: FLAG_SCRIPT, detail: el.getAttribute("src") ?? "<script>" });
      else if (tag === "IFRAME") ctx.flags.push({ grund: FLAG_IFRAME, detail: el.getAttribute("src") ?? "<iframe>" });
      else if (tag === "STYLE") {
        const text = (el.textContent ?? "").trim();
        if (ctx.stil) {
          if (text) ctx.stil.inlineStyles.push(text);
        } else {
          ctx.flags.push({ grund: FLAG_STYLE, detail: "<style>-Block verworfen" });
        }
      } else ctx.flags.push({ grund: FLAG_OBJEKT, detail: `<${tag.toLowerCase()}>` });
      continue;
    }
    if (tag === "LINK" && /\bstylesheet\b/i.test(el.getAttribute("rel") ?? "")) {
      const href = el.getAttribute("href") ?? "";
      /* Welle 5a: same-origin Stylesheet uebernehmen (sammeln), sonst flaggen. */
      if (ctx.stil && href && istSelbeHerkunft(href)) ctx.stil.stylesheets.push(href);
      else ctx.flags.push({ grund: FLAG_LINK, detail: href || "<link rel=stylesheet>" });
      continue;
    }
    if (UEBERSCHRIFT_TAGS.has(tag)) {
      const text = (el.textContent ?? "").trim();
      if (text) out.push(textBlock(ctx, text, ueberschriftVariante(tag)));
      continue;
    }
    if (tag === "P") {
      const text = (el.textContent ?? "").trim();
      if (text) out.push(textBlock(ctx, text, "p"));
      continue;
    }
    if (tag === "IMG") {
      out.push(bildBlock(ctx, el as HTMLImageElement));
      continue;
    }
    /* Uebriges Markup -> HtmlBlock. */
    const block = htmlBlock(ctx, el);
    if (block) out.push(block);
  }
  return out;
}

/** Erzeugt einen SektionBlock aus einem Container-Element. */
function sektionBlock(ctx: BauKontext, el: Element): ComponentData {
  ctx.statistik.sektionen += 1;
  const kinder = mappeKinder(ctx, el.childNodes);
  const hintergrund = "transparent";
  const props: SektionBlockProps = { id: ctx.ids.naechste("sektion"), hintergrund, kinder: kinder as Slot };
  return { type: "SektionBlock", props };
}

/** Ein „anonymer Wrapper" ist ein <div> ohne Klasse, id und Inline-Style — eine
 *  reine Struktur-/Hydration-Huelle (z.B. Bens inert-Gate-Wrapper, der die ganze
 *  Seite kapselt). Sein einziger Zweck ist Gruppierung; beim Import loesen wir
 *  ihn auf, statt Kopf/Inhalt/Fuss in EINER bedeutungslosen Sektion zu vergraben.
 *  Behavioral-Attribute (hidden/inert) zaehlen NICHT als Styling-/Identitaets-
 *  Anker — nur class/id/style. */
function istAnonymerWrapper(el: Element): boolean {
  return (
    el.tagName === "DIV" &&
    !(el.getAttribute("class") ?? "").trim() &&
    !(el.getAttribute("id") ?? "").trim() &&
    !(el.getAttribute("style") ?? "").trim()
  );
}

/** Eine Sektion ohne Kinder traegt keinen Inhalt — beim Import weggelassen
 *  (z.B. versteckte, leere Hydration-Huellen). */
function istLeereSektion(sektion: ComponentData): boolean {
  const kinder = (sektion.props as { kinder?: unknown }).kinder;
  return Array.isArray(kinder) && kinder.length === 0;
}

/**
 * HTML -> Puck-Data. Rein/deterministisch (nur DOMParser, kein Seiteneffekt).
 * `idPraefix` fliesst in die stabilen Baustein-ids ein (z.B. der Slug).
 * `styleUebernehmen` (Welle 5a): sammelt same-origin Stylesheets + <style>-
 * Bloecke im Bericht (stylesheets/inlineStyles), statt sie zu verwerfen.
 */
export function htmlZuPuck(
  html: string,
  opts: { idPraefix?: string; styleUebernehmen?: boolean } = {},
): ImportBericht {
  const stil: StilSammler | null = opts.styleUebernehmen ? { stylesheets: [], inlineStyles: [] } : null;
  const ctx: BauKontext = {
    ids: new IdZaehler(opts.idPraefix ? `${opts.idPraefix}-` : ""),
    flags: [],
    statistik: { sektionen: 0, texte: 0, bilder: 0, htmlBloecke: 0 },
    bilder: [],
    stil,
    htmlBildSrcs: new Set<string>(),
  };

  /* N15: Framework erkennen und Fremdkoerper (Passwort-Gate u.a.) VOR dem
     Mapping aussortieren. Jeder Treffer wird als Flag transparent gemeldet —
     rein/deterministisch, konservative benannte Selektor-Liste. */
  const framework = erkenntFramework(html);
  const gefiltert = entferneFremdkoerper(html);
  for (const e of gefiltert.entfernt) {
    ctx.flags.push({ grund: FLAG_FREMDKOERPER, detail: e.beschreibung });
  }

  const doc = new DOMParser().parseFromString(gefiltert.html, "text/html");
  const content: ComponentData[] = [];

  /* Kopf-Ebene: die eigentlichen Styling-Traeger (<style>, Stylesheets) liegen
     bei Next-Builds im <head>. Mit styleUebernehmen sammeln (§10/5a), sonst
     ehrlich flaggen (Stufe-C-light verliert das Styling). */
  sammleKopfStyles(ctx, doc);

  for (const kind of Array.from(doc.body.childNodes)) {
    if (kind.nodeType === 3) {
      const text = (kind.textContent ?? "").trim();
      if (text) content.push(textBlock(ctx, text, "p"));
      continue;
    }
    if (kind.nodeType !== 1) continue;
    const el = kind as Element;
    if (istAnonymerWrapper(el)) {
      /* Welle 5a: Bens Next-Build kapselt die ganze Seite in einen anonymen
         Wrapper-<div> (inert-Gate / Hydration-Root). Wuerde er zu EINER Sektion,
         verschwaenden Kopf/Inhalt/Fuss in einem einzigen Block (content.length
         waere winzig, alle Bilder in einem Riesen-HtmlBlock vergraben). Wir
         loesen den Wrapper daher auf und heben seine Kinder auf die oberste
         Ebene — header/main/footer bleiben ueber mappeKinder je EIN HtmlBlock
         MIT ihren Klassen (die uebernommene CSS greift), die Bilder darin werden
         ueber registriereHtmlBilder aufgeloest. */
      content.push(...mappeKinder(ctx, el.childNodes));
    } else if (CONTAINER_TAGS.has(el.tagName)) {
      const sektion = sektionBlock(ctx, el);
      /* Leere Sektionen (versteckte, inhaltslose Huellen) nicht mitnehmen. */
      if (!istLeereSektion(sektion)) content.push(sektion);
    } else {
      /* Nicht-Container auf oberster Ebene: direkt abbilden (kann leer sein
         -> dann faellt nichts an). */
      content.push(...mappeKinder(ctx, [el]));
    }
  }

  return {
    data: { root: {}, content },
    flags: dedupliziereFlags(ctx.flags),
    statistik: ctx.statistik,
    bilder: ctx.bilder,
    stylesheets: stil ? dedupliziereStrings(stil.stylesheets) : [],
    inlineStyles: stil ? dedupliziereStrings(stil.inlineStyles) : [],
    framework,
  };
}

/* ------------------------------------------------------------------ */
/* Schritt IV — Puck-Mapping aus dem Modell-Urteil (M5)                 */
/* ------------------------------------------------------------------ */

/* Tags, die im gerenderten Layout IMMER eine visuelle Grenze setzen (Block-/
 * Listen-/Tabellen-Fluss, Zeilenumbruch). Zwischen ihrem Text und dem Nachbar-
 * text gehoert ein Trenner, auch wenn im Markup kein Whitespace-Textknoten steht. */
const BLOCK_GRENZE_TAGS = new Set([
  "DIV", "P", "SECTION", "HEADER", "FOOTER", "MAIN", "NAV", "ARTICLE", "ASIDE",
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "DL", "DT", "DD",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH",
  "FIGURE", "FIGCAPTION", "BLOCKQUOTE", "PRE", "ADDRESS", "HR", "BR",
  "FORM", "FIELDSET", "LEGEND", "DETAILS", "SUMMARY",
]);

/* Inline-Display-Werte, die (per juice inliniertem style) einen sonst inline
 * fliessenden Knoten zu einem eigenen Layout-Kasten machen — der klassische
 * Wort-fuer-Wort-Reveal (<span style="display:inline-block;margin-right:…">Wort
 * </span>) glued sonst im textContent zu „FeststoffewieFutterreste". */
const BOX_DISPLAY = /display\s*:\s*(inline-block|block|flex|grid|inline-flex|inline-grid|table|table-cell|list-item)/i;

/** Ist `el` eine visuelle Layout-Grenze (Block-Tag, <br>, oder ein per Inline-
 *  style zum Kasten gemachter Inline-Knoten)? Nur dann setzt die Text-Extraktion
 *  einen Trenner um seinen Inhalt. Reine Inline-Auszeichnung (<em>/<strong>/<a>
 *  ohne Box-Display) bleibt ungetrennt — dort steht echter Whitespace ohnehin im
 *  Textknoten. */
function istLayoutGrenze(el: Element): boolean {
  if (BLOCK_GRENZE_TAGS.has(el.tagName)) return true;
  const style = el.getAttribute("style");
  return !!style && BOX_DISPLAY.test(style);
}

/** Sammelt den sichtbaren Text eines Elements und setzt an Layout-Grenzen einen
 *  Trenner ein — behebt den Whitespace-Verlust bei per-Wort-Spans (Leons
 *  „FeststoffewieFutterreste"-Befund 2026-07-23). Reine Textknoten werden 1:1
 *  uebernommen; Element-Kinder rekursiv, mit fuehrendem/abschliessendem Leer-
 *  raum, wenn sie eine Layout-Grenze sind. Am Ende Whitespace-Kollaps + Trim. */
function elementText(el: Element): string {
  const teile: string[] = [];
  const rein = (knoten: Node): void => {
    for (const kind of Array.from(knoten.childNodes)) {
      if (kind.nodeType === 3 /* Text */) {
        teile.push(kind.textContent ?? "");
        continue;
      }
      if (kind.nodeType !== 1 /* Element */) continue;
      const kindEl = kind as Element;
      const grenze = istLayoutGrenze(kindEl);
      if (grenze) teile.push(" ");
      rein(kindEl);
      if (grenze) teile.push(" ");
    }
  };
  rein(el);
  return teile.join("").replace(/\s+/g, " ").trim();
}

/** Trimmt + kollabiert Whitespace, MIT Layout-Grenzen-Trennern (s. elementText).
 *  Frueher ein reiner `el.textContent`-Kollaps — der verklebte per-Wort-Spans. */
function normTextContent(el: Element): string {
  return elementText(el);
}

/** Kopf-Ebene <style>/<link rel=stylesheet> sammeln (styleUebernehmen) bzw.
 *  ehrlich flaggen. Geteilt von htmlZuPuck und htmlZuPuckMitSegmentierung. */
function sammleKopfStyles(ctx: BauKontext, doc: Document | null): void {
  if (!doc) return;
  doc.head?.querySelectorAll("style").forEach((s) => {
    const text = (s.textContent ?? "").trim();
    if (ctx.stil) {
      if (text) ctx.stil.inlineStyles.push(text);
    } else {
      ctx.flags.push({ grund: FLAG_STYLE, detail: "<style> im <head> verworfen" });
    }
  });
  doc.head?.querySelectorAll('link[rel~="stylesheet"]').forEach((l) => {
    const href = l.getAttribute("href") ?? "";
    if (ctx.stil && href && istSelbeHerkunft(href)) ctx.stil.stylesheets.push(href);
    else ctx.flags.push({ grund: FLAG_LINK, detail: href || "<link rel=stylesheet>" });
  });
}

/** Skripte im ganzen Dokument als „nicht uebernommen" flaggen (Bausteine werden
 *  keine daraus; Dedup fasst identische Details zusammen). */
function flaggeSkripte(ctx: BauKontext, doc: Document | null): void {
  if (!doc) return;
  doc.querySelectorAll("script").forEach((s) => {
    ctx.flags.push({ grund: FLAG_SCRIPT, detail: s.getAttribute("src") ?? "<script> (inline)" });
  });
}

/** Ein „text"-Atom -> TextBlock (Variante aus dem Tag). Leerer Text -> lieber das
 *  Markup als HtmlBlock behalten, statt einen leeren TextBlock zu erzeugen. */
function textBausteinAusElement(ctx: BauKontext, el: Element): ComponentData | null {
  const text = normTextContent(el);
  if (!text) return htmlBlock(ctx, el);
  const variante: TextVariante = UEBERSCHRIFT_TAGS.has(el.tagName)
    ? ueberschriftVariante(el.tagName)
    : "p";
  return textBlock(ctx, text, variante);
}

/** Erzeugt einen BildBlock aus einer beliebigen Quelle (nicht nur <img>). Nur
 *  aufloesbare LOKALE Quellen werden zur Asset-Aufloesung angemeldet; data:/http:/
 *  (z.B. serialisiertes Inline-SVG) tragen ihre Quelle schon in sich. */
function bildBlockAusSrc(ctx: BauKontext, src: string, alt: string): ComponentData {
  ctx.statistik.bilder += 1;
  const id = ctx.ids.naechste("bild");
  const props: BildBlockProps = { id, src, alt, breiteProzent: 100 };
  if (istLokaleBildQuelle(src)) ctx.bilder.push({ id, src, quelle: "bild" });
  return { type: "BildBlock", props };
}

/** Serialisiert ein <svg> als self-contained data-URL-BildBlock. Ein Inline-SVG
 *  IST ein Bild — als BildBlock ist es editierbar und braucht keinen HtmlBlock.
 *  Sicher: BildBlock rendert die Quelle in <img src>, worin Browser SVG-Skripte
 *  nie ausfuehren (kein aktiver Inhalt). */
function svgBildBlock(ctx: BauKontext, svg: Element): ComponentData {
  const klon = svg.cloneNode(true) as Element;
  if (!klon.getAttribute("xmlns")) klon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const src = "data:image/svg+xml," + encodeURIComponent(klon.outerHTML);
  return bildBlockAusSrc(ctx, src, klon.getAttribute("aria-label") ?? "");
}

/** Erste LOKALE url(...) im Inline-style (Hintergrundbild) — Grundlage, ein reines
 *  Hintergrund-Element als BildBlock statt HtmlBlock abzubilden. */
function hintergrundUrl(el: Element): string | null {
  const style = el.getAttribute("style") || "";
  for (const u of urlPfade(style)) {
    if (istLokaleBildQuelle(u)) return u;
  }
  return null;
}

/** Ein „bild"-Atom -> BildBlock, wo eine echte Bildquelle vorliegt:
 *  <img> · ein einzelnes eingebettetes <img> · Inline-SVG (als data-URL) ·
 *  reines Inline-Hintergrundbild. Sonst (canvas/video/komplexe Deko mit Text)
 *  HtmlBlock, der seinen Look ueber die inlinierte CSS-je-Baustein selbst traegt. */
function bildBausteinAusElement(ctx: BauKontext, el: Element): ComponentData | null {
  if (el.tagName === "IMG") return bildBlock(ctx, el as HTMLImageElement);
  const leer = normTextContent(el) === "";
  const innerImg = el.querySelector("img");
  if (innerImg && leer) return bildBlock(ctx, innerImg as HTMLImageElement);
  if (el.tagName === "SVG") return svgBildBlock(ctx, el);
  const innerSvg = el.querySelector("svg");
  if (innerSvg && leer) return svgBildBlock(ctx, innerSvg);
  const bg = hintergrundUrl(el);
  if (bg && leer) return bildBlockAusSrc(ctx, bg, el.getAttribute("aria-label") ?? "");
  return htmlBlock(ctx, el);
}

/** Blocktyp -> passender Baustein. „html" bleibt der Rueckfall fuer echt
 *  nicht-abbildbares Rest-Markup. */
function bausteinFuerSegBlock(ctx: BauKontext, el: Element, typ: BlockTyp): ComponentData | null {
  if (typ === "text") return textBausteinAusElement(ctx, el);
  if (typ === "bild") return bildBausteinAusElement(ctx, el);
  return htmlBlock(ctx, el);
}

/** Deterministischer Typ-Rat fuer die Verlustschutz-Rest-Sektion (nur benutzt,
 *  wenn die Segmentierung ein Atom nicht abgedeckt hat). */
function rateTyp(el: Element): BlockTyp {
  const tag = el.tagName;
  if (tag === "IMG" || tag === "PICTURE" || tag === "SVG" || tag === "VIDEO" || tag === "CANVAS") return "bild";
  if (UEBERSCHRIFT_TAGS.has(tag) || tag === "P") return "text";
  return "html";
}

/** Baut eine SektionBlock-Komponente aus fertigen Kind-Bausteinen (oder null,
 *  wenn keine Kinder — leere Sektionen werden nicht mitgenommen). */
function sektionAusKindern(ctx: BauKontext, kinder: ComponentData[]): ComponentData | null {
  if (kinder.length === 0) return null;
  ctx.statistik.sektionen += 1;
  const props: SektionBlockProps = {
    id: ctx.ids.naechste("sektion"),
    hintergrund: "transparent",
    kinder: kinder as Slot,
  };
  return { type: "SektionBlock", props };
}

/**
 * HTML + Segmentierungs-Urteil (Schritt III) -> Puck-Data. Rein/deterministisch
 * (nur DOMParser, kein Seiteneffekt). Ersetzt die Ein-Ebenen-Grobheuristik von
 * `htmlZuPuck` durch das feine Modell-/Fallback-Urteil: jede gemma-Sektion wird
 * ein SektionBlock, ihre Bloecke werden feine TextBlock/BildBlock/HtmlBlock-
 * Kinder. `htmlZuPuck` bleibt als deterministischer Fallback bestehen.
 *
 * ERWARTUNG: `html` ist dasselbe (Freeze-)HTML, aus dem Schritt III seine Outline
 * gebildet hat — die refs decken sich dann deterministisch. Fuer die CSS-je-
 * Baustein („jeder Block traegt seinen Look selbst") inliniert der SKRIPT-Pfad
 * (scripts/import-fein.mjs, devDep juice) die aufgeloesten CSS-Regeln VOR dem
 * Mapping als style-Attribute; dieser reine Adapter liest sie nur mit (bleibt
 * juice-frei) — jeder erzeugte HtmlBlock traegt die inlinierte CSS in seinem
 * outerHTML und „zerfliegt" nicht mehr, wenn er aus seiner Vorfahren-Kette
 * geloest wird. Ohne den Inline-Vorlauf funktioniert das Mapping weiterhin,
 * nur ohne den Fidelity-Gewinn.
 *
 * `styleUebernehmen` (Welle 5a): sammelt same-origin Stylesheets + <style>-
 * Bloecke im Bericht (stylesheets/inlineStyles), statt sie zu verwerfen.
 */
export function htmlZuPuckMitSegmentierung(
  html: string,
  segmentierung: Segmentierung,
  opts: { idPraefix?: string; styleUebernehmen?: boolean } = {},
): ImportBericht {
  const stil: StilSammler | null = opts.styleUebernehmen ? { stylesheets: [], inlineStyles: [] } : null;
  const ctx: BauKontext = {
    ids: new IdZaehler(opts.idPraefix ? `${opts.idPraefix}-` : ""),
    flags: [],
    statistik: { sektionen: 0, texte: 0, bilder: 0, htmlBloecke: 0 },
    bilder: [],
    stil,
    htmlBildSrcs: new Set<string>(),
  };

  const framework = erkenntFramework(html);

  /* N15: Fremdkoerper VOR dem Mapping raus (deckt sich mit Schritt III, der
     ebenfalls auf der gefilterten HTML segmentiert). */
  const gefiltert = entferneFremdkoerper(html);
  for (const e of gefiltert.entfernt) {
    ctx.flags.push({ grund: FLAG_FREMDKOERPER, detail: e.beschreibung });
  }

  /* Outline + ref->Element aus GENAU dieser gefilterten HTML — dieselbe
     Traversierung wie in Schritt III, also deckungsgleiche refs. */
  const { knoten, elemente, doc } = baueOutlineMitElementen(gefiltert.html);
  sammleKopfStyles(ctx, doc);
  flaggeSkripte(ctx, doc);

  /* Mechanische Selbstkontrolle: passt das Urteil zur frischen Outline? Bei
     Abweichung wird best-effort gemappt (nie ein Absturz), Abweichung geflaggt. */
  const geprueft = validiereSegmentierung(segmentierung, knoten);
  if (!geprueft.ok) ctx.flags.push({ grund: FLAG_SEG_ABWEICHUNG, detail: geprueft.fehler });

  const content: ComponentData[] = [];
  const benutzt = new Set<string>();

  for (const sektion of segmentierung.sektionen) {
    const kinder: ComponentData[] = [];
    for (const block of sektion.bloecke) {
      const el = elemente.get(block.ref);
      if (!el) {
        ctx.flags.push({ grund: FLAG_SEG_REF_FEHLT, detail: block.ref });
        continue;
      }
      benutzt.add(block.ref);
      const baustein = bausteinFuerSegBlock(ctx, el, block.typ);
      if (baustein) kinder.push(baustein);
    }
    const sektionBaustein = sektionAusKindern(ctx, kinder);
    if (sektionBaustein) content.push(sektionBaustein);
  }

  /* Verlustschutz: von der Segmentierung nicht abgedeckte Outline-Atome (bei
     valider Segmentierung leer) in einer Rest-Sektion auffangen — nie still
     verloren. */
  const rest = knoten.filter((k) => !benutzt.has(k.ref));
  if (rest.length > 0) {
    const kinder: ComponentData[] = [];
    for (const k of rest) {
      const el = elemente.get(k.ref);
      if (!el) continue;
      const baustein = bausteinFuerSegBlock(ctx, el, rateTyp(el));
      if (baustein) kinder.push(baustein);
    }
    const sektionBaustein = sektionAusKindern(ctx, kinder);
    if (sektionBaustein) {
      ctx.flags.push({ grund: FLAG_SEG_REST, detail: `${rest.length} Atome ohne Sektion` });
      content.push(sektionBaustein);
    }
  }

  return {
    data: { root: {}, content },
    flags: dedupliziereFlags(ctx.flags),
    statistik: ctx.statistik,
    bilder: ctx.bilder,
    stylesheets: stil ? dedupliziereStrings(stil.stylesheets) : [],
    inlineStyles: stil ? dedupliziereStrings(stil.inlineStyles) : [],
    framework,
  };
}

/* ------------------------------------------------------------------ */
/* Phase 4b — Struktur-erhaltendes Mapping (StrukturBlock)              */
/* ------------------------------------------------------------------ */

/**
 * Gemeinsamer Vorfahr zweier Elemente (oder null). Liefert `a`, wenn `a` Vorfahr
 * von `b` ist (und umgekehrt) — reiner Ketten-Vergleich, kein DOM-Feature ausser
 * parentElement.
 */
function gemeinsamerVorfahr(a: Element, b: Element): Element | null {
  const vorfahren = new Set<Element>();
  for (let n: Element | null = a; n; n = n.parentElement) vorfahren.add(n);
  for (let m: Element | null = b; m; m = m.parentElement) {
    if (vorfahren.has(m)) return m;
  }
  return null;
}

/** Kleinster gemeinsamer Vorfahr (LCA) einer Element-Liste (oder null). */
function findeLca(els: Element[]): Element | null {
  if (els.length === 0) return null;
  let anc: Element | null = els[0];
  for (let i = 1; i < els.length && anc; i++) anc = gemeinsamerVorfahr(anc, els[i]);
  return anc;
}

/** Kind-Index-Pfad von `von` (Vorfahr) hinab zu `bis` (Nachfahr/gleich), oder
 *  null wenn `bis` kein Nachfahr von `von` ist. Deterministisch, damit sich ein
 *  Original-Knoten im frischen (noch unbeschnittenen) Klon exakt wiederfinden
 *  laesst. */
function indexPfad(von: Element, bis: Element): number[] | null {
  const pfad: number[] = [];
  let n: Element | null = bis;
  while (n && n !== von) {
    const eltern: Element | null = n.parentElement;
    if (!eltern) return null;
    pfad.unshift(Array.from(eltern.children).indexOf(n));
    n = eltern;
  }
  return n === von ? pfad : null;
}

/** Folgt einem Kind-Index-Pfad ab `wurzel` (im Klon). */
function knotenAnPfad(wurzel: Element, pfad: number[]): Element | null {
  let n: Element | null = wurzel;
  for (const i of pfad) {
    n = n?.children[i] ?? null;
    if (!n) return null;
  }
  return n;
}

/** Marker-Ziel eines „bild"-Atoms: das <img> selbst oder ein einzeln enthaltenes
 *  <img>. Fuer Nicht-<img>-Medien (canvas/svg/Hintergrund-DIV) gibt es keinen
 *  sinnvollen editierbaren src-Marker — der Knoten bleibt reines Template-Markup
 *  (seine Quelle wird ueber die Bild-Registrierung dennoch aufgeloest). */
function bildMarkerZiel(atom: Element): HTMLImageElement | null {
  if (atom.tagName === "IMG") return atom as HTMLImageElement;
  const innen = atom.querySelector("img");
  return innen ? (innen as HTMLImageElement) : null;
}

/** Einzeiler-Kuerzung fuer sprechende Sidebar-Labels (texte[].label u.a.). */
function kuerze(text: string, max: number): string {
  const eine = text.replace(/\s+/g, " ").trim();
  return eine.length <= max ? eine : `${eine.slice(0, max - 1)}…`;
}

/* ------------------------------------------------------------------ */
/* Phase 4b — DOM-treue Sektionierung (Fix K3, Leons Befund 2026-07-23) */
/* ------------------------------------------------------------------ */
/*
 * WARUM NICHT gemma-Sektionen als Grenze (der alte strukturtreu-Bug): gemma
 * urteilt SEMANTISCH ("Hero", "Ueber uns", "Features") — NICHT DOM-strukturell.
 * Wird eine echte Zweispalten-Sektion (z.B. block-prose: Fliesstext | Zitat)
 * von gemma auf zwei Sektionen aufgeteilt, bekommt jede ihre eigene, ZU TIEFE
 * LCA und wird zu einem vollbreiten Block — die Spalten STAPELN (Leons Befund:
 * "Das Konzept" zweispaltig → Einspalten-Stapel; project-oasis-Fehlerklasse).
 *
 * FIX: Die Sektionsgrenze kommt aus dem ECHTEN DOM-Container-Baum, nicht aus
 * gemma. Jeder natuerliche Top-Level-Container (section/header/footer/nav/…, ein
 * klassifizierter Layout-div) wird EIN StrukturBlock mit seinem VOLLSTAENDIGEN
 * Original-Markup — Spalten, Overlays und Grids bleiben darin unversehrt. Nur
 * bedeutungslose Huellen (main, body, klassen-/id-/stil-lose Wrapper-divs) werden
 * DURCHSCHRITTEN, damit die Seite nicht in EINEM Riesenblock landet, sondern die
 * Sektionen einzeln verschieb-/loeschbar bleiben. gemma liefert weiterhin das
 * Text/Bild-Urteil je Atom (Marker-Platzierung), aber NICHT mehr die Geometrie.
 */

/** Tags, die nie als Inhalt zaehlen (Kopf-/Skript-/Deko-Metadaten). */
const NICHT_INHALT = new Set(["script", "style", "link", "meta", "noscript", "template", "head", "title", "base"]);

/** Semantische/klassifizierte Sektions-Tags: werden IMMER als EIN Block emittiert
 *  (nie durchschritten) — ihr Inneres ist ein zusammenhaengendes Layout. */
const SEKTION_STOP_TAGS = new Set([
  "section", "header", "footer", "nav", "article", "aside", "figure", "form",
  "table", "ul", "ol", "dl", "blockquote",
]);

/** Tags, die als reine Gruppierungs-Huelle DURCHSCHRITTEN werden duerfen
 *  (main/body immer; div nur wenn anonym). */
const DURCHSTIEG_TAGS = new Set(["main", "body", "div"]);

/** Container-Tags, deren Anwesenheit als Kind einen anonymen Wrapper als reine
 *  Huelle ausweist (Kinder sind selbst Layout-Container, kein Fliess-Inhalt). */
const CONTAINER_KIND_TAGS = new Set([
  "div", "section", "header", "footer", "nav", "article", "aside", "main",
  "ul", "ol", "figure", "form",
]);

/** Traegt das Element einen direkten (nicht ererbten) nicht-leeren Textknoten? */
function hatDirektText(el: Element): boolean {
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3 && (n.textContent ?? "").trim()) return true;
  }
  return false;
}

/** Nicht-ignorierte Element-Kinder. */
function inhaltsKinder(el: Element): Element[] {
  return Array.from(el.children).filter((k) => !NICHT_INHALT.has(k.tagName.toLowerCase()));
}

/** Liest den `display`-Wert aus dem (ggf. von juice inlined) style-Attribut. */
function inlineDisplay(el: Element): string {
  const m = /(?:^|;)\s*display\s*:\s*([a-z-]+)/i.exec(el.getAttribute("style") || "");
  return m ? m[1].toLowerCase() : "";
}

/**
 * Stapelt `el` seine Kinder VERTIKAL (→ Durchsteigen kann die Geometrie nicht
 * veraendern, weil die Kinder ohnehin untereinander stehen)? Entscheidungs-
 * grundlage ist die von juice inlinierte `display`/`flex-direction` — GENAU die
 * gerenderte Layout-Wahrheit. Nur bei einem beweisbar vertikalen Stapel (block/
 * flow-root/list-item bzw. flex-column) wird durchgestiegen; bei allem, was die
 * Kinder NEBENEINANDER anordnen koennte (flex-row, grid, inline-*, table, float
 * ist hier nicht erkennbar → konservativ), bleibt der Container EIN Block und
 * seine Spalten/Grids bleiben unversehrt (Leons Kernbefund). Fehlt jede inline-
 * display-Angabe (kein juice / attribut-los), gilt der HTML-Default Block =
 * vertikaler Fluss → sicher zum Durchsteigen.
 */
function stapeltVertikal(el: Element): boolean {
  const display = inlineDisplay(el);
  if (display === "" || display === "block" || display === "flow-root" || display === "list-item") return true;
  if (display === "flex" || display === "inline-flex") {
    const m = /(?:^|;)\s*flex-direction\s*:\s*([a-z-]+)/i.exec(el.getAttribute("style") || "");
    const dir = m ? m[1].toLowerCase() : "row";
    return dir === "column" || dir === "column-reverse";
  }
  /* grid, inline-block, inline, inline-grid, table*, contents, … → koennte neben-
     einander anordnen → NICHT durchsteigen. */
  return false;
}

/**
 * Ist `el` eine reine Durchstiegs-Huelle (→ NICHT als eigener Block emittieren,
 * sondern in ihre Kinder absteigen)? Bedingungen:
 *   · Tag ist main/body oder div (semantische/klassifizierte Sektions-Tags sind
 *     NIE eine Huelle — sie tragen zusammenhaengendes Layout),
 *   · kein eigener Direkt-Text (sonst als Block behalten),
 *   · mind. ein Container-Kind (sonst Inline-/Blatt-Reihe, z.B. per-Wort-Spans),
 *   · el stapelt seine Kinder beweisbar VERTIKAL (stapeltVertikal) — nur dann
 *     aendert Durchsteigen die Geometrie garantiert nicht.
 * Streu-Blattkinder (skip-link u.a.) werden beim Abstieg zu eigenen Mini-Bloecken
 * (bei vertikalem Fluss stapeln sie ohnehin — Treue bleibt gewahrt).
 */
function istDurchstiegsHuelle(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (SEKTION_STOP_TAGS.has(tag)) return false;
  if (!DURCHSTIEG_TAGS.has(tag)) return false;
  if (hatDirektText(el)) return false;
  const kinder = inhaltsKinder(el);
  if (kinder.length === 0) return false;
  if (!kinder.some((k) => CONTAINER_KIND_TAGS.has(k.tagName.toLowerCase()))) return false;
  return stapeltVertikal(el);
}

/** Enthaelt `el` (selbst oder im Subtree) mindestens ein Outline-Atom? */
function enthaeltAtom(el: Element, atome: Set<Element>): boolean {
  if (atome.has(el)) return true;
  for (const a of atome) if (el.contains(a)) return true;
  return false;
}

/**
 * Ermittelt die DOM-treuen Sektions-Wurzeln ab `wurzel`: steigt durch reine
 * Huellen ab und sammelt jeden ersten nicht-Huellen-Container (mit Atomen) als
 * eine Sektion. So bleibt jede echte Layout-Sektion (Spalten/Overlay/Grid) in
 * EINEM Template, waehrend bedeutungslose Wrapper aufgeloest werden.
 */
function sammleSektionsWurzeln(wurzel: Element, atome: Set<Element>): Element[] {
  const out: Element[] = [];
  const rein = (el: Element): void => {
    for (const kind of inhaltsKinder(el)) {
      if (!enthaeltAtom(kind, atome)) continue; // reine Deko/leer zwischen Sektionen
      if (istDurchstiegsHuelle(kind)) rein(kind);
      else out.push(kind);
    }
  };
  if (!istDurchstiegsHuelle(wurzel)) return enthaeltAtom(wurzel, atome) ? [wurzel] : [];
  rein(wurzel);
  return out;
}

/**
 * Baut EINEN StrukturBlock aus einer DOM-treuen Sektions-Wurzel (Fix K3). Anders
 * als der alte gemma-getriebene Weg (LCA aus verstreuten Atomen + Fremd-Beschnitt)
 * ist die Wurzel HIER bereits der exakte, disjunkte Sektions-Container — das gesamte
 * Original-Markup bleibt 1:1 Layout-Traeger, es wird NICHTS beschnitten (die
 * Sektionen ueberlappen per Konstruktion nicht). Innerhalb der Wurzel bekommt
 * jedes text/bild-Atom seinen Marker + editierbaren Prop-Wert.
 */
function baueSektionsBlockAusWurzel(
  ctx: BauKontext,
  wurzel: Element,
  typNach: Map<string, BlockTyp>,
  refNach: Map<Element, string>,
  alleAtome: Element[],
): ComponentData | null {
  const klon = wurzel.cloneNode(true) as Element;
  const texte: StrukturText[] = [];
  const bilder: StrukturBild[] = [];
  let tN = 0;
  let bN = 0;

  const eigenAtome = alleAtome.filter((a) => a === wurzel || wurzel.contains(a));
  for (const atom of eigenAtome) {
    const typ = typNach.get(refNach.get(atom) ?? "") ?? rateTyp(atom);
    if (typ === "text") {
      const wert = elementText(atom);
      if (!wert) continue; // leerer „Text" → kein Marker, bleibt Template-Markup
      const pfad = indexPfad(wurzel, atom);
      if (!pfad) continue;
      const ziel = knotenAnPfad(klon, pfad);
      if (!ziel) continue;
      const id = `t${(tN += 1)}`;
      ziel.setAttribute(MARKER_TEXT, id);
      texte.push({ id, label: kuerze(wert, 40), wert });
      ctx.statistik.texte += 1;
    } else if (typ === "bild") {
      const zielOrig = bildMarkerZiel(atom);
      if (!zielOrig) continue; // canvas/svg/bg → nur Template-Markup (kein src-Marker)
      const pfad = indexPfad(wurzel, zielOrig);
      if (!pfad) continue;
      const zielKlon = knotenAnPfad(klon, pfad);
      if (!zielKlon) continue;
      const src = zielOrig.getAttribute("src") ?? "";
      const alt = zielOrig.getAttribute("alt") ?? "";
      const id = `b${(bN += 1)}`;
      zielKlon.setAttribute(MARKER_BILD, id);
      bilder.push({ id, label: alt || kuerze(src.split("/").pop() ?? "Bild", 40), src, alt });
    }
    /* typ "html" → keine Marker, bleibt unangetastetes Template-Markup. */
  }

  const flags = entschaerfeElement(klon, ctx.stil);
  ctx.flags.push(...flags);
  registriereHtmlBilder(ctx, klon);

  const template = klon.outerHTML.trim();
  if (!template) return null;

  ctx.statistik.sektionen += 1;
  const props: StrukturBlockProps = { id: ctx.ids.naechste("struktur"), template, texte, bilder };
  return { type: "StrukturBlock", props };
}

/**
 * HTML + Segmentierungs-Urteil -> STRUKTUR-ERHALTENDE Puck-Data (Phase 4b). Jede
 * gemma-Sektion wird EIN StrukturBlock, dessen `template` das Original-Markup 1:1
 * traegt (Layout-Treue) und dessen texte[]/bilder[] die editierbaren Inhalte an
 * Marker-Positionen sind (Injektion: struktur-injektion.ts).
 *
 * GEGENSATZ zu htmlZuPuckMitSegmentierung (fein): das feine Mapping zerlegt eine
 * Sektion in lose Geschwister-Bausteine und ZERSTOERT das Layout (Hero-Overlay →
 * Stapel, Zweispalter → Einspalte). Das strukturtreue Mapping behaelt das Layout,
 * gibt aber Einzelelement-Drag INNERHALB einer Sektion auf (Treue vor
 * Granularitaet, Leons Prioritaet).
 *
 * ERWARTUNG wie htmlZuPuckMitSegmentierung: `html` ist dasselbe (Freeze-)HTML, aus
 * dem Schritt III die Outline gebildet hat — die refs decken sich deterministisch.
 * Fuer die Style-Treue liefert der Skript-Pfad (import-fein.mjs, juice) die inlined
 * Styles VOR dem Mapping; dieser reine Adapter liest sie nur mit (bleibt juice-frei).
 */
export function htmlZuPuckStrukturtreu(
  html: string,
  segmentierung: Segmentierung,
  opts: { idPraefix?: string; styleUebernehmen?: boolean } = {},
): ImportBericht {
  const stil: StilSammler | null = opts.styleUebernehmen ? { stylesheets: [], inlineStyles: [] } : null;
  const ctx: BauKontext = {
    ids: new IdZaehler(opts.idPraefix ? `${opts.idPraefix}-` : ""),
    flags: [],
    statistik: { sektionen: 0, texte: 0, bilder: 0, htmlBloecke: 0 },
    bilder: [],
    stil,
    htmlBildSrcs: new Set<string>(),
  };

  const framework = erkenntFramework(html);

  const gefiltert = entferneFremdkoerper(html);
  for (const e of gefiltert.entfernt) {
    ctx.flags.push({ grund: FLAG_FREMDKOERPER, detail: e.beschreibung });
  }

  const { knoten, elemente, doc } = baueOutlineMitElementen(gefiltert.html);
  sammleKopfStyles(ctx, doc);
  flaggeSkripte(ctx, doc);

  const geprueft = validiereSegmentierung(segmentierung, knoten);
  if (!geprueft.ok) ctx.flags.push({ grund: FLAG_SEG_ABWEICHUNG, detail: geprueft.fehler });

  /* Typ-Karte (gemma-Urteil je Atom) + Element/ref-Karten fuer den Block-Bau.
     gemma liefert NUR noch das Text/Bild-Urteil je Atom (Marker-Platzierung),
     NICHT mehr die Sektionsgeometrie (Fix K3, s. sammleSektionsWurzeln). */
  const typNach = new Map<string, BlockTyp>();
  for (const s of segmentierung.sektionen) for (const b of s.bloecke) typNach.set(b.ref, b.typ);
  const alleAtome = knoten.map((k) => elemente.get(k.ref)).filter((e): e is Element => !!e);
  const atomSet = new Set<Element>(alleAtome);
  const refNach = new Map<Element, string>();
  for (const [ref, el] of elemente) refNach.set(el, ref);

  /* DOM-treue Sektionierung: die Grenzen kommen aus dem echten Container-Baum,
     nicht aus gemmas semantischem Urteil. Wurzel = LCA aller Atome (der reale
     Inhalts-Wrapper; faellt bei Bedarf auf <body> zurueck). */
  const wurzel = findeLca(alleAtome) ?? doc?.body ?? null;
  const content: ComponentData[] = [];

  if (wurzel) {
    const sektionsWurzeln = sammleSektionsWurzeln(wurzel, atomSet);
    for (const sw of sektionsWurzeln) {
      const block = baueSektionsBlockAusWurzel(ctx, sw, typNach, refNach, alleAtome);
      if (block) content.push(block);
      else ctx.flags.push({ grund: FLAG_STRUKTUR_LEER, detail: sw.tagName.toLowerCase() });
    }

    /* Verlustschutz: Atome, die keine emittierte Sektions-Wurzel abdeckt (bei
       sauberer DOM-Struktur leer), in einem Rest-StrukturBlock auffangen. */
    const abgedeckt = new Set<Element>();
    for (const sw of sammleSektionsWurzeln(wurzel, atomSet)) {
      for (const a of alleAtome) if (a === sw || sw.contains(a)) abgedeckt.add(a);
    }
    const restAtome = alleAtome.filter((a) => !abgedeckt.has(a));
    if (restAtome.length > 0) {
      const restLca = findeLca(restAtome);
      if (restLca) {
        const block = baueSektionsBlockAusWurzel(ctx, restLca, typNach, refNach, alleAtome);
        if (block) {
          ctx.flags.push({ grund: FLAG_SEG_REST, detail: `${restAtome.length} Atome ohne DOM-Sektion` });
          content.push(block);
        }
      }
    }
  }

  return {
    data: { root: {}, content },
    flags: dedupliziereFlags(ctx.flags),
    statistik: ctx.statistik,
    bilder: ctx.bilder,
    stylesheets: stil ? dedupliziereStrings(stil.stylesheets) : [],
    inlineStyles: stil ? dedupliziereStrings(stil.inlineStyles) : [],
    framework,
  };
}

/** Behaelt die erste Vorkommen-Reihenfolge, wirft exakte Duplikate raus. */
function dedupliziereStrings(werte: string[]): string[] {
  const gesehen = new Set<string>();
  const out: string[] = [];
  for (const w of werte) {
    if (gesehen.has(w)) continue;
    gesehen.add(w);
    out.push(w);
  }
  return out;
}

/** Gleiche grund+detail-Kombination nur einmal im Bericht. */
function dedupliziereFlags(flags: ImportFlag[]): ImportFlag[] {
  const gesehen = new Set<string>();
  const out: ImportFlag[] = [];
  for (const f of flags) {
    const schluessel = `${f.grund}::${f.detail}`;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    out.push(f);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reine Baum-Transformation (Slot-rekursiv)                            */
/* ------------------------------------------------------------------ */

/** Ein Prop-Wert ist ein Slot-/Inhalts-Array, wenn er ein Array aus
 *  ComponentData-artigen Objekten ist ({type:string, props:object}). Ein
 *  leeres Array zaehlt mit (harmlos — die Rekursion tut dann nichts). */
function istInhaltsArray(v: unknown): v is ComponentData[] {
  return (
    Array.isArray(v) &&
    v.every(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as { type?: unknown }).type === "string" &&
        typeof (e as { props?: unknown }).props === "object" &&
        (e as { props?: unknown }).props !== null,
    )
  );
}

/** Wendet `je` auf JEDEN Baustein im Baum an (Wurzel + alle Slot-Kinder,
 *  beliebig tief) und baut den Baum unveraendert-strukturerhaltend neu auf.
 *  Rein/immutabel. */
function transformiereBaum(items: ComponentData[], je: (item: ComponentData) => ComponentData): ComponentData[] {
  return items.map((item) => {
    const neu = je(item);
    const props = neu.props as Record<string, unknown>;
    let geaendert = false;
    const neueProps: Record<string, unknown> = { ...props };
    for (const [schluessel, wert] of Object.entries(props)) {
      if (istInhaltsArray(wert)) {
        neueProps[schluessel] = transformiereBaum(wert, je);
        geaendert = true;
      }
    }
    return geaendert ? ({ ...neu, props: neueProps } as ComponentData) : neu;
  });
}

/** Maskiert RegExp-Sonderzeichen in einem Literal-Pfad (fuer die Alternation
 *  im HtmlBlock-Ersatz). */
function maskiereRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Ersetzt Bildquellen in der Puck-Data — rein/immutabel, rekursiv ueber Slots.
 *   `ersatz`     : id -> neue src fuer eigenstaendige BildBloecke (quelle="bild").
 *   `htmlErsatz` : Original-src -> neue src fuer Bild-/Hintergrund-Referenzen
 *                  INNERHALB von HtmlBlock-Markup (Welle 5a, quelle="html"). Der
 *                  Ersatz laeuft in EINEM Durchgang (Alternation, laengste
 *                  Pfade zuerst), damit ein eingesetzter Wert (z.B. eine
 *                  data-URL) nicht erneut getroffen wird. Leeres Objekt
 *                  (Default) = alter Pfad, nur BildBloecke.
 */
export function ersetzeBildQuellen(
  data: Data,
  ersatz: Record<string, string>,
  htmlErsatz: Record<string, string> = {},
): Data {
  const paare = Object.entries(htmlErsatz).sort((a, b) => b[0].length - a[0].length);
  const htmlRegex =
    paare.length > 0 ? new RegExp(paare.map(([orig]) => maskiereRegExp(orig)).join("|"), "g") : null;
  const htmlMap = new Map(paare);

  const je = (item: ComponentData): ComponentData => {
    const id = (item.props as { id?: unknown }).id;
    if (item.type === "BildBlock" && typeof id === "string" && ersatz[id] !== undefined) {
      return { ...item, props: { ...item.props, src: ersatz[id] } };
    }
    if (item.type === "HtmlBlock" && htmlRegex) {
      const html = (item.props as { html?: unknown }).html;
      if (typeof html === "string" && html.length > 0) {
        const neu = html.replace(htmlRegex, (treffer) => htmlMap.get(treffer) ?? treffer);
        if (neu !== html) return { ...item, props: { ...item.props, html: neu } };
      }
    }
    /* Phase 4b: StrukturBlock traegt Original-Bildquellen an ZWEI Stellen — im
       `template`-Markup (Hintergrundbilder, dekorative <img>) UND in den
       editierbaren `bilder[].src`. Beide ueber denselben (laengste-Pfade-zuerst)
       Alternations-Ersatz wie beim HtmlBlock umbiegen. */
    if (item.type === "StrukturBlock" && htmlRegex) {
      const props = item.props as { template?: unknown; bilder?: unknown };
      let geaendert = false;
      const neueProps: Record<string, unknown> = { ...item.props };
      if (typeof props.template === "string" && props.template.length > 0) {
        const neu = props.template.replace(htmlRegex, (treffer) => htmlMap.get(treffer) ?? treffer);
        if (neu !== props.template) {
          neueProps.template = neu;
          geaendert = true;
        }
      }
      if (Array.isArray(props.bilder)) {
        const neuBilder = props.bilder.map((b) => {
          const src = (b as { src?: unknown }).src;
          if (typeof src !== "string" || src.length === 0) return b;
          const neu = src.replace(htmlRegex, (treffer) => htmlMap.get(treffer) ?? treffer);
          return neu === src ? b : { ...(b as object), src: neu };
        });
        if (neuBilder.some((b, i) => b !== (props.bilder as unknown[])[i])) {
          neueProps.bilder = neuBilder;
          geaendert = true;
        }
      }
      if (geaendert) return { ...item, props: neueProps } as ComponentData;
    }
    return item;
  };
  return { ...data, content: transformiereBaum(data.content, je) };
}
