"use client";

/*
 * /puck-import — R2b Stufe-A-Beweis. Nimmt ein datengetriebenes GrafikSetup
 * (beispiel-setup.ts), laesst es vom deterministischen Adapter
 * (lib/import/grafik-setup-to-puck.ts) in Puck-content[] uebersetzen und
 * zeigt das Ergebnis im <Puck>-Editor. Beweist: eine reale Config wird OHNE
 * LLM zu editierbaren Puck-Bausteinen.
 *
 * Bewusst isoliert und additiv: eigene Route, teilt sich nur die Puck-Config
 * (app/puck/puck.config.tsx) mit dem Spike. mounted-Gate wie /puck (Puck ist
 * client-only, kein Hydration-Mismatch unter output:"export").
 */

import { useEffect, useMemo, useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import { config } from "../puck/puck.config";
import { grafikSetupToPuck } from "@/lib/import/grafik-setup-to-puck";
import { beispielSetup } from "./beispiel-setup";

export default function PuckImportPage() {
  const [mounted, setMounted] = useState(false);
  // Deterministischer Adapter: gleiche Eingabe -> gleiche content[].
  const importedData = useMemo(() => grafikSetupToPuck(beispielSetup), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
        Import wird vorbereitet …
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", overflow: "hidden" }}>
      <Puck config={config} data={importedData} onPublish={() => {}} />
    </div>
  );
}
