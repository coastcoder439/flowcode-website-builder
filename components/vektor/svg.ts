/*
 * svg.ts – Baut aus konturierten Regionen das finale SVG-Markup.
 *
 * Gruppierung ist nach Farbe (eine `<g>` pro Palettenfarbe), aber die
 * ZEICHENREIHENFOLGE (= Dokumentreihenfolge, bestimmt was hinten/vorne liegt)
 * folgt der GRÖSSE: die Gruppe mit der größten Einzelregion kommt zuerst
 * (hinten), damit große Flächen (Kronen-/Stammgrundton) zuerst gemalt werden
 * und kleinere Detail-Regionen (Highlights, Schattenflecken) – auch aus
 * anderen Farbgruppen – automatisch darüber liegen. Innerhalb einer Gruppe
 * gilt dieselbe Regel für die einzelnen Pfade.
 */

import type { RGB, RegionMitKontur, VektorGruppe } from "./typen";
import { farbName, rgbZuHex } from "./farbe";
import { polygonZuBezierPfad } from "./bezier";

export interface SvgErgebnis {
  readonly svg: string;
  readonly gruppen: VektorGruppe[];
}

interface GruppenDaten {
  readonly paletteIndex: number;
  readonly name: string;
  readonly regionenAbsteigend: RegionMitKontur[];
  readonly maxFlaeche: number;
}

export function baueSvg(
  regionenMitKontur: RegionMitKontur[],
  palette: RGB[],
  breite: number,
  hoehe: number,
  glaettung: number,
): SvgErgebnis {
  const gruppenDaten = gruppiereUndBenenne(regionenMitKontur, palette);
  gruppenDaten.sort((a, b) => b.maxFlaeche - a.maxFlaeche || a.paletteIndex - b.paletteIndex);

  let naechsteFId = 0;
  const gruppenMarkup: string[] = [];
  const gruppen: VektorGruppe[] = [];

  for (const g of gruppenDaten) {
    const hex = rgbZuHex(palette[g.paletteIndex]);
    const pfadMarkup: string[] = [];
    for (const rmk of g.regionenAbsteigend) {
      const d = baueD(rmk, glaettung);
      if (!d) continue; // degenerierte Region (Kontur zu klein für einen sichtbaren Pfad) -> überspringen
      const fillRule = rmk.kontur.loecher.length > 0 ? ` fill-rule="evenodd"` : "";
      pfadMarkup.push(`<path id="f-${naechsteFId++}" d="${d}"${fillRule}/>`);
    }
    if (pfadMarkup.length === 0) continue;
    gruppenMarkup.push(`<g id="${g.name}" fill="${hex}">${pfadMarkup.join("")}</g>`);
    gruppen.push({ name: g.name, farbe: hex, pfade: pfadMarkup.length });
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${breite} ${hoehe}"><g id="baum">${gruppenMarkup.join("")}</g></svg>`;
  return { svg, gruppen };
}

/** Ein Teilpfad pro Region: äußerer Rand + ggf. Löcher, alle als kubische Bezierkurven. */
function baueD(rmk: RegionMitKontur, glaettung: number): string {
  const aussenD = polygonZuBezierPfad(rmk.kontur.aussen, glaettung);
  if (!aussenD) return "";
  const loecherD = rmk.kontur.loecher.map((l) => polygonZuBezierPfad(l, glaettung)).filter((s) => s.length > 0);
  return [aussenD, ...loecherD].join(" ");
}

/**
 * Gruppiert nach Palettenfarbe und vergibt Namen in PALETTE-INDEX-Reihenfolge
 * (nicht in späterer Zeichenreihenfolge) – das macht Namensvergabe/Kollisions-
 * nummerierung unabhängig von der nachgelagerten Größen-Sortierung und damit
 * stabil bei gleichem Input.
 */
function gruppiereUndBenenne(regionenMitKontur: RegionMitKontur[], palette: RGB[]): GruppenDaten[] {
  const nachPalette = new Map<number, RegionMitKontur[]>();
  for (const rmk of regionenMitKontur) {
    const liste = nachPalette.get(rmk.region.paletteIndex);
    if (liste) {
      liste.push(rmk);
    } else {
      nachPalette.set(rmk.region.paletteIndex, [rmk]);
    }
  }

  const vergebeneNamen = new Set<string>();
  const gruppenDaten: GruppenDaten[] = [];

  for (let p = 0; p < palette.length; p++) {
    const regionen = nachPalette.get(p);
    if (!regionen || regionen.length === 0) continue;

    const basisName = `gruppe-${farbName(palette[p])}`;
    const name = eindeutigerName(basisName, vergebeneNamen);
    vergebeneNamen.add(name);

    const regionenAbsteigend = [...regionen].sort((a, b) => b.region.flaeche - a.region.flaeche);
    gruppenDaten.push({
      paletteIndex: p,
      name,
      regionenAbsteigend,
      maxFlaeche: regionenAbsteigend[0].region.flaeche,
    });
  }

  return gruppenDaten;
}

function eindeutigerName(basisName: string, vergeben: ReadonlySet<string>): string {
  if (!vergeben.has(basisName)) return basisName;
  let n = 2;
  while (vergeben.has(`${basisName}-${n}`)) n++;
  return `${basisName}-${n}`;
}
