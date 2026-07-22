"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";

type ShapeVariant = "arc" | "sunburst" | "blob-a" | "blob-b" | "blob-c";
type ShapeColor = "accent" | "green" | "sand";
type ShapePosition = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center";

const COLOR_VAR: Record<ShapeColor, string> = {
  accent: "var(--accent-500)",
  green: "var(--green-400)",
  sand: "var(--sand-300)",
};

const POSITION_CLASS: Record<ShapePosition, string> = {
  "top-right": "shape-accent--top-right",
  "top-left": "shape-accent--top-left",
  "bottom-right": "shape-accent--bottom-right",
  "bottom-left": "shape-accent--bottom-left",
  center: "shape-accent--center",
};

function ShapeSvg({ variant, color }: { variant: ShapeVariant; color: string }) {
  if (variant === "arc") {
    return (
      <svg viewBox="0 0 200 200" fill="none">
        <path d="M20 180 A160 160 0 0 1 180 20" stroke={color} strokeWidth="6" strokeLinecap="round" />
      </svg>
    );
  }
  if (variant === "sunburst") {
    const rays = Array.from({ length: 8 });
    return (
      <svg viewBox="0 0 200 200" fill="none">
        {rays.map((_, i) => {
          const angle = (i / rays.length) * Math.PI * 2;
          const x1 = 100 + Math.cos(angle) * 34;
          const y1 = 100 + Math.sin(angle) * 34;
          const x2 = 100 + Math.cos(angle) * 92;
          const y2 = 100 + Math.sin(angle) * 92;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="4" strokeLinecap="round" />;
        })}
      </svg>
    );
  }
  const blobPaths = {
    "blob-a": "M52 24C86 6 142 14 166 52C190 90 182 142 148 168C114 194 62 190 34 158C6 126 4 50 52 24Z",
    "blob-b": "M30 100C24 60 70 24 116 28C162 32 188 72 182 112C176 152 132 184 88 178C44 172 36 140 30 100Z",
    "blob-c": "M70 14C110 4 176 30 182 82C188 134 148 190 96 186C44 182 12 138 18 90C22 54 40 22 70 14Z",
  } satisfies Record<Exclude<ShapeVariant, "arc" | "sunburst">, string>;
  return (
    <svg viewBox="0 0 200 200" fill="none">
      <path d={blobPaths[variant as keyof typeof blobPaths]} fill={color} />
    </svg>
  );
}

/**
 * Kleines geometrisches Akzent-Motiv (Mid-Century: Bogen/Sunburst/Blob) --
 * immer an konkreten Content gebunden (siehe Einsatzstellen in Blocks.tsx),
 * kein freischwebendes Deko-Element (vgl. CLAUDE.md, "Design-Dichte"). Gleiche
 * Architektur wie TextureField.tsx: dezenter Scroll-Parallax, respektiert
 * prefers-reduced-motion. Braucht ein Eltern-Element mit `position: relative`
 * und eine Content-Geschwisterebene mit `z-index: 1` (siehe globals.css).
 */
export function ShapeAccent({
  variant,
  color = "accent",
  position = "top-right",
  size = 220,
  ogId,
  ogTyp,
}: {
  variant: ShapeVariant;
  color?: ShapeColor;
  position?: ShapePosition;
  size?: number;
  /** Website-OG-Tagging (AP-D, Welle 3a) — reine Attribute, kein Verhalten/
   *  keine Optik. Fehlen sie (z.B. auf /pilot-projekt), setzt React die
   *  data-Attribute schlicht nicht. */
  ogId?: string;
  ogTyp?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-16, 16]);

  return (
    <motion.div
      ref={ref}
      className={`shape-accent shape-accent--${variant} ${POSITION_CLASS[position]}`}
      style={{ y, width: size, height: size }}
      aria-hidden="true"
      data-og-id={ogId}
      data-og-typ={ogTyp}
    >
      <ShapeSvg variant={variant} color={COLOR_VAR[color]} />
    </motion.div>
  );
}
