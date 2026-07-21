"use client";

/*
 * GrafikInspector – EIN zusammenhängendes Bearbeitungs-Fenster für die
 * ausgewählte Grafik (Leons Kritik, wörtlich: „Wir brauchen die
 * Vektoreinstellung mit den ganzen anderen Sachen innerhalb eines eigenen
 * Edit-Fensters für das Bild. Da kann ich nicht in SVG umwandeln klicken,
 * dieser komplette Prozess fehlt im Editor.").
 *
 * VORHER: Die Vektor-Regler steckten im Reiter „Bibliothek" (losgelöst von
 * der ausgewählten Grafik) und „In SVG umwandeln" war im Bibliotheks-Pool
 * nur per HOVER erreichbar (.gre-pool-vektor in grafik-editor.css) — dadurch
 * praktisch unauffindbar. Dieser Baustein bündelt beides direkt bei der
 * ausgewählten Grafik, im Reiter „Bild" (s. GrafikEditor.tsx REITER).
 *
 * Ruft AUSSCHLIESSLICH bestehende Funktionen aus GrafikEditor.tsx auf (per
 * Props durchgereicht, gleiches Muster wie GrafikObjektMenue.tsx) — baut
 * nichts nach und erfindet keine neue Keyframe-Logik: Position/Skalierung/
 * Deckkraft/Drehung werden weiterhin ausschließlich über Keyframes bearbeitet
 * (Reiter „Keyframes"), hier nur als aktueller Zustand ANGEZEIGT
 * (zustandBei, bereits bestehende Funktion aus grafik-types.ts). Einzige
 * Ausnahme: Grundbreite ist KEIN Keyframe-Feld (gilt für die ganze Grafik),
 * der Regler hier spiegelt exakt den vorhandenen Regler im Reiter
 * „Keyframes" (identische Commit-Gruppe „breite:<id>", s. GrafikEditor.tsx).
 *
 * Eigene Datei statt Anhängsel an GrafikEditor.tsx (das ist schon ~2000
 * Zeilen, s. GrafikObjektMenue.tsx/GrafikHilfe.tsx für dasselbe Muster).
 */

import { useEffect, useState } from "react";
import type { GrafikObjektMenueProps } from "./GrafikObjektMenue";
import { zustandBei, type MedienArt } from "./grafik-types";
import { HilfeIcon } from "./GrafikHilfe";
import { GrafikCrop } from "./GrafikCrop";
import "./grafik-inspector.css";

export interface GrafikInspectorProps extends Omit<GrafikObjektMenueProps, "onHierLocken"> {
  /** Aktuelle Scrollposition — für die Live-Zustandsanzeige (zustandBei). */
  scrollY: number;
  /** Grundbreite (px) ändern — identische Wirkung wie der Regler im Reiter
   *  „Keyframes" (dieselbe Commit-Gruppe, s. GrafikEditor.tsx), nur
   *  zusätzlich hier verfügbar. */
  onBreiteAendern: (px: number) => void;
  /** Horizontal/vertikal spiegeln umschalten — reine Anzeige-Transform, s.
   *  GrafikLayer.tsx. Der Zustand selbst steckt direkt in
   *  grafik.spiegelX/spiegelY (kein Extra-Prop dafür nötig). */
  onSpiegelnX: () => void;
  onSpiegelnY: () => void;
  /** Zuschneiden: liefert das Ergebnis (neue Bildquelle + proportional
   *  angepasste Grundbreite, s. GrafikCrop.tsx) an GrafikEditor.tsx zurück,
   *  das daraus wie bei „Datei ersetzen" einen Verlaufseintrag macht. */
  onZuschneidenAnwenden: (dataUrl: string, breiteNeuPx: number) => void;
  /** true = Rasterbild, noch kein SVG → „In SVG umwandeln" ergibt Sinn. */
  kannVektorisieren: boolean;
  vektorisiertLaeuft: boolean;
  onVektorisieren: () => void;
  vektorMaxFarben: number;
  onVektorMaxFarbenAendern: (n: number) => void;
  vektorMinFlaeche: number;
  onVektorMinFlaecheAendern: (n: number) => void;
  vektorGlaettung: number;
  onVektorGlaettungAendern: (n: number) => void;
  /** true = Rasterbild, kein SVG → „Freistellen" ergibt Sinn (gleiche
   *  Bedingung wie kannVektorisieren, s. GrafikEditor.tsx). */
  kannFreistellen: boolean;
  freistellenLaeuft: boolean;
  onFreistellen: () => void;
}

const ART_LABEL: Record<MedienArt, string> = {
  bild: "Bild",
  lottie: "Lottie-Animation",
  video: "Video",
};

export function GrafikInspector({
  grafik,
  scrollY,
  tauschAktiv,
  onLoeschen,
  onTauschen,
  onDateiErsetzen,
  onDuplizieren,
  onNachVorn,
  onNachHinten,
  onAusblenden,
  onSperren,
  onBreiteAendern,
  onSpiegelnX,
  onSpiegelnY,
  onZuschneidenAnwenden,
  kannVektorisieren,
  vektorisiertLaeuft,
  onVektorisieren,
  vektorMaxFarben,
  onVektorMaxFarbenAendern,
  vektorMinFlaeche,
  onVektorMinFlaecheAendern,
  vektorGlaettung,
  onVektorGlaettungAendern,
  kannFreistellen,
  freistellenLaeuft,
  onFreistellen,
}: GrafikInspectorProps) {
  const zustand = zustandBei(grafik, scrollY);
  /* Rein lokale UI-Sichtbarkeit (kein Undo-relevanter Zustand) — deshalb
     hier statt in GrafikEditor.tsx. Das Overlay selbst blockt beim Öffnen
     ohnehin die ganze Fläche inkl. .gre-panel (höherer z-index, s.
     grafik-crop.css), ein Reiter-/Auswahlwechsel währenddessen ist also gar
     nicht möglich — der Reset unten ist nur defensive Absicherung. */
  const [zuschneidenOffen, setZuschneidenOffen] = useState(false);
  useEffect(() => setZuschneidenOffen(false), [grafik.id]);

  return (
    <div className="gre-inspector">
      <div className="gre-inspector-kopf">
        <div className="gre-inspector-thumb">
          {grafik.art === "bild" ? (
            <img src={grafik.src} alt="" />
          ) : (
            <span className="gre-pool-icon">{grafik.art === "lottie" ? "◆" : "▶"}</span>
          )}
        </div>
        <div className="gre-inspector-kopf-text">
          <div className="gre-inspector-name" title={grafik.name}>
            {grafik.name}
          </div>
          <div className="gre-inspector-art">{ART_LABEL[grafik.art]}</div>
        </div>
      </div>

      <div className="gre-inspector-abschnitt">
        <div className="gre-reiter-kopf">
          <span>Position &amp; Größe</span>
          <HilfeIcon
            label="Position & Größe"
            text={`Grundbreite gilt für die ganze Grafik (die Höhe folgt dem Seitenverhältnis). Position, Skalierung, Deckkraft und Drehung hängen von der Scrollposition ab — das hier ist der aktuelle Stand. Bearbeitet wird das über Keyframes im Reiter „Keyframes".`}
          />
        </div>
        <div className="gre-regler">
          <div className="gre-regler-kopf">
            <span>Grundbreite</span>
            <span className="gre-wert">{grafik.breitePx}px</span>
          </div>
          <input
            type="range"
            min={20}
            max={1200}
            step={10}
            value={grafik.breitePx}
            onChange={(e) => onBreiteAendern(Number(e.target.value))}
          />
        </div>
        <div className="gre-inspector-zustand">
          <span>
            x {Math.round(zustand.x)} · y {Math.round(zustand.y)} · {zustand.scale.toFixed(2)}×
          </span>
          <span>
            Deckkraft {Math.round(zustand.opacity * 100)}% · Drehung {Math.round(zustand.rotation)}°
          </span>
        </div>
      </div>

      {/* Spiegeln + Zuschneiden: reine Bildbearbeitung an der PLATZIERTEN
          Grafik (additiv zum bestehenden Vektor-/Datei-Werkzeugkasten
          unten). Nur bei art==="bild" sinnvoll — Lottie/Video haben kein
          statisches <img>, das sich spiegeln/zuschneiden ließe. */}
      {grafik.art === "bild" && (
        <div className="gre-inspector-abschnitt">
          <div className="gre-reiter-kopf">
            <span>Spiegeln &amp; Zuschneiden</span>
            <HilfeIcon
              label="Spiegeln & Zuschneiden"
              text="Spiegeln dreht nur die ANZEIGE um (die Bilddatei bleibt unverändert, jederzeit rückgängig). Zuschneiden erzeugt dagegen ein NEUES Bild aus dem gewählten Ausschnitt und ersetzt damit die Quelle dieser platzierten Grafik — das Original bleibt in der Bibliothek erhalten."
            />
          </div>
          <div className="gre-inspector-spiegeln">
            <button
              type="button"
              className={grafik.spiegelX ? "gre-tausch-aktiv" : undefined}
              onClick={onSpiegelnX}
              title="Horizontal spiegeln"
            >
              ⇋ Horizontal
            </button>
            <button
              type="button"
              className={grafik.spiegelY ? "gre-tausch-aktiv" : undefined}
              onClick={onSpiegelnY}
              title="Vertikal spiegeln"
            >
              ⇕ Vertikal
            </button>
          </div>
          <button type="button" onClick={() => setZuschneidenOffen(true)}>
            ✂ Zuschneiden
          </button>
          {zuschneidenOffen && (
            <GrafikCrop
              src={grafik.src}
              breitePx={grafik.breitePx}
              onAnwenden={(dataUrl, breiteNeuPx) => {
                onZuschneidenAnwenden(dataUrl, breiteNeuPx);
                setZuschneidenOffen(false);
              }}
              onAbbrechen={() => setZuschneidenOffen(false)}
            />
          )}
        </div>
      )}

      {kannVektorisieren && (
        <div className="gre-inspector-abschnitt">
          <div className="gre-reiter-kopf">
            <span>In SVG umwandeln</span>
            <HilfeIcon
              label="In SVG umwandeln"
              text="Wandelt dieses Rasterbild (PNG/JPG/…) in eine Vektorgrafik um: Farbflächen werden zu eigenen Pfaden. Das Ergebnis landet zusätzlich in der Bibliothek — die Quelle bleibt unangetastet."
            />
          </div>
          <button
            type="button"
            className="gre-inspector-vektor-knopf"
            onClick={onVektorisieren}
            disabled={vektorisiertLaeuft || freistellenLaeuft}
          >
            ⬡ In SVG umwandeln
          </button>
          <details className="gre-vektor-regler">
            <summary>⚙ Vektor-Einstellungen</summary>
            <div className="gre-regler">
              <div className="gre-regler-kopf">
                <span>
                  Farben{" "}
                  <HilfeIcon
                    label="Farben"
                    text="Wie viele unterschiedliche Farbflächen beim Umwandeln in Vektorgrafik entstehen dürfen. Weniger Farben = einfachere, gröbere Grafik. Mehr Farben = näher am Original, aber mehr einzelne Flächen."
                  />
                </span>
                <span className="gre-wert">{vektorMaxFarben}</span>
              </div>
              <input
                type="range"
                min={2}
                max={16}
                step={1}
                value={vektorMaxFarben}
                onChange={(e) => onVektorMaxFarbenAendern(Number(e.target.value))}
              />
            </div>
            <div className="gre-regler">
              <div className="gre-regler-kopf">
                <span>
                  Mindestfläche{" "}
                  <HilfeIcon
                    label="Mindestfläche"
                    text="Verwirft Farbflecken, die kleiner sind als dieser Wert. Höher = weniger, dafür größere und gröbere Flächen. Niedriger = auch winzige Details werden übernommen."
                  />
                </span>
                <span className="gre-wert">{vektorMinFlaeche}px</span>
              </div>
              <input
                type="range"
                min={4}
                max={400}
                step={1}
                value={vektorMinFlaeche}
                onChange={(e) => onVektorMinFlaecheAendern(Number(e.target.value))}
              />
            </div>
            <div className="gre-regler">
              <div className="gre-regler-kopf">
                <span>
                  Glättung{" "}
                  <HilfeIcon
                    label="Glättung"
                    text="Wie stark die Kanten der Farbflächen geglättet werden. Höher = rundere, weichere Kanten. Niedriger = kantiger, näher an den Original-Pixeln."
                  />
                </span>
                <span className="gre-wert">{vektorGlaettung.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={vektorGlaettung}
                onChange={(e) => onVektorGlaettungAendern(Number(e.target.value))}
              />
            </div>
          </details>
        </div>
      )}

      {kannFreistellen && (
        <div className="gre-inspector-abschnitt">
          <div className="gre-reiter-kopf">
            <span>Freistellen</span>
            <HilfeIcon
              label="Freistellen"
              text="Entfernt den Hintergrund automatisch (KI-Bildsegmentierung) und ersetzt die Bildquelle dieser Grafik durch das Ergebnis mit transparentem Hintergrund. Läuft komplett lokal im Browser — es werden keine Bilder an einen Server geschickt."
            />
          </div>
          <button
            type="button"
            className="gre-inspector-vektor-knopf"
            onClick={onFreistellen}
            disabled={freistellenLaeuft || vektorisiertLaeuft}
          >
            🪄 Freistellen
          </button>
          <div className="gre-inspector-hinweis">
            Läuft lokal im Browser, Bibliothek „@imgly/background-removal" (AGPL-Lizenz). Beim
            ersten Mal wird dafür ein KI-Modell geladen (bis zu ~80 MB) — das kann etwas dauern.
          </div>
        </div>
      )}

      <div className="gre-inspector-abschnitt">
        <div className="gre-reiter-kopf">
          <span>Datei-Aktionen</span>
        </div>
        <div className="gre-inspector-aktionen">
          <button type="button" onClick={onTauschen}>
            {tauschAktiv ? "⇄ Tausch abbrechen" : "⇄ Tauschen"}
          </button>
          <button type="button" onClick={onDateiErsetzen}>
            📄 Datei ersetzen
          </button>
          <button type="button" onClick={onDuplizieren}>
            ⧉ Duplizieren
          </button>
          <button type="button" onClick={onNachVorn}>
            ▲ Nach vorn
          </button>
          <button type="button" onClick={onNachHinten}>
            ▼ Nach hinten
          </button>
          <button type="button" onClick={onAusblenden}>
            {grafik.versteckt ? "👁 Einblenden" : "🚫 Ausblenden"}
          </button>
          <button type="button" onClick={onSperren}>
            {grafik.gesperrt ? "🔓 Entsperren" : "🔒 Sperren"}
          </button>
          <button type="button" className="gre-inspector-loeschen" onClick={onLoeschen}>
            ✕ Löschen
          </button>
        </div>
      </div>
    </div>
  );
}
