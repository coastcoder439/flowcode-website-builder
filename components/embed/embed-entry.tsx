"use client";

/*
 * embed-entry – Einstiegspunkt des standalone Embeds (Phase 2). Wird von
 * scripts/build-embed.mjs zu public/wee-embed.js gebuendelt (IIFE, React/
 * react-dom/motion mit eingebuendelt, s. Build-Script) und laeuft auf JEDER
 * Seite per <script src>, ohne Next und ohne dass die Host-Seite selbst
 * React nutzt (EmbedRoot.tsx macht die eigentliche Arbeit).
 *
 * Sucht alle [data-wee-anim]-Mount-Punkte und liest je Punkt die Config in
 * dieser Reihenfolge:
 *   1. data-config="URL"  auf dem Mount-Element  -> fetch + JSON
 *   2. <script type="application/json" data-wee-config> – entweder ueber
 *      data-config-id="…" mit dem Mount verknuepft, sonst das ERSTE solche
 *      Script im Dokument (reicht fuer den Ein-Instanz-Regelfall, s.
 *      public/embed-demo.html)
 *   3. window.__WEE_ANIM__ – bereits ein JS-Objekt, kein JSON.parse noetig
 * Findet ein Mount KEINE gueltige Config, wird NUR DIESER uebersprungen
 * (kein Absturz fuer andere Mounts auf derselben Seite) + eine deutliche
 * console.warn-Meldung mit dem Mount-Element als Referenz.
 */

import { createRoot } from "react-dom/client";
import { EmbedRoot, type EmbedConfig } from "./EmbedRoot";

const GLOBAL_CONFIG_KEY = "__WEE_ANIM__";

/** Minimale Formpruefung: reicht, um offensichtlich falsche/kaputte Configs
 *  abzufangen (fehlendes/kein Array bei "grafiken") – kein volles Schema
 *  (fluss/farben bleiben optional und werden von EmbedRoot/RiverFromSnapshot
 *  selbst mit Fallbacks behandelt). */
function istEmbedConfig(v: unknown): v is EmbedConfig {
  if (typeof v !== "object" || v === null) return false;
  return Array.isArray((v as Record<string, unknown>).grafiken);
}

function leseInlineConfig(mount: Element): EmbedConfig | null {
  const configId = mount.getAttribute("data-config-id");
  const script = configId
    ? document.getElementById(configId)
    : document.querySelector('script[data-wee-config]');
  if (!script || script.textContent === null) return null;
  try {
    const parsed: unknown = JSON.parse(script.textContent);
    return istEmbedConfig(parsed) ? parsed : null;
  } catch (err) {
    console.warn("[wee-embed] Inline-Config ist kein gueltiges JSON:", err);
    return null;
  }
}

function leseGlobalConfig(): EmbedConfig | null {
  const w = window as unknown as Record<string, unknown>;
  const v = w[GLOBAL_CONFIG_KEY];
  return istEmbedConfig(v) ? v : null;
}

async function leseConfigPerUrl(url: string): Promise<EmbedConfig | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[wee-embed] Config-Fetch fehlgeschlagen (${res.status}): ${url}`);
      return null;
    }
    const parsed: unknown = await res.json();
    if (!istEmbedConfig(parsed)) {
      console.warn(`[wee-embed] Config von "${url}" hat kein gueltiges "grafiken"-Array.`);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn(`[wee-embed] Config-Fetch-Fehler fuer "${url}":`, err);
    return null;
  }
}

async function montiere(mount: Element): Promise<void> {
  const configUrl = mount.getAttribute("data-config");
  const config = configUrl
    ? await leseConfigPerUrl(configUrl)
    : (leseInlineConfig(mount) ?? leseGlobalConfig());

  if (!config) {
    console.warn(
      '[wee-embed] Keine gueltige Config gefunden fuer Mount-Element',
      mount,
      '- erwartet data-config="URL", <script type="application/json" data-wee-config> oder window.__WEE_ANIM__.',
    );
    return;
  }

  createRoot(mount).render(<EmbedRoot {...config} />);
}

function starte(): void {
  document.querySelectorAll("[data-wee-anim]").forEach((mount) => {
    void montiere(mount);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", starte);
} else {
  starte();
}
