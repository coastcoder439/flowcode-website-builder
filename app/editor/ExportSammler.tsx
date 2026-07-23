"use client";

/*
 * app/editor/ExportSammler.tsx — Multi-Page-Markup-Abgriff clientseitig
 * (Station 4, X3). Spec: docs/plan-analyse/lens-preview-export.md §3-S3.
 *
 * AUFGABE: Aus der aktiven Website (alle Seiten, E5) je Seite die vom Generator
 * (X1, components/embed/ordner-export.ts) benoetigten UNREINEN Zutaten holen:
 *   · data + anim + styles  → via POST /api/puck-seite/lade,
 *   · statisches Markup      → verstecktes <Render> mounten, `.innerHTML`
 *                              abgreifen, wieder unmounten.
 * Das ist exakt das bestehende `seitenMarkupGeber`-Muster (GrafikEditor:
 * document.querySelector("[data-fc-puck-buehne]")?.innerHTML) — hier fuer
 * beliebig viele Seiten, ohne die UI-lastige puck.config server-seitig zu ziehen
 * (Registry-Invariante, lib/puck-registry.ts). Reüsiert dieselbe
 * config+<Render>-Kombination wie SeitenVorschau.tsx.
 *
 * STRENG SEQUENZIELL (Spec-Vorsicht): immer nur EINE Seite gleichzeitig gemountet
 * (eigene, kurzlebige createRoot je Seite; flushSync macht das Markup direkt nach
 * dem Commit lesbar) — kein Parallel-Mount, kein Flackern der Editor-Oberflaeche
 * (der Abgriff-Host haengt off-screen an <body>, nicht im React-Baum der Shell).
 *
 * FEHLER JE SEITE EINSAMMELN (Teilbericht): schlaegt Laden oder Abgriff einer
 * Seite fehl, wird das im Bericht vermerkt und mit der naechsten Seite
 * weitergemacht — der Export bricht NICHT ab. So deckt ein Teil-Export
 * Import-Luecken auf (Spec §5, Abhaengigkeit Import-Linse), statt an einer
 * kaputten Unterseite ganz zu scheitern.
 *
 * Die Seiten-AUSWAHL (Zuordnung aktive Website → Seiten-Set, Slug-Ableitung)
 * liegt DOM-frei in ./export-seiten-auswahl (dort unit-getestet).
 */

import { useCallback, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { Render, type Data } from "@puckeditor/core";
import { config } from "../puck/puck.config";
import type { SeitenAnim } from "@/lib/api/seiten-speicher";
import type { OrdnerSeite } from "@/components/embed/ordner-export";
import { waehleWebsiteSeiten, type WebsiteSeitenPlan } from "./export-seiten-auswahl";

/* ================================================================== */
/* Ergebnis-Typen — passend zum X1-Generator (ordner-export.OrdnerSeite)  */
/* ================================================================== */

/** Die von X3 gesammelten Felder EINER Seite. Bewusst als Ausschnitt von
 *  OrdnerSeite (Pick) definiert, damit der Aufrufer (X5) sie direkt um die
 *  restlichen Zutaten (config, runtimeJs, embedUrl, cssInhalte) ergaenzen und an
 *  baueOrdnerArtefakt reichen kann — EIN gemeinsamer Typ, keine Drift. */
export type SammlerSeite = Pick<OrdnerSeite, "slug" | "istStart" | "data" | "anim" | "styles" | "markup">;

/** Eine je Seite eingesammelte Fehlermeldung (Teilbericht). */
export interface SammelFehler {
  /** Seiten-Name (bzw. „(Liste)" fuer den Listen-Abruf). */
  seite: string;
  grund: string;
}

/** Ehrlicher Abschluss-Bericht des Abgriffs. */
export interface SammelBericht {
  /** Seiten der aktiven Website, die versucht wurden. */
  gesamt: number;
  /** Davon vollstaendig gesammelt (data + markup). */
  erfolg: number;
  /** Je fehlgeschlagener Seite ein Eintrag (leer = alles gesammelt). */
  fehler: SammelFehler[];
}

export interface SammelErgebnis {
  seiten: SammlerSeite[];
  bericht: SammelBericht;
}

/** Fortschritt (n/gesamt) fuer die UI — `gesamt` ist die Seitenzahl der aktiven
 *  Website (z.B. 16), `erledigt` zaehlt terminale Seiten (Erfolg ODER Fehler). */
export interface SammelFortschritt {
  erledigt: number;
  gesamt: number;
  /** Seite, die gerade geladen/abgegriffen wird (null zwischen den Seiten). */
  aktuell: string | null;
}

/* ================================================================== */
/* Unreine Zutaten holen                                               */
/* ================================================================== */

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : "unbekannter Fehler";
}

interface SeitenDaten {
  data: Data;
  anim: SeitenAnim | null;
  styles: string[];
}

/** Laedt data + anim + styles EINER Seite (gleicher Vertrag wie SeitenVorschau/
 *  SeitenBereich). Wirft bei Nicht-200 oder fehlenden Daten — der Aufrufer faengt
 *  je Seite ab (Teilbericht). */
async function ladeSeitenDaten(name: string): Promise<SeitenDaten> {
  const res = await fetch("/api/puck-seite/lade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`Laden fehlgeschlagen (HTTP ${res.status})`);
  const json = (await res.json()) as { data?: Data; anim?: SeitenAnim; styles?: string[] };
  if (!json.data) throw new Error("Antwort ohne data-Feld");
  return {
    data: json.data,
    anim: json.anim ?? null,
    styles: Array.isArray(json.styles) ? json.styles : [],
  };
}

/**
 * Greift das statische Seiten-Markup ab: mountet <Render config data /> in einen
 * versteckten, off-screen an <body> gehaengten Host, liest dessen innerHTML und
 * unmountet sofort wieder. Reüsiert dieselbe config+<Render>-Kombination wie
 * SeitenVorschau (kein neuer Render-Pfad).
 *
 * flushSync erzwingt den synchronen Commit — direkt danach ist das DOM (und
 * damit host.innerHTML) da, ohne auf einen weiteren Frame zu warten. Der Host ist
 * eine EIGENE createRoot ausserhalb des Shell-Baums, also entsteht kein zweites
 * Buehnen-Element in der laufenden Oberflaeche.
 */
function greifeSeitenMarkup(data: Data): string {
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.setAttribute("data-fc-export-abgriff", "");
  /* Off-screen statt display:none: die Bausteine rendern normal (innerHTML voll),
     bleiben aber unsichtbar und ohne Layout-Einfluss auf die Shell. Breite ~
     Design-Raum, damit breitenabhaengiges Markup plausibel entsteht. */
  host.style.cssText =
    "position:absolute;left:-100000px;top:0;width:1200px;height:0;overflow:hidden;opacity:0;pointer-events:none;";
  document.body.appendChild(host);

  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(<Render config={config} data={data} />);
    });
    return host.innerHTML;
  } finally {
    root.unmount();
    host.remove();
  }
}

/* ================================================================== */
/* Engine: sequenzieller Multi-Page-Abgriff                            */
/* ================================================================== */

/**
 * Sammelt fuer ALLE Seiten der aktiven Website (`aktiv`) das komplette Seiten-Set
 * fuer den Generator — sequenziell, mit Teilbericht. Nur clientseitig aufrufbar
 * (nutzt fetch + document + eine versteckte React-Root).
 */
export async function sammleWebsiteExport(
  aktiv: string,
  opts: { onFortschritt?: (f: SammelFortschritt) => void } = {},
): Promise<SammelErgebnis> {
  const seiten: SammlerSeite[] = [];
  const bericht: SammelBericht = { gesamt: 0, erfolg: 0, fehler: [] };

  /* 1 · Seiten-Liste holen (ohne sie kein Export). */
  let alleNamen: string[];
  try {
    const res = await fetch("/api/puck-seite/liste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { seiten?: { name: string }[] };
    alleNamen = Array.isArray(json.seiten) ? json.seiten.map((s) => s.name) : [];
  } catch (e) {
    bericht.fehler.push({ seite: "(Liste)", grund: `Seitenliste nicht ladbar: ${fehlerText(e)}` });
    return { seiten, bericht };
  }

  /* 2 · Seiten der aktiven Website auswaehlen (DOM-frei, ./export-seiten-auswahl). */
  const plan = waehleWebsiteSeiten(alleNamen, aktiv);
  bericht.gesamt = plan.length;
  if (plan.length === 0) {
    bericht.fehler.push({
      seite: aktiv || "(keine aktive Website)",
      grund: "Keine Seiten dieser Website gefunden (aktive Website gesetzt und importiert?)",
    });
    return { seiten, bericht };
  }

  /* 3 · Je Seite STRENG SEQUENZIELL: laden → verstecktes <Render> → innerHTML →
     unmount. Fehler je Seite einsammeln, nie abbrechen. */
  let erledigt = 0;
  for (const p of plan) {
    opts.onFortschritt?.({ erledigt, gesamt: plan.length, aktuell: p.name });
    try {
      const daten = await ladeSeitenDaten(p.name);
      const markup = greifeSeitenMarkup(daten.data);
      seiten.push({
        slug: p.slug,
        istStart: p.istStart,
        data: daten.data,
        anim: daten.anim,
        styles: daten.styles,
        markup,
      });
      bericht.erfolg++;
    } catch (e) {
      bericht.fehler.push({ seite: p.name, grund: fehlerText(e) });
    }
    erledigt++;
    opts.onFortschritt?.({ erledigt, gesamt: plan.length, aktuell: null });
  }

  return { seiten, bericht };
}

/**
 * Sammelt EINE einzelne Seite (fuer die Station-4-Live-Preview, X4): laedt
 * data + anim + styles und greift das statische Markup ab — exakt dieselben
 * Bausteine wie der Multi-Page-Abgriff (ladeSeitenDaten + greifeSeitenMarkup),
 * nur fuer die gerade in der Vorschau GEWAEHLTE Seite. So muss die Preview beim
 * Umschalten einer Seite nicht die ganze Website neu abgreifen (das bleibt dem
 * Ordner-Export vorbehalten). Wirft bei Lade-/Abgriff-Fehler; der Aufrufer
 * (Station4Preview) zeigt den Fehler in der Vorschau an.
 */
export async function sammleEineSeite(plan: WebsiteSeitenPlan): Promise<SammlerSeite> {
  const daten = await ladeSeitenDaten(plan.name);
  const markup = greifeSeitenMarkup(daten.data);
  return {
    slug: plan.slug,
    istStart: plan.istStart,
    data: daten.data,
    anim: daten.anim,
    styles: daten.styles,
    markup,
  };
}

/* ================================================================== */
/* Hook fuer die Station-4-Verkabelung (X5)                            */
/* ================================================================== */

/**
 * React-Hook um sammleWebsiteExport: kapselt `laeuft`/`fortschritt` fuer die UI
 * und verhindert parallele Abgriffe (ein zweiter Aufruf waehrend eines laufenden
 * wirft, statt zwei versteckte Render-Laeufe zu verschraenken). `sammle(aktiv)`
 * liefert das Ergebnis inkl. Teilbericht.
 */
export function useExportSammler() {
  const [laeuft, setLaeuft] = useState(false);
  const [fortschritt, setFortschritt] = useState<SammelFortschritt | null>(null);
  const laeuftRef = useRef(false);

  const sammle = useCallback(async (aktiv: string): Promise<SammelErgebnis> => {
    if (laeuftRef.current) throw new Error("Ein Export-Abgriff läuft bereits.");
    laeuftRef.current = true;
    setLaeuft(true);
    setFortschritt({ erledigt: 0, gesamt: 0, aktuell: null });
    try {
      return await sammleWebsiteExport(aktiv, { onFortschritt: setFortschritt });
    } finally {
      laeuftRef.current = false;
      setLaeuft(false);
    }
  }, []);

  return { sammle, laeuft, fortschritt };
}
