"use client";

/*
 * /puck — R2a Puck-Spike-Editor. Montiert den <Puck>-Editor (@puckeditor/core)
 * mit der Spike-Config (app/puck/puck.config.tsx). Beweist, dass eine
 * bestehende Komponente (ShapeAccent) in Puck editierbar ist.
 *
 * mounted-Gate: Puck ist client-only und wir lesen initiale Daten aus
 * localStorage — vor dem Mount rendern wir nur einen Platzhalter, damit es
 * unter output:"export" (statische HTML-Shell) keinen Hydration-Mismatch gibt.
 * onPublish persistiert nach localStorage (kein Backend im Spike).
 */

import { useEffect, useState } from "react";
import { Puck, type Data } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { config, initialData } from "./puck.config";

const STORAGE_KEY = "flowcode-puck-spike";

export default function PuckSpikePage() {
  const [mounted, setMounted] = useState(false);
  const [data, setData] = useState<Data>(initialData);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setData(JSON.parse(saved) as Data);
    } catch {
      // beschaedigter/leerer Storage -> mit initialData weiterlaufen
    }
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
        Puck-Editor lädt …
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", overflow: "hidden" }}>
      <Puck
        config={config}
        data={data}
        onPublish={(next: Data) => {
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Persistenz fehlgeschlagen (z.B. Storage voll) -> im Spike ignorieren
          }
        }}
      />
    </div>
  );
}
