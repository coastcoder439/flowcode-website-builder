"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";

/**
 * Dezente, mitscrollende Flow-Textur (Design-Überarbeitung 2.0, Phase
 * "lebendige Sections"): nutzt die bereits bestehenden --texture-flow(-card)
 * Tokens statt eines neuen Deko-Motivs. Braucht ein Eltern-Element mit
 * `position: relative` (siehe globals.css, Sections mit `.section-texture`
 * als Kind) – der direkt folgende `.container` bekommt darüber automatisch
 * z-index:1, damit Inhalt über der Textur bleibt.
 */
export function TextureField({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-24, 24]);

  return (
    <motion.div
      ref={ref}
      className={`section-texture section-texture--${variant}`}
      style={{ y }}
      aria-hidden="true"
    />
  );
}
