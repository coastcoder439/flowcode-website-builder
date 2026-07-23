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
import { useAktiveSeite } from "@/lib/aktive-seite";
import "./backdrop.css";

const HTML_ENDUNG = /\.html?$/i;

const HILFE_TEXT =
  "Bestimmt, worüber der Animator liegt. STANDARD ist die „aktive Website“ (die echte Seite " +
  "des Projekts, s. Bereich „Seiten“) — sie wird ohne weiteres Zutun als Bühne geladen. Die " +
  "eingebaute WEE-Landing ist nur noch ein Beispiel: „WEE Demo-Landing zeigen“ holt sie " +
  "ausdrücklich als Bühne zurück. Zusätzlich kannst du eine FREMDE Website unterlegen — zum " +
  "Bäume setzen oder Fluss ziehen über einer fremden Seite (z.B. Bens Entwurf). Screenshot " +
  "(ganzseitiges Bild) funktioniert immer. HTML rendert nur zuverlässig, wenn die Datei " +
  "self-contained ist (CSS/Bilder eingebettet, keine externen Pfade). „Ordner öffnen“ laedt " +
  "eine KOMPLETTE mehrdateiige Website (index.html + CSS + Bilder) direkt von der Festplatte — " +
  "dafuer einmal pro Sitzung den Ordner-Zugriff im Browser-Dialog erlauben (nur Chrome/Edge). " +
  "Nach einem Neuladen der Seite merkt sich der Editor den Ordner, fragt aber ggf. erneut nach " +
  "der Freigabe (eigener Knopf erscheint dann). „Zurück“ entfernt einen gewählten Hintergrund " +
  "wieder und stellt die aktive Website als Bühne her. Nach einem Wechsel auf einen neuen " +
  "Hintergrund musst du Grafiken bzw. den Fluss neu positionieren — die alten Positionen galten " +
  "für eine andere Seite.";

/** Ein Eintrag der Seiten-Liste (Teilform von SeitenInfo, /api/puck-seite/liste). */
interface SeiteKurz {
  name: string;
  contentAnzahl: number;
}

export function BackdropAuswahl() {
  const ctx = useBackdropCtx();
  const [status, setStatus] = useState("");
  const [ordnerWartet, setOrdnerWartet] = useState(false);
  const [ordnerLaedt, setOrdnerLaedt] = useState(false);
  /* I8b/M8: liegt zur aktiven puck-seite-Buehne eine eingefrorene buehne.html vor
     (= Quellen-Stufe (b), s. Backdrop.tsx), zeigen wir einen ehrlichen Hinweis,
     dass ein verbundener Ordner die Original-Animationen (Stufe (a)) braechte. */
  const [buehneEingefroren, setBuehneEingefroren] = useState(false);
  /* Eigene Puck-Seiten als Buehne (Welle 4c, §9/4c(2)). Liste einmalig laden;
     Fehlschlag → leere Liste (Abschnitt zeigt dann nur den Leer-Hinweis). */
  const [seiten, setSeiten] = useState<SeiteKurz[]>([]);
  const [seitenGeladen, setSeitenGeladen] = useState(false);
  /* Welle 5b: die aktive Website (Default-Buehne) — hier nur zur Anzeige/
     Beschriftung; das Setzen passiert im Seiten-Bereich. */
  const aktiveSeite = useAktiveSeite();
  const bildRef = useRef<HTMLInputElement>(null);
  const htmlRef = useRef<HTMLInputElement>(null);

  /* Ableitungen statt Destrukturieren VOR dem ctx-Null-Check: Hooks muessen
     unbedingt (auch bei ctx===null) in gleicher Reihenfolge laufen — das
     Destrukturieren von backdrop/setBackdrop/laedt passiert deshalb erst
     NACH dem fruehen Return unten, dieser Effekt braucht die Werte aber
     schon davor. */
  const backdropArt = ctx?.backdrop?.art;
  const backdropQuelle = ctx?.backdrop?.quelle;
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

  /* I8b/M8: Ist die aktive Buehne eine puck-seite, still pruefen, ob dazu eine
     eingefrorene public/import/<slug>/buehne.html vorliegt (Quellen-Stufe (b),
     s. Backdrop.tsx). Falls ja, blenden wir unten den ehrlichen Hinweis ein, dass
     ein verbundener Ordner die Original-Animationen (Stufe (a)) laufen liesse.
     Gleicher Existenz-Endpoint wie die Backdrop-Weiche (POST /api/import/buehne,
     immer HTTP 200 → keine Konsolen-Fehler). Best-effort: Netzfehler → kein
     Hinweis. Vor dem ctx-Null-Check, damit die Hook-Reihenfolge stabil bleibt. */
  useEffect(() => {
    if (backdropArt !== "puck-seite" || !backdropQuelle) {
      setBuehneEingefroren(false);
      return;
    }
    let tot = false;
    void (async () => {
      try {
        const res = await fetch("/api/import/buehne", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: backdropQuelle }),
          cache: "no-store",
        });
        const json = (await res.json()) as { vorhanden?: boolean };
        if (!tot) setBuehneEingefroren(res.ok && json.vorhanden === true);
      } catch {
        if (!tot) setBuehneEingefroren(false);
      }
    })();
    return () => {
      tot = true;
    };
  }, [backdropArt, backdropQuelle]);

  /* Seiten-Liste einmalig laden (unabhaengig vom Backdrop-Zustand) — vor dem
     ctx-Null-Check, damit die Hook-Reihenfolge stabil bleibt. */
  useEffect(() => {
    let tot = false;
    void (async () => {
      try {
        const res = await fetch("/api/puck-seite/liste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const json = (await res.json()) as { seiten?: SeiteKurz[] };
        if (!tot && res.ok && Array.isArray(json.seiten)) setSeiten(json.seiten);
      } catch {
        /* Route nicht erreichbar → leere Liste. */
      } finally {
        if (!tot) setSeitenGeladen(true);
      }
    })();
    return () => {
      tot = true;
    };
  }, []);

  if (!ctx) return null;
  /* Nutzer-Wechsel laufen ueber setBackdropMitUndo (U4/M12): jeder Klick hier ist
     eine bewusste Geste und soll per Strg+Z rueckgaengig sein. setBackdrop (ohne
     Historie) bleibt dem Self-Heal/Fallback vorbehalten. */
  const { backdrop, setBackdropMitUndo, laedt } = ctx;

  /* Ist die aktive Website eine wirklich existierende Seite? (Nur dann ist sie
     die Default-Buehne; sonst faellt der Animator auf die Demo-Landing zurueck.) */
  const aktiveExistiert = aktiveSeite ? seiten.some((s) => s.name === aktiveSeite) : false;

  const seiteWaehlen = (name: string) => {
    setBackdropMitUndo({ art: "puck-seite", quelle: name, name }, `Seite „${name}“ als Bühne`);
    setStatus(`Seite „${name}“ als Buehne gesetzt — Animator liegt jetzt darueber`);
  };

  /* Welle 5b: die eingebaute WEE-Demo-Landing ausdruecklich als Buehne holen
     (Sentinel-Backdrop; EditorInner bildet ihn auf die echte Landing ab). */
  const demoLandingWaehlen = () => {
    setBackdropMitUndo({ art: "demo-landing", quelle: "", name: "Demo-Landing (WEE)" }, "Demo-Landing als Bühne");
    setStatus("Demo-Landing (WEE) als Buehne gesetzt");
  };

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
      setBackdropMitUndo({ art: "bild", quelle, name: f.name }, `Screenshot „${f.name}“`);
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
      setBackdropMitUndo({ art: "html", quelle, name: f.name }, `HTML „${f.name}“`);
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
      setBackdropMitUndo({ art: "ordner", quelle: handle.name, name: handle.name }, `Ordner „${handle.name}“`);
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
    setBackdropMitUndo(null, "Hintergrund entfernt");
    setStatus(
      aktiveSeite && aktiveExistiert
        ? `Zurück zur aktiven Website „${aktiveSeite}“`
        : "Zurück zur Demo-Landing (keine aktive Website gesetzt)",
    );
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
          Aktuell: <b>{backdrop.name}</b>
          {backdrop.art === "demo-landing" ? null : (
            <>
              {" ("}
              {backdrop.art === "bild"
                ? "Screenshot"
                : backdrop.art === "html"
                  ? "HTML"
                  : backdrop.art === "puck-seite"
                    ? "Eigene Seite"
                    : "Ordner"}
              {")"}
            </>
          )}
        </div>
      ) : aktiveSeite && aktiveExistiert ? (
        <div className="hg-aktuell">
          Aktuell: <b>{aktiveSeite}</b> (aktive Website)
        </div>
      ) : (
        <div className="hg-leer">Keine aktive Website — Demo-Landing (WEE) aktiv.</div>
      )}

      {/* I8b/M8: aktive Buehne ist die eingefrorene Fassung (Stufe (b)) — ehrlich
          darauf hinweisen, dass ein verbundener Ordner die Original-Animationen
          (Stufe (a)) laufen liesse. Dezenter Hinweis-Stil (.hg-hilfe). */}
      {backdrop?.art === "puck-seite" && buehneEingefroren && (
        <div
          className="hg-hilfe"
          title="Der Ordner-Modus („📁 Ordner öffnen“ hier, oder beim Import „Als lebendige Animator-Bühne verbinden“) serviert die Original-Dateien inklusive JavaScript — dann laufen die eigenen Animationen der Seite erneut ab."
        >
          Bühne: eingefrorener Endzustand — Ordner verbinden, damit die Original-Animationen laufen.
        </div>
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
      {/* Welle 4c(2): eigene Puck-Seite als Buehne. Anders als Screenshot/HTML/
          Ordner wird die Seite INLINE gerendert (kein iframe) — nur so verankern
          sich Animator-Keyframes automatisch an ihren Bausteinen. */}
      <div className="hg-eigene-seite">
        <div className="hg-eigene-seite-titel">Eigene Seite als Buehne</div>
        {!seitenGeladen ? (
          <div className="hg-leer">Lade Seiten…</div>
        ) : seiten.length === 0 ? (
          <div className="hg-leer">
            Noch keine Seiten — im Bereich „Seiten“ eine anlegen oder importieren.
          </div>
        ) : (
          <div className="hg-seiten-liste">
            {seiten.map((s) => (
              <button
                key={s.name}
                type="button"
                className={backdrop?.art === "puck-seite" && backdrop.quelle === s.name ? "hg-seite-aktiv" : undefined}
                onClick={() => seiteWaehlen(s.name)}
                title={
                  s.name === aktiveSeite
                    ? `seiten/${s.name}.json (aktive Website) als Animator-Buehne laden`
                    : `seiten/${s.name}.json als Animator-Buehne laden`
                }
              >
                {s.name} ({s.contentAnzahl})
                {s.name === aktiveSeite ? " · aktive Website" : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Welle 5b: die eingebaute WEE-Demo-Landing als bewusst waehlbare Buehne
          (sie ist nicht mehr der Default — das ist die aktive Website). */}
      <div className="hg-row">
        <button
          type="button"
          className={backdrop?.art === "demo-landing" ? "hg-seite-aktiv" : undefined}
          onClick={demoLandingWaehlen}
          title="Die eingebaute WEE-Beispiel-Landing als Buehne zeigen"
        >
          WEE Demo-Landing zeigen
        </button>
      </div>

      <div className="hg-row">
        <button
          type="button"
          onClick={zurueck}
          disabled={!backdrop}
          title={
            aktiveSeite && aktiveExistiert
              ? "Hintergrund entfernen, zurück zur aktiven Website"
              : "Hintergrund entfernen, Demo-Landing zeigen"
          }
        >
          {aktiveSeite && aktiveExistiert ? "← Zurück zur aktiven Website" : "← Zurück zur echten Seite"}
        </button>
      </div>

      <input ref={bildRef} type="file" accept="image/*" onChange={bildGewaehlt} hidden />
      <input ref={htmlRef} type="file" accept=".html,.htm,text/html" onChange={htmlGewaehlt} hidden />

      {status && <div className="hg-status">{status}</div>}
    </>
  );
}
