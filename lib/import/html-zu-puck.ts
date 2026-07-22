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
  /** Jede erzeugte Bildquelle mit ihrer Baustein-id — Grundlage der
   *  getrennten, asynchronen Asset-Aufloesung. */
  bilder: { id: string; src: string }[];
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
 *  Flags. Entfernt betriebsfremde Knoten, on*-Attribute und javascript:-URLs. */
function entschaerfeElement(el: Element): ImportFlag[] {
  const flags: ImportFlag[] = [];

  const flagge = (grund: string, detail: string) => flags.push({ grund, detail });

  /* <style> gesondert: wird nicht uebernommen (Styling geht verloren). */
  el.querySelectorAll("style").forEach((s) => {
    flagge(FLAG_STYLE, `<style>-Block (${(s.textContent ?? "").trim().length} Zeichen) verworfen`);
    s.remove();
  });
  /* Externe Stylesheets. */
  el.querySelectorAll('link[rel~="stylesheet"]').forEach((l) => {
    flagge(FLAG_LINK, l.getAttribute("href") ?? "<link rel=stylesheet>");
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
  bilder: { id: string; src: string }[];
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
  if (src) ctx.bilder.push({ id, src });
  return { type: "BildBlock", props };
}

/** Erzeugt einen HtmlBlock aus beliebigem uebrigem Markup (entschaerft). */
function htmlBlock(ctx: BauKontext, el: Element): ComponentData | null {
  const klon = el.cloneNode(true) as Element;
  const flags = entschaerfeElement(klon);
  ctx.flags.push(...flags);
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
      /* Betriebsfremd — entfernen + flaggen, nichts erzeugen. */
      if (tag === "SCRIPT") ctx.flags.push({ grund: FLAG_SCRIPT, detail: el.getAttribute("src") ?? "<script>" });
      else if (tag === "IFRAME") ctx.flags.push({ grund: FLAG_IFRAME, detail: el.getAttribute("src") ?? "<iframe>" });
      else if (tag === "STYLE") ctx.flags.push({ grund: FLAG_STYLE, detail: "<style>-Block verworfen" });
      else ctx.flags.push({ grund: FLAG_OBJEKT, detail: `<${tag.toLowerCase()}>` });
      continue;
    }
    if (tag === "LINK" && /\bstylesheet\b/i.test(el.getAttribute("rel") ?? "")) {
      ctx.flags.push({ grund: FLAG_LINK, detail: el.getAttribute("href") ?? "<link rel=stylesheet>" });
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

/**
 * HTML -> Puck-Data. Rein/deterministisch (nur DOMParser, kein Seiteneffekt).
 * `idPraefix` fliesst in die stabilen Baustein-ids ein (z.B. der Slug).
 */
export function htmlZuPuck(html: string, opts: { idPraefix?: string } = {}): ImportBericht {
  const ctx: BauKontext = {
    ids: new IdZaehler(opts.idPraefix ? `${opts.idPraefix}-` : ""),
    flags: [],
    statistik: { sektionen: 0, texte: 0, bilder: 0, htmlBloecke: 0 },
    bilder: [],
  };

  const doc = new DOMParser().parseFromString(html, "text/html");
  const content: ComponentData[] = [];

  /* Kopf-Ebene: die eigentlichen Styling-Traeger (<style>, externe
     Stylesheets) liegen meist im <head>. Ehrlich flaggen — sie gehen beim
     Stufe-C-light-Import verloren (Dedup uebernimmt Wiederholungen). */
  doc.head?.querySelectorAll("style").forEach(() => {
    ctx.flags.push({ grund: FLAG_STYLE, detail: "<style> im <head> verworfen" });
  });
  doc.head?.querySelectorAll('link[rel~="stylesheet"]').forEach((l) => {
    ctx.flags.push({ grund: FLAG_LINK, detail: l.getAttribute("href") ?? "<link rel=stylesheet>" });
  });

  for (const kind of Array.from(doc.body.childNodes)) {
    if (kind.nodeType === 3) {
      const text = (kind.textContent ?? "").trim();
      if (text) content.push(textBlock(ctx, text, "p"));
      continue;
    }
    if (kind.nodeType !== 1) continue;
    const el = kind as Element;
    if (CONTAINER_TAGS.has(el.tagName)) {
      content.push(sektionBlock(ctx, el));
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
  };
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

/**
 * Ersetzt die `src` jedes BildBlock, dessen id in `ersatz` steht — rekursiv
 * ueber Slot-Kinder, rein/immutabel. Grundlage der Asset-Aufloesung.
 */
export function ersetzeBildQuellen(data: Data, ersatz: Record<string, string>): Data {
  const je = (item: ComponentData): ComponentData => {
    const id = (item.props as { id?: unknown }).id;
    if (item.type === "BildBlock" && typeof id === "string" && ersatz[id] !== undefined) {
      return { ...item, props: { ...item.props, src: ersatz[id] } };
    }
    return item;
  };
  return { ...data, content: transformiereBaum(data.content, je) };
}
