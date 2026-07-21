"use client";

/*
 * RiverLakeBlob – der Quell-See am Horizont, 1:1 nach dem Kunden-Snippet
 * (klecks_see_autarkes_snippet.html): organischer Klecks-Umriss, tiefer
 * Grund, 5 konzentrische atmende Wellenringe, außen Sand-Stroke, innen
 * dunkler nasser-Sand-Schatten. Wird von RiverFlow im SELBEN SVG UNTER den
 * Fluss-Bändern gerendert (der Fluss entspringt der See-Mitte = Tropfen-
 * Einschlagpunkt und läuft nach unten aus dem See heraus).
 *
 * Anbindung an den Fluss (Kundenvorgabe „braune Kante weg"):
 * Sand-Stroke UND innerer Schatten werden an der Mündung (unterer
 * Klecks-Rand um die Mittelachse) per Maske ausgespart — dort geht
 * See-Wasser direkt in Fluss-Wasser über. Das Einfaden der Fluss-Layer
 * übernimmt RiverFlow (Fade-Maske über den Bändern).
 *
 * Animation: JS-Pfad-Lerp im rAF (8s, alternate, ease-in-out) statt der
 * CSS-`d:path()`-Keyframes des Snippets — gleiche Technik wie RiverWaves
 * (Safari unterstützt animierte `d`-Property nicht zuverlässig, und der
 * Loop pausiert offscreen über das paused-Prop). prefers-reduced-motion:
 * statisches A-Keyframe.
 */

import { useEffect, useId, useRef } from "react";
import { parsePath, lerpPath } from "./riverPath";

/* Kunden-Snippet-Geometrie (viewBox 200×200), 1:1 übernommen. */
const KLECKS_D =
  "M 40 100 C 10 50, 70 20, 100 40 C 140 10, 190 50, 170 90 C 190 140, 150 180, 110 160 C 70 190, 20 150, 40 100 Z";

/* 5 Wellenringe, je A/B-Keyframe (Kunden-@keyframes b-lr-1..5). */
const RINGE: { fill: string; a: string; b: string }[] = [
  {
    fill: "#52A8B6",
    a: "M105,30 C155,30 180,60 180,90 C180,125 150,150 105,150 C60,150 30,125 30,90 C30,60 55,30 105,30 Z",
    b: "M105,35 C150,30 185,65 175,95 C165,125 145,145 105,145 C65,145 40,125 35,95 C30,65 60,40 105,35 Z",
  },
  {
    fill: "#68BAC4",
    a: "M105,45 C140,45 160,70 160,90 C160,115 135,135 105,135 C70,135 50,115 50,90 C50,70 70,45 105,45 Z",
    b: "M105,40 C145,45 165,65 165,90 C165,115 140,140 105,140 C65,140 45,120 45,90 C45,65 65,35 105,40 Z",
  },
  {
    fill: "#81CAD4",
    a: "M105,60 C125,60 140,75 140,90 C140,105 120,120 105,120 C85,120 70,105 70,90 C70,75 85,60 105,60 Z",
    b: "M105,55 C130,55 145,80 145,95 C145,110 125,125 105,125 C80,125 65,110 65,90 C65,70 80,55 105,55 Z",
  },
  {
    fill: "#96D5D5",
    a: "M105,70 C115,70 125,80 125,90 C125,100 115,110 105,110 C95,110 85,100 85,90 C85,80 95,70 105,70 Z",
    b: "M105,75 C115,70 130,85 125,95 C120,105 110,105 105,105 C95,105 80,100 85,90 C90,80 95,80 105,75 Z",
  },
  {
    fill: "#BCE8E5",
    a: "M105,82 C110,82 112,85 112,90 C112,95 110,98 105,98 C100,98 98,95 98,90 C98,85 100,82 105,82 Z",
    b: "M105,80 C110,82 115,88 112,92 C109,96 105,95 105,95 C100,95 95,95 97,90 C99,85 100,78 105,80 Z",
  },
];

/* Kunden-Werte des Snippets. */
const GRUND_FILL = "#4395A7";
const SAND_STROKE_W = 18;
const SCHATTEN_STROKE = "rgba(38,62,36,0.6)";
const SCHATTEN_STROKE_W = 12;
const PERIODE_S = 8;

/* Mündung (Snippet-Raum): Aussparung im Sandring/Schatten am unteren
 * Klecks-Rand um die Mittelachse (x≈105), wo der Fluss den See verlässt. */
const MUENDUNG_X = 105;
const MUENDUNG_HALB_W = 46;
const MUENDUNG_AB_Y = 128;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

interface RiverLakeBlobProps {
  /** Klecks-Zentrum + Breite in Design-Einheiten (geometry.lakeBlob). */
  lake: { cx: number; cy: number; w: number };
  /** true = Zone offscreen → Ring-Atmung pausieren (wie RiverWaves). */
  paused: boolean;
}

export function RiverLakeBlob({ lake, paused }: RiverLakeBlobProps) {
  const uid = useId().replace(/:/g, "");
  const clipId = `lakeblob-clip-${uid}`;
  const blurId = `lakeblob-blur-${uid}`;
  const maskId = `lakeblob-muendung-${uid}`;
  const ringRefs = useRef<(SVGPathElement | null)[]>([]);

  /* Ring-Atmung: 8s alternate ease-in-out (Kundenwert), JS-Lerp. */
  useEffect(() => {
    const parsed = RINGE.map((r) => ({ a: parsePath(r.a), b: parsePath(r.b) }));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || paused) {
      RINGE.forEach((r, i) => ringRefs.current[i]?.setAttribute("d", r.a));
      return;
    }
    let raf = 0;
    let elapsed = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed += Math.min(now - last, 100);
      last = now;
      const phase = (elapsed / 1000) % (PERIODE_S * 2);
      const tri = phase < PERIODE_S ? phase / PERIODE_S : 2 - phase / PERIODE_S;
      const t = easeInOut(tri);
      parsed.forEach((p, i) => {
        ringRefs.current[i]?.setAttribute("d", lerpPath(p.a, p.b, t));
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  /* Snippet-Raum (200×200, Klecks-Zentrum ≈ (105,95)) → Design-Raum:
     Klecks-Zentrum auf lake.cx/cy (= Tropfen-Einschlagpunkt). */
  const s = lake.w / 200;
  const tx = lake.cx - 105 * s;
  const ty = lake.cy - 95 * s;

  return (
    <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(3)})`}>
      <defs>
        <clipPath id={clipId}>
          <path d={KLECKS_D} />
        </clipPath>
        <filter id={blurId}>
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {/* Mündungs-Aussparung: alles zeigen (weiß), unterer Rand um die
            Mittelachse verbergen (schwarz) — dort verlässt der Fluss den
            See, See-Wasser geht ohne braune Kante in Fluss-Wasser über. */}
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-20} y={-20} width={240} height={240}>
          <rect x={-20} y={-20} width={240} height={240} fill="#fff" />
          <rect
            x={MUENDUNG_X - MUENDUNG_HALB_W}
            y={MUENDUNG_AB_Y}
            width={MUENDUNG_HALB_W * 2}
            height={220 - MUENDUNG_AB_Y}
            fill="#000"
          />
        </mask>
      </defs>

      {/* Äußerer trockener Sand — GLEICHE Farbe wie das Fluss-Ufer
          (var(--bank-500) statt Snippet-Hex), sonst entstünde genau die
          Farbkante, die weg soll. An der Mündung ausgespart. */}
      <path
        d={KLECKS_D}
        fill="none"
        stroke="var(--bank-500)"
        strokeWidth={SAND_STROKE_W}
        strokeLinejoin="round"
        mask={`url(#${maskId})`}
      />

      <g clipPath={`url(#${clipId})`}>
        <rect width="200" height="200" fill={GRUND_FILL} />
        {RINGE.map((r, i) => (
          <path
            key={r.fill}
            ref={(el) => {
              ringRefs.current[i] = el;
            }}
            d={r.a}
            fill={r.fill}
          />
        ))}
        {/* Innerer Schatten (nasser Sand) — an der Mündung ebenfalls
            ausgespart, sonst stünde dort eine dunkle Linie im Übergang. */}
        <path
          d={KLECKS_D}
          fill="none"
          stroke={SCHATTEN_STROKE}
          strokeWidth={SCHATTEN_STROKE_W}
          filter={`url(#${blurId})`}
          mask={`url(#${maskId})`}
        />
      </g>
    </g>
  );
}
