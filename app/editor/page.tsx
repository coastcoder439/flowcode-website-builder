"use client";

/*
 * /editor – EIN vereinheitlichter Animations-Editor (Welle 2a, verlustfreier
 * Zwischenschritt). Rendert die KOMPLETTE echte Landing (HomePageContent) und
 * legt BEIDE bestehenden Editor-Overlays gleichzeitig darüber: das
 * Grafik-Editor-Panel (links, .gre-panel) UND das Fluss-Editor-Panel (oben
 * rechts, .rke-panel). Beide funktionieren nebeneinander wie auf den heutigen
 * Einzel-Routen — das Panel-Layout selbst wird hier NICHT umgebaut (das ist
 * Welle 2b).
 *
 * Die bisherigen Einzel-Routen /grafik-editor und /fluss-editor mounteten je
 * NUR ihren eigenen Provider (GrafikProvider bzw. RiverKursProvider). Hier
 * liegen ALLE DREI Provider gemeinsam gemountet, in der von der Bauvorlage
 * (docs/editor-vereinheitlichung.md §1) vorgegebenen Reihenfolge:
 * BackdropProvider (außen) → RiverKursProvider → GrafikProvider.
 *
 * WARUM das ohne Doppel-Render funktioniert: HomePageContent rendert IMMER
 * genau EIN <RiverFlow> und EIN <GrafikLayer>, unabhängig davon, welche
 * Provider vorhanden sind. Beide Komponenten lesen ihren jeweiligen Kontext
 * über einen OPTIONALEN Hook (useRiverKurs()/useGrafiken(), null ohne
 * Provider). Ein zweiter Provider macht also nur den zweiten Kontext
 * verfügbar — es entsteht kein zusätzliches Bühnen-Element. Die
 * Höhen-Normalisierungs-Invariante (Inventar §4.4 / Risiko 7) bleibt gewahrt:
 * sobald GrafikProvider vorhanden ist (ctx truthy in GrafikLayer), wird der
 * authoredDocH-Prop-Pfad übersprungen → keine Doppel-Skalierung.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HomePageContent } from "@/components/HomePageContent";
import { GrafikProvider } from "@/components/grafik/GrafikContext";
import { GrafikEditor } from "@/components/grafik/GrafikEditor";
import {
  ProduktTutorial,
  produktTutorialAlsGesehenMerken,
  produktTutorialNochNichtGesehen,
} from "@/components/grafik/ProduktTutorial";
import { RiverKursProvider } from "@/components/river/RiverKursContext";
import { FlussObjektProvider } from "@/components/river/FlussObjektContext";
import { FlussHandlesEbene } from "@/components/river/FlussHandlesEbene";
import "@/components/river/river-kurs-editor.css";
import { Backdrop } from "@/components/backdrop/Backdrop";
import type { Backdrop as BackdropDaten } from "@/components/backdrop/backdrop-types";
import { BackdropProvider, useBackdropCtx } from "@/components/backdrop/BackdropContext";
import { UndoBusProvider, useUndoBus, sollUndoShortcutGreifen } from "@/components/undo/UndoBus";
import { entferneAktiveSeite, setzeAktiveSeite, useAktiveSeite } from "@/lib/aktive-seite";
import { SeitenBereich } from "./SeitenBereich";
import { SeitenImport } from "./SeitenImport";
import { Station4Preview } from "./Station4Preview";
import {
  leseZustand,
  urlVon,
  verlaesstOffenenPuck,
  type Station,
  type Sub,
  type Zustand,
} from "./stationen";
import "./seiten-bereich.css";

/** Vorhang-Latch (TitleCurtain: "wee-title-curtain-seen") lösen, damit die
 *  originale Scroll-Animation inkl. Tropfen bei JEDEM Laden läuft — sonst
 *  editiert Leon auf einer Bühne, die im Instant-Modus hängt und so nie
 *  entsteht. Bewusst im Render-Body (nicht im Effect): Kind-Effekte laufen
 *  VOR den Eltern-Effekten, der Latch muss aber gelöscht sein, bevor
 *  TitleCurtain ihn liest. Nur EINMAL pro Laufzeit (Modul-Flag) — sonst
 *  schriebe jeder Editor-Render (jeder Drag-Frame!) erneut in den Storage.
 *  Exakt dasselbe Muster wie die heutigen Einzel-Routen. */
let latchGeloest = false;

function vorhangLatchLoesen() {
  if (latchGeloest || typeof window === "undefined") return;
  latchGeloest = true;
  try {
    window.sessionStorage.removeItem("wee-title-curtain-seen");
  } catch {
    /* Storage gesperrt → Vorhang läuft ohnehin */
  }
}

/** Liest den Backdrop-Zustand (BackdropProvider) und reicht ihn — falls
 *  gesetzt — als Prop an HomePage durch (gleiches Muster wie GrafikEditorInner
 *  / FlussEditorInner der heutigen Einzel-Routen). Eigene Komponente statt
 *  Inline im Page-Export: useBackdropCtx() braucht einen Nachfahren von
 *  <BackdropProvider>, der Export selbst rendert den Provider erst.
 *
 *  Die Bühne (RiverFlow + GrafikLayer) steckt IN der HomePageContent — hier
 *  kommen die drei Provider (Editor-Zustand schlägt die Config) und das EINE
 *  Grafik-Panel dazu.
 *
 *  Welle 2b-1: Der Fluss ist jetzt ein OBJEKT im Grafik-Panel, kein eigenes
 *  Panel mehr. Deshalb wird das frühere .rke-Panel (RiverKursEditor) hier
 *  NICHT mehr gemountet. Stattdessen:
 *    - FlussObjektProvider hält den Fluss-Fokus + die Fluss-Maschinerie
 *      (INNEN, damit GrafikEditor beide Contexts sieht und die gegenseitige
 *      Auswahl-Ausschließlichkeit Grafik ↔ Fluss verdrahten kann),
 *    - GrafikEditor zeigt den Fluss als Ebenen-Eintrag + im „Bild"-Reiter,
 *    - FlussHandlesEbene rendert die Knoten-Handles NUR bei Fluss-Fokus.
 *  river-kurs-editor.css (oben importiert) liefert weiterhin die Styles für
 *  die Handle-Ebene (.rke-layer/.rke-knoten) und die Fluss-Sektionen (.rke-*).
 */
function EditorInner({ onProduktTutorial }: { onProduktTutorial: () => void }) {
  const bctx = useBackdropCtx();
  /* Welle 5b (§10/5b): die „aktive Website" ist die Default-Buehne des
     Animators — statt der eingebauten WEE-Demo-Landing. */
  const aktiveSeite = useAktiveSeite();
  /* Die geladenen Seiten-Namen (null = noch nicht geladen / Server-Fehler,
     also „Existenz unbekannt"). Traegt sowohl den Self-Heal der aktiven Seite
     als auch die N19-Absicherung des Backdrops (s. effektiverBackdrop). */
  const [seitenNamen, setSeitenNamen] = useState<string[] | null>(null);

  /* Seiten-Liste laden (§10/5b: „wenn ... gesetzt ist UND existiert"). Nur bei
     einem definitiven „Liste geladen, Name fehlt" wird die verwaiste aktive
     Seite vergessen (self-heal) — bei Server-Fehlern bleibt sie gemerkt
     (seitenNamen = null → „unbekannt"), wir zeigen diese Sitzung nur die
     Demo-Landing. Die Liste wird IMMER geholt (nicht nur bei gesetzter aktiver
     Seite), damit auch ein expliziter „puck-seite"-Backdrop gegen sie geprueft
     werden kann (N19). */
  useEffect(() => {
    let tot = false;
    void (async () => {
      try {
        const res = await fetch("/api/puck-seite/liste", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const json = (await res.json()) as { seiten?: { name: string }[] };
        if (tot) return;
        const listeOk = res.ok && Array.isArray(json.seiten);
        if (!listeOk) {
          setSeitenNamen(null);
          return;
        }
        const namen = json.seiten!.map((s) => s.name);
        setSeitenNamen(namen);
        if (aktiveSeite && !namen.includes(aktiveSeite)) entferneAktiveSeite();
      } catch {
        if (!tot) setSeitenNamen(null);
      }
    })();
    return () => {
      tot = true;
    };
  }, [aktiveSeite]);

  const aktivExistiert = !!(aktiveSeite && seitenNamen?.includes(aktiveSeite));

  /* Effektive Buehne:
     - Explizit gewaehlter Backdrop schlaegt alles (Backdrop-Persistenz bleibt
       unangetastet, Inventar §4.1/Risiko 5). "demo-landing" ist der Sentinel
       fuer „ausdruecklich die WEE-Landing" → kein Backdrop (echte Landing).
     - N19 (lens-undo.md §2.5): ein „puck-seite"-Backdrop, dessen Seite
       nachweislich nicht mehr in der geladenen Liste steht, wuerde eine
       404-Buehne nachladen (Dauerfehler) → auf die Fallback-Buehne zuruecknehmen
       (null). Nur unterdruecken, wenn die Liste WIRKLICH geladen ist
       (seitenNamen !== null) und den Namen NICHT enthaelt; solange die Existenz
       unbekannt ist (null), den Backdrop zeigen (kein Aufblitzen). Zusaetzliche
       Sicherung zum Direktpfad-Heal beim Loeschen (SeitenBereich).
     - Sonst (nichts gewaehlt): die aktive Website, falls gesetzt und vorhanden.
     - Fallback: echte WEE-Landing (wie bisher). */
  const explizit = bctx?.backdrop ?? null;
  const effektiverBackdrop: BackdropDaten | null = explizit
    ? explizit.art === "demo-landing"
      ? null
      : explizit.art === "puck-seite" &&
          seitenNamen !== null &&
          !seitenNamen.includes(explizit.quelle)
        ? null
        : explizit
    : aktiveSeite && aktivExistiert
      ? { art: "puck-seite", quelle: aktiveSeite, name: aktiveSeite }
      : null;

  return (
    <RiverKursProvider>
      <GrafikProvider>
        <FlussObjektProvider>
          <HomePageContent backdrop={effektiverBackdrop ? <Backdrop backdrop={effektiverBackdrop} /> : undefined} />
          {/* Das EINE Panel (.gre-panel) — bringt sein eigenes Tutorial
              (localStorage-Latch "wee-grafik-tutorial-gesehen") und CSS mit.
              Enthält seit 2b-1 auch das Fluss-Objekt. Phase 1/F5: die Produkt-
              Tour ist auf Shell-Ebene gewandert — der „?"-Kopf-Knopf öffnet sie
              über diese durchgereichte Callback wieder. */}
          <GrafikEditor onProduktTutorial={onProduktTutorial} />
          {/* Knoten-Handles über der Bühne — nur aktiv bei Fluss-Fokus. */}
          <FlussHandlesEbene />
        </FlussObjektProvider>
      </GrafikProvider>
    </RiverKursProvider>
  );
}

/* ---- Phase 1 / F1: Vier-Stationen-Shell (docs/plan-analyse/lens-flow.md §2) ----
 *
 * Ersetzt den bisherigen 2-Reiter-Umschalter „Animator | Seiten" durch eine
 * 4-Stationen-Navigation in Flow-Reihenfolge (R3):
 *   1. Importieren · 2. Seite bauen · 3. Animieren · 4. Vorschau & Export.
 *
 * Der Zustand bleibt bewusst im Query-Param statt in einer eigenen Route
 * (Begruendung unveraendert, docs/editor-vereinheitlichung.md §9/4a):
 *   - `output: "export"` erzeugt EINE statische /editor-Shell; eine dynamische
 *     Unterroute braeuchte generateStaticParams und wuerde den bewusst
 *     isolierten Animator-Einstieg zerschneiden.
 *   - Der Query-Param ist reload-fest (beim Laden aus window.location gelesen)
 *     und teilbar, ohne den Router-Baum anzufassen.
 *   - History via pushState/popstate statt useSearchParams: letzteres zwingt
 *     unter Next 15 zu einer Suspense-Grenze und CSR-Bailout — hier unnoetig.
 *
 * URL-Wahrheit: `?station=import|bauen|animator|preview` (Default `import`).
 * Abwaertskompatibilitaet: der Alt-Param `?bereich=seiten` wird auf `bauen`
 * gemappt, damit geteilte Alt-Links gueltig bleiben.
 *
 * Was pro Station mountet (additiv, nichts geht verloren — feature-inventar §1):
 *   - import   → SeitenImport als eigener Voll-Bereich (echte Station 1, F4 —
 *                kein importOffen-Unterzustand in SeitenBereich mehr); onFertig →
 *                navigiere("bauen", Puck der frisch importierten Seite).
 *   - bauen    → der bisherige SeitenBereich (Liste + Puck-Editor).
 *   - animator → unveraendert BackdropProvider → EditorInner.
 *   - preview  → Station4Preview: klickbare iframe-Vorschau des INLINE-Artefakts
 *                der aktiven Website (= Export-Wahrheit, M23/N14) + ausklappbares
 *                Export-Fenster (Ordner primaer, 5 Datei-Wege sekundaer, M25).
 *
 * F2 (docs/plan-analyse/lens-flow.md §3-S3): Der zentrale History-Reducer
 * `navigiere(station, sub?)` (unten in EditorPage) ist jetzt die EINE Stelle,
 * die pushState schreibt — fuer ALLE Wechsel inkl. Puck-Oeffnen und Vorschau.
 * Typen und URL-Helfer liegen in ./stationen (frei von React), damit page.tsx
 * und SeitenBereich.tsx dieselbe URL-Wahrheit lesen, ohne je einen zweiten
 * popstate-Listener zu fuehren. Dazu: Dirty-Guard (In-App-Dialog + beforeunload)
 * beim Verlassen eines ungespeicherten Puck-Editors und ein `document.title` je
 * Station. */

/** Reihenfolge = Flow-Reihenfolge (R3); auch die Tastatur-Navigation nutzt sie. */
const STATIONEN: { id: Station; label: string; hilfe: string }[] = [
  { id: "import", label: "1 · Importieren", hilfe: "Eine fertige Website einlesen und in Bausteine zerlegen" },
  { id: "bauen", label: "2 · Seite bauen", hilfe: "Seiten verwalten und im Baukasten-Editor (Puck) zusammensetzen" },
  { id: "animator", label: "3 · Animieren", hilfe: "Scroll-Animationen ueber der aktiven Website gestalten" },
  { id: "preview", label: "4 · Vorschau & Export", hilfe: "Fertige Seite klickbar ansehen und als Ordner oder Einzeldatei exportieren" },
];

/** Browser-Tab-Titel je Station (N16, Rest): macht Tabs/Lesezeichen/Teilen-
 *  Vorschauen unterscheidbar. `layout.tsx` liefert nur den neutralen Default. */
const STATIONS_TITEL: Record<Station, string> = {
  import: "1 · Import — Flowcode Builder",
  bauen: "2 · Seite bauen — Flowcode Builder",
  animator: "3 · Animieren — Flowcode Builder",
  preview: "4 · Vorschau & Export — Flowcode Builder",
};

function StationsNav({ station, onWechsel }: { station: Station; onWechsel: (s: Station) => void }) {
  /* Roving-tabIndex: nur der aktive Reiter ist per Tab erreichbar; Pfeiltasten
     wandern innerhalb der Leiste. */
  const refs = useRef<Record<Station, HTMLButtonElement | null>>({
    import: null,
    bauen: null,
    animator: null,
    preview: null,
  });

  /* Pfeiltasten wandern durch die Stationen (WAI-ARIA-Tabs), Home/End an die
     Enden — zyklisch, entlang der Flow-Reihenfolge. */
  function beiTaste(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const i = STATIONEN.findIndex((s) => s.id === station);
    const zielIndex =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? STATIONEN.length - 1
          : e.key === "ArrowRight"
            ? (i + 1) % STATIONEN.length
            : (i - 1 + STATIONEN.length) % STATIONEN.length;
    const ziel = STATIONEN[zielIndex].id;
    onWechsel(ziel);
    refs.current[ziel]?.focus();
  }

  return (
    <div className="editor-umschalter" role="tablist" aria-label="Editor-Stationen" onKeyDown={beiTaste}>
      {STATIONEN.map((s) => (
        <button
          key={s.id}
          ref={(el) => {
            refs.current[s.id] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${s.id}`}
          aria-selected={station === s.id}
          aria-controls="stations-panel"
          tabIndex={station === s.id ? 0 : -1}
          title={s.hilfe}
          onClick={() => onWechsel(s.id)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** In-App-Bestaetigung beim Verlassen eines ungespeicherten Puck-Editors
 *  (N20). Bewusst KEIN natives confirm(): ein eigenes Overlay ist testbar und
 *  in Phase 6 stylbar. Reine Optik-Klassen aus seiten-bereich.css
 *  wiederverwendet (Design folgt spaeter). */
function VerlassenDialog({
  onAbbrechen,
  onVerlassen,
}: {
  onAbbrechen: () => void;
  onVerlassen: () => void;
}) {
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
      data-fc-verlassen-overlay=""
      onClick={(e) => {
        if (e.target === e.currentTarget) onAbbrechen();
      }}
    >
      <div
        ref={dialogRef}
        className="seiten-hilfe-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="verlassen-titel"
        aria-describedby="verlassen-text"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onAbbrechen();
        }}
      >
        <h2 id="verlassen-titel">Ungespeicherte Änderungen — wirklich verlassen?</h2>
        <p id="verlassen-text">
          Diese Seite hat Änderungen, die noch nicht gespeichert sind. Wenn du den Editor jetzt
          verlässt, gehen sie verloren.
        </p>
        <div className="seiten-hilfe-dialog-fuss">
          <button
            type="button"
            className="seiten-btn"
            onClick={onAbbrechen}
            title="Zurück zum Editor — Änderungen behalten"
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="seiten-btn seiten-btn--gefahr"
            onClick={onVerlassen}
            title="Editor verlassen und ungespeicherte Änderungen verwerfen"
          >
            Verlassen
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aktiviert den Undo-Scope „animator" für die Dauer der Animator-Station
 *  (U1, docs/plan-analyse/lens-undo.md §2.3): pushScope beim Mount, popScope +
 *  Historie leeren beim Verlassen. Der Grafik-Zustand setzt sich beim
 *  Stationswechsel ohnehin zurück (EditorInner/GrafikProvider re-mounten), also
 *  ist eine über den Wechsel hinweg erhaltene Historie wertlos und wird beim
 *  Verlassen bewusst geleert — dasselbe Verhalten wie der frühere Per-Mount-
 *  Verlauf des Grafik-Editors.
 *
 *  WICHTIG: nur an die STABILEN Bus-Callbacks gekoppelt (nicht an das ganze
 *  Bus-Objekt) — sonst liefe der Effekt bei jeder canUndo-Änderung neu und
 *  würde die Historie bei JEDEM Commit leeren. */
function AnimatorUndoScope({ children }: { children: ReactNode }) {
  const bus = useUndoBus();
  const pushScope = bus?.pushScope;
  const popScope = bus?.popScope;
  const resetHistory = bus?.resetHistory;
  useEffect(() => {
    if (!pushScope || !popScope) return;
    pushScope("animator");
    return () => {
      resetHistory?.();
      popScope();
    };
  }, [pushScope, popScope, resetHistory]);
  return <>{children}</>;
}

/** Aktiviert den Undo-Scope „bauen" für die Dauer der Bauen-Station und stellt
 *  fuer die Seiten-LISTE das Strg+Z/Strg+Y bereit (U8, lens-undo.md §2.5/§3-U8).
 *  Der Loesch-Befehl (SeitenBereich.loesche) landet via bus.push auf diesem
 *  Scope; hier haengt der passende Tastatur-Vertrag daran — dieselbe Kürzel-Regel
 *  wie im Animator (GrafikEditor), inkl. Textfeld-Guard (das „Neue Seite"-Feld
 *  behaelt sein natives Zeichen-Undo).
 *
 *  WICHTIG: Der Handler greift NUR, wenn „bauen" der AKTIVE (oberste) Scope ist.
 *  Sobald ein Puck-Editor offen ist, hat PuckUndoBruecke den „puck"-Scope oben
 *  aufgelegt (Bruecke an Pucks eigene Historie) — dann darf UNSER Handler nicht
 *  feuern, sonst kaempft er mit Pucks eigenem Strg+Z-Hotkey (der N4-Fight).
 *  Deshalb der aktiverScope-Wächter. Wie AnimatorUndoScope nur an die STABILEN
 *  Bus-Callbacks gekoppelt; den jeweils juengsten Scope/undo/redo liest der
 *  Handler ueber Refs, damit er nicht bei jedem Commit neu bindet. */
function BauenUndoScope({ children }: { children: ReactNode }) {
  const bus = useUndoBus();
  const pushScope = bus?.pushScope;
  const popScope = bus?.popScope;
  const resetHistory = bus?.resetHistory;

  /* Ref-Spiegel: der Tastatur-Handler wird EINMAL gebunden, liest aber stets den
     aktuellen Scope + die aktuellen undo/redo-Callbacks. */
  const scopeRef = useRef<string | null>(bus?.aktiverScope ?? null);
  scopeRef.current = bus?.aktiverScope ?? null;
  const undoRef = useRef(bus?.undo);
  undoRef.current = bus?.undo;
  const redoRef = useRef(bus?.redo);
  redoRef.current = bus?.redo;

  useEffect(() => {
    if (!pushScope || !popScope) return;
    pushScope("bauen");
    return () => {
      resetHistory?.();
      popScope();
    };
  }, [pushScope, popScope, resetHistory]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const strg = e.ctrlKey || e.metaKey;
      if (!strg || e.altKey) return;
      const taste = e.key.toLowerCase();
      if (taste !== "z" && taste !== "y") return;
      /* Nur wenn „bauen" oben liegt (kein Puck offen) — sonst macht Pucks
         eigener Hotkey das Undo. */
      if (scopeRef.current !== "bauen") return;
      /* Textfeld (z. B. „Neue Seite"-Name) → natives Zeichen-Undo behalten. */
      if (!sollUndoShortcutGreifen(e.target)) return;
      if (taste === "y" && e.shiftKey) return; // Strg+Umschalt+Y ist kein Kürzel
      e.preventDefault();
      if (taste === "y" || e.shiftKey) redoRef.current?.();
      else undoRef.current?.();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <>{children}</>;
}

export default function EditorPage() {
  const [zustand, setZustand] = useState<Zustand>({ station: "import", sub: null });

  /* Spiegel des aktuellen Zustands fuer die stabilen Callbacks (navigiere,
     popstate): so lesen sie den JUENGSTEN Wert, ohne selbst neu gebunden zu
     werden. Zuweisung im Render-Body ist fuer einen reinen Spiegel unkritisch. */
  const zustandRef = useRef<Zustand>(zustand);
  zustandRef.current = zustand;

  /* Dirty-Check des offenen Puck-Editors: SeitenBereich registriert hier seine
     Vergleichsfunktion (aktuelleDaten ≠ zuletzt gespeicherter Stand). Default
     „nichts ungespeichert", falls kein Editor offen/gemountet ist. */
  const istUngespeichertRef = useRef<() => boolean>(() => false);

  /* Ausstehende „Verlassen?"-Aktion: gesetzt ⇒ Dialog offen. Der Wert ist die
     Funktion, die NACH Bestaetigung den eigentlichen Wechsel ausfuehrt. */
  const [verlassenAktion, setVerlassenAktion] = useState<null | (() => void)>(null);

  /* Phase 1/F5 (docs/plan-analyse/lens-flow.md §3-S6): Das Produkt-Onboarding
     (Latch "wee-produkt-tutorial-gesehen") lebt jetzt auf Shell-Ebene statt im
     Animator-Panel (M2-Fix). Es feuert automatisch beim ersten /editor-Besuch
     auf Station 1 (Import, s. Mount-Effekt unten) und ist danach nur noch
     manuell ueber das „?"-Kopf-Menue des Animators aufrufbar (Callback an
     EditorInner). Latch-Key und ProduktTutorial-Inhalt bleiben unveraendert. */
  const [produktTutorialOffen, setProduktTutorialOffen] = useState(false);

  /** Schliessen merkt IMMER „gesehen" (Los geht's / ✕ / Esc / Hintergrund-Klick
   *  rufen alle onSchliessen). Setzt denselben Latch wie zuvor im Animator. */
  const produktTutorialSchliessen = useCallback(() => {
    produktTutorialAlsGesehenMerken();
    setProduktTutorialOffen(false);
  }, []);

  /* Der einzige Schreiber der History: setzt den Zustand und schiebt EINEN
     konsistenten pushState-Eintrag — fuer JEDEN Wechsel (Station, Puck-Oeffnen,
     Vorschau). */
  const fuehreNavigationAus = useCallback((neu: Zustand) => {
    setZustand(neu);
    window.history.pushState(null, "", urlVon(neu));
  }, []);

  /* Zentraler History-Reducer: ALLE Wechsel laufen hierdurch. Verlaesst der
     Wechsel einen ungespeicherten Puck-Editor, wird zuerst der In-App-Dialog
     gezeigt; erst „Verlassen" fuehrt den Wechsel aus. */
  const navigiere = useCallback(
    (ziel: Station, sub: Sub = null) => {
      const neu: Zustand = { station: ziel, sub };
      if (verlaesstOffenenPuck(zustandRef.current, neu) && istUngespeichertRef.current()) {
        setVerlassenAktion(() => () => fuehreNavigationAus(neu));
        return;
      }
      fuehreNavigationAus(neu);
    },
    [fuehreNavigationAus],
  );

  /* Erst nach dem Mount aus der URL lesen (hydration-sicher: Prerender und erste
     Client-Runde zeigen den Default „import", danach korrigiert der Effect auf
     den echten Zustand). EIN popstate-Listener haelt Vor/Zurueck synchron —
     inklusive Dirty-Guard fuer Browser-Zurueck aus einem offenen Puck. */
  useEffect(() => {
    const anfang = leseZustand();
    setZustand(anfang);
    /* F5: Produkt-Tour beim ersten /editor-Besuch auf Station 1 (Import)
       automatisch zeigen — gegated durch den unveraenderten Latch. Bewusst hier
       (nach dem echten URL-Lesen), damit ein Deep-Link auf eine andere Station
       die Tour NICHT faelschlich oeffnet; der Default-Einstieg ist ohnehin
       „import". Danach nie wieder von selbst (Latch), nur ueber das „?"-Menue. */
    if (anfang.station === "import" && produktTutorialNochNichtGesehen()) {
      setProduktTutorialOffen(true);
    }
    function beiPop() {
      const neu = leseZustand();
      const alt = zustandRef.current;
      if (verlaesstOffenenPuck(alt, neu) && istUngespeichertRef.current()) {
        /* Der Browser hat die URL schon auf `neu` gestellt. Wir schieben den
           Puck-Stand zurueck in die History, damit URL + sichtbarer Editor
           zusammenpassen, solange der Dialog offen ist. Bei „Verlassen" fuehrt
           die Aktion den Wechsel dann sauber nach vorne aus. */
        window.history.pushState(null, "", urlVon(alt));
        setVerlassenAktion(() => () => fuehreNavigationAus(neu));
        return;
      }
      setZustand(neu);
    }
    window.addEventListener("popstate", beiPop);
    return () => window.removeEventListener("popstate", beiPop);
  }, [fuehreNavigationAus]);

  /* Echtes Tab-/Fenster-Schliessen (kein SPA-Wechsel): der Browser zeigt seine
     eigene Rueckfrage, sobald ungespeicherte Puck-Aenderungen offen sind. */
  useEffect(() => {
    function beiUnload(e: BeforeUnloadEvent) {
      if (istUngespeichertRef.current()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", beiUnload);
    return () => window.removeEventListener("beforeunload", beiUnload);
  }, []);

  /* N16 (Rest): Browser-Tab-Titel je Station. Next stellt beim Hydratisieren
     der Metadata den Layout-Titel EINMAL wieder her — der Erst-Lauf dieses
     Effekts verliert dieses Rennen (beobachtet: Erstaufruf /editor/ blieb auf
     dem Default). Deshalb verteidigt ein MutationObserver den Stations-Titel,
     statt auf Timing zu hoffen. */
  useEffect(() => {
    const soll = STATIONS_TITEL[zustand.station];
    document.title = soll;
    const titelEl = document.querySelector("title");
    if (!titelEl) return;
    const beobachter = new MutationObserver(() => {
      if (document.title !== soll) document.title = soll;
    });
    beobachter.observe(titelEl, { childList: true, characterData: true, subtree: true });
    return () => beobachter.disconnect();
  }, [zustand.station]);

  /* Vorhang-Latch nur loesen, wenn der Animator (mit TitleCurtain) wirklich
     rendert — in den anderen Stationen ist die Buehne gar nicht gemountet. */
  if (zustand.station === "animator") vorhangLatchLoesen();

  const { station, sub } = zustand;

  return (
    /* U1 (docs/plan-analyse/lens-undo.md §2): EIN Undo-Bus über der ganzen
       Editor-Shell. Er bleibt über Stationswechsel hinweg gemountet (Scopes
       segmentieren die Historie je Station); aktiv wird der „animator"-Scope
       aber nur, solange die Animator-Station läuft (AnimatorUndoScope unten). */
    <UndoBusProvider>
      <StationsNav station={station} onWechsel={(s) => navigiere(s)} />
      {station === "animator" ? (
        /* display:contents → der Wrapper ist layout-neutral, der Animator bleibt
           pixelgleich zu heute; die fixierten Overlays haengen ohnehin am Viewport. */
        <div
          id="stations-panel"
          role="tabpanel"
          aria-labelledby="tab-animator"
          style={{ display: "contents" }}
        >
          <BackdropProvider>
            <AnimatorUndoScope>
              <EditorInner onProduktTutorial={() => setProduktTutorialOffen(true)} />
            </AnimatorUndoScope>
          </BackdropProvider>
        </div>
      ) : station === "preview" ? (
        <Station4Preview onZurueck={() => navigiere("animator")} />
      ) : station === "import" ? (
        /* F4 (lens-flow.md §3-S5): Import ist jetzt eine ECHTE Station 1 — der
           Assistent wird direkt hier als Voll-Bereich gemountet, nicht mehr als
           importOffen-Unterzustand in SeitenBereich. Nach dem Speichern wird die
           importierte Seite die aktive Website (Welle 5b) und oeffnet sich ueber
           den zentralen Reducer direkt im Puck der Station „bauen" — auch ueber
           den Stations-Remount import→bauen hinweg (der Sub-Loader dort laedt die
           frische Seite). „Zurueck zur Liste" (onAbbruch) fuehrt nach „bauen". */
        <div
          className="editor-seiten-flaeche"
          id="stations-panel"
          role="tabpanel"
          aria-labelledby="tab-import"
          tabIndex={0}
        >
          <SeitenImport
            onFertig={(frischerName) => {
              setzeAktiveSeite(frischerName);
              navigiere("bauen", { art: "puck", seite: frischerName });
            }}
            onAbbruch={() => navigiere("bauen")}
          />
        </div>
      ) : (
        /* Station „bauen": Seiten-Liste + Puck-Editor. Der Sub-Zustand (offener
           Puck / statische Vorschau) kommt per Prop aus der Shell — SeitenBereich
           fuehrt KEINEN eigenen popstate-Listener mehr (N20-Wurzelbehebung). */
        <div
          className="editor-seiten-flaeche"
          id="stations-panel"
          role="tabpanel"
          aria-labelledby="tab-bauen"
          tabIndex={0}
        >
          <BauenUndoScope>
            <SeitenBereich
              sub={sub}
              navigiere={navigiere}
              istUngespeichertRef={istUngespeichertRef}
            />
          </BauenUndoScope>
        </div>
      )}
      {verlassenAktion && (
        <VerlassenDialog
          onAbbrechen={() => setVerlassenAktion(null)}
          onVerlassen={() => {
            const aktion = verlassenAktion;
            setVerlassenAktion(null);
            aktion();
          }}
        />
      )}
      {/* Phase 1/F5: Produkt-Tour auf Shell-Ebene — station-uebergreifend
          gemountet (feuert auf Station 1, manuell via Animator-„?"-Menue).
          Inhalt/Latch unveraendert (ProduktTutorial.tsx). */}
      <ProduktTutorial offen={produktTutorialOffen} onSchliessen={produktTutorialSchliessen} />
    </UndoBusProvider>
  );
}
