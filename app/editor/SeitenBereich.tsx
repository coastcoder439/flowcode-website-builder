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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { Puck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { config } from "../puck/puck.config";
import { SeitenVorschau } from "./SeitenVorschau";
import type { Station, Sub } from "./stationen";
import { entferneAktiveSeite, setzeAktiveSeite, useAktiveSeite } from "@/lib/aktive-seite";
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
  /** Welle 5a: uebernommene Stylesheet-URLs (falls die Seite welche hat). */
  styles?: string[];
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
  /** Welle 5a: uebernommene Stylesheet-URLs — via iframe-Override ins Puck-
   *  Preview-Dokument gehaengt (leer = keine). */
  styles: string[];
}

/** Welle 5a (§10/5a Punkt 3): Der Puck-Editor rendert die Vorschau in einem
 *  iframe (0.22-Default) — der iframe ISOLIERT bereits, daher brauchen die
 *  uebernommenen Seiten-Styles hier KEIN @scope: sie werden schlicht als
 *  <link rel=stylesheet> ins iframe-Dokument gehaengt (Override-Slot `iframe`,
 *  docs/puck-erweiterungsebene.md §2.2). So sieht der Autor die Seite im
 *  Editor mit ihrem echten Look, ohne dass die CSS die Editor-Chrome erreicht. */
function PuckIframeMitStyles({
  children,
  document: iframeDoc,
  styles,
}: {
  children: ReactNode;
  document?: Document;
  styles: string[];
}) {
  const schluessel = styles.join("|");
  useEffect(() => {
    const kopf = iframeDoc?.head;
    if (!kopf) return;
    const eingefuegt: HTMLLinkElement[] = [];
    for (const url of styles) {
      const link = iframeDoc!.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.setAttribute("data-fc-seiten-styles", "");
      kopf.appendChild(link);
      eingefuegt.push(link);
    }
    return () => {
      for (const link of eingefuegt) link.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeDoc, schluessel]);
  return <>{children}</>;
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

interface SeitenBereichProps {
  /** F2: Sub-Zustand aus der Shell (offener Puck / Vorschau) — die EINE
   *  URL-Wahrheit. SeitenBereich fuehrt dazu KEINEN eigenen popstate mehr. */
  sub?: Sub;
  /** F2: zentraler History-Reducer der Shell. Puck-Oeffnen/-Schliessen und
   *  Vorschau laufen hierueber (konsistenter pushState, Dirty-Guard). */
  navigiere?: (ziel: Station, sub?: Sub) => void;
  /** F2: SeitenBereich registriert hier seine Dirty-Pruefung, damit die Shell
   *  beim Verlassen des Puck-Editors rueckfragen kann. */
  istUngespeichertRef?: MutableRefObject<() => boolean>;
}

/** Phase 1/F1 + F2: Seiten-Bereich der Vier-Stationen-Shell. Der Sub-Zustand
 *  (offener Puck-Editor / statische Vorschau) wird von der Shell per Prop
 *  gefuehrt (URL-Wahrheit in ./stationen); dieser Bereich schreibt die History
 *  ausschliesslich ueber den durchgereichten `navigiere()`-Reducer. */
export function SeitenBereich({
  sub = null,
  navigiere,
  istUngespeichertRef,
}: SeitenBereichProps = {}) {
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
  /* Der zuletzt GESPEICHERTE Daten-Stand (beim Laden/Speichern/Neu-Laden
     gesetzt). Dirty = aktuelleDatenRef ≠ gespeicherteDatenRef (F2/N20). */
  const gespeicherteDatenRef = useRef<Data | null>(null);
  /* Spiegel des offenen Seiten-Namens, damit der Sub-Loader-Effekt nicht von
     `offeneSeite` abhaengen muss (verhindert Nachlade-Schleifen). */
  const offeneNameRef = useRef<string | null>(null);

  /* Hilfe-Dialog */
  const [hilfeOffen, setHilfeOffen] = useState(false);

  /* Welle 5b: aktive Website (Default-Buehne des Animators) — hier zum
     Markieren/Setzen je Seite. */
  const aktiveSeite = useAktiveSeite();

  /* F2: Vorschau oeffnen/schliessen laufen ueber den zentralen Reducer der
     Shell. Oeffnen = neuer History-Eintrag (Sub „vorschau"); Schliessen =
     history.back() — das pop-t exakt den Vorschau-Eintrag zurueck, ohne einen
     zusaetzlichen Vorwaerts-Sprung (kein Zustandssprung, N20). */
  const oeffneVorschau = useCallback(
    (name: string) => {
      navigiere?.("bauen", { art: "vorschau", seite: name });
    },
    [navigiere],
  );

  const schliesseVorschau = useCallback(() => {
    window.history.back();
  }, []);

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

  /* --- Puck-Daten fuer eine Seite laden (async) --- */
  const ladePuck = useCallback(
    async (name: string) => {
      setEditorFehler(null);
      setKonfliktText(null);
      const r = await postJson<LadeAntwort>("/api/puck-seite/lade", { name });
      if (!r.ok || !r.json) {
        const f = (r.json as FehlerAntwort | null)?.fehler;
        setListeFehler(f ?? `Seite „${name}" konnte nicht geladen werden.`);
        /* Fehlschlag → Sub aufloesen (zurueck zur Liste), damit die URL nicht
           auf eine nicht ladbare Seite zeigt. */
        navigiere?.("bauen");
        return;
      }
      const daten = r.json.data;
      aktuelleDatenRef.current = daten;
      gespeicherteDatenRef.current = daten; /* frisch geladen = nichts ungespeichert */
      setOffeneSeite({
        name: r.json.name,
        data: daten,
        erwartetGespeichert: r.json.gespeichert,
        styles: Array.isArray(r.json.styles) ? r.json.styles : [],
      });
      setSpeicherStatus("bereit");
      setPuckKey((k) => k + 1);
    },
    [navigiere],
  );

  /* F2: der offene Puck-Editor folgt dem Sub-Zustand aus der Shell (URL-Wahrheit).
     Wird `sub` zu einem Puck fuer eine noch nicht geladene Seite → laden. Faellt
     `sub` vom Puck weg (Liste/Vorschau/Stationswechsel) → offene Seite raeumen und
     die Liste auffrischen. `offeneNameRef` (statt `offeneSeite`) haelt den Effekt
     schlank und schleifenfrei. */
  useEffect(() => {
    if (sub?.art === "puck") {
      if (offeneNameRef.current !== sub.seite) void ladePuck(sub.seite);
    } else if (offeneNameRef.current !== null) {
      setOffeneSeite(null);
      aktuelleDatenRef.current = null;
      gespeicherteDatenRef.current = null;
      setKonfliktText(null);
      setEditorFehler(null);
      void ladeListe();
    }
  }, [sub, ladePuck, ladeListe]);

  /* Namens-Spiegel nachziehen (Loader-Effekt liest ihn statt `offeneSeite`). */
  useEffect(() => {
    offeneNameRef.current = offeneSeite?.name ?? null;
  }, [offeneSeite]);

  /* F2/N20: Dirty-Pruefung bei der Shell registrieren — sie fragt sie beim
     Verlassen des Puck-Editors (Stationswechsel, Browser-Zurueck, Tab-Schliessen)
     ab. „Ungespeichert" = aktuelle Puck-Daten ≠ zuletzt gespeicherter Stand. Der
     Vergleich laeuft nur bei Navigationsversuchen, daher ist JSON.stringify hier
     unkritisch. */
  useEffect(() => {
    if (!istUngespeichertRef) return;
    istUngespeichertRef.current = () => {
      if (offeneNameRef.current === null) return false;
      const a = aktuelleDatenRef.current;
      const g = gespeicherteDatenRef.current;
      if (!a || !g) return false;
      return JSON.stringify(a) !== JSON.stringify(g);
    };
    return () => {
      if (istUngespeichertRef) istUngespeichertRef.current = () => false;
    };
  }, [istUngespeichertRef]);

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
      /* Gespeicherter Stand = die eben geschriebenen Daten → nicht mehr dirty. */
      gespeicherteDatenRef.current = daten;
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
    gespeicherteDatenRef.current = r.json.data; /* frischer Server-Stand = nicht dirty */
    setOffeneSeite({
      name: r.json.name,
      data: r.json.data,
      erwartetGespeichert: r.json.gespeichert,
      styles: Array.isArray(r.json.styles) ? r.json.styles : [],
    });
    setKonfliktText(null);
    setSpeicherStatus("bereit");
    setPuckKey((k) => k + 1);
  }, [offeneSeite]);

  /* --- Editor schliessen (zurueck zur Liste) --- F2: laeuft ueber den zentralen
     Reducer (Dirty-Guard greift dort). Der Sub-Loader raeumt beim Sub-Wechsel die
     offene Seite und laedt die Liste neu. */
  const schliesse = useCallback(() => {
    navigiere?.("bauen");
  }, [navigiere]);

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
        /* F2: Oeffnen laeuft ueber den zentralen Reducer (History-Eintrag +
           URL). Der Sub-Loader-Effekt laedt die frische Seite. */
        navigiere?.("bauen", { art: "puck", seite: r.json.name });
      } finally {
        setNeuLauft(false);
      }
    },
    [neuName, ladeListe, navigiere],
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
      /* Welle 5b: war das die aktive Website, ist sie jetzt weg → vergessen. */
      if (aktiveSeite === name) entferneAktiveSeite();
      if (offeneSeite?.name === name) schliesse();
      void ladeListe();
    },
    [offeneSeite, schliesse, ladeListe, aktiveSeite],
  );

  /* F2: der Sub-Zustand aus der Shell (URL-Wahrheit) bestimmt die Ansicht.
     Statische Vollbild-Vorschau (reload-fest via Query-Param, portalt sich
     chrome-frei ueber alles) hat Vorrang. */
  if (sub?.art === "vorschau") {
    return <SeitenVorschau name={sub.seite} onZurueck={schliesseVorschau} />;
  }

  /* Puck-Sub aktiv: Editor zeigen, sobald die Daten der angeforderten Seite
     geladen sind — bis dahin ein schlichter Lade-Zwischenzustand (der
     Sub-Loader-Effekt holt die Daten). */
  if (sub?.art === "puck") {
    if (!offeneSeite || offeneSeite.name !== sub.seite) {
      return (
        <div className="seiten-editor">
          <div className="seiten-editor-kopf">
            <span className="seiten-editor-name">{sub.seite}</span>
            <span className="seiten-editor-status" role="status" aria-live="polite">
              Lädt …
            </span>
          </div>
          {editorFehler && (
            <div className="seiten-konflikt" role="alert">
              <span>{editorFehler}</span>
            </div>
          )}
        </div>
      );
    }
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
              title={`Aktuellen Stand von „${offeneSeite.name}“ in die Seiten-Datei schreiben`}
            >
              Speichern
            </button>
            <button
              type="button"
              className="seiten-btn"
              onClick={schliesse}
              title="Editor schliessen und zur Seiten-Liste zurueckkehren"
            >
              Zurueck zur Liste
            </button>
          </span>
        </div>

        {konfliktText && (
          <div className="seiten-konflikt" role="alert">
            <span>Konflikt: {konfliktText}</span>
            <button
              type="button"
              className="seiten-btn"
              onClick={() => void neuLaden()}
              title="Frischen Server-Stand holen und den Editor damit neu aufbauen (verwirft nichts auf dem Server)"
            >
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
            overrides={{
              /* Welle 5a: uebernommene Seiten-Styles ins iframe-Preview-Dokument
                 haengen (iframe isoliert → kein @scope noetig, s.
                 PuckIframeMitStyles). */
              iframe: ({ children, document }) => (
                <PuckIframeMitStyles document={document} styles={offeneSeite.styles}>
                  {children}
                </PuckIframeMitStyles>
              ),
            }}
            onChange={(d: Data) => {
              aktuelleDatenRef.current = d;
            }}
            onPublish={(d: Data) => void speichere(d)}
          />
        </div>
      </div>
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
            onClick={() => navigiere?.("import")}
            title="Zur Import-Station wechseln — einen Ordner mit einer fertigen Website einlesen und in Bausteine zerlegen"
          >
            Website importieren
          </button>
          <button
            type="button"
            className="seiten-hilfe-icon"
            aria-label="Hilfe zum Seiten-Bereich"
            aria-haspopup="dialog"
            onClick={() => setHilfeOffen(true)}
            title="Kurzhilfe zum Seiten-Bereich oeffnen"
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
          <button
            type="submit"
            className="seiten-btn seiten-btn--primaer"
            disabled={neuLauft}
            title="Leere Seite mit diesem Namen anlegen und direkt im Editor oeffnen"
          >
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
            {seiten.map((s) => {
              const istAktiv = s.name === aktiveSeite;
              return (
                <li key={s.name} className={istAktiv ? "seiten-liste-aktiv" : undefined}>
                  <span className="seiten-liste-name">
                    {s.name}
                    {istAktiv && (
                      <span
                        className="seiten-aktiv-badge"
                        title="Diese Seite ist die aktive Website — Default-Buehne des Animators"
                      >
                        ★ aktive Website
                      </span>
                    )}
                  </span>
                  <span className="seiten-liste-meta">
                    {s.contentAnzahl} {s.contentAnzahl === 1 ? "Baustein" : "Bausteine"} · zuletzt{" "}
                    {formatiereZeit(s.gespeichert)}
                  </span>
                  <span className="seiten-liste-aktionen">
                    <button
                      type="button"
                      className="seiten-btn"
                      onClick={() => oeffneVorschau(s.name)}
                      title={`Statische Vollbild-Vorschau von „${s.name}“`}
                    >
                      Vorschau
                    </button>
                    <button
                      type="button"
                      className="seiten-btn"
                      onClick={() => navigiere?.("bauen", { art: "puck", seite: s.name })}
                      title={`„${s.name}“ im Baukasten-Editor oeffnen`}
                    >
                      Oeffnen
                    </button>
                    {!istAktiv && (
                      <button
                        type="button"
                        className="seiten-btn"
                        onClick={() => setzeAktiveSeite(s.name)}
                        title={`„${s.name}“ zur aktiven Website machen (Default-Buehne des Animators)`}
                      >
                        Als aktive Website setzen
                      </button>
                    )}
                    <button
                      type="button"
                      className="seiten-btn seiten-btn--gefahr"
                      onClick={() => void loesche(s.name)}
                      aria-label={`Seite ${s.name} loeschen`}
                      title={`Seite „${s.name}“ loeschen`}
                    >
                      Loeschen
                    </button>
                  </span>
                </li>
              );
            })}
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
        <h3>Aktive Website</h3>
        <p>
          Eine Seite ist die <strong>aktive Website</strong> — die echte Seite deines Projekts. Sie
          ist mit <strong>★ aktive Website</strong> markiert und wird im <strong>Animator</strong>{" "}
          automatisch als Bühne geladen (statt der eingebauten WEE-Demo-Landing). Mit „Als aktive
          Website setzen" bestimmst du sie; eine <strong>importierte</strong> Website wird sofort
          aktiv. So ist es dieselbe Seite in drei Sichten: hier in Puck bauen, per „Vorschau"
          statisch ansehen, im Animator anklicken und animieren.
        </p>
        <h3>Vorschau</h3>
        <p>
          „Vorschau" zeigt die Seite als Vollbild — genau so, wie sie später aussieht, ganz ohne
          Editor-Bedienelemente (nur ein „Zurück"-Knopf). Der Link ist teilbar und übersteht ein
          Neuladen.
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
          <button
            type="button"
            className="seiten-btn seiten-btn--primaer"
            onClick={onClose}
            title="Hilfe schliessen"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
}
