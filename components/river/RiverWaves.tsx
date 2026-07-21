"use client";

/*
 * RiverWaves – rendert die Wellen-Atmung + den Glitzer aus einer fertigen
 * RiverGeometry (WP3). Zentralpfad/Sandufer/Wasser-Schatten rendert bereits
 * RiverFlow selbst (Basis-Elemente 1+2); hier kommen die waveCount
 * übereinanderliegenden Wellen-Ebenen (Farben --water-700..--water-300,
 * dunkel unten/hinten → hell oben/vorn wie im Referenzprototyp
 * flie_ender_vektorfluss_scroll_story.html) sowie die Sparkle-Partikel
 * (sparkle.mode "dezent": Wassertropfen-Punkte per SMIL <animateMotion>
 * entlang der Zentrallinie) hinzu.
 *
 * Wellen-Atmung: JS-Morph statt CSS `d: path()` (kein CSS-@property-Support
 * für animierbare Pfad-Werte über alle Zielbrowser hinweg nötig) – ein
 * dt-geclampter rAF-Loop lerpt pro Frame zwischen den strukturgleichen
 * Pfaden waves[i].a/.b (lerpPath, riverPath.ts) und schreibt das Ergebnis
 * per direktem `setAttribute("d", …)` auf die <path>-Refs. KEIN React-State
 * im Loop (Performance) – nur die drei Steuer-Effekte (Geometrie-Wechsel,
 * reduced-motion-Erkennung, Loop-Start/Stop) laufen über React.
 *
 * paused (von RiverFlow aus dessen IntersectionObserver gereicht) hält die
 * Wellen UND die SMIL-Partikel an: rAF wird gecancelt und zusätzlich
 * SVGSVGElement.pauseAnimations() auf der Fluss-<svg> aufgerufen (über
 * ownerSVGElement vom eigenen <g> aus erreichbar) – sonst liefen die
 * animateMotion-Partikel unsichtbar außerhalb des Viewports weiter.
 *
 * prefers-reduced-motion wird hier selbst per matchMedia erkannt (kein Prop
 * von RiverFlow): friert die Wellen auf den Mittelframe (t=0.5) ein und
 * rendert gar keine Partikel (keine <animateMotion>-Elemente im DOM).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { lerpPath, parsePath } from "./riverPath";
import type { ParsedPath, RiverWavesProps } from "./river-types";

/* Wellenfarben dunkel→hell, DOM-Reihenfolge = Zeichenreihenfolge (spätere
   Wellen liegen über den früheren) – exakt die Farbstaffelung des
   Referenzprototyps (wave-1 … wave-5 → --water-700 … --water-300). */
const WAVE_COLOR_TOKENS = [
  "var(--water-700)",
  "var(--water-600)",
  "var(--water-500)",
  "var(--water-400)",
  "var(--water-300)",
];

/* rAF-dt-Clamp: verhindert Sprünge nach Tab-Wechsel/Ruckeln (> 1 Frame bei
   30fps wird auf einen Frame gedeckelt statt die Wellen "nachspringen" zu
   lassen). */
const RAF_DT_CLAMP_S = 1 / 30;

/* Mittelframe, auf den die Wellen bei prefers-reduced-motion einfrieren
   (statt am Rand a/b=t 0/1 stehen zu bleiben – t=0.5 sieht in jeder Wellen-
   Phase neutral/"in Bewegung erstarrt" aus, nicht wie ein Extremzustand). */
const REDUCED_MOTION_T = 0.5;

/* Sparkle (Modus "dezent"): drei seitlich versetzte Spuren um die
   Zentrallinie, Puls-Zyklus fest 10s wie im Referenzprototyp (nur das
   Sichtbarkeitsfenster innerhalb des Zyklus ist über sparkle.flashS
   konfigurierbar). Andere sparkle.mode-Werte ("linien"/"magisch"/"aus")
   sind hier (noch) nicht umgesetzt – WP3 deckt nur den Kundenwert "dezent"
   aus river.config.json ab. */
const SPARKLE_LANE_OFFSETS_PX = [-22, 0, 22];
const SPARKLE_PULSE_CYCLE_S = 10;
const SPARKLE_RADIUS_MIN_PX = 1.5;
const SPARKLE_RADIUS_RANGE_PX = 1.5;
const SPARKLE_TRAIL_STAGGER_S = 4;
const SPARKLE_FILL = "#fff";
const SPARKLE_PULSE_VALUES = "0;0.8;0;0";

/** Deterministischer PRNG (mulberry32) – Partikel-Look (Radius, Puls-Versatz)
 *  bleibt über Re-Renders stabil, ohne Math.random() zu nutzen. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SparkleParticle {
  r: number;
  pulseOffsetS: number;
}

/** Ein Partikel je (Spur, Index) – Seed aus beiden Werten, damit jede Spur
 *  ihre eigene, aber deterministische Streuung bekommt. */
function buildSparkleParticle(laneIndex: number, index: number): SparkleParticle {
  const rand = mulberry32(laneIndex * 1000 + index + 1);
  return {
    r: SPARKLE_RADIUS_MIN_PX + rand() * SPARKLE_RADIUS_RANGE_PX,
    pulseOffsetS: rand() * SPARKLE_PULSE_CYCLE_S,
  };
}

function formatKeyTime(n: number): string {
  return n.toFixed(4);
}

export function RiverWaves({ geometry, breath, sparkle, paused }: RiverWavesProps) {
  const clipId = `river-waves-clip-${useId().replace(/:/g, "")}`;

  /* Wrapper-<g> für Wellen + Sparkle: liefert über .ownerSVGElement Zugriff
     auf die äußere Fluss-<svg> (pauseAnimations/unpauseAnimations, siehe
     Dateikopf). */
  const svgRootRef = useRef<SVGGElement>(null);
  const wavePathRefs = useRef<(SVGPathElement | null)[]>([]);
  const parsedWavesRef = useRef<{ a: ParsedPath; b: ParsedPath }[]>([]);
  const phaseRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const [reducedMotion, setReducedMotion] = useState(false);

  /* Schreibt einen Wellen-Frame (t: 0..1) direkt per setAttribute auf alle
     Wellen-Pfade – KEIN React-State, wird sowohl vom rAF-Loop als auch von
     den Steuer-Effekten (Geometrie-Wechsel/reduced-motion) aufgerufen. */
  const applyFrame = useCallback((t: number) => {
    const parsedWaves = parsedWavesRef.current;
    for (let i = 0; i < parsedWaves.length; i++) {
      const pathEl = wavePathRefs.current[i];
      if (!pathEl) continue;
      pathEl.setAttribute("d", lerpPath(parsedWaves[i].a, parsedWaves[i].b, t));
    }
  }, []);

  /* prefers-reduced-motion: einmal beim Mount lesen + auf Laufzeit-Wechsel
     reagieren (gleiches Muster wie RiverFlow.usePrefersReducedMotion). */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* Geometrie-Wechsel (Mount + Resize-Rebuild von RiverFlow): jede Welle
     GENAU EINMAL neu parsen, dann sofort den passenden Frame anwenden
     (aktuelle Phase bzw. den reduced-motion-Mittelframe) – verhindert einen
     Flackerframe mit veralteter/falscher Pfad-Struktur. Kein Leak: nur
     Ref-Überschreibung, keine Subscriptions. */
  useEffect(() => {
    parsedWavesRef.current = geometry.waves.map((wave) => ({
      a: parsePath(wave.a),
      b: parsePath(wave.b),
    }));
    if (reducedMotion) {
      applyFrame(REDUCED_MOTION_T);
    } else {
      const t = 0.5 - 0.5 * Math.cos(Math.PI * (phaseRef.current % 2));
      applyFrame(t);
    }
  }, [geometry, reducedMotion, applyFrame]);

  /* rAF-Loop: Start/Stop hängt an paused + reducedMotion. */
  useEffect(() => {
    if (reducedMotion) {
      /* Mittelframe ist bereits über den Geometrie-Effekt gesetzt – kein
         Loop, keine SMIL-Steuerung nötig (es existieren keine Partikel). */
      return;
    }

    if (paused) {
      rafRef.current !== null && cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      svgRootRef.current?.ownerSVGElement?.pauseAnimations();
      return;
    }

    svgRootRef.current?.ownerSVGElement?.unpauseAnimations();
    lastTimeRef.current = null;

    function tick(now: number) {
      const last = lastTimeRef.current;
      const dtRaw = last === null ? 0 : (now - last) / 1000;
      const dt = Math.min(dtRaw, RAF_DT_CLAMP_S);
      lastTimeRef.current = now;

      phaseRef.current += dt / breath.periodS;
      const t = 0.5 - 0.5 * Math.cos(Math.PI * (phaseRef.current % 2));
      applyFrame(t);

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [paused, reducedMotion, breath.periodS, applyFrame]);

  /* Puls-Fenster für den Glitzer-Aufblitzer: fixer 10s-Zyklus (wie im
     Referenzprototyp), Sichtbarkeitsdauer aus sparkle.flashS als Anteil
     davon – 0 → 0.8 → 0 innerhalb der ersten flashS Sekunden, danach dunkel
     bis zum Zyklusende. */
  const pulseKeyTimes = useMemo(() => {
    const flashFraction = Math.min(Math.max(sparkle.flashS / SPARKLE_PULSE_CYCLE_S, 0), 1);
    const half = flashFraction / 2;
    return `0;${formatKeyTime(half)};${formatKeyTime(flashFraction)};1`;
  }, [sparkle.flashS]);

  const showSparkles = !reducedMotion && sparkle.mode === "dezent" && sparkle.perTrail > 0;

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={geometry.bankD} />
        </clipPath>
      </defs>
      <g ref={svgRootRef} clipPath={`url(#${clipId})`}>
        {geometry.waves.map((wave, i) => (
          <path
            key={i}
            ref={(el) => {
              wavePathRefs.current[i] = el;
            }}
            d={wave.a}
            fill={WAVE_COLOR_TOKENS[Math.min(i, WAVE_COLOR_TOKENS.length - 1)]}
          />
        ))}

        {showSparkles &&
          SPARKLE_LANE_OFFSETS_PX.map((offsetPx, laneIndex) => {
            const trailDurS = sparkle.trailDurS + laneIndex * SPARKLE_TRAIL_STAGGER_S;
            return (
              <g key={laneIndex} transform={`translate(${offsetPx} 0)`}>
                {Array.from({ length: sparkle.perTrail }, (_, i) => {
                  const { r, pulseOffsetS } = buildSparkleParticle(laneIndex, i);
                  const motionBeginS = -(trailDurS / sparkle.perTrail) * i;
                  return (
                    <circle key={i} r={r} fill={SPARKLE_FILL}>
                      <animateMotion
                        path={geometry.centerD}
                        dur={`${trailDurS}s`}
                        begin={`${motionBeginS}s`}
                        repeatCount="indefinite"
                      />
                      <animate
                        attributeName="opacity"
                        values={SPARKLE_PULSE_VALUES}
                        keyTimes={pulseKeyTimes}
                        dur={`${SPARKLE_PULSE_CYCLE_S}s`}
                        begin={`-${pulseOffsetS}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  );
                })}
              </g>
            );
          })}
      </g>
    </>
  );
}
