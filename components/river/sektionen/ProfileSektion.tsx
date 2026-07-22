"use client";

/*
 * ProfileSektion – Inhalt des früheren Fluss-Editor-Reiters „Profile" (intern
 * id=verlaeufe), aus RiverKursEditor.tsx herausgelöst (Welle 2b-1,
 * verhaltensgleich). Speichern/Laden/Löschen/Import/Export/SVG des Fluss-
 * Standes; die Logik lebt in useFlussKnoten, hier nur die Bedienoberfläche.
 */

import type { ChangeEvent, RefObject } from "react";
import type { FlussVerlauf } from "../riverSnapshot";

interface ProfileSektionProps {
  name: string;
  setName: (n: string) => void;
  verlaeufe: Record<string, FlussVerlauf>;
  importRef: RefObject<HTMLInputElement | null>;
  speichern: () => void;
  laden: (n: string) => void;
  verlaufLoeschen: (n: string) => void;
  exportieren: () => void;
  dateiImportiert: (e: ChangeEvent<HTMLInputElement>) => void;
  alsSvgExportieren: () => void;
}

export function ProfileSektion({
  name,
  setName,
  verlaeufe,
  importRef,
  speichern,
  laden,
  verlaufLoeschen,
  exportieren,
  dateiImportiert,
  alsSvgExportieren,
}: ProfileSektionProps) {
  return (
    <>
      <div className="rke-hilfe">
        Ein Profil = ein gespeicherter Fluss-Stand (Kurve, Animation UND eingefrorene
        Geometrie/Farben). Der Export ist eine selbsttragende Datei, benannt nach dem Profil —
        „Importieren" lädt sie sofort wieder live. Die Zahl hinter dem Namen = Anzahl der
        Knotenpunkte, die den Verlauf definieren.
      </div>
      <div className="rke-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Profil-Name (= Dateiname)"
        />
        <button onClick={speichern}>Speichern</button>
      </div>
      {Object.keys(verlaeufe).length > 0 && (
        <div className="rke-liste">
          {Object.keys(verlaeufe)
            .sort()
            .map((n) => (
              <div key={n} className="rke-row">
                <button
                  className="rke-lade"
                  onClick={() => laden(n)}
                  title={`Profil „${n}" laden — ${verlaeufe[n].nodes?.length ?? 0} Knotenpunkte`}
                >
                  {n} ({verlaeufe[n].nodes?.length ?? 0} Knoten)
                </button>
                <button onClick={() => verlaufLoeschen(n)} title={`Profil „${n}" löschen`}>
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}
      <input
        ref={importRef}
        type="file"
        accept="application/json"
        onChange={dateiImportiert}
        hidden
      />
      <div className="rke-row">
        <button
          onClick={() => importRef.current?.click()}
          title="Profil-Datei laden (Einzel-Profil oder alte Sammel-Datei)"
        >
          Importieren
        </button>
        <button onClick={exportieren} title="Aktuelles Profil als JSON (Dateiname = Profilname)">
          Als JSON exportieren
        </button>
      </div>
      <div className="rke-row">
        <button
          onClick={alsSvgExportieren}
          title="Fluss-Körper (Form+Farben) als eigenständige SVG-Datei — ohne Laufzeit-Partikel"
        >
          Als SVG exportieren
        </button>
      </div>
    </>
  );
}
