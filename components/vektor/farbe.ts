/*
 * farbe.ts – Farbraum-Hilfsfunktionen: Hex-Format und HSL-basierte Namens-Heuristik.
 *
 * Die eigentliche RGB-Distanzberechnung (fürs Quantisieren) lebt bewusst NICHT hier,
 * sondern inline im Hot-Loop von quantisieren.ts – ein Aufruf hier würde pro Pixel ein
 * {r,g,b}-Objekt anlegen (bei 400k+ Pixeln spürbar), inline bleiben es reine Zahlen.
 */

import type { RGB } from "./typen";

interface HSL {
  readonly h: number; // 0..360
  readonly s: number; // 0..1
  readonly l: number; // 0..1
}

export function rgbZuHex(rgb: RGB): string {
  const teil = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${teil(rgb.r)}${teil(rgb.g)}${teil(rgb.b)}`;
}

function rgbZuHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const spanne = max - min;
  const s = l > 0.5 ? spanne / (2 - max - min) : spanne / (max + min);

  let h: number;
  if (max === r) {
    h = ((g - b) / spanne + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / spanne + 2) * 60;
  } else {
    h = ((r - g) / spanne + 4) * 60;
  }

  return { h, s, l };
}

/**
 * Deutscher Basis-Farbname aus HSL, für lesbare SVG-Gruppen-IDs.
 * Achromatische Fälle (Helligkeit/Sättigung) haben Vorrang vor dem Farbton,
 * danach Braun als Sonderfall (dunkles, gedecktes Orange) – erst danach der
 * reguläre Farbkreis. Kollisionen (zwei Paletten-Farben → gleicher Name)
 * werden NICHT hier behandelt, sondern beim Zusammenbau der SVG-Gruppen
 * (svg.ts), weil nur dort die volle Palette bekannt ist.
 */
/** Grundton allein aus dem Farbkreis – Helligkeit kommt separat dazu. */
function grundTon(h: number): string {
  if (h < 15 || h >= 345) return "rot";
  if (h < 45) return "orange";
  if (h < 70) return "gelb";
  if (h < 150) return "gruen";
  if (h < 195) return "tuerkis";
  if (h < 255) return "blau";
  if (h < 290) return "violett";
  return "rot"; // Magenta/Pink-Rest schlägt sich zum nächstliegenden benannten Ton.
}

export function farbName(rgb: RGB): string {
  const { h, s, l } = rgbZuHsl(rgb);

  if (l < 0.12) return "schwarz";
  if (l > 0.92 && s < 0.15) return "weiss";
  if (s < 0.12) return "grau";

  /* Braun = dunkles/gedecktes Rot-Orange-Gelb. Der Bereich beginnt bewusst
     schon bei 10° und nicht erst bei 18°: Stamm-Töne wie #724130 liegen bei
     ~15° und fielen sonst durch die Lücke direkt auf "orange". */
  if (h >= 10 && h < 50 && l < 0.5 && s < 0.75) return "braun";

  /* Drei Helligkeitsstufen statt zwei. Eine einzelne Schwelle bei 0.35 war
     eine Messerschneide – Grüntöne mit l≈0.353 kippten willkürlich auf
     "hell". Die Mittelstufe bleibt bewusst namenlos: kürzere IDs, und die
     Stufe trägt sowieso die meisten Töne. */
  const ton = grundTon(h);
  if (l < 0.3) return `${ton}-dunkel`;
  if (l > 0.6) return `${ton}-hell`;
  return ton;
}
