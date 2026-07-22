# Feature-Inventar & Nichts-verlieren-Checkliste

**Zweck:** Dieses Dokument ist das harte Verifikations-Gate für den Umbau von Grafik-Editor (`/grafik-editor`) und Fluss-Editor (`/fluss-editor`) zu EINEM Werkzeug. Jeder `- [ ]`-Punkt ist eine eigenständig prüfbare Funktion, die nach dem Umbau nachweislich noch vorhanden und bedienbar sein muss. Gruppierung = heutiger Ort (Reiter/Panel). Abhaken erst, wenn die Funktion im vereinheitlichten Werkzeug real getestet wurde. Leitprinzip bleibt „Übernehmen statt Umschreiben": `curtain.config.json` / `river.config.json` / die echte Seite werden NIE vom Builder geschrieben (Ausnahme: `grafik.config.json` via „Als Standard setzen").

Datei-Pfade relativ zu `C:/Users/Lonsinator/Flowcode-Agentic-OS/user-projects/flowcode-website-builder/`.

---

## 1. Funktions-Checkliste (nach heutigem Ort)

### 1.A — GRAFIK-EDITOR: Panel-Kopf (immer sichtbar über allen Reitern)

- [ ] Titel „Grafik-Editor" (reine Beschriftung) — `components/grafik/GrafikEditor.tsx ~1987`
- [ ] ↶ Rückgängig-Knopf (undo; disabled wenn !canUndo; Titel „Rückgängig (Strg+Z)") — `GrafikEditor.tsx ~1989` → `rueckgaengigMachen ~1824` → `GrafikContext.undo ~170`
- [ ] ↷ Wiederholen-Knopf (redo; disabled wenn !canRedo) — `GrafikEditor.tsx ~1997` → `wiederholenMachen ~1829`
- [ ] „? Hilfe"-Knopf (öffnet GrafikTutorial erneut, setTutorialOffen(true)) — `GrafikEditor.tsx ~2006`
- [ ] „← Fluss"-Link (href=`/fluss-editor`) — `GrafikEditor.tsx ~2013` **[UMBAU-RELEVANT: Editor-Wechsel-Link]**
- [ ] scrollY-Live-Anzeige (Math.round, rAF-gedrosselt) — `GrafikEditor.tsx ~2017` / Effekt `~468`
- [ ] Checkbox „🧲 Einrasten beim Ziehen" (Default AN, tab-unabhängig) — `GrafikEditor.tsx ~2023` (einrastenAktiv-State `~366`)
- [ ] Tab-Leiste 8 Reiter (Bibliothek/Ebenen/Bild/Keyframes/Setups/Seite/Hintergrund/Export) — `GrafikEditor.tsx REITER ~96 / ~2033`
- [ ] Versteckter `<input>` dateiRef (accept svg/png/apng/jpg/webp/gif/avif/json/lottie/mp4/webm; auch Austausch/Ersetzen) — `GrafikEditor.tsx ~2047` / `dateiGewaehlt ~892`
- [ ] Versteckter `<input>` ordnerRef (webkitdirectory; Fallback ohne File System Access API) — `GrafikEditor.tsx ~2048` / `ordnerGewaehlt ~1015`

### 1.B — GRAFIK-EDITOR: Reiter „Bibliothek"

- [ ] HilfeIcon „Bibliothek" (Erklär-Popover) — `GrafikEditor.tsx ~2063`
- [ ] Hinweis-Banner kfBildZiel (bei Keyframe-Bildtausch: „🖼 Bild für diesen Keyframe wählen" + Abbrechen) — `GrafikEditor.tsx ~2072`
- [ ] Knopf „🔓 Ordner freischalten" (Ordner nach Neustart per Geste freigeben) — `GrafikEditor.tsx ~2078` / `ordnerFreischalten ~982`
- [ ] Anzeige „📁 verbunden: {name}" + ⟳ (Ordner neu einlesen) — `GrafikEditor.tsx ~2083` / `ordnerLesen ~949`
- [ ] Knopf „📁 Ordner" (PC-Ordner verbinden, Handle in IndexedDB) — `GrafikEditor.tsx ~2092` / `ordnerOeffnen ~967`
- [ ] Knopf „+ Datei" (Einzeldatei; nullt ersetzenRef + kfBildZiel) — `GrafikEditor.tsx ~2095`
- [ ] Knopf „Canva ↗" (öffnet canva.com neuer Tab) — `GrafikEditor.tsx ~2105`
- [ ] Such-Input poolFilter (nur wenn pool>0) — `GrafikEditor.tsx ~2113` / `poolGefiltert ~1905`
- [ ] Ungruppiertes Thumbnail-Raster poolOhneOrdner (3-spaltig) — `GrafikEditor.tsx ~2126`
- [ ] Ordner-Gruppen `<details>` poolGruppen (ab >6 Dateien eingeklappt) — `GrafikEditor.tsx ~2129`
- [ ] Pool-Eintrag Haupt-Button (kfBildZiel→srcOverride / Auswahl→ersetzeDurchAsset / sonst platziere() mittig 1 KF) — `GrafikEditor.tsx ~1929` / `platziere ~1023` / `ersetzeDurchAsset ~1369`
- [ ] Pool-Eintrag ⬡ Vektorisieren (**HOVER-ONLY**, nur bild+kein-SVG, opacity 0 bis Hover) — `GrafikEditor.tsx ~1963` / CSS `grafik-editor.css:456`
- [ ] Pool-Eintrag ✕ Entfernen (**HOVER-ONLY**, aus Bibliothek, opacity 0 bis Hover) — `GrafikEditor.tsx ~1973` / CSS `grafik-editor.css:239`
- [ ] Leer-Hinweis (wenn Pool leer) — `GrafikEditor.tsx ~2120`

### 1.C — GRAFIK-EDITOR: Reiter „Ebenen"

- [ ] HilfeIcon „Ebenen" + Hilfetext — `GrafikEditor.tsx ~2154`
- [ ] Tausch-Hinweis-Banner („⇄ {name} — jetzt zweite Ebene anklicken" + Abbrechen) — `GrafikEditor.tsx ~2165`
- [ ] gre-thumb Bild-Button (wählt Grafik aus, ctx.setAuswahl) — `GrafikEditor.tsx ~2188`
- [ ] gre-name Namensfeld (Umbenennen, Commit rename:id) — `GrafikEditor.tsx ~2195` / `umbenennen ~1339`
- [ ] gre-meta (Art-Icon + „{n} KF · z{z}") — `GrafikEditor.tsx ~2203`
- [ ] 👁/🚫 Sichtbarkeit (umschalteVersteckt) — `GrafikEditor.tsx ~2207` / `umschalteVersteckt ~1420`
- [ ] 🔒/🔓 Sperre (umschalteGesperrt: auswählbar, nicht verschiebbar) — `GrafikEditor.tsx ~2213` / `umschalteGesperrt ~1427`
- [ ] ▲ Nach vorn / ▼ Nach hinten (verschiebeZ ±1, tauscht z mit Nachbar) — `GrafikEditor.tsx ~2219` / `verschiebeZ ~1404`
- [ ] ⧉ Duplizieren (gleiche Datei, KF +40px versetzt) — `GrafikEditor.tsx ~2225` / `duplizieren ~1383`
- [ ] ⇄ Tauschen (tauschQuelle setzen / tauscheMit: Dateien tauschen, Positionen bleiben) — `GrafikEditor.tsx ~2228` / `tauscheMit ~1351`
- [ ] 📄 Datei ersetzen (ersetzenRef=id + Datei-Dialog, KF bleiben) — `GrafikEditor.tsx ~2247`
- [ ] ✕ Löschen (loeschen(id), räumt ggf. Vorhang-Übernahme mit auf) — `GrafikEditor.tsx ~2257` / `loeschen ~1271`

### 1.D — GRAFIK-EDITOR: Reiter „Bild" (GrafikInspector)

- [ ] Kopf (Thumb + Name + Art-Label Bild/Lottie-Animation/Video) — `GrafikInspector.tsx ~116`
- [ ] Grundbreite-Slider (20–1200, step 10; Commit-Gruppe breite:id; identisch zum Keyframes-Slider) — `GrafikInspector.tsx ~145` / `GrafikEditor.tsx ~2301`
- [ ] Live-Zustandsanzeige (zustandBei: x,y,scale,Deckkraft%,Drehung°) — `GrafikInspector.tsx ~154`
- [ ] ⇋ Horizontal / ⇕ Vertikal spiegeln (nur bild; umschalteSpiegelX/Y) — `GrafikInspector.tsx ~177` / `GrafikEditor.tsx ~1436`
- [ ] ✂ Zuschneiden (nur bild; öffnet GrafikCrop) — `GrafikInspector.tsx ~195`
- [ ] ⬡ In SVG umwandeln (nur bild+kein-SVG; onVektorisieren, disabled während Lauf) — `GrafikInspector.tsx ~221` / `vektorisieren ~1060`
- [ ] `<details>` ⚙ Vektor-Einstellungen — 3 Slider Farben(2–16)/Mindestfläche(4–400)/Glättung(0–1) — `GrafikInspector.tsx ~229`
- [ ] 🪄 Freistellen (nur bild+kein-SVG; @imgly, ~80MB Modell beim 1. Mal) — `GrafikInspector.tsx ~304` / `freistellen ~1172`
- [ ] Datei-Aktionen 8 Knöpfe (⇄ Tauschen, 📄 Ersetzen, ⧉ Duplizieren, ▲ vorn, ▼ hinten, 👁/🚫, 🔒/🔓, ✕ Löschen) — `GrafikInspector.tsx ~319` (Props aus `GrafikEditor.tsx ~2289`)

### 1.E — GRAFIK-EDITOR: Reiter „Keyframes"

- [ ] „◉ Hier locken (scrollY {n})" (keyframeSetzen; überschreibt in KF_SNAP_PX=40 Reichweite) — `GrafikEditor.tsx ~2352` / `keyframeSetzen ~1467`
- [ ] Abspielen-Tabs (nur Lottie/Video: Schleife=loop / Scroll=scrub / Standbild=still; scrub<2KF-Warnung) — `GrafikEditor.tsx ~2362`
- [ ] Grundbreite-Slider (20–1200; breitePx ganze Grafik; Gruppe breite:id) — `GrafikEditor.tsx ~2411`
- [ ] Deckkraft-Slider (0–1, step 0.05; patchKf opacity aktiver KF; Gruppe opacity:id:idx) — `GrafikEditor.tsx ~2436`
- [ ] Drehung-Slider (-180…180; patchKf rotation; Gruppe rotation:id:idx) — `GrafikEditor.tsx ~2455`
- [ ] Verlaufskurve EasingKurve (kubische Bezier zum NÄCHSTEN KF; Gruppe easing:id:idx) — `GrafikEditor.tsx ~2478` → `EasingKurve.tsx`
- [ ] „🖼 Bild tauschen" + „↺ Zurücksetzen" (srcOverride nur an diesem KF; bewaffnet kfBildZiel) — `GrafikEditor.tsx ~2498`
- [ ] Zeitleiste GrafikKeyframeTimeline (Marker ziehen=scrollY, klick=hinspringen) — `GrafikEditor.tsx ~2539` → `GrafikKeyframeTimeline.tsx`
- [ ] Keyframe-Liste (pro KF „KF n · y{scrollY} · {scale}× [·🖼]" springeZu; ⧉ kfDuplizieren; ✕ keyframeLoeschen, letzter bleibt) — `GrafikEditor.tsx ~2549` / `kfDuplizieren ~1500` / `keyframeLoeschen ~1482`

### 1.F — GRAFIK-EDITOR: Reiter „Setups"

- [ ] Name-Input + „Speichern" (→ /api/abbild, Fallback localStorage) — `GrafikEditor.tsx ~2588` / `speichern ~1610`
- [ ] Server-Setup-Liste Platte („{name} ({n})", laden 'platte', ✕ loescheVonPlatte mit confirm) — `GrafikEditor.tsx ~2595` / `laden ~1694`
- [ ] Browser-Setup-Liste (laden 'browser' aus localStorage, ✕ setupLoeschen mit confirm) — `GrafikEditor.tsx ~2610`
- [ ] „Als Standard setzen" (schreibt grafik.config.json = LIVE-Landing, confirm) — `GrafikEditor.tsx ~2627` / `alsStandardSetzen ~1770`
- [ ] „Export JSON (Browser-Setups)" (grafik-setups.json Download) — `GrafikEditor.tsx ~2639` / `exportieren ~1808`

### 1.G — GRAFIK-EDITOR: Reiter „Seite" (GrafikSeiteTab)

- [ ] Ebenen-`<details>` (ebene-1/2/3, je links+rechts, summary „{ebene} ({n})") — `GrafikSeiteTab.tsx ~160` / `EBENEN ~47`
- [ ] Vorhang-Platz-Button (inBuilderHolen: Baum an Bildschirmposition übernehmen, 1 KF, ID `vorhang:ebene:seite:index`, Eintrag in uebernommen) — `GrafikSeiteTab.tsx ~180` / `inBuilderHolen ~89`
- [ ] Vorhang-Platz-Button übernommen ✓ (zurueckAnVorhang: Grafik + uebernommen-Eintrag weg) — `GrafikSeiteTab.tsx ~183` / `zurueckAnVorhang ~143`
- [ ] Status-Zeile (Rückmeldung Übernahme/Rückgabe) — `GrafikSeiteTab.tsx ~205`

### 1.H — GRAFIK-EDITOR: Reiter „Export" (GrafikExportPanel, Phase 3)

- [ ] „? Anleitung" (öffnet GrafikExportAnleitung-Modal, 3 Einbau-Schritte) — `GrafikExportPanel.tsx ~178`
- [ ] Fluss-Profil `<select>` (localStorage `wee-fluss-verlaeufe` oder „kein Fluss") — `GrafikExportPanel.tsx ~189` **[KOPPLUNG zum Fluss-Editor]**
- [ ] Checkbox „Bilder einbetten (selbsttragend)" (Projekt-Bilder als Data-URLs) — `GrafikExportPanel.tsx ~205`
- [ ] „JSON exportieren" (baueEmbedConfig → wee-anim.json) — `GrafikExportPanel.tsx ~219` / `jsonExportieren ~108`
- [ ] „HTML-Overlay exportieren" (baueOverlayHtml → wee-overlay.html) — `GrafikExportPanel.tsx ~228` / `htmlExportieren ~128`
- [ ] „Runtime-Script herunterladen" (fetch /wee-embed.js) — `GrafikExportPanel.tsx ~237` / `runtimeHerunterladen ~148`

### 1.I — GRAFIK-EDITOR: Schwebendes Objektmenü (GrafikObjektMenue, an Auswahl, z70)

- [ ] Titel (Grafik-Name) — `GrafikObjektMenue.tsx ~124`
- [ ] ◉ Hier locken (=keyframeSetzen) — `GrafikObjektMenue.tsx ~127` / `GrafikEditor.tsx ~2703`
- [ ] ⧉ Duplizieren / ⇄ Tauschen / 📄 Datei ersetzen — `GrafikObjektMenue.tsx ~128`
- [ ] ▲ Nach vorn / ▼ Nach hinten / 👁 Aus-Einblenden / 🔒 Sperren — `GrafikObjektMenue.tsx ~131`
- [ ] ✕ Löschen — `GrafikObjektMenue.tsx ~135`
- [ ] Positioniert imperativ pro rAF (getBoundingClientRect, klappt am Rand um, hält letzte Position wenn Anker verschwindet) — `GrafikObjektMenue.tsx`

### 1.J — GRAFIK-EDITOR: Overlays & Indikatoren (global)

- [ ] gre-lock „🔒 eingeloggt — Scrollrad skaliert" — `GrafikEditor.tsx ~2661`
- [ ] gre-drop „Loslassen = hier ablegen" (dropAktiv) — `GrafikEditor.tsx ~2662`
- [ ] gre-status (letzte Status-/Fehlermeldung) — `GrafikEditor.tsx ~2663`
- [ ] Vektor-/Freistell-Overlay (blockierend, Spinner, Fortschritt) — `GrafikEditor.tsx ~2665`
- [ ] Rubber-Band Auswahl-Rechteck (Anzeige) — `GrafikEditor.tsx ~2709`
- [ ] Snap-Hilfslinien (senkrecht/waagerecht beim Einrasten) — `GrafikEditor.tsx ~2721`
- [ ] GrafikTutorial-Modal (6 Schritte + Tastenkürzel-Tabelle, autom. beim 1. Besuch via localStorage `wee-grafik-tutorial-gesehen`) — `GrafikEditor.tsx ~2731` / `GrafikHilfe.tsx ~206`
- [ ] HilfeIcon-Popover („?" on Hover/Klick/Fokus, angepinnt bis Klick daneben/Esc, z90) — `GrafikHilfe.tsx ~86`
- [ ] GrafikCrop-Overlay (Rechteck aufziehen, Zurücksetzen/Abbrechen/✓ Anwenden, z300) — `GrafikCrop.tsx ~168`

### 1.K — GRAFIK-EDITOR: Canvas-Interaktionen (Fenster-Pointer-Logik)

- [ ] Klick auf Grafik = auswählen (Objektmenü + Inspector erscheinen) — `GrafikEditor.tsx`
- [ ] Ziehen = verschieben in DOKUMENT-Koordinaten, bearbeitet nächstgelegenen Keyframe (naechsterKfIndex) — `GrafikEditor.tsx`
- [ ] Klick ohne Ziehen (<4px) = einloggen/ausloggen (toggle gelockt, Grafik gelb) — `GrafikEditor.tsx`
- [ ] Umschalt+Klick = Mehrfachauswahl togglen (shiftKlickToggle) — `grafik-mehrfachauswahl.ts`
- [ ] Ziehen eines Mehrfach-Mitglieds = ganze Gruppe verschieben (gruppenDragRef, gesperrte bleiben stehen) — `GrafikEditor.tsx`
- [ ] Rubber-Band auf leerem Canvas (Bounding-Box-Schnitt, Umschalt=additiv, istEditorChrome blockt über Panel) — `grafik-mehrfachauswahl.ts` / `GrafikEditor.tsx`
- [ ] Einrasten beim Ziehen (Viewport-Mitte + 20px-Raster + Kanten/Mitten anderer Grafiken, Schwelle 6px, X/Y unabhängig, Hilfslinien; Einzel+Gruppe) — `grafik-snapping.ts`
- [ ] Drag&Drop Datei auf Seite = platziert am Drop-Punkt (Viewport→Dokument) — `GrafikEditor.tsx`
- [ ] Strg+V = Bild aus Zwischenablage an Bildmitte — `GrafikEditor.tsx`
- [ ] Gesperrte Ebene anklickbar (entsperren) aber nicht verschiebbar — `GrafikEditor.tsx`
- [ ] EIN Zug = EIN Verlaufsschritt (Commit bei pointerup mit Vor-Zug-Stand grafiken+uebernommen) — `GrafikEditor.tsx`
- [ ] Mausrad im Lock skaliert nächstgelegenen KF (×1.08, geklemmt 0.05–12), blockiert Seiten-Scroll — `GrafikEditor.tsx`

---

### 1.L — FLUSS-EDITOR: Panel-Rahmen (.rke-panel, fixed oben rechts)

- [ ] Titel „Fluss-Editor" — `components/river/RiverKursEditor.tsx ~642`
- [ ] Link „Grafiken →" (href=`/grafik-editor`) — `RiverKursEditor.tsx ~643` **[UMBAU-RELEVANT: Editor-Wechsel-Link]**
- [ ] Knoten-Zähler „{n} Knoten" (nodes.length) — `RiverKursEditor.tsx ~647`
- [ ] Reiter-Leiste 6 Buttons (Fluss/Wasser/Front/Nebel/Profile/Hintergrund; interne IDs fluss/wasser/blasen/nebel/verlaeufe/hintergrund) — `RiverKursEditor.tsx REITER ~95-102 / ~651-661`
- [ ] Statuszeile (.rke-status) — `RiverKursEditor.tsx ~808`

### 1.M — FLUSS-EDITOR: Knoten-Handle-Ebene (.rke-layer, pointer-events:none)

- [ ] Knoten-Handle .rke-knoten (weißer Kreis roter Rand; left/top aus zone-Metrik; Ziehen/Klick/Wheel-Ziel) — `RiverKursEditor.tsx ~614-637`
- [ ] Eingeloggter Handle .rke-knoten--lock (gelb, scale 1.25, gelockt===i) — `RiverKursEditor.tsx ~625` / CSS `~37`
- [ ] Handle-Label „{i+1} · {breite}px" — `RiverKursEditor.tsx ~631-633`

### 1.N — FLUSS-EDITOR: Reiter „Fluss" (Knoten-Editing)

- [ ] Hilfetext (Ziehen=Position · Klick=einloggen → Scrollrad=Breite · ESC=ausloggen) — `RiverKursEditor.tsx ~665-668`
- [ ] Button „+ Knoten" (auf Bildschirmmitte, x/breite interpoliert, nach y sortiert, entsperrt) — `RiverKursEditor.tsx ~406-417 / ~670`
- [ ] Button „− Knoten" (disabled wenn kein Knoten gelockt; Minimum 2 Knoten) — `RiverKursEditor.tsx ~419-423 / ~671-673`
- [ ] Button „Gerade zurücksetzen" (alle x=600, breite=240, entsperrt) — `RiverKursEditor.tsx ~425-431 / ~676`
- [ ] Checkbox „Fluss komplett aufdecken" (setVollAufgedeckt, Default false) — `RiverKursEditor.tsx ~678-685` → `RiverFlow.tsx ~270-287`

### 1.O — FLUSS-EDITOR: Reiter „Wasser" (Wellen/Glitzer/Ufer)

- [ ] Checkbox „Glitzer an" (sparkleMode dezent/aus) — `RiverKursEditor.tsx ~692-701` → `RiverWaves.tsx`
- [ ] Regler „Wellen-Atmung" (breathPeriodS 0.5–20s, step 0.5) — `REGLER_WASSER ~66` → `RiverWaves breath.periodS`
- [ ] Regler „Glitzer-Tempo" (sparkleTrailDurS 10–300s, step 5) — `REGLER_WASSER ~67` → `trailDurS`
- [ ] Regler „Glitzer pro Spur" (sparklePerTrail 0–40, step 1) — `REGLER_WASSER ~68` → `perTrail`
- [ ] Regler „Aufblitzen" (sparkleFlashS 0.2–10s, step 0.1) — `REGLER_WASSER ~69` → `flashS/pulseKeyTimes`
- [ ] Regler „Sandufer-Breite" (bankStrokePx 0–160px, step 2) — `REGLER_WASSER ~70` → `RiverFlow bankStrokePx → riverPath sandD`
- [ ] Button „Animation zurücksetzen" (setAnim(ANIM_DEFAULTS); geteilt Wasser/Front/Nebel) — `RiverKursEditor.tsx ~800-806`

### 1.P — FLUSS-EDITOR: Reiter „Front" (id=blasen, Fließfront-Partikel)

- [ ] Hilfetext (3 Schichten Gischt/Schaum/Nachlauf, Breite fix) — `RiverKursEditor.tsx ~710-714`
- [ ] Regler „Partikel" (foamCount 10–320, step 5) — `REGLER_BLASEN ~76` → `RiverFeatures buildFrontPartikel`
- [ ] Regler „Vorpreschen" (foamLeadPx 0–140px, step 2) — `REGLER_BLASEN ~77` → `foamCfg.leadPx`
- [ ] Regler „Tempo" (foamSpeed 0.2–4×, step 0.1) — `REGLER_BLASEN ~78` → `foamCfg.speed`
- [ ] Regler „Größe" (foamSizeK 0.3–3×, step 0.1) — `REGLER_BLASEN ~79` → `foamCfg.sizeK`
- [ ] Regler „Springen" (foamJitterPx 0–40px, step 1) — `REGLER_BLASEN ~80` → `foamCfg.jitterPx`
- [ ] Button „Animation zurücksetzen" (geteilt) — `RiverKursEditor.tsx ~800-806`

### 1.Q — FLUSS-EDITOR: Reiter „Nebel" (Wolkenkante)

- [ ] Hilfetext (weiche Wolkenkante, CSS-blur statt SVG-Filter) — `RiverKursEditor.tsx ~723-726`
- [ ] Regler „Wolken" (mistCount 0–30, step 1) — `REGLER_NEBEL ~86` → `buildNebel`
- [ ] Regler „Wolkengröße" (mistSizePx 4–90px, step 2) — `REGLER_NEBEL ~87` → `nebelCfg.sizePx`
- [ ] Regler „Deckkraft" (mistOpacity 0–1, step 0.05) — `REGLER_NEBEL ~88` → `nebelCfg.opacity`
- [ ] Regler „Weichheit" (mistBlurPx 0–24px, step 1) — `REGLER_NEBEL ~89` → `rf-mist filter`
- [ ] Regler „Waber-Tempo" (mistSpeed 0.2–4×, step 0.1) — `REGLER_NEBEL ~90` → `nebelCfg.speed`
- [ ] Button „Animation zurücksetzen" (geteilt) — `RiverKursEditor.tsx ~800-806`

### 1.R — FLUSS-EDITOR: Reiter „Profile" (id=verlaeufe)

- [ ] Textfeld „Profil-Name (= Dateiname)" — `RiverKursEditor.tsx ~742-746`
- [ ] Button „Speichern" (friert nodes+anim+Geometrie centerD/bankD/sandD/kontur/waves + aufgelöste Farben + meta ein → localStorage; bricht ehrlich ab wenn liveGeometrie/liveFarben nicht bereit) — `RiverKursEditor.tsx ~433-475 / ~747`
- [ ] Profil-Liste (.rke-liste, alphabetisch) — `RiverKursEditor.tsx ~749-768`
- [ ] Lade-Button „{name} ({n} Knoten)" (laden: entsperrt, Höhen-Normalisierung skaliereKnotenY, anim mit ANIM_DEFAULTS gemergt) — `RiverKursEditor.tsx ~477-492 / ~755-761`
- [ ] Lösch-Button „✕" (verlaufLoeschen aus localStorage) — `RiverKursEditor.tsx ~494-500 / ~762-764`
- [ ] Verstecktes Datei-Input importRef (accept application/json) — `RiverKursEditor.tsx ~769-775`
- [ ] Button „Importieren" (dateiImportiert: Einzel-Snapshot ODER Verlaufs-Map, klare Fehlermeldung) — `RiverKursEditor.tsx ~550-581 / ~777-782`
- [ ] Button „Als JSON exportieren" (lädt benanntes Profil, Blob-Download {name}.json; Profil muss vorher gespeichert sein) — `RiverKursEditor.tsx ~502-523 / ~783-785`
- [ ] Button „Als SVG exportieren" (buildSnapshotSvgMarkup → {name}.svg; NUR Fluss-KÖRPER, keine Laufzeit-Partikel) — `RiverKursEditor.tsx ~588-608 / ~788-793`

### 1.S — FLUSS-EDITOR: Interaktionen (Knoten-Logik)

- [ ] Knoten ziehen (Maus→Design-Koord, x geklemmt 40–1160, y frei, exakt unter Cursor, commitPerFrame rAF) — `RiverKursEditor.tsx`
- [ ] Knoten anklicken (<4px bis pointerup = Lock toggle gelb) — `RiverKursEditor.tsx`
- [ ] Scrollrad auf gelocktem Knoten = Breite/Perspektive (×1.08, geklemmt 6–900px, Seiten-Scroll blockiert) — `RiverKursEditor.tsx ~348-370`
- [ ] Zonen-Vermessung .river-zone (scroll-invariante Dokument-Metrik topDoc/leftDoc/w/h/scale/colLeft; Design-Raum 1200px) — `RiverKursEditor.tsx`
- [ ] Reveal beim Scrollen (useScroll/useSpring, rect.setAttribute height; optional „komplett aufdecken") — `RiverFlow.tsx`

---

### 1.T — GETEILT: Reiter „Hintergrund" (BackdropAuswahl — EINE Komponente in BEIDEN Panels)

- [ ] ?-Hilfe-Icon mit Popover (BackdropHilfeIcon; Hover öffnet, Klick pinnt, Escape/Scroll/Resize/Klick-außerhalb schließt) — `BackdropAuswahl.tsx ~168` / `BackdropHilfeIcon.tsx`
- [ ] „Aktuell"-Anzeige / „Kein Hintergrund gewählt" / „Lade gemerkten Hintergrund…" — `BackdropAuswahl.tsx ~176-185`
- [ ] Button „🖼 Screenshot laden" (Bild→Data-URL, art:bild) — `BackdropAuswahl.tsx ~200-206` / `bildGewaehlt ~78`
- [ ] Button „📄 HTML laden" (Single-File→Text, art:html) — `BackdropAuswahl.tsx ~207-213` / `htmlGewaehlt ~95`
- [ ] Button „📁 Ordner öffnen" (showDirectoryPicker → Cache wee-site + SW, art:ordner; nur Chrome/Edge) — `BackdropAuswahl.tsx ~215-224` / `ordnerGewaehlt ~131`
- [ ] Button „🔓 Ordner erneut freigeben" (amber, bedingt art=ordner+ordnerWartet; requestPermission) — `BackdropAuswahl.tsx ~187-197` / `ordnerFreigeben ~148`
- [ ] Button „← Zurück zur echten Seite" (setBackdrop(null), disabled ohne Backdrop) — `BackdropAuswahl.tsx ~225-234` / `zurueck ~159`
- [ ] Status-Zeile — `BackdropAuswahl.tsx ~239`
- [ ] Verstecktes bild/html file-input (value='' nach Auswahl) — `BackdropAuswahl.tsx ~236-237`

### 1.U — GETEILT: Backdrop-Rendering (Backdrop.tsx, alle Modi pointer-events:none)

- [ ] bild-Modus (`<img>` Data-URL, intrinsische Höhe = Dokumenthöhe) — `Backdrop.tsx`
- [ ] html-Modus (`<iframe srcDoc>` same-origin, ResizeObserver-Höhensync, `<base target=_blank>`, Starthöhe 600px) — `Backdrop.tsx`
- [ ] ordner-Modus (`<iframe src=/wee-site/>` über Service Worker + Cache; key=quelle erzwingt Remount) — `Backdrop.tsx` / `public/wee-site-sw.js`

### 1.V — GETEILT: Embed-/Export-Kette (nur über Grafik-Editor-Export erreichbar)

- [ ] baueEmbedConfig (Projekt-URLs → Data-URL inkl. srcOverride, grafikenDocH, farben aus fluss) — `components/embed/embed-export.ts`
- [ ] baueOverlayHtml (Config eingebaut, escapeFuerInlineScript gegen `</script`) — `embed-export.ts`
- [ ] baueReadme — `embed-export.ts`
- [ ] EmbedRoot (Portal-Overlay unter body, injiziert :root Farb-Tokens) — `components/embed/EmbedRoot.tsx`
- [ ] embed-entry (Config-Quellen: data-config=URL / `<script data-wee-config>` / window.__WEE_ANIM__) — `components/embed/embed-entry.tsx`
- [ ] RiverFromSnapshot (voll einbettbarer Fluss; **KEIN Editor-Knopf** erreichbar, nur Embed-Build) — `components/river/RiverFromSnapshot.tsx`
- [ ] build-embed.mjs (esbuild IIFE JS+CSS → public/wee-embed.js) — `scripts/build-embed.mjs`

### 1.W — GETEILT: Vektorisierer-Bibliothek (DOM-frei, öffentlicher Vertrag)

- [ ] vektorisieren-Pipeline (quantisieren→regionen→konturen→vereinfachen→bezier→svg) — `components/vektor/vektorisieren.ts`
- [ ] Median-Cut-Quantisierung + 3x3-Mehrheitsfilter — `components/vektor/quantisieren.ts`
- [ ] Zusammenhangskomponenten BFS — `components/vektor/regionen.ts`
- [ ] Kontur je Region (Moore-Tracing, Löcher) — `components/vektor/konturen.ts` / `moore.ts`
- [ ] RDP-Vereinfachung — `components/vektor/vereinfachen.ts`
- [ ] Bezier-Anpassung (Winkel-Schwelle 40°) — `components/vektor/bezier.ts`
- [ ] SVG-Bau (1 `<g>` je Farbe, Wurzel id 'baum') — `components/vektor/svg.ts`
- [ ] Vektor-Typen (ÖFFENTLICHER VERTRAG mit Route — Feldnamen nicht ändern) — `components/vektor/typen.ts`

### 1.X — GETEILT: API-Routen (nur unter `next dev` :3113)

- [ ] POST /api/vektorisieren (Data-URL→SVG, sharp, Body 12MB, Kante 4000/1600px) — `app/api/vektorisieren/route.ts`
- [ ] POST /api/abbild (liste/lade/speichere/loesche + **standard schreibt grafik.config.json**) — `app/api/abbild/route.ts`
- [ ] POST /api/assets (liste public/ + schreibe public/vektor/) — `app/api/assets/route.ts`
- [ ] POST /api/builder/status (Discovery/Health) — `app/api/builder/status/route.ts`
- [ ] POST /api/import/grafik-setup (GrafikSetup→Puck, dry-run-by-default) — `app/api/import/grafik-setup/route.ts`
- [ ] POST /api/puck-seite/liste|lade|speichere|loesche (CRUD, 409-Konflikt) — `app/api/puck-seite/*/route.ts`
- [ ] Geteilter Unterbau (AnfrageFehler/fehlerAntwort/pruefeUrsprung CSRF/leseJsonBody/saubererName) — `lib/api/server-helfer.ts`

### 1.Y — GETEILT: Puck-Spike (isoliert, additiv — NICHT im Editor-UI, aber Verlust-relevant)

- [ ] /puck ShapeAccent + GrafikLayer editierbar, onPublish→localStorage `flowcode-puck-spike` — `app/puck/page.tsx` / `puck.config.tsx`
- [ ] /puck-import (grafikSetupToPuck(beispielSetup) → editierbare Bausteine) — `app/puck-import/page.tsx`
- [ ] Registry-Synchronpflicht PUCK_KOMPONENTEN_TYPEN — `lib/puck-registry.ts` (MUSS mit `puck.config.tsx` übereinstimmen)

---

## 2. Tastenkürzel-Tabelle (beide Editoren)

| Kürzel | Grafik-Editor | Fluss-Editor | Konflikt? |
|---|---|---|---|
| **Strg/Cmd+Z** | Rückgängig (nicht in Textfeldern; während Freistellen/Crop geblockt) | — | Fluss hat KEIN Undo → **KONZEPT-KONFLIKT**, siehe §4 |
| **Strg+Umschalt+Z** | Wiederholen (redo) | — | Fluss hat kein Redo |
| **Strg+Y** | Wiederholen (redo, Alternative) | — | Fluss hat kein Redo |
| **Entf / Backspace** | Ausgewählte Grafik(en) löschen (nur bei Auswahl, nicht in Textfeldern, 1 Verlaufsschritt) | — (Knoten löschen nur über „− Knoten"-Button) | **KOLLISION**: gleiche Taste, im Fluss ungenutzt — Verhalten muss pro Objekttyp entschieden werden |
| **Esc** | Auswahl+Mehrfachauswahl aufheben + Einloggen beenden; schließt Tutorial/Crop/Hilfe-Popover | Eingeloggten Knoten ausloggen (setGelockt(null)); schließt Backdrop-Hilfe-Popover | **GLEICHE SEMANTIK** (ausloggen/Popover) — zusammenführbar, aber Grafik macht mehr |
| **Pfeiltasten ↑↓←→** | Auswahl 1px verschieben (Nudge, 1 Commit; nur bei Auswahl) | — | Fluss nudged nicht |
| **Umschalt+Pfeil** | Auswahl 10px verschieben | — | — |
| **Strg+V** | Bild aus Zwischenablage an Bildmitte (nicht in Textfeldern) | — | Fluss hat kein Paste |
| **Mausrad (bei eingeloggtem Objekt)** | Skaliert Grafik (×1.08, 0.05–12), Seiten-Scroll blockiert | Ändert Knoten-Breite/Perspektive (×1.08, 6–900px), Seiten-Scroll blockiert | **GLEICHE GESTE, andere Wirkung** — WHEEL_FAKTOR=1.08 in beiden; im Ein-Tool muss die Wirkung vom Objekttyp abhängen |
| **Umschalt+Klick auf Objekt** | Mehrfachauswahl togglen | — (Knoten kennen keine Mehrfachauswahl) | **KONZEPT-LÜCKE**: Grafik hat Mehrfachauswahl, Fluss nicht |
| **Umschalt beim Rubber-Band-Start** | Auswahl-Rechteck additiv | — | — |

**Gemeinsame Konstanten:** KLICK_TOLERANZ_PX (Grafik=4, Fluss=4, Zeitleiste=3), WHEEL_FAKTOR=1.08 in beiden. Kein hartes Tasten-Konflikt-Risiko außer Entf und Mausrad, wo die Objektart über die Wirkung entscheiden muss.

---

## 3. Zustands-/Persistenz-Karte (wer liest/schreibt was)

### React-Contexts

| Context | Liest | Schreibt | Provider-Scope |
|---|---|---|---|
| **GrafikContext** (`GrafikContext.tsx`) | Startwert grafik.config.json (KONFIG_GRAFIKEN/-_UEBERNOMMEN/-_DOC_H) | grafiken/auswahl/auswahlMehr/gelockt/uebernommen + Undo/Redo-Stapel (Limit 50, Coalesce 600ms) | GrafikProvider (grafik-editor page + Landing) |
| **RiverKursContext** (`RiverKursContext.tsx`) | river.config.json → ANIM_DEFAULTS | nodes/live/vollAufgedeckt/anim/liveGeometrie/liveFarben; useRiverKurs()=null auf Landing | RiverKursProvider (nur fluss-editor page) |
| **BackdropContext** (`BackdropContext.tsx`) | IndexedDB beim Mount | backdrop/setBackdrop; **eigener Provider je Editor-Seite, KEIN Tab-Sync** | BackdropProvider (beide Editor-Seiten getrennt) |

### localStorage-Keys

| Key | Wer schreibt | Wer liest |
|---|---|---|
| `wee-grafik-setups` (STORAGE_KEY) | Grafik-Editor Setups (Fallback) | Grafik-Editor (pool-Wiederherstellung beim Start) |
| `wee-grafik-tutorial-gesehen` | Grafik-Editor (Tutorial geschlossen) | Grafik-Editor (Auto-Anzeige beim 1. Besuch) |
| `wee-fluss-verlaeufe` (FLUSS_STORAGE_KEY) | **Fluss-Editor** (Profile speichern/löschen/import) | **Fluss-Editor** (laden) + **Grafik-Editor Export-Reiter** (nur lesen, Fluss-Profil-Select) |
| `flowcode-puck-spike` | /puck onPublish | /puck initial |

### sessionStorage

| Key | Verhalten |
|---|---|
| `wee-title-curtain-seen` | Vorhang-Latch. **BEIDE** Editor-Seiten (grafik + fluss page.tsx) LÖSCHEN ihn beim Laden einmal pro Laufzeit (Modul-Flag latchGeloest/vorhangLatchLoesen), damit die Vorhang-Animation im Editor immer läuft. |

### IndexedDB

| DB / Store / Key | Inhalt | Nutzer |
|---|---|---|
| `wee-grafik` / keyval / K_ORDNER | FileSystemDirectoryHandle Bibliotheks-Ordner (überlebt Neustart) | Grafik-Editor Bibliothek |
| `wee-grafik` / keyval / K_SETUPS | Konstante definiert | Grafik-Editor |
| `wee-backdrop` / keyval / 'aktuell' | Aktiver Backdrop {art,quelle,name} — **editorübergreifend geteilt** | beide Editoren |
| `wee-backdrop` / keyval / 'ordnerHandle' | Gemerkter Ordner-Handle | beide Editoren (ordner-serve.ts) |

### Cache Storage / Service Worker

| Ort | Inhalt |
|---|---|
| Cache `wee-site` | Alle Dateien des Ordner-Backdrops unter /wee-site/ (MAX_DATEIEN=2000, MAX_TIEFE=12) |
| SW `public/wee-site-sw.js` (scope /wee-site/) | Beantwortet GET aus Cache |

### Dateien (Server, via API)

| Datei | GELESEN von | GESCHRIEBEN von |
|---|---|---|
| `grafik.config.json` | GrafikContext (Landing-Start) | **/api/abbild aktion=standard** (Grafik-Editor „Als Standard setzen") |
| `curtain.config.json` | TitleCurtain, GrafikSeiteTab (Reiter Seite) | **NIE vom Builder** |
| `river.config.json` | RiverFlow, RiverKursContext, TitleCurtain | **NIE vom Builder** |
| `abbilder/<name>.json` | /api/abbild lade | /api/abbild speichere/loesche (Grafik-Editor Setups; Ordner aktuell leer) |
| `seiten/<name>.json` | /api/puck-seite/lade + Import | /api/puck-seite/speichere/loesche (Ordner aktuell leer) |
| `public/vektor/*.svg` | Bibliothek | /api/assets aktion=schreibe (Vektorisierer) |
| `public/wee-embed.js` (gitignored) | Export-Reiter (fetch) | scripts/build-embed.mjs |

### Verbundener PC-Ordner (File System Access API)

- Grafik-Editor Bibliothek: gelesen UND Schreibziel (Canva/Paste/Vektorisieren erzeugte Dateien).
- Backdrop-Ordner: gelesen → Cache Storage.

---

## 4. Kollisions-/Abhängigkeitskarte für den Umbau

### 4.1 Geteilte Infrastruktur (natürliche gemeinsame Nenner — beim Merge NICHT duplizieren)

- **Backdrop-System (der zentrale gemeinsame Nenner):** EINE `BackdropAuswahl.tsx`-Komponente steckt heute in beiden Panels (`.gre-panel` UND `.rke-panel`), EINE `wee-backdrop`-IndexedDB editorübergreifend, EINE `Backdrop.tsx`-Render-Schicht, EIN Service Worker. ABER: jeder Editor hat einen **eigenen BackdropProvider** (kein Live-Tab-Sync). Im Ein-Tool wird das trivial EIN Provider — Chance zur Vereinfachung, aber: nach Backdrop-Wechsel müssen Positionen neu gesetzt werden (galten für andere Seite) — diese Warnung muss erhalten bleiben.
- **CSS-Kopplung Backdrop:** `backdrop.css` nutzt Präfix `hg-` und ist an KEIN Panel gebunden, erbt Basis-Button-Optik aus `.gre-panel`/`.rke-panel`. Beim Merge auf EIN Panel-CSS müssen die geerbten Button-Stile weiter greifen.
- **design-tokens.css:** EINZIGE Farb-/Typo-Quelle inkl. `--water-*`/`--bank-*` (Fluss fest daran gebunden), von EmbedRoot 1:1 gespiegelt. Nicht anfassen.
- **Vektorisierer + API-Routen + server-helfer:** editor-agnostisch, teilen sich CSRF-Gate. Keine Merge-Kollision.

### 4.2 Konzept-Kollisionen (zwei Systeme für dasselbe — Entscheidung nötig)

| Konzept | Grafik-Editor | Fluss-Editor | Umbau-Entscheidung |
|---|---|---|---|
| **Undo/Redo** | Voll: GrafikContext-Verlauf (Limit 50, Coalesce 600ms, Gruppen-Schlüssel, EIN Zug=EIN Commit, resetHistory bei Setup-Wechsel) | **KEINS** (Knoten-Änderungen sind nicht rückgängig machbar) | **RISIKO:** Ein vereinheitlichtes Undo müsste Knoten-Ops einbeziehen ODER die Asymmetrie bewusst bewahren. Nicht versehentlich das Grafik-Undo bei Knoten-Aktionen brechen. |
| **Export-Wege** | 3 Wege: JSON (wee-anim.json), HTML-Overlay (wee-overlay.html), Runtime (wee-embed.js) — via GrafikExportPanel; führt Grafiken + Fluss-Profil zusammen | 2 Wege: JSON (Profil {name}.json, selbsttragend), SVG (nur Körper). **KEIN Runtime/HTML-Overlay-Export.** RiverFromSnapshot/RiverSnapshotSvg nur im separaten Embed-Build. | **KOPPLUNGSPUNKT:** Export-Reiter liest heute Fluss-Profil aus localStorage `wee-fluss-verlaeufe`. Im Ein-Tool ist das ein interner Übergang statt localStorage-Brücke — der Datenfluss muss erhalten bleiben, sonst verliert das Embed den Fluss. |
| **Hilfe-Systeme** | GrafikHilfe (HilfeIcon + GrafikTutorial 6 Schritte, localStorage-Latch) + GrafikExportAnleitung-Modal | BackdropHilfeIcon (eigenständige Kopie von GrafikHilfe, an kein Panel gebunden) | **DUPLIKAT:** Zwei fast identische Hilfe-Popover-Implementierungen. Zusammenführbar, aber Tutorial-Inhalte (Grafik) sind einzigartig und dürfen nicht verloren gehen. |
| **Persistenz-Modell** | Server-first (/api/abbild), localStorage nur Fallback | localStorage-only (kein Server-Persist), Datei-Import/Export | **INKONSISTENZ:** Zwei Speicher-Philosophien. Beim Merge nicht das Fluss-localStorage-Modell versehentlich auf Server umstellen (Profile würden „verschwinden"). |
| **Selbstauswahl/Lock** | „einloggen" (gelb) → Mausrad skaliert | „einloggen" (gelb) → Mausrad = Breite | Gleiche Metapher, andere Wirkung — im Ein-Tool objekttyp-abhängig auflösen. |

### 4.3 Was hängt an den Routen `/grafik-editor` und `/fluss-editor`

- **Gegenseitige Editor-Links:** Grafik-Kopf „← Fluss" (`href=/fluss-editor`, GrafikEditor.tsx ~2013), Fluss-Kopf „Grafiken →" (`href=/grafik-editor`, RiverKursEditor.tsx ~643). Beim Zusammenlegen auf EINE Route entfallen/ändern sich beide — dürfen nicht ins Leere zeigen.
- **Seiten-Einstiege:** `app/grafik-editor/page.tsx` (GrafikProvider + BackdropProvider + HomePageContent) und `app/fluss-editor/page.tsx` (BackdropProvider → RiverKursProvider → HomePageContent). Beide lösen den Vorhang-Latch. Im Ein-Tool müssen ALLE drei Provider (Grafik, RiverKurs, Backdrop) gemeinsam gemountet sein.
- **Tutorials:** GrafikTutorial erscheint automatisch beim 1. Besuch von `/grafik-editor` (localStorage `wee-grafik-tutorial-gesehen`). Bei neuer Route ggf. neuer Latch-Key nötig, sonst zeigt sich das Tutorial nie/immer.
- **Docs:** `docs/zielbuild-und-stand.md`, `builder-plan.md`, `agent-schnittstelle.md`, `puck-erweiterungsebene.md` beschreiben Zielarchitektur (ZWEI Schichten: Animation=diese Tools / Komposition+Inhalt=Puck — **Decap ist gestrichen**, Inhalt = Puck-Baustein-Props). `openapi.yaml` ist 3-fach-Vertrag der Autoren-API. Route-Umbenennung muss dort nachgezogen werden.
- **Config-Konsum-Pfad (Landing):** `/` und `/pilot-projekt` konsumieren dieselben Configs read-only. Der Editor-Umbau darf den Landing-Render-Pfad (HomePageContent: Vorhang + 7 Sektionen; bei Backdrop nur RiverFlow+GrafikLayer) nicht beeinflussen.

### 4.4 Architektur-Invarianten (dürfen beim Umbau NICHT brechen)

- **z-index-Stack:** Grafik-Ebene 30 · Rubberband/Snap 55 · Panel 60 · Objektmenü 70 · Hilfe-Popover 90 · Vektor/Freistell 200 · Crop & Tutorial 300. Fluss: .river-svg z1, Panel .rke-panel top-right. Beim Merge kollisionsfrei neu ordnen.
- **„Knoten SIND der Fluss":** RiverNode(y,x,breite) = Mittellinie+Perspektive, Handle liegt per Konstruktion auf dem Wasser. Kein Nachmessen der Kurve.
- **Höhen-Normalisierung:** beide Editoren normalisieren y gegen authorierte Doku-Höhe (Grafik meta.docH / Fluss meta.zoneHDesign). faktor=1 = No-Op. GrafikLayer normalisiert NUR den Prop-Pfad, im Editor-Context NICHT (sonst doppelte Skalierung).
- **Grafik-Ebene pointer-events:none** (Landing klickbar), nur Editor-Items bekommen `grafik-item--editierbar`. Treffer über EINEN Fenster-Pointer-Listener + data-grafik-id.
- **Vorhang-uebernommen-Kopplung:** grafik.config.json.uebernommen listet Plätze `ebene:seite:index`, TitleCurtain überspringt genau diese Bäume. Löschen einer übernommenen Grafik räumt den uebernommen-Eintrag mit auf.

---

## 5. Risiko-Liste — die 10 größten Verlust-/Bruch-Risiken beim Umbau

1. **Zwei versteckte HOVER-ONLY-Pool-Knöpfe verschwinden unbemerkt.** ⬡ Vektorisieren (`grafik-editor.css:456`) und ✕ Entfernen (`grafik-editor.css:239`) sind opacity:0 bis Hover — beim CSS-Merge leicht komplett zu verlieren, ohne dass es im Klick-Test auffällt (war bereits Leons Kritik; „In SVG umwandeln" liegt darum zusätzlich im Reiter Bild).

2. **Fluss-Editor hat KEIN Undo — vereinheitlichtes Undo bricht oder ignoriert Knoten.** GrafikContext-Verlauf ist ausgefeilt (Coalesce, Gruppen-Schlüssel, EIN Zug=EIN Commit). Wird das globale Undo/Redo an Knoten-Ops gekoppelt, kann es die etablierte Grafik-Coalesce-Logik brechen; wird es nicht gekoppelt, wirkt Undo im Ein-Tool inkonsistent.

3. **Export verliert den Fluss.** GrafikExportPanel liest das Fluss-Profil heute über die localStorage-Brücke `wee-fluss-verlaeufe`. Wird beim Merge diese Brücke wegoptimiert, ohne den internen Übergang zu ersetzen, exportiert das Ein-Tool Grafiken ohne Fluss — stiller Daten-Verlust im Embed.

4. **`grafik.config.json`-Schreibpfad („Als Standard setzen") als EINZIGER Live-Landing-Änderer geht kaputt oder wird versehentlich generalisiert.** /api/abbild aktion=standard ist der einzige Knopf, der die echte Seite ändert (mit confirm). Bei Panel-Umbau darf weder der Schreibpfad brechen NOCH curtain/river.config versehentlich schreibbar werden.

5. **Backdrop-Provider-Merge zerreißt die editorübergreifende Persistenz.** Heute: getrennte Provider je Seite, geteilte `wee-backdrop`-IndexedDB. Falsch zusammengeführt → Ordner-Handle-Permission-Flow (queryPermission still / requestPermission mit Geste) oder Service-Worker-Cache-Wettlauf (Remount bei key=Ordnername) bricht → Ordner-Backdrop lädt 404.

6. **Vorhang-uebernommen-Aufräumung geht verloren → dauerhaft leere Baum-Plätze.** Löschen einer übernommenen Grafik (auch generisch im Reiter Ebenen) muss den `uebernommen`-Eintrag mit entfernen, sonst überspringt TitleCurtain den Baum für immer. Diese Kopplung ist nicht offensichtlich und beim Refactor der Lösch-Logik leicht zu kappen.

7. **Höhen-Normalisierungs-Doppelskalierung.** GrafikLayer normalisiert NUR den Prop-Pfad, der Editor-Context NICHT. Fluss skaliert nur y (nicht x/breite). Beim Zusammenführen der Koordinaten-Pipelines droht doppelte oder fehlende Skalierung → Grafiken/Knoten driften vom Fluss weg bei anderem Viewport/Backdrop.

8. **Mausrad- und Entf-Taste-Kollision falsch aufgelöst.** Beide Editoren belegen Mausrad-im-Lock (Grafik: Skalierung, Fluss: Breite) und Entf (Grafik: Löschen, Fluss: ungenutzt). Im Ein-Tool muss die Wirkung objekttyp-abhängig sein; eine pauschale Zuordnung zerstört eine der beiden Bedienungen.

9. **Tastatur-Schutzschichten fallen weg → Löschen/Undo auf veraltetem Stand.** Während Freistellen läuft UND während Crop offen ist werden Entf/Backspace/Strg+Z/Y in der Capture-Phase geblockt; globale Shortcuts feuern nie in INPUT/TEXTAREA/contentEditable (istEingabeFokussiert); GrafikCrop blockt Entf/Strg+Z/Y selbst. Diese Capture-Guards sind unsichtbar und beim Zusammenlegen der Keyboard-Handler leicht zu verlieren.

10. **Nicht-über-Knopf-erreichbare, aber verlust-relevante Teile werden „aufgeräumt".** RiverFromSnapshot/RiverSnapshotSvg (Embed-Build), Puck-Registry-Synchronpflicht (`lib/puck-registry.ts` ↔ `puck.config.tsx`, sonst 400/api-roundtrip-Fail), sowie **verwaiste, aber geparkte** Bausteine (`RiverLakeBlob.tsx` nirgends importiert; disabledWaypointTypes-Code Flora/Wasserfall/Cliff/Lake in RiverFeatures stillgelegt für F2/F3-Neubau). Beim „Aufräumen" nicht mit toter Funktion verwechseln — CLAUDE.md verbietet Löschen ohne Einzelbestätigung.

---

**Gate-Regel:** Der Umbau gilt erst dann als verlustfrei, wenn jeder `- [ ]`-Punkt aus §1 im vereinheitlichten Werkzeug real abgehakt, jedes Tastenkürzel aus §2 (inkl. der markierten Kollisionen) bewusst entschieden, jede Persistenz-Zeile aus §3 nachweislich noch les-/schreibbar und jedes Risiko aus §5 adressiert ist.