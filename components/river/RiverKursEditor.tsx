"use client";

/*
 * RiverKursEditor – das eigenständige Fluss-Editor-Overlay (früher Seite
 * /fluss-editor). Seit Welle 2b-1 ist der Fluss auf /editor ein OBJEKT im
 * gemeinsamen Grafik-Panel (s. docs/editor-vereinheitlichung.md §1) — diese
 * Komponente bleibt als eigenständiges Panel erhalten (additiv, nicht
 * gelöscht), nutzt aber jetzt DIESELBE Maschinerie und DIESELBEN Sektionen wie
 * der vereinheitlichte Editor:
 *   - useFlussKnoten (components/river/useFlussKnoten.ts) = alle Interaktionen
 *     + Profil-Logik (zuvor inline hier),
 *   - FlussKnotenHandles = die anfassbare Knoten-Ebene (.rke-layer),
 *   - components/river/sektionen/* = die Reiter-Inhalte.
 * Das Verhalten bleibt 1:1 wie zuvor: EIN Panel oben rechts, sechs Reiter,
 * immer sichtbare Handle-Ebene.
 *
 * ARCHITEKTUR unverändert: Die Knoten SIND der Fluss. Details s.
 * useFlussKnoten.ts.
 */

import { useState } from "react";
import { useFlussKnoten } from "./useFlussKnoten";
import { FlussKnotenHandles } from "./FlussKnotenHandles";
import { FlussSektion } from "./sektionen/FlussSektion";
import { WasserSektion } from "./sektionen/WasserSektion";
import { FrontSektion } from "./sektionen/FrontSektion";
import { NebelSektion } from "./sektionen/NebelSektion";
import { ProfileSektion } from "./sektionen/ProfileSektion";
import { BackdropAuswahl } from "@/components/backdrop/BackdropAuswahl";

type Reiter = "fluss" | "wasser" | "blasen" | "nebel" | "verlaeufe" | "hintergrund";

const REITER: { id: Reiter; label: string }[] = [
  { id: "fluss", label: "Fluss" },
  { id: "wasser", label: "Wasser" },
  { id: "blasen", label: "Front" },
  { id: "nebel", label: "Nebel" },
  { id: "verlaeufe", label: "Profile" },
  { id: "hintergrund", label: "Hintergrund" },
];

export function RiverKursEditor() {
  const s = useFlussKnoten();
  const [reiter, setReiter] = useState<Reiter>("fluss");

  if (!s) return null;
  const ctx = s.ctx;

  return (
    <>
      <FlussKnotenHandles steuerung={s} />

      <div className="rke-panel">
        <div className="rke-kopf">
          <strong>Fluss-Editor</strong>
          {/* Kreuz-Link „Grafiken →" entfällt (Welle 2a): Fluss- und
              Grafik-Editor liegen jetzt gemeinsam auf /editor (Inventar
              §4.3). */}
        </div>
        <div className="rke-zaehler">{s.nodes?.length ?? 0} Knoten</div>

        {/* Reiter: trennt Kurve / Wasser / Front / Nebel / Profile — statt
            einer langen Liste, in der man nichts wiederfindet. */}
        <div className="rke-tabs">
          {REITER.map((r) => (
            <button
              key={r.id}
              className={`rke-tab${reiter === r.id ? " rke-tab--aktiv" : ""}`}
              onClick={() => setReiter(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {reiter === "fluss" && (
          <FlussSektion
            gelockt={s.gelockt}
            vollAufgedeckt={ctx.vollAufgedeckt}
            setVollAufgedeckt={ctx.setVollAufgedeckt}
            knotenHinzufuegen={s.knotenHinzufuegen}
            knotenLoeschen={s.knotenLoeschen}
            geradeZuruecksetzen={s.geradeZuruecksetzen}
          />
        )}

        {reiter === "wasser" && <WasserSektion anim={ctx.anim} setAnim={ctx.setAnim} />}

        {reiter === "blasen" && <FrontSektion anim={ctx.anim} setAnim={ctx.setAnim} />}

        {reiter === "nebel" && <NebelSektion anim={ctx.anim} setAnim={ctx.setAnim} />}

        {reiter === "verlaeufe" && (
          <ProfileSektion
            name={s.name}
            setName={s.setName}
            verlaeufe={s.verlaeufe}
            importRef={s.importRef}
            speichern={s.speichern}
            laden={s.laden}
            verlaufLoeschen={s.verlaufLoeschen}
            exportieren={s.exportieren}
            dateiImportiert={s.dateiImportiert}
            alsSvgExportieren={s.alsSvgExportieren}
          />
        )}

        {reiter === "hintergrund" && <BackdropAuswahl />}

        {s.status && <div className="rke-status">{s.status}</div>}
      </div>
    </>
  );
}
