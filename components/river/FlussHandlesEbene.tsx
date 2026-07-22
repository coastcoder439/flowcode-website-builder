"use client";

/*
 * FlussHandlesEbene – die Knoten-Handle-Ebene auf /editor. Anders als im alten
 * .rke-Panel (RiverKursEditor, immer sichtbar) sind die Handles hier NUR aktiv,
 * wenn das Fluss-Objekt den Bearbeitungs-Fokus hat (Bauvorlage §1: verhindert
 * Drag-Konflikte Grafik ↔ Knoten ohne globalen Modus). Ohne Fokus wird nichts
 * gerendert → die .rke-layer existiert gar nicht, kein toter Treffer-Fänger
 * über der Bühne.
 */

import { FlussKnotenHandles } from "./FlussKnotenHandles";
import { useFlussObjekt } from "./FlussObjektContext";

export function FlussHandlesEbene() {
  const fo = useFlussObjekt();
  if (!fo || !fo.fokus || !fo.steuerung) return null;
  return <FlussKnotenHandles steuerung={fo.steuerung} />;
}
