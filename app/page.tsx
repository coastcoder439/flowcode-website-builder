/*
 * "/" – die echte Landing-Route. Bewusst NUR ein propless Wrapper um
 * HomePageContent (components/HomePageContent.tsx) — Next.js' App Router
 * erlaubt fuer app/page.tsx nur einen festen Satz von Exports (default + ein
 * paar Routen-Config-Exports) und prueft den Props-Typ des default-Exports
 * strikt gegen sein eigenes PageProps (.next/types/app/page.ts). Der
 * Backdrop-Modus (s. components/HomePageContent.tsx, components/backdrop/)
 * braucht eine optionale `backdrop`-Prop, wiederverwendbar von
 * /grafik-editor UND /fluss-editor — die eigentliche Seite lebt deshalb dort
 * (normale Komponenten-Datei, keine Next.js-Exportbeschraenkung).
 *
 * Kein "use client" noetig: diese Datei selbst hat keine Hooks/Interaktion,
 * HomePageContent bringt ihr eigenes "use client" mit (Server-Komponente
 * rendert Client-Komponente — Standardmuster, auch unter output:"export").
 *
 * Rendert ohne backdrop-Prop → HomePageContent zeigt exakt dieselbe Landing
 * wie vor der Backdrop-Einführung (Vorhang + Bens 7 Sektionen).
 */

import { HomePageContent } from "@/components/HomePageContent";

export default function HomePage() {
  return <HomePageContent />;
}
