"use client";

/*
 * EmbedRoot – Wurzelkomponente des STANDALONE Embeds (Phase 2). Bekommt eine
 * Config (Grafiken + optional Fluss-Snapshot + optional Farben) und rendert
 * exakt dieselben Bausteine wie die echte Landing – RiverFromSnapshot +
 * GrafikLayer (Phase 1, UNVERAENDERT wiederverwendet) – aber als Overlay über
 * einem BELIEBIGEN Host-Dokument statt der eigenen Next-Seite.
 *
 * FARBEN: RiverWaves/RiverFeatures/RiverFromSnapshot sind FEST an CSS-
 * Variablen (var(--water-800) etc.) gebunden (kein Prop, s. Kopfkommentar
 * RiverFromSnapshot.tsx – "duerfen laut Auftrag nicht angefasst werden").
 * Eine fremde Seite kennt diese Tokens nicht -> wir injizieren sie hier als
 * :root{}-Style, aus config.farben/config.fluss.farben (schon aufgeloeste
 * Hex-Werte, s. riverSnapshot.ts) oder – falls beides fehlt – einem
 * Default-Satz, 1:1 aus app/design-tokens.css uebernommen.
 *
 * OVERLAY: haengt per React-Portal an ein selbst erzeugtes <div> DIREKT unter
 * document.body (position:absolute; top:0; left:0; width:100%; klick-
 * durchlaessig) statt im Next-Mount-Div zu bleiben. Ein Host mit eigenem
 * Layout (max-width-Container, eigener position:relative-Body o.ae.) wuerde
 * die Fluss-/Grafik-Ebene sonst auf die Mount-Stelle einschraenken statt auf
 * das GANZE Dokument – GrafikLayer rechnet aber in Dokument-Koordinaten
 * (s. grafik-types.ts) und RiverFromSnapshot misst die eigene Zonenposition
 * gegen den Viewport (useScroll(target)), beides setzt eine stabile, vom Host
 * unbeeinflusste Containing-Block-Etage voraus.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RiverFromSnapshot } from "../river/RiverFromSnapshot";
import { GrafikLayer } from "../grafik/GrafikLayer";
import { FARBEN_TOKEN_KEYS, type FlussFarben, type FlussVerlauf } from "../river/riverSnapshot";
import type { Grafik } from "../grafik/grafik-types";

/** Default-Farben – 1:1 aus app/design-tokens.css, dieselben 10 Tokens, die
 *  riverSnapshot.ts als FARBEN_TOKEN_KEYS definiert. Greift nur, wenn der
 *  Host weder eigene `farben` noch einen Fluss mit eingefrorenen Farben
 *  mitgibt (z.B. eine Grafik-only-Einbindung ohne Fluss). */
const DEFAULT_FARBEN: FlussFarben = {
  "--water-900": "#264B57",
  "--water-800": "#4395A7",
  "--water-700": "#52A8B6",
  "--water-600": "#68BAC4",
  "--water-500": "#81CAD4",
  "--water-400": "#96D5D5",
  "--water-300": "#BCE8E5",
  "--bank-500": "#CDA475",
  "--bank-400": "#DCC094",
  "--green-900": "#143021",
};

export interface EmbedConfig {
  grafiken: Grafik[];
  /** Dokumenthöhe des Host-Editors zum Export-Zeitpunkt (Robustheits-Fix):
   *  `grafiken[].keyframes[].scrollY/y` sind Dokument-absolute Werte,
   *  autoriert gegen DIESE Höhe. Ein fremder Host hat fast immer eine
   *  ANDERE Dokumenthöhe (eigenes Layout/Content) — ohne diese Angabe würde
   *  GrafikLayer die Werte 1:1 übernehmen und an der falschen relativen
   *  Stelle rendern (s. GrafikLayer.tsx/skaliereGrafikenFuerHoehe).
   *  Optional: ältere Exporte ohne dieses Feld verhalten sich wie bisher
   *  (kein Normalisieren, faktor=1). */
  grafikenDocH?: number;
  fluss?: FlussVerlauf;
  farben?: FlussFarben;
}

/** Baut den :root{}-Style-Text aus der aufgeloesten Farbquelle. Reine
 *  Stringbildung ohne DOM-Zugriff – Werte sind entweder aus der eigenen
 *  Editor-Pipeline (Hex-Strings, riverSnapshot.ts) oder der Default-Satz
 *  oben, nie freier Nutzertext. */
function buildRootStyle(farben: FlussFarben): string {
  const decls = FARBEN_TOKEN_KEYS.map(
    (key) => `${key}:${farben[key] ?? DEFAULT_FARBEN[key]};`,
  ).join("");
  return `:root{${decls}}`;
}

/** Erzeugt ein eigenes <div> direkt unter document.body und portalt die
 *  Kinder dorthin – erst nach dem Mount (Browser-API), s. Dateikopf. */
function OverlayPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "100%";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);
    setHost(el);
    return () => {
      document.body.removeChild(el);
      setHost(null);
    };
  }, []);

  if (!host) return null;
  return createPortal(children, host);
}

export function EmbedRoot({ grafiken, grafikenDocH, fluss, farben }: EmbedConfig) {
  const aufgeloesteFarben = farben ?? fluss?.farben ?? DEFAULT_FARBEN;

  return (
    <>
      <style>{buildRootStyle(aufgeloesteFarben)}</style>
      <OverlayPortal>
        {fluss && <RiverFromSnapshot verlauf={fluss} />}
        <GrafikLayer grafiken={grafiken} authoredDocH={grafikenDocH} />
      </OverlayPortal>
    </>
  );
}
