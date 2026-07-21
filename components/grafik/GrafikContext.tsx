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

/* --- Verlauf (Undo/Redo) --------------------------------------------
 * Lebt HIER statt in der UI (GrafikEditor.tsx), weil genau der Zustand, den
 * er sichert (grafiken + uebernommen), ebenfalls hier lebt — s. „Baum
 * übernehmen" in GrafikSeiteTab.tsx, das BEIDE Felder in einem Zug ändert
 * und deshalb auch als EIN Verlaufsschritt rückgängig gemacht werden muss.
 *
 * Snapshots halten nur ARRAY-REFERENZEN, keine Deep-Clones: der bestehende
 * Code aendert grafiken/uebernommen ohnehin nie in-place (map/filter =
 * neue Arrays/Objekte, s. GrafikEditor.tsx), Bild-BYTES stecken nur als
 * Referenz in Grafik.src (JS-Strings werden nicht dupliziert) — ein
 * Snapshot ist daher billig, auch 50 Stueck tief. */
const VERLAUF_LIMIT = 50;
/** Aenderungen an DERSELBEN Grafik/demselben Feld (Regler ziehen, tippen)
 *  werden innerhalb dieses Fensters zu EINEM Verlaufseintrag zusammengefasst
 *  — sonst waere ein Opacity-Slider-Zug hunderte Schritte lang. Der Canvas-
 *  Zug (verschieben) braucht das NICHT: der committet ohne Gruppe explizit
 *  genau einmal beim Loslassen (s. GrafikEditor.tsx onUp). */
const VERLAUF_COALESCE_MS = 600;

interface VerlaufZustand {
  grafiken: Grafik[];
  uebernommen: string[];
}

interface VerlaufEintrag extends VerlaufZustand {
  /** Kurzbeschreibung fuer die Statuszeile ("Rückgängig: <label>"). */
  label: string;
  /** Gruppierungsschluessel zum Zusammenfassen schneller Folgeaenderungen
   *  (z.B. "opacity:<id>:<kfIndex>"). Ohne Gruppe: immer ein eigener
   *  Eintrag (diskrete Aktionen wie Löschen/Duplizieren). */
  gruppe?: string;
  /** Zeitstempel (ms) des letzten Commits in dieser Gruppe. */
  zeit: number;
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

  /* Stapel liegen in Refs (nicht useState): sie aendern sich oft (jeder
     Regler-Tick), sollen aber NICHT bei jeder Aenderung neu rendern — nur
     die zwei Verfuegbarkeits-Booleans unten sind fuers UI (Knopf-Zustand)
     relevant und daher echter State. */
  const rueckgaengigStapel = useRef<VerlaufEintrag[]>([]);
  const wiederholenStapel = useRef<VerlaufEintrag[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  function aktualisiereVerfuegbarkeit() {
    setCanUndo(rueckgaengigStapel.current.length > 0);
    setCanRedo(wiederholenStapel.current.length > 0);
  }

  function commit(label: string, gruppe?: string, zustand?: VerlaufZustand) {
    const basis = zustand ?? { grafiken, uebernommen };
    const jetzt = Date.now();
    const stapel = rueckgaengigStapel.current;
    const oben = stapel[stapel.length - 1];
    if (gruppe && oben && oben.gruppe === gruppe && jetzt - oben.zeit < VERLAUF_COALESCE_MS) {
      /* Laufende Geste (Regler ziehen, tippen): Fenster verlaengern, KEIN
         neuer Eintrag — der urspruengliche "vorher"-Stand bleibt das
         Rueckgaengig-Ziel. Mutiert bewusst den Ref-Eintrag direkt (reines
         Buchfuehrungs-Objekt ausserhalb von React-State, s.o.) statt ihn zu
         ersetzen. */
      oben.zeit = jetzt;
      return;
    }
    stapel.push({ ...basis, label, gruppe, zeit: jetzt });
    if (stapel.length > VERLAUF_LIMIT) stapel.shift();
    /* Jede neue Aktion macht die "Zukunft" ungueltig — Standardverhalten
       jedes Undo-Managers (Browser, Office, …). */
    wiederholenStapel.current = [];
    aktualisiereVerfuegbarkeit();
  }

  function undo(): string | null {
    const eintrag = rueckgaengigStapel.current.pop();
    if (!eintrag) return null;
    wiederholenStapel.current.push({
      grafiken,
      uebernommen,
      label: eintrag.label,
      zeit: Date.now(),
    });
    if (wiederholenStapel.current.length > VERLAUF_LIMIT) wiederholenStapel.current.shift();
    setGrafiken(eintrag.grafiken);
    setUebernommen(eintrag.uebernommen);
    aktualisiereVerfuegbarkeit();
    return eintrag.label;
  }

  function redo(): string | null {
    const eintrag = wiederholenStapel.current.pop();
    if (!eintrag) return null;
    rueckgaengigStapel.current.push({
      grafiken,
      uebernommen,
      label: eintrag.label,
      zeit: Date.now(),
    });
    if (rueckgaengigStapel.current.length > VERLAUF_LIMIT) rueckgaengigStapel.current.shift();
    setGrafiken(eintrag.grafiken);
    setUebernommen(eintrag.uebernommen);
    aktualisiereVerfuegbarkeit();
    return eintrag.label;
  }

  function resetHistory() {
    rueckgaengigStapel.current = [];
    wiederholenStapel.current = [];
    aktualisiereVerfuegbarkeit();
  }

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
