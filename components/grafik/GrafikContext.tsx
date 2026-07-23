"use client";

/*
 * GrafikContext – Brücke zwischen dem Grafik-Editor (/grafik-editor) und der
 * Darstellungs-Ebene (GrafikLayer), nach demselben Muster wie
 * RiverKursContext: auf der normalen Landing existiert KEIN Provider →
 * useGrafiken() liefert null und der Layer rendert das fest hinterlegte
 * Setup (bzw. nichts). Die Landing bleibt dadurch unberührt.
 */

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import grafikConfig from "../../grafik.config.json";
import type { Grafik } from "./grafik-types";
import { useUndoBus, type Befehl } from "../undo/UndoBus";
import { VERLAUF_COALESCE_MS } from "../undo/coalesce";

/** Fest hinterlegtes Setup der Landing (grafik.config.json). Der Editor
 *  startet damit, damit Leon den LIVE-Stand weiterbearbeitet statt bei Null
 *  anzufangen. */
export const KONFIG_GRAFIKEN = (grafikConfig as unknown as { grafiken: Grafik[] }).grafiken ?? [];

/** Dokumenthöhe, gegen die KONFIG_GRAFIKEN autoriert wurde (grafik.config.
 *  json meta.docH — laut Datei-Kommentar bislang "nur zur Nachvollzieh-
 *  barkeit, wird nicht ausgewertet"; HIER erstmals tatsächlich ausgewertet,
 *  Robustheits-Fix). Weicht die aktuelle Landing-Höhe davon ab (anderer
 *  Viewport/Content seit dem "Als Standard setzen"), normalisiert
 *  GrafikLayer die Positionen proportional. 0/fehlend = kein Wert erfasst
 *  (Ausgangszustand der Datei) → GrafikLayer behandelt das als "kein
 *  Normalisieren" (faktor=1, unverändertes Verhalten). */
export const KONFIG_GRAFIKEN_DOC_H =
  (grafikConfig as unknown as { meta?: { docH?: number } }).meta?.docH || undefined;

/** Von der Seite selbst gezeichnete Plaetze (z.B. Vorhang-Baeume), die auf
 *  der LANDING bereits als Builder-Grafik uebernommen sind (s.
 *  GrafikSeiteTab.tsx) — die jeweilige Quelle (TitleCurtain) ueberspringt
 *  genau diese Plaetze. Fehlt das Feld (aeltere grafik.config.json), gilt
 *  "nichts uebernommen" statt eines Ladefehlers. */
export const KONFIG_UEBERNOMMEN =
  (grafikConfig as unknown as { uebernommen?: string[] }).uebernommen ?? [];

/* --- Verlauf (Undo/Redo) über den zentralen Undo-Bus -----------------
 * FRÜHER hielt dieser Context zwei EIGENE Snapshot-Stapel (Rückgängig/
 * Wiederholen). Seit U1 (docs/plan-analyse/lens-undo.md §2.2) ist Grafik nur
 * noch PRODUZENT: `commit` erzeugt einen domänenunabhängigen `Befehl`
 * (Snapshot-Closures über {grafiken, uebernommen}) und legt ihn auf den
 * gemeinsamen UndoBus; `undo/redo/canUndo/canRedo/resetHistory` delegieren
 * dorthin. Das VERHALTEN bleibt exakt wie zuvor (Regressions-Anker) — die
 * Coalesce-/Limit-/Gruppen-Mechanik ist unverändert, nur zentral nach
 * components/undo/coalesce.ts umgezogen.
 *
 * Sichert genau {grafiken, uebernommen}: „Baum übernehmen" (GrafikSeiteTab.tsx)
 * ändert BEIDE Felder in einem Zug und muss deshalb als EIN Schritt rückgängig
 * gemacht werden. Snapshots halten nur ARRAY-REFERENZEN, keine Deep-Clones: der
 * bestehende Code ändert grafiken/uebernommen ohnehin nie in-place (map/filter =
 * neue Arrays/Objekte), Bild-BYTES stecken nur als Referenz in Grafik.src — ein
 * Snapshot ist daher billig.
 *
 * WARUM ein GEMEINSAMER Redo-Halter je Geste (s. commit): Der Nach-Zustand
 * wird — wie in der alten Mechanik — erst BEIM Undo live eingefangen. Der Bus
 * behält beim Zusammenfassen (Coalesce) das `undo` des ERSTEN Befehls, übernimmt
 * aber das `redo` des NEUESTEN. Damit das überlebende `redo` denselben
 * eingefangenen Stand liest, teilen sich alle Befehle EINER Geste EINEN Halter
 * (sonst läse das überlebende redo einen nie gefüllten Halter → Redo-No-Op). */

interface VerlaufZustand {
  grafiken: Grafik[];
  uebernommen: string[];
}

interface GrafikCtx {
  grafiken: Grafik[];
  setGrafiken: (g: Grafik[]) => void;
  /** id der aktuell ausgewählten Grafik (Editor-Auswahl) — die PRIMÄRE
   *  Auswahl. Objektmenü/Inspector hängen ausschließlich hieran, auch bei
   *  aktiver Mehrfachauswahl (s. auswahlMehr) — unverändertes Verhalten. */
  auswahl: string | null;
  setAuswahl: (id: string | null) => void;
  /** Zusätzlich mehrfach-ausgewählte Grafik-IDs, OHNE `auswahl` selbst — die
   *  volle Mehrfachauswahl ist `auswahl ? [auswahl, ...auswahlMehr] :
   *  auswahlMehr` (s. volleAuswahl in grafik-mehrfachauswahl.ts). Normalfall
   *  (reine Einzelauswahl): leeres Array — unverändertes Altverhalten.
   *  Additiv wie `auswahl`/`gelockt`: bewusst NICHT Teil des Verlaufs
   *  (Undo/Redo), reine UI-Auswahl, keine Projektdaten. */
  auswahlMehr: string[];
  setAuswahlMehr: (ids: string[]) => void;
  /** true = Grafik ist „eingeloggt": Scrollrad skaliert statt zu scrollen. */
  gelockt: boolean;
  setGelockt: (v: boolean) => void;
  /** Stabile Plaetze ("ebene:seite:index"), die aktuell im Builder statt von
   *  ihrer Quelle gezeichnet werden (s. VORHANG_GRAFIK_PREFIX in
   *  grafik-types.ts und GrafikSeiteTab.tsx). */
  uebernommen: string[];
  setUebernommen: (u: string[]) => void;
  /** Sichert den AKTUELLEN (Vor-Änderungs-)Zustand im Rückgängig-Stapel,
   *  IMMER VOR der eigentlichen Änderung aufrufen. `gruppe` gesetzt + letzter
   *  Commit derselben Gruppe < 600ms her → kein neuer Eintrag (die laufende
   *  Geste zählt weiter als EIN Schritt). `zustand` überschreibt den live
   *  gelesenen Vor-Zustand — für den Canvas-Zug, der erst beim Loslassen
   *  committet, mit dem am Zug-Start gemerkten Stand. */
  commit: (label: string, gruppe?: string, zustand?: VerlaufZustand) => void;
  /** Macht den letzten Verlaufseintrag rückgängig, gibt sein Label zurück
   *  (für die Statuszeile) — null, wenn nichts da ist. */
  undo: () => string | null;
  redo: () => string | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Leert beide Stapel — z.B. beim Laden eines ANDEREN Setups: ein
   *  Rückgängig über einen Setup-Wechsel hinweg würde in einen fremden
   *  Stand springen, das wäre verwirrend statt hilfreich. */
  resetHistory: () => void;
}

const Ctx = createContext<GrafikCtx | null>(null);

export function useGrafiken(): GrafikCtx | null {
  return useContext(Ctx);
}

export function GrafikProvider({ children }: { children: ReactNode }) {
  /* Startpunkt = der LIVE-Stand der Landing (grafik.config.json), damit der
     Editor den echten Zustand weiterbearbeitet statt bei Null anzufangen. */
  const [grafiken, setGrafiken] = useState<Grafik[]>(() =>
    KONFIG_GRAFIKEN.map((g) => ({ ...g, keyframes: g.keyframes.map((k) => ({ ...k })) })),
  );
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [auswahlMehr, setAuswahlMehr] = useState<string[]>([]);
  const [gelockt, setGelockt] = useState(false);
  const [uebernommen, setUebernommen] = useState<string[]>(() => [...KONFIG_UEBERNOMMEN]);

  /* Der gemeinsame Undo-Bus (in /editor über der Shell gemountet, aktiver
     Scope „animator"). null, falls kein Provider darüber hängt — dann bleibt
     Grafik ohne Historie (commit/undo werden zu No-Ops); passiert im Editor
     nicht, ist aber ein defensiver Schutz. */
  const bus = useUndoBus();

  /* Live-Spiegel des aktuellen Verlaufs-Zustands für die Befehl-Closures:
     `undo` stellt den Vor-Zustand her, `redo` den beim Undo eingefangenen
     Nach-Zustand. Zuweisung im Render-Body (reiner Spiegel, wie zustandRef in
     app/editor/page.tsx) — so lesen die Closures IMMER den jüngsten Stand. */
  const liveRef = useRef<VerlaufZustand>({ grafiken, uebernommen });
  liveRef.current = { grafiken, uebernommen };

  /* Gemeinsamer Redo-Halter der laufenden Coalesce-Geste (gleiche Gruppe im
     600-ms-Fenster) — s. Block-Kommentar oben. Fenster/Konstante identisch zum
     Bus (VERLAUF_COALESCE_MS aus coalesce.ts), damit Halter-Wiederverwendung
     und Bus-Zusammenfassung deckungsgleich bleiben. */
  const gestenHalterRef = useRef<{
    gruppe: string;
    zeit: number;
    halter: { nach: VerlaufZustand | null };
  } | null>(null);

  /* Sichert den AKTUELLEN (Vor-Änderungs-)Zustand als Befehl auf dem Bus.
     API-kompatibel zu ALLEN heutigen Aufrufern: IMMER VOR der eigentlichen
     Änderung rufen. `gruppe` gesetzt + letzter Commit derselben Gruppe < 600ms
     her → der Bus fasst zusammen (die laufende Geste zählt weiter als EIN
     Schritt). `zustand` überschreibt den live gelesenen Vor-Zustand — für den
     Canvas-Zug, der erst beim Loslassen mit dem am Zug-Start gemerkten Stand
     committet. */
  function commit(label: string, gruppe?: string, zustand?: VerlaufZustand) {
    if (!bus) return;
    const vor = zustand ?? liveRef.current;
    const jetzt = Date.now();

    /* Halter der laufenden Geste wiederverwenden (gleiche Gruppe im Fenster),
       sonst einen frischen anlegen; ohne Gruppe (diskrete Aktion) die Geste
       beenden, damit ein folgender gruppierter Commit frisch startet. */
    let halter: { nach: VerlaufZustand | null };
    const laufend = gestenHalterRef.current;
    if (gruppe && laufend && laufend.gruppe === gruppe && jetzt - laufend.zeit < VERLAUF_COALESCE_MS) {
      halter = laufend.halter;
      laufend.zeit = jetzt;
    } else {
      halter = { nach: null };
      gestenHalterRef.current = gruppe ? { gruppe, zeit: jetzt, halter } : null;
    }

    const befehl: Befehl = {
      label,
      /* Domänen-Präfix „grafik:" (Risiko R-f): der Bus coalesct nur bei gleicher
         Gruppe — das Präfix verhindert das Zusammenfassen mit einem gleichnamigen
         Fluss-Befehl auf demselben „animator"-Scope. Die Halter-Coalesce oben
         vergleicht bewusst die ROH-Gruppe (produzenten-intern, 1:1-Mapping). */
      gruppe: gruppe ? `grafik:${gruppe}` : undefined,
      undo: () => {
        /* Vor dem Zurücksetzen den aktuellen (Nach-)Zustand fürs spätere Redo
           einfangen — exakt das „Live-Lesen beim Undo" der alten Mechanik. */
        halter.nach = liveRef.current;
        setGrafiken(vor.grafiken);
        setUebernommen(vor.uebernommen);
      },
      redo: () => {
        const nach = halter.nach;
        if (!nach) return;
        setGrafiken(nach.grafiken);
        setUebernommen(nach.uebernommen);
      },
    };
    bus.push(befehl);
  }

  /* undo/redo/canUndo/canRedo/resetHistory delegieren an den aktiven Scope des
     Bus (in /editor: „animator"). Rückgabe von undo/redo = Label für die
     Statuszeile, null wenn nichts da ist — identisch zur alten Signatur. */
  function undo(): string | null {
    return bus?.undo() ?? null;
  }

  function redo(): string | null {
    return bus?.redo() ?? null;
  }

  function resetHistory() {
    bus?.resetHistory();
    gestenHalterRef.current = null;
  }

  const canUndo = bus?.canUndo ?? false;
  const canRedo = bus?.canRedo ?? false;

  return (
    <Ctx.Provider
      value={{
        grafiken,
        setGrafiken,
        auswahl,
        setAuswahl,
        auswahlMehr,
        setAuswahlMehr,
        gelockt,
        setGelockt,
        uebernommen,
        setUebernommen,
        commit,
        undo,
        redo,
        canUndo,
        canRedo,
        resetHistory,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
