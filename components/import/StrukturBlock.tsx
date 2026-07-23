"use client";

/*
 * components/import/StrukturBlock.tsx — Render-Komponente des struktur-
 * erhaltenden Import-Bausteins (Phase 4b, docs/editor-vereinheitlichung.md).
 * Die Injektions-Logik selbst liegt REIN in lib/import/struktur-injektion.ts
 * (Adapter-Stil, node-testbar) — diese Datei ist der duenne React-Wrapper.
 *
 * RENDER-STRATEGIE (SSR-sicher + XSS-frei):
 *   · Als initialer (Server + erste Client-)Zustand wird das ENTSCHAERFTE
 *     Template per dangerouslySetInnerHTML gesetzt. Weil die Marker den
 *     Original-Inhalt tragen (s. struktur-injektion.ts), zeigt der Server damit
 *     bereits echten Inhalt — nie leere Platzhalter. Das Template ist beim
 *     Import DOM-serialisiert; entschaerfeHtml ist darauf idempotent, Server-
 *     Durchreichung und Client-Neuparsen liefern denselben String → keine
 *     Hydration-Diskrepanz.
 *   · Nach dem Mount injiziert ein useEffect die (ggf. editierten) Prop-Werte
 *     imperativ via innerHTML an die Marker-Positionen. Das umgeht Reacts
 *     Reconciliation bewusst (wir setzen bereits-entschaerftes HTML) und
 *     ueberschreibt den Initial-Inhalt — unveraenderte Werte sehen identisch
 *     aus, editierte werden sichtbar. React setzt den Container nur bei
 *     TEMPLATE-Wechsel zurueck (dangerouslySetInnerHTML haengt allein an
 *     `template`); der Effekt injiziert danach erneut.
 *
 * data-og-id: Der Puck-Config-Wrapper (app/puck/puck.config.tsx) haengt
 * data-og-id="puck:<id>" + data-og-typ an den WURZEL-<div> dieses Renders (die
 * Anker-Box des ganzen Blocks). Die data-og-id-Marker INNERHALB des Templates
 * (aus dem 3b-Freeze) bleiben durch die Entschaerfung/Injektion erhalten und
 * verankern feiner — genau wie gefordert.
 *
 * GRENZE (ehrlich): Editierte Werte werden erst nach dem Client-Mount sichtbar;
 * ein rein server-gerendertes statisches Export-HTML zeigt den Original-
 * Template-Inhalt. Server-seitige Injektion fuer den Export ist eine SPAETERE
 * Aufgabe (braucht ein DOM auf dem Server; hier bewusst nicht eingezogen, wie
 * auch html-zu-puck.ts DOM-frei auf dem Server bleibt).
 */

import { useEffect, useMemo, useRef } from "react";
import {
  entschaerfeHtml,
} from "@/lib/import/html-zu-puck";
import {
  injiziereStruktur,
  type StrukturBild,
  type StrukturText,
} from "@/lib/import/struktur-injektion";

/* Neben den Inhalts-Props reicht der Puck-Config-Wrapper (cloneElement in
 * app/puck/puck.config.tsx) data-og-id/data-og-typ an die WURZEL-Node — ohne
 * Durchreichen an den <div> griffe die Anker-Mechanik nicht. Deshalb ein
 * offener data-*-Index-Rest, der 1:1 auf den Container gespreizt wird. */
type StrukturBlockRenderProps = {
  template: string;
  texte: StrukturText[];
  bilder: StrukturBild[];
} & Record<`data-${string}`, string | undefined>;

export function StrukturBlock(props: StrukturBlockRenderProps) {
  const { template, texte, bilder, ...rest } = props;
  const ref = useRef<HTMLDivElement>(null);

  /* SSR-deterministischer Initial-Inhalt: nur entschaerftes Template (Marker
     tragen den Original-Inhalt). Haengt allein an `template`, damit Prop-
     Aenderungen an texte/bilder den Container nicht via React zuruecksetzen. */
  const initial = useMemo(() => entschaerfeHtml(template ?? "").html, [template]);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = injiziereStruktur(template ?? "", texte ?? [], bilder ?? []).html;
  }, [template, texte, bilder]);

  return (
    <div
      className="fc-struktur-block"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: initial }}
      {...rest}
    />
  );
}
