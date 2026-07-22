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
import {
  baueEmbedConfig,
  baueOverlayHtml,
  baueSeiteHtml,
  verarbeiteGrafik,
} from "../embed/embed-export";
import { baueElementHtml, elementSlug } from "../embed/element-html-export";
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
/** Sentinel für "der aktuelle Live-Stand aus dem Editor-Context" (Risiko 3) –
 *  nur verfügbar, wenn ein flussVerlaufGeber übergeben wurde (auf /editor).
 *  Der Verlauf wird dann erst beim Export-Klick aus dem Context gebaut. */
const AKTUELLER_FLUSS = "__aktueller-fluss__";

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
  /** Liefert den AKTUELLEN Fluss-Stand aus dem RiverKurs-Context (Risiko 3) –
   *  gesetzt auf /editor, wo der Fluss ein Objekt im selben Panel ist. Wird
   *  erst beim Export-Klick aufgerufen (Live-Stand), liefert null, solange
   *  Geometrie/Farben nicht bereit sind. Fehlt der Geber (kein Context, alte
   *  Route), bleibt localStorage die einzige Fluss-Quelle. */
  flussVerlaufGeber?: () => FlussVerlauf | null;
  /** Aktuell im Editor ausgewählte Grafik (ctx.auswahl) – nur zum VORWÄHLEN im
   *  Einzelelement-Export (Welle 3c). Optional/additiv: fehlt sie, wird die
   *  erste platzierte Grafik vorgewählt. */
  auswahlId?: string;
}

export function GrafikExportPanel({ grafiken, flussVerlaufGeber, auswahlId }: GrafikExportPanelProps) {
  const [verlaeufe, setVerlaeufe] = useState<Record<string, FlussVerlauf>>({});
  const [gewaehlterFluss, setGewaehlterFluss] = useState(KEIN_FLUSS);
  const [bilderInline, setBilderInline] = useState(true);
  const [laeuft, setLaeuft] = useState(false);
  const [status, setStatus] = useState("");
  const [anleitungOffen, setAnleitungOffen] = useState(false);
  /** Welche platzierte Grafik der Einzelelement-Export ausgibt. Leerer String =
   *  noch keine gewählt (Auflösung erst im useMemo/Effekt unten). */
  const [gewaehltesElement, setGewaehltesElement] = useState("");

  /* Beim Öffnen des Reiters einmal einlesen + den zuletzt gespeicherten
     Verlauf vorauswählen – Ben will im Regelfall GENAU seinen aktuellen
     Fluss mitexportieren, nicht "kein Fluss" jedes Mal neu setzen. Gleiches
     Muster wie das Pool-Vorauswählen in GrafikEditor.tsx (letztes Setup). */
  useEffect(() => {
    const alle = ladeFlussVerlaeufe();
    setVerlaeufe(alle);
    /* Auf /editor (Geber vorhanden) ist der Live-Stand aus dem Context die
       primäre Quelle (Risiko 3): direkt vorwählen. localStorage-Profile
       bleiben als zusätzliche Auswahl erhalten. Die Geber-Präsenz ist pro
       Route stabil, deshalb genügt die Auswertung beim Mount. */
    if (flussVerlaufGeber) {
      setGewaehlterFluss(AKTUELLER_FLUSS);
      return;
    }
    const namen = Object.keys(alle);
    if (namen.length === 0) return;
    const letzter = namen
      .map((n) => alle[n])
      .sort((a, b) => (a.gespeichert < b.gespeichert ? 1 : -1))[0];
    if (letzter) setGewaehlterFluss(letzter.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flussNamen = useMemo(() => Object.keys(verlaeufe).sort(), [verlaeufe]);

  /* Einzelelement-Vorwahl (Welle 3c): die aktuell im Editor ausgewählte Grafik,
     sonst die erste platzierte. Bleibt die bisherige Wahl gültig (Grafik noch
     da), wird sie NICHT überschrieben – sonst spränge der <select> bei jeder
     Auswahländerung auf der Bühne weg. Grafiken können sich zwischenzeitlich
     ändern (löschen), darum in einem Effekt statt fix beim Mount. */
  useEffect(() => {
    const nochGueltig = grafiken.some((g) => g.id === gewaehltesElement);
    if (nochGueltig) return;
    const vorwahl = (auswahlId && grafiken.some((g) => g.id === auswahlId) ? auswahlId : grafiken[0]?.id) ?? "";
    setGewaehltesElement(vorwahl);
  }, [grafiken, auswahlId, gewaehltesElement]);

  /** Löst die aktuell im <select> gewählte Fluss-Quelle zu einem Verlauf auf:
   *  Live-Context (Risiko 3), gespeichertes Profil (localStorage) oder null.
   *  Bewusst eine Funktion (nicht ein Render-Wert), damit der Live-Stand erst
   *  im Moment des Export-Klicks aus dem Context gebaut wird. */
  const holeFlussVerlauf = (): FlussVerlauf | null => {
    if (gewaehlterFluss === AKTUELLER_FLUSS) return flussVerlaufGeber ? flussVerlaufGeber() : null;
    if (gewaehlterFluss === KEIN_FLUSS) return null;
    return verlaeufe[gewaehlterFluss] ?? null;
  };

  const flussStatusteil = (config: { fluss?: { name: string } }) =>
    config.fluss ? ` · Fluss: ${config.fluss.name}` : " · kein Fluss";

  const jsonExportieren = async () => {
    const flussVerlauf = holeFlussVerlauf();
    if (gewaehlterFluss === AKTUELLER_FLUSS && !flussVerlauf) {
      setStatus("Fluss-Geometrie noch nicht bereit — kurz auf der Seite scrollen und erneut.");
      return;
    }
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
    const flussVerlauf = holeFlussVerlauf();
    if (gewaehlterFluss === AKTUELLER_FLUSS && !flussVerlauf) {
      setStatus("Fluss-Geometrie noch nicht bereit — kurz auf der Seite scrollen und erneut.");
      return;
    }
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

  const elementExportieren = async () => {
    const g = grafiken.find((x) => x.id === gewaehltesElement);
    if (!g) {
      setStatus("Keine Grafik gewählt — links platzieren und erneut.");
      return;
    }
    setLaeuft(true);
    setStatus("Baue Element-HTML…");
    try {
      /* Bilder-Inlining über DIESELBE Regel wie der große Export (nicht
         dupliziert) – dann ist das Snippet selbsttragend bzw. behält den
         Projektpfad, je nach Checkbox. */
      const aufbereitet = await verarbeiteGrafik(g, bilderInline);
      const html = baueElementHtml(aufbereitet, { name: g.name });
      downloadeBlob(new Blob([html], { type: "text/html" }), `wee-element-${elementSlug(g.name)}.html`);
      setStatus(`Element-HTML ${formatKb(new Blob([html]).size)} · „${g.name}" (${g.keyframes.length} KF)`);
    } catch (error) {
      setStatus(`Export fehlgeschlagen (${fehlerText(error)})`);
    } finally {
      setLaeuft(false);
    }
  };

  const seiteExportieren = async () => {
    const flussVerlauf = holeFlussVerlauf();
    if (gewaehlterFluss === AKTUELLER_FLUSS && !flussVerlauf) {
      setStatus("Fluss-Geometrie noch nicht bereit — kurz auf der Seite scrollen und erneut.");
      return;
    }
    setLaeuft(true);
    setStatus("Baue ganze Seite…");
    try {
      const config = await baueEmbedConfig(grafiken, flussVerlauf, {
        bilderInline,
        docH: document.documentElement.scrollHeight,
      });
      /* Runtime laden und INS Dokument bündeln – so läuft die Datei ohne
         separaten wee-embed.js-Upload (dieselbe Quelle wie „Runtime-Script
         herunterladen"). */
      const res = await fetch(EMBED_URL);
      if (!res.ok) throw new Error(`Runtime HTTP ${res.status}`);
      const runtimeJs = await res.text();
      const html = baueSeiteHtml(config, { runtimeJs, embedUrl: EMBED_URL });
      downloadeBlob(new Blob([html], { type: "text/html" }), "wee-seite.html");
      setStatus(
        `Ganze Seite ${formatKb(new Blob([html]).size)} · ${config.grafiken.length} Grafik(en)${flussStatusteil(config)}`,
      );
    } catch (error) {
      setStatus(`Export fehlgeschlagen (${fehlerText(error)})`);
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
          {flussVerlaufGeber && (
            <option value={AKTUELLER_FLUSS}>{`Aktueller Fluss (Editor)`}</option>
          )}
          <option value={KEIN_FLUSS}>{`kein Fluss`}</option>
          {flussNamen.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {flussNamen.length === 0 && !flussVerlaufGeber && (
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

      {/* --- Welle 3c: HTML-Export (ganze Seite ODER einzelnes Element) ---
          Zwei zusätzliche Wege UNTER den drei bestehenden. Beide erzeugen
          fertiges HTML, das ohne die restliche Kette (JSON + Runtime getrennt)
          auskommt. */}
      <div className="gre-regler">
        <div className="gre-regler-kopf">
          <span>{`Einzelnes Element`}</span>
          <HilfeIcon
            label="Einzelnes Element"
            text={`Exportiert NUR die gewählte platzierte Grafik als eigenständiges HTML-Snippet mit ihrer Scroll-Animation – ohne Runtime, ohne Config-Datei. Ideal, um ein einzelnes bewegtes Element in eine bestehende Seite zu setzen.`}
          />
        </div>
        {grafiken.length === 0 ? (
          <div className="gre-leer">
            {`Noch keine Grafik platziert – links im Editor eine Grafik einfügen.`}
          </div>
        ) : (
          <>
            <select
              value={gewaehltesElement}
              onChange={(e) => setGewaehltesElement(e.target.value)}
              aria-label="Grafik für den Element-Export"
            >
              {grafiken.map((g) => (
                <option key={g.id} value={g.id}>
                  {`${g.name} (${g.keyframes.length} KF)`}
                </option>
              ))}
            </select>
            <div className="gre-row">
              <button onClick={() => void elementExportieren()} disabled={laeuft || !gewaehltesElement}>
                {`Element-HTML exportieren`}
              </button>
              <HilfeIcon
                label="Element-HTML exportieren"
                text={`Lädt wee-element-<name>.html herunter – ein selbsttragendes <div> mit der Grafik und ihrer Bewegung als CSS-Scroll-Animation (plus JS-Fallback für ältere Browser). Direkt in den <body> deiner Seite einfügen. "Bilder einbetten" bettet das Bild als Data-URL ein.`}
              />
            </div>
          </>
        )}
      </div>

      <div className="gre-row">
        <button onClick={() => void seiteExportieren()} disabled={laeuft}>
          {`Ganze Seite (HTML)`}
        </button>
        <HilfeIcon
          label="Ganze Seite (HTML)"
          text={`Lädt wee-seite.html herunter – ein komplettes HTML-Dokument, das Overlay, Config und Runtime in EINER Datei bündelt. Datei einfach im Browser öffnen = die Animation läuft auf leerer Seite. Eigenen Inhalt legt man später darunter (s. Anleitung).`}
        />
      </div>

      {status && <div className="gre-status">{status}</div>}

      <GrafikExportAnleitung offen={anleitungOffen} onSchliessen={() => setAnleitungOffen(false)} />
    </>
  );
}
