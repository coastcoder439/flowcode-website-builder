"use client";

/*
 * BackdropHilfeIcon – kleines "?"-Icon mit Erklärung, gleiches Verhalten wie
 * HilfeIcon aus components/grafik/GrafikHilfe.tsx (dort abgeschaut, s.
 * Auftrag), aber eigenstaendig nachgebaut statt importiert: GrafikHilfe.tsx
 * stylt sein Icon ausschliesslich ueber ".gre-panel button.gre-hilfe-icon" —
 * im Fluss-Editor-Panel (.rke-panel) wuerde diese Regel nicht greifen. Die
 * eigene backdrop.css-Klasse (.hg-hilfe-icon) ist an KEIN Panel gebunden.
 *
 * Position wird wie dort per getBoundingClientRect + position:fixed
 * berechnet (nicht CSS position:absolute) — beide Panels scrollen intern
 * (overflow:auto), ein absolut positioniertes Popover würde am Panel-Rand
 * abgeschnitten.
 */

import { useEffect, useId, useRef, useState } from "react";

/** Rand-Puffer zum Fensterrand beim Klemmen. */
const RAND_PX = 8;
/** Feste Popover-Breite fuer die horizontale Klemm-Rechnung — muss zur
 *  max-width in backdrop.css passen. */
const POPOVER_BREITE = 230;

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

interface BackdropHilfeIconProps {
  /** Kurzer Name, nur fuer aria-label (Screenreader). */
  label: string;
  /** Die eigentliche Erklaerung: WAS es bewirkt. */
  text: string;
}

export function BackdropHilfeIcon({ label, text }: BackdropHilfeIconProps) {
  const popoverId = useId();
  const [schwebtDrueber, setSchwebtDrueber] = useState(false);
  const [angepinnt, setAngepinnt] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const offen = schwebtDrueber || angepinnt;

  useEffect(() => {
    if (!offen || !btnRef.current) return;
    setPos(klemmePosition(btnRef.current.getBoundingClientRect()));
  }, [offen]);

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
        className="hg-hilfe-icon"
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
          className="hg-hilfe-popover"
          role="tooltip"
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </div>
      )}
    </>
  );
}
