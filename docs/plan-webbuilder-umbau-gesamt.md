# Umsetzungsplan: Webbuilder-Gesamtumbau (flowcode-website-builder)

> **Erstellt:** 2026-07-23 · **Grundlage:** `user-projects/flowcode-website-builder/docs/maengelliste-final.md`
> (v4 + Station-4-Klarstellung, von Leon bestätigt) + 5-Perspektiven-Analyse (Workflow-Run
> `wf_ce029c11-a2f`, 5× Opus-Analyse + Sonnet-Coverage-Audit; Lens-Berichte im Session-Scratchpad
> `scratchpad/lens-reports/`). Codex/Gemini-Backends des multi-plan-Skills sind nicht installiert —
> ersetzt durch Workflow-Agenten gemäß Leons Anordnung (Planung Fable, Analyse Opus/Sonnet).
> **Projekt-Repo:** `coastcoder439/flowcode-website-builder` · alle Commits via `git -C user-projects/flowcode-website-builder`.
>
> **Verbindlicher Userflow:** 1. Import → 2. Puck → 3. Animations-Preview (Animator) → 4. Live-Preview + Export.
> **Regeln:** R1 Undo-Pflicht · R2 Verifikations-Protokoll (`docs/verifikations-protokoll.md`) ·
> R3 UI = Userflow · R4 schlanke Stations-Menüs · R5 ein Designsystem (WEE, hell/sand).
> **Bans:** kein Decap/CMS · keine Feature-Entfernung (nur additiv/umgruppieren, Gate: `docs/feature-inventar.md`) ·
> keine Grün-Flächen, Dunkel nie großflächig · `npm run build` nie während der Dev-Server läuft.
> **Arbeitsweise je Häppchen:** bauen → tsc → Browser-Verify nach Protokoll (dreiwertig OK/FEHLGESCHLAGEN/UNGEPRÜFT,
> Eskalationsleiter, Screenshot-Beleg) → Orchestrator-eigener End-to-End-Blick → Commit+Push mit Repo-Ansage.
> Leons Optik-Abnahme zusätzlich bei jedem sichtbaren Häppchen.

---

## Aufgabentyp
Fullstack-Umbau (Editor-UI, Client-State, Autoren-API, Import-Pipeline mit lokalem Modell, Export-Generator).

## Technische Kernentscheidungen (aus der Analyse, konsolidiert)

1. **Station-Shell statt 2-Reiter-Umschalter:** `type Station = "import" | "bauen" | "animator" | "preview"`,
   URL-Wahrheit `?station=` (Default `import`, Alt-Param `?bereich=seiten` → `bauen` gemappt). Ein zentraler
   `navigiere()`-History-Reducer für ALLE Wechsel inkl. Puck-Öffnen (behebt die pushState-Asymmetrie an der Wurzel).
   Station 3↔4 teilen sich EINEN gemounteten Bühnen-Baum (`previewModus`-Flag, kein Remount → Latch/Backdrop-State stabil).
2. **EIN Undo-Bus (Command-Timeline) statt föderierter Stapel:** neuer Provider `components/undo/UndoBus.tsx`;
   Coalesce/Limit-Mechanik 1:1 aus `GrafikContext` gehoben. Domänen (Grafik, Fluss, Backdrop, Bibliothek/Pool,
   Seiten-Löschen) werden Command-Produzenten. Scope je Station (Ctrl+Z wirkt auf den aktiven Stations-Scope);
   Puck-Station über History-Bridge an `usePuck().history`. Ein zentraler Fokus-Guard: Textfelder → nativ,
   Slider/Buttons/Bühne → Bus. Seiten-Löschen wird Papierkorb (Rename statt unlink) + Restore-Endpoint.
3. **Import-Pipeline HYBRID (Skripte mechanisch · gemma4 urteilt):** (A) Freeze per Playwright
   (Render → Scroll-Sweep → `getAnimations().finish()` → End-DOM) · (B) Framework-Marker `/_next/static/` ·
   (C) juice-CSS-Inlining je Baustein + PostCSS-`url()`-Rebase/Asset-Kopie VOR der Zerlegung ·
   (D) gemma4-Segmentierung (kompakte DOM-Outline → JSON-Urteil, harte mechanische Validierung, 2 Retries,
   deklarierter deterministischer Fallback — nie still) · (E) eigenes Puck-Mapping (feine Bausteine).
   Unterseiten-Crawl über alle `out/**/index.html`. Fremdkörper-Filter (Passwort-Gate) vor der Zerlegung.
   **Bühne = lebendige Seite** über den bestehenden Backdrop-Service-Worker-Ordnermodus; die eingefrorene
   Fassung ist NUR Segmentier-Input.
4. **EIN Export-Generator, zwei Modi:** INLINE (heutige `baueSeiteHtml`, bleibt) powert die Station-4-Preview
   per `iframe srcdoc` (= Export-Wahrheit, Links echt, nichts selektierbar, Animator per Konstruktion weg);
   ORDNER (neu, M25-Kernweg) schreibt deploybare Struktur `export/<slug>/` (index.html je Seite, wee-embed.js
   als Datei, assets/, css/, README) über neue Autoren-API-Route `POST /api/export/ordner`
   (Sicherheitsmuster 1:1 von `api/import/asset`). Kein Puck-Import server-seitig (DOM-Abgriff primär).
5. **Design als Alias-Layer:** neu `app/editor/editor-ui.css` mit semantischen `--tool-*`-Aliassen auf die
   vorhandenen WEE-Tokens (`app/design-tokens.css` = SSOT, bereits identisch mit der Referenz); alle 11
   Panel-CSS-Dateien ersetzen Hartwerte mechanisch; Puck-Chrome über dokumentierte `--puck-*`-Variablen.
   Fonts: `system-ui` → Syne/Montserrat. Grün-600-Buttonflächen (belegter R5-Verstoß) → Sand-Flächen +
   Orange/Grün-500 nur als Signal.

---

## Phasen (Bau-Reihenfolge)

### Phase 0 — Hygiene-Quickfixes (isoliert, sofort verifizierbar)
| Schritt | Inhalt | Dateien | Mängel |
|---|---|---|---|
| P0.1 | NUL-Byte durch Leerzeichen ersetzen (Datei wird wieder Text für grep/diff) | `components/grafik/GrafikEditor.tsx:779` (Byte-Offset 34135) | N6 |
| P0.2 | `skipTrailingSlashRedirect: true` — 308-Doppelrequests weg | `next.config.mjs` | N17 |
| P0.3 | Neutraler Produkt-Titel/-Description statt Vorhang-Prototyp | `app/layout.tsx:20-24` | N16 (Hälfte) |
| P0.4 | Verwaiste `RiverKursEditor.tsx` löschen (Nutzung 0 verifiziert; Redirects bleiben) | `components/river/RiverKursEditor.tsx` | N12 |

**Gate:** tsc grün, App startet, Netzmitschnitt ohne 308, grep findet GrafikEditor-Inhalte wieder.

### Phase 1 — Flow-Fundament: Vier-Stationen-Shell (Lens „flow", Schritte F1–F7)
| Schritt | Inhalt | Mängel |
|---|---|---|
| F1 | `Station`-Typ + 4er-Nav in Flow-Reihenfolge, `?station`-Param, Default `import`; Alt-Links `?bereich=seiten`→`bauen`; Station 4 vorerst = heutige SeitenVorschau (Platzhalter bis Phase 5) | M1, R3, R4 |
| F2 | Zentraler History-Reducer `navigiere()` + Dirty-Guard („Wirklich verlassen?" bei ungespeicherten Puck-Änderungen) + `document.title` je Station | N20, N16 (Rest) |
| F3 | Deep-Link-Heilung: `?vorschau=X` ohne Station → richtige Station auflösen | N21 |
| F4 | Import als echte Station 1 (aus SeitenBereich-Unterzustand herausgelöst; nach Speichern → `navigiere("bauen", name)`) | M1 |
| F5 | Produkt-Tutorial-Trigger auf Station 1 verlagern (ProduktTutorial + `produktAutoKetteRef` auf Shell-Ebene; Latch-Key + HilfeMenue unverändert) | M2 |
| F6 | M22-Panel-Toggle in Station 3 (`.gre-panel` per CSS-Sichtbarkeit, kein Unmount, Rest-Wiedereinblend-Knopf) | M22 |
| F7 | Menü-Inventar je Station dokumentieren + umgruppieren (Export-Reiter → Station 4 vorgemerkt, Hintergrund-Reiter bleibt Station 3; NICHTS entfällt — Gate gegen feature-inventar §1) | R4 |

**Risiken:** Latch-/Provider-Doppelmount (→ ein Baum + Flag), Tutorial-Latch-Kette (→ als Ganzes verschieben,
localStorage-Test), Alt-Links (→ Mapping). **Gate:** Zustandsmatrix Station×Sub reload-fest; Browser-Zurück
mit Rückfrage; Screenshot der 4er-Nav.

### Phase 2 — Undo-Bus: R1 strukturell erfüllen (Lens „undo", U0–U8)
| Schritt | Inhalt | Mängel |
|---|---|---|
| U0 | Bus-Gerüst + Coalesce-Extraktion, Unit-Tests, noch nicht gemountet | (R1-Basis) |
| U1 | Grafik als erster Producer — Verhalten EXAKT wie heute (Regressions-Anker) | M11 |
| U2 | Fluss in denselben Scope, Fokus-Router (`GrafikEditor.tsx:2376-2394`) gelöscht → Ctrl+Z = chronologisch letzte Aktion | N8, M11 |
| U3 | Zentraler Fokus-Guard: Slider → Bus greift; Textfelder → nativ | N9 |
| U4 | Backdrop-Wechsel undo-bar (`setBackdropMitUndo`, IndexedDB im undo/redo mitgeführt) | M12 |
| U5 | Bibliothek/Pool undo-bar (Entfernen/Hinzufügen/Vektorisieren) | N10 |
| U6 | Puck-History-Bridge (Puck-Scope delegiert an `usePuck().history`; vorher Puck-0.22-Doku via Context7 verifizieren; Fallback: Bridge aus, Pucks eigenes Ctrl+Z ungestört) | N4 |
| U7 | Server: Papierkorb (`seiten/.papierkorb/<name>-<ts>.json`, Rename statt unlink) + `POST /api/puck-seite/wiederherstelle` + 409 „Seite existiert nicht mehr" bei `!bestehend && erwartetGespeichert` + openapi.yaml | N2, N18 |
| U8 | Löschen im Bus (undo=restore, confirm-Text angepasst) + Backdrop-Heilung beim Löschen / `effektiverBackdrop`-Selektor absichern | N2, N19 |

**Gate je Schritt:** die exakten Repro-Sequenzen aus der Mängelliste (Slider 620→Ctrl+Z→240 ohne blur;
Grafik→Fluss→Grafik 3×Ctrl+Z; M12-Sequenz; ✕→Ctrl+Z; Löschen→Ctrl+Z; Tab-A/Tab-B-Stale-Save→409).

### Phase 3 — Funktions-Bugs Animator/Puck (Coverage-Audit-Waisen, eigene Phase)
| Schritt | Inhalt | Mängel |
|---|---|---|
| B1 | „Neu einlesen"-Knöpfe: Diagnose (WebsiteOg ⟳ feuert ohne Wirkung, 0 Requests) → alle Vorkommen fixen oder mit Begründung entfernen lassen (Leon-Rückfrage falls Entfernung) | M10 |
| B2 | Fluss-Fokus-Falle: ESC verlässt Fokus, Re-Klick toggelt (`setFokus`), kein Sackgassen-Zustand mehr | M14 |
| B3 | „Animation laden?"-Dialog: Entscheidung merken (Latch je Seite), feuert nicht mehr bei jedem Reload | M15 |
| B4 | Doppelte Textarea-`id` im HtmlBlock-Propsfeld beseitigen (Puck-Field-Render untersuchen) | N3 |
| B5 | RiverFlow-Anker: Selektor-Liste an die tatsächlich importierte Seitenstruktur koppeln (konfigurierbar statt hartkodiert; stiller Geradeaus-Fallback bleibt, aber ohne Warnungs-Spam) | N7 |
| B6 | „⬡ In den Builder holen" für Elemente MIT enthaltenem Bild aktivieren (`onInBuilder` durchreichen, `ogAlsGrafikErzeugen` zieht das innere `<img>`) | N11 |
| B7 | Preset-Name als Inline-Eingabefeld statt `prompt()` (Undo-Einordnung gem. U5) + Test-Preset „rt-bleibt"-Seed entfernen (nach P0.1 per Read auffindbar; IndexedDB-Altbestand prüfen) | M16, M20 |

**Gate:** je Bug die Repro aus der Mängelliste vorher rot / nachher grün, mit Beleg.

### Phase 4 — Import-Endlevel (Lens „import", Schritte I–VIII; Spec §11 + import-endlevel.md)
| Schritt | Inhalt | Mängel |
|---|---|---|
| I1 | Freeze-Skript `scripts/freeze-seite.mjs` (+ Mini-Static-Server; Playwright devDep): Render → Hydration-Idle → Scroll-Sweep → `getAnimations().finish()` → self-contained End-HTML. Messlatte: 0× `opacity:0` an Textträgern (heute 34×) | M4 |
| I2 | Fremdkörper-Filter (`lib/import/fremdkoerper-filter.ts`, konservative Selektor-Liste `.site-gate` u. a., Bericht-Flag) + Framework-Erkennung | N15 |
| I3 | gemma4-Segmentierung (`scripts/segmentiere-gemma.mjs` + `dom-outline.ts` + `gemma-contract.ts`): Outline → JSON-Urteil, Validierung (jede ref genau 1×, Reihenfolge dokumenttreu), 2 Retries, deklarierter Fallback; Urteil wird gecacht (Determinismus). Vorher `ollama list` (Modell-Tag prüfen) | M5 |
| I4 | Puck-Mapping aus dem Urteil (`htmlZuPuckMitSegmentierung`; alte `htmlZuPuck` bleibt Fallback): feine Sektion/Text/Bild-Bausteine, HtmlBlock nur für echten Rest | M5 |
| I5 | CSS-`url()`-Reparatur: PostCSS-Rebase, Fonts/Medien mitkopieren, `:root`→`:scope` per AST; Asset-Route um Font-Endungen erweitern. Messlatte: 0×404 | M7 |
| I6 | Unterseiten-Crawl: Mehrfachauswahl im UI, Schleife über `out/**/index.html`, Slugs `<slug>-<unterpfad>`; Re-Import = Überschreiben mit Bestätigung (`ueberschreibe`+`erwartetGespeichert`, UI-409-Widerspruch vereinheitlicht), Asset-Aufräumung reversibel | M6, M3 |
| I7 | Station-1-Feinschliff: „?"-Hilfe-Icon, differenzierte „erst bauen"-Meldung bei Next-Quellordner ohne out/ | N1, M9 |
| I8 | Bühnen-Kopplung: Animator-Bühne lädt die aktive Seite über den SW-Ordnermodus (lebendige Seite MIT eigenen Animationen); eingefrorene Fassung nur Segmentier-Input. M18-Verify (Reset-Regeln greifen jetzt?) | M8, M18 |
| I9 | Import-Abnahme: Screenshot-Paar Original vs. Bühne, opacity-Stichproben, 404-Netzscan, Unterseiten-Liste — nach Protokoll, dann Orchestrator-Blick, dann Leon | M3 (Summe) |

**Risiken:** Playwright-Größe/Latenz (→ Skript/dev-API, nicht Browser-Pfad), freeze-dry dormant (→ Eigen-Abgriff
als Rückfallbasis, Fork statt Live-Dep), gemma-Halluzination (→ mechanische Validierung + Fallback), AGPL (→ nur
externer Prozess).

### Phase 5 — Station 4: Preview-Modus + Ordner-Export (Lens „preview-export", S1–S6 + Flow-F8)
| Schritt | Inhalt | Mängel |
|---|---|---|
| X1 | Export-Generator-Kern (`components/embed/ordner-export.ts`, reine Funktionen, `walkTree`-Asset-Enumeration, Modi INLINE/ORDNER), Unit-Tests | M25 |
| X2 | Schreib-Route `POST /api/export/ordner` (Muster import/asset: Origin-Gate, Pfad-Guards, MIME-Whitelist) → `export/<slug>/` (gitignored) + api-roundtrip-Checks (Neudruck bleibt S2!) | M25 |
| X3 | Multi-Page-Markup-Abgriff (verstecktes `<Render>` je Seite, sequenziell) | M25 |
| X4 | Station 4 real: Preview als `iframe srcdoc` des INLINE-Artefakts (Export-Wahrheit; Links echt, nichts selektierbar, Animation läuft) + Umschalter „echtes Ordner-Artefakt" + ausklappbares Export-Fenster („Als Ordner exportieren" primär, die 5 Datei-Wege sekundär — nichts entfernt); ersetzt den Phase-1-Platzhalter; Bühnen-Baum-Variante (previewModus) gem. Flow-Architektur | M23, N14, M25 |
| X5 | Verkabelung Preview↔Export + Nav-Übergabe (Station-4-Reiter, Titel) | N14 |
| X6 | N13-Verifikation in ECHTEM Chrome (Export-Ordner direkt öffnen, Hero/CTA-Sichtbarkeit): erst dann als Bug ODER Mess-Artefakt verbuchen (dreiwertiges Protokoll) | N13 |

### Phase 6 — Designsystem-Umbau (Lens „design", C0–C8; NACH dem Struktur-Umbau, damit die finale Struktur gestylt wird)
| Schritt | Inhalt | Mängel |
|---|---|---|
| D0 | `--tool-*`-Alias-Layer (`app/editor/editor-ui.css`) + Fonts Syne/Montserrat in alle Panels (kein Farbwechsel) | M24-Basis |
| D1 | Seiten-Station hell (3 dunkle Reste; helle Puck-Kopfleiste als ERSTES Optik-Häppchen an Leon) | N5 |
| D2 | Puck-Chrome über `--puck-*`-Variablen-Override | M24 |
| D3 | Animator-Hauptpanel `.gre-panel` in 3 Teilen (Variante A solid-Sand vs. B helles Glas → Leon wählt vorab) | M24 |
| D4 | Satelliten-Dialoge (Inspector, Objektmenü, Timeline, Easing, Ebenen) | M24 |
| D5 | Overlays & Hilfe (Crop, Hilfe, Tutorial-Optik) + @scope-Warnkasten entfernen | M19, M24 |
| D6 | Fluss-Sektionen + Backdrop-UI (river.css/river-birth.css = Feature-Visual, NICHT anfassen) | M24 |
| D7 | M17-Titel-Abdeckung: Konvention (title+aria-label, Wirkung beschreiben) + zentrale Textquelle `components/shared/knopf-titel.ts` + Gate „kein button ohne Textkind und ohne title" (~30 Knöpfe gem. Mängelliste §2) | M17 |
| D8 | Token-Feinschliff nach Leons Wahl (Gelb-Ersatz für „aktiv/gekoppelt": Orange/Grün-500/Amber-Optionsset) | M24 |

Token-Mapping-Tabelle + Komponenten-Inventar: siehe Lens-Bericht design (im Plananhang referenziert).

### Phase 7 — Gesamt-Abnahme (M21 + Protokoll)
- Screenshot-Serie je Sicht (Station 2/3/4) bei 375/768/1440 (+1920 Animator) + Control-Nahaufnahmen.
- Voller End-to-End-Durchlauf durch alle vier Stationen durch den Orchestrator selbst (Import echter Ordner →
  Puck → Animator → Preview → Ordner-Export → Export-Ordner in echtem Chrome öffnen).
- Abbau der UNGEPRÜFT-Liste aus der Mängelliste §10, soweit jetzt prüfbar (echter Ordner-Import, 409-Mechanik,
  „Als aktive Website setzen", Alt+Klick, Export-Download-Inhalte) — Rest weiterhin deklarieren.
- Leons Optik-Abnahme (M21) — technisches Grün ist keine Design-Abnahme.

### Später (bestätigt, NICHT in diesem Plan)
- S1 Tutorial-Feinbau („wenn alles fertig ist") · S2 CLI/MCP-Neudruck + api-roundtrip-Reprint aufs finale Tool ·
- S3 Verify-Bewährung laufend · S4 ist in Phase 4 enthalten (zeitlich korrekt) · S5 Leons eigene Restprüfung.

---

## Entscheidungspunkte für Leon (mit Default — Arbeit blockiert nicht, Defaults sind eingeplant)

| # | Frage | Default im Plan |
|---|---|---|
| E1 | Schnell-Vorschau je Seite in Station 2 behalten (zusätzlich zu Station 4)? | Ja, behalten (additiv, kein Verlust) |
| E2 | Ctrl+Z je Station getrennt (Scopes) oder EINE globale Zeitachse über alle Stationen? | Stations-Scopes (R3-konform, vorhersagbarer) |
| E3 | Seiten-Papierkorb: nur Session-Ctrl+Z oder dauerhafte Papierkorb-Ansicht? | Dauerhaft (robuster; Ansicht klein) |
| E4 | Freeze-Qualität auch im UI-Ordner-Import? | Ja: dev-only-Route `POST /api/import/freeze` (server-seitiges Playwright), damit UI = Skript-Qualität |
| E5 | Ordner-Export v1: nur aktive Einzelseite oder ganze Website (alle Unterseiten, verlinkt)? | Ganze aktive Website (passt zu M6/„alles in einem Programm") |
| E6 | Auslieferung: On-Disk-Ordner und/oder ZIP-Download? | On-Disk primär, ZIP später optional |
| E7 | Animator-Panel über heller Bühne: A solid Sand+Schatten oder B helles Glas? | Beide Varianten in D3 vorbereitet — reine Optik-Wahl |
| E8 | Ersatz-Token für das fremde Gelb („aktiv/gekoppelt"/Snap/Freischalten)? | Optionsset in D8 (Orange/Grün-500/Amber je Rolle) |

## Risiken (phasenübergreifend)

| Risiko | Gegenmaßnahme |
|---|---|
| Grafik-Undo-Regression (einziges heute funktionierendes Stück) | U1 = reiner Mechanik-Umzug, API-kompatibel; Unit-Tests VOR Umzug; Regressions-Anker-Verify |
| Puck-0.22-Interna (history, `--puck-*`) versionieren sich | Adapter kapselt; Version gepinnt; Doku via Context7 VOR Bau prüfen; Fallback ohne Bridge |
| Doppel-Mount Station 3/4 zerstört Latch/Backdrop-State | EIN Baum + previewModus-Flag, kein Remount |
| Feature-Verlust beim Umgruppieren | Gate gegen feature-inventar.md §1 nach jeder Phase |
| Playwright/freeze-dry-Fragilität | Eigen-Abgriff als Rückfallbasis; Fork statt Live-Dep; nur Skript/dev-API |
| gemma4-Urteile instabil | mechanische Validierung, Retries, deklarierter deterministischer Fallback |
| export/-Ordner landet im Repo | .gitignore-Eintrag in X2 |
| Design-Umbau stylt veraltete Struktur | Phase 6 erst NACH Phasen 1–5 (nur D0–D2 früher möglich) |

## Abdeckungs-Tabelle (JEDE ID → Phase/Schritt)

M1→F1/F4 · M2→F5 · M3→I6/I9 · M4→I1 · M5→I3/I4 · M6→I6 · M7→I5 · M8→I8 · M9→I7 · M10→B1 · M11→U0–U2 ·
M12→U4 · M13→erledigt durch Mängelsuche, Rest S5 (Leon) · M14→B2 · M15→B3 · M16→B7(+D-Styling) · M17→D7 ·
M18→I8 (Verify) · M19→D5 · M20→B7 · M21→Phase 7 · M22→F6 · M23→X4 · M24→D0–D8 · M25→X1–X5 ·
N1→I7 · N2→U7/U8 · N3→B4 · N4→U6 · N5→D1 · N6→P0.1 · N7→B5 · N8→U2 · N9→U3 · N10→U5 · N11→B6 · N12→P0.4 ·
N13→X6 · N14→X4/X5 · N15→I2 · N16→P0.3+F2 · N17→P0.2 · N18→U7 · N19→U8 · N20→F2 · N21→F3 ·
R1→Phase 2 (strukturell) · R2→Gate jeder Phase · R3→Phase 1 · R4→F7+Phase 6 · R5→Phase 6 ·
S1/S2/S5→Später · S3→laufend · S4→in I3 enthalten.
**Keine verwaiste ID** (Coverage-Audit-Waisen M10/M14/M15/N3/N6/N7/N11 → Phasen 0+3).

## Analyse-Provenienz (statt CODEX/GEMINI-Session)
- Workflow-Run: `wf_ce029c11-a2f` (5× Opus-Lens + Sonnet-Coverage; Journal im Session-Transkript).
- Lens-Berichte (Volltexte): Session-Scratchpad `scratchpad/lens-reports/agent-0..5.md`
  (0=import, 1=flow, 2=preview-export, 3=undo, 4=design, 5=coverage).
