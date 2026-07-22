"use client";

/*
 * WebsiteOg – „Website (Ist-Stand)" (AP-D, Welle 3a, s.
 * docs/editor-vereinheitlichung.md §8/3a).
 *
 * Leons Kern-Anweisung: „es muss alles von der OG Website auch mit OG getagt
 * werden … sonst bricht da die Logik" + „man kann immer noch nicht die Objekte
 * die schon auf der Seite sind anklicken und auswählen".
 *
 * Dieses Modul kümmert sich um die ZWEITE Hälfte davon: Es liest die bereits
 * (rein als Attribut, s. HomePageContent/ShapeAccent/TextureField) getaggten
 * Landing-Elemente aus dem DOM und macht sie im Editor auswählbar — als eigene
 * Ebenen-Gruppe, mit Basis-Infos im „Bild"-Reiter, einem Outline-Overlay auf
 * der Bühne und (für Bilder/SVGs) dem Knopf „In den Builder holen".
 *
 * Es SCHREIBT nichts an der echten Seite (Leitprinzip „Übernehmen statt
 * umschreiben"): „In den Builder holen" erzeugt eine KOPIE als normale Grafik
 * über dem Original — das Original bleibt sichtbar (anders als beim Vorhang,
 * wo der Baum via uebernommen-Kopplung übersprungen wird). Deshalb hier KEINE
 * uebernommen-Kopplung.
 *
 * Der Zustand (Liste + Auswahl) und die gegenseitige Ausschließlichkeit mit
 * Grafik-Auswahl / Fluss-Fokus liegen in GrafikEditor.tsx (dort, wo alle drei
 * zusammenlaufen). Hier stehen nur die reinen Bausteine: Scan, Listen-Gruppe,
 * Objekt-Infos, Overlay und der DOM→Grafik-Erzeuger.
 */

import { useEffect, useRef, useState } from "react";
import type { Grafik, GrafikKeyframe } from "./grafik-types";

/** Typen exakt wie im data-og-typ-Attribut (s. Spec §8/3a). */
export type OgTyp = "sektion" | "text" | "bild" | "svg" | "deko" | "hintergrund";

/** Präfix der Builder-Grafik, die aus einem OG-Element entsteht. Bewusst NICHT
 *  VORHANG_GRAFIK_PREFIX ("vorhang:") — der generische Löschen-Weg (Reiter
 *  „Ebenen") räumt nur bei jenem Präfix einen uebernommen-Eintrag mit auf; OG-
 *  Kopien haben keine solche Kopplung (das Original bleibt sichtbar). */
export const OG_GRAFIK_PREFIX = "og:";

export interface OgEintrag {
  /** Wert des data-og-id-Attributs (Schema „sektion:element:index"). */
  id: string;
  typ: OgTyp;
  /** Erstes Segment der id — Gruppierung in der Ebenen-Liste. */
  sektion: string;
  /** Zweites Segment der id — Anzeigename des Eintrags. */
  element: string;
}

/** Etwas freundlichere Sektions-Überschriften für die Ebenen-Gruppe. Fehlt ein
 *  Schlüssel, wird das rohe Segment gezeigt — das Schema ist ohnehin sprechend. */
const SEKTION_LABEL: Record<string, string> = {
  hero: "Titelbereich",
  mission: "Mission",
  haltung: "Haltung",
  oasis: "Project Oasis (Text)",
  bausteine: "Bausteine",
  projekte: "Projekte",
  stats: "Zahlen",
  tal: "Mitmachen / Tal",
};

/** Kleines Icon je Typ — reine Optik, keine Semantik. */
const TYP_ICON: Record<OgTyp, string> = {
  sektion: "▤",
  text: "T",
  bild: "🖼",
  svg: "◆",
  deko: "✦",
  hintergrund: "▨",
};

/** Liest ALLE getaggten Landing-Elemente aus dem DOM (Dokument-Reihenfolge =
 *  Lesereihenfolge). Stabil, weil die data-og-id sprechend + fix vergeben ist
 *  (keine Zufalls-IDs, s. HomePageContent). Wird beim Editor-Start UND bei
 *  Backdrop-Wechsel neu aufgerufen (s. GrafikEditor). */
export function ogScannen(): OgEintrag[] {
  if (typeof document === "undefined") return [];
  const eintraege: OgEintrag[] = [];
  const gesehen = new Set<string>();
  document.querySelectorAll<HTMLElement>("[data-og-id]").forEach((el) => {
    const id = el.getAttribute("data-og-id");
    if (!id || gesehen.has(id)) return;
    gesehen.add(id);
    const typRoh = el.getAttribute("data-og-typ");
    const typ: OgTyp = istOgTyp(typRoh) ? typRoh : "sektion";
    const teile = id.split(":");
    eintraege.push({
      id,
      typ,
      sektion: teile[0] ?? id,
      element: teile[1] ?? "",
    });
  });
  return eintraege;
}

function istOgTyp(v: string | null): v is OgTyp {
  return (
    v === "sektion" ||
    v === "text" ||
    v === "bild" ||
    v === "svg" ||
    v === "deko" ||
    v === "hintergrund"
  );
}

/** Findet das getaggte Element wieder (nur über die id, die Anführungszeichen
 *  im Attribut-Selektor erlauben die Doppelpunkte im Schema problemlos). */
function ogElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-og-id="${id}"]`);
}

/* ------------------------------------------------------------------ */
/* Ebenen-Gruppe „Website (Ist-Stand)"                                 */
/* ------------------------------------------------------------------ */

interface WebsiteOgEbeneProps {
  liste: OgEintrag[];
  auswahl: string | null;
  onWaehlen: (id: string) => void;
}

/** Eingeklappte Gruppe im Reiter „Ebenen": alle getaggten Landing-Elemente,
 *  nach Sektion gruppiert. Klick auf einen Eintrag = OG-Auswahl (Highlight +
 *  hinscrollen + Objekt-Reiter). */
export function WebsiteOgEbene({ liste, auswahl, onWaehlen }: WebsiteOgEbeneProps) {
  if (liste.length === 0) return null;

  /* Nach Sektion gruppieren, Reihenfolge des ersten Auftretens beibehalten
     (= Dokument-/Lesereihenfolge aus ogScannen). */
  const gruppen: { sektion: string; eintraege: OgEintrag[] }[] = [];
  const index = new Map<string, number>();
  for (const e of liste) {
    let i = index.get(e.sektion);
    if (i === undefined) {
      i = gruppen.length;
      index.set(e.sektion, i);
      gruppen.push({ sektion: e.sektion, eintraege: [] });
    }
    gruppen[i].eintraege.push(e);
  }

  return (
    <details className="gre-pool-gruppe gre-og-gruppe">
      <summary>
        Website (Ist-Stand) <span className="gre-gruppe-anzahl">({liste.length})</span>
      </summary>
      <div className="gre-hilfe">
        Was schon auf der Original-Seite steht. Klick markiert das Element auf der Bühne und zeigt
        es im Reiter „Bild". Alt+Klick direkt auf der Seite wählt es ebenfalls aus.
      </div>
      {gruppen.map((g) => (
        <details key={g.sektion} className="gre-og-sektion" open>
          <summary>
            {SEKTION_LABEL[g.sektion] ?? g.sektion}{" "}
            <span className="gre-gruppe-anzahl">({g.eintraege.length})</span>
          </summary>
          <div className="gre-og-liste">
            {g.eintraege.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`gre-og-eintrag${auswahl === e.id ? " gre-tausch-aktiv" : ""}`}
                aria-pressed={auswahl === e.id}
                onClick={() => onWaehlen(e.id)}
                title={`${e.id} (${e.typ})`}
              >
                <span className="gre-og-typ" aria-hidden="true">
                  {TYP_ICON[e.typ]}
                </span>
                <span className="gre-og-name">{e.element || e.sektion}</span>
                <span className="gre-og-typlabel">{e.typ}</span>
              </button>
            ))}
          </div>
        </details>
      ))}
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Objekt-Reiter: Basis-Infos + „In den Builder holen"                 */
/* ------------------------------------------------------------------ */

interface OgMasse {
  breite: number;
  hoehe: number;
  /** Bildquelle (nur bei <img> gefunden) — Basisname für die Anzeige. */
  quelle: string | null;
}

interface WebsiteOgObjektProps {
  eintrag: OgEintrag;
  /** Nur für bild|svg vorhanden — erzeugt die Builder-Kopie (s. GrafikEditor). */
  onInBuilder?: () => void;
  status: string;
}

/** Inhalt des „Bild"-Reiters bei OG-Auswahl: Typ, Maße, ggf. Bildquelle und —
 *  für bild|svg — der Knopf „In den Builder holen". */
export function WebsiteOgObjekt({ eintrag, onInBuilder, status }: WebsiteOgObjektProps) {
  const [masse, setMasse] = useState<OgMasse | null>(null);

  /* Live messen (Position/Größe ändern sich beim Scrollen/Resize nicht
     inhaltlich, aber die Auswahl kann wechseln) — einmal je Auswahl genügt. */
  useEffect(() => {
    const el = ogElement(eintrag.id);
    if (!el) {
      setMasse(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const img =
      el instanceof HTMLImageElement
        ? el
        : el.querySelector<HTMLImageElement>("img");
    const quelleRoh = img?.currentSrc || img?.getAttribute("src") || null;
    setMasse({
      breite: Math.round(r.width),
      hoehe: Math.round(r.height),
      quelle: quelleRoh ? quelleRoh.split("/").pop() ?? quelleRoh : null,
    });
  }, [eintrag.id]);

  const holbar = eintrag.typ === "bild" || eintrag.typ === "svg";

  return (
    <>
      <div className="gre-reiter-kopf">
        <span>Website-Element</span>
      </div>
      <div className="gre-og-info">
        <div className="gre-og-info-zeile">
          <span className="gre-og-info-label">Sektion</span>
          <span>{SEKTION_LABEL[eintrag.sektion] ?? eintrag.sektion}</span>
        </div>
        <div className="gre-og-info-zeile">
          <span className="gre-og-info-label">Element</span>
          <span>{eintrag.element || "—"}</span>
        </div>
        <div className="gre-og-info-zeile">
          <span className="gre-og-info-label">Typ</span>
          <span>{eintrag.typ}</span>
        </div>
        <div className="gre-og-info-zeile">
          <span className="gre-og-info-label">Maße</span>
          <span>{masse ? `${masse.breite} × ${masse.hoehe} px` : "—"}</span>
        </div>
        {masse?.quelle && (
          <div className="gre-og-info-zeile">
            <span className="gre-og-info-label">Bildquelle</span>
            <span className="gre-og-quelle" title={masse.quelle}>
              {masse.quelle}
            </span>
          </div>
        )}
      </div>
      {holbar ? (
        <>
          <button
            type="button"
            className="gre-og-holen"
            onClick={onInBuilder}
            disabled={!onInBuilder}
          >
            ⬡ In den Builder holen
          </button>
          <div className="gre-hilfe">
            Legt eine bearbeitbare Kopie an der aktuellen Bildschirmposition an (ein Keyframe). Das
            Original auf der Seite bleibt unberührt — die Kopie liegt darüber.
          </div>
        </>
      ) : (
        <div className="gre-hilfe">
          {eintrag.typ === "hintergrund"
            ? "Hintergrund — nur Auswahl/Markierung, eine Übernahme als Grafik ergibt hier keinen Sinn."
            : "Text/Sektion/Deko — nur Auswahl/Markierung, eine Übernahme als Grafik ergibt hier keinen Sinn."}
        </div>
      )}
      {status && <div className="gre-status">{status}</div>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Outline-Overlay auf der Bühne                                       */
/* ------------------------------------------------------------------ */

/** Markiert das ausgewählte OG-Element auf der Bühne mit einem Rahmen. Eigene
 *  Ebene, pointer-events:none, z-index unter dem Panel (s. grafik-editor.css) —
 *  stört also weder Klicks im Panel noch das Alt+Klick-Auswählen. Position wird
 *  imperativ pro Frame gemessen (gleiches Muster wie GrafikObjektMenue), damit
 *  der Rahmen beim Scrollen an seinem Element klebt. */
export function WebsiteOgOverlay({ ogId }: { ogId: string }) {
  const kastenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const kasten = kastenRef.current;
      const anker = ogElement(ogId);
      if (kasten) {
        if (anker) {
          const r = anker.getBoundingClientRect();
          kasten.style.display = r.width > 0 && r.height > 0 ? "block" : "none";
          kasten.style.left = `${r.left}px`;
          kasten.style.top = `${r.top}px`;
          kasten.style.width = `${r.width}px`;
          kasten.style.height = `${r.height}px`;
        } else {
          kasten.style.display = "none";
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ogId]);

  return <div ref={kastenRef} className="gre-og-overlay" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* DOM-Element → Builder-Grafik (Vorhang-Muster generalisiert)         */
/* ------------------------------------------------------------------ */

/** Serialisiert ein Inline-<svg> zu einer eigenständigen Data-URL — so bleibt
 *  das Original im DOM unberührt und die Kopie trägt ihr eigenes Markup. */
function svgAlsDataUrl(svg: SVGSVGElement): string {
  const klon = svg.cloneNode(true) as SVGSVGElement;
  if (!klon.getAttribute("xmlns")) klon.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const markup = new XMLSerializer().serializeToString(klon);
  return `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;
}

export type OgErzeugung = { grafik: Grafik } | { fehler: string };

/** Erzeugt aus einem getaggten Element eine normale Builder-Grafik mit EINEM
 *  Keyframe an seiner aktuellen Bildschirmposition (Dokument-Koordinaten) —
 *  generalisiert das inBuilderHolen aus GrafikSeiteTab.tsx auf beliebige
 *  bild|svg-Elemente. Die Quelle wird nur REFERENZIERT (bild) bzw. als eigenes
 *  Markup KOPIERT (svg); an der Seite wird nichts geschrieben.
 *
 *  `naechstesZ` = grafiken.length + 1 (wie sonst im Editor) für die z-Ebene. */
export function ogAlsGrafikErzeugen(eintrag: OgEintrag, naechstesZ: number): OgErzeugung {
  const el = ogElement(eintrag.id);
  if (!el) {
    return { fehler: `„${eintrag.element || eintrag.id}" nicht gefunden — evtl. gerade nicht sichtbar.` };
  }
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) {
    return { fehler: `„${eintrag.element || eintrag.id}" hat aktuell keine sichtbare Größe.` };
  }

  let src: string | null = null;
  let name = eintrag.element || eintrag.sektion || "element";
  const img =
    el instanceof HTMLImageElement ? el : el.querySelector<HTMLImageElement>("img");
  if (img && (img.currentSrc || img.getAttribute("src"))) {
    src = img.currentSrc || img.getAttribute("src");
    name = (src ?? name).split("/").pop() ?? name;
  } else {
    const svg = el instanceof SVGSVGElement ? el : el.querySelector("svg");
    if (svg) src = svgAlsDataUrl(svg as SVGSVGElement);
  }
  if (!src) {
    return { fehler: `„${eintrag.element || eintrag.id}" hat keine übernehmbare Bild-/SVG-Quelle.` };
  }

  const deckkraft = parseFloat(getComputedStyle(el).opacity);
  const kf: GrafikKeyframe = {
    scrollY: window.scrollY,
    x: r.left + r.width / 2 + window.scrollX,
    y: r.top + r.height / 2 + window.scrollY,
    scale: 1,
    opacity: Number.isFinite(deckkraft) ? deckkraft : 1,
    rotation: 0,
  };
  const grafik: Grafik = {
    id: `${OG_GRAFIK_PREFIX}${eintrag.id}`,
    name,
    src,
    art: "bild",
    breitePx: Math.round(r.width),
    z: naechstesZ,
    keyframes: [kf],
  };
  return { grafik };
}
