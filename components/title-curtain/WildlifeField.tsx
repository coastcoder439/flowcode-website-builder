"use client";

/*
 * WildlifeField – ein einzelnes Tier-Sprite (Reh ODER Hase) als echtes
 * DOM/SVG-Geschwisterelement in der Vorhang-Ebenen-Kette.
 *
 * Kern-Trick (Kundenwunsch: "mal sichtbar, mal nicht" zwischen den
 * Baum-Ebenen): TitleCurtain hängt EIN Reh-Element zwischen ebene-2 und
 * ebene-1 und EIN Hase-Element nach ebene-1 in dieselbe .tc-overlay-
 * Stacking-Reihenfolge ein (alle .tc-plane/.tc-wildlife auf z-index 1 –
 * die Tiefe kommt rein aus der DOM-Reihenfolge, exakt wie die Baum-Ebenen
 * selbst). Ein Reh, das dort steht, verschwindet automatisch hinter den
 * vorderen Baum-Sprites (ebene-1) und taucht in deren Lücken wieder auf.
 * Deshalb bewusst DOM/SVG statt Canvas (Gegenteil von Gras/Fauna/Sonne) –
 * der Effekt lebt davon, ein echtes Geschwisterelement der Baum-Ebenen zu
 * sein, das könnte ein eigener Canvas-Layer nicht leisten.
 *
 * - Reh (Slot zwischen ebene-2/ebene-1): hoppelt in einem Rutsch von einer
 *   Bildseite zur anderen (9–14s), Parabel-Sprünge (|sin|), leichte
 *   Rotation, drei einfache Bein-Path-Segmente mit Laufphase. Richtung
 *   wechselt zwischen Auftritten.
 * - Hase (Slot nach ebene-1, ganz vorn): kurze Hop-Serien (3–5 Hops),
 *   dazwischen Sitz-Pausen (1.5–4s, Ohren auf, Atem-Puls), verlässt nach
 *   ein paar Zyklen das Bild.
 * - Seltenheit: beide sind Events mit geseedeten Pausen (14–30s) zwischen
 *   Auftritten, erste Auftritte gestaffelt versetzt (Reh 6–10s, Hase
 *   14–20s nach Mount) – nie exakt gleichzeitig.
 * - Scroll: ab progress > SPAWN_CUTOFF starten keine neuen Auftritte mehr,
 *   ein laufendes Tier läuft zügig aus dem Bild; darunter läuft das
 *   Spawning wieder an.
 * - Technik: ein rAF, dt-integriert, direktes style.transform (kein
 *   motion – WAAPI/ViewTimeline-Falle, siehe TitleCurtain-Kommentar),
 *   mulberry32-Seed, IntersectionObserver-Pause, prefers-reduced-motion
 *   → Komponente rendert nichts.
 */

import { useEffect, useRef } from "react";
import { useMotionValueEvent, type MotionValue } from "motion/react";

function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEER_BODY = "#143021";
const DEER_LIGHT = "#2C5234";
const RABBIT_BODY = "#143021";
const RABBIT_LIGHT = "#2C5234";

/* Deckungsgleich mit der SVG-viewBox je Variante (Breite/Höhe), damit die
   Sprite-Box ohne Verzerrung skaliert. */
const DEER_ASPECT = 140 / 100;
const RABBIT_ASPECT = 60 / 58;

/* Ab diesem Scroll-Fortschritt: keine neuen Auftritte mehr, laufende Tiere
   blenden zügig aus. openEnd liegt bei 0.56 (curtain.config.json) – 0.3
   liegt sicher innerhalb der geschlossenen Waldbühne, weit vor Dissolve. */
const SPAWN_CUTOFF = 0.3;

type Variant = "reh" | "hase";

export interface WildlifeFieldProps {
  variant: Variant;
  /** Scroll-Fortschritt des Vorhangs (0…1) – gattert neue Auftritte. */
  progress: MotionValue<number>;
}

/* ------------------------------------------------------------------ */
/* Reh – Laufphase in einem Rutsch über die volle Breite                */
/* ------------------------------------------------------------------ */

interface DeerRuntime {
  phase: "waiting" | "running" | "exiting";
  nextSpawnAt: number;
  lastDir: 1 | -1 | 0;
  dir: 1 | -1;
  runStartT: number;
  travelDuration: number;
  hopFreq: number;
  hopAmp: number;
  x: number;
  rushTriggered: boolean;
  exitFromX: number;
  exitToX: number;
  exitStartT: number;
}

function createDeerRuntime(rng: () => number): DeerRuntime {
  return {
    phase: "waiting",
    nextSpawnAt: 6 + rng() * 4, // 6–10s nach Mount
    lastDir: 0,
    dir: 1,
    runStartT: 0,
    travelDuration: 10,
    hopFreq: 2.1,
    hopAmp: 16,
    x: 0,
    rushTriggered: false,
    exitFromX: 0,
    exitToX: 0,
    exitStartT: 0,
  };
}

function startDeerRun(
  r: DeerRuntime,
  rng: () => number,
  t: number,
  width: number,
  spriteWidthPx: number,
) {
  r.dir = r.lastDir === 1 ? -1 : r.lastDir === -1 ? 1 : rng() < 0.5 ? 1 : -1;
  r.lastDir = r.dir;
  r.runStartT = t;
  r.travelDuration = 9 + rng() * 5; // 9–14s
  r.hopFreq = 1.9 + rng() * 0.6;
  r.hopAmp = 13 + rng() * 8;
  r.rushTriggered = false;
  const margin = spriteWidthPx + 16;
  const from = r.dir === 1 ? -margin : width + margin;
  const to = r.dir === 1 ? width + margin : -margin;
  r.exitFromX = from;
  r.exitToX = to;
  r.x = from;
  r.phase = "running";
}

function updateDeer(
  r: DeerRuntime,
  rng: () => number,
  dt: number,
  t: number,
  width: number,
  spriteWidthPx: number,
  pastCutoff: boolean,
  apply: (x: number, hopPhase: number, dir: 1 | -1, visible: boolean) => void,
) {
  if (r.phase === "waiting") {
    apply(r.x, 0, r.dir, false);
    if (!pastCutoff && t >= r.nextSpawnAt) {
      startDeerRun(r, rng, t, width, spriteWidthPx);
    }
    return;
  }

  if (r.phase === "running") {
    if (pastCutoff && !r.rushTriggered) {
      r.rushTriggered = true;
      r.exitFromX = r.x;
      r.exitStartT = t;
      r.phase = "exiting";
    } else {
      const raw = Math.min((t - r.runStartT) / r.travelDuration, 1);
      r.x = r.exitFromX + (r.exitToX - r.exitFromX) * raw;
      const hopPhase = raw * r.travelDuration * r.hopFreq * Math.PI * 2;
      apply(r.x, hopPhase, r.dir, true);
      if (raw >= 1) {
        r.phase = "waiting";
        r.nextSpawnAt = t + 14 + rng() * 16; // 14–30s Pause
      }
      return;
    }
  }

  // exiting: zügig aus dem Bild, dt-integriert auf konstante Restdauer
  const EXIT_DURATION = 1.1;
  const raw = Math.min((t - r.exitStartT) / EXIT_DURATION, 1);
  r.x = r.exitFromX + (r.exitToX - r.exitFromX) * raw;
  const hopPhase = raw * EXIT_DURATION * (r.hopFreq * 1.4) * Math.PI * 2;
  apply(r.x, hopPhase, r.dir, true);
  if (raw >= 1) {
    r.phase = "waiting";
    r.nextSpawnAt = t + 14 + rng() * 16;
  }
}

/* ------------------------------------------------------------------ */
/* Hase – Hop-Serien mit Sitz-Pausen, verlässt am Ende das Bild         */
/* ------------------------------------------------------------------ */

interface RabbitRuntime {
  phase: "waiting" | "active";
  sub: "hop" | "sit";
  nextSpawnAt: number;
  dir: 1 | -1;
  x: number;
  hopPhase: number;
  hopsTarget: number;
  hopSpeed: number;
  sitUntil: number;
  burstsRemaining: number;
  finalExit: boolean;
  rushTriggered: boolean;
}

function createRabbitRuntime(rng: () => number): RabbitRuntime {
  return {
    phase: "waiting",
    sub: "hop",
    nextSpawnAt: 14 + rng() * 6, // 14–20s nach Mount
    dir: 1,
    x: 0,
    hopPhase: 0,
    hopsTarget: 4,
    hopSpeed: 60,
    sitUntil: 0,
    burstsRemaining: 2,
    finalExit: false,
    rushTriggered: false,
  };
}

function startRabbitRun(
  r: RabbitRuntime,
  rng: () => number,
  width: number,
  spriteWidthPx: number,
) {
  r.dir = rng() < 0.5 ? 1 : -1;
  const margin = spriteWidthPx + 10;
  r.x = r.dir === 1 ? -margin : width + margin;
  r.burstsRemaining = 2 + Math.floor(rng() * 3); // 2–4 Hop-Sitz-Zyklen
  r.sub = "hop";
  r.hopPhase = 0;
  r.hopsTarget = 3 + Math.floor(rng() * 3); // 3–5 Hops
  r.hopSpeed = 46 + rng() * 22;
  r.finalExit = false;
  r.rushTriggered = false;
  r.phase = "active";
}

function updateRabbit(
  r: RabbitRuntime,
  rng: () => number,
  dt: number,
  t: number,
  width: number,
  spriteWidthPx: number,
  pastCutoff: boolean,
  apply: (
    x: number,
    hopPhase: number,
    dir: 1 | -1,
    sub: "hop" | "sit",
    visible: boolean,
  ) => void,
) {
  if (r.phase === "waiting") {
    apply(r.x, 0, r.dir, "sit", false);
    if (!pastCutoff && t >= r.nextSpawnAt) {
      startRabbitRun(r, rng, width, spriteWidthPx);
    }
    return;
  }

  if (pastCutoff && !r.rushTriggered) {
    r.rushTriggered = true;
    r.finalExit = true;
    r.sub = "hop";
    r.hopPhase = 0;
  }
  const speedMult = r.rushTriggered ? 2.4 : 1;

  if (r.sub === "sit") {
    apply(r.x, 0, r.dir, "sit", true);
    if (t >= r.sitUntil) {
      r.burstsRemaining -= 1;
      r.sub = "hop";
      r.hopPhase = 0;
      if (r.burstsRemaining <= 0) {
        r.finalExit = true;
      } else {
        r.hopsTarget = 3 + Math.floor(rng() * 3);
      }
    }
    return;
  }

  // sub === "hop"
  r.hopPhase += dt * 2.6 * Math.PI * 2;
  r.x += r.dir * r.hopSpeed * speedMult * dt;
  apply(r.x, r.hopPhase, r.dir, "hop", true);

  const margin = spriteWidthPx + 10;
  const offscreen = r.dir === 1 ? r.x > width + margin : r.x < -margin;
  if (r.finalExit) {
    if (offscreen) {
      r.phase = "waiting";
      r.nextSpawnAt = t + 14 + rng() * 16;
    }
    return;
  }
  const hopsDone = Math.floor(r.hopPhase / (Math.PI * 2));
  if (hopsDone >= r.hopsTarget) {
    r.sub = "sit";
    r.sitUntil = t + 1.5 + rng() * 2.5;
  }
}

/* ------------------------------------------------------------------ */
/* Komponente                                                          */
/* ------------------------------------------------------------------ */

export function WildlifeField({ variant, progress }: WildlifeFieldProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const legRefs = useRef<(SVGGraphicsElement | null)[]>([]);
  const earRefs = useRef<(SVGGElement | null)[]>([]);
  const bodyRef = useRef<SVGGElement | null>(null);
  const progressRef = useRef(0);

  useMotionValueEvent(progress, "change", (v) => {
    progressRef.current = v;
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const sprite = spriteRef.current;
    if (!wrap || !sprite) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return; // kein Auftritt, keine Loop – Tier bleibt unsichtbar

    progressRef.current = progress.get();

    let width = 0;
    let height = 0;
    let raf = 0;
    let running = true;
    let lastNow = performance.now();
    const t0 = lastNow;
    let visible = false;

    const layoutRng = makeRng(variant === "reh" ? 71301 : 51907);
    const size =
      variant === "reh" ? 90 + layoutRng() * 40 : 34 + layoutRng() * 14;
    const footlinePct =
      variant === "reh" ? 0.78 + layoutRng() * 0.08 : 0.92 + layoutRng() * 0.04;
    const aspect = variant === "reh" ? DEER_ASPECT : RABBIT_ASPECT;
    const spriteWidthPx = size * aspect;

    sprite.style.height = `${size}px`;
    sprite.style.width = `${spriteWidthPx}px`;

    const runtimeRng = makeRng((variant === "reh" ? 71301 : 51907) ^ 0x9e3779b9);
    const deer = variant === "reh" ? createDeerRuntime(runtimeRng) : null;
    const rabbit = variant === "hase" ? createRabbitRuntime(runtimeRng) : null;

    const setVisible = (next: boolean) => {
      if (next === visible) return;
      visible = next;
      sprite.style.opacity = next ? "1" : "0";
    };

    const applyLegs = (hopPhase: number, dir: 1 | -1) => {
      for (let i = 0; i < legRefs.current.length; i++) {
        const leg = legRefs.current[i];
        if (!leg) continue;
        const offset = (i * Math.PI) / 1.5;
        const swing = Math.sin(hopPhase + offset) * 16 * dir;
        leg.style.transform = `rotate(${swing}deg)`;
      }
    };

    const applyDeerFrame = (
      x: number,
      hopPhase: number,
      dir: 1 | -1,
      isVisible: boolean,
    ) => {
      setVisible(isVisible);
      if (!isVisible) return;
      const hopAmp = deer?.hopAmp ?? 16;
      const hopY = -Math.abs(Math.sin(hopPhase)) * hopAmp;
      const footlineY = height * footlinePct;
      const rot = Math.sin(hopPhase) * 4;
      sprite.style.transform = `translate3d(${x}px, ${footlineY - size + hopY}px, 0) rotate(${rot}deg) scaleX(${dir})`;
      applyLegs(hopPhase, dir);
    };

    const applyRabbitFrame = (
      x: number,
      hopPhase: number,
      dir: 1 | -1,
      sub: "hop" | "sit",
      isVisible: boolean,
      t: number,
    ) => {
      setVisible(isVisible);
      if (!isVisible) return;
      const footlineY = height * footlinePct;
      const hopY = sub === "hop" ? -Math.abs(Math.sin(hopPhase)) * 9 : 0;
      const rot = sub === "hop" ? Math.sin(hopPhase) * 6 : 0;
      sprite.style.transform = `translate3d(${x}px, ${footlineY - size + hopY}px, 0) rotate(${rot}deg) scaleX(${dir})`;
      if (bodyRef.current) {
        const scale = sub === "sit" ? 1 + Math.sin(t * 2.4) * 0.028 : 1;
        bodyRef.current.style.transform = `scale(${scale})`;
      }
      for (const ear of earRefs.current) {
        if (!ear) continue;
        const tilt =
          sub === "hop"
            ? -14 + Math.sin(hopPhase * 0.5) * 3
            : Math.sin(t * 1.7) * 2.5;
        ear.style.transform = `rotate(${tilt}deg)`;
      }
      if (sub === "hop") applyLegs(hopPhase, dir);
    };

    const rebuild = () => {
      const rect = wrap.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
    };

    const draw = (now: number) => {
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;
      const t = (now - t0) / 1000;
      const pastCutoff = progressRef.current > SPAWN_CUTOFF;

      if (deer) {
        updateDeer(
          deer,
          runtimeRng,
          dt,
          t,
          width,
          spriteWidthPx,
          pastCutoff,
          (x, hopPhase, dir, isVisible) => applyDeerFrame(x, hopPhase, dir, isVisible),
        );
      } else if (rabbit) {
        updateRabbit(
          rabbit,
          runtimeRng,
          dt,
          t,
          width,
          spriteWidthPx,
          pastCutoff,
          (x, hopPhase, dir, sub, isVisible) =>
            applyRabbitFrame(x, hopPhase, dir, sub, isVisible, t),
        );
      }

      if (running) raf = requestAnimationFrame(draw);
    };

    const loop = (now: number) => draw(now);

    rebuild();
    const ro = new ResizeObserver(rebuild);
    ro.observe(wrap);

    const io = new IntersectionObserver(([entry]) => {
      const isVisible = entry?.isIntersecting ?? true;
      if (isVisible && !running) {
        running = true;
        lastNow = performance.now();
        raf = requestAnimationFrame(loop);
      } else if (!isVisible && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(wrap);

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [variant, progress]);

  return (
    <div
      ref={wrapRef}
      className={`tc-wildlife tc-wildlife--${variant}`}
      aria-hidden="true"
    >
      <div ref={spriteRef} className="tc-wildlife__sprite">
        {variant === "reh" ? (
          <svg
            viewBox="0 0 140 100"
            className="tc-wildlife__svg"
            preserveAspectRatio="xMidYMax meet"
          >
            <g className="tc-wildlife__legs">
              <path
                ref={(el) => {
                  legRefs.current[0] = el;
                }}
                className="tc-wildlife__leg tc-wildlife__leg--reh"
                d="M50 62 L45 94"
                stroke={DEER_BODY}
                style={{ transformOrigin: "50px 62px" }}
              />
              <path
                ref={(el) => {
                  legRefs.current[1] = el;
                }}
                className="tc-wildlife__leg tc-wildlife__leg--reh"
                d="M66 64 L69 96"
                stroke={DEER_BODY}
                style={{ transformOrigin: "66px 64px" }}
              />
              <path
                ref={(el) => {
                  legRefs.current[2] = el;
                }}
                className="tc-wildlife__leg tc-wildlife__leg--reh"
                d="M86 60 L91 92"
                stroke={DEER_BODY}
                style={{ transformOrigin: "86px 60px" }}
              />
            </g>
            <ellipse cx="36" cy="50" rx="9" ry="7" fill={DEER_LIGHT} />
            <ellipse cx="64" cy="54" rx="34" ry="19" fill={DEER_BODY} />
            <path
              d="M84 42 Q98 18 110 14 L119 22 Q104 28 94 48 Z"
              fill={DEER_BODY}
            />
            <ellipse cx="115" cy="20" rx="13" ry="9.5" fill={DEER_BODY} />
            <ellipse cx="127" cy="23" rx="6" ry="5" fill={DEER_BODY} />
            <path d="M106 12 L100 -1 L112 9 Z" fill={DEER_BODY} />
            <path d="M119 9 L124 -3 L128 8 Z" fill={DEER_BODY} />
          </svg>
        ) : (
          <svg
            viewBox="0 0 60 58"
            className="tc-wildlife__svg"
            preserveAspectRatio="xMidYMax meet"
          >
            <g
              ref={(el) => {
                legRefs.current[0] = el;
              }}
              className="tc-wildlife__leg tc-wildlife__leg--hase"
              style={{ transformOrigin: "18px 46px" }}
            >
              <path d="M10 46 Q17 38 26 46 L23 56 L12 56 Z" fill={RABBIT_BODY} />
            </g>
            <g
              ref={(el) => {
                bodyRef.current = el;
              }}
              style={{ transformOrigin: "26px 40px" }}
            >
              <ellipse cx="10" cy="42" rx="3" ry="2.6" fill={RABBIT_LIGHT} />
              <ellipse cx="26" cy="40" rx="15" ry="11" fill={RABBIT_BODY} />
              <circle cx="44" cy="30" r="9" fill={RABBIT_BODY} />
              <ellipse cx="52" cy="32" rx="3.4" ry="2.8" fill={RABBIT_BODY} />
              <g
                ref={(el) => {
                  earRefs.current[0] = el;
                }}
                style={{ transformOrigin: "40px 24px" }}
              >
                <path
                  d="M38 25 Q34 12 37 3 Q41 12 41 25 Z"
                  fill={RABBIT_BODY}
                />
              </g>
              <g
                ref={(el) => {
                  earRefs.current[1] = el;
                }}
                style={{ transformOrigin: "48px 24px" }}
              >
                <path
                  d="M46 25 Q48 11 52 2 Q54 12 49 25 Z"
                  fill={RABBIT_BODY}
                />
              </g>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
}
