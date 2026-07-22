Beide Docs gelesen. Hier die konsolidierte N-Liste (Audit C war ein Test-Dummy und wurde verworfen; Passwort-Gate und Tab-Titel wurden über alle Stationen zu je einem Eintrag zusammengeführt).

# Mängelsuche — neue Funde (N-Liste)

> Basis: 4 Code-Audits (A Undo-Abdeckung, B tote Buttons, D Zustands-/Flow-Brüche) + 4 Begehungs-Stationen (Import, Puck, Animator, Export/Preview). Audit „C" enthielt nur Platzhalter-Testdaten und wurde verworfen. Dedupliziert: gleicher Mangel aus Code-Audit und Live-Begehung = ein Eintrag mit beiden Belegen. NEU = nicht in `maengelliste-final.md` (M1–M25). Optik-Urteile bleiben bei Leon; Verdachtsfälle nur als `optik-verdacht`.

## Station 1 — Import

**N1 · Import-Unterseite hat keinen Hilfe-Zugang** — *ux*
Ist: Die Seiten-Liste hat oben rechts ein „?"-Hilfe-Icon mit Erklär-Dialog; wechselt man auf „Website importieren", verschwindet es komplett. Erwartet: gerade der Import-Schritt (Ordnerwahl, Styling-Verlust-Hinweis) ist erklärungsbedürftig → konsistente Hilfe-Affordanz auf beiden Sichten derselben Station.
Beleg: Accessibility-Snapshot „Website importieren"-Screen (nur Heading + „Zurück zur Liste" + „Ordner wählen", kein „?") vs. Seiten-Liste-Snapshot mit „Hilfe zum Seiten-Bereich".

**N2 · Seite löschen ist laut eigenem Dialogtext explizit unumkehrbar** — *regel-verstoss (R1)*
Ist: Klick auf „Löschen" öffnet nativen `confirm()` mit „…Das lässt sich nicht rückgängig machen.", der Hilfe-Dialog bestätigt „(mit Rückfrage, nicht umkehrbar)". Erwartet: R1 verlangt Strg+Z für JEDE Editier-Aktion — Seiten-Löschen ist die deutlichste, selbst dokumentierte R1-Ausnahme im Tool.
Beleg: `confirm()`-Dialogtext bei Klick „Seite … löschen"; Hilfe-Dialog-Absatz „Anlegen, Öffnen, Löschen"; app/api/puck-seite/loesche/route.ts + app/editor/SeitenBereich.tsx:331-347.

## Station 2 — Puck

**N3 · Duplizierte DOM-`id` im Props-Feld des HTML-Blocks** — *bug*
Ist: Nach Auswahl des HtmlBlock existieren ZWEI `<textarea>` mit identischer `id="imp-…-html-16_textarea_html"` (eines unsichtbar 0×0 in `.PuckLayout`, eines sichtbar in der rechten Sidebar). Erwartet: eindeutige IDs. Folge: ungültiges HTML, brüchig für `getElementById`/`aria-describedby` (Screenreader-/Label-Zuordnung); führte in der Prüfung zur irreführenden Erst-Messung „Tippen wirkungslos" (zuerst griff das unsichtbare Duplikat). Für den Nutzer sichtbar funktioniert das Feld, technischer Defekt darunter.
Beleg: `document.querySelectorAll('textarea')` nach Block-Auswahl → zwei Treffer gleiche id, verschiedenes offsetParent/Rect.

**N4 · Strg+Z im Puck-Editor springt zwischen nativer Textarea-History und App-Undo** — *bug (Bezug M11)*
Ist: Im HTML-Feld getippt → 1. Strg+Z macht nur den letzten Anschlag rückgängig (native Textarea-Undo); 2. Strg+Z hebt stattdessen die komplette Block-Auswahl auf (Props-Panel springt auf leere „Page"-Ansicht, Feld verschwindet). Erwartet: vorhersagbares Undo. Neuer, konkreter Repro-Fall für M11, im Puck-Editor (M11 war für Animator dokumentiert).
Beleg: Manueller Test; Screenshot station2-after-second-ctrlz.png.

**N5 · Puck-Editor-Kopfleiste ist eine großflächige dunkle Vollfläche** — *optik-verdacht (Bezug M24/R5)*
Ist: Über volle Bildschirmbreite dunkler Balken (Seitenname + Speichern/Zurück). Design-Vorgabe: „Dunkel nicht großflächig!". Nur Verdacht, Optik-Urteil bei Leon.
Beleg: station1-05-neu-erstellt.png / station1-09-oeffnen-puck.png (dunkler Balken „wee-website-v3 Bereit" über volle Breite).

## Station 3 — Animator

**N6 · NUL-Byte im Quellcode: GrafikEditor.tsx:779** — *bug*
Ist: Der „Leerzeichen"-Sentinel im OG-Scan-Signatur-String ist tatsächlich ein NUL-Byte (U+0000), bestätigt per Byte-Analyse (genau 1 NUL an Offset 34135). Erwartet: normales Leerzeichen. Funktional harmlos (App lief fehlerfrei), aber echte Quellcode-Korruption: die Datei wird von grep/ripgrep als BINÄR erkannt (Textsuche verweigert), kann Editoren, Parser, Git-Diffs, Lint stören.
Beleg: components/grafik/GrafikEditor.tsx:779 (Byte-Offset 34135, einziges NUL-Byte der 161188-Byte-Datei).

**N7 · RiverFlow-Anker stimmen nicht mit der importierten Seite überein (stiller Fallback)** — *bug*
Ist: Bei jedem Laden/Reload ~10–20 Konsolen-Warnungen „[RiverFlow] Anker nicht gefunden, Fluss läuft dort geradeaus weiter" für Selektoren #mission, #haltung, #oasis-prose, #bausteine, #stats, #tal u. a. Erwartet: Fluss läuft entlang der echten Seitensektionen. Folge: die dekorative Wasser-Linie degradiert still auf „geradeaus", Zuordnung Fluss-Anker ↔ echte DOM-Struktur der importierten Seite ist gebrochen (keine harten Fehler).
Beleg: components/river/RiverFlow.tsx:94; Konsolen-Mitschnitt bei Navigation auf /editor (0 Errors / 20 bzw. 66 Warnings nach Rückschaltung).

**N8 · Undo-Dispatch strikt nach Fokus — Strg+Z wirkt nur auf EINEN Stapel** — *ux / regel-verstoss (R1, Bezug M11/M14)* · PLAUSIBEL (statisch hergeleitet, nicht live erzwungen)
Ist: `rueckgaengigMachen()` dispatcht bei `flussObjekt.fokus` NUR auf den Fluss-Verlauf, sonst NUR auf den Grafik-Verlauf — nie beide. Folge: Fluss fokussiert + leerer Fluss-Verlauf → Strg+Z tut NICHTS, obwohl eine Grafik-Aktion rückgängig machbar wäre. Verschärft durch M14 (Fluss-Fokus-Falle) → man sitzt fest UND erreicht das Grafik-Undo nicht. Plausibler Kandidat für Leons „Strg+Z zerschossen" (M11).
Beleg: components/grafik/GrafikEditor.tsx:2376-2394 (Fokus-Dispatch). Nur logisch hergeleitet, Fluss war auf der Standard-Bühne nicht fokussiert → nicht interaktiv erzwungen.

**N9 · Strg+Z wird ignoriert, solange ein Slider (z. B. Grundbreite) den Tastaturfokus hält** — *regel-verstoss (R1, Bezug M11)*
Ist: Grundbreite-Slider verändert (240→620), mit Fokus noch auf dem Slider Strg+Z → nichts passiert (Wert bleibt 620). Der ↶-Undo-Button funktioniert; nach `blur()` des Sliders funktioniert auch Strg+Z (620→240). Erwartet: R1 gilt auch tastaturseitig. Ursache: natives `<input type=range>` absorbiert den globalen Strg+Z-Handler bei Fokus. Exakt eingegrenzte Variante von M11.
Beleg: station3-08-slider-changed.png; `evaluate`: value bleibt „620" nach Strg+Z bei Slider-Fokus, nach `blur()` dann „240".

**N10 · „Aus der Bibliothek entfernen" (✕) und Bibliotheks-Änderungen sind nicht mit Strg+Z rückgängig** — *regel-verstoss (R1)*
Ist: Der ✕-Knopf entfernt ein Asset via `setPool(pool.filter(...))` OHNE `ctx.commit`; der Pool ist lokaler `useState` und NICHT Teil der Undo-Historie (GrafikContext trackt nur grafiken+uebernommen). Folge: ein versehentlich entferntes (z. B. per Strg+V aus Canva eingefügtes) Asset lässt sich nicht zurückholen; gilt auch für Hinzufügen/Vektorisieren. Verletzt R1, eigenständig neben den bekannten Undo-Lücken.
Beleg: components/grafik/GrafikEditor.tsx:2554-2560 (setPool ohne commit); Pool ≈ GrafikEditor.tsx:439.

**N11 · „⬡ In den Builder holen" für Ist-Stand-Elemente mit enthaltenem Bild sichtbar, aber dauerhaft disabled + tot** — *bug*
Ist: Der Knopf erscheint immer, wenn das Element ein Bild ENTHÄLT (`holbar = bild|svg || masse.quelle!=null`), inkl. „Bildquelle: …"-Zeile und Hilfetext — das ist der importierte Normalfall (Blöcke als „deko"/„sektion" getaggt, `<img>` steckt drin). ABER `onInBuilder` wird nur für `typ===bild||svg` durchgereicht, sonst `undefined` → `disabled={!onInBuilder}`. Folge: Knopf sieht aktiv aus, ist grau/klick-tot, obwohl `ogAlsGrafikErzeugen` das innere `<img>` ziehen könnte. Betrifft direkt den Import→Builder-Weg. Live bestätigt an „projekte:karte:0" (holenVorhanden:true, holenDisabled:true).
Beleg: components/grafik/GrafikEditor.tsx:3030-3034 vs. components/grafik/WebsiteOg.tsx:329 + 362-371.

**N12 · Verwaiste Datei RiverKursEditor.tsx (tote Funktion, enthält das einzige Fluss-Anim-Undo-Loch)** — *bug (Wartungslast)*
Ist: RiverKursEditor.tsx wird nirgends mehr gemountet (/grafik-editor und /fluss-editor sind Client-Redirects auf /editor); nur dort geben Anim-Regler `ctx.setAnim` OHNE Verlauf durch (kein Fluss-Undo). Auf dem lebenden Pfad (/editor via `setAnimMitVerlauf`) ist das Loch geschlossen → der Undo-Bruch existiert nur in totem Code. Fund = Verwechslungsgefahr/Wartungslast (großes verwaistes File), kein Laufzeit-Bug.
Beleg: components/river/RiverKursEditor.tsx:87-91; app/grafik-editor/page.tsx + app/fluss-editor/page.tsx (router.replace /editor).

## Station 4 — Live-Preview + Export

**N13 · Hero-Headline + CTA-Buttons in der Vollbild-Vorschau unsichtbar, obwohl DOM/CSS korrekt** — *bug (evtl. Headless-Artefakt — vor Verbuchung in echtem Chrome prüfen)*
Ist: In der Vollbild-„Vorschau" von wee-website-v3 fehlen „Together, WEE can." und die Buttons „Über uns"/„Unterstütze uns hier" im Screenshot — sichtbar nur ein verschwommener Glass-Block mit Icon. Per `evaluate` geprüft: H1 opacity:1, weiß, korrekte Position, `elementFromPoint`-Top-Hit; der Button hat soliden orangenen Hintergrund (rgb(234,137,20), kein Blur) und ist trotzdem unsichtbar. Reproduziert nach Reload + Wartezeit (Font-Ladezeit ausgeschlossen). Möglicher Compositing-Effekt von `backdrop-filter:blur(14px)` der Glass-Card zusammen mit scroll-animierter `transform` auf `.cta-row`. Betrifft die Kern-Ansicht von Station 4. UNTERSCHEIDET sich von M4 (dort opacity:0 eingefroren; hier opacity:1 korrekt).
Beleg: station4-vollbild-top.png / station4-vollbild-top-retry.png (identisch nach Reload); DOM-Messung h1 rect {y:361,h:173}, Button rect {y:623,h:40}.

**N14 · Vollbild-Live-Preview und Export-Panel sind zwei komplett unverknüpfte Oberflächen** — *ux (Bezug M23)*
Ist: „Vorschau" führt zu einem reinen Vollbild-Dialog (nur „← Zurück", keine Export-Option); der Export liegt ausschließlich als Unter-Reiter im Animator-Grafik-Editor (überlagert dort die Bühne). Von der Vorschau gibt es keinen Weg zum Export und umgekehrt. Erwartet (Flow): Station 4 = „Live-Preview + Export" als eine Einheit. Vertieft M23 um das konkrete Detail, dass selbst die vorhandenen Teile nicht verlinkt sind.
Beleg: Snapshot editor/?bereich=seiten&vorschau=wee-website-v3 (nur „Zurück") vs. Export-Reiter unter Animator-Tab.

## Querschnitt (Import-Hygiene, Zustand/Flow, Routing)

**N15 · Passwort-Gate der Quellseite als Fremdkörper mit-importiert (überall sichtbar)** — *bug*
Ist: Die importierte Seite wee-website-v3 enthält einen eigenen Puck-Baustein (`imp-…-html-19`, HtmlBlock) mit `<form class="site-gate__panel">…Diese Seite ist geschützt…Passwort…Freischalten</form>` — der Zugangsschutz-Screen der Quell-Deployment-Umgebung (Vercel-Preview-Protection o. ä.), beim Einlesen von index.html mitkopiert statt herausgefiltert. Sitzt als eigener Abschnitt UNTER dem Footer, aktive Formularelemente (kein Overlay/keine Sperre). Erscheint identisch in Puck-Canvas, Vollbild-Vorschau UND Animator-Bühne → würde in einen Export mitgenommen. Eigene Ursache, NICHT M4/M7. (Station 1 sah ihn per CSS versteckt; Station 2/3 sahen ihn sichtbar am Seitenende — dieselbe DOM-Quelle.)
Beleg: station2-puck-bottom-passwortgate.png; station2-vorschau-bottom-sitegate.png; station3-01-sitegate-bottom.png; `evaluate` `<form class="site-gate__panel">` als Baustein imp-wee-website-v3-html-19.

**N16 · Browser-Tab-Titel + Meta-Description zeigen fremden Prototyp** — *bug*
Ist: `document.title` des gesamten Website-Builders = „WEE Titelkarte – Prototyp v1", Meta-Description = „Gepinnte Scroll-Titelkarte (Vorhang-Effekt) für World Eden Era …" — liegengebliebene Metadata aus dem Vorhang-Effekt-Prototyp (anderes Projekt derselben Codebasis). Identisch in allen Routen (/, /puck, /puck-import, /editor, Vorschau). Erwartet: passender Titel je Station. Folge: Tabs/Lesezeichen/Teilen-Vorschau verwirrend, Stationen nicht unterscheidbar.
Beleg: `evaluate` {title, metaDesc}; Quelle app/layout.tsx:21.

**N17 · Alle Puck-Seiten-API-Aufrufe lösen einen 308-Redirect aus (Doppel-Request)** — *bug/perf*
Ist: /api/puck-seite/liste, /lade, /loesche (POST) gehen ohne Trailing-Slash raus → [308] Permanent Redirect → erneut mit „/" → erst dann [200]. Jede Listen-/Lade-/Lösch-Interaktion feuert effektiv doppelt. Funktional unauffällig (POST bleibt erhalten), aber unnötiger Overhead + Hinweis auf inkonsistente Next.js-`trailingSlash`-Konfiguration.
Beleg: browser_network_requests: „[POST] …/liste ⇒ [308]" gefolgt von „[POST] …/liste/ ⇒ [200]" (mehrfach bei liste/lade/loesche).

**N18 · Stale-Save lässt eine gelöschte Seite ohne Konflikt wieder auferstehen** — *bug* (Code-Verdikt, Laufzeit-Repro nicht ausgeführt)
Ist: `speichereSeite` behandelt fehlende Datei als „neue Seite": `bestehend=null` → der 409-Konflikt-Guard `if (bestehend && !ueberschreibe && erwartetGespeichert !== bestehend.gespeichert)` wird per Short-Circuit übersprungen, auch bei mitgeschicktem (veraltetem) `erwartetGespeichert`. Repro (Mehr-Sitzungs-Szenario, das das Konfliktmodell laut Kommentar abdecken will): Tab A öffnet X in Puck, Tab B löscht X, Tab A „Speichern" → Server schreibt X frisch → Löschung still rückgängig, KEIN Banner. Erwartet: 409 „Seite existiert nicht mehr".
Beleg: lib/api/seiten-speicher.ts:256-268; Aufrufer SeitenBereich.tsx:240-271; Löschung SeitenBereich.tsx:331-347 + app/api/puck-seite/loesche/route.ts.

**N19 · Backdrop, der auf eine gelöschte Seite zeigt, wird nie selbst-geheilt** — *bug* (Code-Verdikt)
Ist: `loesche()` räumt NUR die aktive Website auf (`entferneAktiveSeite`, localStorage „wee-aktive-seite"). Ein explizit gewählter Backdrop vom Typ `puck-seite` (IndexedDB „wee-backdrop", quelle=Seitenname) wird NICHT angefasst; für die aktive Seite gibt es Selbstheilung (EditorInner prüft Existenz), für den Backdrop KEIN Pendant. Folge: nach Löschen der Backdrop-Seite zeigt der Animator bei jedem Reload dauerhaft „Seite konnte nicht geladen werden — im Panel Hintergrund eine andere wählen". Kein Crash, aber persistente weiche Sackgasse / Asymmetrie.
Beleg: SeitenBereich.tsx:341-342 (nur entferneAktiveSeite); Selbstheilung nur aktive Seite app/editor/page.tsx:96-122; Backdrop-Setzen BackdropAuswahl.tsx:125; Fehlerpfad Backdrop.tsx:231-236; Persistenz BackdropContext.tsx:58-61.

**N20 · Editor-Öffnen nicht history-integriert — Browser-Zurück verwirft ungespeicherte Puck-Änderungen still** — *ux* (Code-Trace)
Ist: `oeffne()` setzt `offeneSeite` OHNE `pushState`, während `oeffneVorschau`/`schliesseVorschau` `pushState` nutzen. (a) Im offenen Puck-Editor führt Browser-Zurück auf /editor (Animator); popstate unmountet SeitenBereich → `offeneSeite` + ungespeicherter `aktuelleDatenRef` gehen ohne Rückfrage verloren (kein beforeunload/Dirty-Check). (b) `schliesseVorschau` pusht neuen Eintrag statt `history.back()` → Zurück kann in veraltete `?vorschau=X`-Ansicht springen, während der Editor Seite Y offen hält (Vorschau-Vorrang gewinnt) → Zustandssprung.
Beleg: SeitenBereich.tsx:219-237 (oeffne ohne pushState) vs. 182-196; Vorschau-Vorrang 349-353; Bereichs-popstate app/editor/page.tsx:227-241.

**N21 · Deep-Link `?vorschau=X` ohne `?bereich=seiten` wird still ignoriert** — *ux* (niedrige Schwere)
Ist: `leseBereich()` mountet SeitenBereich nur bei `bereich==="seiten"`. Eine URL nur mit `vorschau=X` (händisch gekürzter/geteilter Link) landet auf dem Animator, Vorschau-Absicht wird kommentarlos verworfen — obwohl der Hilfe-Dialog den Vorschau-Link als „teilbar und reload-fest" bewirbt. In-App-Links setzen immer beide Params, trifft nur manuell bearbeitete Links.
Beleg: app/editor/page.tsx:172-175; Param-Lesen SeitenBereich.tsx:172-180; „teilbar"-Zusage SeitenBereich.tsx:650-655.

---

## Bestätigungen bekannter Mängel (nicht neu belegt)

- **M1** — /editor/ startet auf „Animator" (Default) statt Import; Tab „Animator" vor „Seiten"; Vier-Stationen-Flow nicht als Navigation abgebildet. (page.tsx:221 useState „animator"; live read_page)
- **M2** — ProduktTutorial ist im Animator gemountet → feuert auf der Default-Animator-Station, nicht am Flow-Anfang.
- **M4** — Roh-HTML mit `style="opacity:0"` an tc-hero/glass/cta-row eingefroren; Vorschau zeigt leere Glass-Card, Puck zeigt „Together, WEE can." (station1-08 vs. -09).
- **M5** — Gesamter Seiteninhalt = EIN „HTML-Block (übriges Markup)", nur Roh-Textarea, kein visuelles Editieren.
- **M6** — Seitenliste zeigt nur „wee-website-v3", obwohl Hauptnav /project-oasis/ /pilot-projekt/ /faq/ verlinkt.
- **M7** (grenzt an) — Import kopiert Fremd-Markup falsch/unvollständig (siehe N15 als eigener Fund).
- **M10** — „⟳ Neu einlesen" (WebsiteOg) feuert ohne Fehler, bewirkt sichtbar nichts (0 Netzwerk-Anfragen, Liste unverändert).
- **M11** — bestätigt via N4/N8/N9 (neue konkrete Repro-Fälle); der Standard-Grafik-Platzier-Pfad war jedoch sauber undo-bar.
- **M12** — Backdrop-Wechsel nicht undo-bar; live verschärft: Strg+Z überspringt den Backdrop-Wechsel und entfernt stattdessen die zuvor platzierte Grafik.
- **M14** — Fluss-Fokus-Falle: ESC und Re-Klick verlassen den Fokus nicht (setFokus(true), kein Toggle; Esc ohne Fluss-Reset); einziger Ausweg = anderes Ist-Stand-Element anklicken.
- **M15** — „Animation laden?"-Dialog in dieser Session nicht neu reproduziert (Playwright verwirft native Dialoge) → weiterhin als bestätigt behandeln, nur diesmal nicht belegbar.
- **M17** — Haupt-Tabs „Animator"/„Seiten" ohne `title`-Attribut (Hover-Erklärung fehlt), während alle anderen Knöpfe eines haben.
- **M20** — Preset „rt-bleibt (2 Frames)" weiterhin in Bibliothek › Presets.
- **M22** — Kein Ein-/Ausblenden-Control fürs Animator-Panel; `.gre-panel` liegt dauerhaft über der Bühne.
- **M23** — keine eigene Live-Preview+Export-Station (siehe N14 für die Verknüpfungs-Vertiefung).
- **M24 / R5** — Editor-Panel durchgängig dunkelgrün/schwarz (alle 8 Reiter) — widerspricht „hell/sand, Dunkel nicht großflächig".
- **M25** — Export-Reiter datei-/embed-orientiert (JSON/Overlay/Runtime/Element/Ganze-Seite), kein deploybarer Ordner-Struktur-Export der gebauten Seite MIT Animation als Kernweg. Alle 5 Wege lösten sauber aus (Downloads bestätigt, 0 Fehler/404).

## UNGEPRÜFT (Protokoll-Pflicht — nichts verschwiegen)

**Visuelle Belege / Screenshot-Kanal:** Der Claude_Browser-`computer{screenshot}`-Kanal timeoutet auf http://127.0.0.1:3113/editor konsistent nach 30 s — reproduziert über mehrere Versuche, auch nach Viewport-Resize (1280×800) + vollständigem Reload (Eskalationsleiter befolgt). Vermutlich blockiert eine dauerhafte RAF-/Canvas-Animation die CDP-Screenshot-Erfassung. `read_page`, `javascript_tool`, `computer{left_click}` funktionierten auf demselben Tab; visuelle Belege liefen über eine separate Playwright-Instanz (dort unauffällig). Für die reinen Code-Audits musste teils ganz auf read_page/Accessibility-Snapshot + `evaluate`-Messungen ausgewichen werden → belegen Existenz/Funktion, NICHT das Aussehen. Keine Optik-Urteile abgegeben.

**N13 (Hero unsichtbar):** Ob realer Nutzer-Bug oder reines Headless-Screenshot-Kompositing-Artefakt (bekannte Chromium-Eigenheit bei `backdrop-filter`) — UNGEPRÜFT. DOM/CSS-Werte korrekt, Problem trat direkt UND nach Reload+Wartezeit auf; Abgleich mit sichtbarem (nicht-headless) Fenster war mit den Tools nicht möglich. Empfehlung: manuell in echtem Chrome prüfen, bevor verbucht.

**N18 / N19 (Stale-Save-Auferstehung, Backdrop-Heilung):** Laufzeit-Repro NICHT ausgeführt — erfordert Anlegen UND Löschen echter Puck-Seiten in zwei Sitzungen bzw. IndexedDB-Manipulation an echter Umgebung; strikt read-only + Schutz von wee-website-v3 → nur Code-verifiziert.

**N20 / N21 (History/Deep-Link-Sequenzen):** NICHT live durchgespielt — die Mehr-History-Eintrag-Sequenzen verändern Zustand und die Screenshot-Evidenz war blockiert; per Code-Trace der pushState/popstate-Pfade belegt.

**N8 (Undo-Dispatch nach Fokus):** Nur statisch/logisch aus dem Code hergeleitet (PLAUSIBEL), nicht live erzwungen — der Fluss war auf der Standard-Bühne nicht fokussiert; Fokussieren + Strg+Z bei leerem Fluss-Verlauf nicht interaktiv erzwungen.

**Echter Ordner-Import (Station 1/2):** NICHT ausgeführt — „📁 Ordner wählen" öffnet den nativen File-System-Access-Dialog, im Automations-/Playwright-Browser nicht steuerbar. Alle Import-Handler (waehleOrdner/analysiere/speichere) nur code-geprüft. **M9 (Quellprojekt-Erkennung ohne HTML)** aus demselben Grund weder bestätigt noch widerlegt.

**„Als aktive Website setzen"-Button:** nur in der Liste gesehen, NICHT geklickt (Wechsel der aktiven Website bewusst vermieden, um wee-website-v3 nicht als „nicht mehr aktiv" zu hinterlassen) → Funktionalität UNGEPRÜFT.

**Speichern/Publish + 409-Konflikt-Mechanik:** bewusst NICHT ausgelöst (strikt read-only; keine zweite Session verfügbar). Speicherpfad-Korrektheit und Puck-eigene Konflikt-Antwort UNGEPRÜFT.

**Bibliotheks-„⟳ Ordner neu einlesen" + Backdrop-„🔓 Ordner erneut freigeben":** nur code-geprüft (verdrahtet) — erscheinen erst bei verbundenem Ordner, der ohne FS-Access-Dialog nicht herstellbar ist.

**Alt+Klick-Selektion (Ebenen-Hilfetext):** FEHLGESCHLAGEN in beiden Kanälen → UNGEPRÜFT. Versuch 1: synthetisches MouseEvent(altKey:true) per dispatchEvent — keine Auswahländerung, aber untrusted (unklar ob Handler nur trusted Events hört). Versuch 2: Trusted-Klick via computer-Tool — blockiert (coordinate-clicks setzen vorherigen `screenshot` voraus). Versuch 3: computer-Screenshot — 30 s-Timeout. Playwright bietet keinen koordinatenbasierten Klick auf nicht-interaktive Elemente (Überschriften bekommen keine Refs). Keine belastbare Aussage möglich.

**Weitere nicht vertieft:** Puck-eigener Toolbar-Undo/Redo-Button (nur Tastatur-Strg+Z getestet); Byte-Inhalt der 5 Export-Downloads (landeten in nicht-lesbarem Sandbox-Pfad `.playwright-mcp/`, nur Download-Erfolg bestätigt); „kein Fluss"-Export-Variante; Fluss-Sektionen (FlussSektion/Wasser/Front/Nebel/Profil) und ShapeAccent/Grafik-Ebene-Bausteine nur code-geprüft; Cross-Tab-Verhalten (storage-Event) von useAktiveSeite/Backdrop und die /puck- bzw. /puck-import-Spikes nicht auf Kollision mit dem Editor-Zustand geprüft; Puck-Editor-interne Buttons (@puckeditor/core, Drittanbieter) nicht auditiert.

## Kurz-Statistik

- **Neue Funde gesamt: 21** (N1–N21)
- Nach Art: **bug 11** (N3, N6, N7, N11, N12, N13, N15, N16, N17, N18, N19), **regel-verstoss 4** (N2, N9, N10, N8-teilw.), **ux 5** (N1, N8, N14, N20, N21), **optik-verdacht 1** (N5)
- Nach Station: Import 2 · Puck 3 · Animator 7 · Export/Preview 2 · Querschnitt 7
- R1-Verstöße (Undo-Pflicht) neu: **4** (N2 Seiten-Löschen, N9 Slider-Fokus, N10 Bibliothek-✕, N8 Fokus-Dispatch)
- Bezug zu bekannten M: N4/N8/N9→M11, N8→M14, N5→M24/R5, N14→M23 (Vertiefungen, kein Neu-Beleg)
- Bestätigte bekannte Mängel: **18** (M1, M2, M4, M5, M6, M7, M10, M11, M12, M14, M15, M17, M20, M22, M23, M24, M25 + R5)
- Verworfen: 1 Audit-Block („C") = reine Test-Platzhalterdaten
- Ein Code-Fehler mit Tooling-Impact: **N6** NUL-Byte macht GrafikEditor.tsx für grep/Git-Diffs binär
## Nachtrag: Title-Vollzählung (Audit-C-Ersatz, vom Orchestrator nachgeholt 2026-07-23)

Der Menü-/Title-Audit lieferte Platzhalterdaten und wurde verworfen (oben deklariert); die Zählung wurde
vom Orchestrator per Grep nachgeholt. **Buttons ohne `title` (Restbestand zu M17), Datei → fehlend:**
GrafikEditor.tsx 8 (41/33) · **GrafikObjektMenue.tsx 8 (9/1!)** · GrafikCrop.tsx 4 (4/0) ·
FlussSektion.tsx 3 (3/0) · app/editor/page.tsx 2 (2/0 — Bereichs-Umschalter!) · GrafikExportAnleitung.tsx 2 ·
GrafikHilfe.tsx 2 · je 1: EasingKurve, RiverKursEditor (verwaist, s. N12), FrontSektion, NebelSektion,
ProfileSektion, WasserSektion, BackdropAuswahl, BackdropHilfeIcon, shared/HilfeIcon.
**Summe: ~30 Buttons ohne Hover-Erklärung.** (Hilfe-Icons tragen aria-label — title zusätzlich sinnvoll,
Einzelfall-Entscheidung beim Umbau.) Das Menü-INVENTAR je Station (R4-Bewertung) bleibt UNGEPRÜFT und
wird Teil des Flow-Umbau-Plans (M1/R4 decken die Neustrukturierung ohnehin ab).
