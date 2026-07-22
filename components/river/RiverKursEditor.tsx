"use client";

/*
 * RiverKursEditor – Bearbeitungs-Overlay der Seite /fluss-editor
 * („CMS-like, nur Flusssteuerung", Kundenauftrag).
 *
 * ARCHITEKTUR: Die Knoten SIND der Fluss (RiverNode: y, x = Mittellinie,
 * breite). Die Engine baut die Kurve AUS ihnen. Deshalb liegt ein Handle
 * per Konstruktion exakt auf dem Wasser — es wird NICHTS nachgemessen und
 * nichts nachkorrigiert (das war der alte, kaputte Ansatz: Knoten auf einen
 * bereits gekrümmten Fluss legen → Springen + Lag).
 *
 * Bedienung:
 *  - Ziehen  = Knoten bewegen (Position der Fluss-Mittellinie).
 *  - Klick   = Knoten „einloggen" (gelb) → Scrollrad ändert die BREITE
 *              (= Perspektive). ESC / erneuter Klick = ausloggen.
 *  - Panel: Knoten hinzufügen/löschen, benannte Verläufe speichern/laden
 *    (localStorage) + JSON-Export (Übergabeformat = exakt RiverNode[]).
 *
 * Performance: Drag schreibt die Knoten in einen Ref und committet pro
 * Animationsframe EINMAL in den State → ein Geometrie-Neubau pro Frame,
 * kein Nachmessen der Kurve. Der Scroll-Effekt der Seite bleibt aktiv.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ANIM_DEFAULTS, useRiverKurs, type AnimEinstellungen } from "./RiverKursContext";
import { BackdropAuswahl } from "@/components/backdrop/BackdropAuswahl";
import { RIVER_DESIGN_WIDTH_PX } from "./riverPath";
import {
  buildSnapshotSvgMarkup,
  istImportierterVerlauf,
  type FlussGeometrieSnapshot,
  type FlussVerlauf,
  type ImportierterVerlauf,
} from "./riverSnapshot";
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

/* Verlaufs-Typ (schema/version/meta/geometrie/farben) lebt in
   riverSnapshot.ts (FlussVerlauf) — geteilt mit RiverSnapshotSvg.tsx, damit
   Editor und portabler Renderer denselben Vertrag nutzen statt Kopien zu
   pflegen. */

/** Ein Regler des Animations-Menüs. */
interface AnimRegler {
  key: keyof AnimEinstellungen;
  label: string;
  min: number;
  max: number;
  step: number;
  einheit: string;
}

/** Regler des „Wasser"-Reiters (Wellen/Glitzer/Ufer). */
const REGLER_WASSER: AnimRegler[] = [
  { key: "breathPeriodS", label: "Wellen-Atmung", min: 0.5, max: 20, step: 0.5, einheit: "s" },
  { key: "sparkleTrailDurS", label: "Glitzer-Tempo", min: 10, max: 300, step: 5, einheit: "s" },
  { key: "sparklePerTrail", label: "Glitzer pro Spur", min: 0, max: 40, step: 1, einheit: "" },
  { key: "sparkleFlashS", label: "Aufblitzen", min: 0.2, max: 10, step: 0.1, einheit: "s" },
  { key: "bankStrokePx", label: "Sandufer-Breite", min: 0, max: 160, step: 2, einheit: "px" },
];

/** Regler des „Front"-Reiters (Partikelwolke der Fließfront). Die BREITE
 *  fehlt bewusst — sie ist fest an die Flussbreite gekoppelt. */
const REGLER_BLASEN: AnimRegler[] = [
  { key: "foamCount", label: "Partikel", min: 10, max: 320, step: 5, einheit: "" },
  { key: "foamLeadPx", label: "Vorpreschen", min: 0, max: 140, step: 2, einheit: "px" },
  { key: "foamSpeed", label: "Tempo", min: 0.2, max: 4, step: 0.1, einheit: "×" },
  { key: "foamSizeK", label: "Größe", min: 0.3, max: 3, step: 0.1, einheit: "×" },
  { key: "foamJitterPx", label: "Springen", min: 0, max: 40, step: 1, einheit: "px" },
];

/** Regler des „Nebel"-Reiters: die weiche Wolkenkante über der Front —
 *  bewusst getrennt von den Partikeln (Kundenvorgabe). */
const REGLER_NEBEL: AnimRegler[] = [
  { key: "mistCount", label: "Wolken", min: 0, max: 30, step: 1, einheit: "" },
  { key: "mistSizePx", label: "Wolkengröße", min: 4, max: 90, step: 2, einheit: "px" },
  { key: "mistOpacity", label: "Deckkraft", min: 0, max: 1, step: 0.05, einheit: "" },
  { key: "mistBlurPx", label: "Weichheit", min: 0, max: 24, step: 1, einheit: "px" },
  { key: "mistSpeed", label: "Waber-Tempo", min: 0.2, max: 4, step: 0.1, einheit: "×" },
];

type Reiter = "fluss" | "wasser" | "blasen" | "nebel" | "verlaeufe" | "hintergrund";

const REITER: { id: Reiter; label: string }[] = [
  { id: "fluss", label: "Fluss" },
  { id: "wasser", label: "Wasser" },
  { id: "blasen", label: "Front" },
  { id: "nebel", label: "Nebel" },
  { id: "verlaeufe", label: "Profile" },
  { id: "hintergrund", label: "Hintergrund" },
];

/** Ein beschrifteter Schieberegler mit Live-Wert. */
function Regler({
  r,
  anim,
  setAnim,
}: {
  r: AnimRegler;
  anim: AnimEinstellungen;
  setAnim: (a: AnimEinstellungen) => void;
}) {
  const wert = anim[r.key] as number;
  return (
    <div className="rke-regler">
      <div className="rke-regler-kopf">
        <span>{r.label}</span>
        <span className="rke-wert">
          {Number.isInteger(wert) ? wert : wert.toFixed(2)}
          {r.einheit}
        </span>
      </div>
      <input
        type="range"
        min={r.min}
        max={r.max}
        step={r.step}
        value={wert}
        onChange={(e) => setAnim({ ...anim, [r.key]: Number(e.target.value) })}
      />
    </div>
  );
}

interface ZoneMetrik {
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
 * Zonenhöhe zum Speicherzeitpunkt (meta.zoneHDesign, s. speichern() unten).
 * Lädt man den Verlauf über einer Seite mit ANDERER aktueller Zonenhöhe
 * (anderer Viewport, anderer Inhalt seit dem Speichern, anderer
 * Backdrop) OHNE Anpassung, bleiben die rohen y-Werte stehen — Handles UND
 * die daraus gebaute Flussgeometrie (buildRiverGeometry, riverPath.ts)
 * verwenden sie unverändert 1:1. Beide bleiben zwar KONSISTENT zueinander
 * (dieselbe Rechnung, dieselbe live gemessene Zone), aber die Knoten
 * reichen dann weit über das tatsächliche Zonen-Ende hinaus (zu große
 * autorierte Höhe) oder stauchen sich in dessen oberes Drittel (zu kleine).
 * Der Editor-Handle hängt trotzdem exakt an derselben Dokument-Position wie
 * der (dann abgeschnittene bzw. zu kurze) sichtbare Fluss — das Ergebnis
 * wirkt beim Scrollen wie ein Knoten, der vom Fluss wegläuft. */

/** Design-Höhe der AKTUELLEN, live gemessenen Zone — dieselbe Rechnung wie
 *  beim Speichern (zoneHDesign: Math.round(zone.h / zone.scale) unten),
 *  hier aber VOR der Verhältnisbildung gerundet: eine unveränderte Zone
 *  ergibt dadurch exakt Faktor 1 (keine Sub-Pixel-Differenz allein durch
 *  die beim Speichern bereits erfolgte Rundung). */
function hoehenFaktor(zone: ZoneMetrik | null, autoriertZoneH: number | undefined): number {
  if (!zone || !autoriertZoneH || autoriertZoneH <= 0) return 1;
  const aktuelleZoneH = Math.round(zone.h / zone.scale);
  if (!Number.isFinite(aktuelleZoneH) || aktuelleZoneH <= 0) return 1;
  return aktuelleZoneH / autoriertZoneH;
}

/** Skaliert NUR die Y-Koordinate (Höhen-Achse) aller Knoten — x/breite
 *  bleiben unangetastet: die BREITE der Design-Spalte ist bereits separat
 *  über zone.scale normalisiert (columnScale hängt nur von der Zonen-
 *  BREITE ab), eine abweichende Zonen-HÖHE hat damit nichts zu tun.
 *  faktor=1 ist ein bewusster No-Op (identisches Array zurück) — der
 *  Normalfall bleibt dadurch bit-für-bit wie bisher. */
function skaliereKnotenY(nodes: RiverNode[], faktor: number): RiverNode[] {
  if (faktor === 1) return nodes;
  return nodes.map((n) => ({ ...n, y: n.y * faktor }));
}

/** Kurzer Statuszeilen-Zusatz, wenn eine Höhen-Anpassung tatsächlich
 *  gegriffen hat (faktor=1 = nichts zu vermelden, häufigster Fall: Autoren-
 *  und Zielhöhe sind identisch). */
function hoehenHinweis(faktor: number): string {
  return faktor === 1 ? "" : ` (Höhe angepasst ×${faktor.toFixed(2)})`;
}

/** Liest defensiv meta.zoneHDesign aus einem lose typisierten Re-Import
 *  (ImportierterVerlauf verlangt bewusst KEIN meta-Feld, s. riverSnapshot.ts
 *  — alte/handgebaute Dateien bleiben so importierbar). Fehlt es oder ist es
 *  keine gültige Zahl > 0, liefert hoehenFaktor() ohnehin 1 (No-Op, exakt
 *  das bisherige Verhalten für Dateien ohne diese Angabe). */
function leseAutorierteZoneH(v: unknown): number | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const meta = (v as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return undefined;
  const zoneHDesign = (meta as { zoneHDesign?: unknown }).zoneHDesign;
  return typeof zoneHDesign === "number" && zoneHDesign > 0 ? zoneHDesign : undefined;
}

export function RiverKursEditor() {
  const ctx = useRiverKurs();
  const [zone, setZone] = useState<ZoneMetrik | null>(null);
  const [gelockt, setGelockt] = useState<number | null>(null);
  const [verlaeufe, setVerlaeufe] = useState<Record<string, FlussVerlauf>>({});
  const [name, setName] = useState("verlauf-1");
  const [status, setStatus] = useState("");
  const [reiter, setReiter] = useState<Reiter>("fluss");
  const dragRef = useRef<{ idx: number; startX: number; startY: number; bewegt: boolean } | null>(
    null,
  );
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
     asynchron aus IndexedDB geladenem Backdrop (s. BackdropContext.tsx)
     ZWEI STRUKTURELL VERSCHIEDENE Zweige (TitleCurtain+RiverFlow vs. nur
     RiverFlow), React remountet daher den kompletten Zweig inkl.
     .river-zone, sobald der Backdrop-Ladevorgang abschließt. Der
     ResizeObserver oben würde dann ein aus dem DOM entferntes, verwaistes
     Element beobachten und nie wieder feuern — zone bliebe dauerhaft auf
     dem Stand VOR dem Wechsel stehen (Handles driften ab, exakt die
     Kern-Symptomatik dieses Fixes, nur durch einen ANDEREN Auslöser als die
     Höhen-Normalisierung). RiverFlow selbst ist davon NICHT betroffen: sein
     eigener ResizeObserver sitzt IM remounteten Zweig und hängt sich beim
     Neu-Mount automatisch frisch an. Ein MutationObserver auf einer
     stabilen, äußeren Ebene erkennt den Element-Tausch selbst (nicht nur
     Größenänderungen) und hängt den ResizeObserver an das NEUE Element um.
     ZUSÄTZLICH ein kurzes, selbstbeendendes Polling direkt nach dem Mount
     (Sicherheitsnetz): der Backdrop-Ladevorgang UND der darauf folgende
     Remount laufen asynchron und außerhalb der Kontrolle dieser Komponente.
     Wichtig: das Polling ruft `messen()` UNBEDINGT auf (nicht nur bei
     erkanntem Element-Tausch) — denn dieselbe erste Messung kann auch OHNE
     Remount zu früh gewesen sein (z.B. misst .river-zone VOR dem finalen
     Layout des Vorhangs/Hero DARÜBER: dieselbe Zone bleibt als Element
     bestehen, nur ihre Position verschiebt sich noch — weder ResizeObserver
     [reagiert nur auf GRÖSSE] noch der Element-Tausch-Check unten hätten das
     bemerkt). Das Polling holt jede verpasste Änderung spätestens nach
     REMESS_INTERVAL_MS nach, ohne dauerhaft zu laufen. */
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

  /* Eingeloggter Knoten: Scrollrad = Breite (Seiten-Scroll blockiert). */
  useEffect(() => {
    if (gelockt === null || !nodes) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const faktor = e.deltaY < 0 ? WHEEL_FAKTOR : 1 / WHEEL_FAKTOR;
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

  const onPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { idx, startX: e.clientX, startY: e.clientY, bewegt: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
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
  };

  /** Neuer Knoten auf Bildschirmmitte, eingefügt zwischen den Nachbarn
   *  (x/breite interpoliert → der Verlauf springt beim Einfügen nicht). */
  const knotenHinzufuegen = () => {
    if (!zone || !nodes) return;
    const y = (window.scrollY + window.innerHeight / 2 - zone.topDoc) / zone.scale;
    const vor = [...nodes].filter((n) => n.y <= y).pop();
    const nach = nodes.find((n) => n.y > y);
    const t = vor && nach ? (y - vor.y) / (nach.y - vor.y || 1) : 0;
    const x = vor && nach ? vor.x + (nach.x - vor.x) * t : (vor ?? nach)?.x ?? RIVER_DESIGN_WIDTH_PX / 2;
    const breite =
      vor && nach ? vor.breite + (nach.breite - vor.breite) * t : (vor ?? nach)?.breite ?? 240;
    setGelockt(null);
    setzeNodes([...nodes, { y, x, breite }].sort((a, b) => a.y - b.y));
  };

  const knotenLoeschen = () => {
    if (gelockt === null || !nodes || nodes.length <= 2) return;
    setzeNodes(nodes.filter((_, i) => i !== gelockt));
    setGelockt(null);
  };

  const geradeZuruecksetzen = () => {
    if (!nodes) return;
    const x = RIVER_DESIGN_WIDTH_PX / 2;
    setGelockt(null);
    setzeNodes(nodes.map((n) => ({ ...n, x, breite: 240 })));
    setStatus("Auf geraden Fluss zurückgesetzt");
  };

  const speichern = () => {
    if (!ctx || !nodes || !zone || !name.trim()) return;
    if (!ctx.liveGeometrie || !ctx.liveFarben) {
      /* Ehrliche Statusmeldung statt einer halben Datei (nur Rohknoten) —
         genau das war der ursprüngliche Export-Bug. */
      setStatus("Geometrie noch nicht bereit — kurz warten/scrollen und erneut versuchen");
      return;
    }
    /* Nur die für die 1:1-Reproduktion nötige Teilmenge einfrieren (siehe
       riverSnapshot.ts) — featureTriggers/segments/waterfalls/nodes sind
       Bau-Zwischenstände, kein Teil des gezeichneten Fluss-KÖRPERS. */
    const { centerD, bankD, sandD, kontur, waves } = ctx.liveGeometrie;
    const geometrie: FlussGeometrieSnapshot = { centerD, bankD, sandD, kontur, waves };
    const verlauf: FlussVerlauf = {
      schema: "wee-fluss-snapshot",
      version: 1,
      name: name.trim(),
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
      /* Animations-Einstellungen gehören zum Verlauf — beim Export bekommt
         Leon Kurve UND Animation in einer Datei. */
      anim: { ...ctx.anim },
      /* Eingefrorene Geometrie + Farben — DER 1:1-Garant (Fix des
         Export-Bugs: der alte Export enthielt nur Rohknoten, keinen
         fertigen Fluss, und hatte keinen Re-Import). */
      geometrie,
      farben: { ...ctx.liveFarben },
    };
    const alle = { ...ladeVerlaeufe(), [name.trim()]: verlauf };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alle));
    setVerlaeufe(alle);
    setStatus(`„${name.trim()}" gespeichert (${nodes.length} Knoten + Animation + Geometrie)`);
  };

  const laden = (n: string) => {
    const v = ladeVerlaeufe()[n];
    if (!v || !ctx) return;
    setName(n);
    setGelockt(null);
    /* Höhen-Normalisierung: v.meta.zoneHDesign ist die Zonenhöhe, gegen die
       die y-Werte autoriert wurden — weicht die AKTUELLE Zone davon ab
       (anderer Viewport/Inhalt/Backdrop als beim Speichern), würden die
       rohen y-Werte weit über das Zonen-Ende hinauslaufen oder sich oben
       stauchen (s. hoehenFaktor oben). */
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
   *  derselbe Weg wie `laden()` (setzeNodes/ctx.setAnim), nur ohne
   *  localStorage-Zwischenstopp (die Datei selbst ist die Quelle).
   *  autoriertZoneH: optional, da ImportierterVerlauf bewusst KEIN meta-Feld
   *  verlangt (alte/handgebaute Dateien bleiben importierbar) — fehlt sie,
   *  liefert hoehenFaktor() 1 (No-Op, exakt das bisherige Verhalten). */
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
    return faktor;
  };

  /** Re-Import (der bisher fehlende „Datei rein → Fluss erscheint"-Pfad).
   *  Akzeptiert sowohl einen Einzel-Snapshot (schema "wee-fluss-snapshot")
   *  als auch die Verlaufs-Map von „Export JSON (alle)" (nimmt dann den
   *  ersten gültigen Eintrag) — genau die Datei, die Leon aktuell verschickt.
   *  Kaputte/unbekannte Dateien → klare Statusmeldung, kein Absturz. */
  const dateiImportiert = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          const faktor = importiereVerlauf(eintragVerlauf, eintragName, leseAutorierteZoneH(eintragVerlauf));
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

  /** „Als SVG exportieren": baut aus der eingefrorenen Geometrie + Farben
   *  eine fertige, eigenständige Fluss-Grafik (Sandufer + Wasserfläche +
   *  Wellen-Startframe). NUR der Fluss-KÖRPER (Form + Farben) —
   *  Schaumfront/Glitzer/Nebel sind Laufzeit-Partikel (JS/rAF) und bewusst
   *  NICHT enthalten (siehe buildSnapshotSvgMarkup, riverSnapshot.ts). */
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

  return (
    <>
      {zone && nodes && (
        <div className="rke-layer" aria-hidden="true">
          {nodes.map((n, i) => {
            /* Handle = der Knoten selbst (Design → Dokument). Er IST die
               Fluss-Mittellinie, deshalb sitzt er immer auf dem Wasser. */
            const left = zone.leftDoc + zone.colLeft + n.x * zone.scale;
            const top = zone.topDoc + n.y * zone.scale;
            const istGelockt = gelockt === i;
            return (
              <div
                key={i}
                className={`rke-knoten${istGelockt ? " rke-knoten--lock" : ""}`}
                style={{ left, top }}
                onPointerDown={onPointerDown(i)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp(i)}
              >
                <span className="rke-knoten-label">
                  {i + 1} · {Math.round(n.breite)}px
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="rke-panel">
        <div className="rke-kopf">
          <strong>Fluss-Editor</strong>
          {/* Kreuz-Link „Grafiken →" entfällt (Welle 2a): Fluss- und
              Grafik-Editor liegen jetzt gemeinsam auf /editor, ein
              Editor-Wechsel-Link zeigte nur auf die tote Trennung (Inventar
              §4.3). Das Grafik-Panel ist auf derselben Route links direkt
              sichtbar. */}
        </div>
        <div className="rke-zaehler">{nodes?.length ?? 0} Knoten</div>

        {/* Reiter: trennt Kurve / Wasser / Blasen / Verläufe — statt einer
            langen Liste, in der man nichts wiederfindet. */}
        <div className="rke-tabs">
          {REITER.map((r) => (
            <button
              key={r.id}
              className={`rke-tab${reiter === r.id ? " rke-tab--aktiv" : ""}`}
              onClick={() => setReiter(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {reiter === "fluss" && (
          <>
            <div className="rke-hilfe">
              Ziehen = Position · Klick = einloggen (gelb) → Scrollrad = Breite/Perspektive ·
              ESC = ausloggen
            </div>
            <div className="rke-row">
              <button onClick={knotenHinzufuegen}>+ Knoten</button>
              <button onClick={knotenLoeschen} disabled={gelockt === null}>
                − Knoten
              </button>
            </div>
            <div className="rke-row">
              <button onClick={geradeZuruecksetzen}>Gerade zurücksetzen</button>
            </div>
            <label className="rke-row">
              <input
                type="checkbox"
                checked={ctx.vollAufgedeckt}
                onChange={(e) => ctx.setVollAufgedeckt(e.target.checked)}
              />
              Fluss komplett aufdecken
            </label>
          </>
        )}

        {reiter === "wasser" && (
          <>
            <div className="rke-hilfe">Wellen-Atmung, Glitzer und Sandufer.</div>
            <label className="rke-row">
              <input
                type="checkbox"
                checked={ctx.anim.sparkleMode === "dezent"}
                onChange={(e) =>
                  ctx.setAnim({ ...ctx.anim, sparkleMode: e.target.checked ? "dezent" : "aus" })
                }
              />
              Glitzer an
            </label>
            {REGLER_WASSER.map((r) => (
              <Regler key={r.key} r={r} anim={ctx.anim} setAnim={ctx.setAnim} />
            ))}
          </>
        )}

        {reiter === "blasen" && (
          <>
            <div className="rke-hilfe">
              Partikelwolke der Fließfront aus 3 Schichten: Gischt (klein, schnell, prescht weit
              vor), Schaum (mittel, reitet auf der Front), Nachlauf (driftet zurück). Größe/Tempo/
              Weg streuen pro Partikel. Die Breite ist fest an den Fluss gekoppelt.
            </div>
            {REGLER_BLASEN.map((r) => (
              <Regler key={r.key} r={r} anim={ctx.anim} setAnim={ctx.setAnim} />
            ))}
          </>
        )}

        {reiter === "nebel" && (
          <>
            <div className="rke-hilfe">
              Weiche Wolkenkante ÜBER der Front — deckt die Schnittkante zu und gibt der Front
              Volumen. Läuft über ein CSS-blur() (GPU), nicht über teure SVG-Filter.
            </div>
            {REGLER_NEBEL.map((r) => (
              <Regler key={r.key} r={r} anim={ctx.anim} setAnim={ctx.setAnim} />
            ))}
          </>
        )}

        {reiter === "verlaeufe" && (
          <>
            <div className="rke-hilfe">
              Ein Profil = ein gespeicherter Fluss-Stand (Kurve, Animation UND eingefrorene
              Geometrie/Farben). Der Export ist eine selbsttragende Datei, benannt nach dem Profil —
              „Importieren" lädt sie sofort wieder live. Die Zahl hinter dem Namen = Anzahl der
              Knotenpunkte, die den Verlauf definieren.
            </div>
            <div className="rke-row">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Profil-Name (= Dateiname)"
              />
              <button onClick={speichern}>Speichern</button>
            </div>
            {Object.keys(verlaeufe).length > 0 && (
              <div className="rke-liste">
                {Object.keys(verlaeufe)
                  .sort()
                  .map((n) => (
                    <div key={n} className="rke-row">
                      <button
                        className="rke-lade"
                        onClick={() => laden(n)}
                        title={`Profil „${n}" laden — ${verlaeufe[n].nodes?.length ?? 0} Knotenpunkte`}
                      >
                        {n} ({verlaeufe[n].nodes?.length ?? 0} Knoten)
                      </button>
                      <button onClick={() => verlaufLoeschen(n)} title={`Profil „${n}" löschen`}>
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            )}
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              onChange={dateiImportiert}
              hidden
            />
            <div className="rke-row">
              <button
                onClick={() => importRef.current?.click()}
                title="Profil-Datei laden (Einzel-Profil oder alte Sammel-Datei)"
              >
                Importieren
              </button>
              <button onClick={exportieren} title="Aktuelles Profil als JSON (Dateiname = Profilname)">
                Als JSON exportieren
              </button>
            </div>
            <div className="rke-row">
              <button
                onClick={alsSvgExportieren}
                title="Fluss-Körper (Form+Farben) als eigenständige SVG-Datei — ohne Laufzeit-Partikel"
              >
                Als SVG exportieren
              </button>
            </div>
          </>
        )}

        {reiter === "hintergrund" && <BackdropAuswahl />}

        {(reiter === "wasser" || reiter === "blasen" || reiter === "nebel") && (
          <div className="rke-row">
            <button onClick={() => ctx.setAnim({ ...ANIM_DEFAULTS })}>
              Animation zurücksetzen
            </button>
          </div>
        )}

        {status && <div className="rke-status">{status}</div>}
      </div>
    </>
  );
}
