"use client";

/*
 * BackdropAuswahl – die "Hintergrund"-Bedienung im Panel BEIDER Editoren
 * (Grafik-Editor UND Fluss-Editor rendern exakt dieselbe Komponente, s.
 * jeweilige Reiter "Hintergrund" in GrafikEditor.tsx/RiverKursEditor.tsx).
 *
 * Bewusst EINE gemeinsame Komponente statt einer Kopie je Editor: die
 * Basis-Buttons (<button> ohne eigene Klasse) erben ihre Optik automatisch
 * aus der jeweiligen Panel-CSS (".gre-panel button"/".rke-panel button" sind
 * bis auf Panel-Position/-Ausrichtung identisch, s. grafik-editor.css /
 * river-kurs-editor.css) — nur die WENIGEN Backdrop-eigenen Elemente
 * (Hilfe-Icon, "Aktuell"-Anzeige, Status) tragen eigene "hg-"-Klassen aus
 * backdrop.css, die an KEIN Panel gebunden sind.
 */

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { alsDataUrl, alsText } from "./backdrop-store";
import { useBackdropCtx } from "./BackdropContext";
import { BackdropHilfeIcon } from "./BackdropHilfeIcon";
import { ordnerApiDa, ordnerBereitstellen, ordnerHolen, ordnerWaehlen, type OrdnerHandle } from "./ordner-serve";
import "./backdrop.css";

const HTML_ENDUNG = /\.html?$/i;

const HILFE_TEXT =
  "Legt eine FREMDE Website statt der echten Landing als Hintergrund unter den Editor — zum " +
  "Bäume setzen oder Fluss ziehen über einer fremden Seite (z.B. Bens Entwurf). Screenshot " +
  "(ganzseitiges Bild) funktioniert immer. HTML rendert nur zuverlässig, wenn die Datei " +
  "self-contained ist (CSS/Bilder eingebettet, keine externen Pfade). „Ordner öffnen\" laedt " +
  "eine KOMPLETTE mehrdateiige Website (index.html + CSS + Bilder) direkt von der Festplatte — " +
  "dafuer einmal pro Sitzung den Ordner-Zugriff im Browser-Dialog erlauben (nur Chrome/Edge). " +
  "Nach einem Neuladen der Seite merkt sich der Editor den Ordner, fragt aber ggf. erneut nach " +
  "der Freigabe (eigener Knopf erscheint dann). Nach einem Wechsel auf einen neuen Hintergrund " +
  "musst du Grafiken bzw. den Fluss neu positionieren — die alten Positionen galten für eine " +
  "andere Seite.";

export function BackdropAuswahl() {
  const ctx = useBackdropCtx();
  const [status, setStatus] = useState("");
  const [ordnerWartet, setOrdnerWartet] = useState(false);
  const [ordnerLaedt, setOrdnerLaedt] = useState(false);
  const bildRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);

  /* Ableitungen statt Destrukturieren VOR dem ctx-Null-Check: Hooks muessen
     unbedingt (auch bei ctx===null) in gleicher Reihenfolge laufen — das
     Destrukturieren von backdrop/setBackdrop/laedt passiert deshalb erst
     NACH dem fruehen Return unten, dieser Effekt braucht die Werte aber
     schon davor. */
  const backdropArt = ctx?.backdrop?.art;
  const ctxLaedt = ctx?.laedt;

  /* Beim Start (bzw. sobald der gemerkte Backdrop feststeht) still pruefen,
     ob ein aktiver Ordner-Backdrop noch Zugriff auf seinen Ordner hat —
     genau das gleiche Muster wie GrafikEditor.tsx (dortiger Bibliotheks-
     Ordner). queryPermission statt requestPermission: hier liegt keine
     Nutzergeste vor, ein request wuerde scheitern bzw. den Browser nerven. */
  useEffect(() => {
    if (ctxLaedt !== false) return;
    if (backdropArt !== "ordner") {
      setOrdnerWartet(false);
      return;
    }
    let tot = false;
    void (async () => {
      const handle = await ordnerHolen(false);
      if (!tot) setOrdnerWartet(!handle);
    })();
    return () => {
      tot = true;
    };
  }, [ctxLaedt, backdropArt]);

  if (!ctx) return null;
  const { backdrop, setBackdrop, laedt } = ctx;

  const bildGewaehlt = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setStatus(`„${f.name}": kein Bildformat erkannt`);
      return;
    }
    try {
      const quelle = await alsDataUrl(f);
      setBackdrop({ art: "bild", quelle, name: f.name });
      setStatus(`„${f.name}" als Hintergrund gesetzt — Positionen neu setzen`);
    } catch {
      setStatus(`„${f.name}" konnte nicht gelesen werden`);
    }
  };

  const htmlGewaehlt = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!HTML_ENDUNG.test(f.name) && f.type !== "text/html") {
      setStatus(`„${f.name}": keine .html-Datei erkannt`);
      return;
    }
    try {
      const quelle = await alsText(f);
      setBackdrop({ art: "html", quelle, name: f.name });
      setStatus(`„${f.name}" als Hintergrund gesetzt — Positionen neu setzen`);
    } catch {
      setStatus(`„${f.name}" konnte nicht gelesen werden`);
    }
  };

  /** Cache fuellen + Service Worker bereitstellen + als aktiven Backdrop
   *  setzen — gemeinsamer Kern von "Ordner öffnen" (neuer Handle) UND
   *  "erneut freigeben" (bestehender Handle, Zugriff wiederhergestellt). */
  const ordnerBereitstellenUndSetzen = async (handle: OrdnerHandle) => {
    setOrdnerLaedt(true);
    try {
      const anzahl = await ordnerBereitstellen(handle);
      setBackdrop({ art: "ordner", quelle: handle.name, name: handle.name });
      setOrdnerWartet(false);
      setStatus(
        `„${handle.name}" eingelesen (${anzahl} Datei${anzahl === 1 ? "" : "en"}) — Positionen neu setzen`,
      );
    } catch {
      setStatus(`„${handle.name}" konnte nicht bereitgestellt werden`);
    } finally {
      setOrdnerLaedt(false);
    }
  };

  const ordnerGewaehlt = async () => {
    if (!ordnerApiDa()) {
      setStatus("Ordner-Auswahl braucht Chrome oder Edge (File System Access API)");
      return;
    }
    let handle: OrdnerHandle | null = null;
    try {
      handle = await ordnerWaehlen();
    } catch {
      return; // Dialog abgebrochen — kein Fehlerfall
    }
    if (!handle) return;
    await ordnerBereitstellenUndSetzen(handle);
  };

  /** Nutzergeste (Klick) liegt hier vor — requestPermission (in ordnerHolen
   *  ueber `fragen=true`) darf deshalb tatsaechlich fragen. */
  const ordnerFreigeben = async () => {
    setOrdnerLaedt(true);
    const handle = await ordnerHolen(true);
    setOrdnerLaedt(false);
    if (!handle) {
      setStatus("Zugriff verweigert — Ordner erneut über „Ordner öffnen\" wählen");
      return;
    }
    await ordnerBereitstellenUndSetzen(handle);
  };

  const zurueck = () => {
    setBackdrop(null);
    setStatus("Zurück zur echten Seite");
  };

  return (
    <>
      <div className="hg-reiter-kopf">
        <span>Hintergrund</span>
        <BackdropHilfeIcon label="Hintergrund" text={HILFE_TEXT} />
      </div>

      <div className="hg-hilfe">
        Ganzseitiger Screenshot, Single-File-HTML oder ein kompletter Website-Ordner statt der
        echten Landing — zum Bearbeiten über einer fremden Seite.
      </div>

      {laedt ? (
        <div className="hg-leer">Lade gemerkten Hintergrund…</div>
      ) : backdrop ? (
        <div className="hg-aktuell">
          Aktuell: <b>{backdrop.name}</b> (
          {backdrop.art === "bild" ? "Screenshot" : backdrop.art === "html" ? "HTML" : "Ordner"})
        </div>
      ) : (
        <div className="hg-leer">Kein Hintergrund gewählt — echte Seite aktiv.</div>
      )}

      {backdrop?.art === "ordner" && ordnerWartet && (
        <button
          type="button"
          className="hg-freischalten"
          onClick={() => void ordnerFreigeben()}
          disabled={ordnerLaedt}
          title="Zugriff auf den gemerkten Ordner erneut erlauben (Browser-Dialog)"
        >
          🔓 Ordner erneut freigeben
        </button>
      )}

      <div className="hg-row">
        <button
          type="button"
          onClick={() => bildRef.current?.click()}
          title="Ganzseitigen Screenshot als Hintergrund laden"
        >
          🖼 Screenshot laden
        </button>
        <button
          type="button"
          onClick={() => htmlRef.current?.click()}
          title="Single-File-HTML als Hintergrund laden"
        >
          📄 HTML laden
        </button>
      </div>
      <div className="hg-row">
        <button
          type="button"
          onClick={() => void ordnerGewaehlt()}
          disabled={ordnerLaedt}
          title="Kompletten Website-Ordner (index.html + CSS + Bilder) als Hintergrund laden"
        >
          📁 Ordner öffnen
        </button>
      </div>
      <div className="hg-row">
        <button
          type="button"
          onClick={zurueck}
          disabled={!backdrop}
          title="Hintergrund entfernen, echte Landing zeigen"
        >
          ← Zurück zur echten Seite
        </button>
      </div>

      <input ref={bildRef} type="file" accept="image/*" onChange={bildGewaehlt} hidden />
      <input ref={htmlRef} type="file" accept=".html,.htm,text/html" onChange={htmlGewaehlt} hidden />

      {status && <div className="hg-status">{status}</div>}
    </>
  );
}
