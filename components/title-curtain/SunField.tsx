"use client";

/*
 * SunField – Licht-Schacht-Overlay über dem Wald der Titelkarte.
 *
 * Kundenfeedback: KEINE Sonnenscheibe, kein "Comicstyle"-Element mehr –
 * stattdessen ein Vollbild-Shader-Effekt: Licht, das von schräg oben durchs
 * Blätterdach fällt. Bewusst weiterhin Canvas statt SVG/WebGL – additive
 * Verläufe (globalCompositeOperation "lighter") ergeben das "Shader-Gefühl"
 * ohne Dependencies.
 *
 * Aufbau:
 * - Eine gemeinsame Lichtquelle AUSSERHALB des Bildes, oben, leicht rechts
 *   der Mitte (nie sichtbar als Punkt/Scheibe).
 * - 4–6 breite, sehr weiche Lichtbahnen, die von dort leicht schräg nach
 *   unten übers ganze Bild fächern. Die Weichzeichnung passiert EINMAL pro
 *   rebuild() auf einem Offscreen-Canvas (ctx.filter blur) – im rAF-Loop
 *   wird das fertige Sprite nur noch gedreht/skaliert gezeichnet
 *   (drawImage), das hält die Animation günstig.
 * - Ein großflächiger, sehr weicher warmer Schein um die Lichtquelle.
 * - Farbwelt warmweiß (#FFF7E6) → warmes Gelb/Orange (#F3A730), additiv,
 *   GERINGE Gesamt-Opacity – der Wald bleibt der Star, das Licht ist
 *   Atmosphäre, kein Motiv.
 * - Animation bewusst "unterschwellig": Die Bahnen schwenken extrem
 *   langsam gemeinsam (Blätter-/Quellen-Wiegen), jede Bahn atmet einzeln
 *   in der Intensität (Sinus, geseedete Phasen), dazu ein sehr sanftes,
 *   großflächiges Flimmern (zwei inkommensurable Sinus-Perioden) – ruhig
 *   und edel, kein Stroboskop.
 * - Layout deterministisch geseedet (mulberry32) – kein Math.random.
 * - prefers-reduced-motion: ein statischer Frame (Schwenk/Atmen/Flimmern
 *   eingefroren), kein Loop, nur ResizeObserver für Redraw.
 * - IntersectionObserver pausiert den Loop komplett, sobald der Canvas den
 *   Viewport verlässt (running-Flag, lastTime-Reset beim Wiedereinstieg –
 *   kein dt-Sprung nach der Pause).
 */

import { useEffect, useRef } from "react";

/* WEE-Kit-Farben als RGB-Tripel (Token-Hex, Canvas löst keine
   CSS-Variablen auf; rgba() braucht die Zahlen für den Alpha-Fade). */
const CORE_INNER = "255, 247, 230"; // #FFF7E6
const CORE_MID = "243, 167, 48"; // #F3A730
const GLOW_COLOR = "224, 165, 46"; // #E0A52E

const SEED = 811;

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

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface Shaft {
  angle: number; // rad, Winkel zur Senkrechten (0 = gerade nach unten), vor dem laufenden Schwenk
  sprite: HTMLCanvasElement; // vorgerendertes, weichgezeichnetes Bahn-Sprite
  spriteWidth: number; // px, Breite des Sprites (für die Zentrierung beim Zeichnen)
  spritePad: number; // px, Rand oberhalb des Quellpunkts im Sprite (Weichzeichner-Reserve)
  breathePhase: number;
  breatheSpeed: number; // rad/s
  breatheAmp: number; // relativer Anteil der Intensität, der "atmet" (0..1)
  scaleBreathePhase: number;
  scaleBreatheSpeed: number; // rad/s
  scaleBreatheAmp: number; // relative Längen-Variation, sehr klein
  peakAlpha: number; // maximale Deckkraft dieser Bahn
}

/* Lichtquelle: außerhalb der Bühne, oben, leicht rechts der Mitte */
const SOURCE_CX_FRAC = 0.58; // × Bühnenbreite
const SOURCE_CY_FRAC = -0.24; // × Bühnenhöhe (negativ = oberhalb des sichtbaren Bilds)

/* Großflächiger, sehr weicher warmer Schein um die Quelle */
const GLOW_RADIUS_FRAC = 0.95; // × Bühnenbreite
const GLOW_ALPHA_BASE = 0.06;
const GLOW_ALPHA_AMP = 0.035;
const GLOW_PULSE_PERIOD_S = 9;

/* Lichtbahnen: breit, weich, leicht schräg, übers ganze Bild gefächert */
const SHAFT_COUNT_MIN = 4;
const SHAFT_COUNT_MAX = 6;
const SHAFT_TARGET_X_MIN_FRAC = -0.1; // Zielpunkt-Streuung am unteren Bildrand
const SHAFT_TARGET_X_MAX_FRAC = 1.1;
const SHAFT_TARGET_Y_MIN_FRAC = 1.0; // × Bühnenhöhe – Bahnen laufen bis knapp unter/über den Rand aus
const SHAFT_TARGET_Y_MAX_FRAC = 1.4;
const SHAFT_TARGET_JITTER = 0.16; // zusätzliche Zufalls-Streuung der Zielposition
const SHAFT_WIDTH_MIN_FRAC = 0.16; // × Bühnenbreite, Breite am fernen Ende
const SHAFT_WIDTH_MAX_FRAC = 0.26;
const SHAFT_START_WIDTH_FRAC = 0.32; // × Endbreite – schmaler Ansatz nahe der Quelle
const SHAFT_BLUR_FRAC = 0.16; // × Endbreite – Weichzeichner-Radius des Sprites
const SHAFT_ALPHA_PEAK_MIN = 0.06;
const SHAFT_ALPHA_PEAK_MAX = 0.12;
const SHAFT_BREATHE_AMP_MIN = 0.18; // Anteil der Spitzen-Deckkraft, der pro Bahn "atmet"
const SHAFT_BREATHE_AMP_MAX = 0.4;
const SHAFT_BREATHE_PERIOD_MIN_S = 7;
const SHAFT_BREATHE_PERIOD_MAX_S = 14;
const SHAFT_SCALE_BREATHE_AMP_MIN = 0.015; // sehr kleine Längen-Variation – nur ein Hauch Leben
const SHAFT_SCALE_BREATHE_AMP_MAX = 0.04;
const SHAFT_SCALE_BREATHE_PERIOD_MIN_S = 10;
const SHAFT_SCALE_BREATHE_PERIOD_MAX_S = 19;

/* Gemeinsamer, extrem langsamer Schwenk der ganzen Lichtquelle (Blätter-/
   Wolkenwiegen) – bewusst unterschwellig, kein sichtbares "Schwanken" */
const SWAY_PERIOD_S = 58;
const SWAY_AMP_DEG = 3;

/* Sanftes, großflächiges Flimmern – zwei inkommensurable Perioden statt
   eines einzelnen Taktes, damit es nicht wie ein Stroboskop wirkt */
const FLICKER_PERIOD_A_S = 4.3;
const FLICKER_PERIOD_B_S = 6.7;
const FLICKER_AMP = 0.1;

const MAX_DT = 1 / 30; // Clamp gegen Tab-Wechsel/Lags (kein Sprung nach Pause)

/**
 * Rendert eine einzelne Lichtbahn EINMAL als weichgezeichnetes Sprite auf
 * ein Offscreen-Canvas. Die Bahn ist ein schmales Trapez (schmaler Ansatz
 * nahe der Quelle → breiter am fernen Ende), entlang der Länge von hell zu
 * transparent verlaufend. ctx.filter blur läuft nur hier, nicht im rAF-Loop.
 */
function buildShaftSprite(farWidth: number, length: number) {
  const startWidth = farWidth * SHAFT_START_WIDTH_FRAC;
  const blur = farWidth * SHAFT_BLUR_FRAC;
  const pad = blur * 2.2; // Reserve, damit der Weichzeichner nichts abschneidet
  const spriteWidth = Math.max(Math.ceil(farWidth + pad * 2), 1);
  const spriteHeight = Math.max(Math.ceil(length + pad * 2), 1);

  const sprite = document.createElement("canvas");
  sprite.width = spriteWidth;
  sprite.height = spriteHeight;
  const sctx = sprite.getContext("2d");
  if (!sctx) return { canvas: sprite, spriteWidth, pad };

  sctx.filter = `blur(${blur}px)`;
  const midX = spriteWidth / 2;
  const grad = sctx.createLinearGradient(0, pad, 0, pad + length);
  grad.addColorStop(0, `rgba(${CORE_INNER}, 0.85)`);
  grad.addColorStop(0.45, `rgba(${CORE_MID}, 0.45)`);
  grad.addColorStop(1, `rgba(${CORE_MID}, 0)`);
  sctx.fillStyle = grad;
  sctx.beginPath();
  sctx.moveTo(midX - startWidth / 2, pad);
  sctx.lineTo(midX + startWidth / 2, pad);
  sctx.lineTo(midX + farWidth / 2, pad + length);
  sctx.lineTo(midX - farWidth / 2, pad + length);
  sctx.closePath();
  sctx.fill();

  return { canvas: sprite, spriteWidth, pad };
}

export function SunField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let shafts: Shaft[] = [];
    let raf = 0;
    let running = true; // Sichtbarkeits-Gate: false, solange der Canvas außerhalb des Viewports liegt
    let lastTime = performance.now();
    /* Eigener Zeit-Akkumulator statt (now - t0): wird nur vorangetrieben,
       während die Loop läuft – friert also während einer Sichtbarkeits-
       Pause ein, statt beim Wiedereinstieg die verstrichene Realzeit
       nachzuholen (sonst "springt" der Schwenk nach langem Scrollen). */
    let elapsed = 0;

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sourceX = width * SOURCE_CX_FRAC;
      const sourceY = height * SOURCE_CY_FRAC;

      const rng = makeRng(SEED);
      const count =
        SHAFT_COUNT_MIN +
        Math.floor(rng() * (SHAFT_COUNT_MAX - SHAFT_COUNT_MIN + 1));
      shafts = [];
      for (let i = 0; i < count; i++) {
        /* Zielpunkte gleichmäßig über die Bildbreite verteilt + Jitter,
           damit die Bahnen nicht wie ein perfektes Raster wirken */
        const spread = count === 1 ? 0.5 : i / (count - 1);
        const jitter = (rng() - 0.5) * SHAFT_TARGET_JITTER;
        const targetXFrac =
          SHAFT_TARGET_X_MIN_FRAC +
          (spread + jitter) * (SHAFT_TARGET_X_MAX_FRAC - SHAFT_TARGET_X_MIN_FRAC);
        const targetX = width * targetXFrac;
        const targetY =
          height *
          (SHAFT_TARGET_Y_MIN_FRAC +
            rng() * (SHAFT_TARGET_Y_MAX_FRAC - SHAFT_TARGET_Y_MIN_FRAC));

        const dx = targetX - sourceX;
        const dy = targetY - sourceY; // stets > 0: Ziel liegt unterhalb der Quelle
        const length = Math.sqrt(dx * dx + dy * dy);
        /* Rotationswinkel zur Senkrechten, passend zu ctx.rotate() weiter
           unten (0 = Sprite wächst gerade nach unten aus der Quelle) */
        const angle = Math.atan2(-dx, dy);

        const farWidth =
          width *
          (SHAFT_WIDTH_MIN_FRAC + rng() * (SHAFT_WIDTH_MAX_FRAC - SHAFT_WIDTH_MIN_FRAC));
        const { canvas: sprite, spriteWidth, pad } = buildShaftSprite(farWidth, length);

        shafts.push({
          angle,
          sprite,
          spriteWidth,
          spritePad: pad,
          breathePhase: rng() * Math.PI * 2,
          breatheSpeed:
            (Math.PI * 2) /
            (SHAFT_BREATHE_PERIOD_MIN_S +
              rng() * (SHAFT_BREATHE_PERIOD_MAX_S - SHAFT_BREATHE_PERIOD_MIN_S)),
          breatheAmp:
            SHAFT_BREATHE_AMP_MIN +
            rng() * (SHAFT_BREATHE_AMP_MAX - SHAFT_BREATHE_AMP_MIN),
          scaleBreathePhase: rng() * Math.PI * 2,
          scaleBreatheSpeed:
            (Math.PI * 2) /
            (SHAFT_SCALE_BREATHE_PERIOD_MIN_S +
              rng() *
                (SHAFT_SCALE_BREATHE_PERIOD_MAX_S - SHAFT_SCALE_BREATHE_PERIOD_MIN_S)),
          scaleBreatheAmp:
            SHAFT_SCALE_BREATHE_AMP_MIN +
            rng() * (SHAFT_SCALE_BREATHE_AMP_MAX - SHAFT_SCALE_BREATHE_AMP_MIN),
          peakAlpha:
            SHAFT_ALPHA_PEAK_MIN + rng() * (SHAFT_ALPHA_PEAK_MAX - SHAFT_ALPHA_PEAK_MIN),
        });
      }
    };

    const draw = (t: number, animate: boolean) => {
      const sourceX = width * SOURCE_CX_FRAC;
      const sourceY = height * SOURCE_CY_FRAC;

      const sway = animate
        ? ((Math.sin((t * Math.PI * 2) / SWAY_PERIOD_S) * SWAY_AMP_DEG * Math.PI) / 180)
        : 0;
      const flicker = animate
        ? 1 +
          FLICKER_AMP *
            0.5 *
            (Math.sin((t * Math.PI * 2) / FLICKER_PERIOD_A_S) +
              Math.sin((t * Math.PI * 2) / FLICKER_PERIOD_B_S + 1.7))
        : 1;
      const glowPulse = animate
        ? 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / GLOW_PULSE_PERIOD_S)
        : 0.5;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      /* Großflächiger, sehr weicher warmer Schein um die Lichtquelle –
         KEIN harter Kern, nur ein Hauch Wärme oben im Bild. */
      const glowRadius = width * GLOW_RADIUS_FRAC;
      const glowAlpha = clamp01((GLOW_ALPHA_BASE + GLOW_ALPHA_AMP * glowPulse) * flicker);
      const glowGrad = ctx.createRadialGradient(
        sourceX,
        sourceY,
        0,
        sourceX,
        sourceY,
        glowRadius,
      );
      glowGrad.addColorStop(0, `rgba(${GLOW_COLOR}, ${glowAlpha})`);
      glowGrad.addColorStop(1, `rgba(${GLOW_COLOR}, 0)`);
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(sourceX, sourceY, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      /* Lichtbahnen – vorgerenderte, weichgezeichnete Sprites, nur gedreht/
         skaliert/mit atmender Deckkraft gezeichnet (kein Blur pro Frame). */
      for (const shaft of shafts) {
        ctx.save();
        ctx.translate(sourceX, sourceY);
        ctx.rotate(shaft.angle + sway);

        const scaleBreathe = animate
          ? 1 +
            Math.sin(t * shaft.scaleBreatheSpeed + shaft.scaleBreathePhase) *
              shaft.scaleBreatheAmp
          : 1;
        ctx.scale(1, scaleBreathe);

        const breathe = animate
          ? 0.5 + 0.5 * Math.sin(t * shaft.breatheSpeed + shaft.breathePhase)
          : 0.5;
        const alphaFactor = 1 - shaft.breatheAmp + shaft.breatheAmp * breathe;
        ctx.globalAlpha = clamp01(shaft.peakAlpha * alphaFactor * flicker);

        ctx.drawImage(shaft.sprite, -shaft.spriteWidth / 2, -shaft.spritePad);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(Math.max(rawDt, 0), MAX_DT);
      lastTime = now;
      elapsed += dt;
      draw(elapsed, true);
      raf = requestAnimationFrame(loop);
    };

    rebuild();

    if (reduced) {
      /* Ein statischer Frame – Schwenk/Atmen/Flimmern eingefroren */
      draw(0, false);
      const ro = new ResizeObserver(() => {
        rebuild();
        draw(0, false);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    const ro = new ResizeObserver(rebuild);
    ro.observe(canvas);
    /* Sichtbarkeits-Gate: pausiert die Loop komplett, sobald der Canvas den
       Viewport verlässt (der Vorhang unmountet nie) – verhindert
       unsichtbares Dauer-Rechnen bei ~60fps. */
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!running) {
          running = true;
          lastTime = performance.now(); // kein dt-Sprung beim Wiedereinstieg
          raf = requestAnimationFrame(loop);
        }
      } else if (running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="tc-sun" aria-hidden="true" />;
}
