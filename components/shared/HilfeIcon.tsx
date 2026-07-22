"use client";

/*
 * HilfeIcon – kleines „?"-Icon, das per Klick ODER Hover eine kurze Erklärung
 * zeigt. Bis Welle 2d lag dieser Baustein in components/grafik/GrafikHilfe.tsx;
 * seit die Fluss-Sektionen (components/river/*) dieselben „?"-Hilfen brauchen
 * (AP-E), lebt er hier in einem neutralen Ordner — sonst müssten river-
 * Komponenten aus dem grafik-Feature importieren (unschöne Feature-Kopplung).
 * GrafikHilfe.tsx re-exportiert HilfeIcon weiterhin, damit bestehende Importe
 * (`import { HilfeIcon } from "./GrafikHilfe"`) unverändert funktionieren.
 *
 * Position wird wie beim schwebenden Objektmenü (s. GrafikObjektMenue.tsx) per
 * getBoundingClientRect + position:fixed berechnet — NICHT per CSS
 * position:absolute, weil die Panels scrollen (overflow:auto) und ein absolut
 * positioniertes Popover dort abgeschnitten würde, sobald es über den
 * Panel-Rand hinausragt. Die Optik (.gre-hilfe-icon/.gre-hilfe-popover) kommt
 * aus grafik-hilfe.css, das hier bewusst mitgeladen wird, damit der Baustein
 * überall selbsttragend aussieht.
 */

import { useEffect, useId, useRef, useState } from "react";
import "../grafik/grafik-hilfe.css";

/** Rand-Puffer zum Fensterrand beim Klemmen (gleicher Wert wie
 *  GrafikObjektMenue.tsx, damit sich beide Overlays gleich verhalten). */
const RAND_PX = 8;
/** Feste Popover-Breite für die horizontale Klemm-Rechnung — muss zur
 *  max-width in grafik-hilfe.css passen. */
const POPOVER_BREITE = 230;

/** Popover-Position aus der Icon-Position berechnet und an den Viewport-Rand
 *  geklemmt — eigene Funktion statt Inline-Rechnung im Effekt, damit
 *  HilfeIcon selbst kurz bleibt. */
function klemmePosition(rect: DOMRect): { top: number; left: number } {
  let left = rect.left;
  if (left + POPOVER_BREITE > window.innerWidth - RAND_PX) {
    left = window.innerWidth - RAND_PX - POPOVER_BREITE;
  }
  if (left < RAND_PX) left = RAND_PX;
  let top = rect.bottom + 6;
  if (top > window.innerHeight - RAND_PX) top = rect.top - RAND_PX;
  return { top, left };
}

interface HilfeIconProps {
  /** Kurzer Name der Einstellung/des Reiters, nur für aria-label (Screenreader). */
  label: string;
  /** Die eigentliche Erklärung: WAS es bewirkt, nicht wie es heißt. */
  text: string;
}

/** Kleines „?"-Icon mit Erklärung on demand. Öffnet bei Hover/Fokus UND
 *  bleibt nach einem Klick offen („angepinnt"), bis erneut geklickt, Esc
 *  gedrückt oder daneben geklickt wird — funktioniert damit mit Maus,
 *  Tastatur UND Touch. */
export function HilfeIcon({ label, text }: HilfeIconProps) {
  const popoverId = useId();
  const [schwebtDrueber, setSchwebtDrueber] = useState(false);
  const [angepinnt, setAngepinnt] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const offen = schwebtDrueber || angepinnt;

  /* Position nur beim ÖFFNEN messen (kein rAF-Loop wie beim Objektmenü nötig
     — das Popover ist kurzlebig, ein Scroll schließt es ohnehin, s.u.). */
  useEffect(() => {
    if (!offen || !btnRef.current) return;
    setPos(klemmePosition(btnRef.current.getBoundingClientRect()));
  }, [offen]);

  /* Scrollen (auch INNERHALB des Panels) oder Fenstergröße ändern schließt das
     Popover, statt es live nachzuführen — einfacher und für eine kurze
     Erklärung völlig ausreichend. true = Capture-Phase, damit auch ein Scroll
     innerhalb des Panels ankommt (Scroll-Events bubblen nicht). */
  useEffect(() => {
    if (!offen) return;
    const schliessen = () => {
      setAngepinnt(false);
      setSchwebtDrueber(false);
    };
    window.addEventListener("scroll", schliessen, true);
    window.addEventListener("resize", schliessen);
    return () => {
      window.removeEventListener("scroll", schliessen, true);
      window.removeEventListener("resize", schliessen);
    };
  }, [offen]);

  /* Angepinnt (nach Klick): Klick daneben oder Esc hebt die Pinnung auf. */
  useEffect(() => {
    if (!angepinnt) return;
    const onDoc = (e: PointerEvent) => {
      if (e.target instanceof Node && btnRef.current?.contains(e.target)) return;
      setAngepinnt(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAngepinnt(false);
    };
    document.addEventListener("pointerdown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [angepinnt]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="gre-hilfe-icon"
        aria-label={`Hilfe: ${label}`}
        aria-expanded={offen}
        aria-describedby={offen ? popoverId : undefined}
        onMouseEnter={() => setSchwebtDrueber(true)}
        onMouseLeave={() => setSchwebtDrueber(false)}
        onFocus={() => setSchwebtDrueber(true)}
        onBlur={() => setSchwebtDrueber(false)}
        onClick={(e) => {
          e.stopPropagation();
          setAngepinnt((a) => !a);
        }}
      >
        ?
      </button>
      {offen && pos && (
        <div
          id={popoverId}
          className="gre-hilfe-popover"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </div>
      )}
    </>
  );
}
