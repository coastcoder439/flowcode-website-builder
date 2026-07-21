/*
 * grafik-types.ts – Datenmodell des Grafik-Editors (/grafik-editor).
 *
 * KERNIDEE: Ein Keyframe hält die Scrollposition ZUSAMMEN mit der
 * DOKUMENT-Position der Grafik. Dadurch deckt EIN Modell alle Fälle ab,
 * ohne dass Leon einen Modus wählen muss:
 *   Doc-y konstant über Scroll      → Grafik scrollt normal mit der Seite
 *   Doc-y wächst 1:1 mit dem Scroll → Grafik steht fix im Bild (gepinnt)
 *   Doc-y wächst langsamer          → Parallax
 *   Doc-x ändert sich               → Grafik fliegt quer durchs Bild
 * Zwischen zwei Keyframes wird per Easing-Kurve interpoliert (s. easing.ts/
 * EasingKurve.tsx), davor/danach geklemmt.
 */

import { cubicBezierEasing, EASING_DEFAULT, type Bezier4 } from "./easing";

/** Ein Scroll-Keyframe: „an DIESER Scrollposition sieht die Grafik SO aus". */
export interface GrafikKeyframe {
  /** Dokument-Scrollposition (window.scrollY), an der dieser Zustand gilt. */
  scrollY: number;
  /** Dokument-Koordinaten des Grafik-MITTELPUNKTS. */
  x: number;
  y: number;
  /** Skalierung (1 = Grundbreite breitePx). */
  scale: number;
  /** Deckkraft 0..1. */
  opacity: number;
  /** Drehung in Grad. */
  rotation: number;
  /** Verlaufskurve zum NÄCHSTEN Keyframe (kubische Bezier-Kontrollpunkte
   *  x1,y1,x2,y2 wie CSS cubic-bezier() — s. easing.ts). Fehlt sie
   *  (Altdaten ohne dieses Feld), gilt EASING_DEFAULT (weiches ease-in-out)
   *  — s. zustandBei. Sichtbar/verstellbar über EasingKurve.tsx. */
  easing?: Bezier4;
  /** Frame-spezifischer Bildtausch: überschreibt NUR an diesem Keyframe die
   *  Quelle der Grafik (Grafik.src) — z.B. ein anderer Gesichtsausdruck
   *  mitten im Scroll. Fehlt sie, gilt ganz normal Grafik.src (s.
   *  letzterErreichterKeyframe/effektiveQuelle unten, genutzt von
   *  GrafikLayer/GrafikMedium). Harte Umschaltung an der Keyframe-Grenze,
   *  kein Crossfade. */
  srcOverride?: string;
}

/** Eine platzierte Grafik (animiertes SVG oder Bild). */
/** Medienart eines Assets. Bestimmt, WIE gerendert wird:
 *  bild   – <img>: SVG (statisch/SMIL/CSS-animiert), PNG/JPG/WebP/GIF/AVIF/APNG
 *  lottie – <canvas> via lottie-web: Vektor-Animation, SCRUBBAR am Scroll
 *  video  – <video>: MP4/WebM, ebenfalls scrubbar am Scroll */
export type MedienArt = "bild" | "lottie" | "video";

/** Erkennt die Medienart am Dateinamen/MIME. Zentral, damit Bibliothek,
 *  Platzierung und Rendering nie auseinanderlaufen. */
export function medienArt(name: string, mime?: string): MedienArt {
  const n = name.toLowerCase();
  if (n.endsWith(".lottie") || n.endsWith(".json")) return "lottie";
  if (n.endsWith(".mp4") || n.endsWith(".webm") || mime?.startsWith("video/")) return "video";
  return "bild";
}

/** Wie eine zeitbasierte Animation (Lottie/Video) läuft. */
export type AbspielModus =
  /** Endlosschleife, unabhängig vom Scroll. */
  | "loop"
  /** Abspielkopf hängt am Scroll: hochscrollen = rückwärts. Der Fortschritt
   *  wird zwischen dem ersten und letzten Keyframe der Grafik abgebildet —
   *  „lebendige Scroll-Animation" im Wortsinn. */
  | "scrub"
  /** Steht still auf dem ersten Bild. */
  | "still";

export interface Grafik {
  id: string;
  /** Anzeigename in der Bibliothek. */
  name: string;
  /** Data-URL bzw. Pfad der Datei. Bilder werden bewusst als <img>
   *  gerendert: SMIL/CSS-Animationen laufen dort, eingebettete Skripte
   *  NICHT (kein fremder Code im Editor). */
  src: string;
  /** Medienart — steuert das Rendering (s. medienArt). */
  art: MedienArt;
  /** Grundbreite in px bei scale=1 (Höhe folgt dem Seitenverhältnis). */
  breitePx: number;
  /** Zeichenreihenfolge: höher = weiter vorn. */
  z: number;
  /** Nur Lottie/Video: wie die Animation läuft. Default "loop". */
  modus?: AbspielModus;
  /** Nur Video: stummschalten (Browser blocken Ton ohne Nutzergeste). */
  stumm?: boolean;
  /** Ebene ausblenden, ohne sie zu löschen. */
  versteckt?: boolean;
  /** Ebene sperren: kein Anfassen im Editor (gegen Verrutschen). */
  gesperrt?: boolean;
  /** Horizontal spiegeln — reine Anzeige-Transform (negative scaleX, s.
   *  GrafikLayer.tsx), verändert NICHT die Bilddatei selbst. */
  spiegelX?: boolean;
  /** Vertikal spiegeln — s. spiegelX. */
  spiegelY?: boolean;
  /** Mindestens 1 Keyframe; nach scrollY sortiert gehalten. */
  keyframes: GrafikKeyframe[];
}

/** Ein Asset im Bibliotheks-POOL: verfügbar, aber nicht zwingend platziert. */
export interface Asset {
  id: string;
  name: string;
  /** Data-URL (wie Grafik.src) ODER direkte URL eines Server-Assets
   *  (z.B. "/curtain/trees/tree-1-0.png", s. /api/assets) — beides ist als
   *  <img src> gültig, der Editor unterscheidet nicht zwischen den Quellen. */
  src: string;
  art: MedienArt;
  /** Ordner relativ zu public/, nur bei Server-Assets gesetzt — gruppiert
   *  die Bibliotheks-Ansicht (s. GrafikEditor). Ordner-Dialog-Assets haben
   *  kein Gegenstück, weil der Browser dort nur die flache Dateiliste des
   *  gewählten Ordners liefert, keine Unterordner-Pfade. */
  ordner?: string;
}

/** Scrub-Fortschritt 0..1 einer Grafik bei scrollY: bildet den Scroll
 *  zwischen erstem und letztem Keyframe auf 0..1 ab. Bei nur einem Keyframe
 *  gibt es keine Strecke → 0. */
export function scrubFortschritt(g: Grafik, scrollY: number): number {
  const kf = g.keyframes;
  if (kf.length < 2) return 0;
  const a = kf[0].scrollY;
  const b = kf[kf.length - 1].scrollY;
  if (b <= a) return 0;
  return Math.min(1, Math.max(0, (scrollY - a) / (b - a)));
}

/** Ein benanntes Setup: platzierte Grafiken UND die Bibliothek. Beides wird
 *  gespeichert — sonst müsste Leon seinen Asset-Ordner nach jedem Reload neu
 *  einlesen (der Fluss-Editor speichert seinen Zustand ja auch vollständig). */
export interface GrafikSetup {
  name: string;
  gespeichert: string;
  meta: { viewportW: number; viewportH: number; docH: number };
  grafiken: Grafik[];
  /** Bibliothek. Optional: ältere Setups ohne dieses Feld laden weiterhin. */
  pool?: Asset[];
  /** Stabile Plaetze ("ebene:seite:index"), die aus einer seiteneigenen
   *  Zeichnung (aktuell: die Vorhang-Baeume, s. GrafikSeiteTab.tsx) in den
   *  Builder UEBERNOMMEN wurden — die Quelle (z.B. TitleCurtain) ueberspringt
   *  genau diese Plaetze beim Rendern. Optional: aeltere Setups/Abbilder ohne
   *  dieses Feld laden weiterhin (leer = nichts uebernommen). */
  uebernommen?: string[];
}

/** Prefix fuer die ID einer Grafik, die einen von der Seite selbst
 *  gezeichneten Platz (z.B. einen Vorhang-Baum) uebernommen hat. Der Teil
 *  NACH dem Prefix ist die stabile Platz-ID ("ebene:seite:index", s.
 *  GrafikSeiteTab.tsx) — daraus laesst sich ohne ein Zusatzfeld an Grafik
 *  selbst in BEIDE Richtungen navigieren (Platz → Grafik-ID und zurueck).
 *  Zentral hier (nicht lokal in GrafikSeiteTab.tsx), damit GrafikEditor.tsx
 *  beim generischen Loeschen (Reiter „Ebenen") denselben String kennt und den
 *  Uebernahme-Eintrag mit aufraeumen kann — sonst bliebe ein Platz nach
 *  einem normalen Loeschen fuer immer leer. */
export const VORHANG_GRAFIK_PREFIX = "vorhang:";

/** Interpolierter Zustand einer Grafik bei einer Scrollposition. */
export interface GrafikZustand {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  rotation: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Zustand einer Grafik bei scrollY: vor dem ersten / nach dem letzten
 *  Keyframe wird geklemmt (die Grafik „hält" ihren Randzustand), dazwischen
 *  linear interpoliert. Bei nur EINEM Keyframe ist der Zustand konstant —
 *  die Grafik hängt dann einfach im Dokument und scrollt mit. */
export function zustandBei(g: Grafik, scrollY: number): GrafikZustand {
  const kf = g.keyframes;
  if (kf.length === 0) {
    return { x: 0, y: 0, scale: 1, opacity: 1, rotation: 0 };
  }
  if (kf.length === 1 || scrollY <= kf[0].scrollY) {
    const k = kf[0];
    return { x: k.x, y: k.y, scale: k.scale, opacity: k.opacity, rotation: k.rotation };
  }
  const letzt = kf[kf.length - 1];
  if (scrollY >= letzt.scrollY) {
    return {
      x: letzt.x,
      y: letzt.y,
      scale: letzt.scale,
      opacity: letzt.opacity,
      rotation: letzt.rotation,
    };
  }
  let i = 0;
  while (i < kf.length - 2 && kf[i + 1].scrollY < scrollY) i++;
  const a = kf[i];
  const b = kf[i + 1];
  const spanne = b.scrollY - a.scrollY;
  const t = spanne <= 0 ? 0 : (scrollY - a.scrollY) / spanne;
  /* Flüssiger statt linearer Verlauf: das Lerp-t läuft durch die
     Easing-Kurve des LINKEN Keyframes (a), bevor interpoliert wird — genau
     das macht den Übergang „wie eine Maske" sichtbar weich (s. EasingKurve.tsx).
     Fehlt a.easing (Altdaten ohne das Feld), greift EASING_DEFAULT. */
  const te = cubicBezierEasing(a.easing ?? EASING_DEFAULT)(t);
  return {
    x: lerp(a.x, b.x, te),
    y: lerp(a.y, b.y, te),
    scale: lerp(a.scale, b.scale, te),
    opacity: lerp(a.opacity, b.opacity, te),
    rotation: lerp(a.rotation, b.rotation, te),
  };
}

/** Keyframe, der bei dieser Scrollposition zuletzt ERREICHT wurde — die
 *  linke Stütze des aktuellen Interpolationssegments (dieselbe Wahl wie „a"
 *  in zustandBei oben). Vor dem ersten/nach dem letzten Keyframe gilt der
 *  jeweilige Rand-Keyframe. Bestimmt NUR, welcher srcOverride gerade greift
 *  (harte Umschaltung an der Keyframe-Grenze, s. effektiveQuelle) — Position/
 *  Größe/Deckkraft/Drehung bleiben davon unabhängig weiter stufenlos über
 *  zustandBei interpoliert.
 *
 *  NICHT zu verwechseln mit naechsterKfIndex (GrafikEditor.tsx): das ist der
 *  NÄCHSTGELEGENE Keyframe (für Bearbeiten per Scroll-Nähe, in beide
 *  Richtungen) — hier zählt stattdessen nur die Scroll-RICHTUNG (zuletzt
 *  passiert, wie ein Regisseur-Schnitt). */
export function letzterErreichterKeyframe(g: Grafik, scrollY: number): GrafikKeyframe | null {
  const kf = g.keyframes;
  if (kf.length === 0) return null;
  if (kf.length === 1 || scrollY <= kf[0].scrollY) return kf[0];
  const letzt = kf[kf.length - 1];
  if (scrollY >= letzt.scrollY) return letzt;
  let i = 0;
  while (i < kf.length - 2 && kf[i + 1].scrollY < scrollY) i++;
  return kf[i];
}

/** Effektive Bildquelle bei scrollY: srcOverride des zuletzt erreichten
 *  Keyframes, sonst g.src — für Grafiken ganz ohne srcOverride (der
 *  Normalfall) IMMER identisch zu g.src, also unverändertes Verhalten. */
export function effektiveQuelle(g: Grafik, scrollY: number): string {
  return letzterErreichterKeyframe(g, scrollY)?.srcOverride ?? g.src;
}

/** Hoehen-Normalisierung (Robustheits-Fix): scrollY UND y jedes Keyframes
 *  sind DOKUMENT-absolute Werte, autoriert gegen EINE bestimmte Seitenhoehe
 *  (GrafikSetup.meta.docH bzw. grafik.config.json $meta). Weicht die Hoehe
 *  der ZIEL-Seite davon ab (anderer Viewport, andere Inhalte seit dem
 *  Speichern, anderer Backdrop/Embed-Host), driften Position UND
 *  Scroll-Schwelle proportional auseinander.
 *
 *  faktor = aktuelleDocH / autorierteDocH, EINHEITLICH auf scrollY UND y
 *  angewandt (nicht nur auf einen der beiden Werte) — das erhaelt exakt das
 *  VERHAELTNIS zwischen beiden ueber jedes Keyframe-Paar hinweg, und genau
 *  dieses Verhaeltnis kodiert das Verhalten "scrollt mit" (y konstant) /
 *  "steht fix" (y waechst 1:1 mit scrollY) / "Parallax" (dazwischen) — s.
 *  Kopfkommentar dieser Datei. x bleibt unangetastet: nur die SEITENHOEHE
 *  ist hier das Thema, keine Breiten-Aenderung.
 *
 *  faktor=1 ist ein bewusster No-Op (gibt `grafiken` unveraendert zurueck,
 *  keine neuen Objekte) — der Normalfall (Autoren- und Zielhoehe identisch)
 *  bleibt dadurch bit-fuer-bit wie bisher. */
export function skaliereGrafikenFuerHoehe(grafiken: Grafik[], faktor: number): Grafik[] {
  if (faktor === 1) return grafiken;
  return grafiken.map((g) => ({
    ...g,
    keyframes: g.keyframes.map((k) => ({ ...k, scrollY: k.scrollY * faktor, y: k.y * faktor })),
  }));
}
