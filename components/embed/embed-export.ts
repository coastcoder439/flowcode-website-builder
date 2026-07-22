/*
 * embed-export.ts – baut aus dem aktuellen Editor-Zustand (platzierte
 * Grafiken + optional ein im Fluss-Editor gespeicherter Verlauf) die drei
 * Ausgabeformen des Embeds (Phase 3): die Config selbst, ein fertiges
 * HTML-Overlay-Snippet und eine kurze Einbau-Anleitung. Reine Funktionen
 * (kein React, kein DOM-Zugriff außer fetch/FileReader beim Bilder-Inlining)
 * – unabhängig vom Editor testbar, genutzt von GrafikExportPanel.tsx.
 *
 * Wird NICHT von embed-entry.tsx importiert und landet daher NICHT im
 * standalone Runtime-Bundle (public/wee-embed.js, s. scripts/build-embed.mjs)
 * – das ist reines Editor-Tooling, läuft nur innerhalb von Next.
 */

import type { EmbedConfig } from "./EmbedRoot";
import type { Grafik, GrafikKeyframe } from "../grafik/grafik-types";
import type { FlussVerlauf } from "../river/riverSnapshot";

export interface BaueEmbedConfigOptionen {
  /** Projekt-URL-Bilder ("/…") als Data-URL einbetten – macht den Export
   *  SELBSTTRAGEND (Ben muss keine Bilder separat hosten). Data-URL-Quellen
   *  bleiben so oder so unverändert. */
  bilderInline: boolean;
  /** Dokumenthöhe des Editors zum Export-Zeitpunkt (document.documentElement.
   *  scrollHeight) – Grundlage für die Höhen-Normalisierung im fremden Host
   *  (s. EmbedConfig.grafikenDocH/GrafikLayer.tsx). Bewusst vom AUFRUFER
   *  gelesen statt hier: diese Datei bleibt DOM-frei (s. Kopfkommentar,
   *  "unabhängig vom Editor testbar"), GrafikExportPanel.tsx hat als
   *  Client-Komponente den legitimen DOM-Zugriff. */
  docH: number;
}

/** true, wenn `src` eine Projekt-URL ist (beginnt mit "/") – im Unterschied
 *  zu einer bereits eingebetteten Data-URL (s. Asset.src/Grafik.src in
 *  grafik-types.ts, die beides zulassen). Andere Schemata (http(s):, data:)
 *  bleiben unangetastet – nur Projekt-URLs sind das, was auf Bens Server
 *  ohne Weiteres fehlen würde. */
function istProjektUrl(src: string): boolean {
  return src.startsWith("/");
}

/** Lädt eine Projekt-URL und wandelt sie in eine Data-URL um. Ein Fehlschlag
 *  (404, Netzwerkfehler) lässt die Original-URL stehen statt den gesamten
 *  Export abzubrechen – ein einzelnes fehlendes Bild soll den Rest nicht
 *  verhindern; Ben sieht es dann als kaputtes Bild im Ergebnis statt eines
 *  Absturzes. */
async function alsDataUrlOderUnveraendert(src: string): Promise<string> {
  if (!istProjektUrl(src)) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return src;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return src;
  }
}

/** Eine Grafik samt Keyframes fürs Inlining aufbereiten – auch
 *  `srcOverride` je Keyframe zählt als Bildquelle (s. GrafikKeyframe in
 *  grafik-types.ts) und muss denselben Weg gehen, sonst wäre ein
 *  Keyframe-Bildtausch nach dem Export plötzlich kaputt.
 *
 *  Exportiert, damit der Element-Export (element-html-export.ts) dieselbe
 *  Inlining-Regel nutzt statt sie zu duplizieren (Welle 3c). */
export async function verarbeiteGrafik(g: Grafik, bilderInline: boolean): Promise<Grafik> {
  if (!bilderInline) {
    return { ...g, keyframes: g.keyframes.map((k) => ({ ...k })) };
  }
  const src = await alsDataUrlOderUnveraendert(g.src);
  const keyframes = await Promise.all(
    g.keyframes.map(
      async (k): Promise<GrafikKeyframe> =>
        k.srcOverride
          ? { ...k, srcOverride: await alsDataUrlOderUnveraendert(k.srcOverride) }
          : { ...k },
    ),
  );
  return { ...g, src, keyframes };
}

/** Baut die vollständige Embed-Config aus dem Editor-Zustand. Farben werden
 *  explizit aus dem Fluss-Verlauf übernommen (statt sich nur auf den
 *  EmbedRoot-Fallback `farben ?? fluss?.farben` zu verlassen) – so bleibt
 *  die Config auch für sich genommen (ohne fluss-Feld separat gelesen)
 *  eindeutig. */
export async function baueEmbedConfig(
  grafiken: Grafik[],
  flussVerlauf: FlussVerlauf | null,
  optionen: BaueEmbedConfigOptionen,
): Promise<EmbedConfig> {
  const aufbereiteteGrafiken = await Promise.all(
    grafiken.map((g) => verarbeiteGrafik(g, optionen.bilderInline)),
  );
  return {
    grafiken: aufbereiteteGrafiken,
    /* Nur mitgeben, wenn es ueberhaupt etwas zu normalisieren gibt – ein
       leeres grafiken[] braucht keine Hoehen-Referenz. */
    ...(aufbereiteteGrafiken.length > 0 ? { grafikenDocH: optionen.docH } : {}),
    ...(flussVerlauf ? { fluss: flussVerlauf } : {}),
    ...(flussVerlauf?.farben ? { farben: flussVerlauf.farben } : {}),
  };
}

export interface BaueReadmeOptionen {
  /** Pfad/URL, unter dem `wee-embed.js` erreichbar sein soll – wird 1:1 in
   *  den generierten `<script src>` übernommen (s. baueOverlayHtml). */
  embedUrl: string;
}

/** Kurze Einbau-Anleitung als Markdown-Text. Dient ZWEI Zwecken: eigenständig
 *  lesbar (falls je als Datei gebraucht) UND als Kommentar-Kopf im
 *  HTML-Overlay (s. baueOverlayHtml) – die Erklärung lebt dadurch nur an
 *  EINER Stelle statt in zwei Texten, die auseinanderlaufen können. */
export function baueReadme(config: EmbedConfig, optionen: BaueReadmeOptionen): string {
  const flussZeile = config.fluss
    ? `Enthält den Fluss-Verlauf "${config.fluss.name}".`
    : `Enthält keinen Fluss (nur Grafiken).`;
  return [
    `So baust du's ein`,
    ``,
    `Export: ${config.grafiken.length} Grafik(en). ${flussZeile}`,
    ``,
    `1. wee-embed.js auf deiner Seite hosten (einmalig).`,
    `2. wee-anim.json danebenlegen ODER gleich das HTML-Overlay verwenden (Config ist darin schon eingebaut).`,
    `3. Das Overlay-Snippet direkt vor </body> deiner Seite einfügen. Fertig.`,
    ``,
    `Aktueller Runtime-Pfad im Overlay: ${optionen.embedUrl} – anpassen, falls wee-embed.js woanders liegt.`,
    `Lauffähiges Beispiel: embed-demo.html.`,
  ].join("\n");
}

export interface BaueOverlayHtmlOptionen {
  /** s. BaueReadmeOptionen.embedUrl – dieselbe URL steht sowohl im
   *  Kommentar-Kopf als auch im echten <script src>. */
  embedUrl: string;
}

/** Maskiert "<" als Unicode-Escape, damit ein "</script"-Substring irgendwo
 *  im JSON (z.B. in einer eingebetteten Data-URL) das umgebende
 *  <script>-Tag nicht vorzeitig beendet – gängiges Muster für inline JSON in
 *  HTML. */
function escapeFuerInlineScript(json: string): string {
  return json.replace(/</g, "\\u003c");
}

/** Mount-Div + inline Config als die ZWEI gemeinsamen Zeilen von Overlay-
 *  und Ganze-Seite-Export (Welle 3c) – an EINER Stelle, damit die beiden Wege
 *  nicht auseinanderlaufen. Reihenfolge/Wortlaut sind bewusst unverändert
 *  (Overlay-Export bleibt byte-identisch). */
function baueMountUndConfig(config: EmbedConfig): string[] {
  const configJson = escapeFuerInlineScript(JSON.stringify(config));
  return [
    `<div data-wee-anim></div>`,
    `<script type="application/json" data-wee-config>${configJson}</script>`,
  ];
}

/** Kommentar-Kopf (aus baueReadme) als HTML-Kommentarzeilen – geteilt von
 *  Overlay- und Seiten-Export. */
function baueKommentarKopf(config: EmbedConfig, optionen: BaueReadmeOptionen): string[] {
  const kommentarZeilen = baueReadme(config, optionen)
    .split("\n")
    .map((zeile) => (zeile ? ` ${zeile}` : ""));
  return [`<!--`, ...kommentarZeilen, `-->`];
}

/** Baut ein vollständiges, drop-in HTML-Snippet: Kommentar-Kopf (aus
 *  baueReadme, s.o.), Mount-Div, inline Config und der Runtime-Script-Tag –
 *  exakt das Muster aus public/embed-demo.html, nur mit der Config des
 *  aktuellen Editor-Stands statt der festen Demo-Fixture. */
export function baueOverlayHtml(config: EmbedConfig, optionen: BaueOverlayHtmlOptionen): string {
  return [
    ...baueKommentarKopf(config, optionen),
    ...baueMountUndConfig(config),
    `<script src="${optionen.embedUrl}"></script>`,
    ``,
  ].join("\n");
}

/** Maskiert `</script` im Runtime-Bundle, damit ein solcher Substring (z.B. in
 *  einem String-Literal) das umgebende inline <script> nicht vorzeitig beendet.
 *  `<\/script` ist in JS gleichbedeutend (Backslash vor `/` ist folgenlos). */
function escapeRuntimeFuerInline(js: string): string {
  return js.replace(/<\/script/gi, "<\\/script");
}

export interface BaueSeiteHtmlOptionen {
  /** Der komplette Inhalt von `wee-embed.js` (vom Aufrufer per fetch geladen –
   *  diese Datei bleibt DOM-/netzwerkfrei, s. Kopfkommentar). Wird INLINE ins
   *  Dokument gebündelt, damit die Datei ohne separaten Runtime-Upload läuft. */
  runtimeJs: string;
  /** s. BaueReadmeOptionen.embedUrl – nur für den Anleitungs-Kommentar; im
   *  Seiten-Export gibt es kein externes <script src>, die Runtime steckt inline. */
  embedUrl: string;
}

/** Baut ein VOLLSTÄNDIGES, eigenständiges HTML-Dokument (Welle 3c, Spec §8/3c
 *  „ganze Seite"): Gerüst + Overlay-Mount + inline Config + inline Runtime in
 *  EINEM Dokument. Datei aufmachen = die Animation läuft auf einer leeren Seite;
 *  eigenen Inhalt legt man später darunter (s. Anleitung). Nutzt dieselben
 *  Bausteine wie der Overlay-Export (Kommentar-Kopf, Mount+Config) – nur die
 *  Runtime kommt inline statt als externes <script src>. */
export function baueSeiteHtml(config: EmbedConfig, optionen: BaueSeiteHtmlOptionen): string {
  return [
    `<!doctype html>`,
    `<html lang="de">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>WEE-Animation</title>`,
    `<style>`,
    `  html, body { margin: 0; padding: 0; }`,
    `  /* Scroll-Raum, damit die Scroll-Animation auf der noch leeren Seite`,
    `     überhaupt eine Strecke hat. Eigenen Inhalt einfach hier im <body>`,
    `     ergänzen – die Animations-Ebene liegt klick-durchlässig darüber. */`,
    `  body { min-height: 300vh; background: #ffffff; }`,
    `</style>`,
    `</head>`,
    `<body>`,
    ...baueKommentarKopf(config, { embedUrl: optionen.embedUrl }),
    ...baueMountUndConfig(config),
    `<script>`,
    escapeRuntimeFuerInline(optionen.runtimeJs),
    `</script>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}
