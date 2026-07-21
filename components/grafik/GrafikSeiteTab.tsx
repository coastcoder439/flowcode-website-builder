"use client";

/*
 * GrafikSeiteTab – Reiter „Seite" im Grafik-Editor: zeigt Grafiken, die die
 * SEITE SELBST zeichnet (aktuell: die Vorhang-Bäume aus curtain.config.json)
 * und erlaubt, sie ins Abbild zu ÜBERNEHMEN, ohne die Seite zu verändern
 * (Leitprinzip der Aufgabe: „Übernehmen statt umschreiben"). Ausgelagert aus
 * GrafikEditor.tsx (das ist schon 1700+ Zeilen), analog zu den anderen
 * Reitern dort.
 *
 * WEG DER ÜBERNAHME:
 *   1. Der aktuell sichtbare Baum wird über sein data-vorhang-id-Attribut im
 *      DOM gefunden (TitleCurtain.tsx setzt dieses Attribut auf jedes
 *      Baum-<img>, s. dort) und seine Bildschirmposition
 *      (getBoundingClientRect) in Dokument-Koordinaten umgerechnet
 *      (+ window.scrollX/Y) — GENAU dort, wo er gerade steht, damit er beim
 *      Übernehmen nicht springt.
 *   2. Daraus entsteht eine GANZ NORMALE Grafik mit EINEM Keyframe (Zustand
 *      bleibt bei nur einem Keyframe konstant, s. zustandBei in
 *      grafik-types.ts) und der Datei-URL aus public/curtain/trees/ — die
 *      Datei existiert schon und wird nur REFERENZIERT, nichts wird kopiert
 *      oder als Base64 eingebettet.
 *   3. Die Grafik-ID bekommt das Prefix VORHANG_GRAFIK_PREFIX + die stabile
 *      Platz-ID ("ebene:seite:index") — daraus lässt sich die Verbindung in
 *      BEIDE Richtungen ohne Zusatzfeld an Grafik selbst herstellen (der
 *      generische Löschen-Weg im Reiter „Ebenen", s. GrafikEditor.tsx, nutzt
 *      das genauso wie "Zurück an den Vorhang" hier).
 *   4. Der Platz landet in ctx.uebernommen — TitleCurtain überspringt genau
 *      diese Plätze beim Rendern (rein datengetrieben, keine Baumnamen im
 *      Code, s. dort).
 *
 * curtain.config.json wird hier NUR GELESEN (zum Auflisten der Plätze) —
 * geschrieben wird es nie (Leitprinzip der Aufgabe).
 */

import { useState } from "react";
import curtainConfig from "../../curtain.config.json";
import { useGrafiken } from "./GrafikContext";
import { VORHANG_GRAFIK_PREFIX, type Grafik, type GrafikKeyframe } from "./grafik-types";

type Seite = "links" | "rechts";

/* Gleiche drei Ebenen-Namen wie CFG.layers in TitleCurtain.tsx. Bewusst eine
   eigene, kleine Konstante statt Re-Export von dort: die Anzeige-Reihenfolge
   hier (1,2,3, intuitiv von vorn nach hinten) ist ohnehin eine andere als
   die Rendering-Reihenfolge dort (hinten→vorn, s. LAYER_ORDER). */
const EBENEN = ["ebene-1", "ebene-2", "ebene-3"] as const;
type EbeneName = (typeof EBENEN)[number];

interface PlaneConf {
  links: { file: string }[];
  rechts: { file: string }[];
}

/* Wie CFG.layers in TitleCurtain.tsx: je Ebene explizit herausgegriffen statt
   dynamisch indiziert — curtain.config.json enthält neben den drei Ebenen
   auf derselben Verschachtelungsebene noch $doc/openEnd. */
const EBENEN_CONFIG: Record<EbeneName, PlaneConf> = {
  "ebene-1": curtainConfig.layers["ebene-1"] as PlaneConf,
  "ebene-2": curtainConfig.layers["ebene-2"] as PlaneConf,
  "ebene-3": curtainConfig.layers["ebene-3"] as PlaneConf,
};

interface VorhangPlatz {
  vorhangId: string;
  file: string;
}

/** Plätze einer Ebene/Seite aus curtain.config.json — die Reihenfolge (Array-
 *  Index) IST die stabile ID (s. Dateikopf), deshalb identisch zu der
 *  Reihenfolge, in der TitleCurtain.tsx dieselben Plätze rendert. */
function plaetzeVon(ebene: EbeneName, seite: Seite): VorhangPlatz[] {
  return EBENEN_CONFIG[ebene][seite].map((tree, index) => ({
    vorhangId: `${ebene}:${seite}:${index}`,
    file: tree.file,
  }));
}

export function SeiteTab() {
  const ctx = useGrafiken();
  const [status, setStatus] = useState("");

  if (!ctx) return null;
  const { grafiken, uebernommen } = ctx;
  const uebernommenSet = new Set(uebernommen);

  /** Findet den Baum über sein data-vorhang-id-Attribut (s. TitleCurtain.tsx)
   *  und übernimmt ihn GENAU an seiner aktuellen Bildschirmposition. */
  const inBuilderHolen = (vorhangId: string, file: string) => {
    const id = `${VORHANG_GRAFIK_PREFIX}${vorhangId}`;
    if (grafiken.some((g) => g.id === id)) {
      /* Sollte durch die Knopf-Beschriftung (s.u.) nie erreichbar sein —
         trotzdem kein stiller Doppel-Eintrag, falls uebernommen/grafiken
         mal auseinanderlaufen (z.B. durch von Hand editierte Abbilder). */
      setStatus(`„${file}" ist bereits im Builder.`);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-vorhang-id="${vorhangId}"]`);
    if (!el) {
      setStatus(
        `„${file}" nicht gefunden — Vorhang evtl. nicht sichtbar (Reduced-Motion?). Seite neu laden und erneut versuchen.`,
      );
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      setStatus(`„${file}" hat aktuell keine sichtbare Größe — nicht übernommen.`);
      return;
    }
    /* Aktuelle Deckkraft mitnehmen (z.B. waehrend der Intro-Einblendung des
       Vorhangs) statt hart 1 anzunehmen — sonst koennte die uebernommene
       Grafik im Uebernahme-Moment sichtbarer aufblitzen als der Baum davor. */
    const deckkraft = parseFloat(getComputedStyle(el).opacity);
    const kf: GrafikKeyframe = {
      scrollY: window.scrollY,
      x: rect.left + rect.width / 2 + window.scrollX,
      y: rect.top + rect.height / 2 + window.scrollY,
      scale: 1,
      opacity: Number.isFinite(deckkraft) ? deckkraft : 1,
      rotation: 0,
    };
    const neu: Grafik = {
      id,
      name: file,
      src: `/curtain/trees/${file}`,
      art: "bild",
      breitePx: Math.round(rect.width),
      z: grafiken.length + 1,
      keyframes: [kf],
    };
    /* EIN Commit fuer BEIDE Felder (grafiken + uebernommen) — Rueckgaengig
       muss die Uebernahme als GANZES aufheben, sonst bliebe nach einem
       Undo eine Grafik ohne Uebernahme-Eintrag oder umgekehrt stehen. */
    ctx.commit("Baum übernommen");
    ctx.setGrafiken([...grafiken, neu]);
    ctx.setUebernommen([...uebernommen, vorhangId]);
    ctx.setAuswahl(id);
    setStatus(`„${file}" übernommen — Reiter „Ebenen"/„Keyframes" zum Weiterbearbeiten.`);
  };

  /** Gibt den Platz an den Vorhang zurück: Grafik weg, Übernahme-Eintrag weg
   *  — der Vorhang zeichnet den Baum ab dem nächsten Render wieder. */
  const zurueckAnVorhang = (vorhangId: string, file: string) => {
    const id = `${VORHANG_GRAFIK_PREFIX}${vorhangId}`;
    ctx.commit("Baum zurückgegeben");
    ctx.setGrafiken(grafiken.filter((g) => g.id !== id));
    ctx.setUebernommen(uebernommen.filter((v) => v !== vorhangId));
    if (ctx.auswahl === id) ctx.setAuswahl(null);
    setStatus(`„${file}" zurück an den Vorhang gegeben.`);
  };

  return (
    <>
      <div className="gre-hilfe">
        Grafiken, die die Seite selbst zeichnet (die Vorhang-Bäume). Klick übernimmt den Baum an
        seiner AKTUELLEN Bildschirmposition in den Builder — curtain.config.json bleibt
        unangetastet, der Vorhang überspringt nur noch diesen Platz. Nochmal klicken gibt ihn
        zurück.
      </div>
      {EBENEN.map((ebene) => {
        const linksListe = plaetzeVon(ebene, "links");
        const rechtsListe = plaetzeVon(ebene, "rechts");
        return (
          <details key={ebene} className="gre-pool-gruppe" open>
            <summary>
              {ebene}{" "}
              <span className="gre-gruppe-anzahl">({linksListe.length + rechtsListe.length})</span>
            </summary>
            {([
              ["links", linksListe],
              ["rechts", rechtsListe],
            ] as const).map(([seite, liste]) => (
              <div key={seite}>
                <div className="gre-hilfe">{seite}</div>
                <div className="gre-pool">
                  {liste.map(({ vorhangId, file }) => {
                    const istUebernommen = uebernommenSet.has(vorhangId);
                    return (
                      <div key={vorhangId} className="gre-pool-item-wrap">
                        <button
                          className={`gre-pool-item${istUebernommen ? " gre-tausch-aktiv" : ""}`}
                          onClick={() =>
                            istUebernommen
                              ? zurueckAnVorhang(vorhangId, file)
                              : inBuilderHolen(vorhangId, file)
                          }
                          title={
                            istUebernommen
                              ? `„${file}" zurück an den Vorhang geben`
                              : `„${file}" an aktueller Position in den Builder holen`
                          }
                        >
                          <img src={`/curtain/trees/${file}`} alt="" />
                          <span>{istUebernommen ? `✓ ${file}` : file}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </details>
        );
      })}
      {status && <div className="gre-status">{status}</div>}
    </>
  );
}
