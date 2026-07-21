/*
 * lib/api/grafik-validierung.ts — Validierung der Grafik-/Abbild-Nutzlast,
 * 1:1 herausgeloest aus app/api/abbild/route.ts (Logik unveraendert), damit
 * der Import-Endpunkt (app/api/import/grafik-setup) dieselben Guards nutzt
 * statt sie zu duplizieren (docs/agent-schnittstelle.md §5, Schritt 3).
 *
 * Nur die Felder pruefen, die fuer Sicherheit/Rendering entscheidend sind
 * (id/name/src/art/breitePx/z/keyframes) — optionale Flags (modus,
 * versteckt, gesperrt, stumm) laufen unvalidiert durch: im schlimmsten Fall
 * rendert eine Grafik falsch, es entsteht kein Schaden am Server oder an
 * anderen Dateien.
 */

import type { Asset, Grafik } from "@/components/grafik/grafik-types";
import { AnfrageFehler } from "./server-helfer";

function istZahl(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

const MEDIENARTEN = new Set(["bild", "lottie", "video"]);

function istKeyframe(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const k = v as Record<string, unknown>;
  return (
    istZahl(k.scrollY) &&
    istZahl(k.x) &&
    istZahl(k.y) &&
    istZahl(k.scale) &&
    istZahl(k.opacity) &&
    istZahl(k.rotation)
  );
}

export function istGrafik(v: unknown): v is Grafik {
  if (typeof v !== "object" || v === null) return false;
  const g = v as Record<string, unknown>;
  return (
    typeof g.id === "string" &&
    typeof g.name === "string" &&
    typeof g.src === "string" &&
    typeof g.art === "string" &&
    MEDIENARTEN.has(g.art) &&
    istZahl(g.breitePx) &&
    istZahl(g.z) &&
    Array.isArray(g.keyframes) &&
    g.keyframes.length > 0 &&
    g.keyframes.every(istKeyframe)
  );
}

export function istAsset(v: unknown): v is Asset {
  if (typeof v !== "object" || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a.id === "string" &&
    typeof a.name === "string" &&
    typeof a.src === "string" &&
    typeof a.art === "string" &&
    MEDIENARTEN.has(a.art)
  );
}

export interface AbbildMeta {
  viewportW: number;
  viewportH: number;
  docH: number;
}

export function pruefeMeta(v: unknown): AbbildMeta {
  const m = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  return {
    viewportW: istZahl(m.viewportW) ? m.viewportW : 0,
    viewportH: istZahl(m.viewportH) ? m.viewportH : 0,
    docH: istZahl(m.docH) ? m.docH : 0,
  };
}

export interface AbbildEingabe {
  meta: AbbildMeta;
  grafiken: Grafik[];
  pool: Asset[];
  uebernommen: string[];
}

/** Prueft die vom Client gesendete "abbild"-Nutzlast. Wirft bei Formfehlern
 *  statt still etwas Falsches auf die Platte zu schreiben (fail fast). */
export function pruefeAbbild(v: unknown): AbbildEingabe {
  if (typeof v !== "object" || v === null) throw new AnfrageFehler(400, "Abbild fehlt");
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.grafiken) || !o.grafiken.every(istGrafik)) {
    throw new AnfrageFehler(400, "abbild.grafiken ungültig");
  }
  if (o.pool !== undefined && (!Array.isArray(o.pool) || !o.pool.every(istAsset))) {
    throw new AnfrageFehler(400, "abbild.pool ungültig");
  }
  /* uebernommen ist reine Anzeige-/Filterlogik — nur auf die FORM geprueft
     (Array aus Strings): eine falsche ID matcht im schlimmsten Fall keinen
     Platz, kein Schaden moeglich. */
  if (
    o.uebernommen !== undefined &&
    (!Array.isArray(o.uebernommen) || !o.uebernommen.every((x) => typeof x === "string"))
  ) {
    throw new AnfrageFehler(400, "abbild.uebernommen ungültig");
  }
  return {
    meta: pruefeMeta(o.meta),
    grafiken: o.grafiken as Grafik[],
    pool: (o.pool as Asset[] | undefined) ?? [],
    uebernommen: (o.uebernommen as string[] | undefined) ?? [],
  };
}
