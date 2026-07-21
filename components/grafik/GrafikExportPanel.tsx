"use client";

/*
 * GrafikExportPanel – Reiter "Export" im Grafik-Editor (Phase 3, die
 * LETZTE): baut aus dem aktuellen Editor-Zustand (platzierte Grafiken +
 * optional ein im Fluss-Editor gespeicherter Verlauf) die drei
 * Ausgabeformen des Embeds und bietet sie als Download an. Eigene Datei
 * statt Einbettung in GrafikEditor.tsx (das ist schon >2000 Zeilen) –
 * gleiches Muster wie GrafikInspector.tsx/GrafikSeiteTab.tsx.
 *
 * WARUM EIN EIGENER REITER (nicht Teil von "Setups"): Setups sind reine
 * Editor-Zustände (Grafiken + Bibliothek, s. GrafikEditor.tsx). Der Export
 * führt ZUSÄTZLICH einen im FLUSS-Editor gespeicherten Verlauf zusammen
 * (beide werden in getrennten Editoren autoriert, s. Auftrag) und erzeugt
 * ein fremdes Artefakt für eine andere Website – das ist ein eigener
 * Arbeitsschritt am Ende der Kette, kein weiterer Editor-Zustand.
 *
 * WARUM DIREKT AUS localStorage lesen (kein Context/Provider): Der
 * Fluss-Editor (RiverKursEditor.tsx) speichert seine Verläufe schon dort
 * unter demselben Schlüssel ("wee-fluss-verlaeufe") – ein zweiter
 * Lese-Layer wäre nur eine Kopie derselben Quelle.
 */

import { useEffect, useMemo, useState } from "react";
import { HilfeIcon } from "./GrafikHilfe";
import { GrafikExportAnleitung } from "./GrafikExportAnleitung";
import { baueEmbedConfig, baueOverlayHtml } from "../embed/embed-export";
import type { Grafik } from "./grafik-types";
import type { FlussVerlauf } from "../river/riverSnapshot";

/** Identisch zu STORAGE_KEY in RiverKursEditor.tsx – MUSS mit dort
 *  übereinstimmen, sonst sieht dieser Reiter die im Fluss-Editor
 *  gespeicherten Verläufe nicht. */
const FLUSS_STORAGE_KEY = "wee-fluss-verlaeufe";
/** Wo wee-embed.js auf DIESEM Projekt liegt (s. public/embed-demo.html) –
 *  gleicher Pfad, den der Overlay-Export als <script src> einträgt. */
const EMBED_URL = "/wee-embed.js";
/** Sentinel-Wert für "kein Fluss" im <select> – kein echter Verlaufsname
 *  (Verlaufsnamen kommen aus Leon/Bens freier Eingabe im Fluss-Editor). */
const KEIN_FLUSS = "__kein-fluss__";

function ladeFlussVerlaeufe(): Record<string, FlussVerlauf> {
  try {
    return JSON.parse(localStorage.getItem(FLUSS_STORAGE_KEY) ?? "{}") as Record<string, FlussVerlauf>;
  } catch {
    return {};
  }
}

/** Löst einen Blob als Download aus – gleiches Muster wie exportieren() in
 *  GrafikEditor.tsx/RiverKursEditor.tsx (URL.createObjectURL + Klick auf ein
 *  unsichtbares <a>, dann wieder freigeben). */
function downloadeBlob(blob: Blob, dateiname: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = dateiname;
  a.click();
  URL.revokeObjectURL(url);
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Kurze Fehlermeldung aus einem unknown-Fehler – gleiches Muster wie an
 *  vielen Stellen in GrafikEditor.tsx (catch-Blöcke). */
function fehlerText(error: unknown): string {
  return error instanceof Error ? error.message : "unbekannter Fehler";
}

interface GrafikExportPanelProps {
  /** Die aktuell platzierten Grafiken des Editors (ctx.grafiken) – reines
   *  Prop statt eigenem Context-Zugriff, damit dieser Reiter unabhängig vom
   *  restlichen Editor-Zustand bleibt. */
  grafiken: Grafik[];
}

export function GrafikExportPanel({ grafiken }: GrafikExportPanelProps) {
  const [verlaeufe, setVerlaeufe] = useState<Record<string, FlussVerlauf>>({});
  const [gewaehlterFluss, setGewaehlterFluss] = useState(KEIN_FLUSS);
  const [bilderInline, setBilderInline] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [status, setStatus] = useState("");
  const [anleitungOffen, setAnleitungOffen] = useState(false);

  /* Beim Öffnen des Reiters einmal einlesen + den zuletzt gespeicherten
     Verlauf vorauswählen – Ben will im Regelfall GENAU seinen aktuellen
     Fluss mitexportieren, nicht "kein Fluss" jedes Mal neu setzen. Gleiches
     Muster wie das Pool-Vorauswählen in GrafikEditor.tsx (letztes Setup). */
  useEffect(() => {
    const alle = ladeFlussVerlaeufe();
    setVerlaeufe(alle);
    const namen = Object.keys(alle);
    if (namen.length === 0) return;
    const letzter = namen
      .map((n) => alle[n])
      .sort((a, b) => (a.gespeichert < b.gespeichert ? 1 : -1))[0];
    if (letzter) setGewaehlterFluss(letzter.name);
  }, []);

  const flussNamen = useMemo(() => Object.keys(verlaeufe).sort(), [verlaeufe]);
  const flussVerlauf = gewaehlterFluss === KEIN_FLUSS ? null : (verlaeufe[gewaehlterFluss] ?? null);

  const flussStatusteil = (config: { fluss?: { name: string } }) =>
    config.fluss ? ` · Fluss: ${config.fluss.name}` : " · kein Fluss";

  const jsonExportieren = async () => {
    setLaeuft(true);
    setStatus("Baue Config…");
    try {
      const config = await baueEmbedConfig(grafiken, flussVerlauf, {
        bilderInline,
        docH: document.documentElement.scrollHeight,
      });
      const json = JSON.stringify(config, null, 2);
      downloadeBlob(new Blob([json], { type: "application/json" }), "wee-anim.json");
      setStatus(
        `Config ${formatKb(new Blob([json]).size)} · ${config.grafiken.length} Grafik(en)${flussStatusteil(config)}`,
      );
    } catch (error) {
      setStatus(`Export fehlgeschlagen (${fehlerText(error)})`);
    } finally {
      setLaeuft(false);
    }
  };

  const htmlExportieren = async () => {
    setLaeuft(true);
    setStatus("Baue Overlay-HTML…");
    try {
      const config = await baueEmbedConfig(grafiken, flussVerlauf, {
        bilderInline,
        docH: document.documentElement.scrollHeight,
      });
      const html = baueOverlayHtml(config, { embedUrl: EMBED_URL });
      downloadeBlob(new Blob([html], { type: "text/html" }), "wee-overlay.html");
      setStatus(
        `Overlay-HTML ${formatKb(new Blob([html]).size)} · ${config.grafiken.length} Grafik(en)${flussStatusteil(config)}`,
      );
    } catch (error) {
      setStatus(`Export fehlgeschlagen (${fehlerText(error)})`);
    } finally {
      setLaeuft(false);
    }
  };

  const runtimeHerunterladen = async () => {
    setLaeuft(true);
    setStatus("Lade Runtime…");
    try {
      const res = await fetch(EMBED_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      downloadeBlob(blob, "wee-embed.js");
      setStatus(`wee-embed.js heruntergeladen (${formatKb(blob.size)})`);
    } catch (error) {
      setStatus(`Runtime-Download fehlgeschlagen (${fehlerText(error)})`);
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <>
      <div className="gre-reiter-kopf">
        <span>Export</span>
        <HilfeIcon
          label="Export"
          text={`Baut aus deinen platzierten Grafiken (und optional einem gespeicherten Fluss-Profil) ein fertiges Paket für Bens echte Website: eine Config-Datei, ein fertiges HTML-Snippet oder das Runtime-Script.`}
        />
      </div>
      <div className="gre-hilfe">
        {`Wähle unten aus, was mitexportiert werden soll, dann lade eine der drei Formen herunter. Unsicher, was du brauchst? "Anleitung" öffnen.`}
      </div>

      <div className="gre-row">
        <button onClick={() => setAnleitungOffen(true)}>{`? Anleitung`}</button>
      </div>

      <div className="gre-regler">
        <div className="gre-regler-kopf">
          <span>{`Fluss-Profil`}</span>
          <HilfeIcon
            label="Fluss-Profil"
            text={`Grafiken und der Fluss werden in getrennten Editoren gebaut (/grafik-editor und /fluss-editor). Hier wählst du, welches im Fluss-Editor gespeicherte Profil mit in den Export soll – oder "kein Fluss", wenn nur die Grafiken exportiert werden sollen.`}
          />
        </div>
        <select value={gewaehlterFluss} onChange={(e) => setGewaehlterFluss(e.target.value)}>
          <option value={KEIN_FLUSS}>{`kein Fluss`}</option>
          {flussNamen.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {flussNamen.length === 0 && (
          <div className="gre-leer">
            {`Noch kein Fluss-Profil gespeichert – im Fluss-Editor unter "Profile" speichern.`}
          </div>
        )}
      </div>

      <div className="gre-checkbox-row">
        <input
          id="gre-bilder-inline"
          type="checkbox"
          checked={bilderInline}
          onChange={(e) => setBilderInline(e.target.checked)}
        />
        <label htmlFor="gre-bilder-inline">{`Bilder einbetten (selbsttragend)`}</label>
        <HilfeIcon
          label="Bilder einbetten"
          text={`An: Projekt-Bilder (Pfade wie "/curtain/…") werden als Data-URLs in die Config eingebettet – der Export braucht dann kein separates Bilder-Hosting. Aus: Pfade bleiben wie sie sind, Ben muss die Bilder dann selbst unter denselben Pfaden bereitstellen.`}
        />
      </div>

      <div className="gre-row">
        <button onClick={() => void jsonExportieren()} disabled={laeuft}>
          {`JSON exportieren`}
        </button>
        <HilfeIcon
          label="JSON exportieren"
          text={`Lädt wee-anim.json herunter – die vollständige Config (Grafiken + Fluss + Farben). Brauchst du, wenn du die Config getrennt vom HTML einbinden willst (z.B. per data-config="URL").`}
        />
      </div>
      <div className="gre-row">
        <button onClick={() => void htmlExportieren()} disabled={laeuft}>
          {`HTML-Overlay exportieren`}
        </button>
        <HilfeIcon
          label="HTML-Overlay exportieren"
          text={`Lädt wee-overlay.html herunter – ein fertiges Snippet mit eingebauter Config, zum direkten Einfügen in ein CMS/Template vor </body>.`}
        />
      </div>
      <div className="gre-row">
        <button onClick={() => void runtimeHerunterladen()} disabled={laeuft}>
          {`Runtime-Script herunterladen`}
        </button>
        <HilfeIcon
          label="Runtime-Script herunterladen"
          text={`Lädt wee-embed.js herunter – das Script, das die Animation auf JEDER Seite zum Leben erweckt. Einmal auf Bens Server hochladen, mehrere Konfigurationen können es sich teilen.`}
        />
      </div>

      {status && <div className="gre-status">{status}</div>}

      <GrafikExportAnleitung offen={anleitungOffen} onSchliessen={() => setAnleitungOffen(false)} />
    </>
  );
}
