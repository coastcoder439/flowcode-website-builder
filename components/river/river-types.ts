/*
 * river-types.ts – Alle Typen für das Fluss-Feature ("Der Fluss", WP0).
 * Reine Typdeklarationen, kein Laufzeitcode. Wird sowohl von der reinen
 * Geometrie (riverPath.ts) als auch von den React-Komponenten importiert.
 */

import type { ReactNode, RefObject } from "react";
import type { MotionValue } from "motion/react";

/* ------------------------------------------------------------------ */
/* river.config.json – Struktur                                        */
/* ------------------------------------------------------------------ */

/** Wo der Fluss aus dem fallenden Logo-Tropfen entspringt (Geometrie-Vertrag
 *  Bühne↔Content, siehe RiverBirth). */
export interface SourceExit {
  xPct: number;
  widthPx: number;
}

/** Wellen-Atmung: periodS = Dauer einer Hin-und-Her-Animation (a↔b),
 *  waveCount = Anzahl übereinanderliegender Wellen-Ebenen. */
export interface BreathConfig {
  periodS: number;
  waveCount: number;
}

/** Glitzer-Partikel auf dem Wasser. */
export type SparkleMode = "dezent" | "linien" | "magisch" | "aus";

export interface SparkleConfig {
  mode: SparkleMode;
  /** Partikel pro Spur/Lane. */
  perTrail: number;
  /** Umlaufdauer einer Spur in Sekunden. */
  trailDurS: number;
  /** Sichtbarkeitsdauer eines einzelnen Aufblitzens in Sekunden. */
  flashS: number;
}

/** Sandufer-Stroke direkt auf dem Uferpfad. */
export interface BankConfig {
  strokePx: number;
}

/** Position des Flusses relativ zum Anker-Element: an welcher Kante der
 *  Fluss vorbeiläuft/den Anker berührt. */
export type WaypointAt = "top" | "left" | "right" | "bottom";

/** Sonderrolle eines Wegpunkts: 'waterfallBox' = kleine Kaskade über eine
 *  Content-Box, 'cliff' = die große Felswand-Kante zum Finale, 'lake' =
 *  der abschließende Tal-See (kein Durchfluss mehr, nur noch ein Becken). */
export type WaypointType = "waterfallBox" | "cliff" | "lake";

/** Flora-Ausprägung eines Feature-Triggers entlang des Ufers. */
export type FloraVariant = "gras" | "baum" | "efeu";

export interface WaypointFeature {
  type: "flora";
  variant: FloraVariant;
  side: "left" | "right";
}

/** Ein Wegpunkt des Flusses: DOM-Anker (wird in einem Folge-WP mit
 *  Sektions-IDs bestückt) + Geometrie-Angaben. */
export interface Waypoint {
  /** CSS-Selektor des DOM-Ankers (z. B. "#mission" oder ein Selektor
   *  innerhalb einer Sektion wie "#bausteine .card:nth-child(3)"). */
  anchor: string;
  at: WaypointAt;
  /** Horizontale Position des Flusses an diesem Wegpunkt, in % der
   *  Fluss-Zonen-Breite (unabhängig von der Anker-Breite). */
  xPct: number;
  /** Flussbreite an diesem Wegpunkt in Pixel. */
  widthPx: number;
  type?: WaypointType;
  features?: WaypointFeature[];
}

export interface RiverConfig {
  sourceExit: SourceExit;
  breath: BreathConfig;
  sparkle: SparkleConfig;
  bank: BankConfig;
  waypoints: Waypoint[];
}

/* ------------------------------------------------------------------ */
/* Geburt aus dem Logo-Tropfen (RiverBirth)                            */
/* ------------------------------------------------------------------ */

/** Scroll-Progress-Fenster [start, ende] (0..1) je Geburts-Phase, in
 *  chronologischer Reihenfolge: der Tropfen löst sich vom Logo (crossfade),
 *  fällt (fall), spritzt am Boden auf (splash) und der Fluss entspringt
 *  daraus (spring). */
export interface BirthPhases {
  crossfade: [number, number];
  fall: [number, number];
  splash: [number, number];
  spring: [number, number];
}

/* ------------------------------------------------------------------ */
/* Geometrie                                                            */
/* ------------------------------------------------------------------ */

/** Gemessenes Anker-Rechteck in Fluss-Zonen-Koordinaten (Ursprung = Anfang
 *  der Fluss-Zone, y wächst mit dem Dokumentfluss nach unten). Entspricht
 *  inhaltlich einem DOMRect, wird aber nie direkt aus dem DOM gereicht –
 *  riverPath.ts bleibt dadurch frei von DOM-Zugriffen. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ein Abschnitt der Zentrallinie zwischen zwei Knoten. amplitudeScale
 *  dämpft die Wellen-Auslenkung in diesem Abschnitt (z. B. See-Segment
 *  ~0.2 = ruhiges Wasser statt Strömung). */
export interface RiverSegment {
  fromY: number;
  toY: number;
  amplitudeScale: number;
  kind: "flow" | "lake";
}

export interface FeatureTrigger {
  y: number;
  type: "flora";
  variant: FloraVariant;
  x: number;
}

/** Eine Kaskade: kleine Box-Wasserfall ('box') oder die große
 *  Felswand-Kante zum Finale ('cliff'). Überbrückt topY→bottomY vertikal. */
export interface Waterfall {
  kind: "box" | "cliff";
  topY: number;
  bottomY: number;
  x: number;
  widthPx: number;
}

/** Ergebnis von buildRiverGeometry: alles, was RiverWaves/RiverFeatures zum
 *  Rendern brauchen. waves[i].a/.b sind STRUKTURGLEICH (identische
 *  Kommando-Sequenz, nur andere Zahlen) – Pflicht für lerpPath (JS-Lerp der
 *  Wellen-Atmung, siehe useScrub-Muster in TitleCurtain.tsx). */
export interface RiverGeometry {
  centerD: string;
  /** Wasserfläche als EIN durchgehender Pfad: Mini-See + Horizont-Kopf +
   *  Fluss-Körper in EINER `d`-Kontur (Kundenvorgabe „technisch ein
   *  Element"). */
  bankD: string;
  /** Sandufer als EIN gefüllter Ring-Pfad (Kontur ± halbe Uferbreite,
   *  ebenfalls See+Kopf+Körper integriert) — ersetzt den früheren Stroke
   *  (keine Quer-Kappen an Mündung/Auslauf). */
  sandD?: string;
  /** Körper-Knotentabellen der Kontur (Design-Raum) für Konsumenten wie
   *  die Schaumfront — bankD ist wegen des Kopf-Polylinien-Anteils nicht
   *  mehr rückwärts-parsebar. */
  kontur?: { down: number[]; up: number[]; ys: number[] };
  waves: { a: string; b: string }[];
  segments: RiverSegment[];
  featureTriggers: FeatureTrigger[];
  waterfalls: Waterfall[];
  lakeD?: string;
  /** Die Knoten, AUS DENEN dieser Fluss gebaut wurde (Design-Einheiten) —
   *  Ausgangslage für den Fluss-Editor (/fluss-editor). */
  nodes?: RiverNode[];
}

/* ------------------------------------------------------------------ */
/* Fluss-Knoten (die EINZIGE Quelle der Fluss-Form)                     */
/* ------------------------------------------------------------------ */

/** Ein Knoten der Fluss-Mittellinie in Design-Einheiten. Der Fluss wird
 *  AUS diesen Knoten gebaut (Bezier-Kette durch die Mittellinie, Breite je
 *  Knoten) — er wird NICHT nachträglich verbogen. Dadurch liegt ein
 *  Editor-Handle per Konstruktion exakt auf dem Wasser.
 *
 *  y: Design-y (negativ = „Ferne", ragt über die Zonen-Oberkante)
 *  x: Mittellinie des Flusses an dieser Höhe
 *  breite: Flussbreite an dieser Höhe → PERSPEKTIVE (fern = schmal). */
export interface RiverNode {
  y: number;
  x: number;
  breite: number;
}

/* ------------------------------------------------------------------ */
/* Pfad-Parsing (riverPath.ts: parsePath/lerpPath)                     */
/* ------------------------------------------------------------------ */

/** Zerlegte SVG-Pfad-'d'-Zeichenkette: template = alles außer Zahlen (Länge
 *  = numbers.length + 1), numbers = die extrahierten Zahlenwerte in
 *  Auftrittsreihenfolge. lerpPath(a, b, t) interpoliert numbers linear und
 *  fügt sie wieder in template ein – setzt voraus, dass a und b strukturell
 *  identisch sind (gleiche Kommando-Sequenz). */
export interface ParsedPath {
  template: string[];
  numbers: number[];
}

/* ------------------------------------------------------------------ */
/* Props der vier Fluss-Komponenten                                    */
/* ------------------------------------------------------------------ */

/** RiverBirth: Tropfen löst sich aus dem Logo, fällt, spritzt auf und lässt
 *  den Fluss entspringen – am Ende des Vorhang-Effekts. */
export interface RiverBirthProps {
  progress: MotionValue<number>;
  logoRef: RefObject<HTMLImageElement | null>;
  birth: BirthPhases;
  sourceExit: SourceExit;
}

/** RiverFlow: liest river.config.json selbst, misst die DOM-Anker der
 *  Wegpunkte, baut die Geometrie und reicht sie an RiverWaves/RiverFeatures
 *  weiter. Umschließt die eigentlichen Landing-Sektionen. */
export interface RiverFlowProps {
  children: ReactNode;
}

/** RiverWaves: rendert Zentralpfad, Sandufer, Wellen-Ebenen (Breath-
 *  Animation) und Sparkle-Partikel aus einer fertigen Geometrie. */
export interface RiverWavesProps {
  geometry: RiverGeometry;
  breath: BreathConfig;
  sparkle: SparkleConfig;
  paused: boolean;
}

/** RiverFeatures: triggert Flora- und Wasserfall-Reveals, sobald der
 *  Scroll-Fortschritt (revealY, Dokument-Y-Position) einen Trigger erreicht. */
export interface RiverFeaturesProps {
  geometry: RiverGeometry;
  revealY: MotionValue<number>;
  /** y des ECHTEN Fluss-Anfangs (Spitze in der Ferne, negativ) in
   *  Design-Einheiten. Bezugspunkt für die Schaumfront — ohne ihn würde
   *  gegen 0 (Körper-Anfang) verglichen und der Schaum liefe erst nach dem
   *  Header an. Default 0 = kein Kopf. */
  riverStartY?: number;
  /** Fließfront-Partikel (Fluss-Editor). Ohne sie gelten die Defaults.
   *  Die BREITE fehlt bewusst — sie ist fest an die Flussbreite gekoppelt. */
  foam?: {
    /** Partikelanzahl. */
    count: number;
    /** Vorpresch-Weg in Kanalmitte (Design-px). */
    leadPx: number;
    /** Tempo-Faktor aller Zyklen. */
    speed: number;
    /** Größen-Faktor. */
    sizeK: number;
    /** Sprung-Weg (wirkt in alle Richtungen). */
    jitterPx: number;
    /* Nebelkante — eigene Schicht, getrennt von den Partikeln. */
    /** Anzahl der Nebelwolken. */
    mistCount: number;
    /** Wolkengröße (Design-px). */
    mistSizePx: number;
    /** Deckkraft der Nebelkante. */
    mistOpacity: number;
    /** Waber-Tempo. */
    mistSpeed: number;
    /** Weichzeichnung (CSS-blur, px). */
    mistBlurPx: number;
  };
}
