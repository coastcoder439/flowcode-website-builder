"use client";

/*
 * RiverFeatures (WP4) – "Leben am Ufer + Wasserfälle + See". Rendert:
 *  (1) Flora-Trigger (gras/baum/efeu) entlang des Ufers, die "sprossen"
 *      sobald die Reveal-Front (revealY) sie erreicht – Latch-Vergleich
 *      direkt gegen revealY, kein rAF nötig (CSS-Transition trägt die
 *      Sprout-Animation).
 *  (2) Box-Wasserfälle (kurze Kaskade über einer Content-Karte).
 *  (3) Die Felswand + der große Wasserfall im Tal (kind "cliff").
 *  (4) Den See (lakeD) am Talboden mit Ruhe-Atmung.
 *
 * Animations-Loop: EIN gemeinsamer rAF-Loop für alle Kaskaden (Gradient-
 * Lauftextur) + Opacity/Scale-"Atmung" (Schaumkronen, Splash-Pulse,
 * See-Ringe/Glanzstreifen). Direkte DOM-Schreibzugriffe über Ref-Arrays
 * statt React-State – kein Re-Render pro Frame (gleiches Muster wie die
 * direkten attribute-Schreibzugriffe in RiverFlow.tsx). Pausiert per
 * IntersectionObserver auf dem SVG-Root, komplett aus bei
 * prefers-reduced-motion (CSS übernimmt dort die statischen Endzustände).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMotionValueEvent } from "motion/react";
import { FLORA } from "../title-curtain/flora-paths";
import { parsePath } from "./riverPath";
import type {
  FeatureTrigger,
  FloraVariant,
  RiverFeaturesProps,
  Waterfall,
} from "./river-types";

/* ------------------------------------------------------------------ */
/* Deterministisches Rauschen (mulberry32) + Pfad-Bounding-Box          */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function random() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grobe Bounding-Box einer 'd'-Zeichenkette: paart alle enthaltenen Zahlen
 *  fortlaufend als (x,y) – korrekt für M/L/Q-Pfade (flora-paths verwendet
 *  ausschließlich diese Kommandos), leicht großzügig durch Q-Kontrollpunkte,
 *  aber für Icon-Skalierung ausreichend genau. */
function pathBBox(d: string): { minX: number; maxX: number; minY: number; maxY: number } {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/** Transform, das eine große flora-paths-Vorlage so skaliert, dass ihre
 *  Unterkante zentriert auf `anchorY` (lokale Koordinate) landet. */
function crownTransform(
  box: { minX: number; maxX: number; maxY: number },
  targetWidth: number,
  anchorY: number,
): { scale: number; tx: number; ty: number } {
  const width = Math.max(1, box.maxX - box.minX);
  const scale = targetWidth / width;
  const cx = (box.minX + box.maxX) / 2;
  return { scale, tx: -cx * scale, ty: anchorY - box.maxY * scale };
}

/* ------------------------------------------------------------------ */
/* Animations-Loop: Typen                                               */
/* ------------------------------------------------------------------ */

interface BreatherConfig {
  mode: "opacity" | "scale";
  min: number;
  max: number;
  periodMs: number;
  seedPhase: number;
}
interface BreatherEntry extends BreatherConfig {
  el: SVGGraphicsElement;
}
interface GradientEntry {
  el: SVGLinearGradientElement;
  tileH: number;
}

const MAX_DT_MS = 100;
const GRADIENT_SPEED_PX_PER_MS = 0.028;

/* ------------------------------------------------------------------ */
/* Schaumfront an der Reveal-Kante (Kundenwunsch "Bubble-Schaum")       */
/* ------------------------------------------------------------------ */

/* Der Schaum sitzt IMMER an der wandernden Fluss-Front (y = revealY) und
 * wird IM Fluss positioniert: die x-Kanten der Original-Kontur werden an
 * dieser Höhe ausgewertet. Wichtig: Die Gruppe lebt als GESCHWISTER der
 * geclippten Reveal-Gruppe im selben SVG (Portal-Wirt, siehe unten) – die
 * Clip-Kante würde den Schaum sonst exakt halbieren. */

const FOAM_SEED = 4242;
/** Schaumbreite ist NICHT einstellbar (Kundenvorgabe): sie ist fest an die
 *  Flussbreite gekoppelt — die Front ist immer so breit wie der Fluss, leicht
 *  überstehend (1.2), damit die Gischt über die Uferkante schlägt. */
const FOAM_SPREAD = 1.2;
/** Front muss mind. so weit (Design-px) im Fluss sein, bevor Schaum zeigt. */
const FOAM_MIN_REVEAL = 8;
/** Einblend-Strecke (Design-px) nach FOAM_MIN_REVEAL. */
const FOAM_FADE_IN_PX = 24;
/** Ausblenden zum Zonen-Ende relativ zur Zonenhöhe: ab 97.5% wird weich
 *  ausgeblendet, ab 99% ist der Schaum aus. Bewusst NICHT auf die exakte
 *  Endhöhe gelegt – der Reveal-Spring (RiverFlow) nähert sich der vollen
 *  Höhe nur asymptotisch, eine harte Schwelle dort würde nie greifen. */
const FOAM_FADE_OUT_START_FRAC = 0.975;
const FOAM_FADE_OUT_END_FRAC = 0.99;
/** Vorpreschen: wie weit Partikel vor die Front schießen (Kanalmitte). */
const FOAM_LEAD_PX = 34;
/** Partikelanzahl der Fließfront. */
const FOAM_COUNT = 90;
/** Tempo-Faktor aller Partikel-Zyklen. */
const FOAM_SPEED = 1;
/** Größen-Faktor der Partikel. */
const FOAM_SIZE_K = 1;
/** Sprung-Weg der Partikel (wirkt in alle Richtungen). */
const FOAM_JITTER_PX = 10;

/* --- Nebel-Schicht an der Fließkante -------------------------------- */
/* Weiche, wabernde Wölkchen ÜBER der Kante: sie decken die Clip-Kante zu
   und geben der Front Volumen. Bewusst KEIN feTurbulence-Filter (teuer,
   pro Frame neu gerastert) — stattdessen wenige große Kreise unter EINEM
   CSS-blur(): das kompositiert die GPU, kostet also fast nichts. */
const NEBEL_COUNT = 9;
const NEBEL_SIZE_PX = 26;
const NEBEL_OPACITY = 0.5;
const NEBEL_SPEED = 1;
const NEBEL_BLUR_PX = 7;

interface NebelWolke {
  /** Querlage (-1..1). */
  t: number;
  r: number;
  driftAmp: number;
  driftPeriodMs: number;
  driftPhase: number;
  hebPeriodMs: number;
  hebPhase: number;
  /** Atmung der Größe. */
  pulsPeriodMs: number;
  pulsPhase: number;
  opacityK: number;
}

/** Wolken der Nebelkante, deterministisch geseedet. */
function buildNebel(count: number): NebelWolke[] {
  const rand = mulberry32(FOAM_SEED + 99);
  const n = Math.max(1, Math.round(count));
  return Array.from({ length: n }, (_, i) => ({
    /* gleichmäßig über die Breite verteilt + leichte Streuung */
    t: n === 1 ? 0 : -1 + (2 * i) / (n - 1) + (rand() - 0.5) * 0.25,
    r: 0.6 + rand() * 0.8,
    driftAmp: 3 + rand() * 7,
    driftPeriodMs: 2600 + rand() * 3200,
    driftPhase: rand() * Math.PI * 2,
    hebPeriodMs: 2000 + rand() * 2600,
    hebPhase: rand() * Math.PI * 2,
    pulsPeriodMs: 2400 + rand() * 3000,
    pulsPhase: rand() * Math.PI * 2,
    opacityK: 0.55 + rand() * 0.45,
  }));
}

/* Drei Partikel-Schichten statt einer Blase mit hüpfenden Kreisen: jede
   Schicht hat eigenen Charakter, zusammen ergeben sie eine Front, die nach
   vorne drückt statt zu wackeln.
     gischt   – viele winzige, schnelle Partikel, schießen am weitesten vor,
                dünnen dabei aus (Spray vor der Welle)
     schaum   – mittlere Klumpen, reiten auf der Front, platzen zyklisch
     nachlauf – hinter der Front, driften zurück und lösen sich auf */
type PartikelLayer = "gischt" | "schaum" | "nachlauf";

const LAYER_MIX: { layer: PartikelLayer; anteil: number }[] = [
  { layer: "gischt", anteil: 0.55 },
  { layer: "schaum", anteil: 0.3 },
  { layer: "nachlauf", anteil: 0.15 },
];

interface FrontPartikel {
  layer: PartikelLayer;
  /** Normierte Querposition entlang der Frontlinie (-1..1). */
  t: number;
  /** Basis-Radius (wird mit dem Größen-Regler + Perspektive skaliert). */
  r: number;
  baseOpacity: number;
  /** Sprung-Amplitude (wirkt in ALLE Richtungen, s. rAF-Loop). */
  jitterAmp: number;
  jitterPeriodMs: number;
  jitterPhase: number;
  /** Eigene Phase für die y-Achse — sonst liefen x und y synchron und die
   *  Partikel würden diagonal pendeln statt frei zu springen. */
  jitterPhaseY: number;
  /** Individuelles Achsverhältnis des Sprungs (manche springen eher hoch,
   *  andere eher quer) — sonst wirkt die Wolke wie ein Muster. */
  jitterRatioY: number;
  /** Platz-/Auflöse-Zyklus. */
  burstPeriodMs: number;
  burstPhase: number;
  /** Vorpresch-Zyklus (individuell → versetztes Vorpreschen). */
  leadPeriodMs: number;
  leadPhase: number;
  /** Anteil des Vorpresch-Wegs, den DIESES Partikel nutzt. */
  leadK: number;
}

/** Partikel-Wolke der Fließfront, mulberry32-geseedet (deterministisch, kein
 *  Math.random pro Frame): Größe, Tempo, Querlage, Vorpresch-Weg und Spring-
 *  amplitude streuen pro Partikel — deshalb wirkt die Front vielfältig statt
 *  wie drei taktgleiche Kreise. */
function buildFrontPartikel(count: number): FrontPartikel[] {
  const rand = mulberry32(FOAM_SEED);
  return Array.from({ length: Math.max(1, Math.round(count)) }, () => {
    const w = rand();
    let acc = 0;
    let layer: PartikelLayer = "gischt";
    for (const m of LAYER_MIX) {
      acc += m.anteil;
      if (w <= acc) {
        layer = m.layer;
        break;
      }
    }
    /* Querlage: quadratisch zur Mitte verdichtet (dort ist die Strömung
       am stärksten), Ufer bekommen weniger Partikel. */
    const u = rand() * 2 - 1;
    const t = Math.sign(u) * Math.pow(Math.abs(u), 1.35);
    const rBasis =
      layer === "gischt" ? 0.7 + rand() * 1.7 : layer === "schaum" ? 2.2 + rand() * 3.4 : 1.4 + rand() * 2.4;
    return {
      layer,
      t,
      r: rBasis,
      baseOpacity:
        layer === "gischt" ? 0.35 + rand() * 0.4 : layer === "schaum" ? 0.6 + rand() * 0.35 : 0.25 + rand() * 0.3,
      jitterAmp: (layer === "gischt" ? 2 : 1) * (0.6 + rand() * 2.2),
      jitterPeriodMs: 500 + rand() * 1500,
      jitterPhase: rand() * Math.PI * 2,
      jitterPhaseY: rand() * Math.PI * 2,
      jitterRatioY: 0.5 + rand() * 1.1,
      burstPeriodMs: 1600 + rand() * 3000,
      burstPhase: rand(),
      leadPeriodMs: (layer === "gischt" ? 900 : 1600) + rand() * 1800,
      leadPhase: rand(),
      /* Gischt prescht am weitesten, Nachlauf gar nicht (negativ = zurück). */
      leadK: layer === "gischt" ? 0.6 + rand() * 0.9 : layer === "schaum" ? 0.2 + rand() * 0.5 : -(0.3 + rand() * 0.7),
    };
  });
}

interface BankNodes {
  ys: number[];
  down: number[];
  up: number[];
}

/** Rekonstruiert die Knotentabellen der Fluss-Kontur aus geometry.bankD.
 *  Struktur (siehe closedRiverPath in riverPath.ts): M + (n-1)×C abwärts +
 *  L + (n-1)×C aufwärts + Z; Kontrollpunkte liegen auf dem y-Mittelpunkt,
 *  Endpunkt-x/y stehen an Position 4/5 jedes C-Blocks. */
function parseBankNodes(bankD: string): BankNodes {
  const { numbers } = parsePath(bankD);
  const n = (numbers.length - 4) / 12 + 1;
  const ys: number[] = [numbers[1]];
  const down: number[] = [numbers[0]];
  for (let i = 0; i < n - 1; i++) {
    down.push(numbers[2 + i * 6 + 4]);
    ys.push(numbers[2 + i * 6 + 5]);
  }
  const upStart = 2 + (n - 1) * 6; /* L-Kommando: x der rechten Unterkante */
  const up = new Array<number>(n);
  up[n - 1] = numbers[upStart];
  for (let k = 0; k < n - 1; k++) {
    up[n - 2 - k] = numbers[upStart + 2 + k * 6 + 4];
  }
  return { ys, down, up };
}

/** x-Position einer Kontur-Kante an Höhe y: gleiche Bisektions-Auswertung
 *  wie xAtY in riverPath.ts (dort nicht exportiert, riverPath.ts ist
 *  tabu → hier gespiegelt, arbeitet auf den aus bankD geparsten Knoten). */
function edgeXAtY(xs: number[], ys: number[], y: number): number {
  const clamped = Math.min(Math.max(y, ys[0]), ys[ys.length - 1]);
  let i = 0;
  while (i < ys.length - 2 && ys[i + 1] < clamped) i++;

  const y0 = ys[i];
  const y1 = ys[i + 1];
  const mid = (y0 + y1) / 2;
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };

  let lo = 0;
  let hi = 1;
  for (let iter = 0; iter < 24; iter++) {
    const t = (lo + hi) / 2;
    if (cubic(y0, mid, mid, y1, t) < clamped) lo = t;
    else hi = t;
  }
  const t = (lo + hi) / 2;
  return cubic(xs[i], xs[i], xs[i + 1], xs[i + 1], t);
}

/* ------------------------------------------------------------------ */
/* prefers-reduced-motion (lokale Kopie, siehe RiverFlow.tsx – nicht      */
/* exportiert, daher kein Import möglich)                               */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Flora: gras / baum / efeu                                           */
/* ------------------------------------------------------------------ */

const TREE_TRUNK_H = 14;
const TREE_MAIN_CROWN_D = FLORA.a.tree.crown[0].d;
const TREE_ACCENT_CROWN_D = FLORA.b.tree.crown[3].d;
const TREE_MAIN = crownTransform(pathBBox(TREE_MAIN_CROWN_D), 36, -TREE_TRUNK_H);
const TREE_ACCENT = crownTransform(pathBBox(TREE_ACCENT_CROWN_D), 21, -TREE_TRUNK_H - 13);

function FloraTree() {
  return (
    <>
      <path
        className="rf-tree-trunk"
        d={`M-2,0 Q-3,${(-TREE_TRUNK_H / 2).toFixed(1)} 0,${-TREE_TRUNK_H} Q3,${(-TREE_TRUNK_H / 2).toFixed(1)} 2,0 Z`}
      />
      <g transform={`translate(${TREE_ACCENT.tx.toFixed(2)},${TREE_ACCENT.ty.toFixed(2)}) scale(${TREE_ACCENT.scale.toFixed(4)})`}>
        <path className="rf-tree-crown-accent" d={TREE_ACCENT_CROWN_D} />
      </g>
      <g transform={`translate(${TREE_MAIN.tx.toFixed(2)},${TREE_MAIN.ty.toFixed(2)}) scale(${TREE_MAIN.scale.toFixed(4)})`}>
        <path className="rf-tree-crown-main" d={TREE_MAIN_CROWN_D} />
      </g>
    </>
  );
}

function buildGrassBlades(rand: () => number, count: number) {
  const colors = ["var(--green-600)", "var(--green-400)"];
  const blades: { d: string; fill: string }[] = [];
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const baseX = -13 + t * 26 + (rand() - 0.5) * 4;
    const h = 15 + rand() * 15;
    const lean = (rand() - 0.5) * 12;
    const tipX = baseX + lean;
    const midX = baseX + lean * 0.55;
    const d =
      `M${(baseX - 1.6).toFixed(1)},0 ` +
      `Q${midX.toFixed(1)},${(-h * 0.55).toFixed(1)} ${tipX.toFixed(1)},${(-h).toFixed(1)} ` +
      `Q${(midX + 1.4).toFixed(1)},${(-h * 0.55).toFixed(1)} ${(baseX + 1.6).toFixed(1)},0 Z`;
    blades.push({ d, fill: colors[i % 2] });
  }
  return blades;
}

function buildIvyVines(rand: () => number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const dir = i % 2 === 0 ? 1 : -1;
    const len = 44 + rand() * 24;
    const sway = 6 + rand() * 6;
    const baseX = (rand() - 0.5) * 8;
    const d =
      `M${baseX.toFixed(1)},0 ` +
      `C${(baseX + dir * sway).toFixed(1)},${(len * 0.33).toFixed(1)} ` +
      `${(baseX - dir * sway).toFixed(1)},${(len * 0.66).toFixed(1)} ` +
      `${baseX.toFixed(1)},${len.toFixed(1)}`;
    const leaves = [0.3, 0.56, 0.82].map((t) => ({
      x: baseX + Math.sin(t * Math.PI) * dir * sway * 0.7,
      y: len * t,
      rot: (rand() - 0.5) * 40 + dir * 18,
      size: 3 + rand() * 1.6,
    }));
    return { d, leaves, hasBerry: i === 0 };
  });
}

function FloraContent({ variant, seed }: { variant: FloraVariant; seed: number }) {
  const rand = mulberry32(seed);
  if (variant === "baum") return <FloraTree />;

  if (variant === "efeu") {
    const vines = buildIvyVines(rand, 2 + Math.round(rand()));
    return (
      <>
        {vines.map((v, vi) => (
          <g key={vi} className="rf-ivy-vine">
            <path d={v.d} className="rf-ivy-stem" />
            {v.leaves.map((leaf, li) => (
              <ellipse
                key={li}
                cx={leaf.x}
                cy={leaf.y}
                rx={leaf.size}
                ry={leaf.size * 0.55}
                transform={`rotate(${leaf.rot.toFixed(1)} ${leaf.x.toFixed(1)} ${leaf.y.toFixed(1)})`}
                className={li % 2 === 0 ? "rf-ivy-leaf-a" : "rf-ivy-leaf-b"}
              />
            ))}
            {v.hasBerry && v.leaves[1] && (
              <circle cx={v.leaves[1].x} cy={v.leaves[1].y} r={1.6} className="rf-ivy-berry" />
            )}
          </g>
        ))}
      </>
    );
  }

  const blades = buildGrassBlades(rand, 3 + Math.floor(rand() * 3));
  return (
    <>
      {blades.map((b, bi) => (
        <path key={bi} d={b.d} fill={b.fill} />
      ))}
    </>
  );
}

function FloraTrigger({
  trigger,
  index,
  registerEl,
}: {
  trigger: FeatureTrigger;
  index: number;
  registerEl: (index: number, el: SVGGElement | null) => void;
}) {
  const seed = Math.round(trigger.x * 1000 + trigger.y);
  return (
    <g transform={`translate(${trigger.x.toFixed(1)},${trigger.y.toFixed(1)})`}>
      <g ref={(el) => registerEl(index, el)} className={`rf-flora rf-flora--${trigger.variant}`}>
        <FloraContent variant={trigger.variant} seed={seed} />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Wasserfall-Kaskaden (Box + Felswand teilen sich dieselbe Technik)    */
/* ------------------------------------------------------------------ */

const STRIPE_COLORS = ["var(--water-500)", "var(--water-400)", "var(--water-300)"];

function buildCascadeStripes(rand: () => number, widthPx: number, count: number) {
  const slot = widthPx / count;
  return Array.from({ length: count }, (_, i) => {
    const w = slot * (0.55 + rand() * 0.35);
    const cx = -widthPx / 2 + slot * (i + 0.5);
    return { x: cx - w / 2, w, fill: STRIPE_COLORS[i % STRIPE_COLORS.length] };
  });
}

function CascadeWaterfall({
  wf,
  seed,
  isCliff,
  registerGradientEl,
  registerBreatherEl,
}: {
  wf: Waterfall;
  seed: number;
  isCliff: boolean;
  registerGradientEl: (el: SVGLinearGradientElement | null, tileH: number) => void;
  registerBreatherEl: (el: SVGGraphicsElement | null, cfg: BreatherConfig) => void;
}) {
  const rand = mulberry32(seed);
  const height = wf.bottomY - wf.topY;
  const stripeCount = isCliff ? 8 + Math.floor(rand() * 3) : 4 + Math.floor(rand() * 2);
  const stripes = buildCascadeStripes(rand, wf.widthPx, stripeCount);
  const gradId = `rf-flow-${seed}`;
  const tileH = 46;

  return (
    <g transform={`translate(${wf.x.toFixed(1)},${wf.topY.toFixed(1)})`} className="rf-waterfall">
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="0"
          y2={tileH}
          spreadMethod="repeat"
          gradientTransform="translate(0 0)"
          ref={(el) => registerGradientEl(el, tileH)}
        >
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.16" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.32" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.78" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Dachlauf: kurzer Wasserlauf vor der Kante, bevor die Kaskade fällt. */}
      <rect
        className="rf-waterfall-lip"
        x={-wf.widthPx * 0.62}
        y={-7}
        width={wf.widthPx * 1.24}
        height={12}
        rx={6}
      />

      {stripes.map((s, i) => (
        <rect key={i} x={s.x} y={0} width={s.w} height={height} rx={s.w * 0.4} fill={s.fill} />
      ))}
      <rect
        className="rf-waterfall-flow"
        x={-wf.widthPx / 2}
        y={0}
        width={wf.widthPx}
        height={height}
        fill={`url(#${gradId})`}
      />

      <g className="rf-waterfall-foam">
        {Array.from({ length: 5 }, (_, i) => {
          const x = -wf.widthPx / 2 + (wf.widthPx / 4) * i;
          return (
            <ellipse
              key={i}
              className="rf-foam-dot"
              cx={x}
              cy={2}
              rx={wf.widthPx * 0.14}
              ry={4}
              ref={(el) =>
                registerBreatherEl(el, {
                  mode: "opacity",
                  min: 0.4,
                  max: 0.85,
                  periodMs: 1800 + i * 140,
                  seedPhase: rand() * Math.PI * 2,
                })
              }
            />
          );
        })}
      </g>

      <g transform={`translate(0,${height})`} className="rf-waterfall-splash">
        <path d={`M${(-wf.widthPx * 0.4).toFixed(1)},0 Q0,-10 ${(wf.widthPx * 0.4).toFixed(1)},0`} className="rf-splash-arc" />
        <path d={`M${(-wf.widthPx * 0.25).toFixed(1)},4 Q0,-6 ${(wf.widthPx * 0.25).toFixed(1)},4`} className="rf-splash-arc" />
        <ellipse
          className="rf-splash-pulse"
          cx={-wf.widthPx * 0.15}
          cy={4}
          rx={10}
          ry={5}
          ref={(el) =>
            registerBreatherEl(el, { mode: "scale", min: 0.85, max: 1.15, periodMs: 2100, seedPhase: rand() * Math.PI * 2 })
          }
        />
        <ellipse
          className="rf-splash-pulse"
          cx={wf.widthPx * 0.18}
          cy={2}
          rx={8}
          ry={4}
          ref={(el) =>
            registerBreatherEl(el, { mode: "scale", min: 0.85, max: 1.2, periodMs: 1900, seedPhase: rand() * Math.PI * 2 + 1 })
          }
        />
      </g>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Felswand (nur beim Wasserfall-Typ "cliff")                          */
/* ------------------------------------------------------------------ */

function RockFace({ wf, seed }: { wf: Waterfall; seed: number }) {
  const rand = mulberry32(seed);
  const half = 3000;
  const top = wf.topY - 10;
  const bottom = wf.bottomY + 40;
  const layers = [
    { inset: 0, cls: "rf-cliff-back", jag: 14 },
    { inset: 42, cls: "rf-cliff-mid", jag: 20 },
    { inset: 96, cls: "rf-cliff-front", jag: 26 },
  ];

  return (
    <g transform={`translate(${wf.x.toFixed(1)},0)`} className="rf-cliff">
      {layers.map((layer) => {
        const segs = 12;
        const points: string[] = [];
        for (let i = 0; i <= segs; i++) {
          const x = -half + (2 * half * i) / segs;
          const j = (rand() - 0.5) * layer.jag;
          points.push(`${x.toFixed(0)},${(top + layer.inset + j).toFixed(0)}`);
        }
        const d = `M${points.join(" L")} L${half},${bottom} L${-half},${bottom} Z`;
        return <path key={layer.cls} d={d} className={layer.cls} />;
      })}
      {Array.from({ length: 6 }, (_, i) => {
        const x = -wf.widthPx * 1.4 + i * (wf.widthPx * 0.56);
        const jitter = (rand() - 0.5) * 30;
        return (
          <path
            key={i}
            className="rf-cliff-joint"
            d={`M${(x + jitter).toFixed(0)},${(top + 30).toFixed(0)} L${(x + jitter * 0.6).toFixed(0)},${(bottom - 20).toFixed(0)}`}
          />
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* See                                                                  */
/* ------------------------------------------------------------------ */

function LakeFeature({
  lakeD,
  cliffWf,
  seed,
  registerBreatherEl,
}: {
  lakeD: string;
  cliffWf: Waterfall | undefined;
  seed: number;
  registerBreatherEl: (el: SVGGraphicsElement | null, cfg: BreatherConfig) => void;
}) {
  const rand = mulberry32(seed);
  const box = pathBBox(lakeD);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const rx = (box.maxX - box.minX) / 2;
  const ry = (box.maxY - box.minY) / 2;

  return (
    <g className="rf-lake">
      <path d={lakeD} className="rf-lake-basin" />
      {[0.35, 0.55, 0.75].map((f, i) => (
        <ellipse
          key={i}
          className="rf-lake-ring"
          cx={cx}
          cy={cy}
          rx={rx * f}
          ry={ry * f}
          ref={(el) =>
            registerBreatherEl(el, { mode: "scale", min: 0.97, max: 1.04, periodMs: 8600 + i * 600, seedPhase: rand() * Math.PI * 2 })
          }
        />
      ))}
      <ellipse
        className="rf-lake-glare"
        cx={cx - rx * 0.25}
        cy={cy - ry * 0.3}
        rx={rx * 0.32}
        ry={ry * 0.08}
        ref={(el) =>
          registerBreatherEl(el, { mode: "opacity", min: 0.12, max: 0.32, periodMs: 5200, seedPhase: rand() * Math.PI * 2 })
        }
      />
      <ellipse
        className="rf-lake-glare"
        cx={cx + rx * 0.3}
        cy={cy + ry * 0.1}
        rx={rx * 0.22}
        ry={ry * 0.06}
        ref={(el) =>
          registerBreatherEl(el, { mode: "opacity", min: 0.1, max: 0.26, periodMs: 6100, seedPhase: rand() * Math.PI * 2 })
        }
      />
      {cliffWf && (
        <g transform={`translate(${cliffWf.x.toFixed(1)},${Math.min(cliffWf.bottomY, box.minY + 20).toFixed(1)})`}>
          {[0, 1, 2].map((i) => (
            <ellipse
              key={i}
              className="rf-lake-foam"
              cx={(i - 1) * 22}
              cy={0}
              rx={16}
              ry={6}
              ref={(el) =>
                registerBreatherEl(el, { mode: "opacity", min: 0.35, max: 0.8, periodMs: 1500 + i * 200, seedPhase: rand() * Math.PI })
              }
            />
          ))}
        </g>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Haupt-Komponente                                                     */
/* ------------------------------------------------------------------ */

export function RiverFeatures({ geometry, revealY, riverStartY = 0, foam }: RiverFeaturesProps) {
  /* Schaum-Parameter: im Editor live, auf der Landing die Defaults.
     Die BREITE ist bewusst NICHT dabei — sie ist fest an die Flussbreite
     gekoppelt (FOAM_SPREAD). */
  const foamCfg = {
    count: foam?.count ?? FOAM_COUNT,
    leadPx: foam?.leadPx ?? FOAM_LEAD_PX,
    speed: foam?.speed ?? FOAM_SPEED,
    sizeK: foam?.sizeK ?? FOAM_SIZE_K,
    jitterPx: foam?.jitterPx ?? FOAM_JITTER_PX,
  };
  const nebelCfg = {
    count: foam?.mistCount ?? NEBEL_COUNT,
    sizePx: foam?.mistSizePx ?? NEBEL_SIZE_PX,
    opacity: foam?.mistOpacity ?? NEBEL_OPACITY,
    speed: foam?.mistSpeed ?? NEBEL_SPEED,
    blurPx: foam?.mistBlurPx ?? NEBEL_BLUR_PX,
  };
  const partikel = useMemo(() => buildFrontPartikel(foamCfg.count), [foamCfg.count]);
  const nebel = useMemo(() => buildNebel(nebelCfg.count), [nebelCfg.count]);
  const nebelRefs = useRef<(SVGCircleElement | null)[]>([]);
  const rootRef = useRef<SVGGElement>(null);
  const floraRefs = useRef<(SVGGElement | null)[]>([]);
  const gradientEntries = useRef<GradientEntry[]>([]);
  const breatherEntries = useRef<BreatherEntry[]>([]);
  const timeRef = useRef(0);
  const prefersReducedMotion = usePrefersReducedMotion();

  /* --- Schaumfront: Kontur-Knoten + DOM-Refs -------------------------- */
  /* Seit dem Ein-Element-Umbau liefert die Geometrie die Körper-Knoten
     direkt (geometry.kontur) — bankD enthält jetzt auch See+Kopf als
     Polylinien-/Subpath-Anteile und ist nicht mehr rückwärts-parsebar. */
  const bankNodes = useMemo<BankNodes>(
    () => geometry.kontur ?? parseBankNodes(geometry.bankD),
    [geometry],
  );
  /* Gesamthöhe der Fluss-Zone in Design-Einheiten (Segmente decken 0..h ab). */
  const zoneH = geometry.segments.length
    ? geometry.segments[geometry.segments.length - 1].toY
    : 0;
  const [foamHost, setFoamHost] = useState<SVGGElement | null>(null);
  const foamHostRef = useRef<SVGGElement | null>(null);
  const foamBubbleRefs = useRef<(SVGCircleElement | null)[]>([]);

  /* Schaum-Wirt: eigenes <g> DIREKT im SVG-Root, also als Geschwister der
     geclippten Reveal-Gruppe – die Clip-Kante schneidet sonst genau durch
     den Schaum. Bei reduced-motion gibt es keinen Schaum (der Fluss ist
     dort ohnehin komplett aufgedeckt). */
  useEffect(() => {
    if (prefersReducedMotion) return;
    const svgEl = rootRef.current?.ownerSVGElement;
    if (!svgEl) return;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "rf-foamfront");
    g.style.opacity = "0";
    svgEl.appendChild(g);
    foamHostRef.current = g;
    setFoamHost(g);
    return () => {
      foamHostRef.current = null;
      setFoamHost(null);
      svgEl.removeChild(g);
    };
  }, [prefersReducedMotion]);

  /* Ref-Sammel-Arrays je Render neu befüllen (Commit-Phase schreibt sie via
     Callback-Refs) – vermeidet React-State/Re-Render pro Scroll-Frame. */
  gradientEntries.current = [];
  breatherEntries.current = [];

  const registerGradientEl = useCallback((el: SVGLinearGradientElement | null, tileH: number) => {
    if (el) gradientEntries.current.push({ el, tileH });
  }, []);
  const registerBreatherEl = useCallback((el: SVGGraphicsElement | null, cfg: BreatherConfig) => {
    if (el) breatherEntries.current.push({ el, ...cfg });
  }, []);
  const registerFloraEl = useCallback((index: number, el: SVGGElement | null) => {
    floraRefs.current[index] = el;
  }, []);

  useEffect(() => {
    floraRefs.current = geometry.featureTriggers.map(() => null);
  }, [geometry]);

  const syncFlora = useCallback(
    (v: number) => {
      geometry.featureTriggers.forEach((t, i) => {
        floraRefs.current[i]?.classList.toggle("rf-flora--sprout", v > t.y);
      });
    },
    [geometry],
  );

  useMotionValueEvent(revealY, "change", syncFlora);
  /* Hält die Flora-Klassen synchron, auch ohne auf das nächste Scroll-
     "change"-Event zu warten (gleiches Nachzieh-Muster wie in RiverFlow). */
  useEffect(() => {
    syncFlora(revealY.get());
  });

  /* Ein gemeinsamer rAF-Loop für Gradient-Lauftextur + Opacity/Scale-
     Atmung. Pausiert außerhalb des Viewports, läuft nie bei reduced-motion
     (CSS erzwingt dort die statischen Endzustände). */
  useEffect(() => {
    if (prefersReducedMotion) return;
    const svgEl = rootRef.current?.ownerSVGElement;
    if (!svgEl) return;

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(svgEl);

    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rawDt = now - last;
      last = now;
      if (!visible) return;
      const dt = Math.min(rawDt, MAX_DT_MS);
      timeRef.current += dt;
      const t = timeRef.current;

      for (const g of gradientEntries.current) {
        const offset = (t * GRADIENT_SPEED_PX_PER_MS) % g.tileH;
        g.el.setAttribute("gradientTransform", `translate(0 ${offset.toFixed(1)})`);
      }
      for (const b of breatherEntries.current) {
        const phase = (t / b.periodMs) * Math.PI * 2 + b.seedPhase;
        const v = b.min + (b.max - b.min) * (0.5 + 0.5 * Math.sin(phase));
        if (b.mode === "opacity") b.el.style.opacity = v.toFixed(3);
        else b.el.style.transform = `scale(${v.toFixed(4)})`;
      }

      /* --- Schaumfront: Position an der Front + Waber-/Platz-Leben ---- */
      const foamG = foamHostRef.current;
      if (foamG) {
        const front = revealY.get();
        /* Nur solange die Front INNERHALB des Flusses wandert sichtbar:
           weich einblenden hinter der Quelle, weich ausblenden kurz vor dem
           Zonen-Ende (= volles Reveal).
           WICHTIG: Bezug ist der ECHTE Fluss-Anfang (riverStartY = Spitze in
           der Ferne, negativ), NICHT 0. Vorher stand hier eine 0-Annahme
           (Körper-Anfang) — dadurch war fadeIn im gesamten Kopf 0 und der
           Schaum startete erst nach dem Header (Kundenreklamation). */
        const fadeIn = Math.min(
          1,
          Math.max(0, (front - (riverStartY + FOAM_MIN_REVEAL)) / FOAM_FADE_IN_PX),
        );
        const outStart = zoneH * FOAM_FADE_OUT_START_FRAC;
        const outEnd = zoneH * FOAM_FADE_OUT_END_FRAC;
        const fadeOut = Math.min(1, Math.max(0, (outEnd - front) / (outEnd - outStart)));
        const groupOpacity = fadeIn * fadeOut;
        const active = groupOpacity > 0.01;
        foamG.style.opacity = active ? groupOpacity.toFixed(3) : "0";
        if (active) {
          /* Fluss-Kanten an der Front-Höhe aus der Master-Kontur auswerten –
             auch bei Kurven-Versatz sitzt der Schaum IM Fluss. */
          const xL = edgeXAtY(bankNodes.down, bankNodes.ys, front);
          const xR = edgeXAtY(bankNodes.up, bankNodes.ys, front);
          const cx = (xL + xR) / 2;
          /* Breite FEST an den Fluss gekoppelt (kein Regler, Kundenvorgabe). */
          const halfW = Math.max(6, ((xR - xL) / 2) * FOAM_SPREAD);
          /* Perspektive: an der schmalen Quelle schrumpft alles mit. */
          const sizeK = Math.min(1, halfW / 70);
          foamG.setAttribute("transform", `translate(${cx.toFixed(1)} ${front.toFixed(1)})`);

          const tempo = Math.max(0.1, foamCfg.speed);
          for (let i = 0; i < partikel.length; i++) {
            const el = foamBubbleRefs.current[i];
            if (!el) continue;
            const b = partikel[i];

            /* Ufer-Reibung: in der Kanalmitte prescht Wasser weit vor, am
               Ufer bremst es und springt stattdessen mehr — das ersetzt die
               künstliche „Nase" durch echtes Partikel-Verhalten. */
            const mitte = 1 - b.t * b.t;
            const uferK = 0.15 + 0.85 * mitte;

            /* SPRINGEN in ALLE Richtungen (Kundenvorgabe): x und y haben
               eigene Phasen + eigenes Achsverhältnis, beide skalieren mit
               demselben Regler — vorher wirkte er nur horizontal. */
            const jPhase = ((t * tempo) / b.jitterPeriodMs) * Math.PI * 2;
            const jitX = Math.sin(jPhase + b.jitterPhase);
            const jitY = Math.sin(jPhase * 1.37 + b.jitterPhaseY);
            const jitAmp = b.jitterAmp * foamCfg.jitterPx * 0.1;
            const bx = b.t * halfW + jitX * jitAmp * (2 - uferK);

            /* Vorpreschen: Schub nach vorn (ease-out), dann holt die Front
               das Partikel wieder ein. Nachlauf-Partikel haben leadK<0 und
               driften dadurch hinter die Front. */
            const lp = ((t * tempo) / b.leadPeriodMs + b.leadPhase) % 1;
            const schub = lp < 0.55 ? 1 - Math.pow(1 - lp / 0.55, 2) : 1 - (lp - 0.55) / 0.45;
            const lead = foamCfg.leadPx * sizeK * b.leadK * uferK * Math.max(0, schub);
            const by = jitY * jitAmp * b.jitterRatioY + lead;

            /* Auflösen: am Zyklusende aufblähen + ausblenden. */
            const p = ((t * tempo) / b.burstPeriodMs + b.burstPhase) % 1;
            let k = sizeK * foamCfg.sizeK;
            let op = b.baseOpacity;
            if (p > 0.85) {
              const q = (p - 0.85) / 0.15;
              k *= 1 + q * 0.6;
              op *= 1 - q;
            }
            /* Je weiter vorgeprellt, desto dünner (Gischt löst sich auf). */
            const leadMax = Math.max(foamCfg.leadPx * sizeK, 1);
            if (lead > 0) op *= 1 - 0.5 * Math.min(1, lead / leadMax);
            el.setAttribute("r", (b.r * k).toFixed(2));
            el.setAttribute("cx", bx.toFixed(1));
            el.setAttribute("cy", by.toFixed(1));
            el.style.opacity = op.toFixed(3);
          }

          /* Nebelkante: große weiche Wolken wabern über der Front und
             decken die Clip-Kante zu. Sie sitzen minimal HINTER der Front
             (negatives y), damit die Kante im Dunst verschwindet. */
          const nTempo = Math.max(0.1, nebelCfg.speed);
          for (let i = 0; i < nebel.length; i++) {
            const el = nebelRefs.current[i];
            if (!el) continue;
            const w = nebel[i];
            const drift = Math.sin((t * nTempo) / w.driftPeriodMs * Math.PI * 2 + w.driftPhase);
            const heb = Math.sin((t * nTempo) / w.hebPeriodMs * Math.PI * 2 + w.hebPhase);
            const puls = Math.sin((t * nTempo) / w.pulsPeriodMs * Math.PI * 2 + w.pulsPhase);
            const nx = w.t * halfW + drift * w.driftAmp * sizeK;
            const ny = -2 * sizeK + heb * 3 * sizeK;
            const nr = w.r * nebelCfg.sizePx * sizeK * (0.85 + 0.15 * puls);
            el.setAttribute("cx", nx.toFixed(1));
            el.setAttribute("cy", ny.toFixed(1));
            el.setAttribute("r", Math.max(0.5, nr).toFixed(2));
            el.style.opacity = (nebelCfg.opacity * w.opacityK * (0.8 + 0.2 * puls)).toFixed(3);
          }
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
    /* riverStartY in den Deps: ändert sich mit der Fensterhöhe (Kopfhöhe) —
       ohne Neustart liefe der Loop mit einem veralteten Fluss-Anfang und der
       Schaum setzte wieder falsch an. */
  }, [
    geometry,
    prefersReducedMotion,
    riverStartY,
    partikel,
    foamCfg.leadPx,
    foamCfg.speed,
    foamCfg.sizeK,
    foamCfg.jitterPx,
    nebel,
    nebelCfg.sizePx,
    nebelCfg.opacity,
    nebelCfg.speed,
  ]);

  const cliffWf = geometry.waterfalls.find((w) => w.kind === "cliff");

  return (
    <g ref={rootRef} className="rf-root">
      {geometry.featureTriggers.map((trigger, i) => (
        <FloraTrigger key={i} trigger={trigger} index={i} registerEl={registerFloraEl} />
      ))}

      {geometry.waterfalls.map((wf, i) => {
        const seed = Math.round(wf.x * 1000 + wf.topY);
        const isCliff = wf.kind === "cliff";
        return (
          <g key={i}>
            {isCliff && <RockFace wf={wf} seed={seed + 7} />}
            <CascadeWaterfall
              wf={wf}
              seed={seed}
              isCliff={isCliff}
              registerGradientEl={registerGradientEl}
              registerBreatherEl={registerBreatherEl}
            />
          </g>
        );
      })}

      {geometry.lakeD && (
        <LakeFeature lakeD={geometry.lakeD} cliffWf={cliffWf} seed={1337} registerBreatherEl={registerBreatherEl} />
      )}

      {/* Fließfront: rendert in den ungeclippten Wirt (Geschwister der
          Reveal-Gruppe, siehe Effekt oben). KEIN Schaumsaum-Blob mehr
          (Kundenentscheid) — nur die Partikelwolke aus drei Schichten
          (Gischt/Schaum/Nachlauf); Position/Leben schreibt der rAF-Loop. */}
      {foamHost &&
        createPortal(
          <>
            {/* Nebelkante UNTER den Partikeln: ein einziges CSS-blur() auf
                der Gruppe (GPU-kompositiert, kein feTurbulence pro Frame). */}
            <g
              className="rf-mist"
              style={{ filter: `blur(${nebelCfg.blurPx}px)` }}
            >
              {nebel.map((_, i) => (
                <circle
                  key={i}
                  ref={(el) => {
                    nebelRefs.current[i] = el;
                  }}
                  className="rf-mist-wolke"
                  cx={0}
                  cy={0}
                  r={1}
                />
              ))}
            </g>
            {partikel.map((b, i) => (
              <circle
                key={i}
                ref={(el) => {
                  foamBubbleRefs.current[i] = el;
                }}
                className={`rf-foam-bubble rf-foam-bubble--${b.layer}`}
                cx={0}
                cy={0}
                r={b.r.toFixed(2)}
              />
            ))}
          </>,
          foamHost,
        )}
    </g>
  );
}
