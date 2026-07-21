"use client";

/*
 * RiverBirth – der fallende Logo-Tropfen am Ende des Vorhang-Effekts
 * (TitleCurtain). Ablauf laut BirthPhases:
 *
 *   crossfade – das weiße Logo blendet aus, an seiner Stelle steht der
 *               Tropfen mit EXAKT der Logo-Silhouette (logo-drop-path.ts,
 *               generiert via scripts/trace-logo.mjs); sobald das Logo
 *               verschwindet, färbt sich der Tropfen sanft blau.
 *   fall      – der Tropfen fällt zu einem HORIZONT-PUNKT (x = sourceExit,
 *               y ≈ 60% der Bühne) und wird dabei KLEINER (Tiefenwirkung:
 *               er fällt von uns weg in die Ferne), dezentes Squash&Stretch.
 *   splash    – kleiner, ferner Aufprall-Glint am Horizont (winziger Ring
 *               + drei Pixel-Funken – klein, weil weit weg).
 *
 * WICHTIG (Kundenvorgabe „es gibt nur EINEN Fluss"): Diese Komponente
 * zeichnet KEINEN Fluss und KEINEN See mehr. Der eine Fluss ist der
 * Content-Fluss (RiverFlow) – seine Master-Pfade beginnen seit dem Umbau in
 * riverPath.ts selbst mit dem Mini-See (See + Fluss + Wellen + Ufer sind
 * dieselben SVG-Pfade, ein Element). Der Tropfen schlägt hier „in der
 * Ferne" auf; beim Weiterscrollen schiebt sich der Fluss-Kopf (See) aus dem
 * Seitenfluss ins Bild.
 *
 * Koordinatensystem: Die Bühne (.tc-stage) ist sticky top:0 – solange der
 * Vorhang aktiv ist, entsprechen Viewport-Koordinaten (getBoundingClientRect)
 * also Bühnen-Koordinaten. Der eigene Wrapper (.rb-root) liegt wie .tc-overlay
 * absolut auf inset:0 in derselben Bühne.
 *
 * Technik: useScrub (siehe TitleCurtain.tsx – umgeht die WAAPI/ViewTimeline-
 * Delegation von motion bei style-gebundenen useTransform(useScroll)-Werten).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cubicBezier,
  motion,
  transform,
  useMotionValue,
  useMotionValueEvent,
  type MotionValue,
} from "motion/react";
import "./river-birth.css";
import type { RiverBirthProps } from "./river-types";
import { LOGO_DROP_IMG_SIZE, LOGO_DROP_PATH } from "./logo-drop-path";

/* ------------------------------------------------------------------ */
/* Scrub über den JS-Pfad (identisches Muster wie TitleCurtain.tsx)    */
/* ------------------------------------------------------------------ */

type Ease = (t: number) => number;

function useScrub(
  progress: MotionValue<number>,
  input: number[],
  output: (string | number)[],
  options?: { ease?: Ease | Ease[] },
) {
  const value = useMotionValue(transform(progress.get(), input, output, options));
  useMotionValueEvent(progress, "change", (v) => {
    value.set(transform(v, input, output, options));
  });
  useEffect(() => {
    value.set(transform(progress.get(), input, output, options));
  });
  return value;
}

const linear: Ease = (t) => t;
const easeIn = cubicBezier(0.55, 0, 1, 0.45); // Beschleunigung fürs Fallen

/* ------------------------------------------------------------------ */
/* Konstanten                                                          */
/* ------------------------------------------------------------------ */

/** Horizont-Höhe: wo der Tropfen "in der Ferne" aufschlägt, als Anteil der
 *  Bühnenhöhe. */
const HORIZONT_Y_PCT = 0.6;
/** Tiefen-Skalierung des Tropfens am Horizont (1 → weit weg = klein). */
const TIEFEN_SCALE = 0.25;

/** Drei Pixel-Funken des fernen Aufprall-Glints: Zielversatz in px relativ
 *  zum Horizontpunkt (klein – der Aufprall ist weit weg). */
const GLINT_FUNKEN: [number, number][] = [
  [-9, -7],
  [7, -9],
  [1, -12],
];

/* ------------------------------------------------------------------ */
/* Ein einzelner Glint-Funke (Splash-Phase, winzig)                    */
/* ------------------------------------------------------------------ */

interface GlintFunkeProps {
  progress: MotionValue<number>;
  splash: [number, number];
  ursprung: { x: number; y: number };
  ziel: [number, number];
}

function GlintFunke({ progress, splash, ursprung, ziel }: GlintFunkeProps) {
  const span = splash[1] - splash[0];
  const punkte = [splash[0], splash[0] + span * 0.55, splash[1]];
  const x = useScrub(progress, punkte, [
    ursprung.x,
    ursprung.x + ziel[0] * 0.8,
    ursprung.x + ziel[0],
  ]);
  const y = useScrub(progress, punkte, [
    ursprung.y,
    ursprung.y + ziel[1],
    ursprung.y + ziel[1] * 0.7 + 4,
  ]);
  const opacity = useScrub(progress, punkte, [0, 1, 0]);
  return <motion.circle className="rb-glint-funke" r={1.4} style={{ x, y, opacity }} />;
}

/* ------------------------------------------------------------------ */
/* RiverBirth                                                          */
/* ------------------------------------------------------------------ */

export function RiverBirth({ progress, logoRef, birth, sourceExit }: RiverBirthProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(false);

  const [stage, setStage] = useState({ w: 1440, h: 900 });
  const [origin, setOrigin] = useState({ x: 0, y: 0, size: 92 });
  const [reduced, setReduced] = useState(false);

  /* Reduced-Motion: Komponente rendert nichts (eigener, defensiver Check –
     unabhängig davon, dass TitleCurtain reduced-motion bereits über
     mode==="instant" ausschließt, siehe WildlifeField-Konvention). */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  /* Bühnengröße: eigener Wrapper liegt inset:0 auf der Bühne, seine
     Bounding-Box IST die Bühnengröße (siehe Datei-Kommentar oben). */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measureStage = () => {
      const r = wrap.getBoundingClientRect();
      setStage({ w: r.width, h: r.height });
    };
    measureStage();
    const ro = new ResizeObserver(measureStage);
    ro.observe(wrap);
    window.addEventListener("resize", measureStage);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureStage);
    };
  }, []);

  /* Ausgangsposition des Tropfens: Logo-Mitte in Bühnen-Koordinaten. Wird
     beim Phaseneintritt in crossfade gemessen (Logos eigener Scrub in
     TitleCurtain.tsx endet exakt bei birth.crossfade[0] – die Position ist
     dann bereits final) und bleibt bis zum nächsten Verlassen der Phase
     stabil (Resize-sicher: Re-Messung bei jedem erneuten Eintritt). */
  const measureOrigin = useCallback(() => {
    const wrap = wrapRef.current;
    const logo = logoRef.current;
    if (!wrap || !logo) return;
    const wrapRect = wrap.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    setOrigin({
      x: logoRect.left + logoRect.width / 2 - wrapRect.left,
      y: logoRect.top + logoRect.height / 2 - wrapRect.top,
      size: logoRect.width,
    });
  }, [logoRef]);

  useMotionValueEvent(progress, "change", (v) => {
    if (v >= birth.crossfade[0]) {
      if (!enteredRef.current) {
        enteredRef.current = true;
        measureOrigin();
      }
    } else {
      enteredRef.current = false;
    }
  });

  /* Deep-Link/Reload mitten im Scroll: beim Mount ggf. sofort messen statt
     auf das nächste Scroll-Event zu warten. */
  useEffect(() => {
    if (progress.get() >= birth.crossfade[0]) {
      enteredRef.current = true;
      measureOrigin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Horizont-Punkt: dort schlägt der Tropfen "in der Ferne" auf. */
  const horizontX = (sourceExit.xPct / 100) * stage.w;
  const horizontY = stage.h * HORIZONT_Y_PCT;

  /* ---- Tropfen: exakte Logo-Silhouette, Weiß→Blau, fällt in die Tiefe -- */
  const fallSpan = birth.fall[1] - birth.fall[0];
  const crossfadeMid = (birth.crossfade[0] + birth.crossfade[1]) / 2;

  /* Silhouetten-Skalierung: Pfad-Koordinaten leben im 512er-Bildraster des
     Logos, zentriert auf (0,0) – Faktor rechnet auf die tatsächlich
     gerenderte Logo-Breite um (Tropfen == Logo, deckungsgleich). */
  const logoScale = (origin.size || 92) / LOGO_DROP_IMG_SIZE;

  const posPoints = [birth.crossfade[0], birth.fall[0], birth.fall[1]];
  const dropX = useScrub(progress, posPoints, [origin.x, origin.x, horizontX], {
    ease: [linear, easeIn],
  });
  const dropY = useScrub(progress, posPoints, [origin.y, origin.y, horizontY], {
    ease: [linear, easeIn],
  });

  /* Tiefenwirkung: der Tropfen entfernt sich → wird kleiner (statt größer).
     Gleiche Beschleunigung wie die Position, damit Weg und Schrumpfen
     zusammen "in die Ferne" lesen. */
  const dropTiefe = useScrub(progress, [birth.fall[0], birth.fall[1]], [1, TIEFEN_SCALE], {
    ease: easeIn,
  });

  /* Scale-Puls (1→1.06→1) während crossfade ist deterministisch aus
     progress+birth berechnet – identisch zu TitleCurtains logoPulse, ohne
     dass beide Komponenten Zustand teilen müssen. Danach dezentes
     Squash&Stretch: leicht gestreckt im Fall, gestaucht kurz vor Aufprall. */
  const squashPoints = [
    birth.crossfade[0],
    crossfadeMid,
    birth.crossfade[1],
    birth.fall[0] + fallSpan * 0.35,
    birth.fall[0] + fallSpan * 0.85,
    birth.fall[1],
  ];
  const dropScaleY = useScrub(progress, squashPoints, [1, 1.06, 1, 1.1, 1.1, 0.88]);
  const dropScaleX = useScrub(progress, squashPoints, [1, 1.06, 1, 0.93, 0.93, 1.1]);

  const splashSpan = birth.splash[1] - birth.splash[0];
  const dropFadeEnd = birth.splash[0] + splashSpan * 0.3;
  const dropOpacity = useScrub(
    progress,
    [birth.crossfade[0], birth.crossfade[1], birth.fall[1], dropFadeEnd],
    [0, 1, 1, 0],
  );

  /* Farbe (Kundenvorgabe): SOBALD sich die Form zum Tropfen verändert
     (= Crossfade-Beginn, das Logo beginnt auszublenden), fängt der Tropfen
     an blau zu werden — nicht erst nach dem Crossfade. Voll blau kurz nach
     Fall-Beginn. */
  const blauEnde = birth.fall[0] + fallSpan * 0.15;
  const dropFill = useScrub(
    progress,
    [birth.crossfade[0], blauEnde],
    ["#FFFFFF", "#4395A7"],
  );
  /* Dezenter hellerer Glanzpunkt, blendet mit der Blaufärbung ein. */
  const glanzOpacity = useScrub(progress, [birth.crossfade[0], blauEnde], [0, 0.5]);

  /* ---- Aufprall-Glint: winziger Ring am Horizont (fern = klein) -------- */
  const ringPoints = [birth.splash[0], birth.splash[0] + splashSpan * 0.6, birth.splash[1]];
  const ringScale = useScrub(progress, ringPoints, [0.25, 1, 1.7]);
  const ringOpacity = useScrub(progress, ringPoints, [0.9, 0.6, 0]);

  if (reduced) return null;

  return (
    <div ref={wrapRef} className="rb-root" aria-hidden="true">
      <svg
        className="rb-svg"
        viewBox={`0 0 ${stage.w} ${stage.h}`}
        preserveAspectRatio="none"
      >
        {/* Ferner Aufprall-Glint: winziger Ring + drei Pixel-Funken */}
        <motion.circle
          className="rb-glint-ring"
          cx={horizontX}
          cy={horizontY}
          r={9}
          style={{ scale: ringScale, opacity: ringOpacity }}
        />
        {GLINT_FUNKEN.map((ziel, i) => (
          <GlintFunke
            key={i}
            progress={progress}
            splash={birth.splash}
            ursprung={{ x: horizontX, y: horizontY }}
            ziel={ziel}
          />
        ))}

        {/* Tropfen (oberste Schicht bis zum Aufprall): exakte Logo-
            Silhouette. Verschachtelte Gruppen: Position → Tiefen-Scale →
            Squash&Stretch → statische Logo-auf-Bühne-Skalierung. */}
        <motion.g style={{ x: dropX, y: dropY, opacity: dropOpacity }}>
          <motion.g style={{ scale: dropTiefe }}>
            <motion.g style={{ scaleX: dropScaleX, scaleY: dropScaleY }}>
              <g transform={`scale(${logoScale.toFixed(4)})`}>
                <motion.path
                  className="rb-drop"
                  d={LOGO_DROP_PATH}
                  style={{ fill: dropFill }}
                />
                {/* Glanzpunkt im oberen Bauch (512er-Raster des Logos) */}
                <motion.ellipse
                  className="rb-drop-glanz"
                  cx={-48}
                  cy={40}
                  rx={26}
                  ry={44}
                  transform="rotate(18 -48 40)"
                  style={{ opacity: glanzOpacity }}
                />
              </g>
            </motion.g>
          </motion.g>
        </motion.g>
      </svg>
    </div>
  );
}
