/*
 * riverPath.ts – Fluss-Geometrie, KNOTEN-BASIERT.
 *
 * ARCHITEKTUR (Kundenvorgabe 2026-07-16, ersetzt den alten Master-Mäander +
 * Kurs-Transform):
 *   „Du brauchst einmal einen komplett geraden animierten Fluss mit dieser
 *    Flussanimation, und dann setzt Du die Knotenpunkte. Wenn Du die
 *    Knotenpunkte auf einen schon gekrümmten und schiefen Fluss setzt,
 *    funktioniert das nicht."
 *
 * Genau so ist es jetzt gebaut:
 *   - Grundform = GERADER Fluss (Mittellinie senkrecht, konstante Breite).
 *   - Die KNOTEN (RiverNode: y, x, breite) SIND die Fluss-Mittellinie.
 *     Der Fluss wird AUS ihnen erzeugt — nicht nachträglich verbogen.
 *     → Ein Editor-Handle liegt per Konstruktion EXAKT auf dem Wasser;
 *       kein Nachmessen der gerenderten Kurve, kein Springen, kein Lag.
 *   - PERSPEKTIVE = `breite` pro Knoten (fern = schmal, nah = breit).
 *     Der Nutzer setzt sie selbst (Scrollrad im Editor).
 *
 * ERHALTEN aus dem Kunden-Original (der LOOK, nicht der Verlauf):
 *   - Kurvensprache: Bezier-S-Kette mit vertikalen Tangenten an jedem
 *     Knoten (Kontrollpunkte auf dem y-Mittelpunkt) — dieselbe Sprache wie
 *     im Original-Artwork.
 *   - Schicht-Look: Sandufer + Wasserbasis + 5 Wellen. Die Wellen sind als
 *     ANTEILIGE Einrückungen der Flussbreite aus den Original-Knotentabellen
 *     abgeleitet (WAVE_INSETS) und behalten die A/B-Atmung.
 *   - Jede Schicht bleibt EIN durchgehender Pfad (ein `M`) über den ganzen
 *     Fluss — Ferne und Nähe in derselben Kette, keine Naht möglich.
 *
 * KEIN DOM-Zugriff, deterministisch und pur testbar.
 */

import type {
  AnchorRect,
  FeatureTrigger,
  ParsedPath,
  RiverConfig,
  RiverGeometry,
  RiverNode,
  RiverSegment,
  Waypoint,
} from "./river-types";

/* ------------------------------------------------------------------ */
/* Design-Raum                                                          */
/* ------------------------------------------------------------------ */

/** Feste Design-Breite (Original-Artwork-Spalte). RiverFlow rendert eine
 *  zentrierte Spalte dieser Breite, auf schmaleren Screens proportional
 *  skaliert. */
export const RIVER_DESIGN_WIDTH_PX = 1200;

/** Horizont-Höhe (Anteil der Bühnenhöhe) — geteilt mit RiverBirth
 *  (Tropfen-Ziel): Kopf-Höhe = Bühne × (1 − HORIZONT_Y_PCT). */
export const HORIZONT_Y_PCT = 0.6;

const FEATURE_OFFSET_PX = 24;

/* ------------------------------------------------------------------ */
/* Look-Referenz aus dem Kunden-Original (NUR für die Schicht-Optik)   */
/* ------------------------------------------------------------------ */

interface MasterShape {
  down: number[];
  up: number[];
}

/** Original-Fluss-Kontur (Referenz für die Wellen-Einrückungen). */
const MASTER_CONTOUR: MasterShape = {
  down: [585, 250, 640, 310, 460, 440, 440],
  up: [615, 470, 880, 530, 740, 760, 760],
};

/** 5 Wellen, je A/B-Keyframe (Original @keyframes anim-wave-1..5). */
const MASTER_WAVES: { a: MasterShape; b: MasterShape }[] = [
  {
    a: { down: [587.1, 270.9, 655.1, 320.8, 486.1, 465.4, 455.0], up: [612.9, 459.2, 864.9, 509.1, 724.5, 744.1, 733.0] },
    b: { down: [587.1, 259.9, 658.5, 330.0, 473.1, 459.4, 469.8], up: [612.9, 450.0, 861.5, 520.1, 716.3, 731.1, 742.2] },
  },
  {
    a: { down: [589.5, 287.1, 671.9, 339.0, 508.0, 493.8, 484.1], up: [610.5, 442.4, 843.0, 491.6, 701.1, 719.8, 712.5] },
    b: { down: [589.5, 278.9, 680.1, 347.0, 496.0, 482.2, 491.9], up: [610.5, 431.6, 845.0, 502.4, 694.9, 704.2, 711.5] },
  },
  {
    a: { down: [591.9, 295.8, 700.5, 360.2, 520.7, 521.1, 514.7], up: [608.1, 413.9, 827.7, 482.0, 669.3, 691.2, 691.6] },
    b: { down: [591.9, 305.4, 689.9, 361.0, 528.1, 506.1, 512.5], up: [608.1, 424.9, 821.9, 476.8, 681.9, 681.6, 681.2] },
  },
  {
    a: { down: [594.3, 313.9, 714.8, 382.6, 546.6, 533.2, 534.9], up: [605.7, 397.7, 803.3, 465.3, 656.1, 656.9, 654.6] },
    b: { down: [594.3, 322.5, 714.0, 373.8, 547.0, 545.2, 543.5], up: [605.7, 405.9, 807.9, 458.3, 650.3, 664.7, 667.0] },
  },
  {
    a: { down: [596.7, 339.5, 735.4, 391.5, 570.8, 571.1, 564.2], up: [603.3, 386.0, 790.3, 441.0, 629.3, 641.1, 638.2] },
    b: { down: [596.7, 332.1, 731.8, 400.1, 567.6, 558.5, 565.4], up: [603.3, 382.4, 782.5, 447.4, 632.3, 629.3, 632.2] },
  },
];

/** Referenz-Flussbreite des Originals (typische Kontur-Breite) — Basis für
 *  die perspektivische Mitskalierung des Sandufers. */
const REFERENZ_BREITE = 240;

interface InsetPaar {
  down: number;
  up: number;
}

/** Leitet aus einer Original-Wellenform die ANTEILIGEN Einrückungen je
 *  Original-Knoten ab (Anteil der dortigen Flussbreite). Dadurch lässt sich
 *  der Wellen-Look auf einen Fluss BELIEBIGER Breite/Form übertragen. */
function ableiteInsets(shape: MasterShape): InsetPaar[] {
  return MASTER_CONTOUR.down.map((cd, j) => {
    const cu = MASTER_CONTOUR.up[j];
    const w = cu - cd;
    return { down: (shape.down[j] - cd) / w, up: (cu - shape.up[j]) / w };
  });
}

/** Wellen-Einrückungen (5 Layer × A/B). Der Knoten-Index wird zyklisch auf
 *  das 7er-Original-Muster abgebildet → organische Wellenkanten bei
 *  beliebiger Knotenzahl, A/B-Unterschied = die Atmung. */
const WAVE_INSETS = MASTER_WAVES.map((w) => ({
  a: ableiteInsets(w.a),
  b: ableiteInsets(w.b),
}));
const INSET_MUSTER_LEN = MASTER_CONTOUR.down.length;

/* ------------------------------------------------------------------ */
/* Standard-Knoten: GERADER Fluss (Ausgangslage für den Editor)        */
/* ------------------------------------------------------------------ */

/** Abstand der Standard-Knoten in Design-Einheiten. */
const KNOTEN_ABSTAND = 600;
/** Startbreite des geraden Flusses. */
const START_BREITE = 240;

/** Gerader Fluss über die volle Zonenhöhe (inkl. Ferne-Kopf oberhalb der
 *  Zone). Kundenvorgabe: erst gerade, dann setzt Leon die Knoten. */
export function defaultRiverNodes(zoneH: number, headH: number): RiverNode[] {
  const nodes: RiverNode[] = [];
  const x = RIVER_DESIGN_WIDTH_PX / 2;
  const top = -Math.max(headH, 0);
  for (let y = top; y < zoneH; y += KNOTEN_ABSTAND) {
    nodes.push({ y: Math.round(y), x, breite: START_BREITE });
  }
  nodes.push({ y: Math.round(zoneH), x, breite: START_BREITE });
  return nodes;
}

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** EIN geschlossener Band-Pfad als DURCHGEHENDE Bezier-Kette in der
 *  Original-Kurvensprache (Kontrollpunkte auf dem y-Mittelpunkt, vertikale
 *  Tangenten an JEDEM Knoten). Ferne und Nähe stecken in DERSELBEN Kette —
 *  ein `M`, keine Naht möglich. */
function geschlossenesBand(downXs: number[], upXs: number[], ys: number[]): string {
  const last = ys.length - 1;
  let d = `M ${fmt(downXs[0])},${fmt(ys[0])}`;
  for (let i = 0; i < last; i++) {
    const mid = (ys[i] + ys[i + 1]) / 2;
    d += ` C ${fmt(downXs[i])},${fmt(mid)} ${fmt(downXs[i + 1])},${fmt(mid)} ${fmt(downXs[i + 1])},${fmt(ys[i + 1])}`;
  }
  d += ` L ${fmt(upXs[last])},${fmt(ys[last])}`;
  for (let i = last; i > 0; i--) {
    const mid = (ys[i] + ys[i - 1]) / 2;
    d += ` C ${fmt(upXs[i])},${fmt(mid)} ${fmt(upXs[i - 1])},${fmt(mid)} ${fmt(upXs[i - 1])},${fmt(ys[i - 1])}`;
  }
  return d + " Z";
}

/** Offene, abwärts laufende Bezier-Kette (Glitzer-/Blubberblasen-Spur). */
function sChainDown(xs: number[], ys: number[]): string {
  let d = `M ${fmt(xs[0])},${fmt(ys[0])}`;
  for (let i = 0; i < xs.length - 1; i++) {
    const mid = (ys[i] + ys[i + 1]) / 2;
    d += ` C ${fmt(xs[i])},${fmt(mid)} ${fmt(xs[i + 1])},${fmt(mid)} ${fmt(xs[i + 1])},${fmt(ys[i + 1])}`;
  }
  return d;
}

/** x-Position einer Knotenkette an beliebiger Höhe y (Bisektion im
 *  y-monotonen Bezier-Segment) — reine AUSWERTUNG, keine neue Form. */
function xAtY(xs: number[], ys: number[], y: number): number {
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
/* Wegpunkte → Feature-Trigger (Anker steuern NUR y, nicht die Form)   */
/* ------------------------------------------------------------------ */

function resolveWaypointY(wp: Waypoint, anchor: AnchorRect | undefined, fallbackY: number): number {
  if (!anchor) return fallbackY;
  switch (wp.at) {
    case "top":
      return anchor.y;
    case "bottom":
      return anchor.y + anchor.height;
    case "left":
    case "right":
      return anchor.y + anchor.height / 2;
    default:
      return anchor.y;
  }
}

/** Box-Wasserfall, Felswand und See sind vorläufig stillgelegt (Flag
 *  disabledWaypointTypes in river.config.json). */
interface RiverConfigF1aExtras {
  disabledWaypointTypes?: string[];
}

/* ------------------------------------------------------------------ */
/* Öffentliche API                                                      */
/* ------------------------------------------------------------------ */

/** Baut die komplette Fluss-Geometrie AUS DEN KNOTEN.
 *  zone.h = Zielhöhe in DESIGN-Einheiten, headH = Höhe des Ferne-Teils
 *  oberhalb der Zone (Design-Einheiten). `nodes` überschreibt die
 *  Standard-Knoten (gerader Fluss) — das ist der Fluss-Editor bzw. ein
 *  gespeicherter Verlauf. */
export function buildRiverGeometry(
  zone: { w: number; h: number },
  anchors: Map<string, AnchorRect>,
  cfg: RiverConfig,
  headH = 0,
  nodes?: RiverNode[],
): RiverGeometry {
  const h = Math.max(zone.h, 1);
  const knoten = (nodes?.length ? [...nodes].sort((a, b) => a.y - b.y) : defaultRiverNodes(h, headH));

  const ys = knoten.map((n) => n.y);
  const mitten = knoten.map((n) => n.x);
  const breiten = knoten.map((n) => Math.max(n.breite, 1));

  /* Kontur: Mittellinie ± halbe Breite je Knoten. */
  const contourDown = knoten.map((n, i) => mitten[i] - breiten[i] / 2);
  const contourUp = knoten.map((n, i) => mitten[i] + breiten[i] / 2);

  /* Sandufer: Saum skaliert mit der Flussbreite → perspektivisch korrekt
     (ferner, schmaler Fluss hat auch ein schmaleres Ufer). */
  const saumBasis = cfg.bank.strokePx / 2;
  const saeume = breiten.map((b) => saumBasis * (b / REFERENZ_BREITE));
  const sandD = geschlossenesBand(
    contourDown.map((x, i) => x - saeume[i]),
    contourUp.map((x, i) => x + saeume[i]),
    ys,
  );

  const bankD = geschlossenesBand(contourDown, contourUp, ys);

  /* Wellen: anteilige Einrückungen der Flussbreite (Look aus dem Original,
     Muster zyklisch über die Knoten). A/B = die Atmung; beide sind
     strukturgleich (gleiche Knotenzahl) → Pflicht für lerpPath. */
  const welle = (insets: InsetPaar[]): string => {
    const down = knoten.map((n, i) => {
      const ins = insets[i % INSET_MUSTER_LEN];
      return contourDown[i] + ins.down * breiten[i];
    });
    const up = knoten.map((n, i) => {
      const ins = insets[i % INSET_MUSTER_LEN];
      return contourUp[i] - ins.up * breiten[i];
    });
    return geschlossenesBand(down, up, ys);
  };
  const waves = WAVE_INSETS.map((w) => ({ a: welle(w.a), b: welle(w.b) }));

  /* Glitzer-/Blubberblasen-Spur = die Mittellinie selbst (läuft dadurch
     automatisch auch durch den Ferne-Teil). */
  const centerD = sChainDown(mitten, ys);

  const segments: RiverSegment[] = [{ fromY: 0, toY: h, amplitudeScale: 1, kind: "flow" }];

  const disabledTypes = new Set(
    (cfg as RiverConfig & RiverConfigF1aExtras).disabledWaypointTypes ?? [],
  );

  const featureTriggers: FeatureTrigger[] = [];
  const count = cfg.waypoints.length;
  cfg.waypoints.forEach((wp, index) => {
    if (wp.type && disabledTypes.has(wp.type)) return;
    if (wp.type && process.env.NODE_ENV !== "production") {
      console.warn(`[riverPath] Wegpunkt-Typ "${wp.type}" wird nicht gerendert: ${wp.anchor}`);
      return;
    }
    if (!wp.features?.length) return;

    const fallbackY = ((index + 1) / (count + 1)) * h;
    const y = Math.min(Math.max(resolveWaypointY(wp, anchors.get(wp.anchor), fallbackY), 1), h - 1);
    const saumHier = saumBasis * (breiten[0] / REFERENZ_BREITE);

    for (const feature of wp.features) {
      /* Flora sitzt am Sandufer der Kurve auf dieser Höhe. */
      const x =
        feature.side === "left"
          ? xAtY(contourDown, ys, y) - saumHier - FEATURE_OFFSET_PX
          : xAtY(contourUp, ys, y) + saumHier + FEATURE_OFFSET_PX;
      featureTriggers.push({ y, type: feature.type, variant: feature.variant, x });
    }
  });

  return {
    centerD,
    bankD,
    sandD,
    kontur: { down: contourDown, up: contourUp, ys },
    waves,
    segments,
    featureTriggers,
    waterfalls: [],
    lakeD: undefined,
    nodes: knoten.map((n) => ({ ...n })),
  };
}

/* ------------------------------------------------------------------ */
/* Pfad-Interpolation (JS-Lerp für die Wellen-Atmung, siehe useScrub-      */
/* Muster in TitleCurtain.tsx – motion delegiert style-Werte sonst an     */
/* WAAPI, dort ist ein reiner String-'d'-Lerp nicht scrubbar)             */
/* ------------------------------------------------------------------ */

const PATH_NUMBER_RE = /-?\d+(?:\.\d+)?/g;

/** Zerlegt eine SVG-Pfad-'d'-Zeichenkette in Template (alles außer Zahlen)
 *  + Zahlen-Array in Auftrittsreihenfolge. */
export function parsePath(d: string): ParsedPath {
  const numbers: number[] = [];
  const template: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  PATH_NUMBER_RE.lastIndex = 0;
  while ((match = PATH_NUMBER_RE.exec(d)) !== null) {
    template.push(d.slice(lastIndex, match.index));
    numbers.push(Number(match[0]));
    lastIndex = PATH_NUMBER_RE.lastIndex;
  }
  template.push(d.slice(lastIndex));
  return { template, numbers };
}

/** Interpoliert zwei strukturgleiche Pfade linear (t: 0..1) und setzt das
 *  Ergebnis mit dem Template von structA wieder zusammen. Wirft, wenn die
 *  Zahlen-Anzahl abweicht (= keine strukturgleichen Pfade). */
export function lerpPath(structA: ParsedPath, structB: ParsedPath, t: number): string {
  if (structA.numbers.length !== structB.numbers.length) {
    throw new Error("lerpPath: strukturell unterschiedliche Pfade (Zahlen-Anzahl weicht ab)");
  }
  let out = structA.template[0];
  for (let i = 0; i < structA.numbers.length; i++) {
    const value = structA.numbers[i] + (structB.numbers[i] - structA.numbers[i]) * t;
    out += fmt(value) + structA.template[i + 1];
  }
  return out;
}
