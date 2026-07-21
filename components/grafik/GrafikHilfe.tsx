"use client";

/*
 * GrafikHilfe – Fragezeichen-Hilfen + Einstiegs-Tutorial für den
 * Grafik-Editor (Leons Kritik: „Das UI ist komplett benutzerunfreundlich.
 * Ich will Tutorialfenster mit vernünftiger Erklärung, Fragezeichen,
 * Knöpfe.").
 *
 * Eigene Datei statt Anhängsel an GrafikEditor.tsx (das ist schon ~1930
 * Zeilen) — GrafikEditor.tsx hängt nur <HilfeIcon> und <GrafikTutorial> ein,
 * der komplette Text UND die Logik dahinter leben hier.
 *
 * ZWEI BAUSTEINE:
 *   HilfeIcon      – kleines „?"-Icon, das per Klick ODER Hover eine kurze
 *                    Erklärung zeigt. Position wird wie beim schwebenden
 *                    Objektmenü (s. GrafikObjektMenue.tsx) per
 *                    getBoundingClientRect + position:fixed berechnet —
 *                    NICHT per CSS position:absolute, weil .gre-panel
 *                    scrollt (overflow:auto) und ein absolut positioniertes
 *                    Popover dort abgeschnitten würde, sobald es über den
 *                    Panel-Rand hinausragt.
 *   GrafikTutorial – Einstiegs-Fenster: erscheint automatisch beim ERSTEN
 *                    Öffnen (Merker in localStorage), danach nur noch über
 *                    den „? Hilfe"-Knopf im Panel-Kopf.
 */

import { useEffect, useId, useRef, useState } from "react";
import "./grafik-hilfe.css";

const TUTORIAL_KEY = "wee-grafik-tutorial-gesehen";
/** Rand-Puffer zum Fensterrand beim Klemmen (gleicher Wert wie
 *  GrafikObjektMenue.tsx, damit sich beide Overlays gleich verhalten). */
const RAND_PX = 8;
/** Feste Popover-Breite für die horizontale Klemm-Rechnung — muss zur
 *  max-width in grafik-hilfe.css passen. */
const POPOVER_BREITE = 230;

/** true, wenn das Tutorial noch nie geschlossen wurde. Eigene Funktion statt
 *  Inline-Check in GrafikEditor.tsx, damit dort nur noch der Aufruf steht. */
export function tutorialNochNichtGesehen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) !== "1";
  } catch {
    /* kein localStorage (z.B. strikter privater Modus) — dann nicht bei
       jedem Reload erneut aufdrängen. */
    return false;
  }
}

/** Merkt „Tutorial gesehen" dauerhaft — wird beim Schließen aufgerufen, EGAL
 *  ob per Knopf, Esc oder Klick auf den Hintergrund. */
export function tutorialAlsGesehenMerken(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, "1");
  } catch {
    /* kein localStorage — das Tutorial erscheint dann beim nächsten Mal
       halt wieder, kein harter Fehler. */
  }
}

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

  /* Scrollen (auch INNERHALB von .gre-panel) oder Fenstergröße ändern
     schließt das Popover, statt es live nachzuführen — einfacher und für
     eine kurze Erklärung völlig ausreichend. true = Capture-Phase, damit
     auch ein Scroll innerhalb von .gre-panel ankommt (Scroll-Events
     bubblen nicht). */
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

interface GrafikTutorialProps {
  offen: boolean;
  onSchliessen: () => void;
}

/** Die sechs Schritte des ECHTEN Arbeitsablaufs — bewusst als Daten statt
 *  Inline-JSX, damit der Text an einer Stelle steht und sich leicht
 *  nachschärfen lässt, ohne die Markup-Struktur anzufassen. */
const SCHRITTE: readonly string[] = [
  "In der Bibliothek ein Bild anklicken — es wird automatisch mittig auf die Seite gesetzt.",
  "An die Stelle scrollen, an der die Grafik erscheinen soll.",
  `Grafik anfassen: Ziehen verschiebt sie. Ein Klick OHNE zu ziehen „loggt sie ein" (gelb) — dann skaliert das Scrollrad, statt die Seite zu scrollen.`,
  `Passt die Stelle? Im Reiter „Keyframes" auf „Hier locken" klicken — das merkt sich Position und Größe für genau diese Scroll-Höhe.`,
  `Weiterscrollen zur nächsten Stelle, Grafik wieder anpassen, wieder „Hier locken" — mit mehreren solcher Punkte wandert die Grafik beim Scrollen dazwischen.`,
  `Fertig? Im Reiter „Setups" einen Namen vergeben und „Speichern". „Als Standard setzen" zeigt den Stand danach auch auf der echten Website.`,
];

interface Kuerzel {
  tasten: string;
  wirkung: string;
}

const KUERZEL: readonly Kuerzel[] = [
  { tasten: "Strg+Z", wirkung: "Rückgängig" },
  { tasten: "Strg+Umschalt+Z", wirkung: "Wiederholen" },
  { tasten: "Entf", wirkung: "ausgewählte Grafik löschen" },
  { tasten: "Esc", wirkung: "Auswahl aufheben / Einloggen beenden" },
  { tasten: "Strg+V", wirkung: "Bild aus der Zwischenablage einfügen (z.B. aus Canva kopiert)" },
];

/** Einstiegs-Tutorial: erscheint automatisch beim ersten Öffnen (s.
 *  tutorialNochNichtGesehen), danach nur noch über den Kopf-Knopf. Rein
 *  informativ — kein Schritt hier löst irgendeine Editor-Aktion aus, damit
 *  ein versehentliches Durchklicken nichts an Leons Arbeit ändert. */
export function GrafikTutorial({ offen, onSchliessen }: GrafikTutorialProps) {
  const titelId = useId();
  const schliessenRef = useRef<HTMLButtonElement>(null);

  /* Fokus auf den Haupt-Knopf beim Öffnen — Grundvoraussetzung für
     Tastaturbedienung eines Dialogs (kompletter Fokus-Trap wäre für dieses
     interne Tool über das Ziel hinaus). */
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
          <strong id={titelId}>Willkommen im Grafik-Builder</strong>
          <button className="gre-tutorial-x" onClick={onSchliessen} aria-label="Tutorial schließen">
            ✕
          </button>
        </div>

        <div className="gre-tutorial-sicher">
          🔒 Die Website ist sicher: Der Builder legt sich nur sichtbar über die Seite und
          speichert am Ende ein <b>Abbild</b> (welche Grafik wo steht). Er verändert die Seite
          selbst NIE. Alles hier lässt sich mit „Rückgängig" (Strg+Z) zurücknehmen — du kannst
          nichts kaputt machen.
        </div>

        <ol className="gre-tutorial-schritte">
          {SCHRITTE.map((schritt, i) => (
            <li key={i}>{schritt}</li>
          ))}
        </ol>

        <div className="gre-tutorial-kuerzel">
          <div className="gre-tutorial-kuerzel-titel">Tastenkürzel</div>
          <table>
            <tbody>
              {KUERZEL.map((k) => (
                <tr key={k.tasten}>
                  <td>
                    <kbd>{k.tasten}</kbd>
                  </td>
                  <td>{k.wirkung}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button ref={schliessenRef} className="gre-tutorial-los" onClick={onSchliessen}>
          Los geht&apos;s
        </button>
      </div>
    </div>
  );
}
