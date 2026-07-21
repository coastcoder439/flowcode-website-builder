"use client";

/*
 * /fluss-editor – eigene Bearbeitungs-Seite („CMS-like, nur Flusssteuerung",
 * Kundenauftrag): rendert die KOMPLETTE echte Landing (HomePage) und legt
 * das Kurs-Editor-Overlay darüber. Der RiverKursProvider verbindet Overlay
 * und Fluss-Engine (RiverFlow konsumiert den Kontext optional — die normale
 * Landing unter / bleibt komplett unberührt, dort existiert kein Provider).
 */

import { HomePageContent } from "@/components/HomePageContent";
import { RiverKursProvider } from "@/components/river/RiverKursContext";
import { RiverKursEditor } from "@/components/river/RiverKursEditor";
import "@/components/river/river-kurs-editor.css";
import { Backdrop } from "@/components/backdrop/Backdrop";
import { BackdropProvider, useBackdropCtx } from "@/components/backdrop/BackdropContext";

/** Latch des Vorhangs (TitleCurtain: "wee-title-curtain-seen"). Im Editor
 *  soll die ORIGINALE Scroll-Animation inkl. Tropfen IMMER laufen — sonst
 *  springt die Bühne bei Client-Navigation/erneutem Besuch in den
 *  Instant-Modus und Leon editiert den Fluss ohne seine Entstehung.
 *  Bewusst im Render-Body (nicht im Effect): Kind-Effekte laufen VOR den
 *  Eltern-Effekten, der Latch muss aber gelöscht sein, bevor TitleCurtain
 *  ihn liest. Nur EINMAL pro Laufzeit (Modul-Flag) — sonst würde jeder
 *  Editor-Render (jeder Drag-Frame!) erneut in den Storage schreiben. */
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
 *  gesetzt — als Prop an HomePage durch (gleiches Muster wie
 *  GrafikEditorInner in app/grafik-editor/page.tsx). */
function FlussEditorInner() {
  const bctx = useBackdropCtx();
  return (
    <RiverKursProvider>
      <HomePageContent backdrop={bctx?.backdrop ? <Backdrop backdrop={bctx.backdrop} /> : undefined} />
      <RiverKursEditor />
    </RiverKursProvider>
  );
}

export default function FlussEditorPage() {
  vorhangLatchLoesen();
  return (
    <BackdropProvider>
      <FlussEditorInner />
    </BackdropProvider>
  );
}
