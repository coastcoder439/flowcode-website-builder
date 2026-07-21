"use client";

/*
 * RiverFlow – umschließt die Landing-Sektionen mit der Fluss-Zone. Liest
 * river.config.json selbst (kein Prop-Drilling der Config von außen nötig),
 * misst die DOM-Anker der konfigurierten Wegpunkte, baut daraus per
 * buildRiverGeometry (riverPath.ts) die Geometrie und reicht sie an
 * RiverWaves + RiverFeatures weiter.
 *
 * F1a ("Original als Master"): Der Fluss lebt in einer zentrierten
 * 1200px-Design-Spalte (RIVER_DESIGN_WIDTH_PX, wie das Kunden-Original) –
 * viewBox 1200×designH, preserveAspectRatio "xMidYMin meet". Auf schmaleren
 * Screens skaliert die Spalte proportional (Faktor scale = Spaltenbreite /
 * 1200); die gemessene Zonenhöhe und alle Anker-Rechtecke werden vor dem
 * Geometrie-Bau in den Design-Raum umgerechnet (÷ scale). Dadurch bleibt
 * das Artwork exakt und füllt trotzdem die volle Zonenhöhe.
 *
 * Reveal-Mechanik: ein <rect> im <clipPath> wird per direktem
 * rect.setAttribute("height", …) gesteuert statt über useTransform an ein
 * style-Prop – motion delegiert style-gebundene useScroll-Werte sonst an
 * WAAPI/ViewTimeline (Chrome), und das Scroll-Mapping weicht dann vom
 * erwarteten Fortschritt ab (siehe useScrub-Muster in
 * components/title-curtain/TitleCurtain.tsx, dasselbe Problem dort gelöst).
 * Reveal-Höhen/revealY laufen in DESIGN-Einheiten (= viewBox-Einheiten),
 * konsistent mit den featureTriggers-y-Werten aus riverPath.ts.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  useMotionValue,
  useMotionValueEvent,
  useScroll,
  useSpring,
} from "motion/react";
import riverConfigJson from "../../river.config.json";
import { RiverWaves } from "./RiverWaves";
import { RiverFeatures } from "./RiverFeatures";
import { useRiverKurs } from "./RiverKursContext";
import { buildRiverGeometry, HORIZONT_Y_PCT, RIVER_DESIGN_WIDTH_PX } from "./riverPath";
import { FARBEN_TOKEN_KEYS } from "./riverSnapshot";
import type {
  AnchorRect,
  RiverConfig,
  RiverFlowProps,
  RiverGeometry,
} from "./river-types";
import "./river.css";

const riverConfig = riverConfigJson as unknown as RiverConfig;

/* Reveal-Spring: sanftes Nachziehen des Scroll-Fortschritts (Kundenwert,
   analog zur Vorhang-Atmung). */
const REVEAL_SPRING = { stiffness: 120, damping: 30 };
/* Scroll-Trigger-Fenster der Fluss-Zone, gleiches Muster wie bei
   scrollytelling-Strecken üblich: die Zone beginnt sich aufzudecken, sobald
   ihr Anfang 95% der Viewporthöhe erreicht, und ist voll aufgedeckt, sobald
   ihr Ende dieselbe Marke erreicht. */
const REVEAL_OFFSET: ["start 0.95", "end 0.95"] = ["start 0.95", "end 0.95"];

/* Innerer Wasser-Schatten wie im Original (dort: Kontur-Stroke 25px,
   Gauß-Blur, auf den Fluss geclippt): hier drei gestaffelte Strokes der
   FLUSS-KONTUR (bankD), auf bankD geclippt – nur die innere Stroke-Hälfte
   bleibt sichtbar und ergibt den weichen dunklen Rand an der Wasserkante,
   ohne Filter (Performance + Kompatibilität). Liegt ÜBER den Wellen
   (Zeichenreihenfolge wie im Original). */
const INNER_SHADOW_STROKES = [
  { widthPx: 44, opacity: 0.1 },
  { widthPx: 28, opacity: 0.12 },
  { widthPx: 14, opacity: 0.16 },
];

/** Misst alle konfigurierten Wegpunkt-Anker relativ zur Fluss-Zone. Fehlt ein
 *  Anker im DOM, wird er übersprungen (Fluss läuft dort geradeaus weiter) –
 *  buildRiverGeometry fällt dafür intern auf eine gleichmäßige Schätzung
 *  zurück. */
function measureAnchors(zoneEl: HTMLDivElement, cfg: RiverConfig): Map<string, AnchorRect> {
  const zoneRect = zoneEl.getBoundingClientRect();
  const anchors = new Map<string, AnchorRect>();
  for (const wp of cfg.waypoints) {
    const el = zoneEl.querySelector(wp.anchor);
    if (!el) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          `[RiverFlow] Anker nicht gefunden, Fluss läuft dort geradeaus weiter: ${wp.anchor}`,
        );
      }
      continue;
    }
    const r = el.getBoundingClientRect();
    anchors.set(wp.anchor, {
      x: r.left - zoneRect.left,
      y: r.top - zoneRect.top,
      width: r.width,
      height: r.height,
    });
  }
  return anchors;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Skalierungsfaktor der zentrierten Design-Spalte: 1 solange die Zone
 *  mindestens 1200px breit ist, sonst proportional kleiner. */
function columnScale(zoneW: number): number {
  return Math.min(zoneW, RIVER_DESIGN_WIDTH_PX) / RIVER_DESIGN_WIDTH_PX;
}

export function RiverFlow({ children }: RiverFlowProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const revealRectRef = useRef<SVGRectElement>(null);
  const clipId = `river-reveal-${useId().replace(/:/g, "")}`;
  const shadowClipId = `river-shadow-${useId().replace(/:/g, "")}`;

  const [geometry, setGeometry] = useState<RiverGeometry | null>(null);
  const [zoneSize, setZoneSize] = useState({ w: 0, h: 0 });
  /* Horizont-Kopf: ragt um (1 − HORIZONT_Y_PCT) Bühnenhöhen ÜBER die
     Zonen-Oberkante auf die Vorhang-Bühne (ein Fluss, ein Element — siehe
     buildStageHead in riverPath.ts). */
  const [headPx, setHeadPx] = useState(0);
  const [inView, setInView] = useState(false);
  const revealY = useMotionValue(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  /* Fluss-Editor (/fluss-editor): auf der normalen Landing existiert kein
     Provider → kursCtx === null, die Engine baut ihre Standard-Knoten. */
  const kursCtx = useRiverKurs();
  const nodesOverride = kursCtx?.nodes ?? null;
  const setLiveNodes = kursCtx?.setLive;
  const setLiveGeometrie = kursCtx?.setLiveGeometrie;
  const setLiveFarben = kursCtx?.setLiveFarben;

  /* Animations-Werte: im Editor live aus dem Panel, auf der Landing die
     Kundenwerte aus river.config.json. */
  const anim = kursCtx?.anim;
  const effConfig = anim
    ? {
        ...riverConfig,
        breath: { ...riverConfig.breath, periodS: anim.breathPeriodS },
        sparkle: {
          ...riverConfig.sparkle,
          mode: anim.sparkleMode,
          perTrail: anim.sparklePerTrail,
          trailDurS: anim.sparkleTrailDurS,
          flashS: anim.sparkleFlashS,
        },
        bank: { ...riverConfig.bank, strokePx: anim.bankStrokePx },
      }
    : riverConfig;
  const bankStrokePx = effConfig.bank.strokePx;

  const rebuild = useCallback(() => {
    const zoneEl = zoneRef.current;
    if (!zoneEl) return;
    const rect = zoneEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    /* Messwerte (px) → Design-Raum (1200er-Spalte): ÷ scale, x zusätzlich
       um den linken Rand der zentrierten Spalte verschieben. */
    const scale = columnScale(rect.width);
    const colLeft = (rect.width - RIVER_DESIGN_WIDTH_PX * scale) / 2;
    const designH = rect.height / scale;

    const anchorsPx = measureAnchors(zoneEl, riverConfig);
    const anchors = new Map<string, AnchorRect>();
    anchorsPx.forEach((a, key) => {
      anchors.set(key, {
        x: (a.x - colLeft) / scale,
        y: a.y / scale,
        width: a.width / scale,
        height: a.height / scale,
      });
    });

    /* Horizont-Kopf: ragt (1 − HORIZONT_Y_PCT) Bühnenhöhen über die Zone —
       Kopf-Höhe in Design-Einheiten an die Geometrie durchreichen, damit
       See+Kopf+Körper als EIN Pfad je Band gebaut werden. */
    const kopfPx = window.innerHeight * (1 - HORIZONT_Y_PCT);
    const geo = buildRiverGeometry(
      { w: RIVER_DESIGN_WIDTH_PX, h: designH },
      anchors,
      { ...riverConfig, bank: { ...riverConfig.bank, strokePx: bankStrokePx } },
      kopfPx / scale,
      nodesOverride ?? undefined,
    );
    setGeometry(geo);
    /* Nur melden, solange der Editor noch keine eigenen Knoten hält —
       sonst würde jeder Drag-Frame eine Live-Rückmeldung auslösen. */
    if (setLiveNodes && !nodesOverride && geo.nodes) setLiveNodes(geo.nodes);
    /* Geometrie + aufgelöste Farben: IMMER bei jedem Rebuild melden (auch
       während der Editor eigene Knoten hält) — Grundlage für den
       selbsttragenden Snapshot-Export (RiverKursEditor.speichern()). Anders
       als setLiveNodes oben gibt es hier keinen Rückkopplungs-Kreislauf
       (liveGeometrie/liveFarben fließen nirgends in nodesOverride zurück);
       die rAF-Drosselung des Editors (commitPerFrame in RiverKursEditor.tsx)
       verhindert ohnehin Spam pro Zeigerereignis, ein Rebuild pro Frame ist
       unproblematisch. */
    setLiveGeometrie?.(geo);
    if (setLiveFarben) {
      const cs = getComputedStyle(zoneEl);
      const aufgeloest: Record<string, string> = {};
      for (const key of FARBEN_TOKEN_KEYS) {
        const wert = cs.getPropertyValue(key).trim();
        if (wert) aufgeloest[key] = wert;
      }
      setLiveFarben(aufgeloest);
    }
    setZoneSize({ w: rect.width, h: rect.height });
    setHeadPx(kopfPx);
  }, [nodesOverride, setLiveNodes, setLiveGeometrie, setLiveFarben, bankStrokePx]);

  /* Erste Messung erst nach Font-Ladung – Ankerpositionen hängen von der
     finalen Textzeilenhöhe ab (webfonts verschieben sonst die Y-Werte). */
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) rebuild();
    });
    return () => {
      cancelled = true;
    };
  }, [rebuild]);

  /* Resize: nur Geometrie neu bauen, kein sonstiger State-Verlust. */
  useEffect(() => {
    const zoneEl = zoneRef.current;
    if (!zoneEl) return;
    const ro = new ResizeObserver(() => rebuild());
    ro.observe(zoneEl);
    return () => ro.disconnect();
  }, [rebuild]);

  /* Sichtbarkeit der Zone: pausiert die Wellen-Atmung außerhalb des
     Viewports (RiverWaves.paused). */
  useEffect(() => {
    const zoneEl = zoneRef.current;
    if (!zoneEl) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(zoneEl);
    return () => io.disconnect();
  }, []);

  const { scrollYProgress } = useScroll({ target: zoneRef, offset: REVEAL_OFFSET });
  const spring = useSpring(scrollYProgress, REVEAL_SPRING);

  /* Reveal-Höhe in DESIGN-Einheiten (viewBox), nicht in px – Rect und
     featureTriggers-Vergleiche (RiverFeatures) leben im selben Raum.
     Gesamt = Horizont-Kopf (negatives y) + Fluss-Körper: die Aufdeckung
     beginnt am See und läuft nahtlos in den Körper; revealY bleibt für
     Features/Schaum KÖRPER-relativ (Kopf-Anteil abgezogen, anfangs <0 →
     Schaum/Trigger greifen erst im Körper). */
  const scale = columnScale(zoneSize.w) || 1;
  const designH = zoneSize.h / scale;
  const headDesignH = headPx / scale;
  const topDesign = headDesignH;
  const totalH = designH + topDesign;

  /* Editor-Schalter „Fluss komplett aufdecken": Reveal steht auf voller
     Höhe (wie reduced-motion), damit Leon auch weit unten bequem an den
     Knoten arbeiten kann. Auf der Landing immer false (kein Provider). */
  const vollAufgedeckt = kursCtx?.vollAufgedeckt ?? false;

  useMotionValueEvent(spring, "change", (v) => {
    if (prefersReducedMotion || vollAufgedeckt) return;
    const h = v * totalH;
    revealRectRef.current?.setAttribute("height", String(h));
    revealY.set(h - topDesign);
  });

  /* Hält Rect + revealY synchron, auch wenn sich zoneSize/prefersReducedMotion
     ändern, ohne auf das nächste Scroll-"change"-Event zu warten – gleiches
     Nachzieh-Muster wie useScrub in TitleCurtain.tsx. Bei reduced-motion
     steht die Höhe sofort auf voller Höhe (Fluss komplett sichtbar). */
  useEffect(() => {
    const h = prefersReducedMotion || vollAufgedeckt ? totalH : spring.get() * totalH;
    revealRectRef.current?.setAttribute("height", String(h));
    revealY.set(h - topDesign);
  });


  return (
    <div ref={zoneRef} className="river-zone">
      {geometry && zoneSize.h > 0 && (
        <svg
          className="river-svg"
          style={{ top: -headPx, height: `calc(100% + ${headPx}px)` }}
          viewBox={`0 ${(-topDesign).toFixed(1)} ${RIVER_DESIGN_WIDTH_PX} ${totalH.toFixed(1)}`}
          preserveAspectRatio="xMidYMin meet"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                ref={revealRectRef}
                x={0}
                y={(-topDesign).toFixed(1)}
                width={RIVER_DESIGN_WIDTH_PX}
                height={0}
              />
            </clipPath>
            <clipPath id={shadowClipId}>
              <path d={geometry.bankD} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {/* KEIN Fade/Transparenz-Trick (Kundenvorgabe): „Ferne" entsteht
                rein PERSPEKTIVISCH — der Fluss beginnt klein in der Tiefe
                (kopfKontext, s(t)-Skalierung) und wird nach vorne größer.
                Ein ferner Fluss ist klein, aber voll sichtbar. */}
            {/* (1) EIN Fluss, EIN Element je Band (Kundenvorgabe): Sandufer
                und Wasserfläche sind je EIN durchgehender Pfad vom
                Horizont-Kopf bis zum Auslauf (riverPath.ts — eine
                Stoßkante ist konstruktionsbedingt unmöglich). */}
            {geometry.sandD && <path d={geometry.sandD} fill="var(--bank-500)" />}
            <path d={geometry.bankD} fill="var(--water-800)" />
            {/* (2) Wellen-Atmung + Sparkle. */}
            <RiverWaves
              geometry={geometry}
              breath={effConfig.breath}
              sparkle={effConfig.sparkle}
              paused={!inView}
            />
            {/* (3) Innerer Wasser-Schatten ÜBER den Wellen (wie im Original):
                Kontur-Strokes, auf den Flusskörper geclippt → nur die innere
                Stroke-Hälfte bleibt sichtbar. */}
            <g clipPath={`url(#${shadowClipId})`}>
              {INNER_SHADOW_STROKES.map((s) => (
                <path
                  key={s.widthPx}
                  d={geometry.bankD}
                  fill="none"
                  stroke="var(--green-900)"
                  strokeWidth={s.widthPx}
                  strokeOpacity={s.opacity}
                />
              ))}
            </g>
            {/* (4) Flora-Reveals (Wasserfälle/Felswand/See sind in F1a
                stillgelegt, siehe river.config.json disabledWaypointTypes). */}
            {/* riverStartY = y der Fluss-SPITZE (negativ). Ohne diesen Bezug
                verglich die Schaumfront gegen 0 (Körper-Anfang) und lief
                erst nach dem Header an. */}
            <RiverFeatures
              geometry={geometry}
              revealY={revealY}
              riverStartY={geometry.nodes?.[0]?.y ?? -topDesign}
              foam={
                anim
                  ? {
                      count: anim.foamCount,
                      leadPx: anim.foamLeadPx,
                      speed: anim.foamSpeed,
                      sizeK: anim.foamSizeK,
                      jitterPx: anim.foamJitterPx,
                      mistCount: anim.mistCount,
                      mistSizePx: anim.mistSizePx,
                      mistOpacity: anim.mistOpacity,
                      mistSpeed: anim.mistSpeed,
                      mistBlurPx: anim.mistBlurPx,
                    }
                  : undefined
              }
            />
          </g>
        </svg>
      )}
      {children}
    </div>
  );
}
