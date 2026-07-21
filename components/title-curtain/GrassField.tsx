"use client";

/*
 * GrassField – interaktive Gras-Zone am unteren Rand der Titelkarte.
 *
 * Bewusst Canvas statt SVG: ein Feld-Effekt mit vielen individuell
 * physikalisch reagierenden Halmen (Wind-Wellen + Maus-Impuls mit
 * Rückfederung) ist im DOM teuer, prozedural gezeichnet trivial.
 * Ein einziges requestAnimationFrame, ~1 ms Zeichenzeit.
 *
 * - Halme: kubische Bezier-Kurven, Fuß fest verwurzelt am unteren Rand
 *   (keine Auslenkung an der Basis), Krümmung sitzt im oberen Drittel.
 *   Höhe/Farbe/Phase/Masse/Steifigkeit deterministisch geseedet
 *   (mulberry32) – kein Math.random.
 * - Tiefe: ~30 % der Halme bilden eine HINTERE Schicht (zuerst gezeichnet,
 *   dunkler, ~15 % kürzer), der Rest davor – gibt dem Feld Körper statt
 *   einer flachen "Kamm"-Silhouette.
 * - Drei Gras-Büschel an festen Positionen (links/Mitte/rechts, Kunden-
 *   feedback) – lokal deutlich dichtere, höhere, fächerförmig gebogene
 *   Bündel aus einem schmalen Fußpunkt-Bereich, gleiche Feder-Physik.
 * - Simulation: echtes Masse-Feder-Dämpfer-Modell, Delta-Time-integriert
 *   (nicht frame-gebunden) – bleibt bei Framerate-Schwankungen konsistent.
 *   Pro Halm leicht variierte Masse/Steifigkeit; schwerere, hohe Halme
 *   reagieren träger. Nahezu kritische Dämpfung → höchstens 1–2 sanfte
 *   Nachschwinger, kein Zappeln.
 * - Wind: leichtes Dauer-Wiegen aus zwei überlagerten Sinus-Wellen +
 *   deutlichere Böen-Welle (smootherstep²-Hülle statt hartem Puls), die
 *   räumlich durchs Feld läuft (x-abhängige Phase, < 1 Wellenlänge über die
 *   Feldbreite) – ca. alle 5 s eine erkennbare, kohärente Welle statt
 *   gleichzeitigem Wackeln. Büschel und hohe Halme reagieren auf Böen etwas
 *   stärker (Kundenfeedback: "Wind soll wahrnehmbar, aber dezent sein").
 * - Maus/Touch (pointermove auf window – der Canvas bleibt
 *   pointer-events:none): dominanter Anteil ist ein Geschwindigkeits-
 *   Impuls in Wischrichtung (wie eine Hand, die durchs Gras streicht),
 *   der Halme im Radius mitreißt und dann weich zurückpendeln lässt.
 *   Ein schwacher positionsbasierter Anteil biegt Halme zusätzlich leicht
 *   von einer ruhig stehenden Maus weg. Weicher räumlicher Falloff
 *   (smootherstep) statt quadratisch.
 * - Wachstums-Intro: Halme wachsen beim Mount gestaffelt hoch.
 * - prefers-reduced-motion: ein statischer Frame, kein Loop, kein Listener.
 */

import { useEffect, useRef } from "react";

/* Vordergrund-Vegetation: dunkelste Töne + wenige Lichter (Token-Hex,
   da Canvas keine CSS-Variablen auflöst). */
const BLADE_COLORS = ["#0E2117", "#143021", "#0E2117", "#1E4530", "#143021"];
const LIGHT_COLOR = "#2C5234";

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

/* Hermite-Smootherstep (6t^5-15t^4+10t^3): weicherer Ein-/Ausblend­verlauf
   als klassisches smoothstep, ohne Krümmungssprung an den Rändern. */
function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

interface Blade {
  x: number;
  baseY: number;
  h: number;
  w: number;
  color: string;
  lean: number; // Grundneigung
  phase: number; // Wind-Phase
  growDelay: number;
  bend: number; // Federzustand: aktuelle Spitzen-Auslenkung (px)
  vel: number; // Auslenkungs-Geschwindigkeit (px/s)
  mass: number; // Trägheit – höher bei hohen Halmen → reagieren träger
  stiffness: number; // Federkonstante (leicht pro Halm variiert)
  damping: number; // Dämpfungskoeffizient, aus Ziel-Dämpfungsgrad abgeleitet
  layer: "back" | "front"; // Tiefen-Ebene: back zuerst gezeichnet
  isTuft: boolean; // Teil eines Büschels – reagiert stärker auf Böen (größerer Hebel)
}

/* Wind (Kundenfeedback: "Wind nicht wahrnehmbar, aber dezent gewünscht"):
   Grundwelle + feine Welle sind das ständige, sanfte Wiegen des Feldes und
   dafür leicht zurückgenommen; die überlagerte Böen-Welle ist der einzige
   klar erkennbare Wind-Impuls und dafür deutlicher. Die Böen-Phase koppelt
   Zeit (Zyklus) und x-Position (räumlicher Gradient < 1 Wellenlänge über
   die Feldbreite) – das liest sich als eine kohärente, seitlich laufende
   Welle statt als gleichzeitiges Wackeln aller Halme. */
const WIND_BASE_AMPLITUDE = 5; // Grundwelle, dauerndes Wiegen (vorher 6)
const WIND_FINE_AMPLITUDE = 2.2; // feine Welle, Dauer-Zittern (vorher 3)
const WIND_GUST_AMPLITUDE = 17; // Böen-Ausschlag (vorher 13) – jetzt der dominante, sichtbare Anteil
const WIND_GUST_FREQ = 1.2566; // Böen-Zyklus ≈ 2π/1.2566 ≈ 5.0 s (Kundenfeedback: alle ~5 s eine erkennbare Böe)
const WIND_GUST_SPATIAL = 0.0016; // x-Phase der Böe: knapp unter einer vollen Wellenlänge über typische Feldbreiten
const WIND_GUST_HEIGHT_FACTOR = 0.15; // sehr dezente Zusatz-Staffelung: hohe Halme reagieren auf Böen minimal stärker
const WIND_GUST_TUFT_BOOST = 1.3; // Büschel reagieren auf Böen stärker als das Feld (größerer Hebel, verkauft den Wind)

/* Maus-Interaktion (Kundenfeedback: "reagiert zu wenig" – Reaktion deutlich
   verstärkt, Feder bleibt weich: keine Änderung an Steifigkeit/Dämpfung) */
const MOUSE_RADIUS = 175;
const MOUSE_STATIC_PUSH = 34; // deutliches Teilen bei ruhig stehender Maus (vorher 9, dann 26)
const MOUSE_IMPULSE_SCALE = 55; // Übersetzung Wisch-Geschwindigkeit → Halm-Impuls (vorher 26, dann 42)
const MOUSE_VEL_MAX_DELTA = 60; // px Clamp pro Pointer-Event (verhindert Sprünge/Teleports)
const MOUSE_VEL_DECAY = 9; // 1/s – wie schnell die gemessene Wischgeschwindigkeit abklingt

/* Feder-Charakteristik (Masse-Feder-Dämpfer, dt-integriert) */
const MAX_DT = 1 / 30; // Clamp gegen Tab-Wechsel/Lags (kein Sprung nach Pause)
const SPRING_STIFFNESS_BASE = 26;
const MASS_BASE = 1;
const MASS_HEIGHT_FACTOR = 1.7; // hohe Halme sind "schwerer" → träger
const DAMPING_RATIO_MIN = 0.74; // knapp unter kritisch: 1–2 sanfte Nachschwinger
const DAMPING_RATIO_MAX = 0.9; // nahezu kritisch: kaum sichtbares Nachschwingen

/* Tiefen-Ebene: hintere Schicht zuerst gezeichnet (dunkler, kürzer) – gibt
   dem Feld Körper statt einer flachen "Kamm"-Silhouette. */
const BACK_LAYER_PROBABILITY = 0.3;
const BACK_LAYER_HEIGHT_SCALE = 0.85; // ~15 % kürzer
const BACK_BLADE_COLORS = ["#0E2117", "#143021"]; // nur die dunkelsten Basistöne, kein Licht-Akzent

/* Dichte: Halm-Anzahl ≈ width / FIELD_BLADE_DIVISOR (Kundenfeedback: "nicht
   dicht genug" – weiter erhöht, vorher 4.8). Hintere Schicht + Büschel
   wachsen proportional mit, da BACK_LAYER_PROBABILITY ein Anteil pro Halm
   ist (kein Fixwert) und somit automatisch mitskaliert. */
const FIELD_BLADE_DIVISOR = 3.8;
/* Abgeschwächte Mitte-Ausdünnung – hält die exakte Hint-Mitte dezent frei,
   ohne das Feld insgesamt auszudünnen. */
const MIDDLE_THIN_EDGE = 0.55;
const MIDDLE_THIN_PROB = 0.18;

/* Drei Gras-Büschel (Kundenfeedback: "so Büschel … eine in die Mitte, eine
   links, eine rechts") – lokal deutlich dichtere, höhere, fächerförmig
   gebogene Bündel aus einem schmalen Fußpunkt-Bereich. */
const TUFT_POSITIONS = [0.12, 0.5, 0.88];
const TUFT_WIDTH_FACTOR = 0.06; // Cluster-Breite relativ zur Canvas-Breite
const TUFT_HEIGHT_SCALE = 1.5; // bis 1.5x der normalen Maximalhöhe an der Position
/* Mindesthöhe relativ zur Canvas-Höhe: an der mittleren Position (50 %) ist
   die normale Feld-Silhouette am niedrigsten (Mitte-Profil) – ohne diesen
   Boden bliebe das mittlere Büschel viel kleiner als die äußeren und würde
   nicht als gleichwertiger Busch lesbar. */
const TUFT_MIN_HEIGHT_FACTOR = 0.8;
const TUFT_MIN_BLADES = 35;
const TUFT_EXTRA_BLADES = 16; // Cluster-Halmzahl: 35–50
const TUFT_FAN_LEAN = 30; // fächerförmige Grund-Neigung an den Cluster-Rändern

/* Silhouetten-Profil: an den Rändern höher (schließt an die Baum-Füße an),
   zur Mitte hin niedriger. Von Feld- und Büschel-Erzeugung geteilt. */
function fieldHMax(x: number, width: number, height: number): number {
  const edge = Math.min(x, width - x) / (width / 2); // 0 Rand … 1 Mitte
  return height * (0.85 - edge * 0.45);
}

function pickBladeColor(rng: () => number, isBack: boolean): string {
  if (isBack) return BACK_BLADE_COLORS[Math.floor(rng() * BACK_BLADE_COLORS.length)];
  const isLight = rng() < 0.12;
  return isLight ? LIGHT_COLOR : BLADE_COLORS[Math.floor(rng() * BLADE_COLORS.length)];
}

/* Masse/Steifigkeit pro Halm: hohe Halme sind träger (mehr Masse), plus
   leichte Zufallsstreuung pro Halm für organisches Auseinanderlaufen statt
   Uniform-Feder-Gefühl. Dämpfungsgrad knapp unter 1 → höchstens 1–2 sanfte
   Nachschwinger, keine harten Sprünge. */
function springParams(rng: () => number, h: number, height: number) {
  const mass = (MASS_BASE + (h / height) * MASS_HEIGHT_FACTOR) * (0.85 + rng() * 0.3);
  const stiffness = SPRING_STIFFNESS_BASE * (0.85 + rng() * 0.3);
  const dampingRatio = DAMPING_RATIO_MIN + rng() * (DAMPING_RATIO_MAX - DAMPING_RATIO_MIN);
  const damping = 2 * dampingRatio * Math.sqrt(stiffness * mass);
  return { mass, stiffness, damping };
}

interface BladeOptions {
  x: number;
  hMax: number;
  height: number;
  leanBase: number;
  leanJitter: number;
  growDelay: number;
  widthMin?: number;
  widthJitter?: number;
  isTuft?: boolean;
}

/* Gemeinsamer Halm-Bauer für Feld und Büschel: rollt die Tiefen-Ebene,
   Höhe/Farbe/Feder-Parameter deterministisch aus dem übergebenen rng. */
function buildBlade(rng: () => number, opts: BladeOptions): Blade {
  const { x, hMax, height, leanBase, leanJitter, growDelay } = opts;
  const widthMin = opts.widthMin ?? 1.4;
  const widthJitter = opts.widthJitter ?? 1.8;
  const isTuft = opts.isTuft ?? false;

  const isBack = rng() < BACK_LAYER_PROBABILITY;
  const rawH = hMax * (0.45 + rng() * 0.55);
  const h = isBack ? rawH * BACK_LAYER_HEIGHT_SCALE : rawH;
  const color = pickBladeColor(rng, isBack);
  const { mass, stiffness, damping } = springParams(rng, h, height);

  return {
    x,
    baseY: height + 2,
    h,
    w: widthMin + rng() * widthJitter,
    color,
    lean: leanBase + (rng() - 0.5) * leanJitter,
    phase: rng() * Math.PI * 2,
    growDelay,
    bend: 0,
    vel: 0,
    mass,
    stiffness,
    damping,
    layer: isBack ? "back" : "front",
    isTuft,
  };
}

export function GrassField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let blades: Blade[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let lastTime = 0;
    let running = true; // Sichtbarkeits-Gate: false, solange der Canvas außerhalb des Viewports liegt
    const mouse = {
      x: -9999,
      y: -9999,
      vx: 0,
      vy: 0,
      lastX: -9999,
      lastY: -9999,
      hasMoved: false,
    };
    const t0 = performance.now();
    lastTime = t0;

    const seed = 42;
    const rebuild = () => {
      /* Alten Feder-Zustand sichern: bei Resize sollen bend/vel erhalten
         bleiben statt auf 0 zu springen (sonst sichtbarer Feld-Snap). Das
         deterministische Seed-Layout macht die Index-Zuordnung stabil. */
      const prevBlades = blades;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rng = makeRng(seed);
      const count = Math.round(width / FIELD_BLADE_DIVISOR);
      const next: Blade[] = [];
      for (let i = 0; i < count; i++) {
        const x = (i / count) * width + (rng() - 0.5) * 10;
        /* Silhouetten-Profil: an den Rändern höher, zur Mitte hin lückiger –
           Ausdünnung bewusst schwach (Kundenwunsch "dichter"), damit die
           Hint-Mitte unten dezent frei bleibt, ohne das Feld auszudünnen. */
        const edge = Math.min(x, width - x) / (width / 2);
        if (edge > MIDDLE_THIN_EDGE && rng() < MIDDLE_THIN_PROB) continue;
        const hMax = fieldHMax(x, width, height);
        const growDelay = 0.15 + (x / width) * 0.5 + rng() * 0.3;
        next.push(buildBlade(rng, { x, hMax, height, leanBase: 0, leanJitter: 10, growDelay }));
      }

      /* Drei Gras-Büschel: lokal dichteres Bündel aus einem schmalen
         Fußpunkt-Bereich, Halme fächern sich vom Cluster-Zentrum aus. */
      for (const posFrac of TUFT_POSITIONS) {
        const cx = posFrac * width;
        const clusterWidth = width * TUFT_WIDTH_FACTOR;
        /* An den äußeren Cluster-Positionen (nah an der Canvas-Kante) würde
           der 1.5x-Faktor sonst die Canvas-Höhe übersteigen und die höchsten
           Spitzen am oberen Rand hart kappen statt spitz auslaufen zu
           lassen – Deckel hält sie innerhalb des sichtbaren Bereichs. */
        const hMaxTuft = Math.min(
          Math.max(fieldHMax(cx, width, height) * TUFT_HEIGHT_SCALE, height * TUFT_MIN_HEIGHT_FACTOR),
          height * 0.95,
        );
        const tuftCount = TUFT_MIN_BLADES + Math.floor(rng() * TUFT_EXTRA_BLADES);
        const growDelay = 0.15 + (cx / width) * 0.5 + rng() * 0.3;
        for (let i = 0; i < tuftCount; i++) {
          const x = cx + (rng() - 0.5) * clusterWidth;
          const fan = (x - cx) / (clusterWidth / 2); // -1…1 → Fächer-Neigung
          next.push(
            buildBlade(rng, {
              x,
              hMax: hMaxTuft,
              height,
              leanBase: fan * TUFT_FAN_LEAN,
              leanJitter: 12,
              growDelay,
              widthMin: 1.6,
              widthJitter: 2.0,
              isTuft: true,
            }),
          );
        }
      }

      blades = next;
      const preserved = Math.min(prevBlades.length, blades.length);
      for (let i = 0; i < preserved; i++) {
        blades[i].bend = prevBlades[i].bend;
        blades[i].vel = prevBlades[i].vel;
      }
    };

    const draw = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(Math.max(rawDt, 0), MAX_DT);
      lastTime = now;
      const t = (now - t0) / 1000;

      /* Wisch-Geschwindigkeit klingt ab, wenn die Maus stehen bleibt oder
         das Feld verlässt – pointermove lädt sie laufend neu auf. */
      const velDecay = Math.exp(-MOUSE_VEL_DECAY * dt);
      mouse.vx *= velDecay;
      mouse.vy *= velDecay;

      ctx.clearRect(0, 0, width, height);

      const stepBlade = (b: Blade) => {
        /* Wind: Grundwelle + feine Welle + weich eingeblendete Böen-Welle,
           räumlich versetzt (x-Phase → als durchlaufende Welle lesbar) */
        const gustNorm = Math.sin(t * WIND_GUST_FREQ + b.x * WIND_GUST_SPATIAL);
        const gustEnvelope = smootherstep(-1, 1, gustNorm);
        /* Sehr dezente Zusatz-Staffelung + Büschel-Hebel wirken NUR auf den
           Böen-Anteil – das Grundwiegen bleibt für alle Halme gleich. */
        const gustHeightBoost = 1 + (b.h / height) * WIND_GUST_HEIGHT_FACTOR;
        const gustTuftBoost = b.isTuft ? WIND_GUST_TUFT_BOOST : 1;
        const gust =
          WIND_GUST_AMPLITUDE * gustEnvelope * gustEnvelope * gustHeightBoost * gustTuftBoost;
        const wind =
          WIND_BASE_AMPLITUDE * Math.sin(t * 0.9 + b.x * 0.008 + b.phase) +
          WIND_FINE_AMPLITUDE * Math.sin(t * 1.9 + b.x * 0.022) +
          gust;

        /* Maus: dominanter Geschwindigkeits-Impuls in Wischrichtung +
           schwacher positionsbasierter "Weg-Biegen"-Anteil, beide mit
           weichem räumlichen Falloff (smootherstep statt quadratisch). */
        const tipX = b.x + b.lean;
        const tipY = b.baseY - b.h * 0.7;
        const dxm = tipX - mouse.x;
        const dym = tipY - mouse.y;
        const dist = Math.hypot(dxm, dym);

        let staticPush = 0;
        let impulseAccel = 0;
        if (dist < MOUSE_RADIUS) {
          const s = smootherstep(MOUSE_RADIUS, 0, dist);
          const heightGain = 0.5 + (b.h / height) * 0.9;
          staticPush = Math.sign(dxm || 1) * s * MOUSE_STATIC_PUSH * heightGain;
          impulseAccel = mouse.vx * s * MOUSE_IMPULSE_SCALE * heightGain;
        }

        /* Impuls reißt den Halm direkt in Wischrichtung mit … */
        b.vel += impulseAccel * dt;

        /* … danach zieht ihn die Masse-Feder-Dämpfer-Physik weich zurück
           Richtung Wind-Ziel (+ schwacher Positions-Anteil). Delta-Time-
           integriert: bleibt bei Framerate-Schwankungen konsistent. */
        const springTarget = wind * (0.4 + b.h / height) + staticPush;
        const accel = (-(b.bend - springTarget) * b.stiffness - b.damping * b.vel) / b.mass;
        b.vel += accel * dt;
        b.bend += b.vel * dt;

        /* Wachstums-Intro */
        const grow = reduced
          ? 1
          : Math.min(1, Math.max(0, (t - b.growDelay) / 0.8));
        const ease = 1 - Math.pow(1 - grow, 3);
        if (ease <= 0) return;
        const h = b.h * ease;

        /* Biegung statt Kippen: Basis fest verwurzelt (kein Bend-Anteil),
           unteres Drittel bewegt sich kaum, die Krümmung konzentriert sich
           im oberen Bereich – die Spitze folgt der Auslenkung voll. */
        const cp1x = b.x + b.lean * 0.15 + b.bend * 0.08;
        const cp1y = b.baseY - h * 0.35;
        const cp2x = b.x + b.lean * 0.6 + b.bend * 0.55;
        const cp2y = b.baseY - h * 0.78;
        const tx = b.x + b.lean + b.bend;
        const ty = b.baseY - h;

        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(b.x, b.baseY);
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, tx, ty);
        ctx.stroke();
      };

      /* Tiefen-Sortierung: hintere Schicht zuerst (dunkler, kürzer) für
         Feld-Körper statt Kamm-Optik, danach die vordere Schicht darüber. */
      for (const b of blades) if (b.layer === "back") stepBlade(b);
      for (const b of blades) if (b.layer === "front") stepBlade(b);
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    const onPointer = (e: PointerEvent) => {
      if (!running) return; // Canvas außerhalb des Viewports: keine Positions-Updates
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (mouse.hasMoved) {
        const dx = x - mouse.lastX;
        const dy = y - mouse.lastY;
        mouse.vx = Math.max(-MOUSE_VEL_MAX_DELTA, Math.min(MOUSE_VEL_MAX_DELTA, dx));
        mouse.vy = Math.max(-MOUSE_VEL_MAX_DELTA, Math.min(MOUSE_VEL_MAX_DELTA, dy));
      }
      mouse.x = x;
      mouse.y = y;
      mouse.lastX = x;
      mouse.lastY = y;
      mouse.hasMoved = true;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
      mouse.vx = 0;
      mouse.vy = 0;
      mouse.hasMoved = false;
    };
    /* Touch hat keinen "leave": nach Finger-Lift zurücksetzen. Bei Maus ist
       der Reset unkritisch übersprungen – das nächste pointermove setzt die
       Position ohnehin sofort neu. */
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") onLeave();
    };

    rebuild();

    if (reduced) {
      /* Ein statischer Frame mit leichter Grundneigung – keine Bewegung */
      draw(t0 + 3000);
      const ro = new ResizeObserver(() => {
        rebuild();
        draw(t0 + 3000);
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }

    const ro = new ResizeObserver(rebuild);
    ro.observe(canvas);
    /* Sichtbarkeits-Gate: pausiert die Physik-Loop komplett, sobald der
       Canvas den Viewport verlässt (z.B. nach dem Vorhang, wenn tiefer
       gescrollt wird) – verhindert unsichtbares Dauer-Rechnen bei ~200+
       Halmen. Während des Vorhangs ist die Stage sticky/sichtbar, dort
       greift der Observer nicht und die Loop läuft ununterbrochen weiter. */
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
    window.addEventListener("pointermove", onPointer, { passive: true });
    /* pointerleave bubbelt nicht bis window (endet in Chromium am Document) –
       zusätzlich blur/pointercancel/pointerup als robuste Reset-Trigger. */
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
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("pointercancel", onLeave);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  return <canvas ref={canvasRef} className="tc-grass" aria-hidden="true" />;
}
