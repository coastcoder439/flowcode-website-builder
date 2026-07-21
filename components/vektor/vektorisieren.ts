/*
 * vektorisieren.ts – Öffentlicher Einstiegspunkt: orchestriert die gesamte Pipeline
 * Quantisierung -> Regionen -> Konturen -> Vereinfachung -> Bezier/SVG.
 *
 * Reines TypeScript ohne DOM-Zugriffe und ohne npm-Abhängigkeiten: der Aufrufer
 * (z.B. eine API-Route) liefert bereits dekodierte RGBA-Pixel, hier passiert nur
 * noch reine Pixel-/Geometrie-Verarbeitung.
 */

import type { AufgeloesteOptionen, Punkt, Region, RegionMitKontur, VektorErgebnis, VektorOptionen } from "./typen";
import { quantisieren } from "./quantisieren";
import { findeRegionen } from "./regionen";
import { traceKontur } from "./konturen";
import { vereinfachePolygon } from "./vereinfachen";
import { baueSvg } from "./svg";

export type { VektorErgebnis, VektorGruppe, VektorOptionen } from "./typen";

const STANDARD_MAX_FARBEN = 8;
const STANDARD_MIN_FLAECHE_PX = 40;
const STANDARD_GLAETTUNG = 0.5;
const STANDARD_ALPHA_SCHWELLE = 128;

const RDP_TOLERANZ_BASIS = 0.5;
const RDP_TOLERANZ_GLAETTUNG_FAKTOR = 2.5;

export function vektorisiere(
  rgba: Uint8ClampedArray,
  breite: number,
  hoehe: number,
  opt?: VektorOptionen,
): VektorErgebnis {
  const start = Date.now();

  const breiteGanzzahl = Number.isFinite(breite) ? Math.max(0, Math.trunc(breite)) : 0;
  const hoeheGanzzahl = Number.isFinite(hoehe) ? Math.max(0, Math.trunc(hoehe)) : 0;
  const benoetigteBytes = breiteGanzzahl * hoeheGanzzahl * 4;

  if (breiteGanzzahl === 0 || hoeheGanzzahl === 0 || rgba.length < benoetigteBytes) {
    return leeresErgebnis(breiteGanzzahl, hoeheGanzzahl, start);
  }

  const o = loeseOptionenAuf(opt);

  const { palette, labelBuffer } = quantisieren(rgba, breiteGanzzahl, hoeheGanzzahl, o.alphaSchwelle, o.maxFarben);
  if (palette.length === 0) {
    return leeresErgebnis(breiteGanzzahl, hoeheGanzzahl, start); // komplett transparentes Bild
  }

  const { regionen, regionMap } = findeRegionen(labelBuffer, breiteGanzzahl, hoeheGanzzahl, o.minFlaechePx);

  const toleranz = RDP_TOLERANZ_BASIS + o.glaettung * RDP_TOLERANZ_GLAETTUNG_FAKTOR;
  const regionenMitKontur = regionen.map((region, index) =>
    aufbereiteRegion(regionMap, breiteGanzzahl, hoeheGanzzahl, region, index, toleranz),
  );

  const { svg, gruppen } = baueSvg(regionenMitKontur, palette, breiteGanzzahl, hoeheGanzzahl, o.glaettung);

  return { svg, gruppen, breite: breiteGanzzahl, hoehe: hoeheGanzzahl, dauerMs: Date.now() - start };
}

function aufbereiteRegion(
  regionMap: Int32Array,
  breite: number,
  hoehe: number,
  region: Region,
  index: number,
  toleranz: number,
): RegionMitKontur {
  const kontur = traceKontur(regionMap, breite, hoehe, region, index);
  return {
    region,
    kontur: {
      aussen: vereinfachtOderRoh(kontur.aussen, toleranz),
      loecher: kontur.loecher.map((l) => vereinfachtOderRoh(l, toleranz)),
    },
  };
}

function vereinfachtOderRoh(punkte: Punkt[], toleranz: number): Punkt[] {
  const vereinfacht = vereinfachePolygon(punkte, toleranz);
  // Falls RDP eine Kontur auf <3 Punkte zusammenstreicht (möglich bei sehr kleinen/
  // dünnen Formen + hoher Toleranz), auf die unvereinfachte Rohkontur zurückfallen –
  // sonst würde die Region unsichtbar, obwohl sie die minFlaechePx-Schwelle passiert hat.
  return vereinfacht.length >= 3 ? vereinfacht : punkte;
}

function loeseOptionenAuf(opt?: VektorOptionen): AufgeloesteOptionen {
  return {
    maxFarben: klemme(Math.round(opt?.maxFarben ?? STANDARD_MAX_FARBEN), 1, 256),
    minFlaechePx: klemme(Math.round(opt?.minFlaechePx ?? STANDARD_MIN_FLAECHE_PX), 0, 1_000_000),
    glaettung: klemme(opt?.glaettung ?? STANDARD_GLAETTUNG, 0, 1),
    alphaSchwelle: klemme(Math.round(opt?.alphaSchwelle ?? STANDARD_ALPHA_SCHWELLE), 0, 255),
  };
}

function klemme(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min; // defensiv gegen NaN/Infinity aus fehlerhaften Aufrufer-Optionen
  return Math.max(min, Math.min(max, n));
}

function leeresErgebnis(breite: number, hoehe: number, start: number): VektorErgebnis {
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${breite} ${hoehe}"><g id="baum"></g></svg>`,
    gruppen: [],
    breite,
    hoehe,
    dauerMs: Date.now() - start,
  };
}
