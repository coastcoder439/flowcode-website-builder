"use client";

/*
 * GrafikExportAnleitung – Anleitungs-Modal des Export-Reiters (Phase 3):
 * "So baust du es auf deiner Seite ein". Gleiches Muster wie GrafikTutorial
 * (GrafikHilfe.tsx: fokussierter Schließen-Knopf, Esc schließt, Klick auf
 * den Hintergrund schließt) – eigene Datei, weil dieses Modal NUR den
 * Export-Reiter betrifft, nicht den kompletten Editor-Einstieg. Nutzt
 * dieselben CSS-Klassen (gre-tutorial-*, s. grafik-hilfe.css) für eine
 * einheitliche Optik ohne neue Styles.
 */

import { useEffect, useId, useRef } from "react";

interface GrafikExportAnleitungProps {
  offen: boolean;
  onSchliessen: () => void;
}

/** Die drei Schritte aus dem Auftrag – als Daten statt Inline-JSX, damit der
 *  Text an einer Stelle steht (gleicher Grund wie SCHRITTE in
 *  GrafikHilfe.tsx). */
const SCHRITTE: readonly string[] = [
  `"wee-embed.js" auf deiner Seite hosten (Knopf "Runtime-Script herunterladen" oben) – einmalig, das Script bringt die Animation zum Leben.`,
  `"wee-anim.json" danebenlegen ODER gleich das HTML-Overlay nehmen – das bringt die Config schon eingebaut mit, kein zweiter Datei-Upload nötig.`,
  `Das Overlay-Snippet direkt vor "</body>" deiner Seite einfügen. Fertig – die Animation legt sich automatisch über die Seite.`,
];

export function GrafikExportAnleitung({ offen, onSchliessen }: GrafikExportAnleitungProps) {
  const titelId = useId();
  const schliessenRef = useRef<HTMLButtonElement>(null);

  /* Fokus auf den Haupt-Knopf beim Öffnen – gleiche Grundvoraussetzung für
     Tastaturbedienung wie GrafikTutorial. */
  useEffect(() => {
    if (offen) schliessenRef.current?.focus();
  }, [offen]);

  useEffect(() => {
    if (!offen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSchliessen();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [offen, onSchliessen]);

  if (!offen) return null;

  return (
    <div className="gre-tutorial-hintergrund" onClick={onSchliessen}>
      <div
        className="gre-tutorial-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gre-tutorial-kopf">
          <strong id={titelId}>{`So baust du es auf deiner Seite ein`}</strong>
          <button className="gre-tutorial-x" onClick={onSchliessen} aria-label="Anleitung schließen">
            ✕
          </button>
        </div>

        <ol className="gre-tutorial-schritte">
          {SCHRITTE.map((schritt, i) => (
            <li key={i}>{schritt}</li>
          ))}
        </ol>

        <div className="gre-tutorial-sicher">
          {`Ein lauffähiges Beispiel liegt unter "embed-demo.html" im selben Projekt – dort siehst du das fertige Ergebnis auf einer ganz normalen HTML-Seite, ganz ohne React/Next.`}
        </div>

        <button ref={schliessenRef} className="gre-tutorial-los" onClick={onSchliessen}>
          {`Verstanden`}
        </button>
      </div>
    </div>
  );
}
