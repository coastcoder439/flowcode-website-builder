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

  const doc = new DOMParser().parseFromString(html, "text/html");
  const content: ComponentData[] = [];

  /* Kopf-Ebene: die eigentlichen Styling-Traeger (<style>, Stylesheets) liegen
     bei Next-Builds im <head>. Mit styleUebernehmen sammeln (§10/5a), sonst
     ehrlich flaggen (Stufe-C-light verliert das Styling). */
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
    return item;
  };
  return { ...data, content: transformiereBaum(data.content, je) };
}
