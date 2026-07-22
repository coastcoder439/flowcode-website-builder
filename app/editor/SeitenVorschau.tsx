"use client";

/*
 * app/editor/SeitenVorschau.tsx — Welle 5b (docs/editor-vereinheitlichung.md
 * §10/5b: „Statische Vorschau"). Zeigt eine Puck-Seite als Vollbild-<Render>,
 * OHNE jede Editor-Chrome ausser einem „Zurueck"-Knopf — die dritte Sicht auf
 * dieselbe Seite (bauen in Puck · statisch ansehen · im Animator animieren).
 *
 * Warum ein PORTAL auf document.body: die Vorschau liegt im Seiten-Bereich
 * (.editor-seiten-flaeche, z-index 40), der Bereichs-Umschalter „Animator |
 * Seiten" aber bei z-index 1000 auf Wurzelebene. Ein Kind der Flaeche kann den
 * Umschalter per z-index NICHT ueberdecken (er liegt in einem hoeheren
 * Stapelkontext). Deshalb rendert die Vorschau ueber createPortal direkt an
 * <body> — so deckt sie (z-index 1200) den Umschalter sauber ab und ist
 * wirklich chrome-frei.
 *
 * Styles (Welle 5a): uebernommene Seiten-Stylesheets werden per @scope auf den
 * Buehnen-Container begrenzt (GescopteSeitenStyles) — genau wie im
 * Backdrop-Modus „puck-seite" (Backdrop.tsx). So sieht der Autor die Seite mit
 * ihrem echten Look, ohne dass fremde CSS die restliche Oberflaeche erreicht.
 *
 * Fokus-Management (skills/frontend-a11y): role=dialog + aria-modal; beim
 * Oeffnen wandert der Fokus auf den Zurueck-Knopf, beim Schliessen zurueck auf
 * das ausloesende Element; Escape schliesst.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Render, type Data } from "@puckeditor/core";
import { config } from "../puck/puck.config";
import { GescopteSeitenStyles } from "@/components/import/SeitenStyles";

interface SeitenVorschauProps {
  /** Seiten-Name (ohne .json). */
  name: string;
  /** Vorschau schliessen (zurueck zur Liste). */
  onZurueck: () => void;
}

type Status = "laedt" | "bereit" | "leer" | "fehler";

export function SeitenVorschau({ name, onZurueck }: SeitenVorschauProps) {
  const [status, setStatus] = useState<Status>("laedt");
  const [data, setData] = useState<Data | null>(null);
  /* Welle 5a: uebernommene Stylesheet-URLs der Seite — gescoped auf die Buehne. */
  const [styles, setStyles] = useState<string[]>([]);
  /* Portal erst nach dem Mount (document.body ist auf dem Server nicht da). */
  const [bereit, setBereit] = useState(false);

  const zurueckRef = useRef<HTMLButtonElement>(null);
  const vorherigerFokusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setBereit(true);
  }, []);

  /* Seite laden (gleicher Vertrag wie Backdrop.tsx/SeitenBereich.tsx). */
  useEffect(() => {
    let tot = false;
    void (async () => {
      try {
        const res = await fetch("/api/puck-seite/lade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          if (!tot) setStatus("fehler");
          return;
        }
        const json = (await res.json()) as { data?: Data; styles?: string[] };
        if (tot) return;
        setStyles(Array.isArray(json.styles) ? json.styles : []);
        if (!json.data || json.data.content.length === 0) {
          setData(json.data ?? null);
          setStatus("leer");
          return;
        }
        setData(json.data);
        setStatus("bereit");
      } catch {
        if (!tot) setStatus("fehler");
      }
    })();
    return () => {
      tot = true;
    };
  }, [name]);

  /* Fokus hinein (auf den Zurueck-Knopf) und beim Schliessen zurueckgeben. */
  useEffect(() => {
    vorherigerFokusRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => zurueckRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      vorherigerFokusRef.current?.focus();
    };
  }, []);

  if (!bereit) return null;

  const inhalt = (
    <div
      className="seiten-vorschau"
      role="dialog"
      aria-modal="true"
      aria-label={`Vollbild-Vorschau der Seite ${name}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onZurueck();
      }}
    >
      <button
        ref={zurueckRef}
        type="button"
        className="seiten-vorschau-zurueck"
        onClick={onZurueck}
        title="Vorschau schliessen und zurueck zur Seiten-Liste"
      >
        ← Zurück
      </button>

      <div className="seiten-vorschau-buehne" data-fc-vorschau-buehne>
        {/* Welle 5a: uebernommene Seiten-Styles, @scope-begrenzt auf diesen
            Container (leert sich selbst, wenn die Seite keine styles hat). */}
        <GescopteSeitenStyles urls={styles} selektor="[data-fc-vorschau-buehne]" />

        {status === "laedt" && (
          <div className="seiten-vorschau-hinweis" role="status" aria-live="polite">
            Lade Seite „{name}“ …
          </div>
        )}
        {status === "fehler" && (
          <div className="seiten-vorschau-hinweis" role="alert">
            Seite „{name}“ konnte nicht geladen werden.
          </div>
        )}
        {status === "leer" && (
          <div className="seiten-vorschau-hinweis">Seite „{name}“ hat noch keine Bausteine.</div>
        )}
        {status === "bereit" && data ? <Render config={config} data={data} /> : null}
      </div>
    </div>
  );

  return createPortal(inhalt, document.body);
}
