"use client";

/*
 * GrafikKeyframeTimeline – waagerechte Zeitleiste der Keyframes EINER
 * ausgewählten Grafik, zusätzlich zur bestehenden Liste im Reiter
 * „Keyframes" (GrafikEditor.tsx, .gre-liste dort — die bleibt unverändert,
 * diese Komponente ist rein additiv).
 *
 * Zeigt jeden Keyframe als Marker entlang der Scroll-Spanne (min…max
 * scrollY der Grafik). Klick auf einen Marker springt dorthin (wie der
 * bestehende „KF n"-Knopf in der Liste, springeZu). Ziehen verschiebt seine
 * scrollY — Live-Vorschau während des Zugs, EIN Commit beim Loslassen
 * (gleiches Ein-Zug-EIN-Schritt-Muster wie der Canvas-Zug in
 * GrafikEditor.tsx).
 *
 * Zug-Mechanik nach dem Vorbild von EasingKurve.tsx (griffDown/onMove/onUp
 * mit setPointerCapture) — bewusst KEIN globaler window-Listener wie beim
 * Canvas-Zug, weil diese Marker eigene, kleine DOM-Elemente INNERHALB von
 * .gre-panel sind (kein [data-grafik-id]-Träger, also für den bestehenden
 * Fenster-Pointer-Effekt ohnehin unsichtbar — keine Überschneidung).
 *
 * State-Besitz bleibt bei GrafikEditor.tsx (grafiken/commit) — diese
 * Komponente kennt weder Verlauf noch setzeGrafiken, sondern meldet nur
 * Start/Bewegung/Ende über Props (gleiches Muster wie GrafikInspector.tsx/
 * GrafikObjektMenue.tsx: reine Callback-Props, keine eigene Datenhaltung).
 */

import { useRef } from "react";
import type { Grafik } from "./grafik-types";
import "./grafik-keyframe-timeline.css";

/** Mindest-Spanne (Scroll-px) der Zeitleiste — verhindert eine
 *  Divison-durch-Null UND einen unbedienbar schmalen Zug-Bereich, wenn alle
 *  Keyframes (zufällig oder weil es nur einer ist) dieselbe scrollY haben. */
const MIN_SPANNE_PX = 200;
/** Bewegungs-Schwelle (px): darunter zählt pointerup als Klick, kein Zug —
 *  gleicher Gedanke wie KLICK_TOLERANZ_PX in GrafikEditor.tsx. */
const KLICK_TOLERANZ_PX = 3;

export interface GrafikKeyframeTimelineProps {
  grafik: Grafik;
  /** Index des Keyframes, der der aktuellen SEITEN-Scrollposition am
   *  nächsten liegt (naechsterKfIndex) — nur zur Hervorhebung, unabhängig
   *  von einem laufenden Zug hier. */
  aktivKfIndex: number;
  /** Klick ohne Zug: springt zur Scrollposition dieses Keyframes (wie der
   *  bestehende „KF n"-Knopf in der Liste). */
  onWaehle: (scrollY: number) => void;
  /** Zug-Beginn: Elternteil merkt sich den Vor-Zug-Stand für den späteren
   *  EINEN Commit (gleiches Muster wie dragRef.vorZugGrafiken). */
  onZugStart: () => void;
  /** Live-Update während des Ziehens — KEIN Commit (häufig, jede Bewegung). */
  onZugBewegung: (kfIndex: number, neuScrollY: number) => void;
  /** Loslassen nach einem Zug: Elternteil sortiert die Keyframes neu (die
   *  Reihenfolge muss nach scrollY sortiert bleiben, s. grafik-types.ts) und
   *  committet EINMAL. */
  onZugEnde: (kfIndex: number, neuScrollY: number) => void;
}

function clampScrollY(y: number): number {
  const max = typeof document !== "undefined" ? document.documentElement.scrollHeight : Infinity;
  return Math.min(max, Math.max(0, Math.round(y)));
}

interface ZugZustand {
  kfIndex: number;
  startClientX: number;
  startScrollY: number;
  /** Spurbreite UND Scroll-Spanne bei Zug-Beginn eingefroren — sonst würde
   *  ein Ziehen über den bisherigen min/max hinaus (die Spanne wächst dann
   *  im nächsten Render mit) die px→scrollY-Umrechnung MITTEN im Zug
   *  verschieben (spürbarer Sprung/Beschleunigung). */
  spurBreite: number;
  spanne: number;
  bewegt: boolean;
}

export function GrafikKeyframeTimeline({
  grafik,
  aktivKfIndex,
  onWaehle,
  onZugStart,
  onZugBewegung,
  onZugEnde,
}: GrafikKeyframeTimelineProps) {
  const spurRef = useRef<HTMLDivElement>(null);
  const zugRef = useRef<ZugZustand | null>(null);

  const scrollYs = grafik.keyframes.map((k) => k.scrollY);
  let domainMin = Math.min(...scrollYs);
  let domainMax = Math.max(...scrollYs);
  if (domainMax - domainMin < MIN_SPANNE_PX) {
    const mitte = (domainMin + domainMax) / 2;
    domainMin = mitte - MIN_SPANNE_PX / 2;
    domainMax = mitte + MIN_SPANNE_PX / 2;
  }
  const spanne = domainMax - domainMin;
  const posProzent = (y: number) => Math.min(100, Math.max(0, ((y - domainMin) / spanne) * 100));

  return (
    <div className="gre-kft">
      <div className="gre-kft-spur" ref={spurRef}>
        {grafik.keyframes.map((k, i) => (
          <button
            key={i}
            type="button"
            className={`gre-kft-marker${i === aktivKfIndex ? " gre-kft-marker--aktiv" : ""}`}
            style={{ left: `${posProzent(k.scrollY)}%` }}
            title={`KF ${i + 1} · y${Math.round(k.scrollY)}${k.srcOverride ? " · 🖼" : ""} — ziehen verschiebt, klicken springt hin`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as Element).setPointerCapture(e.pointerId);
              zugRef.current = {
                kfIndex: i,
                startClientX: e.clientX,
                startScrollY: k.scrollY,
                spurBreite: spurRef.current?.getBoundingClientRect().width || 1,
                spanne,
                bewegt: false,
              };
              onZugStart();
            }}
            onPointerMove={(e) => {
              const z = zugRef.current;
              if (!z || z.kfIndex !== i) return;
              const dx = e.clientX - z.startClientX;
              if (!z.bewegt && Math.abs(dx) < KLICK_TOLERANZ_PX) return;
              z.bewegt = true;
              onZugBewegung(i, clampScrollY(z.startScrollY + (dx / z.spurBreite) * z.spanne));
            }}
            onPointerUp={(e) => {
              const z = zugRef.current;
              zugRef.current = null;
              if (!z || z.kfIndex !== i) return;
              if (z.bewegt) {
                const dx = e.clientX - z.startClientX;
                onZugEnde(i, clampScrollY(z.startScrollY + (dx / z.spurBreite) * z.spanne));
              } else {
                onWaehle(k.scrollY);
              }
            }}
          >
            <span className="gre-kft-marker-nr">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="gre-kft-spanne">
        <span>y{Math.round(domainMin)}</span>
        <span>y{Math.round(domainMax)}</span>
      </div>
    </div>
  );
}
