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

import { useEffect, useRef, useState } from "react";
import { HomePageContent } from "@/components/HomePageContent";
import { GrafikProvider } from "@/components/grafik/GrafikContext";
import { GrafikEditor } from "@/components/grafik/GrafikEditor";
import { RiverKursProvider } from "@/components/river/RiverKursContext";
import { FlussObjektProvider } from "@/components/river/FlussObjektContext";
import { FlussHandlesEbene } from "@/components/river/FlussHandlesEbene";
import "@/components/river/river-kurs-editor.css";
import { Backdrop } from "@/components/backdrop/Backdrop";
import type { Backdrop as BackdropDaten } from "@/components/backdrop/backdrop-types";
import { BackdropProvider, useBackdropCtx } from "@/components/backdrop/BackdropContext";
import { entferneAktiveSeite, useAktiveSeite } from "@/lib/aktive-seite";
import { SeitenBereich } from "./SeitenBereich";
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
function EditorInner() {
  const bctx = useBackdropCtx();
  /* Welle 5b (§10/5b): die „aktive Website" ist die Default-Buehne des
     Animators — statt der eingebauten WEE-Demo-Landing. */
  const aktiveSeite = useAktiveSeite();
  const [aktivExistiert, setAktivExistiert] = useState(false);

  /* Existenz der aktiven Seite pruefen (§10/5b: „wenn ... gesetzt ist UND
     existiert"). Nur bei einem definitiven „Liste geladen, Name fehlt" wird die
     verwaiste aktive Seite vergessen (self-heal) — bei Server-Fehlern bleibt sie
     gemerkt, wir zeigen diese Sitzung nur die Demo-Landing. */
  useEffect(() => {
    if (!aktiveSeite) {
      setAktivExistiert(false);
      return;
    }
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
        const da = listeOk && json.seiten!.some((s) => s.name === aktiveSeite);
        setAktivExistiert(da);
        if (listeOk && !da) entferneAktiveSeite();
      } catch {
        if (!tot) setAktivExistiert(false);
      }
    })();
    return () => {
      tot = true;
    };
  }, [aktiveSeite]);

  /* Effektive Buehne:
     - Explizit gewaehlter Backdrop schlaegt alles (Backdrop-Persistenz bleibt
       unangetastet, Inventar §4.1/Risiko 5). "demo-landing" ist der Sentinel
       fuer „ausdruecklich die WEE-Landing" → kein Backdrop (echte Landing).
     - Sonst (nichts gewaehlt): die aktive Website, falls gesetzt und vorhanden.
     - Fallback: echte WEE-Landing (wie bisher). */
  const effektiverBackdrop: BackdropDaten | null = bctx?.backdrop
    ? bctx.backdrop.art === "demo-landing"
      ? null
      : bctx.backdrop
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
              Enthält seit 2b-1 auch das Fluss-Objekt. */}
          <GrafikEditor />
          {/* Knoten-Handles über der Bühne — nur aktiv bei Fluss-Fokus. */}
          <FlussHandlesEbene />
        </FlussObjektProvider>
      </GrafikProvider>
    </RiverKursProvider>
  );
}

/* ---- Welle 4a: Bereichs-Umschalter „Animator | Seiten" ----
 *
 * Der Zustand liegt im Query-Param `?bereich=seiten` statt in einer eigenen
 * Route. Begruendung (docs/editor-vereinheitlichung.md §9/4a laesst „Route
 * ODER Client-State — nach Code-Lage" offen):
 *   - `output: "export"` erzeugt EINE statische /editor-Shell; eine dynamische
 *     Unterroute `/editor/seiten/[name]` braeuchte generateStaticParams und
 *     wuerde den bestehenden, bewusst isolierten Animator-Einstieg zerschneiden.
 *   - Der Query-Param ist reload-fest (beim Laden aus window.location gelesen)
 *     und teilbar, ohne den Router-Baum anzufassen.
 *   - History via pushState/popstate statt useSearchParams: letzteres zwingt
 *     unter Next 15 zu einer Suspense-Grenze und CSR-Bailout — hier unnoetig.
 *
 * Der Animator-Zweig bleibt exakt der bisherige (BackdropProvider → EditorInner),
 * nur in einen layout-neutralen `display:contents`-tabpanel-Wrapper gehuellt. */
type Bereich = "animator" | "seiten";

function leseBereich(): Bereich {
  if (typeof window === "undefined") return "animator";
  return new URLSearchParams(window.location.search).get("bereich") === "seiten" ? "seiten" : "animator";
}

function BereichsUmschalter({ bereich, onWechsel }: { bereich: Bereich; onWechsel: (b: Bereich) => void }) {
  const animRef = useRef<HTMLButtonElement>(null);
  const seitenRef = useRef<HTMLButtonElement>(null);

  /* Pfeiltasten schalten zwischen den beiden Reitern um (WAI-ARIA-Tabs). */
  function beiTaste(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const ziel: Bereich = e.key === "Home" ? "animator" : e.key === "End" ? "seiten" : bereich === "animator" ? "seiten" : "animator";
    onWechsel(ziel);
    (ziel === "animator" ? animRef : seitenRef).current?.focus();
  }

  return (
    <div className="editor-umschalter" role="tablist" aria-label="Editor-Bereich" onKeyDown={beiTaste}>
      <button
        ref={animRef}
        type="button"
        role="tab"
        id="tab-animator"
        aria-selected={bereich === "animator"}
        aria-controls="bereich-animator"
        tabIndex={bereich === "animator" ? 0 : -1}
        onClick={() => onWechsel("animator")}
      >
        Animator
      </button>
      <button
        ref={seitenRef}
        type="button"
        role="tab"
        id="tab-seiten"
        aria-selected={bereich === "seiten"}
        aria-controls="bereich-seiten"
        tabIndex={bereich === "seiten" ? 0 : -1}
        onClick={() => onWechsel("seiten")}
      >
        Seiten
      </button>
    </div>
  );
}

export default function EditorPage() {
  const [bereich, setBereich] = useState<Bereich>("animator");
  const [mounted, setMounted] = useState(false);

  /* Erst nach dem Mount aus der URL lesen (hydration-sicher: der Prerender und
     die erste Client-Runde zeigen den Animator, danach korrigiert der Effect
     auf ?bereich=seiten). popstate haelt Vor/Zurueck im Browser synchron. */
  useEffect(() => {
    setMounted(true);
    setBereich(leseBereich());
    function beiPop() {
      setBereich(leseBereich());
    }
    window.addEventListener("popstate", beiPop);
    return () => window.removeEventListener("popstate", beiPop);
  }, []);

  function wechsle(ziel: Bereich) {
    setBereich(ziel);
    const url = ziel === "seiten" ? "?bereich=seiten" : window.location.pathname;
    window.history.pushState(null, "", url);
  }

  const zeigeSeiten = mounted && bereich === "seiten";
  /* Vorhang-Latch nur loesen, wenn der Animator (mit TitleCurtain) wirklich
     rendert — im Seiten-Bereich ist die Buehne gar nicht gemountet. */
  if (!zeigeSeiten) vorhangLatchLoesen();

  return (
    <>
      <BereichsUmschalter bereich={mounted ? bereich : "animator"} onWechsel={wechsle} />
      {zeigeSeiten ? (
        <div
          className="editor-seiten-flaeche"
          id="bereich-seiten"
          role="tabpanel"
          aria-labelledby="tab-seiten"
          tabIndex={0}
        >
          <SeitenBereich />
        </div>
      ) : (
        /* display:contents → der Wrapper ist layout-neutral, der Animator bleibt
           pixelgleich zu heute; die fixierten Overlays haengen ohnehin am Viewport. */
        <div
          id="bereich-animator"
          role="tabpanel"
          aria-labelledby="tab-animator"
          style={{ display: "contents" }}
        >
          <BackdropProvider>
            <EditorInner />
          </BackdropProvider>
        </div>
      )}
    </>
  );
}
