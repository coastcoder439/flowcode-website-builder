"use client";

/*
 * GrafikCrop – kleines Zuschneide-Overlay für den Bild-Inspector
 * (GrafikInspector.tsx, Abschnitt „Zuschneiden"). Eigenständig: zeigt die
 * Bildquelle der ausgewählten Grafik in einem Vollbild-Overlay (gleiches
 * Prinzip wie der Vektorisieren-Ladeschirm in GrafikEditor.tsx, s.
 * .gre-vektor-overlay) und lässt per Ziehen EIN Rechteck aufspannen.
 * „Anwenden" rendert genau diesen Ausschnitt per <canvas> in ein neues PNG
 * (Data-URL) — das ORIGINAL bleibt unangetastet (liegt weiter in der
 * Bibliothek), nur das Ergebnis wird nach außen gereicht. GrafikEditor.tsx
 * ersetzt damit ausschließlich die src der PLATZIERTEN Grafik (s.
 * onZuschneidenAnwenden dort), exakt wie beim bestehenden "Datei ersetzen".
 *
 * Bewusst simpel gehalten (kein Verschieben/Resizen einer bestehenden
 * Auswahl über Griffe): jeder neue Zug ERSETZT die Auswahl komplett. Das
 * deckt den Hauptfall „ein Rechteck über das Bild ziehen" ab.
 *
 * KOORDINATEN: das <img> wird OHNE object-fit gerendert (nur per max-width/
 * max-height verkleinert) — seine eigene getBoundingClientRect() ist dadurch
 * immer exakt die sichtbare Bildfläche, ohne Letterboxing-Versatz wie bei
 * object-fit:contain. Die Umrechnung in NATÜRLICHE Bildpixel (fürs Canvas)
 * braucht dadurch nur einen einzigen Skalierungsfaktor (natural ÷ angezeigt)
 * pro Achse.
 */

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./grafik-crop.css";

/** Minimale Auswahlgröße (angezeigte px) — darunter zählt der Zug als
 *  Versehen/Klick, keine Auswahl. */
const MIN_AUSWAHL_PX = 12;
/** Grenzen für die angepasste Grundbreite nach dem Zuschneiden — dieselben
 *  Werte wie der Grundbreite-Regler in GrafikInspector.tsx. */
const MIN_BREITE_PX = 20;
const MAX_BREITE_PX = 1200;

interface Rechteck {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GrafikCropProps {
  /** Bildquelle der aktuell ausgewählten Grafik (grafik.src). */
  src: string;
  /** Aktuelle Grundbreite (px) — Basis für die proportionale Anpassung nach
   *  dem Zuschneiden (s. Kommentar bei der Breiten-Rechnung unten). */
  breitePx: number;
  onAnwenden: (dataUrl: string, breiteNeuPx: number) => void;
  onAbbrechen: () => void;
}

export function GrafikCrop({ src, breitePx, onAnwenden, onAbbrechen }: GrafikCropProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [rechteck, setRechteck] = useState<Rechteck | null>(null);
  const [ziehStart, setZiehStart] = useState<{ x: number; y: number } | null>(null);
  const [fehler, setFehler] = useState("");

  /* Esc schließt UND: solange das Overlay offen ist, sollen die globalen
     Tastenkürzel des Editors (Entf löscht die Grafik, Strg+Z/Y ändert
     grafiken UNTER dem Overlay) nicht feuern — "Zurücksetzen" deckt das
     Verwerfen der Auswahl hier bereits ab. Capture-Phase, damit das VOR dem
     window-Listener der globalen Kürzel in GrafikEditor.tsx greift
     (Capture läuft komplett vor jeder Bubble-Phase, s. DOM-Event-Spec). */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onAbbrechen();
        return;
      }
      const strg = e.ctrlKey || e.metaKey;
      if (
        e.key === "Delete" ||
        e.key === "Backspace" ||
        (strg && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y"))
      ) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [onAbbrechen]);

  const punktImWrapper = (e: { clientX: number; clientY: number }) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.min(Math.max(e.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(e.clientY - rect.top, 0), rect.height),
    };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = punktImWrapper(e);
    setZiehStart(p);
    setRechteck({ x: p.x, y: p.y, w: 0, h: 0 });
    setFehler("");
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!ziehStart) return;
    const p = punktImWrapper(e);
    setRechteck({
      x: Math.min(ziehStart.x, p.x),
      y: Math.min(ziehStart.y, p.y),
      w: Math.abs(p.x - ziehStart.x),
      h: Math.abs(p.y - ziehStart.y),
    });
  };

  const onPointerUp = () => {
    setZiehStart(null);
    setRechteck((r) => (r && r.w >= MIN_AUSWAHL_PX && r.h >= MIN_AUSWAHL_PX ? r : null));
  };

  const anwenden = () => {
    const img = imgRef.current;
    if (!img || !rechteck) return;
    const angezeigtBreite = img.clientWidth;
    const angezeigtHoehe = img.clientHeight;
    if (!angezeigtBreite || !angezeigtHoehe || !img.naturalWidth || !img.naturalHeight) {
      setFehler("Bildmaße nicht verfügbar — Zuschneiden nicht möglich.");
      return;
    }
    const skalX = img.naturalWidth / angezeigtBreite;
    const skalY = img.naturalHeight / angezeigtHoehe;
    const quelle = {
      x: Math.round(rechteck.x * skalX),
      y: Math.round(rechteck.y * skalY),
      w: Math.max(1, Math.round(rechteck.w * skalX)),
      h: Math.max(1, Math.round(rechteck.h * skalY)),
    };
    try {
      const canvas = document.createElement("canvas");
      canvas.width = quelle.w;
      canvas.height = quelle.h;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) {
        setFehler("Canvas wird von diesem Browser nicht unterstützt.");
        return;
      }
      ctx2d.drawImage(img, quelle.x, quelle.y, quelle.w, quelle.h, 0, 0, quelle.w, quelle.h);
      const dataUrl = canvas.toDataURL("image/png");
      /* Neue Grundbreite proportional zum Breiten-Anteil des Ausschnitts am
         Originalbild — der Ausschnitt behält damit seine bisherige optische
         Größe auf der Seite, statt auf die alte Breite hochgezogen zu
         werden. */
      const breiteNeuPx = Math.min(
        MAX_BREITE_PX,
        Math.max(MIN_BREITE_PX, Math.round(breitePx * (quelle.w / img.naturalWidth))),
      );
      onAnwenden(dataUrl, breiteNeuPx);
    } catch {
      /* z.B. SecurityError bei einer (hier praktisch nie vorkommenden)
         fremden Bildquelle — canvas.toDataURL wirft dann statt leise ein
         leeres Bild zu liefern. */
      setFehler("Zuschneiden fehlgeschlagen (Bildquelle nicht lesbar).");
    }
  };

  return (
    <div className="gre-crop-overlay" onClick={onAbbrechen}>
      <div
        className="gre-crop-box"
        role="dialog"
        aria-modal="true"
        aria-label="Zuschneiden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gre-crop-kopf">
          <span>✂ Zuschneiden — Rechteck über dem Bild aufziehen</span>
          <button type="button" className="gre-crop-x" onClick={onAbbrechen} aria-label="Abbrechen">
            ✕
          </button>
        </div>
        <div
          ref={wrapRef}
          className="gre-crop-wrapper"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            className="gre-crop-bild"
            onError={() => setFehler("Bild konnte nicht geladen werden.")}
          />
          {rechteck && (
            <div
              className="gre-crop-rahmen"
              style={{ left: rechteck.x, top: rechteck.y, width: rechteck.w, height: rechteck.h }}
            />
          )}
        </div>
        <div className="gre-crop-fuss">
          <span className="gre-crop-status">
            {fehler
              ? fehler
              : rechteck
                ? `${Math.round(rechteck.w)} × ${Math.round(rechteck.h)} px ausgewählt`
                : "Noch keine Auswahl"}
          </span>
          <div className="gre-crop-aktionen">
            <button type="button" className="gre-crop-btn" onClick={() => setRechteck(null)} disabled={!rechteck}>
              Zurücksetzen
            </button>
            <button type="button" className="gre-crop-btn" onClick={onAbbrechen}>
              Abbrechen
            </button>
            <button
              type="button"
              className="gre-crop-btn gre-crop-btn--anwenden"
              onClick={anwenden}
              disabled={!rechteck}
            >
              ✓ Anwenden
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
