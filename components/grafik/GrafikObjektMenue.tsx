"use client";

/*
 * GrafikObjektMenue – schwebendes Aktionsmenü DIREKT an der ausgewählten
 * Grafik (Leons Kernkritik: Klick auf eine platzierte Grafik wählt sie zwar
 * aus, aber sichtbar passiert nichts weiter — Löschen/Tauschen/Ersetzen/
 * Duplizieren gab es nur als winzige Icon-Knöpfe im Reiter „Ebenen", die er
 * nicht gefunden hat).
 *
 * Ruft AUSSCHLIESSLICH bestehende Funktionen aus GrafikEditor.tsx auf (per
 * Props durchgereicht) — baut nichts nach. Eigene Datei statt Anhängsel an
 * GrafikEditor.tsx (das ist schon ~1900 Zeilen).
 *
 * POSITIONIERUNG: Die platzierte Grafik lebt im DOM als [data-grafik-id]
 * INNERHALB von GrafikLayer (s. dort) — ein GANZ ANDERER Teilbaum als dieses
 * Menü (das aus GrafikEditor.tsx heraus gerendert wird). Es gibt also keine
 * Layout-Beziehung zwischen beiden; die Position wird deshalb IMPERATIV
 * berechnet: pro Frame (rAF, gleiches Muster wie GrafikLayer/GrafikMedium —
 * kein React-State pro Frame) wird die Bildschirmposition der Grafik
 * gemessen und die Menü-Position direkt per style geschrieben. Das hält das
 * Menü auch waehrend eines Zugs oder beim Scrollen an der Grafik "geklebt".
 */

import { useEffect, useRef, useState } from "react";
import type { Grafik } from "./grafik-types";
import "./grafik-objekt-menue.css";

/** Abstand zwischen Grafik-Bounding-Box und Menü. */
const ABSTAND_PX = 10;
/** Rand-Puffer zum Fensterrand beim Klemmen. */
const RAND_PX = 8;

export interface GrafikObjektMenueProps {
  grafik: Grafik;
  /** true = diese Grafik ist gerade als Tausch-Quelle bewaffnet (⇄ wartet
   *  auf die zweite Ebene) — steuert nur die Beschriftung des Knopfs. */
  tauschAktiv: boolean;
  onLoeschen: () => void;
  onTauschen: () => void;
  onDateiErsetzen: () => void;
  onDuplizieren: () => void;
  onNachVorn: () => void;
  onNachHinten: () => void;
  onAusblenden: () => void;
  onSperren: () => void;
  onHierLocken: () => void;
}

export function GrafikObjektMenue({
  grafik,
  tauschAktiv,
  onLoeschen,
  onTauschen,
  onDateiErsetzen,
  onDuplizieren,
  onNachVorn,
  onNachHinten,
  onAusblenden,
  onSperren,
  onHierLocken,
}: GrafikObjektMenueProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  /* Letzte bekannte Position bleibt stehen, wenn der DOM-Anker kurzzeitig
     verschwindet — genau DANN, wenn Leon z.B. "Ausblenden" klickt: GrafikLayer
     entfernt das <img> sofort aus dem DOM (s. dortiger versteckt-Filter), das
     Menü selbst bleibt aber offen (die Grafik ist ja weiterhin ausgewählt) —
     ohne diese Faellback-Position wuerde es im selben Moment an (0,0)
     springen, in dem Leon es braucht, um wieder einzublenden. */
  const letztePosition = useRef({ top: -9999, left: -9999 });
  const [sichtbar, setSichtbar] = useState(false);

  useEffect(() => {
    setSichtbar(false);
    let raf = 0;

    const tick = () => {
      const menu = menuRef.current;
      const anker = document.querySelector<HTMLElement>(`[data-grafik-id="${grafik.id}"]`);
      if (menu) {
        if (anker) {
          const ankerRect = anker.getBoundingClientRect();
          const menuBreite = menu.offsetWidth;
          const menuHoehe = menu.offsetHeight;
          const vw = window.innerWidth;
          const vh = window.innerHeight;

          /* Standard: oberhalb der Grafik, linksbündig. */
          let top = ankerRect.top - ABSTAND_PX - menuHoehe;
          let left = ankerRect.left;

          /* Vertikal am Rand umklappen: kein Platz oben -> unterhalb zeigen. */
          if (top < RAND_PX) top = ankerRect.bottom + ABSTAND_PX;
          /* Auch unterhalb kein Platz (hohe Grafik/kleines Fenster): an den
             sichtbaren Bereich klemmen statt abzuschneiden. */
          if (top + menuHoehe > vh - RAND_PX) top = Math.max(RAND_PX, vh - RAND_PX - menuHoehe);

          /* Horizontal am Rand umklappen: rechts kein Platz -> rechtsbündig
             zur Grafik statt über den Fensterrand hinauszuragen. */
          if (left + menuBreite > vw - RAND_PX) left = ankerRect.right - menuBreite;
          if (left < RAND_PX) left = RAND_PX;

          letztePosition.current = { top, left };
          menu.style.top = `${top}px`;
          menu.style.left = `${left}px`;
          setSichtbar(true);
        } else {
          /* Anker (kurzzeitig) weg, s. Kommentar oben — letzte Position halten. */
          menu.style.top = `${letztePosition.current.top}px`;
          menu.style.left = `${letztePosition.current.left}px`;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [grafik.id]);

  return (
    <div
      ref={menuRef}
      className={`gre-objektmenue${sichtbar ? " gre-objektmenue--sichtbar" : ""}`}
    >
      <div className="gre-objektmenue-titel" title={grafik.name}>
        {grafik.name}
      </div>
      <button onClick={onHierLocken}>◉ Hier locken</button>
      <button onClick={onDuplizieren}>⧉ Duplizieren</button>
      <button onClick={onTauschen}>{tauschAktiv ? "⇄ Tausch abbrechen" : "⇄ Tauschen"}</button>
      <button onClick={onDateiErsetzen}>📄 Datei ersetzen</button>
      <button onClick={onNachVorn}>▲ Nach vorn</button>
      <button onClick={onNachHinten}>▼ Nach hinten</button>
      <button onClick={onAusblenden}>{grafik.versteckt ? "👁 Einblenden" : "🚫 Ausblenden"}</button>
      <button onClick={onSperren}>{grafik.gesperrt ? "🔓 Entsperren" : "🔒 Sperren"}</button>
      <button className="gre-objektmenue-loeschen" onClick={onLoeschen}>
        ✕ Löschen
      </button>
    </div>
  );
}
