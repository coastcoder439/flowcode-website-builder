"use client";

/*
 * app/editor/SeitenImport.tsx — der Ordner-Import-Assistent des Seiten-Bereichs
 * (Welle 4b, docs/editor-vereinheitlichung.md §9/4b: „das letzte was fehlt").
 * Wird von SeitenBereich.tsx eingeblendet, wenn „Website importieren" geklickt
 * wird; nach dem Speichern ruft er onFertig(name) -> Parent oeffnet die Seite
 * direkt im Puck-Editor.
 *
 * Ablauf (Bericht ZUERST — fester UI-Teil, §9/4b):
 *   1. Ordner waehlen (File System Access, Muster components/backdrop) — HTML-
 *      Dateien listen, index.html vorausgewaehlt.
 *   2. Name vergeben (= Slug: Seiten-Datei UND public/import/<slug>/ fuer
 *      grosse Assets).
 *   3. Analysieren: reiner DOMParser-Adapter (lib/import/html-zu-puck.ts) +
 *      Asset-Aufloesung (lib/import/ordner-import.ts).
 *   4. BERICHT anzeigen: n Sektionen/Texte/Bilder/HTML-Bloecke + GEFLAGGT-Liste
 *      (was entfernt/nicht uebernommen wurde, mit Grund).
 *   5. „Als Seite speichern" -> POST /api/puck-seite/speichere -> onFertig.
 *
 * Der Import beruehrt weder den Backdrop-Handle noch bestehende Seiten (er legt
 * eine NEUE Seite an; ein Namenskonflikt wird als Fehler sichtbar, kein stilles
 * Ueberschreiben).
 */

import { useRef, useState } from "react";
import type { Data } from "@puckeditor/core";
import { htmlZuPuck, type ImportFlag, type ImportStatistik } from "@/lib/import/html-zu-puck";
import {
  aufloeseBilderAusOrdner,
  listeHtmlDateien,
  ordnerApiDa,
  sammleImportDateien,
  waehleImportOrdner,
} from "@/lib/import/ordner-import";
import type { OrdnerHandle } from "@/components/backdrop/ordner-serve";

interface SeitenImportProps {
  /** Wird nach erfolgreichem Speichern mit dem Seiten-Namen aufgerufen
   *  (Parent laedt die Liste neu und oeffnet die Seite). */
  onFertig: (name: string) => void;
  /** Assistent schliessen (zurueck zur Liste). */
  onAbbruch: () => void;
}

interface Analyse {
  data: Data;
  statistik: ImportStatistik;
  flags: ImportFlag[];
}

/** Client-seitiger Slug — der Server saeubert final (saubererName). Kleiner,
 *  Bindestriche statt Leerzeichen, nur unbedenkliche Zeichen. */
function slugify(roh: string): string {
  return roh
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

export function SeitenImport({ onFertig, onAbbruch }: SeitenImportProps) {
  const [dateien, setDateien] = useState<Map<string, File> | null>(null);
  const [htmlDateien, setHtmlDateien] = useState<string[]>([]);
  const [gewaehlteDatei, setGewaehlteDatei] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [analyse, setAnalyse] = useState<Analyse | null>(null);

  const [status, setStatus] = useState<string>("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const handleRef = useRef<OrdnerHandle | null>(null);

  /* --- Schritt 1: Ordner waehlen --- */
  const waehleOrdner = async () => {
    setFehler(null);
    if (!ordnerApiDa()) {
      setFehler("Ordner-Import braucht Chrome oder Edge (File System Access API).");
      return;
    }
    let handle: OrdnerHandle | null = null;
    try {
      handle = await waehleImportOrdner();
    } catch {
      return; // Dialog abgebrochen — kein Fehlerfall
    }
    if (!handle) return;
    setLaeuft(true);
    setStatus("Lese Ordner …");
    try {
      const map = await sammleImportDateien(handle);
      const html = listeHtmlDateien(map);
      if (html.length === 0) {
        setFehler("Im Ordner wurde keine HTML-Datei gefunden.");
        setStatus("");
        return;
      }
      handleRef.current = handle;
      setDateien(map);
      setHtmlDateien(html);
      setGewaehlteDatei(html[0]);
      setAnalyse(null);
      setName((n) => n || slugify(handle!.name));
      setStatus(`${map.size} Datei${map.size === 1 ? "" : "en"} gelesen, ${html.length} HTML-Datei${html.length === 1 ? "" : "en"}.`);
    } catch {
      setFehler("Ordner konnte nicht gelesen werden.");
      setStatus("");
    } finally {
      setLaeuft(false);
    }
  };

  /* --- Schritt 3: Analysieren (Adapter + Asset-Aufloesung) --- */
  const analysiere = async () => {
    setFehler(null);
    const slug = slugify(name);
    if (!slug) {
      setFehler("Bitte einen Namen für die Seite eingeben.");
      return;
    }
    if (!dateien || !gewaehlteDatei) return;
    setLaeuft(true);
    setStatus("Analysiere HTML …");
    try {
      const roh = await dateien.get(gewaehlteDatei)!.text();
      const bericht = htmlZuPuck(roh, { idPraefix: slug });
      /* Bilder gegen den Ordner aufloesen (klein -> Data-URL, gross -> Upload). */
      const { data, flags } = await aufloeseBilderAusOrdner(bericht, dateien, slug);
      setAnalyse({ data, statistik: bericht.statistik, flags: [...bericht.flags, ...flags] });
      setStatus("Analyse fertig — Bericht prüfen, dann speichern.");
    } catch {
      setFehler("Analyse fehlgeschlagen.");
      setStatus("");
    } finally {
      setLaeuft(false);
    }
  };

  /* --- Schritt 5: Als Seite speichern --- */
  const speichere = async () => {
    if (!analyse) return;
    const slug = slugify(name);
    if (!slug) {
      setFehler("Bitte einen Namen für die Seite eingeben.");
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      const res = await fetch("/api/puck-seite/speichere", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: slug, data: analyse.data }),
      });
      const json = (await res.json().catch(() => null)) as { name?: string; fehler?: string } | null;
      if (res.status === 409) {
        setFehler(`Eine Seite „${slug}" existiert bereits — anderen Namen wählen.`);
        return;
      }
      if (!res.ok || !json?.name) {
        setFehler(json?.fehler ?? "Speichern fehlgeschlagen.");
        return;
      }
      onFertig(json.name);
    } catch {
      setFehler("Server nicht erreichbar.");
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <div className="seiten-verwaltung">
      <div className="seiten-verwaltung-innen">
        <div className="seiten-kopf">
          <h1 id="seiten-import-titel">Website importieren</h1>
          <button type="button" className="seiten-btn" onClick={onAbbruch}>
            Zurück zur Liste
          </button>
        </div>

        <p className="seiten-import-hinweis">
          Wählt einen Ordner mit einer statischen Website (index.html + Bilder). Die Seite wird
          deterministisch in Bausteine zerlegt — <strong>Styling und aktive Inhalte
          (Skripte, Rahmen) werden dabei nicht übernommen</strong> und unten ehrlich aufgelistet.
        </p>

        {/* Schritt 1 */}
        <div className="seiten-import-schritt">
          <button
            type="button"
            className="seiten-btn seiten-btn--primaer"
            onClick={() => void waehleOrdner()}
            disabled={laeuft || speichert}
          >
            📁 Ordner wählen
          </button>
        </div>

        {/* Schritt 2 + 3: Datei + Name + Analysieren */}
        {htmlDateien.length > 0 && (
          <>
            <fieldset className="seiten-import-dateien">
              <legend>HTML-Datei</legend>
              {htmlDateien.map((pfad) => (
                <label key={pfad} className="seiten-import-datei">
                  <input
                    type="radio"
                    name="import-html-datei"
                    value={pfad}
                    checked={gewaehlteDatei === pfad}
                    onChange={() => {
                      setGewaehlteDatei(pfad);
                      setAnalyse(null);
                    }}
                  />
                  <span>{pfad}</span>
                </label>
              ))}
            </fieldset>

            <div className="seiten-neu">
              <div className="seiten-neu-feld">
                <label htmlFor="seiten-import-name">Seiten-Name</label>
                <input
                  id="seiten-import-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setAnalyse(null);
                  }}
                  placeholder="z. B. meine-website"
                />
              </div>
              <button
                type="button"
                className="seiten-btn seiten-btn--primaer"
                onClick={() => void analysiere()}
                disabled={laeuft || speichert}
              >
                {laeuft ? "Analysiert …" : "Analysieren"}
              </button>
            </div>
          </>
        )}

        {status && (
          <p className="seiten-meldung" role="status" aria-live="polite">
            {status}
          </p>
        )}
        {fehler && (
          <p role="alert" className="seiten-meldung seiten-meldung--fehler">
            {fehler}
          </p>
        )}

        {/* Schritt 4: Bericht */}
        {analyse && (
          <div className="seiten-import-bericht">
            <h2>Import-Bericht</h2>
            <ul className="seiten-import-statistik">
              <li>
                <b>{analyse.statistik.sektionen}</b> Sektionen
              </li>
              <li>
                <b>{analyse.statistik.texte}</b> Texte
              </li>
              <li>
                <b>{analyse.statistik.bilder}</b> Bilder
              </li>
              <li>
                <b>{analyse.statistik.htmlBloecke}</b> HTML-Blöcke
              </li>
            </ul>

            {analyse.flags.length > 0 ? (
              <div className="seiten-import-flags">
                <h3>Nicht übernommen / entfernt ({analyse.flags.length})</h3>
                <ul>
                  {analyse.flags.map((f, i) => (
                    <li key={`${f.grund}-${i}`}>
                      <span className="seiten-import-flag-grund">{f.grund}</span>
                      <span className="seiten-import-flag-detail">{f.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="seiten-import-keine-flags">Nichts entfernt — sauber übernommen.</p>
            )}

            <div className="seiten-import-aktionen">
              <button
                type="button"
                className="seiten-btn seiten-btn--primaer"
                onClick={() => void speichere()}
                disabled={speichert}
              >
                {speichert ? "Speichert …" : "Als Seite speichern"}
              </button>
              <button type="button" className="seiten-btn" onClick={onAbbruch} disabled={speichert}>
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
