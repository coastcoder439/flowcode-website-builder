"use client";

/*
 * useFlussKnoten – die komplette INTERAKTIONS-MASCHINERIE des Fluss-Editors,
 * aus RiverKursEditor.tsx herausgelöst (Welle 2b-1, verhaltensgleich): Zone
 * vermessen, Knoten ziehen/einloggen, Scrollrad = Breite, Knoten
 * hinzufügen/löschen/gerade-zurücksetzen sowie die komplette Profil-Logik
 * (speichern/laden/löschen/import/export/SVG). Alles, was VORHER inline in
 * RiverKursEditor lag, lebt jetzt hier — der Zustand kommt weiterhin
 * ausschließlich aus dem RiverKurs-Context.
 *
 * WARUM ein Hook (statt weiter alles in der Panel-Komponente): dieselbe
 * Maschinerie treibt jetzt ZWEI Oberflächen — das alte .rke-Panel
 * (RiverKursEditor, alte Route) UND den vereinheitlichten Editor auf /editor
 * (Fluss als Objekt im Grafik-Panel). Ein Hook liefert beiden EINE gemeinsame
 * Quelle, ohne die Logik zu duplizieren (KISS/DRY). Die Sektions-Komponenten
 * (components/river/sektionen/*) und die Handle-Ebene (FlussKnotenHandles)
 * sind reine Ansichten dieser Steuerung.
 *
 * ARCHITEKTUR unverändert: Die Knoten SIND der Fluss (RiverNode: y, x =
 * Mittellinie, breite). Ein Handle liegt per Konstruktion exakt auf dem
 * Wasser — es wird NICHTS nachgemessen. Drag schreibt in einen Ref und
 * committet pro Animationsframe EINMAL in den State (ein Geometrie-Neubau je
 * Frame).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  ANIM_DEFAULTS,
  useRiverKurs,
  type AnimEinstellungen,
  type RiverKursCtx,
} from "./RiverKursContext";
import { RIVER_DESIGN_WIDTH_PX } from "./riverPath";
import {
  buildSnapshotSvgMarkup,
  istImportierterVerlauf,
  type FlussGeometrieSnapshot,
  type FlussVerlauf,
  type ImportierterVerlauf,
} from "./riverSnapshot";
import { useFlussVerlauf, type FlussVerlaufSteuerung } from "./useFlussVerlauf";
import type { RiverNode } from "./river-types";

const STORAGE_KEY = "wee-fluss-verlaeufe";
const MIN_X = 40;
const MAX_X = RIVER_DESIGN_WIDTH_PX - 40;
/** Flussbreite in Design-px (Perspektive: fern schmal, nah breit). */
const MIN_BREITE = 6;
const MAX_BREITE = 900;
/** Scrollrad: Breiten-Faktor pro Raste. */
const WHEEL_FAKTOR = 1.08;
/** Bewegungs-Schwelle (px): darunter zählt pointerup als Klick (Lock). */
const KLICK_TOLERANZ_PX = 4;

export interface ZoneMetrik {
  topDoc: number;
  leftDoc: number;
  w: number;
  h: number;
  scale: number;
  colLeft: number;
}

function messeZone(): ZoneMetrik | null {
  const zone = document.querySelector(".river-zone");
  if (!zone) return null;
  const r = zone.getBoundingClientRect();
  const scale = Math.min(r.width, RIVER_DESIGN_WIDTH_PX) / RIVER_DESIGN_WIDTH_PX;
  return {
    topDoc: r.top + window.scrollY,
    leftDoc: r.left + window.scrollX,
    w: r.width,
    h: r.height,
    scale,
    colLeft: (r.width - RIVER_DESIGN_WIDTH_PX * scale) / 2,
  };
}

function ladeVerlaeufe(): Record<string, FlussVerlauf> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, FlussVerlauf>;
  } catch {
    return {};
  }
}

/* --- Höhen-Normalisierung (Robustheits-Fix) ---------------------------
 * Knoten-y ist eine DESIGN-absolute Koordinate, autoriert gegen die
 * Zonenhöhe zum Speicherzeitpunkt (meta.zoneHDesign, s. baueAktuellenVerlauf
 * unten). Lädt man den Verlauf über einer Seite mit ANDERER aktueller
 * Zonenhöhe (anderer Viewport, anderer Inhalt seit dem Speichern, anderer
 * Backdrop) OHNE Anpassung, bleiben die rohen y-Werte stehen — Handles UND
 * die daraus gebaute Flussgeometrie verwenden sie unverändert 1:1. Beide
 * bleiben zwar KONSISTENT zueinander, reichen aber weit über das
 * tatsächliche Zonen-Ende hinaus (zu große autorierte Höhe) oder stauchen
 * sich in dessen oberes Drittel (zu kleine). */

/** Design-Höhe der AKTUELLEN, live gemessenen Zone — dieselbe Rechnung wie
 *  beim Speichern (zoneHDesign: Math.round(zone.h / zone.scale)), hier aber
 *  VOR der Verhältnisbildung gerundet: eine unveränderte Zone ergibt dadurch
 *  exakt Faktor 1 (keine Sub-Pixel-Differenz allein durch die beim Speichern
 *  bereits erfolgte Rundung). */
function hoehenFaktor(zone: ZoneMetrik | null, autoriertZoneH: number | undefined): number {
  if (!zone || !autoriertZoneH || autoriertZoneH <= 0) return 1;
  const aktuelleZoneH = Math.round(zone.h / zone.scale);
  if (!Number.isFinite(aktuelleZoneH) || aktuelleZoneH <= 0) return 1;
  return aktuelleZoneH / autoriertZoneH;
}

/** Skaliert NUR die Y-Koordinate (Höhen-Achse) aller Knoten — x/breite
 *  bleiben unangetastet (die BREITE der Design-Spalte ist bereits separat
 *  über zone.scale normalisiert). faktor=1 ist ein bewusster No-Op
 *  (identisches Array zurück) — der Normalfall bleibt dadurch bit-für-bit
 *  wie bisher. */
function skaliereKnotenY(nodes: RiverNode[], faktor: number): RiverNode[] {
  if (faktor === 1) return nodes;
  return nodes.map((n) => ({ ...n, y: n.y * faktor }));
}

/** Kurzer Statuszeilen-Zusatz, wenn eine Höhen-Anpassung tatsächlich
 *  gegriffen hat (faktor=1 = nichts zu vermelden). */
function hoehenHinweis(faktor: number): string {
  return faktor === 1 ? "" : ` (Höhe angepasst ×${faktor.toFixed(2)})`;
}

/** Liest defensiv meta.zoneHDesign aus einem lose typisierten Re-Import
 *  (ImportierterVerlauf verlangt bewusst KEIN meta-Feld). Fehlt es oder ist
 *  es keine gültige Zahl > 0, liefert hoehenFaktor() ohnehin 1 (No-Op). */
function leseAutorierteZoneH(v: unknown): number | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const meta = (v as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return undefined;
  const zoneHDesign = (meta as { zoneHDesign?: unknown }).zoneHDesign;
  return typeof zoneHDesign === "number" && zoneHDesign > 0 ? zoneHDesign : undefined;
}

/** Alles, was eine Fluss-Ansicht (Panel-Sektionen ODER Handle-Ebene) zum
 *  Anzeigen und Bedienen braucht — die einzige öffentliche Schnittstelle
 *  dieser Maschinerie. */
export interface FlussKnotenSteuerung {
  /** Der zugrundeliegende RiverKurs-Context (nie null, sonst gäbe der Hook
   *  null zurück) — Sektionen lesen daraus anim/vollAufgedeckt. */
  ctx: RiverKursCtx;
  zone: ZoneMetrik | null;
  /** Die aktuell bearbeiteten Fluss-Knoten (SIND der Fluss). */
  nodes: RiverNode[] | null;
  /** Index des eingeloggten Knotens (gelb, Scrollrad = Breite) oder null. */
  gelockt: number | null;
  setGelockt: Dispatch<SetStateAction<number | null>>;
  onPointerDown: (idx: number) => (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (idx: number) => () => void;
  knotenHinzufuegen: () => void;
  knotenLoeschen: () => void;
  geradeZuruecksetzen: () => void;
  name: string;
  setName: (n: string) => void;
  verlaeufe: Record<string, FlussVerlauf>;
  status: string;
  importRef: RefObject<HTMLInputElement | null>;
  speichern: () => void;
  laden: (n: string) => void;
  verlaufLoeschen: (n: string) => void;
  exportieren: () => void;
  dateiImportiert: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  alsSvgExportieren: () => void;
  /** Baut aus dem AKTUELLEN Editor-Stand (Knoten + Animation + eingefrorene
   *  Geometrie/Farben) einen selbsttragenden Verlauf — dieselbe Datenform wie
   *  speichern(), aber ohne localStorage-Umweg. Grundlage für den
   *  Export-Reiter, der den Fluss so DIREKT aus dem Context bekommt (Risiko 3:
   *  kein stiller Verlust über die localStorage-Brücke). null, solange
   *  Geometrie/Farben noch nicht bereit sind. */
  baueAktuellenVerlauf: (nameArg?: string) => FlussVerlauf | null;
  /** Rückgängig/Wiederholen des Flusses (Welle 2c-1, Bauvorlage §3) — eigener
   *  Stapel, baugleich zum Grafik-Verlauf. Der GrafikEditor dispatcht Strg+Z/Y
   *  und die Kopf-Knöpfe bei Fluss-Fokus hierauf. */
  verlauf: FlussVerlaufSteuerung;
}

/** Die komplette Fluss-Interaktion als Hook. Liefert null, solange kein
 *  RiverKurs-Provider vorhanden ist (z.B. auf der Landing) — exakt wie
 *  RiverKursEditor früher `if (!ctx) return null` am Ende tat. Alle Hooks
 *  werden vorher unbedingt aufgerufen (Regeln der Hooks bleiben gewahrt). */
export function useFlussKnoten(): FlussKnotenSteuerung | null {
  const ctx = useRiverKurs();
  const [zone, setZone] = useState<ZoneMetrik | null>(null);
  const [gelockt, setGelockt] = useState<number | null>(null);
  const [verlaeufe, setVerlaeufe] = useState<Record<string, FlussVerlauf>>({});
  const [name, setName] = useState("verlauf-1");
  const [status, setStatus] = useState("");
  const dragRef = useRef<{
    idx: number;
    startX: number;
    startY: number;
    bewegt: boolean;
    /* Vor-Zug-Stand (nodes + anim), am pointerdown gemerkt: EIN Knoten-Zug =
       EIN Verlaufsschritt, committet erst beim Loslassen mit genau diesem
       Stand (wie der Grafik-Canvas-Zug). */
    vorNodes: RiverNode[] | null;
    vorAnim: AnimEinstellungen | null;
  } | null>(null);
  /* Drag-Puffer + rAF-Commit: max. ein Geometrie-Neubau pro Frame. */
  const pendingRef = useRef<RiverNode[] | null>(null);
  const rafRef = useRef(0);
  /** Verstecktes Datei-Input für den Re-Import (Knopf „Importieren"). */
  const importRef = useRef<HTMLInputElement>(null);

  const nodes = ctx?.nodes ?? ctx?.live ?? null;

  /* Ausgangslage: die von der Engine benutzten Knoten übernehmen (gerader
     Fluss bzw. gespeicherter Verlauf). */
  useEffect(() => {
    if (ctx && !ctx.nodes && ctx.live) ctx.setNodes(ctx.live.map((n) => ({ ...n })));
  }, [ctx, ctx?.live, ctx?.nodes]);

  /* Zone vermessen — nur bei echten Layout-Änderungen (die Metrik ist
     scroll-invariant, topDoc/leftDoc sind Dokument-Koordinaten).
     Robustheits-Fix: .river-zone kann NEU GEMOUNTET werden (eigene DOM-
     Instanz statt nur veränderter Größe) — HomePageContent rendert je nach
     asynchron aus IndexedDB geladenem Backdrop ZWEI STRUKTURELL VERSCHIEDENE
     Zweige (TitleCurtain+RiverFlow vs. nur RiverFlow), React remountet daher
     den kompletten Zweig inkl. .river-zone, sobald der Backdrop-Ladevorgang
     abschließt. Ein MutationObserver auf einer stabilen, äußeren Ebene
     erkennt den Element-Tausch und hängt den ResizeObserver an das NEUE
     Element um. ZUSÄTZLICH ein kurzes, selbstbeendendes Polling direkt nach
     dem Mount (Sicherheitsnetz für asynchrone, außerhalb der Kontrolle dieser
     Komponente liegende Layout-Nachzügler). */
  useEffect(() => {
    const messen = () => setZone(messeZone());
    messen();
    let zoneEl = document.querySelector(".river-zone");
    let ro: ResizeObserver | null = zoneEl ? new ResizeObserver(messen) : null;
    if (zoneEl && ro) ro.observe(zoneEl);
    window.addEventListener("resize", messen);

    /* Hängt den ResizeObserver an ein NEUES .river-zone-Element um, falls es
       seit der letzten Prüfung ausgetauscht wurde (Remount) — misst dabei
       IMMER frisch, unabhängig davon, ob ein Tausch erkannt wurde. */
    const anZoneAnhaengenUndMessen = () => {
      const aktuellesZoneEl = document.querySelector(".river-zone");
      if (aktuellesZoneEl && aktuellesZoneEl !== zoneEl) {
        ro?.disconnect();
        zoneEl = aktuellesZoneEl;
        ro = new ResizeObserver(messen);
        ro.observe(zoneEl);
      }
      messen();
    };

    const mo = new MutationObserver(anZoneAnhaengenUndMessen);
    mo.observe(document.body, { childList: true, subtree: true });

    const REMESS_INTERVAL_MS = 200;
    const REMESS_DAUER_MS = 3000;
    const remessTimer = window.setInterval(anZoneAnhaengenUndMessen, REMESS_INTERVAL_MS);
    const stopTimer = window.setTimeout(() => window.clearInterval(remessTimer), REMESS_DAUER_MS);

    return () => {
      ro?.disconnect();
      mo.disconnect();
      window.clearInterval(remessTimer);
      window.clearTimeout(stopTimer);
      window.removeEventListener("resize", messen);
    };
  }, []);

  useEffect(() => {
    setVerlaeufe(ladeVerlaeufe());
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const setzeNodes = useCallback(
    (neu: RiverNode[]) => {
      ctx?.setNodes(neu);
    },
    [ctx],
  );

  /** Drag-Commit: sammelt Bewegungen und schreibt pro Frame einmal. */
  const commitPerFrame = useCallback(
    (neu: RiverNode[]) => {
      pendingRef.current = neu;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        if (pendingRef.current) {
          setzeNodes(pendingRef.current);
          pendingRef.current = null;
        }
      });
    },
    [setzeNodes],
  );

  /* Rückgängig/Wiederholen des Flusses (Welle 2c-1, Bauvorlage §3). Muss VOR
     dem Wheel-Effekt und den Ops stehen (const nicht gehoistet — die Handler
     unten schließen über `verlauf`). Snapshot-Umfang: nodes + anim. */
  const verlauf = useFlussVerlauf(nodes, ctx?.anim ?? null, setzeNodes, ctx?.setAnim);

  /* Eingeloggter Knoten: Scrollrad = Breite (Seiten-Scroll blockiert). */
  useEffect(() => {
    if (gelockt === null || !nodes) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const faktor = e.deltaY < 0 ? WHEEL_FAKTOR : 1 / WHEEL_FAKTOR;
      /* EIN Wheel-Zug an DEMSELBEN Knoten = EIN Verlaufsschritt (coalesced,
         Gruppe pro Knoten-Index) — VOR der Änderung committen, damit der
         Vor-Zug-Stand das Rückgängig-Ziel bleibt (wie der Grafik-Wheel). Der
         Produzent präfixt zu „fluss:breite:<idx>" (Risiko R-f). */
      verlauf.commit("Breite geändert", `breite:${gelockt}`);
      setzeNodes(
        nodes.map((n, i) =>
          i === gelockt
            ? { ...n, breite: Math.min(MAX_BREITE, Math.max(MIN_BREITE, n.breite * faktor)) }
            : n,
        ),
      );
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGelockt(null);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
    };
  }, [gelockt, nodes, setzeNodes]);

  const onPointerDown = (idx: number) => (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    /* Vor-Zug-Stand jetzt merken (nodes-Referenz genügt — Knoten werden nie
       in-place, sondern per map/filter geändert; anim bleibt während des Zugs
       unberührt, wird aber für den vollständigen Snapshot mitgesichert). */
    dragRef.current = {
      idx,
      startX: e.clientX,
      startY: e.clientY,
      bewegt: false,
      vorNodes: nodes,
      vorAnim: ctx?.anim ?? null,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !zone || !nodes) return;
    if (
      !drag.bewegt &&
      Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < KLICK_TOLERANZ_PX
    ) {
      return;
    }
    drag.bewegt = true;
    /* Maus → Design-Koordinaten. Der Knoten IST die Fluss-Mittellinie:
       kein Offset, keine Korrektur — er landet exakt unter dem Cursor. */
    const x = Math.min(
      MAX_X,
      Math.max(MIN_X, (e.clientX + window.scrollX - zone.leftDoc - zone.colLeft) / zone.scale),
    );
    const y = (e.clientY + window.scrollY - zone.topDoc) / zone.scale;
    commitPerFrame(nodes.map((n, i) => (i === drag.idx ? { ...n, x, y } : n)));
  };

  const onPointerUp = (idx: number) => () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.bewegt) setGelockt((g) => (g === idx ? null : idx));
    /* EIN Knoten-Zug = EIN Verlaufsschritt: erst HIER (beim Loslassen) mit dem
       am pointerdown gemerkten Vor-Zug-Stand committen — nicht bei jedem Frame
       (sonst Dutzende Schritte für einen Zug). Nur wenn tatsächlich bewegt. */
    if (drag && drag.bewegt && drag.vorNodes && drag.vorAnim) {
      verlauf.commit("Knoten verschoben", undefined, {
        nodes: drag.vorNodes,
        anim: drag.vorAnim,
      });
    }
  };

  /** Neuer Knoten auf Bildschirmmitte, eingefügt zwischen den Nachbarn
   *  (x/breite interpoliert → der Verlauf springt beim Einfügen nicht). */
  const knotenHinzufuegen = () => {
    if (!zone || !nodes) return;
    const y = (window.scrollY + window.innerHeight / 2 - zone.topDoc) / zone.scale;
    const vor = [...nodes].filter((n) => n.y <= y).pop();
    const nach = nodes.find((n) => n.y > y);
    const t = vor && nach ? (y - vor.y) / (nach.y - vor.y || 1) : 0;
    const x =
      vor && nach ? vor.x + (nach.x - vor.x) * t : (vor ?? nach)?.x ?? RIVER_DESIGN_WIDTH_PX / 2;
    const breite =
      vor && nach ? vor.breite + (nach.breite - vor.breite) * t : (vor ?? nach)?.breite ?? 240;
    /* Diskrete Aktion = eigener Verlaufsschritt (keine Gruppe), VOR der
       Änderung committen. */
    verlauf.commit("Knoten hinzugefügt");
    setGelockt(null);
    setzeNodes([...nodes, { y, x, breite }].sort((a, b) => a.y - b.y));
  };

  const knotenLoeschen = () => {
    if (gelockt === null || !nodes || nodes.length <= 2) return;
    verlauf.commit("Knoten gelöscht");
    setzeNodes(nodes.filter((_, i) => i !== gelockt));
    setGelockt(null);
  };

  const geradeZuruecksetzen = () => {
    if (!nodes) return;
    const x = RIVER_DESIGN_WIDTH_PX / 2;
    verlauf.commit("Gerade zurückgesetzt");
    setGelockt(null);
    setzeNodes(nodes.map((n) => ({ ...n, x, breite: 240 })));
    setStatus("Auf geraden Fluss zurückgesetzt");
  };

  /** Baut aus dem aktuellen Stand einen selbsttragenden Verlauf (Knoten +
   *  Animation + eingefrorene Geometrie/Farben). Gemeinsame Quelle von
   *  speichern() UND dem Export-Reiter — null, solange Geometrie/Farben nicht
   *  bereit sind (genau der ursprüngliche Export-Bug: nur Rohknoten). */
  const baueAktuellenVerlauf = (nameArg?: string): FlussVerlauf | null => {
    if (!ctx || !nodes || !zone) return null;
    if (!ctx.liveGeometrie || !ctx.liveFarben) return null;
    const reinName = (nameArg ?? name).trim() || "fluss";
    /* Nur die für die 1:1-Reproduktion nötige Teilmenge einfrieren —
       featureTriggers/segments/waterfalls/nodes sind Bau-Zwischenstände,
       kein Teil des gezeichneten Fluss-KÖRPERS. */
    const { centerD, bankD, sandD, kontur, waves } = ctx.liveGeometrie;
    const geometrie: FlussGeometrieSnapshot = { centerD, bankD, sandD, kontur, waves };
    return {
      schema: "wee-fluss-snapshot",
      version: 1,
      name: reinName,
      gespeichert: new Date().toISOString(),
      meta: {
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        zoneHDesign: Math.round(zone.h / zone.scale),
        designWidth: RIVER_DESIGN_WIDTH_PX,
      },
      nodes: nodes.map((n) => ({
        y: Math.round(n.y),
        x: Math.round(n.x),
        breite: Math.round(n.breite),
      })),
      /* Animations-Einstellungen gehören zum Verlauf — Kurve UND Animation in
         einer Datei. */
      anim: { ...ctx.anim },
      /* Eingefrorene Geometrie + Farben — DER 1:1-Garant. */
      geometrie,
      farben: { ...ctx.liveFarben },
    };
  };

  const speichern = () => {
    if (!ctx || !nodes || !zone || !name.trim()) return;
    const verlauf = baueAktuellenVerlauf(name);
    if (!verlauf) {
      /* Ehrliche Statusmeldung statt einer halben Datei (nur Rohknoten) —
         genau das war der ursprüngliche Export-Bug. */
      setStatus("Geometrie noch nicht bereit — kurz warten/scrollen und erneut versuchen");
      return;
    }
    const alle = { ...ladeVerlaeufe(), [name.trim()]: verlauf };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alle));
    setVerlaeufe(alle);
    setStatus(`„${name.trim()}" gespeichert (${nodes.length} Knoten + Animation + Geometrie)`);
  };

  const laden = (n: string) => {
    const v = ladeVerlaeufe()[n];
    if (!v || !ctx) return;
    /* Ein Profil aus der (in-Editor) Liste zu laden ist rückgängig machbar
       (Bauvorlage §3b): EIN Commit "Profil geladen" VOR dem Anwenden sichert
       den Vor-Lade-Stand — so lässt sich ein versehentliches Laden zurücknehmen.
       Bewusst ANDERS als der Datei-Import (importiereVerlauf → resetHistory):
       der bringt einen fremden Stand von aussen, über den hinweg zurückzuspringen
       verwirrte (analog Setup-Wechsel im Grafik-Editor). */
    verlauf.commit("Profil geladen");
    setName(n);
    setGelockt(null);
    /* Höhen-Normalisierung: v.meta.zoneHDesign ist die Zonenhöhe, gegen die
       die y-Werte autoriert wurden — weicht die AKTUELLE Zone davon ab,
       würden die rohen y-Werte weit über das Zonen-Ende hinauslaufen. */
    const faktor = hoehenFaktor(zone, v.meta?.zoneHDesign);
    setzeNodes(skaliereKnotenY(v.nodes.map((p) => ({ ...p })), faktor));
    /* Ältere Verläufe ohne anim-Feld: Config-Werte einsetzen. */
    ctx.setAnim({ ...ANIM_DEFAULTS, ...(v.anim ?? {}) });
    setStatus(`„${n}" geladen${hoehenHinweis(faktor)}`);
  };

  const verlaufLoeschen = (n: string) => {
    const alle = ladeVerlaeufe();
    delete alle[n];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alle));
    setVerlaeufe(alle);
    setStatus(`„${n}" gelöscht`);
  };

  const exportieren = () => {
    /* Der Dateiname IST der Profilname (Leon-Vorgabe). Exportiert das aktuell
       benannte, gespeicherte Profil als selbsttragende Einzeldatei. */
    const reinName = name.trim();
    if (!reinName) {
      setStatus("Bitte erst einen Profil-Namen vergeben");
      return;
    }
    const profil = ladeVerlaeufe()[reinName];
    if (!profil) {
      setStatus(`Profil „${reinName}" erst speichern, dann exportieren`);
      return;
    }
    const blob = new Blob([JSON.stringify(profil, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reinName}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(`Profil „${reinName}" exportiert → ${reinName}.json`);
  };

  /** Lädt nodes+anim eines validierten Verlaufs sofort live in den Editor —
   *  derselbe Weg wie laden(), nur ohne localStorage-Zwischenstopp. */
  const importiereVerlauf = (
    v: ImportierterVerlauf,
    anzeigeName: string,
    autoriertZoneH?: number,
  ) => {
    if (!ctx) return;
    setName(v.name?.trim() || anzeigeName);
    setGelockt(null);
    const faktor = hoehenFaktor(zone, autoriertZoneH);
    setzeNodes(skaliereKnotenY(v.nodes.map((p) => ({ ...p })), faktor));
    ctx.setAnim({ ...ANIM_DEFAULTS, ...(v.anim ?? {}) });
    /* Datei-Import bringt einen FREMDEN Stand von aussen — den Verlauf leeren
       (analog resetHistory bei Setup-Wechsel im Grafik-Editor): ein Rückgängig
       über den Import hinweg würde in den unabhängigen Vor-Import-Stand
       zurückspringen, was verwirrte statt zu helfen. Bewusst anders als
       laden() aus der Liste (dort EIN undo-barer Commit). */
    verlauf.resetHistory();
    return faktor;
  };

  /** Re-Import (der „Datei rein → Fluss erscheint"-Pfad). Akzeptiert einen
   *  Einzel-Snapshot ODER die Verlaufs-Map von „Export JSON (alle)".
   *  Kaputte/unbekannte Dateien → klare Statusmeldung, kein Absturz. */
  const dateiImportiert = async (e: ChangeEvent<HTMLInputElement>) => {
    const datei = e.target.files?.[0];
    e.target.value = ""; // erlaubt erneuten Import derselben Datei
    if (!datei || !ctx) return;
    const basisName = datei.name.replace(/\.json$/i, "");
    try {
      const json: unknown = JSON.parse(await datei.text());
      if (istImportierterVerlauf(json)) {
        const faktor = importiereVerlauf(json, basisName, leseAutorierteZoneH(json));
        setStatus(
          `„${json.name?.trim() || basisName}" importiert (${json.nodes.length} Knoten)${hoehenHinweis(faktor ?? 1)}`,
        );
        return;
      }
      if (typeof json === "object" && json !== null) {
        const eintrag = Object.entries(json as Record<string, unknown>).find(([, wert]) =>
          istImportierterVerlauf(wert),
        );
        if (eintrag) {
          const [eintragName, eintragVerlauf] = eintrag as [string, ImportierterVerlauf];
          const faktor = importiereVerlauf(
            eintragVerlauf,
            eintragName,
            leseAutorierteZoneH(eintragVerlauf),
          );
          setStatus(
            `„${eintragName}" aus „${datei.name}" importiert (${eintragVerlauf.nodes.length} Knoten)${hoehenHinweis(faktor ?? 1)}`,
          );
          return;
        }
      }
      setStatus(`Import fehlgeschlagen: „${datei.name}" enthält keinen erkennbaren Fluss-Verlauf`);
    } catch {
      setStatus(`Import fehlgeschlagen: „${datei.name}" ist kein gültiges JSON`);
    }
  };

  /** „Als SVG exportieren": baut aus der eingefrorenen Geometrie + Farben eine
   *  fertige, eigenständige Fluss-Grafik. NUR der Fluss-KÖRPER (Form + Farben)
   *  — Schaumfront/Glitzer/Nebel sind Laufzeit-Partikel und bewusst NICHT
   *  enthalten. */
  const alsSvgExportieren = () => {
    if (!ctx || !ctx.liveGeometrie || !ctx.liveFarben || !zone) {
      setStatus("Geometrie noch nicht bereit — kurz warten/scrollen und erneut versuchen");
      return;
    }
    const { centerD, bankD, sandD, kontur, waves } = ctx.liveGeometrie;
    const geometrie: FlussGeometrieSnapshot = { centerD, bankD, sandD, kontur, waves };
    const zoneHDesign = Math.round(zone.h / zone.scale);
    const svg = buildSnapshotSvgMarkup(geometrie, ctx.liveFarben, RIVER_DESIGN_WIDTH_PX, zoneHDesign);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.trim() || "fluss"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(
      `SVG exportiert (${svg.length} Zeichen) — nur der Fluss-KÖRPER (Form+Farben); ` +
        `Schaumfront/Glitzer/Nebel sind Laufzeit-Partikel und NICHT enthalten`,
    );
  };

  if (!ctx) return null;

  return {
    ctx,
    zone,
    nodes,
    gelockt,
    setGelockt,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    knotenHinzufuegen,
    knotenLoeschen,
    geradeZuruecksetzen,
    name,
    setName,
    verlaeufe,
    status,
    importRef,
    speichern,
    laden,
    verlaufLoeschen,
    exportieren,
    dateiImportiert,
    alsSvgExportieren,
    baueAktuellenVerlauf,
    verlauf,
  };
}
