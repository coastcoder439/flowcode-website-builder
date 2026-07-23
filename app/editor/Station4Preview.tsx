"use client";

/*
 * app/editor/Station4Preview.tsx — Station 4 „4 · Vorschau & Export" (X4).
 * Spec: docs/plan-analyse/lens-preview-export.md §2/§3-S4, maengelliste-final.md
 * M23 (Preview-Modus = Export-Wahrheit, Animator komplett aus) + M25.
 *
 * LEITIDEE: Die Vorschau rendert das INLINE-Artefakt des Generators (X1) der
 * gewaehlten Seite in einem iframe (srcdoc). Dadurch PER KONSTRUKTION:
 *   · Links sind echt klickbar (echtes Dokument im iframe),
 *   · nichts ist per Editor selektierbar (kein Animator-Chrome ueber der Seite),
 *   · der Animator ist komplett aus (er ist gar nicht gemountet),
 *   · die Scroll-Animation laeuft (wee-embed-Runtime inline im Artefakt).
 * Das ist damit dieselbe Ausgabe, die auch der Datei-/Ordner-Export erzeugt —
 * Preview = Export-Wahrheit.
 *
 * Diese Station ersetzt den Phase-1-Platzhalter (frueher: chrome-freie
 * SeitenVorschau der aktiven Seite). Die alte SeitenVorschau (?vorschau=) bleibt
 * als Schnellblick in Station 2 „Seite bauen" erhalten (E1) — sie ist hier NICHT
 * mehr im Spiel.
 *
 * Bausteine oben (in der Leiste): Seiten-Wahl (welche Seite der aktiven Website),
 * Quelle-Umschalter (In-Memory-INLINE ⇄ echtes On-Disk-Ordner-Artefakt) und das
 * ausklappbare Export-Fenster (Station4ExportPanel).
 */

import { useCallback, useEffect, useState } from "react";
import { useAktiveSeite } from "@/lib/aktive-seite";
import { hrefPfadZuSlug, type OrdnerSeite } from "@/components/embed/ordner-export";
import { sammleEineSeite } from "./ExportSammler";
import { reichereZuOrdnerSeiten, baueVorschauSrcdoc } from "./export-vorbereitung";
import { waehleWebsiteSeiten, type WebsiteSeitenPlan } from "./export-seiten-auswahl";
import { Station4ExportPanel } from "./Station4ExportPanel";

interface Station4PreviewProps {
  /** Zurueck in den Flow (Station „Animieren") — Bequemlichkeit neben der Nav. */
  onZurueck: () => void;
}

type Quelle = "memory" | "folder";
type ChosenStatus = "laedt" | "bereit" | "fehler";
type FolderStatus = "unbekannt" | "pruefe" | "da" | "fehlt";

/** Ziel-HTML-Pfad einer Seite innerhalb des Ordner-Exports (identisch zur
 *  seitenPfad-Logik in ordner-export.ts): Startseite = index.html, sonst
 *  <slug>/index.html. */
function seitenPfad(plan: WebsiteSeitenPlan): string {
  return plan.istStart ? "index.html" : `${plan.slug}/index.html`;
}

/** Normalisiert einen INTERNEN href (Protokoll/Origin/Anker sind beim Aufrufer
 *  schon ausgeschlossen) zu einem Slug-Vergleichswert. Query/Hash werden hier
 *  abgeschnitten, die Pfad→Slug-Ableitung teilt sich die EINE Funktion mit dem
 *  Ordner-Export (hrefPfadZuSlug: fuehrende/abschliessende Slashes + evtl.
 *  "index.html" weg, dann "/" → "-"). So klassifizieren Vorschau und Export
 *  interne Links identisch — auch mehrsegmentige Pfade wie "/bildung/aquaponik/"
 *  (→ flacher Slug "bildung-aquaponik") matchen jetzt. "" = Wurzel = Startseite. */
function hrefZuSlug(href: string): string {
  return hrefPfadZuSlug(href.split(/[?#]/, 1)[0]);
}

export function Station4Preview({ onZurueck }: Station4PreviewProps) {
  const aktiveSeite = useAktiveSeite();

  const [pages, setPages] = useState<WebsiteSeitenPlan[] | null>(null);
  const [listeFehler, setListeFehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string>("");

  const [chosen, setChosen] = useState<OrdnerSeite | null>(null);
  const [chosenStatus, setChosenStatus] = useState<ChosenStatus>("laedt");
  const [chosenFehler, setChosenFehler] = useState<string>("");
  const [srcdoc, setSrcdoc] = useState<string>("");

  const [quelle, setQuelle] = useState<Quelle>("memory");
  const [folderStatus, setFolderStatus] = useState<FolderStatus>("unbekannt");
  const [exportOffen, setExportOffen] = useState(false);

  const fehlerText = (e: unknown) => (e instanceof Error ? e.message : "unbekannter Fehler");

  /* 1 · Seiten-Liste der aktiven Website laden → Seiten-Wahl-Leiste. */
  useEffect(() => {
    if (!aktiveSeite) return;
    let tot = false;
    setPages(null);
    setListeFehler(null);
    void (async () => {
      try {
        const res = await fetch("/api/puck-seite/liste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { seiten?: { name: string }[] };
        if (tot) return;
        const alle = Array.isArray(json.seiten) ? json.seiten.map((s) => s.name) : [];
        const plan = waehleWebsiteSeiten(alle, aktiveSeite);
        setPages(plan);
        /* Default = Startseite, sonst die erste geplante Seite. */
        const start = plan.find((p) => p.istStart) ?? plan[0];
        setGewaehlt(start?.name ?? "");
      } catch (e) {
        if (!tot) setListeFehler(fehlerText(e));
      }
    })();
    return () => {
      tot = true;
    };
  }, [aktiveSeite]);

  /* 2 · Gewaehlte Seite abgreifen + anreichern → INLINE-Artefakt (srcdoc). */
  useEffect(() => {
    if (!gewaehlt || !pages) return;
    const plan = pages.find((p) => p.name === gewaehlt);
    if (!plan) return;
    let tot = false;
    setChosenStatus("laedt");
    setChosenFehler("");
    void (async () => {
      try {
        const seite = await sammleEineSeite(plan);
        const [ordnerSeite] = await reichereZuOrdnerSeiten([seite], { bilderInline: false });
        if (tot) return;
        setChosen(ordnerSeite);
        setSrcdoc(baueVorschauSrcdoc(ordnerSeite));
        setChosenStatus("bereit");
      } catch (e) {
        if (!tot) {
          setChosenFehler(fehlerText(e));
          setChosenStatus("fehler");
        }
      }
    })();
    return () => {
      tot = true;
    };
  }, [gewaehlt, pages]);

  /* Ziel-URL der gewaehlten Seite im statisch ausgelieferten Ordner-Spiegel
     (public/export/<slug>/…, vom Export mit spiegel:true geschrieben). Next
     liefert public/ statisch aus → relative Verweise im Artefakt loesen korrekt. */
  const gewaehlterPlan = pages?.find((p) => p.name === gewaehlt) ?? null;
  const folderUrl =
    aktiveSeite && gewaehlterPlan
      ? `/export/${encodeURIComponent(aktiveSeite)}/${seitenPfad(gewaehlterPlan)
          .split("/")
          .map((s) => encodeURIComponent(s))
          .join("/")}`
      : "";

  /* 3 · Beim Umschalten auf „Ordner-Artefakt" pruefen, ob es existiert. Sonst
     bleibt In-Memory aktiv und ein Hinweis erklaert den fehlenden Export. */
  const pruefeFolder = useCallback(async () => {
    if (!folderUrl) return;
    setFolderStatus("pruefe");
    try {
      const res = await fetch(folderUrl, { method: "GET", cache: "no-store" });
      setFolderStatus(res.ok ? "da" : "fehlt");
    } catch {
      setFolderStatus("fehlt");
    }
  }, [folderUrl]);

  useEffect(() => {
    if (quelle === "folder") void pruefeFolder();
  }, [quelle, pruefeFolder]);

  /* Nach einem frischen Ordner-Export: falls die Vorschau schon auf „Ordner"
     steht, neu pruefen (das Artefakt existiert jetzt). */
  const onExportFertig = useCallback(() => {
    if (quelle === "folder") void pruefeFolder();
    else setFolderStatus("unbekannt");
  }, [quelle, pruefeFolder]);

  /* Interne Seiten-Links im Vorschau-iframe verdrahten (beide Quellen). Die
     Vorschau zeigt IMMER nur EINE Seite; ein interner Link (z.B. „/project-oasis/")
     wuerde den iframe gegen die Dev-Origin navigieren → 404 in der Konsole (kein
     echter Deploy-Root hier). Deshalb: internen Klick abfangen und — gehoert das
     Ziel zur aktiven Website — die Vorschau auf diese Seite umschalten (echte,
     nutzbare Navigation zwischen den Seiten). Externe/Anker-/Protokoll-Links
     bleiben unangetastet (echtes Link-Verhalten, M23). Der iframe ist same-origin
     (srcdoc erbt die Eltern-Origin; /export/… liegt unter derselben Dev-Origin),
     also ist contentDocument erreichbar — capture-Phase, damit es vor der
     wee-embed-Runtime greift. Das Datei-/Ordner-Artefakt selbst bleibt unberuehrt
     (Preview-only, wie die zugehaengten <link>-Styles in baueVorschauSrcdoc). */
  const verdrahteInterneLinks = useCallback(
    (e: React.SyntheticEvent<HTMLIFrameElement>) => {
      const doc = e.currentTarget.contentDocument;
      if (!doc) return;
      doc.addEventListener(
        "click",
        (ev) => {
          const ziel = ev.target as Element | null;
          const a = ziel?.closest?.("a[href]") as HTMLAnchorElement | null;
          if (!a) return;
          const href = a.getAttribute("href") ?? "";
          if (
            href === "" ||
            href.startsWith("#") ||
            href.startsWith("//") ||
            /^[a-z][a-z0-9+.-]*:/i.test(href)
          ) {
            return; // extern / Anker / Protokoll → echtes Verhalten lassen
          }
          ev.preventDefault();
          const slug = hrefZuSlug(href);
          const treffer = (pages ?? []).find((p) => (slug === "" ? p.istStart : p.slug === slug));
          if (treffer) setGewaehlt(treffer.name);
        },
        true,
      );
    },
    [pages],
  );

  /* ---- Kein aktive Website: dezente Notiz (wie im Phase-1-Platzhalter). ---- */
  if (!aktiveSeite) {
    return (
      <div
        className="editor-seiten-flaeche"
        id="stations-panel"
        role="tabpanel"
        aria-labelledby="tab-preview"
        tabIndex={0}
      >
        <div className="seiten-verwaltung">
          <div className="seiten-verwaltung-innen">
            <p className="seiten-leer">
              Noch keine aktive Website gesetzt. Waehle in „2 · Seite bauen" eine Seite als aktive
              Website — dann zeigt diese Station die klickbare Vorschau und den Export.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const zeigeFolder = quelle === "folder" && folderStatus === "da";

  return (
    <div
      className="editor-seiten-flaeche s4-flaeche"
      id="stations-panel"
      role="tabpanel"
      aria-labelledby="tab-preview"
      tabIndex={0}
    >
      {/* ---- Leiste: Zurueck · Seiten-Wahl · Quelle · Export-Toggle ---- */}
      <div className="s4-leiste">
        <button
          type="button"
          className="seiten-btn"
          onClick={onZurueck}
          title={'Zurück zur Station „Animieren"'}
        >
          ← Animieren
        </button>

        <label className="s4-feld">
          <span>Seite</span>
          <select
            value={gewaehlt}
            onChange={(e) => setGewaehlt(e.target.value)}
            disabled={!pages || pages.length === 0}
            aria-label="Welche Seite der aktiven Website vorschauen"
          >
            {pages?.map((p) => (
              <option key={p.name} value={p.name}>
                {p.istStart ? "★ Startseite" : p.slug || p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="s4-quelle" role="group" aria-label="Vorschau-Quelle">
          <button
            type="button"
            className={`s4-quelle-btn${quelle === "memory" ? " s4-quelle-btn--aktiv" : ""}`}
            aria-pressed={quelle === "memory"}
            onClick={() => setQuelle("memory")}
            title="Live-Vorschau des In-Memory-Artefakts (kein Schreiben auf die Platte)"
          >
            In-Memory
          </button>
          <button
            type="button"
            className={`s4-quelle-btn${quelle === "folder" ? " s4-quelle-btn--aktiv" : ""}`}
            aria-pressed={quelle === "folder"}
            onClick={() => setQuelle("folder")}
            title="Das echte, zuletzt auf die Platte exportierte Ordner-Artefakt laden"
          >
            Ordner-Artefakt
          </button>
        </div>

        <button
          type="button"
          className="seiten-btn s4-export-toggle"
          aria-expanded={exportOffen}
          onClick={() => setExportOffen((o) => !o)}
          title="Export-Fenster ein-/ausklappen"
        >
          Export {exportOffen ? "▲" : "▼"}
        </button>
      </div>

      {/* ---- Ausklappbares Export-Fenster ---- */}
      {exportOffen && (
        <div className="s4-export-fenster">
          <Station4ExportPanel
            aktiveSeite={aktiveSeite}
            chosenGrafiken={chosen?.anim?.grafiken ?? []}
            chosenMarkup={chosen?.markup ?? null}
            onExportFertig={onExportFertig}
          />
        </div>
      )}

      {/* ---- Buehne: iframe (Export-Wahrheit) ---- */}
      <div className="s4-buehne">
        {listeFehler && (
          <div className="s4-hinweis" role="alert">
            Seiten-Liste konnte nicht geladen werden ({listeFehler}).
          </div>
        )}

        {quelle === "folder" && folderStatus !== "da" && (
          <div className="s4-hinweis" role="status">
            {folderStatus === "pruefe"
              ? "Pruefe, ob ein Ordner-Artefakt vorliegt…"
              : "Noch kein Ordner-Artefakt fuer diese Seite auf der Platte. Erst oben als Ordner exportieren — dann zeigt dieser Modus das echte On-Disk-Ergebnis."}
          </div>
        )}

        {quelle === "memory" && chosenStatus === "laedt" && (
          <div className="s4-hinweis" role="status">
            Baue Vorschau…
          </div>
        )}
        {quelle === "memory" && chosenStatus === "fehler" && (
          <div className="s4-hinweis" role="alert">
            Vorschau fehlgeschlagen ({chosenFehler}).
          </div>
        )}

        {zeigeFolder ? (
          <iframe
            key={`folder-${folderUrl}`}
            className="s4-iframe"
            title={`Ordner-Artefakt-Vorschau: ${gewaehlt}`}
            src={folderUrl}
            onLoad={verdrahteInterneLinks}
          />
        ) : quelle === "memory" && chosenStatus === "bereit" ? (
          <iframe
            key={`memory-${gewaehlt}`}
            className="s4-iframe"
            title={`Live-Vorschau: ${gewaehlt}`}
            srcDoc={srcdoc}
            onLoad={verdrahteInterneLinks}
          />
        ) : null}
      </div>
    </div>
  );
}
