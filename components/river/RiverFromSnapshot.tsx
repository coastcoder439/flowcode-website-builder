"use client";

/*
 * RiverFromSnapshot – FIDELITY-PROBE für den portablen Fluss-Embed. Rendert
 * den VOLLSTÄNDIGEN Fluss (Körper + Wellen-Atmung + Schaumfront + Glitzer +
 * Nebel) rein aus einem selbsttragenden Snapshot (FlussVerlauf,
 * riverSnapshot.ts) – OHNE Host-DOM (keine river.config.json-Anker, keine
 * Messung fremder Sektionen). Ziel: dieselbe Optik wie im Fluss-Editor, aber
 * einbettbar auf jeder Seite (perspektivisch auch außerhalb dieses Repos).
 *
 * WIEDERVERWENDUNG: RiverWaves.tsx/RiverFeatures.tsx werden UNVERÄNDERT
 * eingebunden (Kundenvorgabe „nichts nachbauen") – beide sind bereits pure
 * Konsumenten einer fertigen RiverGeometry (kein DOM-Zugriff außer eigenen
 * Refs), laufen also identisch, ob die Geometrie von RiverFlow oder hier kommt.
 *
 * GEOMETRIE: bevorzugt die eingefrorene `geometrie` (1:1-Garant – exakt die
 * beim Speichern im Editor sichtbaren Pfade, keine Neuberechnung). Fehlt sie
 * (ältere Verläufe), Neubau aus `nodes` über buildRiverGeometry mit leerer
 * Anker-Map + minimaler Config aus `anim`. `waypoints` bleibt leer:
 * river.config.json hat ohnehin keine features[] mehr an den Wegpunkten
 * (Flora per Kundenentscheid entfernt) und Wasserfälle/See sind global
 * deaktiviert – featureTriggers/waterfalls/lakeD wären so oder so leer,
 * genau wie im Snapshot-Format selbst vorgesehen (riverSnapshot.ts).
 *
 * FARBEN: Körper nutzt dieselben CSS-Variablen (var(--water-800) etc.) wie
 * RiverFlow.tsx statt der eingefrorenen `verlauf.farben` – RiverWaves.tsx/
 * RiverFeatures.tsx verdrahten ihre Wellen-/Partikelfarben ohnehin FEST als
 * CSS-var()-Referenzen (kein Prop, dürfen laut Auftrag nicht angefasst
 * werden), also zieht der Körper dieselbe Quelle nach. EHRLICH: eine wirklich
 * fremde Seite bräuchte diese Tokens im Host oder – als Folgeschritt – Farb-
 * Props in RiverWaves/RiverFeatures; hier bewusst nicht angefasst.
 *
 * SCROLL: dieselbe Reveal-Mechanik wie RiverFlow.tsx (useScroll auf die
 * EIGENE Zone + Spring + Clip-Rect) – `useScroll({ target })` hängt nur an
 * der Position des eigenen Elements zum Viewport, ist also bereits DOM-frei.
 * NICHT enthalten: die RiverBirth-Sequenz (Tropfen aus dem Logo) – die hängt
 * an der Vorhang-Bühne einer konkreten Landing und ist nicht Teil des Auftrags.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMotionValue, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { RiverWaves } from "./RiverWaves";
import { RiverFeatures } from "./RiverFeatures";
import { buildRiverGeometry, RIVER_DESIGN_WIDTH_PX } from "./riverPath";
import { ANIM_DEFAULTS, type AnimEinstellungen } from "./RiverKursContext";
import type { FlussVerlauf } from "./riverSnapshot";
import type { RiverConfig, RiverGeometry } from "./river-types";
import "./river.css";

/** Liest eine Animations-Einstellung aus dem Snapshot, mit Fallback auf die
 *  Kundenwerte (ANIM_DEFAULTS) – spart die `anim?.x ?? ANIM_DEFAULTS.x`-
 *  Wiederholung pro Feld an allen Aufrufstellen unten. */
function pick<K extends keyof AnimEinstellungen>(
  anim: AnimEinstellungen | undefined,
  key: K,
): AnimEinstellungen[K] {
  return anim?.[key] ?? ANIM_DEFAULTS[key];
}

const REVEAL_SPRING = { stiffness: 120, damping: 30 };
const REVEAL_OFFSET: ["start 0.95", "end 0.95"] = ["start 0.95", "end 0.95"];

/** Duplikat aus RiverFlow.tsx (dort nicht exportiert) – derselbe innere
 *  Wasser-Schatten-Look (drei gestaffelte Konturstrokes, geclippt). */
const INNER_SHADOW_STROKES = [
  { widthPx: 44, opacity: 0.1 },
  { widthPx: 28, opacity: 0.12 },
  { widthPx: 14, opacity: 0.16 },
];

/** Duplikat aus RiverFlow.tsx (dort nicht exportiert): Skalierungsfaktor der
 *  zentrierten Design-Spalte – 1 ab designWidth, sonst proportional kleiner. */
function columnScale(zoneW: number, designWidth: number): number {
  return Math.min(zoneW, designWidth) / designWidth;
}

/** Duplikat aus RiverFlow.tsx (dort nicht exportiert). */
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

/** Baut die vollständige RiverGeometry aus einem Snapshot (siehe Dateikopf:
 *  bevorzugt die eingefrorene Geometrie, fällt sonst auf einen Neubau aus den
 *  Knoten zurück). featureTriggers/waterfalls/lakeD bleiben in BEIDEN Fällen
 *  leer – kein Rückschritt gegenüber der Landing (dort aktuell ebenfalls leer,
 *  siehe river.config.json: disabledWaypointTypes + keine features[] mehr). */
function buildGeometryFromVerlauf(verlauf: FlussVerlauf, designWidth: number): RiverGeometry {
  const zoneH = Math.max(verlauf.meta.zoneHDesign, 1);
  const sortedNodes = [...verlauf.nodes].sort((a, b) => a.y - b.y);

  if (verlauf.geometrie) {
    const { centerD, bankD, sandD, kontur, waves } = verlauf.geometrie;
    return {
      centerD,
      bankD,
      sandD,
      kontur,
      waves,
      segments: [{ fromY: 0, toY: zoneH, amplitudeScale: 1, kind: "flow" }],
      featureTriggers: [],
      waterfalls: [],
      lakeD: undefined,
      nodes: sortedNodes,
    };
  }

  const anim = verlauf.anim;
  const minimalCfg: RiverConfig = {
    sourceExit: { xPct: 50, widthPx: 120 },
    breath: { periodS: pick(anim, "breathPeriodS"), waveCount: 5 },
    sparkle: {
      mode: pick(anim, "sparkleMode"),
      perTrail: pick(anim, "sparklePerTrail"),
      trailDurS: pick(anim, "sparkleTrailDurS"),
      flashS: pick(anim, "sparkleFlashS"),
    },
    bank: { strokePx: pick(anim, "bankStrokePx") },
    /* Keine Wegpunkte: kein Host-DOM zum Verankern, und river.config.json hat
       ohnehin keine features[] mehr an den Wegpunkten (s. Dateikopf). */
    waypoints: [],
  };
  return buildRiverGeometry({ w: designWidth, h: zoneH }, new Map(), minimalCfg, 0, sortedNodes);
}

export interface RiverFromSnapshotProps {
  verlauf: FlussVerlauf;
}

export function RiverFromSnapshot({ verlauf }: RiverFromSnapshotProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const revealRectRef = useRef<SVGRectElement>(null);
  const clipId = `river-snap-reveal-${useId().replace(/:/g, "")}`;
  const shadowClipId = `river-snap-shadow-${useId().replace(/:/g, "")}`;

  const designWidth = verlauf.meta.designWidth ?? RIVER_DESIGN_WIDTH_PX;
  const geometry = useMemo(
    () => buildGeometryFromVerlauf(verlauf, designWidth),
    [verlauf, designWidth],
  );

  const anim = verlauf.anim;
  const breath = useMemo(
    () => ({ periodS: pick(anim, "breathPeriodS"), waveCount: geometry.waves.length }),
    [anim, geometry.waves.length],
  );
  const sparkle = useMemo(
    () => ({
      mode: pick(anim, "sparkleMode"),
      perTrail: pick(anim, "sparklePerTrail"),
      trailDurS: pick(anim, "sparkleTrailDurS"),
      flashS: pick(anim, "sparkleFlashS"),
    }),
    [anim],
  );
  const foam = useMemo(
    () => ({
      count: pick(anim, "foamCount"),
      leadPx: pick(anim, "foamLeadPx"),
      speed: pick(anim, "foamSpeed"),
      sizeK: pick(anim, "foamSizeK"),
      jitterPx: pick(anim, "foamJitterPx"),
      mistCount: pick(anim, "mistCount"),
      mistSizePx: pick(anim, "mistSizePx"),
      mistOpacity: pick(anim, "mistOpacity"),
      mistSpeed: pick(anim, "mistSpeed"),
      mistBlurPx: pick(anim, "mistBlurPx"),
    }),
    [anim],
  );

  /* Kopf-Anteil (Ferne-Perspektive) direkt aus der Geometrie ableiten (statt
     aus window.innerHeight wie RiverFlow.tsx): der oberste Knoten trägt schon
     die tatsächliche Ausdehnung des eingefrorenen/rekonstruierten Pfads –
     robuster als eine Viewport-Annahme, die zum Speicherzeitpunkt evtl. eine
     andere war. */
  const zoneHDesign = Math.max(verlauf.meta.zoneHDesign, 1);
  const topNodeY = geometry.nodes?.[0]?.y ?? 0;
  const topDesign = Math.max(0, -topNodeY);
  const totalDesignH = zoneHDesign + topDesign;
  const riverStartY = geometry.nodes?.[0]?.y ?? -topDesign;

  const [zoneW, setZoneW] = useState(0);
  const [inView, setInView] = useState(false);
  const revealY = useMotionValue(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  /* Eigene Zonenbreite messen (für die responsive Spalten-Skalierung) – hängt
     NUR am eigenen Element, kein Host-Bezug. */
  useEffect(() => {
    const zoneEl = zoneRef.current;
    if (!zoneEl) return;
    const measure = () => setZoneW(zoneEl.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(zoneEl);
    return () => ro.disconnect();
  }, []);

  /* Sichtbarkeit der Zone: pausiert die Wellen-Atmung außerhalb des
     Viewports (RiverWaves.paused) – exakt wie RiverFlow.tsx. */
  useEffect(() => {
    const zoneEl = zoneRef.current;
    if (!zoneEl) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    io.observe(zoneEl);
    return () => io.disconnect();
  }, []);

  const scale = columnScale(zoneW, designWidth) || 1;
  const zoneHPx = zoneHDesign * scale;
  const topPx = topDesign * scale;

  /* Reveal-Scroll: useScroll(target) hängt nur an der Position DIESES
     Elements zum Viewport – kein Host-DOM nötig, identische Mechanik wie
     RiverFlow.tsx (dort dieselbe Herleitung, dort aber gegen Host-Content
     gemessen). */
  const { scrollYProgress } = useScroll({ target: zoneRef, offset: REVEAL_OFFSET });
  const spring = useSpring(scrollYProgress, REVEAL_SPRING);

  useMotionValueEvent(spring, "change", (v) => {
    if (prefersReducedMotion) return;
    const h = v * totalDesignH;
    revealRectRef.current?.setAttribute("height", String(h));
    revealY.set(h - topDesign);
  });

  /* Nachzieh-Effekt (gleiches Muster wie RiverFlow.tsx): hält Rect + revealY
     synchron, auch ohne auf das nächste Scroll-"change"-Event zu warten. */
  useEffect(() => {
    const h = prefersReducedMotion ? totalDesignH : spring.get() * totalDesignH;
    revealRectRef.current?.setAttribute("height", String(h));
    revealY.set(h - topDesign);
  });

  return (
    <div ref={zoneRef} className="river-zone" style={{ height: zoneHPx }}>
      {zoneW > 0 && (
        <svg
          className="river-svg"
          style={{ top: -topPx, height: `calc(100% + ${topPx}px)` }}
          viewBox={`0 ${(-topDesign).toFixed(1)} ${designWidth} ${totalDesignH.toFixed(1)}`}
          preserveAspectRatio="xMidYMin meet"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                ref={revealRectRef}
                x={0}
                y={(-topDesign).toFixed(1)}
                width={designWidth}
                height={0}
              />
            </clipPath>
            <clipPath id={shadowClipId}>
              <path d={geometry.bankD} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {geometry.sandD && <path d={geometry.sandD} fill="var(--bank-500)" />}
            <path d={geometry.bankD} fill="var(--water-800)" />
            <RiverWaves geometry={geometry} breath={breath} sparkle={sparkle} paused={!inView} />
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
            <RiverFeatures
              geometry={geometry}
              revealY={revealY}
              riverStartY={riverStartY}
              foam={foam}
            />
          </g>
        </svg>
      )}
    </div>
  );
}
