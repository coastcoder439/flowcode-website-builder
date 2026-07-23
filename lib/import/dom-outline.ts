/*
 * lib/import/dom-outline.ts — Import-Endlevel Schritt I3 (M5, Kernstueck D):
 * REINE, deterministische Bildung einer KOMPAKTEN DOM-Outline als Eingabe fuer
 * die gemma4-Segmentierung (Spec: docs/plan-analyse/lens-import.md §3-Schritt-III
 * + gemma4-Contract).
 *
 * WARUM: Der bisherige Ein-Ebenen-Import presst ganze header/main/footer in
 * je EINEN HtmlBlock (M5). Damit gemma4 feine Sektionsgrenzen + Blocktypen
 * urteilen kann, OHNE das Roh-HTML (Prompt-Kosten, Halluzinationsrisiko) zu
 * sehen, reduzieren wir die Seite auf eine geordnete Liste von „Atomen" —
 * inhaltstragende Blatt-Bloecke in Dokumentreihenfolge. gemma4 gruppiert diese
 * Atome nur noch zu Sektionen und vergibt Typen/Titel; es erfindet KEINE
 * Struktur. Dadurch bleibt die mechanische Validierung (jede ref genau einmal,
 * Reihenfolge dokumenttreu) einfach und das Modell-Urteil hart eingezaeunt.
 *
 * REIN: einzige Aussenwelt ist `DOMParser` (parst nur, fuehrt nichts aus —
 * <script> im geparsten Dokument laeuft nicht), kein Netz/FS/Storage. Gleiche
 * Eingabe -> gleiche Ausgabe. SSR-sicher: ohne DOMParser -> leere Outline.
 *
 * REF-VERGABE: fortlaufender Index in Dokument-(Emissions-)Reihenfolge
 * ("r0","r1",…). Bei gleichem HTML immer gleiche Atome in gleicher Reihenfolge —
 * so kann Schritt IV (Puck-Mapping) die Outline erneut bilden und ref->Knoten
 * mechanisch zuordnen (kein Attribut-Eingriff ins HTML noetig, bleibt rein).
 *
 * bbox ist OPTIONAL: Geometrie (y/h/vollBreite) kommt — falls vorhanden — aus dem
 * Freeze-Pass ueber eine ref-gekeyte Karte. Solange der Freeze keine Geometrie
 * exportiert, bleibt bbox einfach weg (Contract erlaubt das explizit).
 */

/* ------------------------------------------------------------------ */
/* Typen                                                               */
/* ------------------------------------------------------------------ */

/** Geometrie eines Atoms (optional, aus dem Freeze-Pass). */
export interface OutlineGeo {
  /** Vertikale Position (px) im gerenderten Viewport. */
  y: number;
  /** Hoehe (px). */
  h: number;
  /** Reicht der Block ueber die volle Viewport-Breite (Full-Bleed-Signal)? */
  vollBreite: boolean;
}

/**
 * Ein Outline-Atom. Die ans Modell gesendeten Felder sind exakt der
 * gemma4-Contract (ref/tag/klassenHinweis/textDichte/tiefe/bbox?/hatBild);
 * `textVorschau` ist ein INTERNES Feld (Fallback-Titel, Debug) und wird VOR
 * dem Prompt herausprojiziert (s. `zuGemmaEingabe`).
 */
export interface OutlineKnoten {
  /** Stabile Referenz in Emissions-/Dokumentreihenfolge ("r0","r1",…). */
  ref: string;
  /** Kleingeschriebener Tag-Name. */
  tag: string;
  /** Verdichteter Klassen-/Id-Hinweis (wenige Tokens, gekappt). */
  klassenHinweis: string;
  /** Zeichenlaenge des getrimmten Textinhalts des Subtrees (Dichte-Signal). */
  textDichte: number;
  /** Schachtelungstiefe relativ zur Inhaltswurzel (Wurzel-Kinder = 0). */
  tiefe: number;
  /** Traegt der Knoten (selbst oder im Subtree) ein Bild/Medium/Hintergrund? */
  hatBild: boolean;
  /** Optionale Geometrie aus dem Freeze-Pass. */
  bbox?: OutlineGeo;
  /** INTERN: gekappte Textvorschau (nicht Teil der Modell-Eingabe). */
  textVorschau: string;
}

export interface OutlineErgebnis {
  knoten: OutlineKnoten[];
  /** Tag der ermittelten Inhaltswurzel (Diagnose). */
  wurzelTag: string;
}

/**
 * Wie OutlineErgebnis, zusaetzlich die ref->Element-Zuordnung und das geparste
 * Dokument. Grundlage fuer Schritt IV (Puck-Mapping, lib/import/html-zu-puck.ts):
 * dort muss jede Segmentierungs-ref auf das ECHTE DOM-Element zurueckgefuehrt
 * werden. Die Elemente stammen aus GENAU diesem Parse (`doc`) — nur so lassen sie
 * sich konsistent klonen/lesen; darum wird `doc` mitgegeben (fuer Kopf-Styles).
 * `doc` ist null, wenn kein DOMParser vorhanden ist (SSR).
 */
export interface OutlineMitElementen extends OutlineErgebnis {
  elemente: Map<string, Element>;
  doc: Document | null;
}

/** Die exakt an gemma4 gesendete Knotenform (Contract §3, kompakt). */
export interface GemmaEingabeKnoten {
  ref: string;
  tag: string;
  klassenHinweis: string;
  textDichte: number;
  tiefe: number;
  hatBild: boolean;
  bbox?: OutlineGeo;
}

/* ------------------------------------------------------------------ */
/* Tag-Klassifikation                                                  */
/* ------------------------------------------------------------------ */

/* Nie als Inhalt betrachten (Metadaten, Skripte, dekorative Trenner). */
const IGNORIERT = new Set([
  "script", "style", "link", "meta", "noscript", "template", "head", "title", "base",
]);

/* Medien-Tags: eigenstaendige Bild-/Vektor-/Video-Atome. */
const MEDIUM = new Set(["img", "picture", "svg", "video", "canvas", "iframe"]);

/* Block-Level-Kinder: ihre Anwesenheit macht ein Element zum CONTAINER
   (wir steigen ab, um feinere Atome zu finden), sonst ist es ein Blatt-Atom. */
const BLOCK_ELEMENT = new Set([
  "div", "section", "header", "footer", "main", "nav", "article", "aside",
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "form", "fieldset", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "blockquote", "pre", "address", "details", "summary",
]);

/* Text-tragende Tags (fuer die Typ-Validierung „kein Bild-Typ ohne Bild"). */
export const TEXT_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "li", "a", "button", "span", "blockquote", "figcaption",
  "label", "strong", "em", "small", "address", "dt", "dd", "th", "td",
]);

/* ------------------------------------------------------------------ */
/* Hilfen (rein)                                                       */
/* ------------------------------------------------------------------ */

function tagVon(el: Element): string {
  return el.tagName.toLowerCase();
}

/** Trimmt + kollabiert Whitespace. */
function normText(s: string | null): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

/** Verdichteter Klassen-/Id-Hinweis: bis zu 3 Klassen-Tokens (je ≤28), sonst #id. */
function klassenHinweisVon(el: Element): string {
  const klasse = normText(el.getAttribute("class"));
  if (klasse) {
    const tokens = klasse.split(" ").filter(Boolean).slice(0, 3).map((t) => t.slice(0, 28));
    return tokens.join(" ").slice(0, 64);
  }
  const id = normText(el.getAttribute("id"));
  return id ? ("#" + id).slice(0, 64) : "";
}

/** Traegt das Element selbst einen inline gesetzten background-image? */
function hatHintergrundBild(el: Element): boolean {
  const style = el.getAttribute("style") || "";
  return /background(-image)?\s*:[^;]*url\(/i.test(style);
}

/** Enthaelt der Subtree (inkl. el) ein Bild/Medium/Hintergrund? */
function subtreeHatBild(el: Element): boolean {
  if (MEDIUM.has(tagVon(el)) || hatHintergrundBild(el)) return true;
  if (el.querySelector("img,picture,svg,video,canvas")) return true;
  for (const kind of Array.from(el.querySelectorAll("[style]"))) {
    if (hatHintergrundBild(kind)) return true;
  }
  return false;
}

/** Hat el mindestens ein nicht-ignoriertes Block-Level-Kind-Element? */
function hatBlockKinder(el: Element): boolean {
  for (const kind of Array.from(el.children)) {
    const t = tagVon(kind);
    if (IGNORIERT.has(t)) continue;
    if (BLOCK_ELEMENT.has(t)) return true;
  }
  return false;
}

/** Rein dekorativ-leer: kein Text, kein Bild, kein Hintergrund, aria-hidden-Layer. */
function istDekorLeer(el: Element): boolean {
  if (MEDIUM.has(tagVon(el))) return false;
  const hatText = normText(el.textContent).length > 0;
  if (hatText) return false;
  if (subtreeHatBild(el)) return false;
  return true;
}

/**
 * Ermittelt die Inhaltswurzel: steigt durch anonyme Einzel-Wrapper (ein einziges
 * div/span-Kind ohne eigenen Text/Hintergrund) ab, damit der Next-Root-Wrapper
 * die Sektionierung nicht auf EINEN Knoten kollabiert (analog istAnonymerWrapper
 * in html-zu-puck.ts).
 */
function findeInhaltsWurzel(body: Element): Element {
  let root = body;
  for (let schutz = 0; schutz < 8; schutz++) {
    const kinder = Array.from(root.children).filter((k) => !IGNORIERT.has(tagVon(k)));
    if (kinder.length !== 1) break;
    const einziges = kinder[0];
    const t = tagVon(einziges);
    if (t !== "div" && t !== "span") break;
    /* Nur absteigen, wenn der Wrapper selbst keinen Direkt-Text traegt. */
    const eigenText = Array.from(einziges.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || "")
      .join("");
    if (normText(eigenText).length > 0) break;
    if (!hatBlockKinder(einziges)) break;
    root = einziges;
  }
  return root;
}

/* ------------------------------------------------------------------ */
/* Outline-Aufbau                                                      */
/* ------------------------------------------------------------------ */

/**
 * Sammelt Atome rekursiv in Dokumentreihenfolge. Ein Element ist ein ATOM
 * (emittiert, nicht weiter zerlegt), wenn es ein Medium ist ODER keine
 * Block-Level-Kinder hat. Container mit Block-Kindern werden durchschritten,
 * um feinere Atome zu finden. Dekorativ-leere Knoten werden uebersprungen.
 */
function sammleAtome(
  root: Element,
  tiefe: number,
  geometrie: Record<string, OutlineGeo> | undefined,
  out: OutlineKnoten[],
  elemente?: Map<string, Element>,
): void {
  for (const el of Array.from(root.children)) {
    const tag = tagVon(el);
    if (IGNORIERT.has(tag)) continue;

    if (MEDIUM.has(tag)) {
      emit(el, tag, tiefe, geometrie, out, elemente);
      continue;
    }
    if (istDekorLeer(el)) continue;

    if (hatBlockKinder(el)) {
      sammleAtome(el, tiefe + 1, geometrie, out, elemente);
      continue;
    }
    emit(el, tag, tiefe, geometrie, out, elemente);
  }
}

/** Legt EIN Atom an und vergibt die naechste laufende ref. `elemente` (optional)
 *  bekommt zusaetzlich die ref->Element-Zuordnung fuer das spaetere Puck-Mapping —
 *  identische Traversierung, also identische refs wie `baueOutline`. */
function emit(
  el: Element,
  tag: string,
  tiefe: number,
  geometrie: Record<string, OutlineGeo> | undefined,
  out: OutlineKnoten[],
  elemente?: Map<string, Element>,
): void {
  const ref = "r" + out.length;
  const voll = normText(el.textContent);
  const knoten: OutlineKnoten = {
    ref,
    tag,
    klassenHinweis: klassenHinweisVon(el),
    textDichte: voll.length,
    tiefe,
    hatBild: subtreeHatBild(el),
    textVorschau: voll.slice(0, 80),
  };
  const geo = geometrie ? geometrie[ref] : undefined;
  if (geo) knoten.bbox = geo;
  out.push(knoten);
  if (elemente) elemente.set(ref, el);
}

/**
 * Baut die kompakte Outline aus Roh-/Freeze-HTML. Erwartet, dass Fremdkoerper
 * (.site-gate u.a.) VORHER entfernt wurden (s. fremdkoerper-filter.ts).
 *
 * @param html Self-contained HTML (idealerweise die Freeze-Ausgabe).
 * @param opts.geometrie optionale ref-gekeyte Geometrie aus dem Freeze-Pass.
 */
export function baueOutline(
  html: string,
  opts?: { geometrie?: Record<string, OutlineGeo> },
): OutlineErgebnis {
  if (typeof DOMParser === "undefined") return { knoten: [], wurzelTag: "" };

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return { knoten: [], wurzelTag: "" };

  const wurzel = findeInhaltsWurzel(body);
  const knoten: OutlineKnoten[] = [];
  sammleAtome(wurzel, 0, opts?.geometrie, knoten);
  return { knoten, wurzelTag: tagVon(wurzel) };
}

/**
 * Wie `baueOutline`, liefert zusaetzlich die ref->Element-Karte und das Dokument.
 * Fuer Schritt IV (Puck-Mapping): dort werden die Segmentierungs-refs mechanisch
 * auf die echten Elemente zurueckgefuehrt. Weil GENAU dieselbe Traversierung wie
 * in `baueOutline` genutzt wird (gemeinsames sammleAtome/emit), sind die refs
 * identisch — bei gleichem HTML deckt sich die Karte deterministisch mit dem
 * Modell-/Fallback-Urteil aus Schritt III.
 */
export function baueOutlineMitElementen(
  html: string,
  opts?: { geometrie?: Record<string, OutlineGeo> },
): OutlineMitElementen {
  if (typeof DOMParser === "undefined") {
    return { knoten: [], wurzelTag: "", elemente: new Map(), doc: null };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return { knoten: [], wurzelTag: "", elemente: new Map(), doc };

  const wurzel = findeInhaltsWurzel(body);
  const knoten: OutlineKnoten[] = [];
  const elemente = new Map<string, Element>();
  sammleAtome(wurzel, 0, opts?.geometrie, knoten, elemente);
  return { knoten, wurzelTag: tagVon(wurzel), elemente, doc };
}

/**
 * Projiziert die interne Outline auf die exakte gemma4-Eingabeform (Contract §3):
 * entfernt `textVorschau`, laesst bbox nur wenn vorhanden. Diese — und NUR diese —
 * Form wird ins Modell gegeben.
 */
export function zuGemmaEingabe(knoten: OutlineKnoten[]): GemmaEingabeKnoten[] {
  return knoten.map((k) => {
    const e: GemmaEingabeKnoten = {
      ref: k.ref,
      tag: k.tag,
      klassenHinweis: k.klassenHinweis,
      textDichte: k.textDichte,
      tiefe: k.tiefe,
      hatBild: k.hatBild,
    };
    if (k.bbox) e.bbox = k.bbox;
    return e;
  });
}
