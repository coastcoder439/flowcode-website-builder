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
import type { Backdrop as BackdropDaten } from "./backdrop-types";
import { ordnerBereitstellen, ordnerHolen } from "./ordner-serve";
import "./backdrop.css";

/** Platzhalter-Hoehe, bis die erste Messung nach dem iframe-Laden eintrifft —
 *  verhindert einen Null-Hoehe-Sprung (Fluss-Zone waere sonst kurz 0px hoch). */
const IFRAME_STARTHOEHE_PX = 600;

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

type PuckStatus = "laedt" | "bereit" | "leer" | "fehler";

/** Puck-Seiten-Backdrop (Welle 4c, docs/editor-vereinheitlichung.md §9/4c(2)):
 *  laedt seiten/<name>.json ueber /api/puck-seite/lade und rendert sie per
 *  <Render> INLINE als Buehne des Animators — kein iframe (anders als HTML/
 *  Ordner), damit die data-og-id="puck:<id>"-Anker der Bausteine im SELBEN
 *  Dokument liegen und der 3b-Anker-Mechanismus (GrafikLayer) sie findet.
 *
 *  Das aeussere data-fc-puck-buehne markiert den Buehnen-Container: der
 *  Export-Reiter greift dessen innerHTML ab, um Seite + Animation in EIN
 *  Dokument zu fusionieren (Welle 4c(4), GrafikExportPanel). pointer-events:
 *  none wie alle Backdrop-Modi — der Animator-Overlay bedient sich selbst. */
function BackdropPuckSeite({ name }: { name: string }) {
  const [status, setStatus] = useState<PuckStatus>("laedt");
  const [data, setData] = useState<Data | null>(null);

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
        const json = (await res.json()) as { data?: Data };
        if (tot) return;
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
      {data ? <Render config={config} data={data} /> : null}
      {status === "leer" && (
        <div className="hg-backdrop-hinweis">Seite „{name}“ hat noch keine Bausteine.</div>
      )}
    </div>
  );
}

export function Backdrop({ backdrop }: { backdrop: BackdropDaten }) {
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
