"use client";

/*
 * ProduktTutorial – das EINMALIGE Produkt-Onboarding des vereinheitlichten
 * Editors (Welle 5d, docs/editor-vereinheitlichung.md §10/5d Punkt 1). Leons
 * Zielbild: „alles ein system" — die geladene Website in Puck bauen, statisch
 * ansehen, im Animator anklicken und animieren, dann exportieren. Das
 * Produkt-Tutorial fuehrt genau diese Reise EINMAL vor.
 *
 * ABGRENZUNG (Leons Unterscheidung, §10/5d): Tutorial != Hover-Erklaerung.
 * Dieses Tutorial gibt den GROSSEN Ablauf ueber alle Bereiche; die kleinen
 * „?"-Hilfen an den einzelnen Knoepfen/Reitern erklaeren das jeweilige Detail.
 * Darum verweist der letzte Schritt ausdruecklich auf die „?"-Hilfen.
 *
 * ERSCHEINUNGS-LOGIK: eigener Latch-Key `wee-produkt-tutorial-gesehen` (getrennt
 * vom Animator-Tutorial `wee-grafik-tutorial-gesehen`). Beim ERSTEN /editor-
 * Besuch laeuft es VOR dem Animator-Tutorial (Reihenfolge in GrafikEditor.tsx
 * verdrahtet); danach ist es — wie das Animator-Tutorial — nur noch ueber den
 * „?"-Kopf-Knopf (HilfeMenue) einzeln aufrufbar.
 *
 * Eigene Datei statt Anhaengsel an GrafikEditor.tsx (schon ~3600 Zeilen) —
 * gleiches Muster wie GrafikHilfe.tsx/GrafikInspector.tsx. Die Optik teilt sich
 * die bestehenden `.gre-tutorial-*`-Klassen (grafik-hilfe.css), nur die
 * Wizard-Navigation + das Kopf-Menue bringen wenige additive Klassen mit.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./grafik-hilfe.css";

const PRODUKT_TUTORIAL_KEY = "wee-produkt-tutorial-gesehen";

/** true, wenn das Produkt-Tutorial noch nie geschlossen wurde (eigener Latch,
 *  s. Datei-Kommentar). Gleiches Fehler-verhalten wie tutorialNochNichtGesehen
 *  in GrafikHilfe.tsx: ohne localStorage nicht bei jedem Reload aufdraengen. */
export function produktTutorialNochNichtGesehen(): boolean {
  try {
    return localStorage.getItem(PRODUKT_TUTORIAL_KEY) !== "1";
  } catch {
    return false;
  }
}

/** Merkt „Produkt-Tutorial gesehen" dauerhaft — EGAL ueber welchen Schliess-Weg
 *  (Los geht's, ✕, Esc, Klick auf den Hintergrund). */
export function produktTutorialAlsGesehenMerken(): void {
  try {
    localStorage.setItem(PRODUKT_TUTORIAL_KEY, "1");
  } catch {
    /* kein localStorage — erscheint dann beim naechsten Mal wieder, kein
       harter Fehler (identisch zu GrafikHilfe.tsx). */
  }
}

interface ProduktSchritt {
  titel: string;
  text: ReactNode;
}

/** Die fuenf Stationen der Produkt-Reise (§10/5d Punkt 1, Leons Wortlaut-Logik).
 *  Als Daten statt Inline-JSX — Text an EINER Stelle, leicht nachzuschaerfen,
 *  ohne die Wizard-Struktur anzufassen (gleiches Muster wie SCHRITTE in
 *  GrafikHilfe.tsx). */
const PRODUKT_SCHRITTE: readonly ProduktSchritt[] = [
  {
    titel: "1 · Website importieren",
    text: (
      <>
        Oben schaltest du zwischen <strong>Animator</strong> und{" "}
        <strong>Seiten</strong> um. Im Seiten-Bereich holst du mit{" "}
        <strong>„Website importieren"</strong> einen Ordner mit einer fertigen
        Website (index.html + Bilder) herein — er wird deterministisch in
        Bausteine zerlegt. Ein <strong>Bericht</strong> zeigt zuerst ehrlich, was
        uebernommen wurde und was nicht: <strong>Skripte und Rahmen bleiben
        draussen</strong>; Styles werden nur bei einer eigenen, selbst gebauten
        Seite uebernommen (Schalter im Import).
      </>
    ),
  },
  {
    titel: "2 · In Puck bauen und ansehen",
    text: (
      <>
        Jede Seite oeffnest du mit <strong>„Oeffnen"</strong> im
        Baukasten-Editor (Puck): Bausteine anklicken, Texte und Bilder aendern,
        umsortieren. Mit <strong>„Speichern"</strong> (oder Pucks „Publish") wird
        der Stand in <code>seiten/&lt;name&gt;.json</code> geschrieben.{" "}
        <strong>„Vorschau"</strong> zeigt die Seite als Vollbild — genau so, wie
        sie spaeter aussieht, ganz ohne Editor-Bedienelemente.
      </>
    ),
  },
  {
    titel: "3 · Aktive Website",
    text: (
      <>
        Eine Seite ist die <strong>★ aktive Website</strong> — deine echte
        Projektseite. Eine <strong>importierte</strong> Seite wird sofort aktiv;
        sonst setzt du sie mit <strong>„Als aktive Website setzen"</strong>. Das
        Besondere: der <strong>Animator laedt genau diese Seite automatisch als
        Buehne</strong> (statt der eingebauten Demo-Landing). So ist es{" "}
        <strong>dieselbe Seite in drei Sichten</strong> — in Puck bauen, per
        Vorschau statisch ansehen, im Animator animieren.
      </>
    ),
  },
  {
    titel: "4 · Im Animator anklicken & animieren",
    text: (
      <>
        Zurueck im <strong>Animator</strong> liegt deine aktive Seite als Buehne.
        Im Reiter <strong>„Ebenen"</strong> findest du unter{" "}
        <strong>„Website (Ist-Stand)"</strong> alle Original-Elemente; mit{" "}
        <strong>Alt+Klick</strong> greifst du eins direkt auf der Buehne. Ein Bild
        holst du per <strong>„In den Builder holen"</strong> als bewegliche
        Grafik herein. Dann setzt du mit <strong>„Hier locken"</strong>{" "}
        Keyframes (sie verankern sich am Original-Element), und haeufige
        Bewegungen speicherst du im Reiter <strong>„Animation"</strong> als{" "}
        <strong>Preset</strong> zum Wiederverwenden.
      </>
    ),
  },
  {
    titel: "5 · Exportieren",
    text: (
      <>
        Fertig? Im Reiter <strong>„Export"</strong> bringst du das Ergebnis auf
        die echte Website: als <strong>Config (JSON)</strong>, fertiges{" "}
        <strong>HTML-Overlay</strong>, das <strong>Runtime-Script</strong>,{" "}
        <strong>ein einzelnes Element</strong> oder die{" "}
        <strong>ganze Seite als HTML</strong> (im Puck-Seiten-Modus mit der
        Animation zusammen). Jeder Weg hat seine eigene <strong>„?"-Hilfe</strong>{" "}
        — dieses Tutorial zeigt den grossen Ablauf, die kleinen „?" neben den
        Knoepfen erklaeren jedes Detail.
      </>
    ),
  },
];

interface ProduktTutorialProps {
  offen: boolean;
  onSchliessen: () => void;
}

/** Gefuehrtes Produkt-Onboarding (§10/5d) — ein Schritt sichtbar, mit
 *  Zurueck/Weiter navigierbar (deshalb „gefuehrt", nicht die flache Liste des
 *  Animator-Tutorials). Rein informativ: kein Schritt loest eine Editor-Aktion
 *  aus. Schliess-Wege (✕, Esc, Hintergrund-Klick, „Los geht's") laufen alle
 *  ueber onSchliessen, das den Latch setzt (s. GrafikEditor.tsx). */
export function ProduktTutorial({ offen, onSchliessen }: ProduktTutorialProps) {
  const titelId = useId();
  const [schritt, setSchritt] = useState(0);
  const weiterRef = useRef<HTMLButtonElement>(null);

  /* Bei jedem Oeffnen wieder bei Schritt 1 beginnen — sonst haenge das Tutorial
     beim erneuten Aufruf ueber den Kopf-Knopf am letzten Schritt fest. */
  useEffect(() => {
    if (offen) setSchritt(0);
  }, [offen]);

  /* Fokus auf den Haupt-Knopf beim Oeffnen (Tastaturbedienung); beim Schliessen
     kehrt der Fokus auf das ausloesende Element zurueck (a11y — identisches
     Muster wie GrafikTutorial). */
  useEffect(() => {
    if (!offen) return;
    const vorherFokussiert = document.activeElement as HTMLElement | null;
    weiterRef.current?.focus();
    return () => vorherFokussiert?.focus?.();
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

  const aktuell = PRODUKT_SCHRITTE[schritt];
  const istErster = schritt === 0;
  const istLetzter = schritt === PRODUKT_SCHRITTE.length - 1;

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
          <strong id={titelId}>So arbeitest du hier — die Produkt-Tour</strong>
          <button
            className="gre-tutorial-x"
            onClick={onSchliessen}
            aria-label="Produkt-Tour schließen"
            title="Produkt-Tour schließen"
          >
            ✕
          </button>
        </div>

        <div className="gre-tutorial-sicher">
          🧭 Ein System, drei Sichten auf <b>dieselbe</b> Seite: in{" "}
          <b>Puck</b> bauen · als <b>Vorschau</b> ansehen · im <b>Animator</b>{" "}
          anklicken und animieren. Diese Tour zeigt den Weg einmal von vorn.
        </div>

        <div className="gre-produkt-fortschritt" aria-hidden="true">
          {PRODUKT_SCHRITTE.map((_, i) => (
            <span
              key={i}
              className={
                "gre-produkt-punkt" + (i === schritt ? " gre-produkt-punkt--aktiv" : "")
              }
            />
          ))}
        </div>

        <div className="gre-produkt-schritt">
          <div className="gre-tutorial-kuerzel-titel">{aktuell.titel}</div>
          <p className="gre-produkt-text">{aktuell.text}</p>
        </div>

        <div className="gre-produkt-nav">
          <span className="gre-produkt-zaehler" role="status" aria-live="polite">
            Schritt {schritt + 1} von {PRODUKT_SCHRITTE.length}
          </span>
          <span className="gre-produkt-nav-knoepfe">
            <button
              type="button"
              className="gre-produkt-btn"
              onClick={() => setSchritt((s) => Math.max(0, s - 1))}
              disabled={istErster}
              title="Einen Schritt zurück"
            >
              Zurück
            </button>
            {istLetzter ? (
              <button
                ref={weiterRef}
                type="button"
                className="gre-tutorial-los"
                onClick={onSchliessen}
                title="Tour beenden und loslegen"
              >
                Los geht&apos;s
              </button>
            ) : (
              <button
                ref={weiterRef}
                type="button"
                className="gre-tutorial-los"
                onClick={() => setSchritt((s) => Math.min(PRODUKT_SCHRITTE.length - 1, s + 1))}
                title="Zum nächsten Schritt"
              >
                Weiter
              </button>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

interface HilfeMenueProps {
  /** Produkt-Tour (dieses Tutorial) oeffnen. */
  onProdukt: () => void;
  /** Animator-Anleitung (GrafikTutorial) oeffnen. */
  onAnimator: () => void;
}

/** „?"-Kopf-Knopf mit kleinem Auswahl-Menue (§10/5d Punkt 1: „beide danach
 *  ueber den ?-Kopf-Knopf einzeln aufrufbar"). Ersetzt den frueheren einzelnen
 *  „? Hilfe"-Knopf, der NUR das Animator-Tutorial oeffnete. Schliesst bei
 *  Auswahl, Escape und Klick ausserhalb; der Fokus kehrt bei Escape auf den
 *  Knopf zurueck (a11y, skills/frontend-a11y). */
export function HilfeMenue({ onProdukt, onAnimator }: HilfeMenueProps) {
  const [offen, setOffen] = useState(false);
  const knopfRef = useRef<HTMLButtonElement>(null);
  const menueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!offen) return;
    const beiKlick = (e: MouseEvent) => {
      const ziel = e.target as Node;
      if (knopfRef.current?.contains(ziel) || menueRef.current?.contains(ziel)) return;
      setOffen(false);
    };
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOffen(false);
        knopfRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", beiKlick);
    document.addEventListener("keydown", beiTaste);
    return () => {
      document.removeEventListener("pointerdown", beiKlick);
      document.removeEventListener("keydown", beiTaste);
    };
  }, [offen]);

  const waehle = (fn: () => void) => {
    setOffen(false);
    fn();
  };

  return (
    <span className="gre-hilfe-menue-huelle">
      <button
        ref={knopfRef}
        className="gre-hilfe-knopf"
        onClick={() => setOffen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={offen}
        title="Anleitungen: Produkt-Tour oder Animator-Anleitung öffnen"
      >
        ? Hilfe
      </button>
      {offen && (
        <div ref={menueRef} className="gre-hilfe-menue" role="menu" aria-label="Anleitungen">
          <button
            type="button"
            role="menuitem"
            className="gre-hilfe-menue-item"
            onClick={() => waehle(onProdukt)}
            title="Die geführte Produkt-Tour über alle Bereiche erneut ansehen"
          >
            🧭 Produkt-Tour
          </button>
          <button
            type="button"
            role="menuitem"
            className="gre-hilfe-menue-item"
            onClick={() => waehle(onAnimator)}
            title="Die Animator-Anleitung (Grafiken & Fluss animieren) erneut ansehen"
          >
            🎬 Animator-Anleitung
          </button>
        </div>
      )}
    </span>
  );
}
