"use client";

/*
 * FaunaField – Blumen, Bienen, Vögel und fallende Blätter für die Titelkarte.
 *
 * Bewusst Canvas statt DOM (Vorlage: GrassField) – viele individuell
 * animierte Kleinlebewesen sind prozedural gezeichnet trivial, im DOM
 * teuer. Ein einziges requestAnimationFrame, delta-time-basiert.
 *
 * - Blumen: statischer Bestand (Position/Größe/Farbe deterministisch
 *   geseedet), leichtes Wiegen um den Stammfuß. Fußpunkt UND Blütenkopf
 *   hängen an festen px-Bändern relativ zur Bildunterkante (nicht an
 *   Prozent der Bühnenhöhe) – auf großen Screens skaliert eine
 *   Prozent-Kopplung sonst so weit hoch, dass Blüten vor Baumstämmen in
 *   der Bildmitte schweben (Kundenfeedback: "die Blumen … sind nicht so
 *   wie der Rasen an die untere Kante gebunden"). Fuß sitzt wie ein
 *   Gras-Halm direkt an der Kante, Blütenkopf-Zentrum bleibt innerhalb
 *   der Gras-Silhouette (~22–55px über der Kante) – Stiele entsprechend
 *   kurz.
 * - Bienen: kleine Zustandsmaschine (anfliegen → landen → sitzen →
 *   weiterfliegen), organischer Sinus-Jitter auf dem Anflugpfad, pro
 *   Biene versetzte Phasen/Sitzzeiten, damit nie alle synchron wirken.
 * - Vögel: gleiten in flachen Bögen quer durchs obere Drittel, fliegen
 *   über den Rand hinaus und kehren nach individueller Pause zurück,
 *   gelegentliches Flügelschlag-Intervall zwischen Gleitphasen.
 * - Blätter: kleine Zustandsmaschine pro Slot (waiting → falling →
 *   grounded/ausfadend → respawn). Lösen sich geseedet aus dem
 *   Kronenbereich (~8–45 % der Höhe), taumeln mit Sinus-Pendel
 *   (horizontal), kontinuierlicher Rotation (mit gelegentlichem
 *   Richtungswechsel) und Pseudo-3D-Flip (scaleY-Oszillation) über
 *   ~6–12 s zu Boden, liegen dort kurz und faden über
 *   `LEAF_FADE_TIME` aus. Ein sehr langsamer globaler Sinus-"Wind"
 *   (eigene Zeitbasis, ~5 s Periode, kleine Amplitude) schiebt alle
 *   fallenden Blätter kohärent mit – kein Zugriff auf GrassField
 *   nötig. Bewusst dezent gehalten (5–9 Slots gleichzeitig aktiv,
 *   Staffelung geseedet) – Rieseln, kein Herbststurm.
 * - Maus/Touch (pointermove auf window – der Canvas bleibt
 *   pointer-events:none): Bienen im Radius fliehen mit gedämpftem
 *   Impuls, gelandete Bienen starten sofort; Vögel weichen sanft mit
 *   einem gedämpften Vertikal-Offset aus (kein Teleport); fallende
 *   Blätter im ~80px-Radius bekommen einen kleinen, gedämpften
 *   Wegdrift-Impuls (federt danach sanft zurück).
 * - prefers-reduced-motion: ein statischer Frame nur mit den Blumen,
 *   kein Loop, keine Tiere, keine Blätter, keine Listener (bis auf
 *   ResizeObserver für Redraw – wie in GrassField).
 */

import { useEffect, useRef } from "react";

/* WEE-Kit-Farben (Token-Hex, Canvas löst keine CSS-Variablen auf).
   Weiß dominiert, Orange ist bewusst der seltenere Akzent ("sparsam"). */
const PETAL_COLORS = [
  "#FFFFFF",
  "#FFFFFF",
  "#FFFFFF",
  "#FFFFFF",
  "#F3A730",
  "#EA8914",
];
const FLOWER_CENTER = "#143021";
const STEM_COLOR = "#143021";
const BEE_BODY = "#E0A52E";
const BEE_DARK = "#16201A";
const BIRD_COLOR = "#0E2117";
/* Blattfarben – Grüntöne dominieren, warme Herbsttöne sind der seltenere
   Akzent (2 von 8 Einträgen ≈ ~1 von 4), analog zur Blüten-Verteilung oben. */
const LEAF_COLORS = [
  "#72AC43",
  "#8FBF64",
  "#B0D38C",
  "#72AC43",
  "#8FBF64",
  "#B0D38C",
  "#F3A730",
  "#CBB389",
];

const SEED = 137;

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

/* ------------------------------------------------------------------ */
/* Datentypen                                                          */
/* ------------------------------------------------------------------ */

interface Flower {
  x: number;
  baseY: number;
  stemH: number;
  headR: number;
  petalColor: string;
  swayPhase: number;
  swaySpeed: number;
  swayAmp: number;
}

type BeeState = "flying" | "landed";

interface Bee {
  x: number;
  y: number;
  vx: number;
  vy: number;
  drawX: number;
  drawY: number;
  state: BeeState;
  targetIdx: number;
  landedUntil: number;
  jx: number;
  jy: number;
  jFreqX: number;
  jFreqY: number;
  jAmpX: number;
  jAmpY: number;
  wingPhase: number;
  wingSpeed: number;
}

interface Bird {
  x: number;
  y0: number;
  amplitude: number;
  freq: number;
  phase: number;
  speed: number;
  dir: 1 | -1;
  active: boolean;
  pauseUntil: number;
  avoidOffsetY: number;
  avoidVelY: number;
  wingPhase: number;
  flapping: boolean;
  flapEndAt: number;
  nextFlapAt: number;
  drawY: number;
  wingAngle: number;
}

type LeafState = "waiting" | "falling" | "grounded";

interface Leaf {
  spawnX: number;
  spawnY: number;
  groundY: number;
  fallDuration: number;
  fallElapsed: number;
  x: number;
  y: number;
  swayPhase: number;
  swaySpeed: number;
  swayAmp: number;
  rotation: number;
  rotSpeed: number;
  rotFlipAt: number;
  flipPhase: number;
  flipSpeed: number;
  size: number;
  color: string;
  driftX: number;
  driftVelX: number;
  state: LeafState;
  groundedAt: number;
  restTime: number;
  opacity: number;
  nextAt: number;
}

/* Maus-Reaktion (Radien/Kräfte) */
const BEE_MOUSE_RADIUS = 120;
const BEE_FLEE_FORCE = 620;
const BEE_STIFFNESS = 0.11;
const BEE_DAMPING = 0.86;

const BIRD_AVOID_RADIUS = 230;
const BIRD_AVOID_STRENGTH = 42;
const BIRD_AVOID_STIFFNESS = 0.1;
const BIRD_AVOID_DAMPING = 0.86;

/* Fallende Blätter – dezentes Rieseln, keine Sturmböe */
const LEAF_BASE_OPACITY = 0.85;
const LEAF_FADE_TIME = 2; // s, Ausfaden am Boden
const LEAF_WIND_FREQ = (Math.PI * 2) / 5; // ~5s Periode, an Gras-Wind angelehnt
const LEAF_WIND_AMPLITUDE = 7; // px, sehr sanfter globaler Drift

const LEAF_MOUSE_RADIUS = 80;
const LEAF_MOUSE_FORCE = 70;
const LEAF_DRIFT_STIFFNESS = 0.08;
const LEAF_DRIFT_DAMPING = 0.9;

/* ------------------------------------------------------------------ */
/* Zeichnen                                                             */
/* ------------------------------------------------------------------ */

function drawFlower(
  ctx: CanvasRenderingContext2D,
  f: Flower,
  t: number,
  animate: boolean,
) {
  const angle = animate ? Math.sin(t * f.swaySpeed + f.swayPhase) * f.swayAmp : 0;
  ctx.save();
  ctx.translate(f.x, f.baseY);
  ctx.rotate(angle);

  ctx.strokeStyle = STEM_COLOR;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(f.stemH * 0.12, -f.stemH * 0.55, 0, -f.stemH);
  ctx.stroke();

  const cy = -f.stemH;
  const petalR = f.headR * 0.52;
  ctx.fillStyle = f.petalColor;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(
      Math.cos(a) * f.headR * 0.5,
      cy + Math.sin(a) * f.headR * 0.5,
      petalR,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.fillStyle = FLOWER_CENTER;
  ctx.beginPath();
  ctx.arc(0, cy, f.headR * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBee(ctx: CanvasRenderingContext2D, b: Bee, t: number) {
  ctx.save();
  ctx.translate(b.drawX, b.drawY);
  const facing = b.vx < -0.02 ? -1 : 1;
  ctx.scale(facing, 1);

  const flap = b.state === "landed" ? 0 : Math.sin(t * b.wingSpeed + b.wingPhase);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (const s of [1, -1]) {
    ctx.save();
    ctx.translate(s * 1.1, -3.2);
    ctx.rotate(s * (flap * 0.55 + 0.25));
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.fillStyle = BEE_BODY;
  ctx.beginPath();
  ctx.ellipse(0.6, 0.8, 4.4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BEE_DARK;
  ctx.beginPath();
  ctx.ellipse(-4.2, 0.2, 2, 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(2.4, 1, 1.1, 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLeaf(ctx: CanvasRenderingContext2D, leaf: Leaf) {
  if (leaf.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = LEAF_BASE_OPACITY * leaf.opacity;
  ctx.translate(leaf.x, leaf.y);
  ctx.rotate(leaf.rotation);
  /* Pseudo-3D-Flip: scaleY oszilliert zwischen "von der Kante" (schmal)
     und "flach zur Kamera" (voll) – simuliert ein taumelndes Blatt ohne
     echtes 3D. */
  const flip = Math.abs(Math.sin(leaf.flipPhase));
  ctx.scale(1, 0.3 + flip * 0.7);
  ctx.fillStyle = leaf.color;
  const r = leaf.size / 2;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(r * 0.85, -r * 0.15, 0, r);
  ctx.quadraticCurveTo(-r * 0.85, -r * 0.15, 0, -r);
  ctx.fill();
  ctx.strokeStyle = "rgba(20,48,33,0.28)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.75);
  ctx.lineTo(0, r * 0.75);
  ctx.stroke();
  ctx.restore();
}

function drawBird(ctx: CanvasRenderingContext2D, bird: Bird) {
  ctx.save();
  ctx.translate(bird.x, bird.drawY);
  ctx.scale(bird.dir, 1);
  ctx.strokeStyle = BIRD_COLOR;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const lift = 5 + bird.wingAngle * 7;
  ctx.beginPath();
  ctx.moveTo(-11, 0.5);
  ctx.quadraticCurveTo(-4.5, -lift, 0, 0.5);
  ctx.quadraticCurveTo(4.5, -lift, 11, 0.5);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------------ */

export function FaunaField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let flowers: Flower[] = [];
    let bees: Bee[] = [];
    let birds: Bird[] = [];
    let leaves: Leaf[] = [];
    let raf = 0;
    let running = true;
    let lastNow = performance.now();
    const t0 = lastNow;
    const mouse = { x: -9999, y: -9999 };
    /* Laufzeit-Entscheidungen (nächste Blüte, Sitzzeit, Vogel-Respawn)
       ziehen aus einem eigenen, während der ganzen Sitzung fortlaufenden
       Generator – deterministisch pro Lauf, unabhängig vom Layout-Rebuild. */
    const rng = makeRng(SEED);

    const buildFlowers = (rngFn: () => number): Flower[] => {
      const count = 6 + Math.floor(rngFn() * 4); // 6–9
      /* Feste px-Bänder relativ zur Bildunterkante – bewusst KEINE Kopplung
         an Prozent der Bühnenhöhe mehr (die alte grassH-Formel skalierte
         auf großen Screens weit hoch und ließ Blüten in der Bildmitte vor
         Baumstämmen schweben, s. Datei-Kopfkommentar). Fußpunkt verwurzelt
         wie ein Gras-Halm direkt an der Unterkante, Blütenkopf-Zentrum
         bleibt in der Gras-Silhouette (die optisch ~60–110px hoch reicht). */
      const FOOT_MAX_OFFSET = 8; // baseY zwischen height und height-8
      const HEAD_MIN_OFFSET = 22; // Kopf-Zentrum mind. 22px über der Kante
      const HEAD_MAX_OFFSET = 55; // Kopf-Zentrum höchstens 55px über der Kante
      const list: Flower[] = [];
      for (let i = 0; i < count; i++) {
        const x =
          ((i + 0.5) / count) * width + (rngFn() - 0.5) * (width / count) * 0.6;
        const baseY = height - rngFn() * FOOT_MAX_OFFSET;
        const headY =
          height - HEAD_MIN_OFFSET - rngFn() * (HEAD_MAX_OFFSET - HEAD_MIN_OFFSET);
        list.push({
          x,
          baseY,
          stemH: baseY - headY,
          headR: 6 + rngFn() * 4,
          petalColor: PETAL_COLORS[Math.floor(rngFn() * PETAL_COLORS.length)],
          swayPhase: rngFn() * Math.PI * 2,
          swaySpeed: 0.5 + rngFn() * 0.4,
          swayAmp: 0.05 + rngFn() * 0.06,
        });
      }
      return list;
    };

    const buildBees = (
      rngFn: () => number,
      flowerList: Flower[],
      tNow: number,
    ): Bee[] => {
      const count = 3 + Math.floor(rngFn() * 2); // 3–4
      const list: Bee[] = [];
      for (let i = 0; i < count; i++) {
        const idx = i % flowerList.length;
        const f = flowerList[idx];
        const y = f.baseY - f.stemH - f.headR - 3;
        list.push({
          x: f.x,
          y,
          vx: 0,
          vy: 0,
          drawX: f.x,
          drawY: y,
          state: "landed",
          targetIdx: idx,
          landedUntil: tNow + 1 + rngFn() * 3, // gestaffelter erster Start, relativ zur Laufzeit
          jx: rngFn() * Math.PI * 2,
          jy: rngFn() * Math.PI * 2,
          jFreqX: 1.1 + rngFn() * 0.6,
          jFreqY: 1.5 + rngFn() * 0.7,
          jAmpX: 10 + rngFn() * 8,
          jAmpY: 7 + rngFn() * 6,
          wingPhase: rngFn() * Math.PI * 2,
          wingSpeed: 24 + rngFn() * 10,
        });
      }
      return list;
    };

    const buildBirds = (rngFn: () => number, tNow: number): Bird[] => {
      const count = 2 + Math.floor(rngFn() * 2); // 2–3
      const list: Bird[] = [];
      for (let i = 0; i < count; i++) {
        const dir: 1 | -1 = rngFn() < 0.5 ? 1 : -1;
        list.push({
          x: rngFn() * width, // beim Mount bereits mitten im Bild sichtbar
          y0: height * 0.06 + rngFn() * height * 0.24,
          amplitude: 14 + rngFn() * 20,
          freq: 0.003 + rngFn() * 0.003,
          phase: rngFn() * Math.PI * 2,
          speed: 42 + rngFn() * 28,
          dir,
          active: true,
          pauseUntil: 0,
          avoidOffsetY: 0,
          avoidVelY: 0,
          wingPhase: rngFn() * Math.PI * 2,
          flapping: false,
          flapEndAt: 0,
          nextFlapAt: tNow + 1 + rngFn() * 3, // relativ zur Laufzeit
          drawY: 0,
          wingAngle: 0,
        });
      }
      return list;
    };

    /* Erzeugt (bzw. bei Respawn: re-initialisiert) einen einzelnen Blatt-Slot.
       tNow relativ zur Laufzeit, damit rotFlipAt nach einem Rebuild nicht in
       der Vergangenheit liegt (gleiches Problem/gleiche Lösung wie bei
       Bienen/Vögeln, s. rebuild()). */
    const spawnLeaf = (rngFn: () => number, tNow: number): Leaf => {
      const spawnX = rngFn() * width;
      const spawnY = height * (0.08 + rngFn() * 0.37); // 8–45 % der Höhe
      const groundY = height - (40 + rngFn() * 30); // 40–70px über der Kante
      const fallDuration = 6 + rngFn() * 6; // 6–12s
      return {
        spawnX,
        spawnY,
        groundY,
        fallDuration,
        fallElapsed: 0,
        x: spawnX,
        y: spawnY,
        swayPhase: rngFn() * Math.PI * 2,
        swaySpeed: 0.7 + rngFn() * 0.5,
        swayAmp: 10 + rngFn() * 14,
        rotation: rngFn() * Math.PI * 2,
        rotSpeed: (rngFn() < 0.5 ? -1 : 1) * (0.4 + rngFn() * 0.5),
        rotFlipAt: tNow + 2 + rngFn() * 3,
        flipPhase: rngFn() * Math.PI * 2,
        flipSpeed: 1.1 + rngFn() * 0.7,
        size: 8 + rngFn() * 6,
        color: LEAF_COLORS[Math.floor(rngFn() * LEAF_COLORS.length)],
        driftX: 0,
        driftVelX: 0,
        state: "falling",
        groundedAt: 0,
        restTime: 0.4 + rngFn() * 1.0,
        opacity: 1,
        nextAt: 0,
      };
    };

    const buildLeaves = (rngFn: () => number, tNow: number): Leaf[] => {
      const count = 5 + Math.floor(rngFn() * 5); // 5–9 gleichzeitig aktive Slots
      const list: Leaf[] = [];
      for (let i = 0; i < count; i++) {
        const leaf = spawnLeaf(rngFn, tNow);
        /* Staffelung beim (Neu-)Aufbau, damit nicht alle Blätter ab Frame 0
           synchron fallen: ein Teil startet bereits mitten im Fall, ein Teil
           liegt schon (kurz vorm Ausfaden) am Boden, ein kleiner Rest wartet
           noch auf seinen ersten Spawn. */
        const phase = rngFn();
        if (phase < 0.6) {
          leaf.fallElapsed = rngFn() * leaf.fallDuration;
        } else if (phase < 0.85) {
          leaf.state = "grounded";
          leaf.fallElapsed = leaf.fallDuration;
          leaf.groundedAt = tNow - rngFn() * leaf.restTime;
        } else {
          leaf.state = "waiting";
          leaf.nextAt = tNow + rngFn() * 4;
        }
        list.push(leaf);
      }
      return list;
    };

    const rebuild = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Aktuelle Laufzeit (relativ zu t0) – Timer neu gebauter Bienen/Vögel
      // werden relativ dazu gesetzt, sonst liegen sie nach einem Resize in
      // der Vergangenheit und alle Tiere lösen synchron aus.
      const tNow = (performance.now() - t0) / 1000;
      const layoutRng = makeRng(SEED);
      flowers = buildFlowers(layoutRng);
      if (!reduced) {
        bees = buildBees(layoutRng, flowers, tNow);
        birds = buildBirds(layoutRng, tNow);
        leaves = buildLeaves(layoutRng, tNow);
      }
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      for (const f of flowers) drawFlower(ctx, f, 0, false);
    };

    rebuild();

    if (reduced) {
      drawStatic();
      const ro = new ResizeObserver(() => {
        rebuild();
        drawStatic();
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    const pickNextFlower = (current: number): number => {
      if (flowers.length <= 1) return current;
      let next = Math.floor(rng() * flowers.length);
      if (next === current) next = (next + 1) % flowers.length;
      return next;
    };

    const updateBee = (b: Bee, dt: number, t: number) => {
      if (b.state === "landed") {
        const target = flowers[b.targetIdx];
        const tx = target.x;
        const ty = target.baseY - target.stemH - target.headR - 3;
        b.x = tx;
        b.y = ty;
        b.drawX = tx;
        b.drawY = ty;

        const distMouse = Math.hypot(tx - mouse.x, ty - mouse.y);
        if (distMouse < BEE_MOUSE_RADIUS) {
          const away = Math.max(distMouse, 1);
          b.vx = ((tx - mouse.x) / away) * 160;
          b.vy = ((ty - mouse.y) / away) * 160;
          b.state = "flying";
          b.targetIdx = pickNextFlower(b.targetIdx);
        } else if (t >= b.landedUntil) {
          b.state = "flying";
          b.targetIdx = pickNextFlower(b.targetIdx);
        }
        return;
      }

      const target = flowers[b.targetIdx];
      const nx = target.x;
      const ny = target.baseY - target.stemH - target.headR - 3;
      const jitterX = Math.sin(t * b.jFreqX + b.jx) * b.jAmpX;
      const jitterY =
        Math.sin(t * b.jFreqY + b.jy) * b.jAmpY +
        Math.sin(t * b.jFreqX * 1.7 + b.jy * 1.3) * b.jAmpY * 0.4;
      const desiredX = nx + jitterX;
      const desiredY = ny + jitterY;

      const step = dt * 60;
      b.vx =
        (b.vx + (desiredX - b.x) * BEE_STIFFNESS * step) * Math.pow(BEE_DAMPING, step);
      b.vy =
        (b.vy + (desiredY - b.y) * BEE_STIFFNESS * step) * Math.pow(BEE_DAMPING, step);

      const mdx = b.x - mouse.x;
      const mdy = b.y - mouse.y;
      const mdist = Math.hypot(mdx, mdy);
      if (mdist < BEE_MOUSE_RADIUS && mdist > 0.001) {
        const s = 1 - mdist / BEE_MOUSE_RADIUS;
        b.vx += (mdx / mdist) * s * s * BEE_FLEE_FORCE * dt;
        b.vy += (mdy / mdist) * s * s * BEE_FLEE_FORCE * dt;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.drawX = b.x;
      b.drawY = b.y;

      const distToTarget = Math.hypot(b.x - nx, b.y - ny);
      const speed = Math.hypot(b.vx, b.vy);
      if (distToTarget < 6 && speed < 45) {
        b.state = "landed";
        b.landedUntil = t + 2 + rng() * 2; // 2–4s sitzen
      }
    };

    const updateBird = (bird: Bird, dt: number, t: number) => {
      if (!bird.active) {
        if (t >= bird.pauseUntil) {
          bird.active = true;
          bird.x = bird.dir === 1 ? -40 : width + 40;
          bird.y0 = height * 0.06 + rng() * height * 0.24;
          bird.amplitude = 14 + rng() * 20;
          bird.phase = rng() * Math.PI * 2;
          bird.speed = 42 + rng() * 28;
          bird.avoidOffsetY = 0;
          bird.avoidVelY = 0;
        }
        return;
      }

      bird.x += bird.dir * bird.speed * dt;
      const baseY = bird.y0 + Math.sin(bird.x * bird.freq + bird.phase) * bird.amplitude;

      const dx = bird.x - mouse.x;
      const dy = baseY - mouse.y;
      const dist = Math.hypot(dx, dy);
      let avoidTarget = 0;
      if (dist < BIRD_AVOID_RADIUS) {
        const s = 1 - dist / BIRD_AVOID_RADIUS;
        avoidTarget = Math.sign(dy || 1) * s * s * BIRD_AVOID_STRENGTH;
      }
      const step = dt * 60;
      bird.avoidVelY =
        (bird.avoidVelY + (avoidTarget - bird.avoidOffsetY) * BIRD_AVOID_STIFFNESS * step) *
        Math.pow(BIRD_AVOID_DAMPING, step);
      bird.avoidOffsetY += bird.avoidVelY * dt;
      bird.drawY = baseY + bird.avoidOffsetY;

      if (!bird.flapping && t >= bird.nextFlapAt) {
        bird.flapping = true;
        bird.flapEndAt = t + 0.4 + rng() * 0.3;
      }
      if (bird.flapping && t >= bird.flapEndAt) {
        bird.flapping = false;
        bird.nextFlapAt = t + 1.6 + rng() * 2.4;
      }
      bird.wingAngle = bird.flapping
        ? Math.sin(t * 13 + bird.wingPhase)
        : Math.sin(t * 1.3 + bird.wingPhase) * 0.2;

      const margin = 40;
      if ((bird.dir === 1 && bird.x > width + margin) || (bird.dir === -1 && bird.x < -margin)) {
        bird.active = false;
        bird.pauseUntil = t + 1.5 + rng() * 3.5;
      }
    };

    const updateLeaf = (leaf: Leaf, dt: number, t: number, windX: number) => {
      if (leaf.state === "waiting") {
        if (t >= leaf.nextAt) Object.assign(leaf, spawnLeaf(rng, t));
        return;
      }

      if (leaf.state === "falling") {
        leaf.fallElapsed += dt;
        const progress = Math.min(leaf.fallElapsed / leaf.fallDuration, 1);
        leaf.y = leaf.spawnY + (leaf.groundY - leaf.spawnY) * progress;

        if (t >= leaf.rotFlipAt) {
          leaf.rotSpeed *= -1; // gelegentlicher Richtungswechsel beim Taumeln
          leaf.rotFlipAt = t + 2 + rng() * 3;
        }
        leaf.rotation += leaf.rotSpeed * dt;
        leaf.flipPhase += leaf.flipSpeed * dt;

        const swayOffset = Math.sin(t * leaf.swaySpeed + leaf.swayPhase) * leaf.swayAmp;
        const targetX = leaf.spawnX + swayOffset;

        // Maus-Wegdrift: gedämpfte Feder zurück zu 0, plus Abstoßungsimpuls
        // im Radius – wie bei Bienen/Vögeln, nur deutlich subtiler.
        const step = dt * 60;
        leaf.driftVelX =
          (leaf.driftVelX + (0 - leaf.driftX) * LEAF_DRIFT_STIFFNESS * step) *
          Math.pow(LEAF_DRIFT_DAMPING, step);
        const probeX = targetX + leaf.driftX + windX;
        const mdx = probeX - mouse.x;
        const mdy = leaf.y - mouse.y;
        const mdist = Math.hypot(mdx, mdy);
        if (mdist < LEAF_MOUSE_RADIUS && mdist > 0.001) {
          const s = 1 - mdist / LEAF_MOUSE_RADIUS;
          leaf.driftVelX += (mdx / mdist) * s * s * LEAF_MOUSE_FORCE * dt;
        }
        leaf.driftX += leaf.driftVelX * dt;
        leaf.x = targetX + leaf.driftX + windX;

        if (progress >= 1) {
          leaf.state = "grounded";
          leaf.groundedAt = t;
          leaf.opacity = 1;
        }
        return;
      }

      // grounded: kurz liegen bleiben, dann über LEAF_FADE_TIME ausfaden
      const elapsed = t - leaf.groundedAt;
      if (elapsed < leaf.restTime) {
        leaf.opacity = 1;
      } else {
        leaf.opacity = Math.max(0, 1 - (elapsed - leaf.restTime) / LEAF_FADE_TIME);
        if (leaf.opacity <= 0) {
          leaf.state = "waiting";
          leaf.nextAt = t + 0.5 + rng() * 1.5; // Slot frei, kurze Pause bis Respawn
        }
      }
    };

    const draw = (now: number) => {
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;
      const t = (now - t0) / 1000;

      ctx.clearRect(0, 0, width, height);

      for (const f of flowers) drawFlower(ctx, f, t, true);
      for (const bird of birds) {
        updateBird(bird, dt, t);
        if (bird.active) drawBird(ctx, bird);
      }
      for (const b of bees) {
        updateBee(b, dt, t);
        drawBee(ctx, b, t);
      }
      // Pseudo-Wind: eine gemeinsame, sehr langsame Sinus-Zeitbasis für alle
      // fallenden Blätter – wirkt kohärent mit dem Gras-Wind, ohne dass
      // FaunaField auf GrassField zugreifen muss.
      const windX = Math.sin(t * LEAF_WIND_FREQ) * LEAF_WIND_AMPLITUDE;
      for (const leaf of leaves) {
        updateLeaf(leaf, dt, t, windX);
        drawLeaf(ctx, leaf);
      }
    };

    const loop = (now: number) => {
      draw(now);
      if (running) raf = requestAnimationFrame(loop);
    };

    const onPointer = (e: PointerEvent) => {
      if (!running) return;
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };
    /* pointerleave ist non-bubbling und feuert auf window praktisch nie
       (Chromium) – ohne diese zusätzlichen Reset-Wege bleibt mouse.x/y
       eingefroren, sobald die Maus das Fenster verlässt oder ein Touch
       endet, und Bienen/Vögel weichen dauerhaft einem Phantom-Cursor aus. */
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") onLeave();
    };

    const ro = new ResizeObserver(rebuild);
    ro.observe(canvas);
    /* Der Vorhang unmountet nie – ohne Sichtbarkeits-Gating läuft der
       Fullscreen-Canvas-Clear + die Simulation unsichtbar mit 60fps weiter,
       während der Nutzer den Rest der Seite liest. */
    const io = new IntersectionObserver(([entry]) => {
      const visible = entry?.isIntersecting ?? true;
      if (visible && !running) {
        running = true;
        lastNow = performance.now();
        raf = requestAnimationFrame(loop);
      } else if (!visible && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(canvas);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    window.addEventListener("pointercancel", onLeave);
    window.addEventListener("pointerup", onPointerUp);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("pointercancel", onLeave);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return <canvas ref={canvasRef} className="tc-fauna" aria-hidden="true" />;
}
