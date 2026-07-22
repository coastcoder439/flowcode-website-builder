"use client";

/*
 * app/editor/SeitenBereich.tsx — der Seiten-Bereich des vereinheitlichten
 * Editors (Welle 4a, docs/editor-vereinheitlichung.md §9/4a: „alles in einem
 * Programm"). Wird von app/editor/page.tsx gemountet, sobald der
 * Bereichs-Umschalter auf „Seiten" steht.
 *
 * Zwei Ansichten in EINER Flaeche (ersetzt im Seiten-Bereich die Buehne —
 * Landing/Animator-Overlays sind dort NICHT gemountet, Puck bringt sein eigenes
 * Vollbild-UI mit):
 *   1. Verwaltung  — Liste aller Seiten (POST /api/puck-seite/liste),
 *      Neu/Oeffnen/Loeschen. Leerzustand mit Hinweis.
 *   2. Editor      — der bestehende Puck-Editor (Config aus app/puck/puck.config.tsx,
 *      UNVERAENDERT wiederverwendet) mit den geladenen Seiten-Daten.
 *
 * SPEICHER-VERTRAG (lib/api/seiten-speicher.ts, Konflikt-Modell): Beim Oeffnen
 * merken wir uns den `gespeichert`-Stempel als `erwartetGespeichert`. Beim
 * Speichern geht er mit; hat eine andere Session die Datei zwischenzeitlich
 * geaendert, antwortet der Server 409 → sichtbares Konflikt-Banner + „Neu
 * laden" (holt den frischen Stand, montiert Puck neu). Der /puck- und
 * /puck-import-Spike (localStorage) bleibt davon unberuehrt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Puck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { config } from "../puck/puck.config";
import { SeitenImport } from "./SeitenImport";
import "./seiten-bereich.css";

/* ---- API-Vertraege (openapi.yaml / app/api/puck-seite/*) ---- */
interface SeitenInfo {
  name: string;
  gespeichert: string;
  contentAnzahl: number;
}
interface ListeAntwort {
  seiten: SeitenInfo[];
}
interface LadeAntwort {
  name: string;
  gespeichert: string;
  version: number;
  data: Data;
}
interface SpeichereAntwort {
  name: string;
  pfad: string;
  gespeichert: string;
  contentAnzahl: number;
}
interface FehlerAntwort {
  fehler?: string;
}

interface OffeneSeite {
  name: string;
  data: Data;
  /** Der beim Laden bekannte Stand — Konflikt-Guard beim Speichern. */
  erwartetGespeichert: string;
}

type SpeicherStatus = "bereit" | "speichern" | "gespeichert";

/** Einheitlicher JSON-POST an die (same-origin) Autoren-API. Same-origin ⇒ der
 *  Origin-Header passt zum Host, das CSRF-Gate (server-helfer.ts) laesst durch. */
async function postJson<T>(pfad: string, body: unknown): Promise<{ ok: boolean; status: number; json: T | null }> {
  const res = await fetch(pfad, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: T | null = null;
  try {
    json = (await res.json()) as T;
  } catch {
    /* Nicht-JSON-Antwort: json bleibt null, Status reicht den Aufrufern. */
  }
  return { ok: res.ok, status: res.status, json };
}

/** ISO-Zeitstempel → kurze, lesbare deutsche Form; leer/ungueltig → „—". */
function formatiereZeit(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function SeitenBereich() {
  /* Liste + deren Ladezustand */
  const [seiten, setSeiten] = useState<SeitenInfo[]>([]);
  const [listeGeladen, setListeGeladen] = useState(false);
  const [listeFehler, setListeFehler] = useState<string | null>(null);

  /* „Neue Seite"-Formular */
  const [neuName, setNeuName] = useState("");
  const [neuFehler, setNeuFehler] = useState<string | null>(null);
  const [neuLauft, setNeuLauft] = useState(false);

  /* Offene Seite (Puck) */
  const [offeneSeite, setOffeneSeite] = useState<OffeneSeite | null>(null);
  const [speicherStatus, setSpeicherStatus] = useState<SpeicherStatus>("bereit");
  const [konfliktText, setKonfliktText] = useState<string | null>(null);
  const [editorFehler, setEditorFehler] = useState<string | null>(null);
  /* Erhoehen erzwingt Remount von <Puck> (data ist bei Puck nur initial —
     nach „Neu laden" muss der Editor mit frischen Daten neu aufgebaut werden). */
  const [puckKey, setPuckKey] = useState(0);
  /* Immer die aktuellsten Puck-Daten, ohne bei jedem Tastendruck zu rerendern. */
  const aktuelleDatenRef = useRef<Data | null>(null);

  /* Hilfe-Dialog */
  const [hilfeOffen, setHilfeOffen] = useState(false);

  /* Ordner-Import-Assistent (Welle 4b) */
  const [importOffen, setImportOffen] = useState(false);

  const ladeListe = useCallback(async () => {
    setListeFehler(null);
    try {
      const r = await postJson<ListeAntwort>("/api/puck-seite/liste", {});
      if (!r.ok || !r.json) {
        setListeFehler("Seitenliste konnte nicht geladen werden.");
        return;
      }
      setSeiten(r.json.seiten);
    } catch {
      setListeFehler("Server nicht erreichbar (laeuft der Dev-Server?).");
    } finally {
      setListeGeladen(true);
    }
  }, []);

  useEffect(() => {
    void ladeListe();
  }, [ladeListe]);

  /* --- Seite oeffnen (laden → Puck montieren) --- */
  const oeffne = useCallback(async (name: string) => {
    setEditorFehler(null);
    setKonfliktText(null);
    const r = await postJson<LadeAntwort>("/api/puck-seite/lade", { name });
    if (!r.ok || !r.json) {
      const f = (r.json as FehlerAntwort | null)?.fehler;
      setListeFehler(f ?? `Seite „${name}" konnte nicht geladen werden.`);
      return;
    }
    aktuelleDatenRef.current = r.json.data;
    setOffeneSeite({ name: r.json.name, data: r.json.data, erwartetGespeichert: r.json.gespeichert });
    setSpeicherStatus("bereit");
    setPuckKey((k) => k + 1);
  }, []);

  /* --- Speichern (mit Konflikt-Guard) --- */
  const speichere = useCallback(
    async (daten: Data) => {
      const aktuelle = offeneSeite;
      if (!aktuelle) return;
      aktuelleDatenRef.current = daten;
      setEditorFehler(null);
      setSpeicherStatus("speichern");
      const r = await postJson<SpeichereAntwort>("/api/puck-seite/speichere", {
        name: aktuelle.name,
        data: daten,
        erwartetGespeichert: aktuelle.erwartetGespeichert,
      });
      if (r.status === 409) {
        setKonfliktText(
          (r.json as FehlerAntwort | null)?.fehler ??
            "Die Seite wurde von anderer Stelle geaendert.",
        );
        setSpeicherStatus("bereit");
        return;
      }
      if (!r.ok || !r.json) {
        setEditorFehler((r.json as FehlerAntwort | null)?.fehler ?? "Speichern fehlgeschlagen.");
        setSpeicherStatus("bereit");
        return;
      }
      /* Neuen Stand als erwartetGespeichert uebernehmen → Folge-Speichern ok. */
      setOffeneSeite((s) => (s ? { ...s, erwartetGespeichert: r.json!.gespeichert } : s));
      setKonfliktText(null);
      setSpeicherStatus("gespeichert");
    },
    [offeneSeite],
  );

  /* --- Nach Konflikt: frischen Stand holen und Puck neu montieren --- */
  const neuLaden = useCallback(async () => {
    if (!offeneSeite) return;
    const r = await postJson<LadeAntwort>("/api/puck-seite/lade", { name: offeneSeite.name });
    if (!r.ok || !r.json) {
      setEditorFehler("Neu laden fehlgeschlagen.");
      return;
    }
    aktuelleDatenRef.current = r.json.data;
    setOffeneSeite({ name: r.json.name, data: r.json.data, erwartetGespeichert: r.json.gespeichert });
    setKonfliktText(null);
    setSpeicherStatus("bereit");
    setPuckKey((k) => k + 1);
  }, [offeneSeite]);

  /* --- Editor schliessen (zurueck zur Liste) --- */
  const schliesse = useCallback(() => {
    setOffeneSeite(null);
    setKonfliktText(null);
    setEditorFehler(null);
    aktuelleDatenRef.current = null;
    void ladeListe();
  }, [ladeListe]);

  /* --- Neue Seite anlegen --- */
  const legeAn = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = neuName.trim();
      if (!name) {
        setNeuFehler("Bitte einen Namen eingeben.");
        return;
      }
      setNeuFehler(null);
      setNeuLauft(true);
      try {
        const leer: Data = { root: {}, content: [] };
        const r = await postJson<SpeichereAntwort>("/api/puck-seite/speichere", { name, data: leer });
        if (!r.ok || !r.json) {
          setNeuFehler((r.json as FehlerAntwort | null)?.fehler ?? "Anlegen fehlgeschlagen.");
          return;
        }
        setNeuName("");
        await ladeListe();
        await oeffne(r.json.name);
      } finally {
        setNeuLauft(false);
      }
    },
    [neuName, ladeListe, oeffne],
  );

  /* --- Seite loeschen --- */
  const loesche = useCallback(
    async (name: string) => {
      if (!window.confirm(`Seite „${name}" wirklich loeschen? Das laesst sich nicht rueckgaengig machen.`)) {
        return;
      }
      const r = await postJson<{ name: string; geloescht: boolean }>("/api/puck-seite/loesche", { name });
      if (!r.ok) {
        setListeFehler((r.json as FehlerAntwort | null)?.fehler ?? "Loeschen fehlgeschlagen.");
        return;
      }
      if (offeneSeite?.name === name) schliesse();
      void ladeListe();
    },
    [offeneSeite, schliesse, ladeListe],
  );

  /* Editor offen → Puck-Ansicht; sonst Verwaltungs-Ansicht. */
  if (offeneSeite) {
    return (
      <div className="seiten-editor">
        <div className="seiten-editor-kopf">
          <span className="seiten-editor-name">{offeneSeite.name}</span>
          <span
            className={
              "seiten-editor-status" +
              (speicherStatus === "speichern" ? " seiten-editor-status--speichern" : "")
            }
            role="status"
            aria-live="polite"
          >
            {speicherStatus === "speichern"
              ? "Speichert …"
              : speicherStatus === "gespeichert"
                ? "Gespeichert"
                : "Bereit"}
          </span>
          <span className="seiten-editor-aktionen">
            <button
              type="button"
              className="seiten-btn seiten-btn--primaer"
              onClick={() => void speichere(aktuelleDatenRef.current ?? offeneSeite.data)}
              disabled={speicherStatus === "speichern"}
            >
              Speichern
            </button>
            <button type="button" className="seiten-btn" onClick={schliesse}>
              Zurueck zur Liste
            </button>
          </span>
        </div>

        {konfliktText && (
          <div className="seiten-konflikt" role="alert">
            <span>Konflikt: {konfliktText}</span>
            <button type="button" className="seiten-btn" onClick={() => void neuLaden()}>
              Neu laden
            </button>
          </div>
        )}
        {editorFehler && (
          <div className="seiten-konflikt" role="alert">
            <span>{editorFehler}</span>
          </div>
        )}

        <div className="seiten-puck-wrapper">
          <Puck
            key={puckKey}
            config={config}
            data={offeneSeite.data}
            onChange={(d: Data) => {
              aktuelleDatenRef.current = d;
            }}
            onPublish={(d: Data) => void speichere(d)}
          />
        </div>
      </div>
    );
  }

  /* Ordner-Import-Assistent (Welle 4b): eigener Voll-Bereich. Nach dem
     Speichern Liste neu laden und die frische Seite direkt oeffnen. */
  if (importOffen) {
    return (
      <SeitenImport
        onFertig={async (frischerName) => {
          setImportOffen(false);
          await ladeListe();
          await oeffne(frischerName);
        }}
        onAbbruch={() => {
          setImportOffen(false);
          void ladeListe();
        }}
      />
    );
  }

  return (
    <div className="seiten-verwaltung">
      <div className="seiten-verwaltung-innen">
        <div className="seiten-kopf">
          <h1 id="seiten-titel">Seiten</h1>
          <button
            type="button"
            className="seiten-btn"
            onClick={() => setImportOffen(true)}
          >
            Website importieren
          </button>
          <button
            type="button"
            className="seiten-hilfe-icon"
            aria-label="Hilfe zum Seiten-Bereich"
            aria-haspopup="dialog"
            onClick={() => setHilfeOffen(true)}
          >
            ?
          </button>
        </div>

        <form className="seiten-neu" onSubmit={legeAn} aria-label="Neue Seite anlegen">
          <div className="seiten-neu-feld">
            <label htmlFor="seiten-neu-name">Neue Seite — Name</label>
            <input
              id="seiten-neu-name"
              type="text"
              value={neuName}
              onChange={(e) => setNeuName(e.target.value)}
              placeholder="z. B. startseite"
              aria-describedby={neuFehler ? "seiten-neu-fehler" : undefined}
              aria-invalid={neuFehler ? true : undefined}
            />
          </div>
          <button type="submit" className="seiten-btn seiten-btn--primaer" disabled={neuLauft}>
            {neuLauft ? "Legt an …" : "Neu"}
          </button>
          {neuFehler && (
            <span id="seiten-neu-fehler" role="alert" className="seiten-meldung seiten-meldung--fehler">
              {neuFehler}
            </span>
          )}
        </form>

        {listeFehler && (
          <p role="alert" className="seiten-meldung seiten-meldung--fehler">
            {listeFehler}
          </p>
        )}

        {!listeGeladen ? (
          <p className="seiten-leer">Lade Seiten …</p>
        ) : seiten.length === 0 ? (
          <p className="seiten-leer">
            Noch keine Seiten. Lege oben mit „Neu" die erste an — sie oeffnet sich direkt im Editor.
          </p>
        ) : (
          <ul className="seiten-liste" aria-labelledby="seiten-titel">
            {seiten.map((s) => (
              <li key={s.name}>
                <span className="seiten-liste-name">{s.name}</span>
                <span className="seiten-liste-meta">
                  {s.contentAnzahl} {s.contentAnzahl === 1 ? "Baustein" : "Bausteine"} · zuletzt{" "}
                  {formatiereZeit(s.gespeichert)}
                </span>
                <span className="seiten-liste-aktionen">
                  <button
                    type="button"
                    className="seiten-btn"
                    onClick={() => void oeffne(s.name)}
                  >
                    Oeffnen
                  </button>
                  <button
                    type="button"
                    className="seiten-btn seiten-btn--gefahr"
                    onClick={() => void loesche(s.name)}
                    aria-label={`Seite ${s.name} loeschen`}
                  >
                    Loeschen
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hilfeOffen && <SeitenHilfeDialog onClose={() => setHilfeOffen(false)} />}
    </div>
  );
}

/** Hilfe-Dialog (role=dialog, aria-modal): erklaert den Seiten-Bereich und das
 *  Speicher-/Konflikt-Modell. Fokus wandert beim Oeffnen hinein und wird beim
 *  Schliessen auf das ausloesende Element zurueckgegeben (skills/frontend-a11y). */
function SeitenHilfeDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const vorherigerFokusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    vorherigerFokusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      vorherigerFokusRef.current?.focus();
    };
  }, []);

  return (
    <div
      className="seiten-hilfe-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="seiten-hilfe-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seiten-hilfe-titel"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="seiten-hilfe-titel">Was ist der Seiten-Bereich?</h2>
        <p>
          Neben dem Animator (Scroll-Animationen ueber der Landing) verwaltet der Editor hier
          eigenstaendige <strong>Seiten</strong>. Jede Seite wird mit dem Baukasten-Editor (Puck)
          aus Bausteinen zusammengesetzt und als Datei unter <code>seiten/&lt;name&gt;.json</code>{" "}
          gespeichert.
        </p>
        <h3>Anlegen, Oeffnen, Loeschen</h3>
        <p>
          „Neu" legt eine leere Seite an und oeffnet sie direkt. „Oeffnen" laedt eine bestehende
          Seite in den Editor. „Loeschen" entfernt die Datei (mit Rueckfrage, nicht umkehrbar).
        </p>
        <h3>Website importieren</h3>
        <p>
          „Website importieren" liest einen Ordner mit einer statischen Website (index.html +
          Bilder) und zerlegt ihn deterministisch in Bausteine. <strong>Styling und aktive
          Inhalte (Skripte, Rahmen) werden dabei nicht übernommen</strong> — der Import zeigt
          zuerst einen ehrlichen Bericht (was wurde zu was, was wurde entfernt), bevor die Seite
          gespeichert und geöffnet wird. Braucht Chrome oder Edge (File System Access).
        </p>
        <h3>Speichern &amp; Konflikte</h3>
        <p>
          Mit „Speichern" (oder Pucks „Publish"-Knopf) wird der aktuelle Stand geschrieben. Beim
          Oeffnen merkt sich der Editor den Datei-Stand; hat eine andere Sitzung die Seite in der
          Zwischenzeit veraendert, erscheint ein <strong>Konflikt-Hinweis</strong>. „Neu laden" holt
          dann den frischen Stand — damit ueberschreibst du keine fremden Aenderungen versehentlich.
        </p>
        <div className="seiten-hilfe-dialog-fuss">
          <button type="button" className="seiten-btn seiten-btn--primaer" onClick={onClose}>
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}
