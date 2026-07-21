/*
 * Beispiel-Eingabe fuer den Stufe-A-Import-Beweis (/puck-import).
 *
 * Exakt das GrafikSetup-Format, das der Grafik-Editor per "Export JSON"
 * erzeugt (components/grafik/grafik-types.ts). Es ist ein BEISPIEL, weil die
 * echte grafik.config.json und abbilder/ aktuell leer sind (Ausgangszustand);
 * die referenzierten Assets sind aber real und liegen unter public/ — der
 * Adapter arbeitet also auf echtem Format mit echten Dateien.
 *
 * Sobald Leon im Grafik-Editor ein Setup exportiert, kann exakt dieses JSON
 * hier eingesetzt werden — der Adapter (lib/import/grafik-setup-to-puck.ts)
 * bleibt unveraendert.
 */

import type { GrafikSetup } from "@/components/grafik/grafik-types";

export const beispielSetup: GrafikSetup = {
  name: "Beispiel-Import (Stufe A Demo)",
  gespeichert: "2026-07-21T00:00:00.000Z",
  meta: { viewportW: 1280, viewportH: 720, docH: 4000 },
  grafiken: [
    {
      id: "hero-hintergrund",
      name: "Hero Luftbild",
      src: "/images/hero-fields-aerial.jpg",
      art: "bild",
      breitePx: 460,
      z: 0,
      keyframes: [{ scrollY: 0, x: 640, y: 360, scale: 1, opacity: 1, rotation: 0 }],
    },
    {
      id: "titelbild-vektor",
      name: "Titelbild (Vektor)",
      src: "/vektor/titelbild.svg",
      art: "bild",
      breitePx: 300,
      z: 1,
      keyframes: [{ scrollY: 0, x: 420, y: 300, scale: 1, opacity: 0.95, rotation: 0 }],
    },
    {
      id: "baum-vordergrund",
      name: "Baum",
      src: "/curtain/trees/tree-1-0.png",
      art: "bild",
      breitePx: 180,
      z: 2,
      keyframes: [{ scrollY: 0, x: 300, y: 520, scale: 1, opacity: 1, rotation: 0 }],
    },
  ],
};
