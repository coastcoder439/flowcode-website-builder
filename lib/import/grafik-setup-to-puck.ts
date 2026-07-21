/*
 * R2b — Website-Importer Stufe A: deterministischer Adapter.
 *
 * Uebersetzt ein datengetriebenes GrafikSetup (das Export-Format des
 * Grafik-Editors, s. components/grafik/grafik-types.ts) mechanisch in das
 * Puck-Datenmodell (Data.content[]). KEIN LLM, keine Heuristik, kein
 * Seiteneffekt — reine Funktion, gleiche Eingabe -> gleiche Ausgabe.
 *
 * Prinzip (zielbuild-und-stand.md, Stufe A): Weil Quelle und Ziel dieselbe
 * Komponenten-Bibliothek teilen, ist das Mapping ein 1:1-Uebersetzer. Jede
 * `Grafik` wird ein registrierter "GrafikLayer"-Puck-Baustein; der Puck-
 * render delegiert spaeter 1:1 an die bestehende Render-Einheit
 * (components/grafik/GrafikMedium.tsx) -> Paritaet.
 *
 * Statischer Zustand: Puck ist ein KOMPOSITIONS-Editor, keine Scroll-Buehne.
 * Position/Look kommen deshalb aus dem ERSTEN Keyframe (der Ausgangszustand
 * der Grafik). Die volle Scroll-Animation (keyframes[]) ist Laufzeit-Verhalten
 * der final exportierten Seite, nicht des Editors — sie geht hier bewusst
 * nicht verloren, wird aber im Kompositions-Editor nicht abgespielt.
 */

import type { Data } from "@puckeditor/core";
import type { GrafikSetup, MedienArt } from "@/components/grafik/grafik-types";

/** Props, die ein "GrafikLayer"-Puck-Baustein aus einer Grafik traegt. */
export interface GrafikLayerBlockProps {
  /** Puck verlangt eine eindeutige id pro content-Item. */
  id: string;
  name: string;
  src: string;
  art: MedienArt;
  breitePx: number;
  z: number;
  /** Statischer Kompositions-Zustand aus dem ersten Keyframe. */
  scale: number;
  opacity: number;
  rotation: number;
}

/**
 * GrafikSetup -> Puck-Data. Deterministisch, nach z sortiert
 * (Zeichenreihenfolge: kleineres z = weiter hinten).
 */
export function grafikSetupToPuck(setup: GrafikSetup): Data {
  const sortiert = [...setup.grafiken].sort((a, b) => a.z - b.z);

  const content = sortiert.map((g) => {
    const kf0 = g.keyframes[0];
    const props: GrafikLayerBlockProps = {
      id: g.id,
      name: g.name,
      src: g.src,
      art: g.art,
      breitePx: g.breitePx,
      z: g.z,
      scale: kf0 ? kf0.scale : 1,
      opacity: kf0 ? kf0.opacity : 1,
      rotation: kf0 ? kf0.rotation : 0,
    };
    return { type: "GrafikLayer", props };
  });

  return { content, root: {} };
}
