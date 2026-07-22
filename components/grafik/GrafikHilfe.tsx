"use client";

/*
 * GrafikHilfe – Einstiegs-Tutorial für den Editor (Leons Kritik: „Das UI ist
 * komplett benutzerunfreundlich. Ich will Tutorialfenster mit vernünftiger
 * Erklärung, Fragezeichen, Knöpfe." + AP-E: „vollständiges Tutorial für den
 * Flusseditor").
 *
 * Eigene Datei statt Anhängsel an GrafikEditor.tsx (das ist schon ~3000
 * Zeilen) — GrafikEditor.tsx hängt nur <HilfeIcon> und <GrafikTutorial> ein,
 * der komplette Text UND die Logik dahinter leben hier.
 *
 * HilfeIcon ist seit Welle 2d (AP-E) nach components/shared/HilfeIcon.tsx
 * umgezogen, weil die Fluss-Sektionen dieselben „?"-Hilfen brauchen und sonst
 * aus dem grafik-Feature importieren müssten. HilfeIcon wird hier 1:1
 * re-exportiert, damit bestehende Importe aus dieser Datei unverändert bleiben.
 *
 *   GrafikTutorial – Einstiegs-Fenster: erscheint automatisch beim ERSTEN
 *                    Öffnen (Merker in localStorage), danach nur noch über
 *                    den „? Hilfe"-Knopf im Panel-Kopf. Zeigt zuerst die sechs
 *                    Grafik-Schritte, danach die Fluss-Schritte (AP-E).
 */

import { useEffect, useId, useRef } from "react";
import "./grafik-hilfe.css";

// HilfeIcon lebt jetzt in einem neutralen Ordner (s. Datei-Kommentar), wird
// hier aber re-exportiert — so brechen `import { HilfeIcon } from
// "./GrafikHilfe"` in GrafikEditor.tsx & Co. nicht.
export { HilfeIcon } from "@/components/shared/HilfeIcon";

const TUTORIAL_KEY = "wee-grafik-tutorial-gesehen";

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

/** Die Fluss-Schritte (AP-E) — kommen im Tutorial NACH den sechs Grafik-
 *  Schritten, gleiche Daten-statt-JSX-Form. Der Fluss ist ein eigenes Objekt
 *  im selben Editor; darum steht er im Tutorial als eigener Block, nicht als
 *  Fortsetzung des Grafik-Ablaufs. Inhalte an das reale Verhalten angelehnt:
 *  einen eingeloggten Knoten löscht man per „− Knoten"-Knopf ODER per Entf/
 *  Backspace (s. FlussObjektContext.tsx — bei Fluss-Fokus + eingeloggtem
 *  Knoten). */
const FLUSS_SCHRITTE: readonly string[] = [
  `Fluss in den Blick nehmen: im Reiter „Ebenen" ganz oben den Eintrag „🌊 Fluss" anklicken — er bekommt den Bearbeitungs-Fokus, die Knoten-Punkte auf der Seite werden anfassbar.`,
  `Knoten formen: einen Punkt ziehen verschiebt ihn. Ein Klick OHNE zu ziehen „loggt ihn ein" (gelb) — dann ändert das Scrollrad seine Breite/Perspektive statt zu scrollen, Esc loggt wieder aus. „+ Knoten" fügt einen hinzu; den eingeloggten löschst du per „− Knoten" oder mit der Entf-Taste (mindestens 2 bleiben).`,
  `Aussehen einstellen: im Reiter „Bild" (bei Fluss-Fokus) die Sektionen Wasser, Front und Nebel aufklappen und die Regler ziehen. Fertige Fluss-Stände speicherst und lädst du im Reiter „Speichern" unter „Fluss-Profile".`,
  `Rückgängig gilt getrennt je Objekt: liegt der Fokus auf dem Fluss, nimmt Strg+Z Knoten-/Regler-Züge zurück, sonst Grafik-Züge. Häufige Bewegungen kannst du im Reiter „Animation" als Preset speichern und auf andere Grafiken anwenden.`,
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
  // Fluss-Kürzel (AP-E) — hinten angehängt, Bestandszeilen unverändert.
  {
    tasten: "Mausrad (eingeloggt)",
    wirkung: "Grafik = Größe · Fluss-Knoten = Breite/Perspektive",
  },
  { tasten: "Entf (Fluss)", wirkung: "eingeloggten Fluss-Knoten löschen (mind. 2 bleiben)" },
  { tasten: "Esc (Fluss)", wirkung: "eingeloggten Knoten ausloggen" },
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
     interne Tool über das Ziel hinaus). Beim Schließen kehrt der Fokus auf das
     auslösende Element zurück (i.d.R. der „? Hilfe"-Knopf im Kopf) — sonst
     landet er auf <body> und Tastatur-Nutzer verlieren ihre Position (a11y).
     Der Merker sitzt im Cleanup DIESES Effekts, damit alle Schließ-Wege (Esc,
     ✕, „Los geht's", Klick auf den Hintergrund) gleichermaßen abgedeckt sind —
     sie alle setzen `offen` auf false. */
  useEffect(() => {
    if (!offen) return;
    const vorherFokussiert = document.activeElement as HTMLElement | null;
    schliessenRef.current?.focus();
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
          <strong id={titelId}>Willkommen im Editor</strong>
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

        <div className="gre-tutorial-kuerzel-titel">Grafiken animieren</div>
        <ol className="gre-tutorial-schritte">
          {SCHRITTE.map((schritt, i) => (
            <li key={i}>{schritt}</li>
          ))}
        </ol>

        {/* Fluss-Block (AP-E) — eigener Abschnitt NACH den Grafik-Schritten:
            der Fluss ist ein zweiter Objekttyp im selben Editor, kein weiterer
            Grafik-Schritt. Eigene <ol>, damit die Nummerierung wieder bei 1
            beginnt statt bei 7. Gleiche Klassen = gleiche Optik, kein neues CSS. */}
        <div className="gre-tutorial-kuerzel-titel">Den Fluss animieren</div>
        <ol className="gre-tutorial-schritte">
          {FLUSS_SCHRITTE.map((schritt, i) => (
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
