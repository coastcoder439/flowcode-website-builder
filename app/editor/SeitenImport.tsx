"use client";

/*
 * app/editor/SeitenImport.tsx — der Ordner-Import-Assistent des Seiten-Bereichs
 * (Welle 4b, docs/editor-vereinheitlichung.md §9/4b: „das letzte was fehlt").
 * Wird von SeitenBereich.tsx eingeblendet, wenn „Website importieren" geklickt
 * wird; nach dem Speichern ruft er onFertig(name) -> Parent oeffnet die Seite
 * direkt im Puck-Editor.
 *
 * IMPORT-ENDLEVEL I6 (M6/M3, lens-import.md §3-Schritt-VI):
 *   - MEHRFACHAUSWAHL statt Einzel-Radio: die Startseite (index.html der Wurzel)
 *     ist Pflicht, Unterseiten sind per Checkbox zuwaehlbar. Jede gewaehlte Seite
 *     wird eine eigene Puck-Seite (Slug: Startseite = <name>, Unterseite =
 *     <name>-<unterpfad>).
 *   - FREEZE-QUALITAET IM UI (E4, Entscheidung E4): ist es eine eigene gebaute
 *     Seite (_next/) und „Freeze" aktiv, reicht der Client die Ordner-Inhalte an
 *     die dev-only-Route POST /api/import/freeze hoch. Der Server rendert die Seite
 *     mit Playwright und liefert den SICHTBAREN Endzustand zurueck (opacity:0-
 *     Entrance-Animationen aufgeloest, M4). Erst DIESE gefrorene HTML wird zerlegt
 *     — statt des rohen, unsichtbaren Markups. Schlaegt der Freeze fehl (Route weg,
 *     Playwright/Chrome fehlt, Ordner zu gross), faellt der Import transparent auf
 *     die rohe HTML zurueck und flaggt das.
 *   - RE-IMPORT VEREINHEITLICHT: existiert ein Ziel-Slug bereits, fragt die UI
 *     „überschreiben?" (statt hartem 409) und speichert dann mit ueberschreibe.
 *   - ASSET-AUFRAEUMUNG: vor dem Neubefuellen wird public/import/<slug>/ REVERSIBEL
 *     geleert (aktion="leeren"), damit Waisen aus einem frueheren Import nicht
 *     liegen bleiben.
 *
 * BEWUSSTE GRENZE (dokumentiert, lens-import.md §3-Schritt-VI): der UI-Weg nutzt
 * das DETERMINISTISCHE Grob-Mapping (htmlZuPuck) auf der gefrorenen HTML. Die
 * gemma4-FEIN-Segmentierung (feine Sektions-Bausteine, I3/I4) bleibt der
 * Skript-Weg `node scripts/import-fein.mjs --alle` (Ollama-gebunden, besser als
 * langer Browser-Roundtrip pro Seite). Der UI-Import gewinnt hier die FREEZE-
 * Qualitaet (der sichtbarste Endlevel-Fix, M4) + Unterseiten + saubere Re-Imports.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Data } from "@puckeditor/core";
import { htmlZuPuck, type ImportFlag, type ImportStatistik } from "@/lib/import/html-zu-puck";
import {
  aufloeseBilderAusOrdner,
  listeHtmlDateien,
  ordnerApiDa,
  sammleImportDateien,
  uebernimmStyles,
  waehleImportOrdner,
} from "@/lib/import/ordner-import";
/* M9/Welle 5a: reine Ordner-Klassifikation (eigenes, node-testbares Modul —
   scripts/tests/ordner-erkennung.test.mjs deckt beide M9-Zweige ab). */
import { hatNextStruktur, istNextQuellordner } from "@/lib/import/ordner-erkennung";
/* I8b/M8: den importierten Ordner direkt als lebendige Animator-Buehne verbinden
   (Service-Worker-Ordnermodus — laesst die Original-Seite MIT ihren Animationen
   laufen). ordnerVerbinden merkt den Handle + stellt ihn bereit; backdropSpeichern
   setzt den Ordner-Modus per Direktpfad-Persistenz (wie der N19-Self-Heal —
   die import-Station hat keinen BackdropProvider, s. app/editor/page.tsx). */
import { ordnerVerbinden, type OrdnerHandle } from "@/components/backdrop/ordner-serve";
import { backdropSpeichern } from "@/components/backdrop/backdrop-store";

interface SeitenImportProps {
  /** Wird nach erfolgreichem Speichern mit dem Seiten-Namen (Startseite)
   *  aufgerufen (Parent laedt die Liste neu und oeffnet die Seite). */
  onFertig: (name: string) => void;
  /** Assistent schliessen (zurueck zur Liste). */
  onAbbruch: () => void;
}

/** Ergebnis der Analyse EINER gewaehlten Seite. */
interface SeitenAnalyse {
  htmlPfad: string;
  /** Seiten-Pfad (".", "bildung", "bildung/aquaponik"). */
  seite: string;
  /** Ziel-Slug (Startseite = Basis-Name, Unterseite = <name>-<unterpfad>). */
  slug: string;
  data: Data;
  statistik: ImportStatistik;
  flags: ImportFlag[];
  styles: string[];
  /** Kam die zerlegte HTML aus dem Server-Freeze (true) oder roh (false)? */
  gefroren: boolean;
}

/** Dateien, die fuer den Server-Freeze NICHT gebraucht werden (Grossmedien) und
 *  den Upload nur aufblaehen — der Freeze fixiert Text-opacity, dafuer reichen
 *  HTML/CSS/JS/Fonts/kleine Bilder. Fehlende Videos brechen den Render nicht. */
const FREEZE_SKIP = /\.(mp4|webm|mov|avi|mkv|pdf|zip|heic|heif|mp3|wav|m4a|ogg|ogv)$/i;

/** Client-seitiger Slug — der Server saeubert final (saubererName). */
function slugify(roh: string): string {
  return roh
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

/** HTML-Datei-Pfad → Seiten-Pfad: "index.html" → "."; "bildung/index.html"
 *  → "bildung"; sonst der Pfad ohne Endung. */
function seiteVonHtmlPfad(pfad: string): string {
  const ohneIndex = pfad.replace(/(^|\/)index\.html?$/i, "");
  if (ohneIndex === "" || pfad === ohneIndex + "index.html") {
    return ohneIndex === "" ? "." : ohneIndex;
  }
  return pfad.replace(/\.html?$/i, "");
}

/** Ziel-Slug: Startseite → Basis-Name; Unterseite → „<basis>-<unterpfad>". */
function slugVonSeite(basis: string, seite: string): string {
  if (seite === ".") return basis;
  return `${basis}-${seite.replace(/\//g, "-")}`;
}

/** File → data-URL (base64), fuer den Freeze-Upload. */
function alsDataUrl(datei: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leser = new FileReader();
    leser.onload = () => resolve(leser.result as string);
    leser.onerror = () => reject(leser.error ?? new Error("Lesefehler"));
    leser.readAsDataURL(datei);
  });
}

export function SeitenImport({ onFertig, onAbbruch }: SeitenImportProps) {
  const [dateien, setDateien] = useState<Map<string, File> | null>(null);
  const [htmlDateien, setHtmlDateien] = useState<string[]>([]);
  /* I6: Mehrfachauswahl (Set der gewaehlten HTML-Pfade). Die Startseite ist
     Pflicht und immer enthalten (s. startseite). */
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const [name, setName] = useState<string>("");
  const [analysen, setAnalysen] = useState<SeitenAnalyse[] | null>(null);
  /** Konflikt-Slugs (existieren bereits) — Überschreiben-Rueckfrage. */
  const [konflikte, setKonflikte] = useState<string[] | null>(null);

  const [status, setStatus] = useState<string>("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [styleUebernehmen, setStyleUebernehmen] = useState(false);
  /** E4: Server-Freeze (Playwright) fuer Endzustands-Qualitaet im UI. */
  const [freezeAktiv, setFreezeAktiv] = useState(false);
  /** I8b/M8: nach dem Speichern den gewaehlten Ordner direkt als lebendige
   *  Animator-Buehne verbinden (Default AN). Nur mit Ordner-Handle + Chrome/Edge
   *  wirksam — der Freeze/die Puck-Zerlegung laufen unabhaengig davon. */
  const [alsBuehneVerbinden, setAlsBuehneVerbinden] = useState(true);
  /** N1: Kurzhilfe-Dialog (gleiches Muster wie die Seiten-Liste). */
  const [hilfeOffen, setHilfeOffen] = useState(false);
  const handleRef = useRef<OrdnerHandle | null>(null);

  /* Die Startseite = erste gelistete HTML (listeHtmlDateien sortiert index.html
     nach oben). Sie ist Pflicht. */
  const startseite = htmlDateien[0] ?? "";

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
        /* M9: Quellcode-Ordner (ungebautes Next-Projekt) vs. website-freier
           Ordner unterscheiden — der erste Fall braucht eine klare Anweisung. */
        if (istNextQuellordner(map)) {
          setFehler(
            "Das ist ein Quellcode-Ordner — erst bauen (npm run build), dann den out/-Ordner wählen.",
          );
        } else {
          setFehler("Im Ordner wurde keine HTML-Datei gefunden.");
        }
        setStatus("");
        return;
      }
      handleRef.current = handle;
      setDateien(map);
      setHtmlDateien(html);
      setGewaehlt(new Set([html[0]])); // Startseite vorgewaehlt (Pflicht)
      setAnalysen(null);
      setKonflikte(null);
      const eigeneSeite = hatNextStruktur(map);
      setStyleUebernehmen(eigeneSeite);
      setFreezeAktiv(eigeneSeite);
      setName((n) => n || slugify(handle!.name));
      setStatus(
        `${map.size} Datei${map.size === 1 ? "" : "en"} gelesen, ${html.length} HTML-Datei${html.length === 1 ? "" : "en"}` +
          (eigeneSeite ? " · eigene gebaute Seite erkannt (Styles + Freeze vorgeschlagen)." : "."),
      );
    } catch {
      setFehler("Ordner konnte nicht gelesen werden.");
      setStatus("");
    } finally {
      setLaeuft(false);
    }
  };

  /** Eine HTML-Datei an-/abwaehlen (Startseite bleibt immer an). */
  const toggleSeite = (pfad: string) => {
    if (pfad === startseite) return; // Pflicht
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (neu.has(pfad)) neu.delete(pfad);
      else neu.add(pfad);
      return neu;
    });
    setAnalysen(null);
    setKonflikte(null);
  };

  /** Baut die Freeze-Upload-Liste (ohne Grossmedien) aus dem Ordner. */
  const baueFreezeDateien = async (map: Map<string, File>): Promise<{ pfad: string; dataUrl: string }[]> => {
    const out: { pfad: string; dataUrl: string }[] = [];
    for (const [pfad, datei] of map) {
      if (FREEZE_SKIP.test(pfad)) continue;
      out.push({ pfad, dataUrl: await alsDataUrl(datei) });
    }
    return out;
  };

  /** Holt fuer die gewaehlten Seiten die gefrorene HTML vom Server (E4).
   *  Gibt eine Map „seite -> HTML" zurueck; leer, wenn Freeze aus/fehlgeschlagen. */
  const holeFreeze = async (map: Map<string, File>, seiten: string[]): Promise<Map<string, string>> => {
    const ergebnis = new Map<string, string>();
    try {
      const freezeDateien = await baueFreezeDateien(map);
      const res = await fetch("/api/import/freeze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateien: freezeDateien, seiten }),
      });
      if (!res.ok) return ergebnis; // Route weg / Fehler → roher Fallback
      const json = (await res.json()) as {
        seiten?: { seite: string; ok: boolean; html?: string }[];
      };
      for (const s of json.seiten ?? []) {
        if (s.ok && typeof s.html === "string") ergebnis.set(s.seite, s.html);
      }
    } catch {
      /* Netz/Parse-Fehler → roher Fallback (keine Exception nach aussen). */
    }
    return ergebnis;
  };

  /** Leert den Asset-Ordner eines Slugs reversibel (vor dem Neubefuellen). */
  const leereAssets = async (slug: string): Promise<number> => {
    try {
      const res = await fetch("/api/import/asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktion: "leeren", slug }),
      });
      if (!res.ok) return 0;
      const json = (await res.json()) as { dateien?: number };
      return typeof json.dateien === "number" ? json.dateien : 0;
    } catch {
      return 0;
    }
  };

  /* --- Schritt 3: Analysieren (Freeze → Zerlegung → Assets, je Seite) --- */
  const analysiere = async () => {
    setFehler(null);
    setKonflikte(null);
    const basis = slugify(name);
    if (!basis) {
      setFehler("Bitte einen Namen für die Seite eingeben.");
      return;
    }
    if (!dateien) return;
    const gewaehlteListe = htmlDateien.filter((p) => gewaehlt.has(p));
    if (gewaehlteListe.length === 0) return;

    setLaeuft(true);
    setStatus("Analysiere …");
    try {
      const seitenPfade = gewaehlteListe.map(seiteVonHtmlPfad);

      /* E4: gefrorene HTML fuer alle gewaehlten Seiten in EINEM Upload holen. */
      let freezeMap = new Map<string, string>();
      if (freezeAktiv) {
        setStatus("Server-Freeze (Seite wird gerendert) …");
        freezeMap = await holeFreeze(dateien, seitenPfade);
      }

      const ergebnisse: SeitenAnalyse[] = [];
      for (const htmlPfad of gewaehlteListe) {
        const seite = seiteVonHtmlPfad(htmlPfad);
        const slug = slugVonSeite(basis, seite);
        setStatus(`Zerlege „${seite === "." ? "Startseite" : seite}" …`);

        /* I6: Asset-Ordner ZUERST leeren (Waisen), dann frisch befuellen. */
        const geleert = await leereAssets(slug);

        const gefrorene = freezeMap.get(seite);
        const gefroren = typeof gefrorene === "string";
        const roh = gefroren ? gefrorene! : await dateien.get(htmlPfad)!.text();

        const bericht = htmlZuPuck(roh, { idPraefix: slug, styleUebernehmen });
        const { data, flags } = await aufloeseBilderAusOrdner(bericht, dateien, slug);

        let styles: string[] = [];
        let stilFlags: ImportFlag[] = [];
        if (styleUebernehmen) {
          const uebernahme = await uebernimmStyles(bericht, dateien, slug);
          styles = uebernahme.styles;
          stilFlags = uebernahme.flags;
        }

        const seitenFlags: ImportFlag[] = [...bericht.flags, ...flags, ...stilFlags];
        if (freezeAktiv && !gefroren) {
          seitenFlags.unshift({
            grund: "Freeze übersprungen (roh importiert)",
            detail: "Server-Freeze lieferte kein Ergebnis — rohe HTML zerlegt.",
          });
        }
        if (geleert > 0) {
          seitenFlags.unshift({
            grund: "Alte Assets aufgeräumt",
            detail: `${geleert} Eintrag/Einträge in den Papierkorb verschoben.`,
          });
        }

        ergebnisse.push({ htmlPfad, seite, slug, data, statistik: bericht.statistik, flags: seitenFlags, styles, gefroren });
      }

      setAnalysen(ergebnisse);
      const gefrorenAnzahl = ergebnisse.filter((e) => e.gefroren).length;
      setStatus(
        `Analyse fertig — ${ergebnisse.length} Seite(n)` +
          (freezeAktiv ? `, ${gefrorenAnzahl} eingefroren` : "") +
          ". Bericht prüfen, dann speichern.",
      );
    } catch {
      setFehler("Analyse fehlgeschlagen.");
      setStatus("");
    } finally {
      setLaeuft(false);
    }
  };

  /* --- Schritt 5: Als Seite(n) speichern --- */
  const speichere = async (ueberschreibe: boolean) => {
    if (!analysen || analysen.length === 0) return;
    setSpeichert(true);
    setFehler(null);
    setKonflikte(null);
    try {
      /* Re-Import-Vereinheitlichung: existierende Slugs ermitteln → Rueckfrage
         statt hartem 409. */
      if (!ueberschreibe) {
        const res = await fetch("/api/puck-seite/liste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const json = (await res.json().catch(() => null)) as { seiten?: { name: string }[] } | null;
        const vorhanden = new Set((json?.seiten ?? []).map((s) => s.name));
        const kollisionen = analysen.filter((a) => vorhanden.has(a.slug)).map((a) => a.slug);
        if (kollisionen.length > 0) {
          setKonflikte(kollisionen);
          setSpeichert(false);
          return; // wartet auf „Überschreiben"-Bestaetigung
        }
      }

      let gespeichert = 0;
      for (const a of analysen) {
        const res = await fetch("/api/puck-seite/speichere", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: a.slug,
            data: a.data,
            ...(ueberschreibe ? { ueberschreibe: true } : {}),
            ...(a.styles.length > 0 ? { styles: a.styles } : {}),
          }),
        });
        const json = (await res.json().catch(() => null)) as { name?: string; fehler?: string } | null;
        if (res.status === 409) {
          /* Wettlauf: Seite entstand zwischen Check und Save → Rueckfrage. */
          setKonflikte([a.slug]);
          setSpeichert(false);
          return;
        }
        if (!res.ok || !json?.name) {
          setFehler(`„${a.slug}": ${json?.fehler ?? "Speichern fehlgeschlagen."}`);
          setSpeichert(false);
          return;
        }
        gespeichert++;
      }

      /* I8b/M8: den gewaehlten Ordner auf Wunsch direkt als lebendige Animator-
         Buehne verbinden. Der Service-Worker-Ordnermodus (ordner-serve.ts) laesst
         die Original-Seite MIT ihren eigenen Animationen laufen — anders als die
         eingefrorene buehne.html-Fassung, die JS-Entrance-Animationen nicht erneut
         abspielt (buehne-schreiben.mjs, „EHRLICHE GRENZE"). handleRef traegt den
         beim Ordnerwaehlen gepickten Handle. Best-effort: der Import ist bereits
         gespeichert; scheitert das Verbinden (kein Handle, Zugriff entzogen, kein
         Service Worker), faellt der Animator auf die eingefrorene Buehne zurueck. */
      const handle = handleRef.current;
      if (alsBuehneVerbinden && handle && ordnerApiDa()) {
        try {
          await ordnerVerbinden(handle);
          await backdropSpeichern({ art: "ordner", quelle: handle.name, name: handle.name });
        } catch {
          /* Verbinden ist best-effort — s. Kommentar oben. */
        }
      }

      /* Startseite (erste Analyse) im Puck oeffnen. */
      onFertig(analysen[0].slug);
    } catch {
      setFehler("Server nicht erreichbar.");
      setSpeichert(false);
    }
  };

  const gesamtStatistik = useMemo(() => {
    if (!analysen) return null;
    return analysen.reduce(
      (acc, a) => ({
        sektionen: acc.sektionen + a.statistik.sektionen,
        texte: acc.texte + a.statistik.texte,
        bilder: acc.bilder + a.statistik.bilder,
        htmlBloecke: acc.htmlBloecke + a.statistik.htmlBloecke,
        styles: acc.styles + a.styles.length,
      }),
      { sektionen: 0, texte: 0, bilder: 0, htmlBloecke: 0, styles: 0 },
    );
  }, [analysen]);

  return (
    <div className="seiten-verwaltung">
      <div className="seiten-verwaltung-innen">
        <div className="seiten-kopf">
          <h1 id="seiten-import-titel">Website importieren</h1>
          <button
            type="button"
            className="seiten-btn"
            onClick={onAbbruch}
            title="Import abbrechen und zur Seiten-Liste zurueckkehren"
          >
            Zurück zur Liste
          </button>
          {/* N1: „?"-Hilfe-Icon — gleiches Muster wie im Seiten-Bereich
              (seiten-hilfe-icon liegt per margin-left:auto rechts). */}
          <button
            type="button"
            className="seiten-hilfe-icon"
            aria-label="Hilfe zum Website-Import"
            aria-haspopup="dialog"
            onClick={() => setHilfeOffen(true)}
            title="Kurzhilfe zum Website-Import oeffnen"
          >
            ?
          </button>
        </div>

        <p className="seiten-import-hinweis">
          Wählt einen Ordner mit einer statischen Website (index.html + Bilder). Startseite und
          gewählte Unterseiten werden je zu einer eigenen Seite zerlegt. Bei eigenen gebauten
          Seiten rendert der Server die Seite vor dem Zerlegen (<strong>Freeze</strong>), damit
          Einblend-Animationen nicht als unsichtbarer Zustand hängen bleiben.
        </p>

        {/* Schritt 1 */}
        <div className="seiten-import-schritt">
          <button
            type="button"
            className="seiten-btn seiten-btn--primaer"
            onClick={() => void waehleOrdner()}
            disabled={laeuft || speichert}
            title="Ordner mit der Website waehlen (Chrome/Edge) und die HTML-Dateien einlesen"
          >
            📁 Ordner wählen
          </button>
        </div>

        {/* Schritt 2 + 3: Seiten (Mehrfachauswahl) + Name + Analysieren */}
        {htmlDateien.length > 0 && (
          <>
            <fieldset className="seiten-import-dateien">
              <legend>Seiten importieren (Startseite ist Pflicht)</legend>
              {htmlDateien.map((pfad) => {
                const istStart = pfad === startseite;
                return (
                  <label key={pfad} className="seiten-import-datei">
                    <input
                      type="checkbox"
                      checked={gewaehlt.has(pfad)}
                      disabled={istStart}
                      onChange={() => toggleSeite(pfad)}
                    />
                    <span>
                      {pfad}
                      {istStart && <em className="seiten-import-pflicht"> — Startseite</em>}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div className="seiten-neu">
              <div className="seiten-neu-feld">
                <label htmlFor="seiten-import-name">Seiten-Name (Basis-Slug)</label>
                <input
                  id="seiten-import-name"
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setAnalysen(null);
                    setKonflikte(null);
                  }}
                  placeholder="z. B. meine-website"
                />
              </div>
              <button
                type="button"
                className="seiten-btn seiten-btn--primaer"
                onClick={() => void analysiere()}
                disabled={laeuft || speichert}
                title="Gewählte Seiten zerlegen und den Import-Bericht erzeugen"
              >
                {laeuft ? "Analysiert …" : "Analysieren"}
              </button>
            </div>

            {/* Freeze-Schalter (E4) */}
            <label className="seiten-import-style-schalter">
              <input
                type="checkbox"
                checked={freezeAktiv}
                onChange={(e) => {
                  setFreezeAktiv(e.target.checked);
                  setAnalysen(null);
                }}
              />
              <span>
                <strong>Server-Freeze</strong> (empfohlen für eigene Seiten): der Server rendert
                die Seite und liefert den sichtbaren Endzustand — Einblend-Texte fehlen dann nicht.
                Braucht den laufenden Dev-Server; schlägt er fehl, wird roh importiert.
              </span>
            </label>

            {/* Welle 5a: Styles-Uebernahme-Schalter */}
            <label className="seiten-import-style-schalter">
              <input
                type="checkbox"
                checked={styleUebernehmen}
                onChange={(e) => {
                  setStyleUebernehmen(e.target.checked);
                  setAnalysen(null);
                }}
              />
              <span>
                Styles der Seite übernehmen (eigene Seite) — kopiert die CSS-Dateien und bindet sie
                gescoped auf die Bühne ein. Nur für <strong>selbst gebaute</strong> Seiten sinnvoll.
              </span>
            </label>

            {/* I8b/M8: Ordner als lebendige Animator-Bühne verbinden */}
            <label className="seiten-import-style-schalter">
              <input
                type="checkbox"
                checked={alsBuehneVerbinden}
                onChange={(e) => setAlsBuehneVerbinden(e.target.checked)}
              />
              <span>
                <strong>Als lebendige Animator-Bühne verbinden</strong> (empfohlen): der gewählte
                Ordner wird nach dem Speichern direkt als Bühne des Animators verbunden — die
                Original-Seite läuft dort <strong>mit ihren eigenen Animationen</strong>
                (Service-Worker-Ordnermodus). Ohne diese Option zeigt der Animator die
                eingefrorene Fassung (Endzustand, ohne erneute Einblend-Animationen). Braucht
                Chrome/Edge und den erlaubten Ordnerzugriff.
              </span>
            </label>
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

        {/* Konflikt-Rueckfrage (Re-Import) */}
        {konflikte && konflikte.length > 0 && (
          <div className="seiten-import-bericht" role="alert">
            <h3>Seite(n) existieren bereits</h3>
            <p>
              Diese Seiten gibt es schon: <strong>{konflikte.join(", ")}</strong>. Überschreiben?
            </p>
            <div className="seiten-import-aktionen">
              <button
                type="button"
                className="seiten-btn seiten-btn--primaer"
                onClick={() => void speichere(true)}
                disabled={speichert}
                title="Bestehende Seite(n) mit dem Import überschreiben"
              >
                {speichert ? "Speichert …" : "Überschreiben"}
              </button>
              <button
                type="button"
                className="seiten-btn"
                onClick={() => setKonflikte(null)}
                disabled={speichert}
                title="Nicht überschreiben — anderen Namen wählen"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {/* Schritt 4: Bericht (Summe + je Seite) */}
        {analysen && gesamtStatistik && (
          <div className="seiten-import-bericht">
            <h2>Import-Bericht — {analysen.length} Seite(n)</h2>
            <ul className="seiten-import-statistik">
              <li><b>{gesamtStatistik.sektionen}</b> Sektionen</li>
              <li><b>{gesamtStatistik.texte}</b> Texte</li>
              <li><b>{gesamtStatistik.bilder}</b> Bilder</li>
              <li><b>{gesamtStatistik.htmlBloecke}</b> HTML-Blöcke</li>
              <li><b>{gesamtStatistik.styles}</b> Styles</li>
            </ul>

            {analysen.map((a) => (
              <div key={a.slug} className="seiten-import-seite">
                <h3>
                  {a.seite === "." ? "Startseite" : a.seite} → <code>{a.slug}</code>{" "}
                  {a.gefroren ? <span title="Server-Freeze angewandt">❄ eingefroren</span> : <span>roh</span>}
                </h3>
                <p className="seiten-import-seite-stat">
                  {a.statistik.sektionen} Sektionen · {a.statistik.texte} Texte · {a.statistik.bilder} Bilder ·{" "}
                  {a.statistik.htmlBloecke} HTML-Blöcke · {a.styles.length} Styles
                </p>
                {a.flags.length > 0 && (
                  <details className="seiten-import-flags">
                    <summary>Nicht übernommen / Hinweise ({a.flags.length})</summary>
                    <ul>
                      {a.flags.map((f, i) => (
                        <li key={`${f.grund}-${i}`}>
                          <span className="seiten-import-flag-grund">{f.grund}</span>
                          <span className="seiten-import-flag-detail">{f.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}

            <div className="seiten-import-aktionen">
              <button
                type="button"
                className="seiten-btn seiten-btn--primaer"
                onClick={() => void speichere(false)}
                disabled={speichert}
                title="Zerlegte Seite(n) speichern und die Startseite im Editor oeffnen"
              >
                {speichert ? "Speichert …" : `Als Seite(n) speichern (${analysen.length})`}
              </button>
              <button
                type="button"
                className="seiten-btn"
                onClick={onAbbruch}
                disabled={speichert}
                title="Import verwerfen und zur Seiten-Liste zurueckkehren"
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}
      </div>

      {hilfeOffen && <ImportHilfeDialog onClose={() => setHilfeOffen(false)} />}
    </div>
  );
}

/** N1: Kurzhilfe zum Website-Import (role=dialog, aria-modal) — baut auf demselben
 *  Muster wie SeitenHilfeDialog im Seiten-Bereich auf (gleiche CSS-Klassen
 *  seiten-hilfe-overlay/-dialog, gleiches Fokus-Handling: Fokus wandert beim
 *  Oeffnen in den Dialog und kehrt beim Schliessen auf das ausloesende Icon
 *  zurueck; skills/frontend-a11y). Inhalt: Ordnerwahl, Import-Ablauf,
 *  Mehrfachauswahl, Styling-Hinweis. */
function ImportHilfeDialog({ onClose }: { onClose: () => void }) {
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
        aria-labelledby="seiten-import-hilfe-titel"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="seiten-import-hilfe-titel">Website importieren — kurz erklärt</h2>
        <h3>Ordner wählen</h3>
        <p>
          „📁 Ordner wählen" öffnet einen fertigen Website-Ordner (statische Seite:{" "}
          <code>index.html</code> + Bilder + Stylesheets). Braucht <strong>Chrome</strong> oder{" "}
          <strong>Edge</strong> (File System Access). Ist es eine selbst gebaute Seite, wähle den
          <strong> gebauten</strong> <code>out/</code>-Ordner — nicht den Quellcode.
        </p>
        <h3>Was beim Import passiert</h3>
        <p>
          Jede gewählte Seite wird deterministisch in Bausteine zerlegt. Zuerst siehst du einen
          ehrlichen <strong>Bericht</strong> (was wurde zu Sektionen/Texten/Bildern, was wurde nicht
          übernommen), erst danach wird gespeichert und die Startseite im Editor geöffnet. Bei einer
          eigenen gebauten Seite rendert der Server sie vorher (<strong>Freeze</strong>), damit
          Einblend-Animationen nicht als unsichtbarer Zustand hängen bleiben.
        </p>
        <h3>Mehrere Seiten auf einmal</h3>
        <p>
          Die <strong>Startseite ist Pflicht</strong> und immer angehakt; jede weitere Unterseite
          hakst du zusätzlich an. Jede wird eine eigene Seite (Startseite = dein Basis-Name,
          Unterseite = <code>&lt;name&gt;-&lt;unterpfad&gt;</code>). Existiert ein Name schon, fragt
          der Import vor dem Überschreiben nach.
        </p>
        <h3>Styling</h3>
        <p>
          <strong>Styles übernehmen</strong> kopiert die CSS-Dateien der Seite und bindet sie
          gescoped auf die Bühne ein — nur für <strong>selbst gebaute</strong> Seiten sinnvoll. Ohne
          diese Option kommen nur die Inhalte (Struktur, Texte, Bilder), nicht das Aussehen.
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
