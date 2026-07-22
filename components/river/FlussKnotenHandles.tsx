"use client";

/*
 * FlussKnotenHandles – die anfassbare Knoten-Ebene (.rke-layer) des Flusses,
 * aus RiverKursEditor.tsx herausgelöst (Welle 2b-1). Rein darstellend: bekommt
 * die Steuerung (useFlussKnoten) und zeichnet je Knoten einen Handle an seiner
 * Dokument-Position. Die Ebene selbst fängt NICHTS ab (pointer-events:none in
 * .rke-layer) — nur die Handles sind anfassbar, damit die echte Seite darunter
 * bedienbar bleibt.
 *
 * Zwei Nutzer teilen sich diese EINE Ansicht:
 *  - RiverKursEditor (alte Route): immer sichtbar.
 *  - /editor (FlussHandlesEbene): nur bei Fluss-Fokus sichtbar/aktiv.
 */

import type { FlussKnotenSteuerung } from "./useFlussKnoten";

interface FlussKnotenHandlesProps {
  steuerung: FlussKnotenSteuerung;
}

export function FlussKnotenHandles({ steuerung }: FlussKnotenHandlesProps) {
  const { zone, nodes, gelockt, onPointerDown, onPointerMove, onPointerUp } = steuerung;
  if (!zone || !nodes) return null;
  return (
    <div className="rke-layer" aria-hidden="true">
      {nodes.map((n, i) => {
        /* Handle = der Knoten selbst (Design → Dokument). Er IST die
           Fluss-Mittellinie, deshalb sitzt er immer auf dem Wasser. */
        const left = zone.leftDoc + zone.colLeft + n.x * zone.scale;
        const top = zone.topDoc + n.y * zone.scale;
        const istGelockt = gelockt === i;
        return (
          <div
            key={i}
            className={`rke-knoten${istGelockt ? " rke-knoten--lock" : ""}`}
            style={{ left, top }}
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp(i)}
          >
            <span className="rke-knoten-label">
              {i + 1} · {Math.round(n.breite)}px
            </span>
          </div>
        );
      })}
    </div>
  );
}
