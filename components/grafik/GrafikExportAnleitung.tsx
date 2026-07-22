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

/** Die zwei zusätzlichen HTML-Wege (Welle 3c) – als eigene Sektion unter den
 *  drei Standard-Schritten, damit klar ist: das sind ALTERNATIVEN, die OHNE die
 *  getrennte Runtime/Config-Kette auskommen. */
const HTML_WEGE: readonly { titel: string; text: string }[] = [
  {
    titel: "Ganze Seite (wee-seite.html)",
    text: `Ein komplettes HTML-Dokument, das Overlay, Config UND Runtime in einer Datei bündelt. Datei im Browser öffnen = die Animation läuft sofort auf einer leeren Seite. Eigenen Inhalt legst du danach einfach in den <body> dieser Datei – die Animations-Ebene liegt klick-durchlässig darüber. Kein separater wee-embed.js-Upload nötig.`,
  },
  {
    titel: "Einzelnes Element (wee-element-<name>.html)",
    text: `Nur EINE platzierte Grafik samt ihrer Scroll-Bewegung, als selbsttragendes <div>. Die Bewegung steckt in einer CSS-Scroll-Animation (mit JS-Fallback für ältere Browser) – ganz ohne Runtime und ohne Config-Datei. Öffne die Datei, kopiere den Block heraus und setze ihn irgendwo in den <body> deiner bestehenden Seite. Ideal für ein einzelnes bewegtes Element.`,
  },
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
          {`Lieber alles in EINER Datei? Nutze die zwei HTML-Wege unten – dann brauchst du die Runtime/Config nicht getrennt.`}
        </div>

        <ul className="gre-tutorial-schritte">
          {HTML_WEGE.map((weg) => (
            <li key={weg.titel}>
              <strong>{weg.titel}</strong>
              {` – ${weg.text}`}
            </li>
          ))}
        </ul>

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
