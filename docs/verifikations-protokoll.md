# Verifikations-Protokoll (VERBINDLICH für alle Bau-/Verify-Workflows)

> Anlass: Leons Anweisung 2026-07-22 nach dem Welle-5-Versagen (Verify-Agent brach beim blockierten
> Browser-Pane ab, offene Optik-Prüfung wurde im Fazit trotzdem als „geprüft" verkauft). Wörtlich:
> „Verifikation … dürfen nicht bei dem ersten Fehlschlag abbrechen. Und wenn, dann müssen sie das
> angeben und du darfst nach einem Fehlschlag nicht sagen, ja, ist alles geprüft."
> Dieses Protokoll ist Pflicht-Bestandteil jedes Verify-Prompts und jeder Orchestrator-Zusammenfassung.

## 1. Für Verify-Agenten (dürfen günstige Modelle sein — Sonnet/Haiku ok)

1. **Nie beim ersten Fehlschlag aufgeben.** Für jeden blockierten Prüfweg gilt eine Eskalationsleiter,
   mindestens zwei Alternativen versuchen, bevor ein Check als unprüfbar gilt:
   - Screenshot hängt/Timeout → Viewport-Resize (1280×800) + Reload + kurz warten (bewährter Fix),
     dann erneut; danach `read_page`/Accessibility-Snapshot als Beleg-Ersatz; danach gezielte
     `evaluate`-Messung (DOM/ComputedStyle) als letzter Nachweisweg.
   - Ziel-Port belegt → NICHT stillschweigend auf einen anderen Port/eine andere Umgebung ausweichen.
     Wenn Ausweich-Umgebung unvermeidbar: jeder dort gelaufene Check wird als **auf Zielumgebung
     UNGEPRÜFT** markiert (Befunde der Ausweich-Umgebung nur als Zusatzinfo).
   - Download/Dialog/FS-Zugriff blockiert → programmatischer Ersatzweg (Export-String abfangen,
     API direkt, Node-Testlauf) und den Unterschied zum echten Nutzerweg benennen.
2. **Dreiwertiger Status je Check:** `OK` / `FEHLGESCHLAGEN` / `UNGEPRÜFT (Grund + was versucht wurde)`.
   Es gibt kein stilles Weglassen: Jeder Check aus dem Auftrag taucht im Ergebnis auf.
3. **`gruen=true` NUR, wenn ALLE Checks OK sind.** Ein einziger UNGEPRÜFT- oder FEHLGESCHLAGEN-Check
   ⇒ `gruen=false`. UNGEPRÜFT ist nicht „halb ok" — es ist nicht grün.
4. Optik-relevante Checks brauchen einen **visuellen Beleg** (Screenshot). Ist keiner erreichbar,
   ist der Check UNGEPRÜFT — DOM-Snapshots beweisen Existenz, nicht Aussehen.

## 2. Für den Orchestrator (Fazit-Regeln)

1. **„Fertig/steht/bewiesen" darf nur berichtet werden, wenn:** (a) der Workflow grün im Sinne von §1.3
   ist UND (b) der Orchestrator selbst den End-to-End-Pfad gegangen ist (eigener Screenshot der
   Kern-Ansicht, eigenes Öffnen des Ergebnis-Artefakts). Agent-Berichte ersetzen den eigenen Blick nicht.
2. **Jeder UNGEPRÜFT-/offene Punkt wandert wörtlich in den Bericht an Leon** — im Fazit-Satz, nicht in
   einer Fußnote. Formulierung dann zwingend „nicht abgenommen", niemals „bewiesen, aber…".
3. **Messlatte vor dem Bau festlegen** — als Nutzer-Erlebnis formuliert (z. B. „alle Unterseiten in
   Puck, alle Texte sichtbar, 0 Bild-404, Screenshot-Paar Original vs. Bühne deckungsgleich"), und die
   Abnahme läuft gegen diese Messlatte, nicht gegen technische Teil-Checks.
4. Bricht eine Fix-Schleife (z. B. nach 2 Runden) ab, ist das Ergebnis **ABGEBROCHEN** und wird genau so
   berichtet — nie als Teilerfolg umdeklariert.
5. Leons optische Abnahme bleibt IMMER zusätzlich aus — technisches Grün ist keine Design-Abnahme.

## 3. Lokales Modell als Verify-/Urteils-Ressource

Ollama läuft lokal (`gemma4` installiert). Urteilslastige Prüfungen und Zerlegungen (z. B. „gehören
diese Elemente zu einer Sektion?", „sieht die Bühne wie das Original aus?") dürfen und sollen das
lokale Modell nutzen — Token-/Kostenargumente sind ausdrücklich KEIN Grund, darauf zu verzichten
(Leons stehende Regel). Skripte bleiben für objektiv-mechanische Schritte (Einfrieren, Kopieren,
CSS-Inlining, Diff-Zählung).
