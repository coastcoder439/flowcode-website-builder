"use client";

/*
 * app/editor/Station4ExportPanel.tsx — das ausklappbare Export-Fenster der
 * Station 4 (X4). Spec: docs/plan-analyse/lens-preview-export.md §3-S4/S5,
 * maengelliste-final.md M25 (Ordner-Struktur-Export = Kernweg, die 5 Datei-/
 * Embed-Wege bleiben sekundaer — NICHTS entfernt).
 *
 * PRIMAER: „Als Ordner exportieren" — greift die ganze aktive Website ab
 * (ExportSammler/X3, ganze Website E5), reichert sie an (export-vorbereitung),
 * baut das Ordner-Artefakt (ordner-export/X1, Modus „ordner") und schreibt es
 * ueber POST /api/export/ordner (X2) nach export/<slug>/. Zeigt Fortschritt,
 * Ziel-Pfad und einen ehrlichen Bericht (N Seiten, N Assets, Rest-Warnungen).
 *
 * SEKUNDAER: die fuenf bestehenden Datei-/Embed-Wege — hier durch WIEDERVERWENDUNG
 * der unveraenderten GrafikExportPanel-Komponente (JSON, Overlay-HTML, Runtime,
 * Element-HTML, Ganze-Seite-HTML). Sie wird mit den Grafiken UND dem Markup der
 * GERADE in der Vorschau gewaehlten Seite gefuettert. Bewusst eingeklappt (details),
 * damit der Ordner-Weg der klare Default bleibt.
 *
 * CAVEAT (dokumentiert, nicht behoben): GrafikExportPanel liest seinen docH live
 * aus document.documentElement.scrollHeight — in Station 4 ist das die
 * Shell-Hoehe, nicht die Seiten-Hoehe. Der PRIMAERE Ordner-Weg umgeht das (er
 * liefert bewusst keinen grafikenDocH, s. export-vorbereitung). Der sekundaere
 * „Ganze Seite (HTML)"-Download traegt daher denselben live-docH wie im Animator
 * (unveraendertes Verhalten) — fuer eine byte-genaue Einzeldatei besser aus dem
 * Animator exportieren.
 */

import { useState } from "react";
import { GrafikExportPanel } from "@/components/grafik/GrafikExportPanel";
import type { Grafik } from "@/components/grafik/grafik-types";
import { baueOrdnerArtefakt } from "@/components/embed/ordner-export";
import { reichereZuOrdnerSeiten } from "./export-vorbereitung";
import { useExportSammler } from "./ExportSammler";
import "@/components/grafik/grafik-editor.css";

interface Station4ExportPanelProps {
  /** Aktive Website = Basis-Seitenname → Ziel-Slug des Ordner-Exports. */
  aktiveSeite: string;
  /** Grafiken der GERADE gewaehlten Vorschau-Seite (fuer den sekundaeren Panel). */
  chosenGrafiken: Grafik[];
  /** Markup der gewaehlten Seite (Puck-Fusion im sekundaeren „Ganze Seite"-Weg). */
  chosenMarkup: string | null;
  /** Nach erfolgreichem Ordner-Export: dem Aufrufer den Slug melden, damit der
   *  Vorschau-Umschalter das frische On-Disk-Artefakt anbieten kann. */
  onExportFertig?: (slug: string) => void;
}

/** Ergebnis-Bericht eines Ordner-Exports (rein fuer die Anzeige). */
interface OrdnerBericht {
  ordner: string;
  seiten: number;
  assets: number;
  css: number;
  dateien: number;
  /** Seiten, die beim Abgriff scheiterten (Import-Luecken sichtbar machen). */
  warnungen: { seite: string; grund: string }[];
  /** Nicht aufloesbare Referenzen im Ordner-Artefakt — aus
   *  baueOrdnerArtefakt().warnungen: relative lokale Asset-Pfade OHNE Ziel UND
   *  interne Navigations-Links (<a href>) auf nicht-importierte Seiten. Getrennt
   *  von den Seiten-Skips, weil es eine andere Fehlerklasse ist (einzelne tote
   *  Links statt ganze Seite). */
  refWarnungen: { seite: string; roh: string; grund: string }[];
}

function fehlerText(e: unknown): string {
  return e instanceof Error ? e.message : "unbekannter Fehler";
}

export function Station4ExportPanel({
  aktiveSeite,
  chosenGrafiken,
  chosenMarkup,
  onExportFertig,
}: Station4ExportPanelProps) {
  const { sammle, laeuft, fortschritt } = useExportSammler();
  /* Eigener „laeuft" fuer die Anreicherungs-/Schreib-Phasen NACH dem Abgriff
     (der Hook-`laeuft` deckt nur das Sammeln ab). */
  const [schreibt, setSchreibt] = useState(false);
  const [status, setStatus] = useState("");
  const [bericht, setBericht] = useState<OrdnerBericht | null>(null);

  const beschaeftigt = laeuft || schreibt;

  const exportiereOrdner = async () => {
    setBericht(null);
    setStatus("Seiten der Website abgreifen…");
    try {
      /* 1 · ganze aktive Website abgreifen (Teilbericht bei kaputten Seiten). */
      const { seiten, bericht: sammelBericht } = await sammle(aktiveSeite);
      if (seiten.length === 0) {
        const grund = sammelBericht.fehler[0]?.grund ?? "Keine Seiten gefunden";
        setStatus(`Export abgebrochen: ${grund}`);
        return;
      }

      setSchreibt(true);
      setStatus(`Baue Ordner-Artefakt (${seiten.length} Seite(n))…`);
      /* 2 · anreichern (Runtime/Config/CSS) + Ordner-Artefakt bauen. Bilder NICHT
         inline: der Ordner-Weg lagert Projekt-Assets nach assets/ aus. */
      const ordnerSeiten = await reichereZuOrdnerSeiten(seiten, { bilderInline: false });
      const artefakt = baueOrdnerArtefakt(ordnerSeiten, "ordner");

      setStatus("Schreibe Ordner auf die Platte…");
      /* 3 · Schreib-Route (X2). */
      const res = await fetch("/api/export/ordner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        /* spiegel:true schreibt zusaetzlich public/export/<slug>/, damit der
           Vorschau-Umschalter „Ordner-Artefakt" das echte On-Disk-Ergebnis
           statisch (/export/<slug>/…) laden kann. Deploy-Rohbau bleibt export/.
           leeren:true = Clean-Write: den Ziel-Ordner vor dem Schreiben leeren,
           damit Altlasten eines frueheren Exports (verwaiste Assets, geloeschte
           Seiten) nicht akkumulieren — der Bericht zaehlt sonst weniger Dateien,
           als real auf der Platte liegen. */
        body: JSON.stringify({ slug: aktiveSeite, dateien: artefakt.dateien, spiegel: true, leeren: true }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ordner?: string; anzahl?: number; fehler?: string }
        | null;
      if (!res.ok) throw new Error(json?.fehler ?? `Schreiben fehlgeschlagen (HTTP ${res.status})`);

      /* 4 · Bericht aus dem gebauten Artefakt (deterministisch) + Teilbericht. */
      const assets = artefakt.dateien.filter((d) => d.pfad.startsWith("assets/")).length;
      const css = artefakt.dateien.filter((d) => d.pfad.startsWith("css/")).length;
      setBericht({
        ordner: json?.ordner ?? `export/${aktiveSeite}`,
        seiten: ordnerSeiten.length,
        assets,
        css,
        dateien: json?.anzahl ?? artefakt.dateien.length,
        warnungen: sammelBericht.fehler,
        refWarnungen: artefakt.warnungen.map((w) => ({ seite: w.seite, roh: w.roh, grund: w.grund })),
      });
      setStatus("");
      onExportFertig?.(aktiveSeite);
    } catch (e) {
      setStatus(`Ordner-Export fehlgeschlagen (${fehlerText(e)})`);
    } finally {
      setSchreibt(false);
    }
  };

  return (
    <div className="s4-export">
      <div className="s4-export-primaer">
        <button
          type="button"
          className="seiten-btn seiten-btn--primaer"
          onClick={() => void exportiereOrdner()}
          disabled={beschaeftigt}
          title="Die ganze aktive Website als deploybaren Ordner nach export/<name>/ schreiben"
        >
          {beschaeftigt ? "Exportiere…" : "Als Ordner exportieren"}
        </button>
        <p className="s4-export-erklaerung">
          Schreibt die ganze aktive Website als deploybaren Ordner (index.html je Seite, wee-embed.js,
          Assets, CSS) nach <code>export/{aktiveSeite}/</code>. Diesen Ordner auf jeden statischen Host laden.
        </p>
      </div>

      {beschaeftigt && (
        <div className="s4-export-fortschritt" role="status" aria-live="polite">
          {status}
          {fortschritt && fortschritt.gesamt > 0 && (
            <span className="s4-export-zaehler">
              {" "}
              {fortschritt.erledigt}/{fortschritt.gesamt}
              {fortschritt.aktuell ? ` · ${fortschritt.aktuell}` : ""}
            </span>
          )}
        </div>
      )}

      {!beschaeftigt && status && (
        <div className="s4-export-fehler" role="alert">
          {status}
        </div>
      )}

      {bericht && (
        <div className="s4-export-bericht">
          <p className="s4-export-erfolg">
            Fertig — geschrieben nach <code>{bericht.ordner}</code>
          </p>
          <ul className="s4-export-statistik">
            <li>
              <b>{bericht.seiten}</b> Seite(n)
            </li>
            <li>
              <b>{bericht.assets}</b> Asset(s)
            </li>
            <li>
              <b>{bericht.css}</b> CSS-Datei(en)
            </li>
            <li>
              <b>{bericht.dateien}</b> Dateien gesamt
            </li>
          </ul>
          {bericht.warnungen.length > 0 && (
            <div className="s4-export-warnungen">
              <b>{bericht.warnungen.length} Seite(n) uebersprungen</b> (Import-Luecke — der Rest wurde
              exportiert):
              <ul>
                {bericht.warnungen.map((w) => (
                  <li key={w.seite}>
                    <span className="s4-export-warn-seite">{w.seite}</span> — {w.grund}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bericht.refWarnungen.length > 0 && (
            <div className="s4-export-warnungen">
              <b>{bericht.refWarnungen.length} tote Referenz(en) / interne Link(s)</b> (relative
              lokale Asset-Pfade oder interne Links auf nicht-importierte Seiten — auf einem
              statischen Host vermutlich tote Links):
              <ul>
                {bericht.refWarnungen.map((w, i) => (
                  <li key={`${w.seite}:${w.roh}:${i}`}>
                    <span className="s4-export-warn-seite">{w.seite}</span> — <code>{w.roh}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bericht.warnungen.length === 0 && bericht.refWarnungen.length === 0 && (
            <p className="s4-export-keine-warnungen">
              Alle Seiten vollstaendig, alle Referenzen und internen Links aufgeloest — keine
              Warnungen.
            </p>
          )}
        </div>
      )}

      {/* --- Sekundaer: die 5 bestehenden Datei-/Embed-Wege (unveraenderte
          GrafikExportPanel-Komponente), eingeklappt. Nichts entfernt (M25). --- */}
      <details className="s4-export-sekundaer">
        <summary>Einzelne Datei-Exporte (JSON · HTML-Overlay · Runtime · Element · Ganze Seite)</summary>
        <p className="s4-export-sekundaer-hinweis">
          Fuer einzelne Dateien statt eines ganzen Ordners — bezogen auf die gerade in der Vorschau
          gewaehlte Seite. (Fuer eine byte-genaue Einzeldatei einer animierten Seite besser direkt aus
          Station 3 „Animieren" exportieren.)
        </p>
        <div className="gre-panel s4-eingebettet-panel">
          <GrafikExportPanel
            grafiken={chosenGrafiken}
            seitenMarkupGeber={() => chosenMarkup}
          />
        </div>
      </details>
    </div>
  );
}
