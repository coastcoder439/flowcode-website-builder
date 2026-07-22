# Finale Mängelliste (Leons Abnahme, bestätigt 2026-07-23)

> Quelle: Leons Abnahme-Runden 1+2 (wörtlich eingearbeitet) + meine bestätigten Funde („der Rest, den du
> gefunden hast, muss auch gefixt werden"). Diese Liste ist die **bestätigte Grundlage**; als Nächstes folgt
> die systematische Suche nach weiteren Mängeln (kompletter Userflow), DANACH der große Plan (ECC-Skill).
> Positiv-Anker (funktioniert laut Leon): das **Umschalten auf die Live-/aktive Seite** als Mechanik.

---

## I — USERFLOW / AUFBAU DER APP (höchste Priorität — „hatte ich dir schon fünfmal gesagt")

**M1 · Der ganze Webbuilder ist nicht dem Workflow nachgerichtet.** Der Flow ist **Import → Puck → Animator
→ Export** — die App bildet ihn nicht ab: Die Animator-Seite steht an erster Stelle / ist Default, obwohl
man auf der Import-Seite beginnt. „Die User Experience ist immer noch kompletter Mumpitz." Das Tutorial
beschreibt den Flow richtig — die Seite selbst ist so überhaupt nicht aufgebaut. **Umbau: Startansicht =
Import/Seiten; Navigation und Reihenfolge folgen dem Flow; Animator ist Station 3, nicht Station 1.**

**M2 · Tutorial-Trigger falsch platziert.** Es ist „Schwachsinn", dass das Produkt-Tutorial auf der
Animator-Seite aufploppt, obwohl der Nutzer auf der Import-Seite beginnt. Trigger gehört an den
Flow-Anfang. (Feinschliff des Tutorials selbst: erst wenn alles fertig ist — s. VI/S1.)

## II — IMPORT (Ursachen-Cluster; Leons #1, #2, #6, #7, #8, #9 „liegen am Import")

**M3 · Es wird nicht die richtige bzw. nicht die komplette Seite angezeigt** — Folge des fehlerhaften/
unvollständigen Imports (die Umschalt-Mechanik selbst funktioniert).

**M4 · Texte fehlen** — Ursache belegt: Bens Einblende-Animationen frieren bei `opacity:0` ein
(Roh-HTML statt gerendertem Endzustand).

**M5 · Layout zerrissen / „sehr random verteilt"** — Zerlegung zu grob (3 Sektionen + 6 HTML-Blöcke).
Fix: Zerlegungs-Urteile durch das lokale Modell (gemma4) — läuft an späterer Stelle im Import-Umbau (S4).

**M6 · Unterseiten fehlen komplett** — nur index.html importiert; in Puck liegt exakt eine Seite.

**M7 · Bild-/Asset-404s** — Bilder in HTML-Blöcken + CSS-`url()`-Assets (Fonts/Medien) werden nicht
mitkopiert.

**M8 · Live-Bühne: KORREKTUR — fehlende Quell-Animationen sind NICHT konzeptbedingt akzeptabel.**
Leon wörtlich: „Wenn ich die Liveseite anzeige, dann will ich die **komplette Liveseite** sehen. Der
Animator ist doch nur das Tool, das darüber liegt und mir ermöglicht, die Sachen eigenständig
anzuklicken, zu verschieben …" → Die Animator-Bühne muss die **lebendige Seite inklusive ihrer eigenen
Animationen** zeigen (wie der bestehende Ordner-Backdrop-Modus es kann); die entkernte/eingefrorene
Fassung ist nur die Basis für die **Puck-Zerlegung**, nie die Bühne.

**M9 · Quellprojekt-Erkennung fehlt** — wählt man einen Ordner ohne HTML (Next-Quellprojekt), muss eine
klare Meldung kommen („erst bauen"), statt still nichts anzuzeigen.

## III — FUNKTIONS-BUGS

**M10 · „Neu einlesen"-Buttons funktionieren nicht — alle, überall** („egal welcher, irgendwo — die
haben bei mir noch nie funktioniert").

**M11 · Strg+Z ist wieder komplett zerschossen** — bearbeitete Sachen lassen sich nicht rückgängig machen.

**M12 · Konkretfall Undo: Hintergrund-/Screenshot-Wechsel nicht rückgängig machbar** — nach Laden eines
Screenshot-Hintergrunds gibt es kein Strg+Z; man muss manuell wieder auf die aktive Website klicken.
„Nicht userfreundlich."

**M13 · Verdacht: viele weitere Buttons ohne Funktion** — systematisch zu prüfen (Teil der kommenden
Mängelsuche); Leon schaut sich „Funktionen passen noch nicht" zusätzlich später selbst an.

**M14 · Fluss-Fokus-Falle** — ohne platzierte Grafik kein Weg, den Fluss-Fokus zu verlassen.

**M15 · Reibung: „Animation laden?"-Dialog** feuert bei jedem Reload mit aktiver Seite.

**M16 · Stilbruch: Preset-Name über Browser-`prompt()`** statt Inline-Eingabefeld.

## IV — OBERFLÄCHEN-REST

**M17 · Hover-Erklärungen unvollständig** — Restbestand im Haupt-Editor (~8 Knöpfe) + Vollzählung über
alle Dateien ausstehend; Ziel: jeder Knopf erklärt sich beim Drüberfahren.

**M18 · Bühnen-Render-Grenze** — `html/body`-Reset-Regeln der importierten CSS greifen auf der Bühne
nicht (im Puck-Editor korrekt). (Wird durch M8-Live-Bühne voraussichtlich obsolet — beim Umbau prüfen.)

**M19 · Veralteter Browser-Hinweis** in der UI (@scope-Warnung — inzwischen alle Browser).

**M20 · Testrest** — „rt-bleibt"-Preset liegt noch in der Bibliothek.

**M21 · Sichten-Trio (Puck bauen / statische Vorschau / Animator) nie optisch abgenommen** — Abnahme
nach dem Flow-Umbau (M1).

## V — VERBINDLICHE REGELN (ab sofort, von Leon angeordnet)

**R1 · Undo-Pflicht:** „Jede Funktion, die gebaut wird, muss mit Strg+Z wieder rückgängig gemacht werden
können" — gilt für ALLE Editier-Aktionen inkl. Hintergrund-/Backdrop-Wechseln. Feste Bauregel, kein
Nice-to-have.

**R2 · Verifikations-Protokoll** ([verifikations-protokoll.md](verifikations-protokoll.md)) — nie beim
ersten Fehlschlag abbrechen, UNGEPRÜFT deklarieren, kein „alles geprüft" nach Fehlschlägen.

**R3 · UI-Reihenfolge = Userflow** — jede Oberflächen-Entscheidung folgt Import → Puck → Animator → Export.

## VI — BESTÄTIGT „SPÄTER" (Reihenfolge von Leon festgelegt)

**S1 ·** Tutorial-Feinbau: erst „wenn alles fertig ist" (Trigger-Fix M2 kommt früher).
**S2 ·** CLI/MCP-Reprint + Tests: erst wenn das komplette Tool final steht (nie wieder auf Zwischenstand).
**S3 ·** Verify-Prozess: geregelt (R2), Bewährung laufend.
**S4 ·** Gemma-Zerlegung (lokales Modell): beim Import-Umbau — besprochen und gesetzt.
**S5 ·** „Funktionen passen noch nicht"-Restprüfung: Leon prüft später selbst; meine systematische
Mängelsuche liefert vorher die Kandidatenliste (M13).
