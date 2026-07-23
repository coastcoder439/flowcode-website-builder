# Gesamt-Mängelliste v4 (feature-orientiert, 2026-07-23 — zur finalen Bestätigung durch Leon)

> Vollständige Zusammenführung aus: Leons bestätigter Liste (Abnahme-Runden 1–3), der systematischen
> Mängelsuche (4 Code-Audits + 4 Begehungs-Stationen) und den bestätigten Design-Vorgaben
> ([design-vorgaben.md](design-vorgaben.md)). Nichts weggelassen. Die Kürzel in Klammern (M…/N…)
> dienen nur der Nachverfolgung im Plan — die Titel sagen, worum es geht.
>
> **Der verbindliche Userflow (Leons Definition, vier Stationen):**
> **1. Import → 2. Puck (Seite bauen) → 3. Animations-Preview (Animator) → 4. Live-Preview + Export.**
>
> Funktioniert laut Leon (Positiv-Anker): das Umschalten auf die Live-/aktive Seite als Mechanik.
> Optik-Urteile bleiben bei Leon; Verdachtsfälle sind als „Optik-Verdacht" markiert.

---

## 1 · App-Aufbau & Navigation (höchste Priorität)

**Die App folgt nicht dem Arbeitsablauf — falsche Startansicht** *(M1)*
- Problem: Die App startet auf dem Animator und stellt ihn an erste Stelle, obwohl man mit dem Import beginnt. Der Vier-Stationen-Ablauf ist nirgends als Navigation abgebildet. „Die User Experience ist immer noch kompletter Mumpitz."
- Soll: Startansicht = Import; Navigation und Reihenfolge = die vier Stationen; Animator ist Station 3, nicht Station 1.
- Beleg: /editor startet per Code-Default auf „Animator" (app/editor/page.tsx:221); Tab „Animator" steht vor „Seiten".

**Das Tutorial ploppt an der falschen Stelle auf** *(M2)*
- Problem: Das Produkt-Tutorial erscheint auf der Animator-Seite — „Schwachsinn", denn der Nutzer beginnt beim Import.
- Soll: Trigger an den Anfang des Ablaufs (Station 1). Feinschliff des Tutorial-Inhalts erst ganz am Ende (siehe „Später").
- Beleg: ProduktTutorial ist im Animator gemountet und feuert dort.

**Das Animator-Panel lässt sich nicht ausblenden** *(M22)*
- Problem: Das Werkzeug-Panel liegt dauerhaft über der Seite.
- Soll: Ein-/Ausblenden-Schalter, damit man die Seite auch ungestört sehen kann.
- Beleg: Kein Ein-/Ausblenden-Control vorhanden; das Panel (`.gre-panel`) liegt permanent über der Bühne.

**Die finale Live-Preview-Seite fehlt komplett** *(M23)*
- Problem: Es gibt keine eigene Abschluss-Station, auf der man die fertige Seite live sieht (ohne Editor-Gedöns).
- Soll: Eigene Seite (Station 4) mit oben ein-/ausklappbarem Export-Fenster.
- Beleg: Existiert nicht; siehe auch nächster Punkt.

**Vorschau und Export sind zwei unverbundene Welten** *(N14)*
- Problem: Die Vollbild-Vorschau hat nur einen „Zurück"-Knopf, keinerlei Export-Möglichkeit. Der Export liegt versteckt als Unter-Reiter im Animator und überlagert dort die Bühne. Kein Weg von der Vorschau zum Export oder umgekehrt.
- Soll: Station 4 = „Live-Preview + Export" als EINE Einheit.
- Beleg: Vorschau-Dialog nur mit „← Zurück"; Export nur unter dem Animator-Tab.

**Browser-Zurück wirft ungespeicherte Puck-Änderungen kommentarlos weg** *(N20)*
- Problem: Das Öffnen einer Seite im Puck-Editor legt keinen Browser-History-Eintrag an. Drückt man im offenen Editor „Zurück", landet man auf dem Animator und alle ungespeicherten Änderungen sind ohne Rückfrage verloren (kein „Wirklich verlassen?"-Dialog). Zusätzlich kann das Schließen der Vorschau die History so verbiegen, dass „Zurück" in eine veraltete Vorschau-Ansicht springt.
- Soll: Editor-Öffnen sauber in die Browser-History integriert + Warnung bei ungespeicherten Änderungen.
- Beleg: `oeffne()` ohne pushState (SeitenBereich.tsx:219-237) vs. Vorschau mit pushState (182-196); Vorschau-Vorrang 349-353; nur per Code nachvollzogen, nicht live durchgespielt.

**Geteilter Vorschau-Link funktioniert nur mit beiden URL-Parametern** *(N21, niedrige Schwere)*
- Problem: Ein Link nur mit `?vorschau=X` (ohne `?bereich=seiten`) landet kommentarlos auf dem Animator — obwohl der Hilfe-Dialog den Vorschau-Link als „teilbar und reload-fest" bewirbt. Trifft nur manuell gekürzte Links.
- Soll: Vorschau-Absicht auch ohne zweiten Parameter respektieren (oder Hinweis).
- Beleg: app/editor/page.tsx:172-175; „teilbar"-Zusage SeitenBereich.tsx:650-655; per Code nachvollzogen.

**Der Browser-Tab zeigt einen fremden Prototyp-Titel** *(N16)*
- Problem: Titel überall = „WEE Titelkarte – Prototyp v1", Beschreibung = alter Vorhang-Effekt-Prototyp. Auf allen Routen identisch — Tabs, Lesezeichen und Teilen-Vorschauen sind verwirrend, Stationen nicht unterscheidbar.
- Soll: Passender Titel je Station.
- Beleg: app/layout.tsx:21.

## 2 · Einheitliches Design (WEE-Designsystem)

**Kein einheitliches Erscheinungsbild im gesamten Tool** *(M24, Regel R5)*
- Problem: Jedes Panel sieht anders aus; das Editor-Panel ist durchgängig dunkelgrün/schwarz (alle 8 Reiter) — widerspricht Leons Vorgabe „hell/sand, Dunkel nicht großflächig".
- Soll: ALLES UI nach dem WEE-Designsystem (`wee-website-refactoring/Information/World Eden Era Design System - Standalone.html`; Referenz im Klon: `test-sites/wee-website-v3/design-system/` + `design-tokens.reference.css`). Bestätigte Regeln: Flächen nur hell/dezent (Sand-Töne), KEINE Grüntöne als Fläche; Orange + Grün-500 nur als Signalfarben; Dunkelgrün nur für Text/Linien/kleine Akzente, nie großflächig → Hell-Modus-Umbau des dunklen Panels; WEE-Fonts (Syne/Montserrat) auch fürs Tool-UI.
- Details: [design-vorgaben.md](design-vorgaben.md).

**Dunkle Vollflächen-Kopfleiste im Puck-Editor** *(N5, Optik-Verdacht)*
- Problem: Über die volle Bildschirmbreite läuft ein dunkler Balken (Seitenname + Speichern/Zurück) — Verdacht auf Verstoß gegen „Dunkel nicht großflächig".
- Soll: Leons Optik-Urteil; im Zuge des Design-Umbaus mit erledigen.
- Beleg: Screenshots station1-05 / station1-09.

**~30 Knöpfe ohne Hover-Erklärung** *(M17)*
- Problem: Ziel ist, dass sich JEDER Knopf beim Drüberfahren erklärt. Vollzählung (per Grep): GrafikEditor 8 fehlend · GrafikObjektMenue 8 (von 9!) · GrafikCrop 4 (alle) · FlussSektion 3 (alle) · Haupt-Bereichs-Umschalter „Animator"/„Seiten" 2 (alle!) · GrafikExportAnleitung 2 · GrafikHilfe 2 · je 1 in EasingKurve, RiverKursEditor (verwaist), Front-/Nebel-/Profile-/WasserSektion, BackdropAuswahl, BackdropHilfeIcon, shared/HilfeIcon.
- Soll: Hover-Erklärung überall; bei Hilfe-Icons mit aria-label ist title zusätzlich sinnvoll (Einzelfall beim Umbau).

**Veralteter Browser-Hinweis in der Oberfläche** *(M19)*
- Problem: Die UI warnt noch vor fehlender @scope-Unterstützung — inzwischen können das alle Browser.
- Soll: Hinweis entfernen.

**Preset-Name wird über ein hässliches Browser-Popup abgefragt** *(M16)*
- Problem: Beim Preset-Speichern öffnet sich das native `prompt()`-Fenster — Stilbruch.
- Soll: Inline-Eingabefeld im Panel.

**Optische Abnahme des Sichten-Trios steht aus** *(M21)*
- Problem: Puck-Bauen / statische Vorschau / Animator wurden nie optisch von Leon abgenommen.
- Soll: Abnahme nach dem Umbau von App-Aufbau & Design.

## 3 · Station 1: Import

**Es wird nicht die richtige bzw. nicht die komplette Seite angezeigt** *(M3)*
- Problem: Folge des fehlerhaften/unvollständigen Imports (die Umschalt-Mechanik selbst funktioniert).
- Soll: Import liefert die komplette, korrekte Seite.

**Texte fehlen nach dem Import** *(M4)*
- Problem: Bens Einblende-Animationen frieren beim Import mit `opacity:0` ein — es wird Roh-HTML statt des gerenderten Endzustands übernommen. Vorschau zeigt z. B. eine leere Glass-Card, wo „Together, WEE can." stehen müsste.
- Soll: Gerenderten Endzustand einfrieren (Import-Umbau).
- Beleg: `style="opacity:0"` an tc-hero/glass/cta-row; Screenshots station1-08 vs. -09.

**Layout zerrissen — Zerlegung viel zu grob** *(M5)*
- Problem: Die ganze Seite wird zu 3 Sektionen + 6 HTML-Blöcken; praktisch der gesamte Inhalt landet in EINEM „HTML-Block (übriges Markup)" mit Roh-Textarea — kein visuelles Bearbeiten möglich, Anzeige „sehr random verteilt".
- Soll: Feine, sinnvolle Zerlegung; die Zerlegungs-Urteile übernimmt das lokale Modell (gemma4) im Import-Umbau.

**Unterseiten fehlen komplett** *(M6)*
- Problem: Nur index.html wird importiert; in Puck liegt exakt eine Seite, obwohl die Hauptnavigation /project-oasis/, /pilot-projekt/ und /faq/ verlinkt.
- Soll: Alle Seiten der Website importieren.

**Bilder und Schriften fehlen (404-Fehler)** *(M7)*
- Problem: Bilder in HTML-Blöcken und per CSS eingebundene Dateien (Schriften, Medien) werden nicht mitkopiert.
- Soll: Alle Assets mitnehmen. (Verwandt: der Passwort-Gate-Fund unten — Import kopiert Markup falsch/unvollständig.)

**Die Animator-Bühne zeigt nicht die lebendige Seite** *(M8 — Leons Korrektur)*
- Problem: Auf der Bühne fehlen die eigenen Animationen der Quellseite. Leon wörtlich: „Wenn ich die Liveseite anzeige, dann will ich die komplette Liveseite sehen. Der Animator ist doch nur das Tool, das darüber liegt…"
- Soll: Die Bühne zeigt die lebendige Seite MIT ihren eigenen Animationen (wie es der Ordner-Backdrop-Modus kann). Die eingefrorene Fassung ist NUR die Basis für die Puck-Zerlegung — nie die Bühne.

**Keine Meldung, wenn man einen falschen Ordner wählt** *(M9 — ungeprüft)*
- Problem: Wählt man einen Ordner ohne HTML (z. B. ein ungebautes Next-Quellprojekt), passiert still nichts.
- Soll: Klare Meldung „erst bauen".
- Status: In der Suche weder bestätigt noch widerlegt — der native Ordner-Dialog ist im Automations-Browser nicht steuerbar (siehe „Ungeprüft").

**Die Import-Ansicht hat kein Hilfe-Icon** *(N1)*
- Problem: Die Seiten-Liste hat oben rechts ein „?" mit Erklär-Dialog; wechselt man auf „Website importieren", verschwindet es — ausgerechnet beim erklärungsbedürftigsten Schritt (Ordnerwahl, Styling-Verlust).
- Soll: Konsistente Hilfe auf beiden Sichten derselben Station.
- Beleg: Accessibility-Snapshots beider Ansichten.

**Der Passwort-Sperrbildschirm der Quellseite wird mitimportiert** *(N15)*
- Problem: Die importierte Seite enthält einen eigenen Baustein mit dem kompletten „Diese Seite ist geschützt…Passwort…Freischalten"-Formular der Quell-Hosting-Umgebung (Vercel-Preview-Schutz o. ä.) — als aktives Formular unter dem Footer, sichtbar in Puck, Vorschau UND Animator; würde mit exportiert. Eigene Ursache, nicht dasselbe wie fehlende Texte/Assets.
- Soll: Solche Fremdkörper beim Import herausfiltern.
- Beleg: Baustein imp-wee-website-v3-html-19; Screenshots station2/station3.

**Importierte Grundlayout-Regeln greifen auf der Bühne nicht** *(M18)*
- Problem: `html/body`-Reset-Regeln der importierten CSS wirken auf der Animator-Bühne nicht (im Puck-Editor korrekt).
- Soll: Beim Umbau prüfen — wird durch die „lebendige Bühne" (oben) voraussichtlich obsolet.

## 4 · Station 2: Puck (Seite bauen)

**Das HTML-Bearbeitungsfeld existiert doppelt im Seitengerüst** *(N3)*
- Problem: Nach Auswahl eines HTML-Blocks gibt es ZWEI Eingabefelder mit identischer ID (eines unsichtbar, eines sichtbar in der Sidebar) — ungültiges HTML, brüchig für Screenreader-/Label-Zuordnung; führte in der Prüfung zunächst zur Fehlmessung „Tippen wirkungslos". Sichtbar funktioniert das Feld, der Defekt liegt darunter.
- Soll: Eindeutige IDs.
- Beleg: `querySelectorAll('textarea')` → zwei Treffer, gleiche ID.

**Jeder Seiten-API-Aufruf feuert doppelt (Umleitung)** *(N17)*
- Problem: Alle Aufrufe (Liste/Laden/Löschen) gehen ohne End-Schrägstrich raus, bekommen eine 308-Umleitung und werden erneut gesendet — jede Interaktion kostet zwei Anfragen. Funktional unauffällig, aber unnötig + Hinweis auf inkonsistente Next.js-Konfiguration (`trailingSlash`).
- Soll: Direkt die richtige URL aufrufen.
- Beleg: Netzwerk-Mitschnitt: [POST] …/liste ⇒ 308 → …/liste/ ⇒ 200.

**Speichern kann eine gelöschte Seite heimlich wiederbeleben** *(N18 — Code-Verdikt)*
- Problem: Löscht Tab B eine Seite, die Tab A noch offen hat, und drückt Tab A dann „Speichern", wird die Seite kommentarlos neu angelegt — die Löschung ist still rückgängig, kein Konflikt-Banner. Der 409-Konflikt-Schutz wird bei „Datei existiert nicht" übersprungen.
- Soll: Konfliktmeldung „Seite existiert nicht mehr".
- Beleg: lib/api/seiten-speicher.ts:256-268 + Aufrufer; nur im Code verifiziert, Laufzeit-Repro nicht ausgeführt (siehe „Ungeprüft").

## 5 · Rückgängig machen (Strg+Z) — Grundregel + alle Verstöße

**Grundregel (von Leon angeordnet, Regel R1):** „Jede Funktion, die gebaut wird, muss mit Strg+Z
wieder rückgängig gemacht werden können" — gilt für ALLE Editier-Aktionen inkl. Hintergrund-Wechseln.

**Strg+Z ist insgesamt wieder zerschossen** *(M11)*
- Problem: Bearbeitete Sachen lassen sich nicht rückgängig machen. Die Suche fand drei konkrete Ursachen (unten); der Standard-Weg „Grafik platzieren" war in der Prüfung sauber undo-bar.

**Hintergrund-/Screenshot-Wechsel nicht rückgängig machbar** *(M12 — live sogar verschärft)*
- Problem: Nach dem Laden eines Screenshot-Hintergrunds gibt es kein Strg+Z; man muss manuell zur aktiven Website zurückklicken. Live-Befund verschärft: Strg+Z überspringt den Hintergrund-Wechsel und entfernt stattdessen die zuvor platzierte Grafik — es macht das Falsche rückgängig.
- Soll: Hintergrund-Wechsel in die Undo-Historie aufnehmen.

**Seiten-Löschen ist laut eigenem Dialog „nicht rückgängig zu machen"** *(N2)*
- Problem: Der Lösch-Dialog sagt es selbst: „…Das lässt sich nicht rückgängig machen." — die deutlichste, selbst dokumentierte Ausnahme von der Grundregel.
- Soll: Auch Seiten-Löschen umkehrbar machen (z. B. Papierkorb/Undo-Fenster).
- Beleg: `confirm()`-Text; app/api/puck-seite/loesche/route.ts + SeitenBereich.tsx:331-347.

**Strg+Z im Puck-Editor springt unvorhersehbar** *(N4)*
- Problem: Nach Tippen im HTML-Feld macht das erste Strg+Z nur den letzten Tastenanschlag rückgängig, das zweite wirft stattdessen die komplette Block-Auswahl weg (Panel springt auf leer).
- Soll: Vorhersagbares Undo-Verhalten.
- Beleg: Screenshot station2-after-second-ctrlz.png.

**Strg+Z wirkt immer nur auf EINEN von zwei Verläufen** *(N8 — plausibel, statisch hergeleitet)*
- Problem: Je nach Fokus greift Strg+Z NUR auf den Fluss-Verlauf ODER NUR auf den Grafik-Verlauf — nie auf beide. Ist der Fluss fokussiert und dessen Verlauf leer, tut Strg+Z NICHTS, obwohl eine Grafik-Aktion rückgängig machbar wäre. Zusammen mit der Fluss-Fokus-Falle (unten) sitzt man fest. Plausibler Haupt-Kandidat für „Strg+Z zerschossen".
- Beleg: GrafikEditor.tsx:2376-2394; nicht live erzwungen (siehe „Ungeprüft").

**Schieberegler schlucken Strg+Z** *(N9)*
- Problem: Solange ein Slider (z. B. Grundbreite) den Tastaturfokus hält, wird Strg+Z ignoriert (Wert bleibt). Der ↶-Knopf funktioniert; nach Klick woanders hin funktioniert auch Strg+Z wieder.
- Soll: Strg+Z auch bei Slider-Fokus.
- Beleg: Wert blieb „620" bei Slider-Fokus, nach blur() dann „240".

**Bibliotheks-Änderungen (✕ Entfernen u. a.) sind nicht rückgängig machbar** *(N10)*
- Problem: Der ✕-Knopf entfernt ein Asset ohne Eintrag in die Undo-Historie (Pool ist lokaler State außerhalb der Historie) — ein versehentlich entferntes Asset (z. B. aus Canva eingefügt) ist weg; gilt auch für Hinzufügen/Vektorisieren.
- Soll: Bibliotheks-Aktionen in die Undo-Historie.
- Beleg: GrafikEditor.tsx:2554-2560 (setPool ohne commit).

## 6 · Station 3: Animator

**Alle „Neu einlesen"-Knöpfe sind tot** *(M10)*
- Problem: „Egal welcher, irgendwo — die haben bei mir noch nie funktioniert." Live bestätigt: Klick feuert ohne Fehler, bewirkt sichtbar nichts (0 Netzwerk-Anfragen, Liste unverändert).
- Soll: Neu-Einlesen funktioniert überall oder fliegt raus.

**Verdacht: weitere Knöpfe ohne Funktion** *(M13)*
- Problem: Systematisch geprüft — die Funde stehen in dieser Liste; Leon schaut „Funktionen passen noch nicht" später zusätzlich selbst an (siehe „Später").

**Die Fluss-Fokus-Falle** *(M14 — live verschärft)*
- Problem: Ohne platzierte Grafik gibt es keinen Weg aus dem Fluss-Fokus: ESC hilft nicht, erneutes Klicken hilft nicht (Fokus wird nur gesetzt, nie getoggelt); einziger Ausweg ist, ein anderes Element anzuklicken.
- Soll: Fokus immer verlassbar (ESC/Toggle).

**„Animation laden?"-Dialog nervt bei jedem Neuladen** *(M15)*
- Problem: Der Dialog feuert bei jedem Reload mit aktiver Seite. (In der Suche nicht erneut belegbar — Playwright verwirft native Dialoge — bleibt als bestätigt.)
- Soll: Einmal fragen bzw. Entscheidung merken.

**Test-Überbleibsel in der Preset-Bibliothek** *(M20)*
- Problem: Das Test-Preset „rt-bleibt (2 Frames)" liegt noch in Bibliothek › Presets.
- Soll: Entfernen.

**Unsichtbares Sonderzeichen mitten im Quellcode** *(N6)*
- Problem: In GrafikEditor.tsx steckt ein NUL-Byte (statt eines Leerzeichens) — die App läuft, aber die Datei gilt für Suchwerkzeuge als Binärdatei (Textsuche verweigert), kann Editoren/Diffs/Lint stören.
- Soll: Durch normales Leerzeichen ersetzen.
- Beleg: GrafikEditor.tsx:779, Byte-Offset 34135 (einziges NUL der Datei).

**Die Wasser-Linie findet ihre Ankerpunkte auf der importierten Seite nicht** *(N7)*
- Problem: Bei jedem Laden warnen 10–20 Konsolen-Meldungen „Anker nicht gefunden, Fluss läuft geradeaus weiter" (#mission, #stats, #tal …) — die dekorative Fluss-Linie degradiert still zu einer Geraden, weil die erwarteten Sektions-Anker in der importierten Seite nicht existieren.
- Soll: Anker-Zuordnung an die tatsächlich importierte Seitenstruktur koppeln.
- Beleg: RiverFlow.tsx:94; Konsolen-Mitschnitt (20–66 Warnungen).

**„⬡ In den Builder holen" ist beim Import-Normalfall sichtbar, aber dauerhaft ausgegraut** *(N11)*
- Problem: Der Knopf erscheint bei jedem Element, das ein Bild ENTHÄLT (der importierte Normalfall), sieht aktiv aus — ist aber grau und klick-tot, weil die Funktion nur für reine Bild-/SVG-Elemente durchgereicht wird. Dabei könnte die bestehende Logik das innere Bild ziehen. Betrifft direkt den Weg Import → Builder. Live bestätigt.
- Soll: Knopf funktioniert auch für Elemente mit enthaltenem Bild (oder erscheint nicht).
- Beleg: GrafikEditor.tsx:3030-3034 vs. WebsiteOg.tsx:329 + 362-371.

**Verwaiste Editor-Datei mit letztem Undo-Loch** *(N12)*
- Problem: RiverKursEditor.tsx wird nirgends mehr eingebunden (alte Routen leiten auf /editor um); nur dort existiert noch ein Fluss-Animations-Undo-Loch. Kein Laufzeit-Bug, aber Verwechslungsgefahr/Wartungslast durch eine große tote Datei.
- Soll: Datei entfernen.
- Beleg: RiverKursEditor.tsx:87-91; beide alten Routen leiten um.

**Hintergrund zeigt auf gelöschte Seite → Dauerfehlermeldung** *(N19 — Code-Verdikt)*
- Problem: Löscht man die Seite, die als Animator-Hintergrund gewählt war, wird nur die „aktive Website" aufgeräumt — der Hintergrund-Verweis bleibt. Der Animator zeigt dann bei jedem Neuladen dauerhaft „Seite konnte nicht geladen werden…". Kein Absturz, aber eine bleibende Sackgasse.
- Soll: Beim Löschen auch den Hintergrund-Verweis heilen (wie es für die aktive Seite schon passiert).
- Beleg: SeitenBereich.tsx:341-342; Selbstheilung nur für aktive Seite (page.tsx:96-122); nur im Code verifiziert.

## 7 · Station 4: Live-Preview + Export

**Der Export integriert nicht in die eigene Seite** *(M25 — mit Leons Präzisierung)*
- Problem: „Was soll ich denn mit 'nem Export, den ich dann wieder in meine eigene Seite einfüge, die ich im Builder bau? Das ist ja kompletter Quatsch." Heute ist der Export-Reiter datei-/einbettungs-orientiert (JSON/Overlay/Runtime/Element/Ganze-Seite) — alle 5 Wege lösen technisch sauber aus, aber der Kernweg fehlt.
- Soll (bestätigt): Kernweg = **Ordner-Struktur-Export** — ein fertiger, direkt veröffentlichbarer statischer Ordner der im Builder gebauten Seite MIT Animationen. Das Export-Menü ist primär darauf ausgerichtet; die Datei-Wege bleiben nachgeordnete Zusatzoption für fremde, nicht importierte Seiten.

**Überschrift und Buttons in der Vollbild-Vorschau unsichtbar** *(N13 — evtl. Mess-Artefakt)*
- Problem: In der Vollbild-Vorschau fehlen „Together, WEE can." und die Buttons „Über uns"/„Unterstütze uns hier" im Screenshot — obwohl alle Messwerte korrekt sind (sichtbar, richtige Position, deckkräftige Farbe). Möglicherweise ein Darstellungs-Artefakt des Test-Browsers (Blur-Effekt + Scroll-Animation). Unterscheidet sich vom „Texte fehlen"-Importfehler (dort wirklich unsichtbar gespeichert).
- Soll: Einmal in echtem Chrome prüfen, erst dann als Bug verbuchen (siehe „Ungeprüft").
- Beleg: station4-vollbild-top.png (+ Retry identisch); DOM-Messungen normal.

## 8 · Verbindliche Regeln (von Leon angeordnet)

- **Undo-Pflicht** *(R1)*: Jede gebaute Funktion muss per Strg+Z rückgängig machbar sein — alle bekannten Verstöße in Abschnitt 5.
- **Verifikations-Protokoll** *(R2)*: [verifikations-protokoll.md](verifikations-protokoll.md) — nie beim ersten Fehlschlag abbrechen, Ungeprüftes deklarieren, kein „alles geprüft" nach Fehlschlägen.
- **UI-Reihenfolge = Userflow** *(R3)*: Jede Oberflächen-Entscheidung folgt den vier Stationen.
- **Menüs erschlagen nicht** *(R4)*: Menüs logisch und schlank, strikt in die vier Stationen eingeteilt — kein Knopf-Dickicht, keine Station zeigt fremde Menüs. (Das Menü-Inventar je Station blieb ungeprüft und wird Teil des Umbau-Plans — der Flow-Umbau deckt die Neustrukturierung ab.)
- **Ein Designsystem** *(R5)*: Alles UI folgt dem WEE-Designsystem (Abschnitt 2) — keine Insellösungen je Panel.

## 9 · Bestätigt „Später" (Reihenfolge von Leon festgelegt)

- **Tutorial-Feinbau** *(S1)*: erst „wenn alles fertig ist" (der Trigger-Fix aus Abschnitt 1 kommt früher).
- **CLI/MCP-Neudruck + Tests** *(S2)*: erst wenn das komplette Tool final steht (nie wieder auf einen Zwischenstand).
- **Verify-Prozess** *(S3)*: geregelt (R2), Bewährung laufend.
- **Gemma-Zerlegung (lokales Modell)** *(S4)*: beim Import-Umbau — besprochen und gesetzt.
- **„Funktionen passen noch nicht"-Restprüfung** *(S5)*: Leon prüft später selbst; die Mängelsuche lieferte vorab die Kandidatenliste (diese Liste).

---

## 10 · Ungeprüft (Ehrlichkeits-Deklaration — nichts verschwiegen)

Punkte, die die Mängelsuche NICHT prüfen konnte — mit Grund und dem, was versucht wurde:

- **Screenshot-Kanal des eingebauten Browsers**: timeoutet auf dem Editor konsistent nach 30 s (mehrfach reproduziert, auch nach Resize + Reload — Eskalationsleiter befolgt; vermutlich blockiert die Dauer-Canvas-Animation die Erfassung). Klicks/Auslesen funktionierten; visuelle Belege liefen über eine separate Playwright-Instanz. Code-Audits belegen daher Existenz/Funktion, NICHT das Aussehen — keine Optik-Urteile abgegeben.
- **Unsichtbare Hero in der Vorschau** (Abschnitt 7): ob echter Bug oder Artefakt des Test-Browsers — offen; manuell in echtem Chrome prüfen, bevor verbucht.
- **Seiten-Wiederauferstehung + Hintergrund-Heilung** (Abschnitte 4/6): nur im Code verifiziert — Laufzeit-Repro hätte echtes Anlegen/Löschen in zwei Sitzungen bzw. Datenbank-Eingriffe erfordert (strikt read-only gearbeitet, wee-website-v3 geschützt).
- **History-/Deep-Link-Sequenzen** (Abschnitt 1): per Code-Trace belegt, nicht live durchgespielt (Sequenzen verändern Zustand; Screenshot-Beleg blockiert).
- **Undo wirkt nur auf einen Verlauf** (Abschnitt 5): statisch aus dem Code hergeleitet (plausibel), nicht interaktiv erzwungen.
- **Echter Ordner-Import**: nicht ausgeführt — der native „Ordner wählen"-Dialog ist im Automations-Browser nicht steuerbar; alle Import-Handler nur code-geprüft. Deshalb auch die **Falsch-Ordner-Meldung** (Abschnitt 3) weder bestätigt noch widerlegt.
- **„Als aktive Website setzen"-Knopf**: gesehen, bewusst NICHT geklickt (um wee-website-v3 nicht als inaktiv zu hinterlassen) → Funktion ungeprüft.
- **Speichern/Veröffentlichen + Konflikt-Mechanik (409)**: bewusst nicht ausgelöst (read-only, keine zweite Sitzung) → ungeprüft.
- **„Ordner neu einlesen" (Bibliothek) + „Ordner erneut freigeben" (Hintergrund)**: nur code-geprüft (verdrahtet) — erscheinen erst bei verbundenem Ordner, der ohne den nativen Dialog nicht herstellbar ist.
- **Alt+Klick-Selektion**: in beiden Prüf-Kanälen fehlgeschlagen (synthetisches Event griff nicht; vertrauenswürdiger Klick + Screenshot blockiert; Playwright kann nicht-interaktive Elemente nicht koordinaten-klicken) → keine belastbare Aussage.
- **Nicht vertieft**: Pucks eigener Undo/Redo-Knopf (nur Tastatur getestet); Byte-Inhalt der 5 Export-Downloads (nur Download-Erfolg bestätigt); „kein Fluss"-Export-Variante; Fluss-Sektionen (Wasser/Front/Nebel/Profil) + ShapeAccent/Grafik-Ebene nur code-geprüft; Verhalten über mehrere Tabs (aktive Seite/Hintergrund) und die alten /puck- bzw. /puck-import-Spike-Seiten nicht auf Kollisionen geprüft; Puck-interne Knöpfe (Fremdbibliothek) nicht auditiert.

## 11 · Kurz-Statistik

- Bekannte Mängel (Leons Abnahme): **25** (M1–M25) + **5 Regeln** (R1–R5) + **5 Später-Punkte** (S1–S5)
- Neue Funde der Mängelsuche: **21** (N1–N21) — davon 11 Bugs, 4 Undo-Regel-Verstöße, 5 UX, 1 Optik-Verdacht
- Neue Undo-Verstöße: 4 (Seiten-Löschen, Slider-Fokus, Bibliothek-✕, Ein-Stapel-Dispatch)
- In der Suche neu bestätigte bekannte Mängel: 18 (M1, M2, M4–M7, M10–M12, M14, M15, M17, M20, M22–M25 + R5)
- Verworfen: 1 Audit-Block („C", Platzhalterdaten) — Title-Zählung per Grep nachgeholt (~30 Knöpfe, in Abschnitt 2 eingearbeitet)
