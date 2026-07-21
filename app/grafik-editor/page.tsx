"use client";

/*
 * /grafik-editor – Bearbeitungs-Seite für die Scroll-Grafiken: rendert die
 * KOMPLETTE echte Landing (HomePage), legt die Grafik-Ebene darüber und das
 * Editor-Overlay obendrauf. Gleiches Muster wie /fluss-editor — die normale
 * Landing unter / bleibt unberührt (dort existiert kein Provider).
 */

import { HomePageContent } from "@/components/HomePageContent";
import { GrafikProvider } from "@/components/grafik/GrafikContext";
import { GrafikEditor } from "@/components/grafik/GrafikEditor";
import { Backdrop } from "@/components/backdrop/Backdrop";
import { BackdropProvider, useBackdropCtx } from "@/components/backdrop/BackdropContext";

/** Vorhang-Latch (TitleCurtain) lösen, damit die originale Scroll-Animation
 *  inkl. Tropfen bei JEDEM Laden läuft — sonst platziert Leon Grafiken auf
 *  einer Seite, die es so nie gibt. Nur EINMAL pro Laufzeit (Modul-Flag):
 *  sonst schriebe jeder Editor-Render erneut in den Storage. */
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
 *  gesetzt — als Prop an HomePage durch. Eigene Komponente statt Inline im
 *  Page-Export: useBackdropCtx() braucht einen Nachfahren von
 *  <BackdropProvider>, der Export selbst rendert den Provider erst. */
function GrafikEditorInner() {
  const bctx = useBackdropCtx();
  /* Die Grafik-Ebene selbst steckt IN der HomePage — hier kommt nur der
     Provider (Editor-Zustand schlägt die Config) und das Overlay dazu.
     Zwei Ebenen würden sich sonst überlagern. */
  return (
    <GrafikProvider>
      <HomePageContent backdrop={bctx?.backdrop ? <Backdrop backdrop={bctx.backdrop} /> : undefined} />
      <GrafikEditor />
    </GrafikProvider>
  );
}

export default function GrafikEditorPage() {
  vorhangLatchLoesen();
  return (
    <BackdropProvider>
      <GrafikEditorInner />
    </BackdropProvider>
  );
}
