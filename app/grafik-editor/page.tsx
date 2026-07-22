"use client";

/*
 * /grafik-editor – UMGEZOGEN. Grafik- und Fluss-Editor sind zu EINEM
 * Werkzeug unter /editor zusammengelegt (Welle 2a, s.
 * docs/editor-vereinheitlichung.md). Diese Route bleibt als leichtgewichtiger
 * CLIENT-Redirect bestehen, damit Alt-Links, Lesezeichen und der frühere
 * Kreuz-Link „Grafiken →" nicht ins Leere zeigen (Inventar §4.3).
 *
 * WARUM Client-Redirect statt next.config-Redirect: dieses Projekt baut mit
 * output:"export" (statischer Export) — dort greifen die redirects aus
 * next.config.mjs NICHT (sie brauchen einen Node-Server). Deshalb ersetzt ein
 * useEffect + router.replace() die URL im Browser; der Verlauf wird per
 * replace (nicht push) ersetzt, damit „Zurück" nicht in einer Redirect-
 * Schleife landet. Bis der Effect greift, steht ein sichtbarer Hinweis samt
 * echtem <a>-Fallback (funktioniert auch ohne JS / bei blockiertem Skript).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function GrafikEditorRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/editor");
  }, [router]);

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
      <p>
        Der Editor ist umgezogen → <Link href="/editor">/editor</Link>
      </p>
    </main>
  );
}
