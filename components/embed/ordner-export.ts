/*
 * components/embed/ordner-export.ts — Export-Generator-Kern (Station 4, S1).
 * Spec: docs/plan-analyse/lens-preview-export.md §2 (Ziel-Architektur) + §3-S1.
 *
 * EIN Generator, ZWEI Ausgabe-Modi:
 *   · INLINE  → eine selbsttragende HTML je Seite (alles inline). Reuest
 *               baueSeiteHtml/baueEmbedConfig aus embed-export.ts UNVERAENDERT
 *               (= das bisherige „Ganze Seite (HTML)"-Format, byte-identisch).
 *               Powert die Preview (iframe srcdoc) — bleibt Export-Wahrheit.
 *   · ORDNER  → eine deploybare Ordner-Struktur mit AUSGELAGERTEN Assets:
 *               index.html je Seite, wee-embed.js als Datei, assets/<hash>.<ext>,
 *               css/<name>.css, README.txt. Referenzen relativ umgeschrieben.
 *
 * REIN & DOM-FREI (bewusst, s. embed-export.ts-Kopf): dieses Modul fasst KEINE
 * Dateien an und macht KEIN Netz. Alle unreinen Zutaten — das gerenderte
 * Seiten-Markup (Client-DOM-Abgriff, S3), die fertige EmbedConfig (baueEmbedConfig,
 * inlinet Bilder per fetch), der Runtime-Text (wee-embed.js), die CSS-Inhalte —
 * werden vom Aufrufer VORBEREITET und hier nur zusammengebaut. Dadurch ist der
 * Kern ohne Browser/Server unit-testbar (scripts/tests/ordner-export.test.mjs).
 *
 * Die Asset-Enumeration nutzt walkTree aus @puckeditor/core (deterministische
 * Traversierung inkl. der SektionBlock-Slot-Kinder) plus eine reine
 * Markup-/CSS-Analyse; die CSS-url()-Aufloesung teilt sich lib/import/css-rewrite.ts.
 */

import { walkTree, type Data } from "@puckeditor/core";
import type { EmbedConfig } from "./EmbedRoot";
import type { Grafik, GrafikKeyframe } from "../grafik/grafik-types";
import type { SeitenAnim } from "../../lib/api/seiten-speicher";
import { baueSeiteHtml, baueMountUndConfig } from "./embed-export";
import { sammleCssAssets, loeseCssPfad, schreibeCssUrls } from "../../lib/import/css-rewrite";
import { PUCK_KOMPONENTEN_TYPEN } from "../../lib/puck-registry";

/* ================================================================== */
/* 1 · Referenz-Klassifikation, Endung, stabiler Hash                  */
/* ================================================================== */

/** Wie eine gefundene Quelle im Ordner-Export behandelt wird:
 *   data    – eine BASE64-Data-URL (`data:…;base64,…`): der Rohinhalt wird in
 *             eine Datei EXTRAHIERT (assets/<hash>.<ext>).
 *   projekt – ein Projektpfad (`/import/…`, `/curtain/…`, `/vektor/…`): die
 *             Datei wird aus public/ KOPIERT.
 *   extern  – absolute/protokoll-relative URL, SVG-Fragment (`#…`) ODER eine
 *             NICHT-base64-Data-URL (URL-kodiertes/utf8-Inline-SVG u.a.): bleibt
 *             UNANGETASTET (kein Datei-Ziel, keine Umschreibung) — sie ist als
 *             data:-URL ohnehin selbsttragend und braucht keine Datei. */
export type RefKlasse = "data" | "projekt" | "extern";

/** Herkunft einer Referenz — nur fuer Bericht/Debug, nicht fuer die Logik. */
export type RefHerkunft =
  | "bild-block"
  | "grafik-layer"
  | "html-img"
  | "html-url"
  | "anim-src"
  | "anim-override"
  | "css-url"
  | "markup-src"
  | "markup-srcset"
  | "markup-poster"
  | "markup-url"
  | "a-href";

/** Eine gefundene Bild-/Medien-Referenz (→ assets/<hash>.<ext>). */
export interface AssetReferenz {
  /** Exakt wie im Datenmodell/Markup geschrieben (Schluessel fuer die Umschreibung). */
  roh: string;
  klasse: RefKlasse;
  herkunft: RefHerkunft;
}

/** Eine uebernommene Stylesheet-Datei (styles[], → css/<name>.css). */
export interface CssDateiRef {
  /** Die Original-URL aus styles[] (z.B. "/import/slug/css/x.css"). */
  roh: string;
  /** Basisname = Ziel-Dateiname unter css/. */
  name: string;
  /** In DIESER CSS gefundene lokale url()-Sub-Assets (Fonts/Bilder). */
  unterAssets: AssetReferenz[];
  /** Umschreibe-Map fuer die CSS SELBST: roher url()-Text → ziel relativ ZUR
   *  css-Datei (immer "../assets/<hash>.<ext>", weil css/ und assets/ auf
   *  gleicher Ebene liegen — tiefenunabhaengig). */
  urlErsatz: Record<string, string>;
}

/** Vollstaendiges Ergebnis der Referenz-Sammlung einer Seite. */
export interface AssetReferenzen {
  assets: AssetReferenz[];
  css: CssDateiRef[];
}

/** Klassifiziert eine Quelle (s. RefKlasse). Spiegelt istProjektUrl
 *  (embed-export.ts) / istLokalerVerweis (css-rewrite.ts): nur "/…" ist ein
 *  kopierbarer Projektpfad, eine BASE64-"data:"-URL wird extrahiert, alles
 *  andere ist extern.
 *
 *  Nur BASE64-Data-URLs werden extrahiert: die Schreib-Route (X2) dekodiert
 *  data:-URLs base64 und koppelt Endung↔MIME eng — eine NICHT-base64-Data-URL
 *  (z.B. `data:image/svg+xml,%3Csvg…` oder `;utf8,…`) wuerde sie ablehnen. Als
 *  data:-URL ist sie ohnehin selbsttragend, also bleibt sie inline (extern). */
export function klassifiziere(roh: string): RefKlasse {
  const s = roh.trim();
  if (s === "" || s.startsWith("#")) return "extern";
  if (s.startsWith("data:")) return /;base64,/i.test(s) ? "data" : "extern";
  if (s.startsWith("//")) return "extern"; // protokoll-relativ
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return "extern"; // http:, https:, blob:, file: …
  if (s.startsWith("/")) return "projekt";
  return "extern"; // relative Fremdpfade fassen wir bewusst nicht an
}

/** Ist `roh` eine UNAUFLOESBARE lokale Referenz? klassifiziere() steckt sowohl
 *  echte externe Ressourcen (http:, //, blob:…, #Fragmente, nicht-base64-data:)
 *  ALS AUCH relative lokale Pfade ("bilder/x.png", "./y.jpg", "../z.webp") in denselben
 *  Topf "extern" — beide werden im Export nicht angefasst. Fuer eine ehrliche
 *  Bericht-Warnung muss man sie trennen: eine echte externe URL/Data-URL/ein
 *  Fragment ist selbsttragend (kein Problem), ein RELATIVER lokaler Pfad hingegen
 *  bekommt KEIN assets/-Ziel und zeigt auf einem statischen Host ins Leere
 *  (vermutlich toter Link). Nur Letzteres ist "unaufloesbar".
 *
 *  Spiegelt die Reihenfolge aus klassifiziere: alles, was dort selbsttragend/
 *  extern ODER ein "/"-Projektpfad (→ bekommt ein Ziel) ist, ist NICHT
 *  unaufloesbar; nur der verbleibende relative Pfad ist es. */
export function istUnaufloesbar(roh: string): boolean {
  const s = roh.trim();
  if (s === "" || s.startsWith("#") || s.startsWith("data:") || s.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return false; // http:, https:, blob:, mailto: …
  if (s.startsWith("/")) return false; // Projektpfad → wird gemappt/kopiert
  return true; // relativer lokaler Pfad → kein Ziel, kein sicherer Extern-Fall
}

/** MIME → Dateiendung fuer extrahierte Data-URLs. Deckt die im Editor
 *  moeglichen Medienarten ab (s. grafik-types.medienArt); Unbekanntes → "bin". */
const MIME_ENDUNG: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/json": "json",
};

/** Ermittelt die Ziel-Dateiendung einer Quelle: aus dem MIME der Data-URL bzw.
 *  aus der Pfad-Endung (Query/Hash abgeschnitten). Ohne erkennbare Endung "bin". */
export function endungAus(roh: string): string {
  const s = roh.trim();
  if (s.startsWith("data:")) {
    const mime = s.slice(5).split(/[;,]/, 1)[0].toLowerCase();
    return MIME_ENDUNG[mime] ?? (mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin");
  }
  const ohne = s.split("#")[0].split("?")[0];
  const letztes = ohne.split("/").pop() ?? "";
  const punkt = letztes.lastIndexOf(".");
  if (punkt <= 0) return "bin";
  const ext = letztes.slice(punkt + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

/** Stabiler 32-bit-FNV-1a-Hash als 8-stelliger Hex-String. REIN und
 *  deterministisch (kein node:crypto → auch im Browser-Bundle nutzbar). Gleiche
 *  Quelle → gleicher Hash → automatische Deduplizierung + reproduzierbare
 *  Dateinamen (Deliverable „Hash-Stabilitaet"). */
export function stabilerHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    /* h *= 16777619, in 32-bit — via Schiebe-Summen, damit es exakt bleibt. */
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Ziel-Dateiname eines Assets unter assets/: `<hash>.<ext>` — der Hash aus der
 *  ROHEN Quelle (Pfad bzw. komplette Data-URL). */
export function assetDateiname(roh: string): string {
  return `${stabilerHash(roh)}.${endungAus(roh)}`;
}

/* ================================================================== */
/* 2 · Referenzen SAMMELN (rein, DOM-frei)                             */
/* ================================================================== */

/** Minimal-Config fuer walkTree: NUR die Slot-Felder je registriertem Typ —
 *  keine React-Render-Funktionen. walkTree liest ausschliesslich
 *  `components[typ].fields[x].type === "slot"`, um in Slot-Kinder abzusteigen
 *  (verifiziert), und wirft, wenn ein vorkommender Typ fehlt. Deshalb ALLE
 *  registrierten Typen (PUCK_KOMPONENTEN_TYPEN) auffuehren; aktuell traegt nur
 *  SektionBlock einen Slot (`kinder`). So bleibt der Generator DOM-/UI-frei und
 *  muss puck.config.tsx nicht importieren (Registry-Invariante, s. puck-registry.ts).
 *
 *  SYNCHRONPFLICHT: Bekommt ein Baustein kuenftig einen weiteren Slot-Prop,
 *  hier ergaenzen — sonst uebersieht die Asset-Sammlung dessen Kinder. */
const SLOT_FELDER: Record<string, Record<string, { type: string }>> = {
  SektionBlock: { kinder: { type: "slot" } },
};
const SLOT_CONFIG = {
  root: { fields: {} },
  components: Object.fromEntries(
    PUCK_KOMPONENTEN_TYPEN.map((typ) => [typ, { fields: SLOT_FELDER[typ] ?? {} }]),
  ),
};

/** Fuehrende/abschliessende Anfuehrungszeichen eines url()-Werts — als HTML-ENTITY
 *  (&quot;, &apos;, &#34;, &#39;, &#x22;, &#x27;) oder literal. */
const URL_RAND_QUOTES =
  /^(?:&quot;|&apos;|&#0*34;|&#0*39;|&#x0*22;|&#x0*27;|["'])+|(?:&quot;|&apos;|&#0*34;|&#0*39;|&#x0*22;|&#x0*27;|["'])+$/gi;

/** Saeubert einen aus url(...) gegriffenen Wert von umschliessenden Quotes.
 *
 *  WARUM noetig: Im FINALEN Seiten-Markup (Client-DOM-Abgriff, S3) serialisiert
 *  der Browser ein inline `style="…"`-Attribut mit inneren Anfuehrungszeichen zu
 *  HTML-Entities — aus `url("/import/x.webp")` wird `url(&quot;/import/x.webp&quot;)`.
 *  Die url()-Regex sieht `&quot;` NICHT als Quote (kein literales " ), fasst es
 *  also mit in den Pfad → `&quot;/import/x.webp&quot;`. klassifiziere() liest das
 *  fuehrende `&` als „extern" → der Pfad bekaeme KEIN assets/-Ziel und bliebe als
 *  absoluter Dev-Pfad stehen (Defekt b: die Hero-/Hintergrundbilder). Deshalb die
 *  Entity-/Literal-Quotes hier abschneiden, BEVOR klassifiziert wird — der reine
 *  `/import/…`-Pfad wird dann korrekt ausgelagert; die `&quot;`-Klammern im Markup
 *  bleiben als gueltige Attribut-Delimiter um den neuen relativen ./assets/-Pfad. */
function saeubereUrlWert(roh: string): string {
  return roh.trim().replace(URL_RAND_QUOTES, "").trim();
}

/** Findet alle roh geschriebenen url()-Pfade in einem CSS-/style-Text
 *  (Hintergrundbilder u.a.) — 1:1 die Regex aus html-zu-puck.urlPfade, hier
 *  dupliziert statt importiert, weil jenes Modul DOM-lastig ist (DOMParser).
 *  Umschliessende Quotes (auch HTML-Entities aus DOM-serialisierten style-Attributen)
 *  werden entfernt, s. saeubereUrlWert. */
function urlPfade(css: string): string[] {
  const out: string[] = [];
  const re = /url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const wert = saeubereUrlWert(m[2]);
    if (wert) out.push(wert);
  }
  return out;
}

/** Alle <img src="…"> eines Markup-Strings (rein per Regex — DOM-frei). */
function imgQuellen(markup: string): string[] {
  const out: string[] = [];
  const re = /<img\b[^>]*?\bsrc\s*=\s*(['"])([^'"]+)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) out.push(m[2].trim());
  return out;
}

/** Sammelt vollstaendig alle Asset-/CSS-Referenzen einer Seite:
 *   · Puck-Data (walkTree): BildBlock.src, GrafikLayer.src, HtmlBlock-<img>/url()
 *     — inkl. beliebig tief verschachtelter SektionBlock-Slot-Kinder;
 *   · anim.grafiken[].src + keyframes[].srcOverride;
 *   · styles[]: jede CSS-Datei + (falls ihr Text via `cssInhalte` bekannt ist)
 *     ihre lokalen url()-Sub-Assets (Fonts/Bilder) — reüsiert css-rewrite.ts.
 *
 *  Deduplizierung: Assets nach `roh` (erste Herkunft gewinnt); Reihenfolge =
 *  Fundreihenfolge (deterministisch → stabile Ausgabe). Externe Referenzen
 *  werden mitgezaehlt, aber als klasse:"extern" markiert (kein Datei-Ziel).
 *
 *  cssInhalte: href → CSS-Text der styles[]-Dateien. Vom Aufrufer geladen
 *  (dieses Modul macht kein Netz). Fehlt ein Eintrag, bleibt die CSS ohne
 *  Sub-Asset-Aufloesung (wird spaeter roh kopiert). */
export function sammleAssetReferenzen(
  data: Data,
  anim?: SeitenAnim | null,
  styles?: string[] | null,
  cssInhalte?: Record<string, string> | null,
): AssetReferenzen {
  const assets: AssetReferenz[] = [];
  const gesehen = new Set<string>();
  const fuege = (roh: string, herkunft: RefHerkunft): void => {
    const s = (roh ?? "").trim();
    if (s === "" || gesehen.has(s)) return;
    gesehen.add(s);
    assets.push({ roh: s, klasse: klassifiziere(s), herkunft });
  };

  /* --- Puck-Data: walkTree ruft den Callback je Slot-/Wurzel-Inhaltsliste auf;
     jedes Item erscheint genau einmal. Wir aendern nichts (Rueckgabe = Eingabe). */
  walkTree(data, SLOT_CONFIG as unknown as Parameters<typeof walkTree>[1], (inhalt) => {
    for (const item of inhalt) {
      if (!item || typeof item !== "object") continue;
      const typ = (item as { type?: unknown }).type;
      const props = (item as { props?: Record<string, unknown> }).props ?? {};
      if (typ === "BildBlock") {
        if (typeof props.src === "string") fuege(props.src, "bild-block");
      } else if (typ === "GrafikLayer") {
        if (typeof props.src === "string") fuege(props.src, "grafik-layer");
      } else if (typ === "HtmlBlock") {
        const html = typeof props.html === "string" ? props.html : "";
        for (const q of imgQuellen(html)) fuege(q, "html-img");
        for (const q of urlPfade(html)) fuege(q, "html-url");
      }
    }
    return inhalt;
  });

  /* --- Animations-Abbild: Grafik-Quelle + Keyframe-Bildtausch. */
  for (const g of anim?.grafiken ?? []) {
    fuege(g.src, "anim-src");
    for (const k of g.keyframes) {
      if (typeof k.srcOverride === "string") fuege(k.srcOverride, "anim-override");
    }
  }

  /* --- Uebernommene Stylesheets: je Datei + ihre lokalen url()-Sub-Assets. */
  const css: CssDateiRef[] = [];
  for (const href of styles ?? []) {
    const name = href.split("/").pop() ?? "";
    if (name === "") continue;
    const unterAssets: AssetReferenz[] = [];
    const urlErsatz: Record<string, string> = {};
    const text = cssInhalte?.[href];
    if (typeof text === "string") {
      /* basisDir = Verzeichnis der CSS relativ zur Projektwurzel (fuehrendes
         "/" ab). loeseCssPfad rebased relative url() darauf. */
      const basisDir = href.replace(/^\/+/, "").split("/").slice(0, -1).join("/");
      for (const ref of sammleCssAssets(text, basisDir)) {
        const projektPfad = "/" + ref.pfad; // kopierbare Projekt-URL
        const dateiname = assetDateiname(projektPfad);
        unterAssets.push({ roh: projektPfad, klasse: "projekt", herkunft: "css-url" });
        /* Innerhalb der css/-Datei zeigt der url() eine Ebene hoch nach assets/. */
        urlErsatz[ref.rohUrl] = `../assets/${dateiname}`;
      }
    }
    css.push({ roh: href, name, unterAssets, urlErsatz });
  }

  return { assets, css };
}

/** Findet lokale Asset-Referenzen im FINALEN, gerenderten Seiten-Markup
 *  (ORDNER-Modus). Deckt genau die asset-tragenden Stellen ab, die der
 *  Data-Baum-Scan (sammleAssetReferenzen) NICHT sieht — allen voran Bilder, die
 *  eine Komponente erst beim Rendern in ihr innerHTML schreibt (z.B. StrukturBlock:
 *  Logo, Hero-Ebenen) und deshalb in keinem BildBlock/HtmlBlock-Prop stehen:
 *    · src="…" / poster="…"   (img/video/source/audio),
 *    · srcset="…"             (jede Kandidaten-URL, Deskriptor abgeschnitten),
 *    · url(…)                 in style-Attributen / Inline-<style> (Hintergrundbilder).
 *
 *  BEWUSST NICHT <a href> / <link href>: das sind Seiten-Navigation bzw.
 *  Stylesheets (getrennt ueber styles[] behandelt) — sie umzuschreiben wuerde die
 *  interne Verlinkung bzw. den css/-Weg zerstoeren.
 *
 *  Klassifikation via klassifiziere: nur "projekt"/"data" werden spaeter zu
 *  Zielen (assets/<hash>); "extern" (http(s)://, //…, relative Fremdpfade,
 *  nicht-base64-data:) bleibt unangetastet. Reihenfolge = Fundreihenfolge, Dedup
 *  nach roh. REIN & DOM-FREI (Regex, kein DOMParser) — wie das ganze Modul. */
export function sammleMarkupReferenzen(markup: string): AssetReferenz[] {
  const out: AssetReferenz[] = [];
  const gesehen = new Set<string>();
  const fuege = (roh: string, herkunft: RefHerkunft): void => {
    const s = (roh ?? "").trim();
    if (s === "" || gesehen.has(s)) return;
    gesehen.add(s);
    out.push({ roh: s, klasse: klassifiziere(s), herkunft });
  };

  /* src= (auch <source src>) und poster= (video). */
  const srcRe = /\bsrc\s*=\s*(['"])([^'"]+)\1/gi;
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(markup)) !== null) fuege(m[2], "markup-src");
  const posterRe = /\bposter\s*=\s*(['"])([^'"]+)\1/gi;
  while ((m = posterRe.exec(markup)) !== null) fuege(m[2], "markup-poster");

  /* srcset= : kommagetrennte Kandidaten "url [deskriptor]" — nur die URL zaehlt.
     (Lokale Projektpfade enthalten kein Komma → simples Split ist sicher.) */
  const srcsetRe = /\bsrcset\s*=\s*(['"])([^'"]+)\1/gi;
  while ((m = srcsetRe.exec(markup)) !== null) {
    for (const kandidat of m[2].split(",")) {
      const url = kandidat.trim().split(/\s+/)[0];
      if (url) fuege(url, "markup-srcset");
    }
  }

  /* url(…) in style-Attributen / Inline-<style> (Hintergrundbilder). */
  for (const p of urlPfade(markup)) fuege(p, "markup-url");

  return out;
}

/* ================================================================== */
/* 3 · Ordner-Artefakt BAUEN                                           */
/* ================================================================== */

/** Eine Seite als Generator-Eingabe. Alle unreinen Zutaten sind bereits
 *  vorbereitet (s. Modul-Kopf). */
export interface OrdnerSeite {
  /** Ordner-Segment relativ zur Website-Wurzel (z.B. "ueber-uns" oder "blog/post").
   *  Fuer die Startseite egal — dort greift istStart. */
  slug: string;
  /** Startseite? → landet als index.html in der Wurzel, alle anderen unter
   *  <slug>/index.html (relative Verlinkung untereinander). */
  istStart: boolean;
  data: Data;
  anim?: SeitenAnim | null;
  styles?: string[] | null;
  /** Statisches Seiten-Markup (Client-DOM-Abgriff, S3) — Pflicht fuer ORDNER. */
  markup?: string;
  /** Fertige EmbedConfig (baueEmbedConfig) — Pflicht fuer beide Modi. */
  config: EmbedConfig;
  /** wee-embed.js als Text (INLINE: inline gebuendelt; ORDNER: als Datei-Kopie). */
  runtimeJs: string;
  /** Anleitungs-/Script-Pfad fuer den Kommentar-Kopf (s. baueSeiteHtml). */
  embedUrl: string;
  /** CSS-Texte der styles[]-Dateien (href → Inhalt), fuer Sub-Asset-Aufloesung. */
  cssInhalte?: Record<string, string> | null;
}

/** Eine zu schreibende Datei des Ordner-Artefakts. Genau EINES von inhalt/quellUrl:
 *   inhalt   – fertiger Textinhalt (HTML/CSS/README) → direkt schreiben.
 *   quellUrl – Kopier-/Extraktions-Quelle: "/import/…" (Projektdatei kopieren)
 *              oder "data:…" (dekodieren + schreiben). Interpretiert die
 *              Schreib-Route (S2, app/api/export/ordner). */
export interface OrdnerDatei {
  /** Pfad relativ zur Ordner-Wurzel export/<website>/. */
  pfad: string;
  inhalt?: string;
  quellUrl?: string;
}

/** Eine im Ordner-Export nicht aufloesbare Referenz (relativer lokaler Pfad in
 *  src/srcset/poster/url()) — landet als Warnung im Export-Bericht statt still zu
 *  verschwinden. Der Export laeuft trotzdem durch; der Rest wird geschrieben. */
export interface ExportWarnung {
  /** Ziel-HTML-Pfad der betroffenen Seite (z.B. "index.html", "ueber-uns/index.html"). */
  seite: string;
  /** Die rohe, nicht aufloesbare Referenz. */
  roh: string;
  /** Wo sie gefunden wurde (Bericht/Debug). */
  herkunft: RefHerkunft;
  /** Menschenlesbarer Grund. */
  grund: string;
}

export interface OrdnerArtefakt {
  dateien: OrdnerDatei[];
  /** Nicht aufloesbare Referenzen (relative lokale Pfade). Leer = sauber; der
   *  Bericht darf „keine Warnungen" NUR bei wirklich 0 sagen. */
  warnungen: ExportWarnung[];
}

export type ExportModus = "inline" | "ordner";

/** Ziel-HTML-Pfad einer Seite relativ zur Website-Wurzel. */
function seitenPfad(seite: OrdnerSeite): string {
  return seite.istStart ? "index.html" : `${seite.slug}/index.html`;
}

/** Verzeichnis-Tiefe einer Seite (0 = Startseite in der Wurzel). Bestimmt das
 *  relative Praefix zu den geteilten Wurzel-Ordnern (assets/, css/, wee-embed.js). */
function seitenTiefe(seite: OrdnerSeite): number {
  if (seite.istStart) return 0;
  return seite.slug.split("/").filter((s) => s !== "").length;
}

/** Relatives Praefix von einer Seite hoch zur Website-Wurzel: "" fuer die
 *  Startseite, "../" je Unterebene. */
function wurzelPraefix(tiefe: number): string {
  return "../".repeat(tiefe);
}

/** Baut die Umschreibe-Map (roh → relatives Ziel) fuer EINE Seite: Assets nach
 *  <praefix>assets/<hash>.<ext>, CSS-Dateien nach <praefix>css/<name>. Externe
 *  Referenzen kommen NICHT in die Map (bleiben unveraendert). */
function baueZielMap(referenzen: AssetReferenzen, praefix: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const a of referenzen.assets) {
    if (a.klasse === "extern") continue;
    map[a.roh] = `${praefix}assets/${assetDateiname(a.roh)}`;
  }
  for (const c of referenzen.css) {
    map[c.roh] = `${praefix}css/${c.name}`;
  }
  return map;
}

/** Ersetzt in einem Markup-String jede gemappte Quelle durch ihr relatives
 *  Ziel — laengste Quelle zuerst (damit ein kuerzerer Schluessel nicht in den
 *  Text eines laengeren hineingreift), sequenziell per split/join.
 *
 *  BEWUSST KEINE Alternations-Regex: die Quellen koennen mehrere MB grosse
 *  data:-URLs sein (inline gerenderte Bilder im Seiten-Markup). Aus allen
 *  Schluesseln EIN `new RegExp(...join("|"))` zu bauen erzeugt ein riesiges
 *  Pattern, das der Regex-Compiler ablehnt ("Invalid regular expression") —
 *  der Ordner-Export scheiterte daran an echten Seiten. split/join arbeitet
 *  mit reinen String-Literalen (kein Escaping noetig, keine Groessengrenze).
 *
 *  Sicherheit der Sequenz: die Ziele sind kurze relative Pfade
 *  (`<praefix>assets/<hash>.<ext>` / `<praefix>css/<name>`) — kein Schluessel
 *  (data:-URL / /import- / /curtain-Pfad) ist ein Teilstring davon, ein bereits
 *  eingesetztes Ziel wird also von keinem spaeteren Schluessel erneut getroffen. */
function schreibeMarkupAssets(markup: string, map: Record<string, string>): string {
  const paare = Object.entries(map).sort((a, b) => b[0].length - a[0].length);
  let out = markup;
  for (const [roh, ziel] of paare) {
    if (roh === "") continue;
    out = out.split(roh).join(ziel);
  }
  return out;
}

/** Normalisiert einen INTERNEN Seiten-Pfad (der reine Pfadteil eines href, ohne
 *  Query/Hash) zum Vergleichs-Slug einer Seite. Spiegelt die Slug-Ableitung des
 *  Imports/der Seiten-Auswahl (export-seiten-auswahl.waehleWebsiteSeiten): der
 *  Import hat Unterpfade bereits zu „-" verflacht (aus `/bildung/aquaponik/` wird
 *  die Seite `…-bildung-aquaponik` → Slug `bildung-aquaponik`). Also hier ebenso:
 *  fuehrende/abschliessende Slashes + ein evtl. `index.html` weg, dann „/" → „-".
 *  "" = Wurzel = Startseite. So matcht der Original-Link `/bildung/aquaponik/`
 *  (wie `…/index.html`) auf den flachen Ordner-Slug `bildung-aquaponik`.
 *
 *  BEWUSST GETEILT: auch die Station-4-Vorschau (Station4Preview) nutzt diese
 *  EINE Funktion fuer ihre interne Link-Zuordnung — Preview und Ordner-Export
 *  klassifizieren interne Links identisch (keine Drift). */
export function hrefPfadZuSlug(pfad: string): string {
  const kern = pfad
    .replace(/^\/+/, "")
    .replace(/(?:^|\/)index\.html?$/i, "")
    .replace(/\/+$/, "");
  return kern.replace(/\//g, "-");
}

/** Ist `href` ein WURZEL-RELATIVER interner Pfad (`/…`, aber nicht `//…` und kein
 *  `scheme:`)? Nur solche werden als Kandidaten fuer die interne Verlinkung
 *  betrachtet — externe URLs, protokoll-relative, `mailto:`/`tel:`, reine Anker
 *  (`#…`) und (fremd-)relative Pfade bleiben unangetastet. */
function istWurzelRelativ(href: string): boolean {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  return true;
}

/** Ergebnis der internen Link-Umschreibung EINER Seite. */
export interface LinkErgebnis {
  /** Markup mit relativ umgeschriebenen internen Navigations-Links. */
  markup: string;
  /** Interne (wurzel-relative) Links, die auf KEINE Seite dieser Website zeigen —
   *  im Ordner-Artefakt tote Links (Import-Luecke). Roh, unveraendert gelassen. */
  ungeloest: string[];
}

/**
 * Schreibt interne Navigations-Links (`<a href>`) EINER Seite auf relative
 * Ordner-Pfade um, sodass die Seiten des Ordner-Artefakts UNTEREINANDER verlinkt
 * bleiben — auch beim Direktoeffnen (file://) oder Deploy in einem Unterordner
 * (E5, „relative Verlinkung untereinander"). Die Original-Links der importierten
 * Seite sind wurzel-absolut (`/`, `/project-oasis/`, `/bildung/aquaponik/`); im
 * flachen Ordner liegt jede Unterseite unter `<slug>/index.html`, die Startseite
 * als `index.html`.
 *
 * Zuordnung je Link (reiner Pfadteil, Query/Hash bleiben erhalten):
 *   · Pfad → `""` (Wurzel) und es GIBT eine Startseite → `<praefix>index.html`.
 *   · Pfad → bekannter Unterseiten-Slug            → `<praefix><slug>/index.html`.
 *   · sonst (extern/Anker/relativ ODER interner Pfad ohne Ziel-Seite) → UNVERAENDERT
 *     (Letzteres zusaetzlich als `ungeloest` gemeldet — ehrlicher Bericht statt
 *     stiller toter Link).
 * `praefix` = `../`·Tiefe der QUELL-Seite (0 fuer die Startseite).
 *
 * REIN & DOM-FREI (Regex ueber `<a …href=…>`, kein DOMParser) — wie das ganze
 * Modul, damit unit-testbar. BEWUSST NUR `<a>` (Navigation): `src`/`srcset`/
 * `poster`/`url()`/`<link href>` (Assets/Stylesheets) laufen ueber getrennte Wege.
 */
export function schreibeInterneLinks(
  markup: string,
  zielSlugs: Set<string>,
  hatStart: boolean,
  tiefe: number,
): LinkErgebnis {
  const praefix = wurzelPraefix(tiefe);
  const ungeloest: string[] = [];
  /* <a …> mit href-Attribut; Wert per gematchtem Quote begrenzt (kein Ueberlauf
     ueber das schliessende Anfuehrungszeichen). `\shref` verlangt Whitespace davor
     → kein Treffer auf `data-href` o.ae. */
  const re = /(<a\b[^>]*?\shref\s*=\s*)(["'])([^"']*)\2/gi;
  const out = markup.replace(re, (voll, pre: string, q: string, val: string) => {
    const roh = val.trim();
    if (!istWurzelRelativ(roh)) return voll; // extern / Anker / relativ → echtes Verhalten lassen
    const grenze = /[?#]/.exec(roh);
    const pfad = grenze ? roh.slice(0, grenze.index) : roh;
    const suffix = grenze ? roh.slice(grenze.index) : ""; // ?query / #anker erhalten
    const slug = hrefPfadZuSlug(pfad);
    let ziel: string | null = null;
    if (slug === "") {
      if (hatStart) ziel = `${praefix}index.html`;
    } else if (zielSlugs.has(slug)) {
      ziel = `${praefix}${slug}/index.html`;
    }
    if (ziel === null) {
      ungeloest.push(roh); // interner Pfad ohne Ziel-Seite → toter Link, unveraendert
      return voll;
    }
    return `${pre}${q}${ziel}${suffix}${q}`;
  });
  return { markup: out, ungeloest };
}

/** Schreibt die Asset-Referenzen INNERHALB einer EmbedConfig um (Grafik.src +
 *  Keyframe.srcOverride) — rein/immutabel. Gemappte Quellen → relatives Ziel,
 *  ungemappte (externe/Data-URLs ohne Ziel) bleiben stehen. */
function schreibeConfigAssets(config: EmbedConfig, map: Record<string, string>): EmbedConfig {
  const grafiken: Grafik[] = config.grafiken.map((g) => {
    const src = map[g.src] ?? g.src;
    const keyframes: GrafikKeyframe[] = g.keyframes.map((k) =>
      typeof k.srcOverride === "string" && map[k.srcOverride]
        ? { ...k, srcOverride: map[k.srcOverride] }
        : k,
    );
    return { ...g, src, keyframes };
  });
  return { ...config, grafiken };
}

/** Baut die deploybare index.html EINER Seite (ORDNER-Modus): eigenstaendiges
 *  Dokument mit <link> auf die geteilten css/-Dateien, dem umgeschriebenen
 *  Seiten-Markup als Buehne, Overlay-Mount + inline Config (Quellen relativ
 *  umgeschrieben) und der Runtime als EXTERNEM <script src="…wee-embed.js">. */
function baueOrdnerSeiteHtml(
  seite: OrdnerSeite,
  configUmgeschrieben: EmbedConfig,
  markupUmgeschrieben: string,
  praefix: string,
): string {
  const cssLinks = (seite.styles ?? []).map((href) => {
    const name = href.split("/").pop() ?? "";
    return `<link rel="stylesheet" href="${praefix}css/${name}" />`;
  });
  return [
    `<!doctype html>`,
    `<html lang="de">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>WEE-Seite</title>`,
    ...cssLinks,
    `<style>html,body{margin:0;padding:0;}</style>`,
    `</head>`,
    `<body>`,
    `<div data-wee-seite>${markupUmgeschrieben}</div>`,
    ...baueMountUndConfig(configUmgeschrieben),
    `<script src="${praefix}wee-embed.js"></script>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}

/** README fuer die Ordner-Wurzel — knapp und ehrlich (statischer Host, plus die
 *  dokumentierte Anker-Grenze aus baueSeiteHtml/Spec §4). */
function baueOrdnerReadme(seitenAnzahl: number): string {
  return [
    `WEE-Website-Export (Ordner)`,
    ``,
    `${seitenAnzahl} Seite(n). Diesen Ordner unveraendert auf einen beliebigen`,
    `statischen Host laden (index.html ist die Startseite). Kein Server noetig.`,
    ``,
    `Struktur:`,
    `  index.html            Startseite`,
    `  <seite>/index.html    Unterseiten (relativ untereinander verlinkt)`,
    `  wee-embed.js          Animations-Runtime`,
    `  assets/               Bilder/Medien (aus Data-URLs extrahiert + kopiert)`,
    `  css/                  uebernommene Stylesheets`,
    ``,
    `Hinweis: Die Scroll-Animation nutzt absolute Keyframe-Werte (im Export`,
    `statisch eingefroren). Wird das Seiten-Markup nachtraeglich verschoben,`,
    `koennen die Grafiken driften.`,
    ``,
  ].join("\n");
}

/**
 * Der Generator-Kern. Baut aus den Seiten der aktiven Website die Datei-Liste
 * eines der beiden Modi:
 *
 *  INLINE — je Seite EINE selbsttragende HTML via baueSeiteHtml (UNVERAENDERT,
 *    byte-identisch zum bisherigen „Ganze Seite (HTML)"-Export). Powert die
 *    Preview; keine ausgelagerten Dateien.
 *
 *  ORDNER — deploybare Struktur: index.html je Seite (Referenzen relativ
 *    umgeschrieben) + je EINMAL wee-embed.js, jedes Asset (assets/<hash>.<ext>),
 *    jede CSS (css/<name>.css, url() auf ../assets/ rebased) und README.txt.
 *    INVARIANTE (Deliverable „jede Referenz hat Ziel"): fuer jede nicht-externe
 *    Referenz aller Seiten existiert genau eine Ziel-Datei.
 */
export function baueOrdnerArtefakt(seiten: OrdnerSeite[], modus: ExportModus): OrdnerArtefakt {
  if (modus === "inline") {
    return {
      dateien: seiten.map((seite) => ({
        pfad: seitenPfad(seite),
        inhalt: baueSeiteHtml(seite.config, {
          runtimeJs: seite.runtimeJs,
          embedUrl: seite.embedUrl,
          ...(typeof seite.markup === "string" ? { seitenMarkup: seite.markup } : {}),
        }),
      })),
      /* INLINE ist selbsttragend (alle Assets inline) — keine Auslagerung, also
         auch keine unaufloesbaren Ziel-Referenzen. */
      warnungen: [],
    };
  }

  /* --- ORDNER: erst je Seite Referenzen sammeln, dann global zusammenfuehren.
     Zwei Quellen je Seite, verschmolzen:
       1. Data-Baum (sammleAssetReferenzen): BildBlock/GrafikLayer/HtmlBlock +
          anim + styles-Sub-Assets — was IM Datenmodell steht.
       2. Finales Markup (sammleMarkupReferenzen): src/srcset/poster/url() im
          gerenderten innerHTML — faengt komponenten-generierte Bilder ab, die in
          KEINEM Prop stehen (StrukturBlock-Logo/Hero-Ebenen). Ohne diesen Scan
          blieben genau diese Referenzen als absolute Dev-Pfade "/import/…" im
          Export stehen und waeren auf einem statischen Host tote Links (Defekt b).
     Dedup nach roh, Data-Baum-Referenzen behalten Vorrang (erste Herkunft gewinnt).
     Die verschmolzene Liste speist BEIDES: die Markup-Umschreibe-Map UND die
     Kopier-Liste der geteilten assets/-Dateien. */
  const proSeite = seiten.map((seite) => {
    const dataRefs = sammleAssetReferenzen(seite.data, seite.anim, seite.styles, seite.cssInhalte);
    const gesehen = new Set(dataRefs.assets.map((a) => a.roh));
    const assets = [...dataRefs.assets];
    for (const r of sammleMarkupReferenzen(seite.markup ?? "")) {
      if (gesehen.has(r.roh)) continue;
      gesehen.add(r.roh);
      assets.push(r);
    }
    return { seite, refs: { assets, css: dataRefs.css } };
  });

  const dateien: OrdnerDatei[] = [];
  const warnungen: ExportWarnung[] = [];

  /* Multi-Page-Verlinkung: die Slugs ALLER Unterseiten + ob eine Startseite
     existiert — Grundlage fuer die relative Umschreibung der internen
     Navigations-Links (E5, „relative Verlinkung untereinander"). */
  const zielSlugs = new Set(seiten.filter((s) => !s.istStart).map((s) => s.slug));
  const hatStart = seiten.some((s) => s.istStart);

  /* Seiten-HTML (jede mit eigenem Tiefen-Praefix). */
  for (const { seite, refs } of proSeite) {
    const tiefe = seitenTiefe(seite);
    const praefix = wurzelPraefix(tiefe);
    const map = baueZielMap(refs, praefix);
    /* Interne <a>-Navigation zwischen den Seiten DIESER Website relativ
       umschreiben — VOR der Asset-Umschreibung. Disjunkte Attribute (href vs.
       src/srcset/poster/url()), also keine gegenseitige Beeinflussung; die
       relativen Link-Ziele (`<slug>/index.html`) sind kein Teilstring eines
       Asset-Schluessels (die beginnen mit `/` oder `data:`). */
    const linkErgebnis = schreibeInterneLinks(seite.markup ?? "", zielSlugs, hatStart, tiefe);
    const markup = schreibeMarkupAssets(linkErgebnis.markup, map);
    const config = schreibeConfigAssets(seite.config, map);
    dateien.push({ pfad: seitenPfad(seite), inhalt: baueOrdnerSeiteHtml(seite, config, markup, praefix) });
    for (const roh of linkErgebnis.ungeloest) {
      warnungen.push({
        seite: seitenPfad(seite),
        roh,
        herkunft: "a-href",
        grund:
          "interner Navigations-Link ohne importierte Ziel-Seite — im Ordner-Artefakt toter Link (Import-Luecke?)",
      });
    }
  }

  /* Geteilte Wurzel-Dateien EINMAL (dedupliziert ueber alle Seiten). */
  const assetGesehen = new Set<string>();
  const cssGesehen = new Set<string>();
  for (const { seite, refs } of proSeite) {
    /* Bild-/Medien-Assets (Seiten-Refs + CSS-Sub-Assets). */
    const alleAssets = [...refs.assets, ...refs.css.flatMap((c) => c.unterAssets)];
    for (const a of alleAssets) {
      if (a.klasse === "extern") continue;
      const pfad = `assets/${assetDateiname(a.roh)}`;
      if (assetGesehen.has(pfad)) continue;
      assetGesehen.add(pfad);
      dateien.push({ pfad, quellUrl: a.roh }); // "/import/…" kopieren | "data:…" extrahieren
    }
    /* CSS-Dateien — mit rebasten url()s, falls der Text bekannt war. */
    for (const c of refs.css) {
      const pfad = `css/${c.name}`;
      if (cssGesehen.has(pfad)) continue;
      cssGesehen.add(pfad);
      const text = seite.cssInhalte?.[c.roh];
      if (typeof text === "string" && Object.keys(c.urlErsatz).length > 0) {
        dateien.push({ pfad, inhalt: schreibeCssUrls(text, c.urlErsatz).css });
      } else if (typeof text === "string") {
        dateien.push({ pfad, inhalt: text });
      } else {
        dateien.push({ pfad, quellUrl: c.roh }); // Text unbekannt → roh kopieren
      }
    }
  }

  dateien.push({ pfad: "wee-embed.js", inhalt: seiten[0]?.runtimeJs ?? "" });
  dateien.push({ pfad: "README.txt", inhalt: baueOrdnerReadme(seiten.length) });

  /* Unaufloesbare Referenzen sammeln: relative lokale Pfade (src/srcset/poster/
     url()) haben kein assets/-Ziel und keinen sicheren Extern-Fall → auf einem
     statischen Host vermutlich tote Links. Sie brechen den Export NICHT ab (der
     Rest ist deploybar), werden aber ehrlich berichtet. Pro Seite ueber die
     verschmolzene Referenzliste (Data-Baum + Markup-Scan); Dedup pro Seite ist
     durch die Sammler bereits gegeben. Wird an die schon gesammelten
     internen-Link-Warnungen angehaengt (dieselbe warnungen-Liste). */
  for (const { seite, refs } of proSeite) {
    const label = seitenPfad(seite);
    for (const a of refs.assets) {
      if (a.klasse === "extern" && istUnaufloesbar(a.roh)) {
        warnungen.push({
          seite: label,
          roh: a.roh,
          herkunft: a.herkunft,
          grund: "relativer lokaler Pfad — kein Export-Ziel, auf statischem Host vermutlich toter Link",
        });
      }
    }
  }

  return { dateien, warnungen };
}
