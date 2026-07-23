/*
 * POST /api/export/ordner — Ordner-Struktur-Export (Station 4, S2).
 * Spec: docs/plan-analyse/lens-preview-export.md §3-S2 (+ §2 Ziel-Architektur).
 *
 * SCHREIB-ROUTE des Ordner-Exports: nimmt das vom Client (components/embed/
 * ordner-export.ts, baueOrdnerArtefakt "ordner") FERTIG zusammengebaute Artefakt
 * entgegen und materialisiert es als deploybaren Rohbau unter export/<slug>/
 * (Projektwurzel, gitignored). Der Server baut NICHTS an Puck — er importiert
 * puck.config.tsx nicht (Registry-Invariante, s. lib/puck-registry.ts). Er
 * schreibt nur reine Dateien.
 *
 * Body: { slug, dateien: [{ pfad, inhalt? , quellUrl? }], spiegel?, leeren? }
 *   slug     Ziel-Website-Ordner (= reiner Dateinamen-Baustein, ein Segment).
 *   spiegel  optional true → zusaetzlich public/export/<slug>/ schreiben (statisch
 *            ausgelieferter Vorschau-Spiegel fuer Station 4). Default false (nur
 *            export/<slug>/) — Vertrag der bestehenden Aufrufer unveraendert.
 *   leeren   optional true → den Ziel-Ordner export/<slug>/ (und, falls spiegel,
 *            public/export/<slug>/) VOR dem Schreiben komplett leeren (Clean-Write).
 *            Ohne dies akkumulieren Altlasten eines frueheren Exports: verwaiste
 *            Assets bleiben liegen, Seiten geloeschter Slugs bleiben stehen — der
 *            Bericht (anzahl = frisch geschriebene Dateien) zaehlt dann weniger,
 *            als real auf der Platte liegt. Das Leeren geschieht bewusst ERST NACH
 *            der Validierung (Pass 1) und bleibt streng innerhalb der
 *            ausbruchsgeprueften Wurzeln. Default false (additiv, Alt-Vertrag).
 *   dateien  Liste der zu schreibenden Dateien. Je Eintrag GENAU EINE Quelle:
 *     pfad     Ziel-Pfad RELATIV zu export/<slug>/ — darf Unterordner enthalten
 *              (index.html, ueber-uns/index.html, assets/<hash>.png, css/x.css),
 *              aber kein ".."/absolut/Laufwerk (Ausbruch → 400).
 *     inhalt   Fertiger Text (HTML/CSS/JS/README) → direkt schreiben. Nur fuer
 *              Text-Endungen (.html/.js/.css/.txt/.json).
 *     quellUrl Kopier-/Extraktions-Quelle (so liefert es der Generator):
 *                "data:…;base64,…"  → dekodieren + schreiben (Extraktion)
 *                "/import/…", "/curtain/…", "/vektor/…" → aus public/ KOPIEREN.
 *                "/_next/…"          → aus dem Next-Build-Ordner .next/ KOPIEREN
 *                                       (next/font-optimierte Schriften liegen unter
 *                                       .next/static/media/, NICHT unter public/ —
 *                                       der Dev-Server liefert sie unter der URL
 *                                       /_next/ aus). Ohne diese Wurzel scheiterte
 *                                       der Export an jeder Seite, deren uebernommene
 *                                       CSS auf /_next/static/media/*.woff2 verweist.
 *              Aliase dataUrl (nur data:) und quellPfad (nur /…) werden zusaetzlich
 *              akzeptiert (Spec-Wortlaut §3-S2), falls quellUrl fehlt.
 *
 * SICHERHEITSMUSTER 1:1 aus app/api/import/asset/route.ts:
 *   · Origin-Gate (CSRF) via pruefeUrsprung.
 *   · Pfad-Guards: jeder Ziel-Pfad wird segmentweise gesaeubert (kein ".."/":"/
 *     absolut) UND danach nochmal geprueft, dass er real unter export/<slug>/
 *     liegt (Guertel und Hosentraeger). Kopier-Quellen muessen real unter
 *     public/ liegen.
 *   · Endungs↔MIME-Whitelist eng gekoppelt: Text-Endungen nur mit Text-Inhalt/
 *     passendem data:text-MIME, Bild/Font/Medien nur mit ihrer MIME-Familie.
 *     Nicht-Whitelist-Endung → 400.
 *   · Groessenlimits: Body 64 MB, je Datei 12 MB, max. Anzahl Dateien.
 *
 * Zwei-Pass-Schreiben: erst ALLE Dateien validieren + Bytes vorbereiten (wirft
 * bei jedem Verstoss, bevor irgendwas geschrieben wird), dann in einem zweiten
 * Durchgang schreiben. So bleibt bei einem ungueltigen Eintrag kein halber
 * Ordner zurueck.
 */

import { writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { join, resolve, dirname, sep } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { AnfrageFehler, fehlerAntwort, leseJsonBody, pruefeUrsprung, saubererName } from "@/lib/api/server-helfer";

export const runtime = "nodejs";

/** Wurzel des Ordner-Exports = export/ der Projektwurzel (gitignored). */
const EXPORT_WURZEL = resolve(process.cwd(), "export");
/** Optionaler, statisch ausgelieferter SPIEGEL des Exports unter public/export/
 *  (gitignored). Wird nur geschrieben, wenn body.spiegel:true — er dient allein
 *  der Station-4-Vorschau, die das echte On-Disk-Artefakt in einem iframe unter
 *  /export/<slug>/… laden will (Next liefert public/ statisch aus, relative
 *  Verweise ./wee-embed.js/./css/./assets/ loesen dort korrekt auf). Der
 *  deploybare Rohbau bleibt export/<slug>/ (E6); der Spiegel ist ein Dev-Extra. */
const OEFFENTLICH_WURZEL = resolve(process.cwd(), "public", "export");
/** Kopier-Quellen liegen unter public/ (Projekt-Assets) ODER — fuer
 *  next/font-optimierte Schriften (`/_next/static/media/…`) — unter dem
 *  Next-Build-Ordner .next/, den der Dev-Server unter der URL /_next/ statisch
 *  ausliefert. Beide Wurzeln mit eigener Ausbruch-Gegenprobe (s. leseQuelldatei). */
const QUELL_WURZEL = resolve(process.cwd(), "public");
const NEXT_WURZEL = resolve(process.cwd(), ".next");

const MAX_BODY_BYTES = 64_000_000;
const MAX_DATEI_BYTES = 12_000_000;
const MAX_DATEIEN = 2000;
const MAX_PFAD_LAENGE = 400;
const MAX_SEGMENT_LAENGE = 100;

/** Endungs↔MIME-Klassifikation je Ziel-Pfad. `text` = darf als roher `inhalt`
 *  (utf-8) geschrieben werden; `mime` = erlaubte data:-URL-Familie (enge
 *  Kopplung wie import/asset). null = Endung nicht auf der Whitelist. */
interface Klasse {
  text: boolean;
  mime: RegExp;
}

function klassifiziere(letztesSegment: string): Klasse | null {
  const name = letztesSegment.toLowerCase();
  if (/\.html?$/.test(name)) return { text: true, mime: /^data:text\/html;base64,/ };
  if (/\.js$/.test(name)) return { text: true, mime: /^data:(text|application)\/(javascript|ecmascript);base64,/ };
  if (/\.css$/.test(name)) return { text: true, mime: /^data:text\/css;base64,/ };
  if (/\.txt$/.test(name)) return { text: true, mime: /^data:text\/plain;base64,/ };
  if (/\.json$/.test(name)) return { text: true, mime: /^data:application\/json;base64,/ };
  if (/\.(svg|png|apng|jpe?g|webp|gif|avif|ico)$/.test(name)) {
    return { text: false, mime: /^data:(image|video|application)\/[\w+.-]+;base64,/ };
  }
  if (/\.(woff2?|ttf|otf|eot)$/.test(name)) {
    return { text: false, mime: /^data:(font|application)\/[\w+.-]+;base64,/ };
  }
  if (/\.(mp4|webm|ogg|ogv|mp3|wav|m4a)$/.test(name)) {
    return { text: false, mime: /^data:(video|audio|application)\/[\w+.-]+;base64,/ };
  }
  return null;
}

/** Saeubert einen relativen Ziel-Pfad (darf MEHRERE Segmente/Unterordner haben)
 *  zu einem ausbruchssicheren Segment-Array. Anders als saubererName (ein
 *  Segment) erlaubt dies "ueber-uns/index.html" o.ä., verbietet aber jedes
 *  ".."/"."/absolut/Laufwerk/":"/Windows-Sonderzeichen — segmentweise geprueft.
 *  Wirft statt still zu kuerzen. */
function saubereRelSegmente(roh: unknown): string[] {
  if (typeof roh !== "string") throw new AnfrageFehler(400, "Pfad fehlt");
  const p = roh.trim();
  if (!p) throw new AnfrageFehler(400, "Pfad fehlt");
  if (p.length > MAX_PFAD_LAENGE) throw new AnfrageFehler(400, "Pfad zu lang");
  /* absolute Pfade und Laufwerksbuchstaben (C:\…) verbieten — der Export-Pfad
     ist IMMER relativ zur Ordner-Wurzel. */
  if (p.startsWith("/") || p.startsWith("\\") || /^[a-zA-Z]:/.test(p)) {
    throw new AnfrageFehler(400, "Pfad muss relativ sein");
  }
  const segmente = p.split(/[\\/]+/);
  for (const seg of segmente) {
    if (!seg || seg === "." || seg === "..") throw new AnfrageFehler(400, "Ungültiger Pfad (.. oder leer)");
    if (seg.length > MAX_SEGMENT_LAENGE) throw new AnfrageFehler(400, "Pfad-Segment zu lang");
    /* gleiche Zeichen-Whitelist wie saubererName, plus explizit kein ":". */
    if (seg.includes(":") || !/^[\p{L}\p{N} _.-]+$/u.test(seg)) {
      throw new AnfrageFehler(400, "Ungültiger Pfad");
    }
    /* Windows verschluckt Namen, die auf Punkt/Leerzeichen enden. */
    if (/[. ]$/.test(seg)) throw new AnfrageFehler(400, "Segment darf nicht auf . oder Leerzeichen enden");
  }
  return segmente;
}

/** Loest eine Kopier-Quelle gegen ihre erlaubte Wurzel auf und liest sie — mit
 *  Ausbruch-Guard. Fehlende Quelle → 400 (kein stiller 404).
 *
 *  Zwei Wurzeln, streng nach Praefix getrennt:
 *    · "/_next/…" → .next/…  (URL-Segment _next ↔ Build-Ordner .next; hier liegen
 *                   die von next/font optimierten Schriften, s. NEXT_WURZEL). Der
 *                   fuehrende "/_next/" wird abgeschnitten und der REST gegen
 *                   .next/ aufgeloest — "/_next/static/media/x.woff2"
 *                   → .next/static/media/x.woff2.
 *    · alles andere "/…" → public/…  (Projekt-Assets: /import, /curtain, /vektor).
 *  Beide mit derselben startsWith-Gegenprobe gegen ihre Wurzel. */
async function leseQuelldatei(quellUrl: string): Promise<Buffer> {
  const ohneQuery = quellUrl.split(/[?#]/, 1)[0];
  const istNext = /^\/_next\//.test(ohneQuery);
  const wurzel = istNext ? NEXT_WURZEL : QUELL_WURZEL;
  const ohnePraefix = (istNext ? ohneQuery.replace(/^\/_next\//, "") : ohneQuery).replace(/^\/+/, "");
  const quelle = resolve(wurzel, ohnePraefix);
  if (quelle !== wurzel && !quelle.startsWith(wurzel + sep)) {
    throw new AnfrageFehler(400, `Kopier-Quelle außerhalb von ${istNext ? ".next/" : "public/"}`);
  }
  try {
    return await readFile(quelle);
  } catch {
    throw new AnfrageFehler(400, `Kopier-Quelle nicht gefunden: ${quellUrl}`);
  }
}

/** Dekodiert eine data:-URL zu Bytes und prueft die MIME↔Endung-Kopplung. */
function leseDataUrl(dataUrl: string, klasse: Klasse): Buffer {
  if (!klasse.mime.test(dataUrl)) {
    throw new AnfrageFehler(400, "Ungültige Daten (data-URL passt nicht zur Endung)");
  }
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
}

interface VorbereiteteDatei {
  ziel: string;
  relPfad: string;
  daten: Buffer;
}

/** Validiert EINEN Datei-Eintrag vollstaendig und liefert die fertigen Bytes +
 *  den ausbruchsgeprueften Ziel-Pfad. Wirft bei jedem Verstoss (Zwei-Pass:
 *  nichts wird geschrieben, solange nicht ALLE Eintraege gueltig sind). */
async function bereiteDateiVor(eintrag: unknown, slugOrdner: string): Promise<VorbereiteteDatei> {
  if (typeof eintrag !== "object" || eintrag === null) {
    throw new AnfrageFehler(400, "Datei-Eintrag ist kein Objekt");
  }
  const e = eintrag as Record<string, unknown>;

  const segmente = saubereRelSegmente(e.pfad);
  const relPfad = segmente.join("/");
  const klasse = klassifiziere(segmente[segmente.length - 1]);
  if (!klasse) {
    throw new AnfrageFehler(
      400,
      "Nicht erlaubte Endung (nur html/js/css/txt/json, Bilder, Fonts, Medien)",
    );
  }

  /* GENAU eine Quelle: inhalt (Text) ODER quelle (data:-URL | Projektpfad).
     quelle akzeptiert quellUrl (Generator) sowie die Spec-Aliase dataUrl/
     quellPfad, falls quellUrl fehlt. */
  const inhalt = typeof e.inhalt === "string" ? e.inhalt : undefined;
  const quelle =
    typeof e.quellUrl === "string"
      ? e.quellUrl
      : typeof e.dataUrl === "string"
        ? e.dataUrl
        : typeof e.quellPfad === "string"
          ? e.quellPfad
          : undefined;
  if ((inhalt === undefined) === (quelle === undefined)) {
    throw new AnfrageFehler(400, "Genau eine Quelle nötig (inhalt ODER quellUrl)");
  }

  let daten: Buffer;
  if (inhalt !== undefined) {
    /* Roher Text nur fuer Text-Endungen — Binaerformate muessen als data:-URL
       oder Kopier-Quelle kommen (enge Kopplung Endung↔Quelle). */
    if (!klasse.text) {
      throw new AnfrageFehler(400, "Text-Inhalt nur für html/js/css/txt/json erlaubt");
    }
    daten = Buffer.from(inhalt, "utf-8");
  } else if (quelle!.startsWith("data:")) {
    daten = leseDataUrl(quelle!, klasse);
  } else if (quelle!.startsWith("/")) {
    daten = await leseQuelldatei(quelle!);
  } else {
    throw new AnfrageFehler(400, "quellUrl muss data: oder /… sein");
  }

  if (daten.length === 0 || daten.length > MAX_DATEI_BYTES) {
    throw new AnfrageFehler(400, "Datei leer oder zu groß");
  }

  const ziel = join(slugOrdner, ...segmente);
  /* Guertel und Hosentraeger: nach dem Saeubern nochmal pruefen, dass Ziel
     wirklich unter export/<slug>/ liegt. */
  if (!ziel.startsWith(slugOrdner + sep)) {
    throw new AnfrageFehler(400, "Pfad außerhalb des Export-Ordners");
  }
  return { ziel, relPfad, daten };
}

export async function POST(req: NextRequest) {
  try {
    pruefeUrsprung(req);
    const body = await leseJsonBody(req, MAX_BODY_BYTES);

    const slug = saubererName(body.slug);
    if (!Array.isArray(body.dateien)) {
      throw new AnfrageFehler(400, "dateien fehlt oder ist kein Array");
    }
    if (body.dateien.length === 0) {
      throw new AnfrageFehler(400, "Keine Dateien angegeben");
    }
    if (body.dateien.length > MAX_DATEIEN) {
      throw new AnfrageFehler(400, "Zu viele Dateien");
    }

    const slugOrdner = resolve(EXPORT_WURZEL, slug);
    if (slugOrdner !== EXPORT_WURZEL && !slugOrdner.startsWith(EXPORT_WURZEL + sep)) {
      throw new AnfrageFehler(400, "Pfad außerhalb des Export-Ordners");
    }

    /* Optionaler statischer Spiegel unter public/export/<slug>/ (nur fuer die
       Station-4-Vorschau). Ziel-Wurzel mit derselben Ausbruch-Gegenprobe. */
    const spiegel = body.spiegel === true;
    const spiegelOrdner = resolve(OEFFENTLICH_WURZEL, slug);
    if (spiegel && spiegelOrdner !== OEFFENTLICH_WURZEL && !spiegelOrdner.startsWith(OEFFENTLICH_WURZEL + sep)) {
      throw new AnfrageFehler(400, "Pfad außerhalb des Spiegel-Ordners");
    }

    /* Pass 1: ALLES validieren + Bytes bauen (wirft, bevor geschrieben wird). */
    const vorbereitet: VorbereiteteDatei[] = [];
    for (const eintrag of body.dateien) {
      vorbereitet.push(await bereiteDateiVor(eintrag, slugOrdner));
    }

    /* Clean-Write (leeren:true): den Ziel-Ordner komplett leeren, damit Altlasten
       eines frueheren Exports (verwaiste Assets, Seiten geloeschter Slugs) nicht
       akkumulieren. BEWUSST erst hier, NACH Pass 1 — ein ungueltiger Eintrag hat
       oben schon geworfen, ohne einen bestehenden guten Export zu zerstoeren. Das
       rm bleibt streng INNERHALB der bereits ausbruchsgeprueften Wurzeln
       (slugOrdner unter export/, spiegelOrdner unter public/export/) — nie hoeher;
       slug ist ein einzelnes, gesaeubertes Segment (saubererName), also ist
       slugOrdner nie die Wurzel selbst. force:true → kein Fehler, wenn es den
       Ordner beim Erst-Export noch gar nicht gibt. */
    if (body.leeren === true) {
      await rm(slugOrdner, { recursive: true, force: true });
      if (spiegel) await rm(spiegelOrdner, { recursive: true, force: true });
    }

    /* Pass 2: schreiben (Verzeichnisse nach Bedarf anlegen). Der Spiegel wird —
       falls angefordert — aus dem bereits ausbruchsgeprueften relPfad abgeleitet
       (Segmente sind schon gesaeubert) und mit eigener Gegenprobe geschrieben. */
    for (const d of vorbereitet) {
      await mkdir(dirname(d.ziel), { recursive: true });
      await writeFile(d.ziel, d.daten);
      if (spiegel) {
        const spiegelZiel = join(spiegelOrdner, ...d.relPfad.split("/"));
        if (spiegelZiel.startsWith(spiegelOrdner + sep)) {
          await mkdir(dirname(spiegelZiel), { recursive: true });
          await writeFile(spiegelZiel, d.daten);
        }
      }
    }

    return NextResponse.json({
      slug,
      ordner: `export/${slug}`,
      ...(spiegel ? { spiegel: `public/export/${slug}` } : {}),
      anzahl: vorbereitet.length,
      dateien: vorbereitet.map((d) => ({ pfad: d.relPfad, bytes: d.daten.length })),
    });
  } catch (e) {
    return fehlerAntwort(e, "export/ordner");
  }
}
