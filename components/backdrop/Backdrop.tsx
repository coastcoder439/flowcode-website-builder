"use client";

/*
 * Backdrop – rendert die vom Nutzer gelieferte Fremd-Website als Hintergrund
 * innerhalb der Fluss-Zone (s. app/page.tsx: <RiverFlow>{backdrop}</RiverFlow>).
 *
 * Backdrop ist bewusst NUR Rendering — kein State, keine Auswahl-Logik (die
 * lebt in BackdropContext/BackdropAuswahl). Drei Darstellungen:
 *
 *   Bild   – <img>: die intrinsische Höhe setzt automatisch die Dokumenthöhe,
 *            die Seite scrollt ganz normal über das Bild.
 *   HTML   – <iframe srcDoc>: same-origin (about:srcdoc erbt die Berechtigungen
 *            des Elternfensters), deshalb per contentDocument lesbar — die
 *            Höhe wird nach dem Laden gemessen und auf die iframe uebertragen
 *            (ResizeObserver haelt sie synchron, falls der Inhalt spaeter
 *            nachwaechst, z.B. Web-Fonts/Bilder, die erst nach onLoad ihre
 *            Groesse aendern).
 *   Ordner – <iframe src="/wee-site/">: same-origin ueber einen Service
 *            Worker (s. ordner-serve.ts), der die vorher in den Cache
 *            Storage "wee-site" gelesenen Dateien des gepickten Ordners
 *            ausliefert. Die eigentliche Bereitstellung (Cache fuellen +
 *            Service Worker registrieren) passiert HIER beim Mounten, nicht
 *            in BackdropAuswahl — nur so ist garantiert, dass die iframe
 *            erst dann auf /wee-site/ zeigt, wenn der Cache wirklich gefuellt
 *            ist (sonst waere der allererste Ladeversuch ein Wettlauf gegen
 *            die asynchrone Bereitstellung und koennte 404en).
 *
 * ALLE DREI Darstellungen bekommen pointer-events:none: der Editor-Overlay
 * bedient sich komplett selbst (data-grafik-id-Treffer am window,
 * .river-zone-Knoten), der Backdrop soll dabei nie Klicks abfangen oder —
 * im iframe-Fall — selbst scrollen/navigieren.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Render, type Data } from "@puckeditor/core";
import { config } from "@/app/puck/puck.config";
import { GescopteSeitenStyles } from "@/components/import/SeitenStyles";
import type { Backdrop as BackdropDaten } from "./backdrop-types";
import { ordnerBereitstellen, ordnerHolen } from "./ordner-serve";
import { setzeBuehneDoc } from "./buehne-doc";
import "./backdrop.css";

/** Platzhalter-Hoehe, bis die erste Messung nach dem iframe-Laden eintrifft —
 *  verhindert einen Null-Hoehe-Sprung (Fluss-Zone waere sonst kurz 0px hoch). */
const IFRAME_STARTHOEHE_PX = 600;

/** Harte Obergrenze fuer die Voll-Hoehe-Buehne (I8-FIX, Runaway-Schutz).
 *  Die eigentliche Ursache (vh-Einheiten im Voll-Hoehe-iframe) ist an der Quelle
 *  behoben — buehne-schreiben.mjs fixiert Hoehen-Viewport-Einheiten auf px. Diese
 *  Grenze ist die zweite Verteidigungslinie: sollte je eine Seite (fremde Import-
 *  quelle, spaeteres JS) die Inhaltshoehe unkontrolliert wachsen lassen, wird die
 *  gemessene Hoehe hart gedeckelt, statt in Chromiums 2^25-px-Limit (33.554.428px)
 *  zu laufen und die Seite unbedienbar zu machen. Grosszuegig gewaehlt (weit ueber
 *  jeder realen Seitenhoehe, weit unter dem Browser-Limit). */
const BUEHNE_MAX_HOEHE_PX = 200_000;

/** Fuegt <base target="_blank"> in den HTML-Text ein, damit Links im
 *  Backdrop (falls doch einmal ein Klick durchkommt) ein neues Tab oeffnen
 *  statt den iframe wegzunavigieren. Best effort: findet sie kein <head>,
 *  wird ein eigener vorangestellt — bei bereits vorhandenem <!doctype>/<html>
 *  ignorieren Browser den doppelten Kopf, das Rendering bleibt unbeeintraechtigt. */
function mitBaseTag(html: string): string {
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const i = headMatch.index! + headMatch[0].length;
    return html.slice(0, i) + '<base target="_blank">' + html.slice(i);
  }
  return `<head><base target="_blank"></head>${html}`;
}

function BackdropHtml({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [hoehe, setHoehe] = useState(IFRAME_STARTHOEHE_PX);

  const syncHoehe = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.documentElement;
    if (!el) return;
    const h = Math.max(el.scrollHeight, doc?.body?.scrollHeight ?? 0);
    if (h > 0) setHoehe(h);
  }, []);

  const onLoad = useCallback(() => {
    syncHoehe();
    /* Vorherigen Observer abhaengen (onLoad feuert bei JEDEM srcDoc-Wechsel
       erneut — z.B. wenn ein anderer Backdrop gewaehlt wird). */
    roRef.current?.disconnect();
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    const ro = new ResizeObserver(syncHoehe);
    ro.observe(body);
    roRef.current = ro;
  }, [syncHoehe]);

  useEffect(() => () => roRef.current?.disconnect(), []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={mitBaseTag(html)}
      onLoad={onLoad}
      title="Eigene Website (Hintergrund)"
      className="hg-backdrop-html"
      style={{ height: hoehe }}
    />
  );
}

type OrdnerStatus = "laedt" | "bereit" | "keine-berechtigung" | "fehler";

/** Ordner-Backdrop: prueft beim Mounten still die Berechtigung des gemerkten
 *  Ordner-Handles (kein requestPermission — das braucht eine Nutzergeste,
 *  die hier nicht vorliegt), fuellt bei Erfolg den Cache neu (deckt sowohl
 *  "Seite neu geladen" als auch "Nutzer hat den Handle woanders erneuert"
 *  ab) und zeigt die iframe erst danach. Eigene, absichtlich NICHT
 *  wiederverwendete Kopie der Hoehen-Sync-Logik von BackdropHtml (statt
 *  eines gemeinsamen Hooks) — die bestehenden Backdrop-Modi sollen von
 *  dieser Erweiterung unberuehrt bleiben. */
function BackdropOrdner() {
  const [status, setStatus] = useState<OrdnerStatus>("laedt");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [hoehe, setHoehe] = useState(IFRAME_STARTHOEHE_PX);

  useEffect(() => {
    let tot = false;
    void (async () => {
      try {
        const handle = await ordnerHolen(false);
        if (!handle) {
          if (!tot) setStatus("keine-berechtigung");
          return;
        }
        await ordnerBereitstellen(handle);
        if (!tot) setStatus("bereit");
      } catch {
        if (!tot) setStatus("fehler");
      }
    })();
    return () => {
      tot = true;
    };
  }, []);

  const syncHoehe = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.documentElement;
    if (!el) return;
    const h = Math.max(el.scrollHeight, doc?.body?.scrollHeight ?? 0);
    if (h > 0) setHoehe(h);
  }, []);

  const onLoad = useCallback(() => {
    syncHoehe();
    roRef.current?.disconnect();
    const body = iframeRef.current?.contentDocument?.body;
    if (!body) return;
    const ro = new ResizeObserver(syncHoehe);
    ro.observe(body);
    roRef.current = ro;
  }, [syncHoehe]);

  useEffect(() => () => roRef.current?.disconnect(), []);

  if (status === "laedt") {
    return <div className="hg-backdrop-hinweis">Lade Ordner-Inhalt…</div>;
  }
  if (status !== "bereit") {
    const text =
      status === "keine-berechtigung"
        ? "Kein Zugriff mehr auf den Ordner — im Panel „Hintergrund\" erneut freigeben."
        : "Ordner konnte nicht bereitgestellt werden.";
    return <div className="hg-backdrop-hinweis">{text}</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      src="/wee-site/"
      onLoad={onLoad}
      title="Eigene Website (Ordner-Hintergrund)"
      className="hg-backdrop-html"
      style={{ height: hoehe }}
    />
  );
}

type LebendigStatus = "pruefe" | "lebendig" | "render";

/*
 * QUELLEN-PRIORITÄT DER BÜHNE FÜR EINE IMPORTIERTE SEITE (I8/I8b/M8) — drei
 * Stufen, absteigend „lebendigster Zustand zuerst". Welche greift, haengt am
 * gemerkten Backdrop-Modus (backdrop.art), NICHT an einer Laufzeit-Erkennung:
 *
 *   (a) VERBUNDENER ORDNER — art:"ordner" → BackdropOrdner (oben in dieser
 *       Datei): der Service-Worker-Ordnermodus serviert die Original-Dateien
 *       (inkl. JS) same-origin unter /wee-site/ → die Seite laeuft LEBENDIG MIT
 *       ihren eigenen (auch JS-getriebenen) Animationen. Das ist der von M8
 *       geforderte Zustand. Erreichbar (I8b) direkt aus dem Seiten-Import
 *       (SeitenImport: „Als lebendige Animator-Bühne verbinden") ODER ueber
 *       „📁 Ordner öffnen" im Hintergrund-Reiter (BackdropAuswahl). Braucht ein
 *       gueltiges FS-Handle (Chrome/Edge, erlaubter Zugriff).
 *
 *   (b) EINGEFRORENE BÜHNE — art:"puck-seite" MIT vorliegender
 *       public/import/<slug>/buehne.html → BackdropLebendeSeite (unten): die
 *       gefrorene, NICHT-entkernte Original-Fassung. Layout/Fonts/Bilder/CSS-
 *       Animationen echt, aber JS-Entrance-Animationen laufen NICHT erneut ab
 *       (Endzustand, s. buehne-schreiben.mjs „EHRLICHE GRENZE"). Der Fallback
 *       ohne verbundenen Ordner.
 *
 *   (c) PUCK-RENDER — art:"puck-seite" OHNE buehne.html → BackdropPuckRender
 *       (unten): die zerlegten Bausteine per <Render> inline. Native Puck-Seiten
 *       (kein Import) sowie Importe ohne Bühnen-Fassung. Kein Feature-Verlust.
 *
 * Der Hintergrund-Reiter (BackdropAuswahl) weist bei aktiver Stufe (b) dezent
 * darauf hin, dass ein verbundener Ordner Stufe (a) — die Original-Animationen —
 * brächte.
 */

/** Puck-Seiten-Backdrop mit QUELLEN-WEICHE (I8/M8, lens-import.md §2-Ziel):
 *
 *  Liegt zur Seite eine eingefrorene, NICHT-entkernte Original-Fassung als
 *  public/import/<name>/buehne.html vor (der Import legt sie beim Freeze ab —
 *  MIT den Original-Animationen, JS/CSS der Quellseite intakt), wird DIESE als
 *  lebendige iframe-Bühne gerendert (BackdropLebendeSeite). Sonst — native
 *  Puck-Seiten ohne Import, oder Import ohne buehne.html — bleibt es beim
 *  bisherigen <Render>-Pfad (BackdropPuckRender): kein Feature-Verlust.
 *
 *  Die Weiche fragt die Existenz über POST /api/import/buehne { slug } ab (JSON
 *  { vorhanden }, IMMER HTTP 200). BEWUSST NICHT per direktem GET auf die Datei:
 *  ein 404 auf /import/<slug>/buehne.html (der Normalfall bei nativen Seiten ohne
 *  Bühne) würde der Browser als Konsolen-Fehler protokollieren — der Existenz-
 *  Endpoint vermeidet das (I8-FIX „0 Konsolen-Errors"). POST folgt der Routen-
 *  Konvention des Projekts (output:"export" verträgt keine dynamischen GET-Routen;
 *  vgl. puck-seite/lade). Während der Prüfung zeigt sie den Lade-Hinweis der
 *  Render-Bühne, damit kein Aufblitzen entsteht. */
function BackdropPuckSeite({ name }: { name: string }) {
  const [modus, setModus] = useState<LebendigStatus>("pruefe");

  useEffect(() => {
    let tot = false;
    setModus("pruefe");
    void (async () => {
      try {
        const res = await fetch("/api/import/buehne", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: name }),
          cache: "no-store",
        });
        const json = (await res.json()) as { vorhanden?: boolean };
        if (!tot) setModus(res.ok && json.vorhanden === true ? "lebendig" : "render");
      } catch {
        /* Netzfehler → sicherer Fallback auf die bestehende Render-Bühne. */
        if (!tot) setModus("render");
      }
    })();
    return () => {
      tot = true;
    };
  }, [name]);

  if (modus === "pruefe") {
    return <div className="hg-backdrop-hinweis">Prüfe Bühne „{name}“…</div>;
  }
  if (modus === "lebendig") {
    return <BackdropLebendeSeite slug={name} />;
  }
  return <BackdropPuckRender name={name} />;
}

/** Lebendige iframe-Bühne (I8/M8): rendert public/import/<slug>/buehne.html —
 *  die eingefrorene, NICHT-entkernte Original-Seite MIT ihren Animationen (JS/
 *  CSS der Quelle intakt) — als same-origin <iframe>. VOLL-HÖHE-Modell wie der
 *  Ordner-Backdrop: die iframe-Höhe wird auf die Inhalts-Höhe gesetzt, sie
 *  scrollt also NIE intern — die Host-Seite scrollt sie als einen Block. Dadurch
 *  ist die Scroll-Kopplung iframe↔Overlay INHÄRENT (nicht nachträglich
 *  synchronisiert): ein Element bei iframe-lokal rect.top steht im Host bei
 *  iframe.rect.top + rect.top (iframe-Intern-Scroll immer 0).
 *
 *  Der Anker-Mechanismus (WebsiteOg/GrafikEditor) greift auf das
 *  contentDocument zu — beim Laden meldet die Bühne es an der buehne-doc-
 *  Registry an (setzeBuehneDoc), beim Unmount/Wechsel wieder ab. pointer-events:
 *  none wie alle Backdrop-Modi. */
function BackdropLebendeSeite({ slug }: { slug: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const [hoehe, setHoehe] = useState(IFRAME_STARTHOEHE_PX);

  const syncHoehe = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.documentElement;
    if (!el) return;
    const roh = Math.max(el.scrollHeight, doc?.body?.scrollHeight ?? 0);
    /* Runaway-Schutz (I8-FIX): hart deckeln, damit ein eventuell doch noch
       hoehen-relativ wachsender Inhalt nie in Chromiums 2^25-Limit laeuft. */
    const h = Math.min(roh, BUEHNE_MAX_HOEHE_PX);
    if (h > 0) setHoehe(h);
  }, []);

  const onLoad = useCallback(() => {
    syncHoehe();
    roRef.current?.disconnect();
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!iframe || !doc?.body) return;
    const ro = new ResizeObserver(syncHoehe);
    ro.observe(doc.body);
    roRef.current = ro;
    /* Lebendige Bühne anmelden: ab jetzt scannt/misst der OG-Anker-Mechanismus
       gegen dieses Dokument (mit iframe-Versatz), s. buehne-doc.ts. */
    setzeBuehneDoc({ doc, iframe });
  }, [syncHoehe]);

  useEffect(
    () => () => {
      roRef.current?.disconnect();
      setzeBuehneDoc(null);
    },
    [],
  );

  return (
    <div className="hg-backdrop-lebendig" data-fc-buehne-lebendig>
      <iframe
        ref={iframeRef}
        src={`/import/${encodeURIComponent(slug)}/buehne.html`}
        onLoad={onLoad}
        title="Eigene Website (lebendige Bühne)"
        className="hg-backdrop-html"
        style={{ height: hoehe }}
      />
    </div>
  );
}

/** Puck-Seiten-Backdrop, RENDER-Pfad (Welle 4c, docs/editor-vereinheitlichung.md
 *  §9/4c(2)): laedt seiten/<name>.json ueber /api/puck-seite/lade und rendert sie
 *  per <Render> INLINE als Buehne des Animators — kein iframe, damit die
 *  data-og-id="puck:<id>"-Anker der Bausteine im SELBEN Dokument liegen und der
 *  3b-Anker-Mechanismus (GrafikLayer) sie findet. Fallback der Quellen-Weiche
 *  (BackdropPuckSeite), wenn keine lebendige buehne.html vorliegt.
 *
 *  Das aeussere data-fc-puck-buehne markiert den Buehnen-Container: der
 *  Export-Reiter greift dessen innerHTML ab, um Seite + Animation in EIN
 *  Dokument zu fusionieren (Welle 4c(4), GrafikExportPanel). pointer-events:
 *  none wie alle Backdrop-Modi — der Animator-Overlay bedient sich selbst. */
type PuckStatus = "laedt" | "bereit" | "leer" | "fehler";

function BackdropPuckRender({ name }: { name: string }) {
  const [status, setStatus] = useState<PuckStatus>("laedt");
  const [data, setData] = useState<Data | null>(null);
  /* Welle 5a: uebernommene Stylesheet-URLs der Seite — gescoped auf die Bühne. */
  const [styles, setStyles] = useState<string[]>([]);

  useEffect(() => {
    let tot = false;
    void (async () => {
      try {
        const res = await fetch("/api/puck-seite/lade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          if (!tot) setStatus("fehler");
          return;
        }
        const json = (await res.json()) as { data?: Data; styles?: string[] };
        if (tot) return;
        setStyles(Array.isArray(json.styles) ? json.styles : []);
        if (!json.data || json.data.content.length === 0) {
          setData(json.data ?? null);
          setStatus("leer");
          return;
        }
        setData(json.data);
        setStatus("bereit");
      } catch {
        if (!tot) setStatus("fehler");
      }
    })();
    return () => {
      tot = true;
    };
  }, [name]);

  if (status === "laedt") {
    return <div className="hg-backdrop-hinweis">Lade Seite „{name}“…</div>;
  }
  if (status === "fehler") {
    return (
      <div className="hg-backdrop-hinweis">
        Seite „{name}“ konnte nicht geladen werden — im Panel „Hintergrund“ eine andere waehlen.
      </div>
    );
  }
  return (
    <div className="hg-backdrop-puck" data-fc-puck-buehne>
      {/* Welle 5a: uebernommene Seiten-Styles, per @scope auf diesen Container
          begrenzt (leert sich selbst, wenn die Seite keine styles hat). */}
      <GescopteSeitenStyles urls={styles} selektor="[data-fc-puck-buehne]" />
      {data ? <Render config={config} data={data} /> : null}
      {status === "leer" && (
        <div className="hg-backdrop-hinweis">Seite „{name}“ hat noch keine Bausteine.</div>
      )}
    </div>
  );
}

export function Backdrop({ backdrop }: { backdrop: BackdropDaten }) {
  if (backdrop.art === "demo-landing") {
    /* Sentinel (Welle 5b): die Demo-Landing ist KEIN eigener Backdrop-Render —
       der Animator soll dafuer die echte WEE-Landing zeigen (backdrop-Prop
       undefined). EditorInner faengt "demo-landing" bereits ab, bevor <Backdrop>
       gerendert wird; diese Guard verhindert nur den sonst leeren HTML-Frame,
       falls der Sentinel doch einmal hier landet. */
    return null;
  }
  if (backdrop.art === "bild") {
    return <img src={backdrop.quelle} alt="" className="hg-backdrop-bild" />;
  }
  if (backdrop.art === "puck-seite") {
    /* key=quelle: Wechsel auf eine ANDERE Puck-Seite erzwingt Remount +
       Neuladen (wie beim Ordner-Backdrop). */
    return <BackdropPuckSeite key={backdrop.quelle} name={backdrop.quelle} />;
  }
  if (backdrop.art === "ordner") {
    /* key=quelle (Ordnername): erzwingt einen Remount (und damit ein neues
       Bereitstellen) beim Wechsel auf einen ANDEREN Ordner waehrend der
       Ordner-Modus bereits aktiv ist — sonst wuerde die bestehende iframe
       weiter auf den alten Cache-Inhalt zeigen. */
    return <BackdropOrdner key={backdrop.quelle} />;
  }
  return <BackdropHtml html={backdrop.quelle} />;
}
