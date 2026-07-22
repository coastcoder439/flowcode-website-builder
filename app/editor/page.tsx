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

import { HomePageContent } from "@/components/HomePageContent";
import { GrafikProvider } from "@/components/grafik/GrafikContext";
import { GrafikEditor } from "@/components/grafik/GrafikEditor";
import { RiverKursProvider } from "@/components/river/RiverKursContext";
import { FlussObjektProvider } from "@/components/river/FlussObjektContext";
import { FlussHandlesEbene } from "@/components/river/FlussHandlesEbene";
import "@/components/river/river-kurs-editor.css";
import { Backdrop } from "@/components/backdrop/Backdrop";
import { BackdropProvider, useBackdropCtx } from "@/components/backdrop/BackdropContext";

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
  return (
    <RiverKursProvider>
      <GrafikProvider>
        <FlussObjektProvider>
          <HomePageContent backdrop={bctx?.backdrop ? <Backdrop backdrop={bctx.backdrop} /> : undefined} />
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

export default function EditorPage() {
  vorhangLatchLoesen();
  return (
    <BackdropProvider>
      <EditorInner />
    </BackdropProvider>
  );
}
