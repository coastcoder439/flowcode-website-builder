# Checklisten-Gate Welle 2 (Stand c0692c2)

**Prüfmethode:** Code-Nachweis (Grep/Read) für jeden Punkt + 15+ Browser-Stichproben auf http://127.0.0.1:3113/editor (Playwright-MCP). Der Ein-Editor lebt auf `/editor` (app/editor/page.tsx: drei Provider Backdrop→RiverKurs→Grafik + FlussObjekt). Alt-Routen `/grafik-editor` und `/fluss-editor` sind Client-Redirects auf `/editor`. Das frühere `.rke-Panel` (RiverKursEditor.tsx) ist NICHT mehr gemountet (nur noch in Kommentaren referenziert), bleibt aber als additive Komponente erhalten (CLAUDE.md-No-Delete); seine Funktionen laufen 1:1 über dieselbe Maschinerie (useFlussKnoten) im vereinheitlichten Editor.

---

## §1.A — GRAFIK-EDITOR: Panel-Kopf
- ✅ Titel „Grafik-Editor" — `.gre-kopf strong`, Browser bestätigt
- ✅ ↶ Rückgängig (disabled !canUndo, Titel „Rückgängig (Strg+Z)") — Browser: disabled=true bei leerem Verlauf; Titel schaltet bei Fluss-Fokus auf „Rückgängig – Fluss"
- ✅ ↷ Wiederholen — Browser bestätigt (disabled bei leerem Redo)
- ✅ „? Hilfe" (setTutorialOffen(true)) — `.gre-hilfe-knopf`, GrafikEditor.tsx ~2170; GrafikTutorial ~3114
- ✏️ „← Fluss"-Link **[UMBAU-RELEVANT]** — bewusst ENTFERNT (Welle 2a, GrafikEditor.tsx ~2177 Kommentar). Funktion (Editor-Wechsel) ist gegenstandslos, da beide Editoren auf `/editor` liegen. Browser: kein `a[href*=fluss-editor]` mehr. Kein Verlust — Ziel-Funktion existiert nicht mehr, statt ins Leere zu zeigen.
- ✅ scrollY-Live-Anzeige — `.gre-scroll`, Browser bestätigt
- ✅ Checkbox „🧲 Einrasten beim Ziehen" (Default AN) — `#gre-einrasten`, Browser bestätigt
- ✏️ Tab-Leiste 8 Reiter — weiterhin 8, interne ids stabil, aber Labels/Reihenfolge nach User-Reise geändert (Bauvorlage §2): Bibliothek/Ebenen/**Objekt**(=bild)/**Animation**(=keyframes)/Seite/Hintergrund/**Speichern**(=setups)/Export. Browser bestätigt exakt diese 8.
- ✅ Versteckter `<input>` dateiRef (accept svg/…/webm) — GrafikEditor.tsx ~2253; Browser: 2 file-inputs vorhanden
- ✅ Versteckter `<input>` ordnerRef (webkitdirectory) — GrafikEditor.tsx ~2254

## §1.B — Reiter „Bibliothek"
- ✅ HilfeIcon „Bibliothek" — Browser: „?"-Knopf im Panel
- ✅ Hinweis-Banner kfBildZiel — GrafikEditor.tsx ~2289
- ✅ Knopf „🔓 Ordner freischalten" (ordnerFreischalten) — GrafikEditor.tsx ~2296 / ~1025
- ✅ Anzeige „📁 verbunden" + ⟳ — GrafikEditor.tsx (ordnerLesen)
- ✅ Knopf „📁 Ordner" — Browser bestätigt
- ✅ Knopf „+ Datei" (nullt ersetzenRef+kfBildZiel) — Browser bestätigt
- ✅ Knopf „Canva ↗" — Browser bestätigt
- ✅ Such-Input poolFilter — GrafikEditor.tsx (poolGefiltert)
- ✅ Ungruppiertes Raster poolOhneOrdner — GrafikEditor.tsx ~2344
- ✅ Ordner-Gruppen `<details>` (ab >6 eingeklappt) — GrafikEditor.tsx ~2349
- ✅ Pool-Eintrag Haupt-Button (kfBildZiel→srcOverride / ersetzeDurchAsset / platziere) — GrafikEditor.tsx ~2087
- ✏️ Pool-Eintrag ⬡ Vektorisieren (HOVER-ONLY) — `gre-pool-vektor` vorhanden (GrafikEditor.tsx ~2120). **Risiko 1 adressiert:** CSS opacity 0→**0.4** (dauerhaft dezent sichtbar, voll bei Hover/Fokus; grafik-editor.css ~517/534). Browser: „⬡" je Pool-Item sichtbar (titelbild.jpg, tree-1-0.png).
- ✏️ Pool-Eintrag ✕ Entfernen (HOVER-ONLY) — `gre-pool-weg` (GrafikEditor.tsx ~2129). Gleiche Härtung: opacity 0→0.4 (grafik-editor.css ~293/308/312). Browser: „✕" je Pool-Item sichtbar.
- ✅ Leer-Hinweis — GrafikEditor.tsx

## §1.C — Reiter „Ebenen"
- ✅ HilfeIcon „Ebenen" — GrafikEditor.tsx ~2419
- ✅ Tausch-Hinweis-Banner — GrafikEditor.tsx ~2430
- ✅ gre-thumb Bild-Button — GrafikEditor.tsx ~2482
- ✅ gre-name Namensfeld (umbenennen) — GrafikEditor.tsx ~2489
- ✅ gre-meta (Art-Icon + KF·z) — GrafikEditor.tsx ~2497
- ✅ 👁/🚫 Sichtbarkeit — ~2501
- ✅ 🔒/🔓 Sperre — ~2507
- ✅ ▲/▼ Z-Reihenfolge — ~2513/2516
- ✅ ⧉ Duplizieren — ~2519
- ✅ ⇄ Tauschen — ~2522
- ✅ 📄 Datei ersetzen — ~2541
- ✅ ✕ Löschen (loeschen, räumt Vorhang-Übernahme mit auf) — ~2551 → loeschen ~1271 (Risiko 6-Kopplung unverändert)
- ➕ **NEU/additiv:** „🌊 Fluss"-Objekt zuoberst in der Ebenen-Liste (GrafikEditor.tsx ~2449). Browser: Eintrag „🌊 Fluss · 13 Knoten" vorhanden; Klick setzt Fluss-Fokus und leert Grafik-Auswahl (gegenseitiger Ausschluss).

## §1.D — Reiter „Bild" (jetzt Label „Objekt", GrafikInspector)
- ✅ Kopf (Thumb+Name+Art-Label) — GrafikInspector.tsx (Datei unverändert, gemountet ~2585)
- ✅ Grundbreite-Slider — GrafikInspector.tsx / GrafikEditor.tsx
- ✅ Live-Zustandsanzeige (zustandBei) — GrafikInspector.tsx
- ✅ ⇋/⇕ Spiegeln — GrafikInspector.tsx
- ✅ ✂ Zuschneiden (GrafikCrop) — GrafikInspector.tsx; GrafikCrop.tsx vorhanden
- ✅ ⬡ In SVG umwandeln (onVektorisieren) — GrafikEditor.tsx ~2620
- ✅ `<details>` ⚙ Vektor-Einstellungen (3 Slider) — GrafikInspector.tsx
- ✅ 🪄 Freistellen (@imgly) — GrafikInspector.tsx; freistellenLaeuft ~340
- ✅ Datei-Aktionen 8 Knöpfe — GrafikInspector.tsx (Props aus GrafikEditor.tsx ~2618ff)
- ➕ **Kontextuell:** bei Fluss-Fokus zeigt der Objekt-Reiter FlussObjektBild statt Inspector (GrafikEditor.tsx ~2568). Browser bestätigt: `.gre-fluss-objekt` mit 4 Sektionen.

## §1.E — Reiter „Keyframes" (jetzt Label „Animation")
- ✅ „◉ Hier locken" (keyframeSetzen) — GrafikEditor.tsx ~2635ff
- ✅ Abspielen-Tabs (loop/scrub/still, scrub<2KF-Warnung) — GrafikEditor.tsx
- ✅ Grundbreite-Slider — GrafikEditor.tsx
- ✅ Deckkraft-Slider — GrafikEditor.tsx
- ✅ Drehung-Slider — GrafikEditor.tsx
- ✅ Verlaufskurve EasingKurve — GrafikEditor.tsx → EasingKurve.tsx vorhanden
- ✅ „🖼 Bild tauschen" + „↺ Zurücksetzen" (srcOverride, kfBildZiel) — GrafikEditor.tsx ~2802
- ✅ Zeitleiste GrafikKeyframeTimeline — GrafikKeyframeTimeline.tsx vorhanden
- ✅ Keyframe-Liste (springeZu/kfDuplizieren/keyframeLoeschen) — GrafikEditor.tsx

## §1.F — Reiter „Setups" (jetzt Label „Speichern", Block „Grafik-Setups (Server)")
- ✅ Name-Input + „Speichern" (/api/abbild, Fallback localStorage) — GrafikEditor.tsx ~2921. Browser: Block „Grafik-Setups (Server)" vorhanden
- ✅ Server-Setup-Liste Platte (laden 'platte', ✕ loescheVonPlatte) — ~2928
- ✅ Browser-Setup-Liste (laden 'browser', ✕ setupLoeschen) — ~2943
- ✅ „Als Standard setzen" (schreibt grafik.config.json, confirm) — ~2960. Browser bestätigt. **Risiko 4:** einziger Live-Landing-Schreibpfad, intakt und isoliert (curtain/river.config nie schreibbar).
- ✅ „Export JSON (Browser-Setups)" — ~2972

## §1.G — Reiter „Seite" (GrafikSeiteTab)
- ✅ Ebenen-`<details>` (ebene-1/2/3) — SeiteTab gemountet GrafikEditor.tsx ~3018; GrafikSeiteTab.tsx vorhanden. Browser: 3 `<details>` im Panel
- ✅ Vorhang-Platz-Button inBuilderHolen (übernommen-Eintrag) — GrafikSeiteTab.tsx
- ✅ Vorhang-Platz-Button übernommen ✓ zurueckAnVorhang — GrafikSeiteTab.tsx
- ✅ Status-Zeile — GrafikSeiteTab.tsx

## §1.H — Reiter „Export" (GrafikExportPanel)
- ✅ „? Anleitung" (GrafikExportAnleitung-Modal) — Browser: „? Anleitung"-Knopf
- ✅ Fluss-Profil `<select>` **[KOPPLUNG]** — Browser: select mit Optionen „Aktueller Fluss (Editor)" + „kein Fluss". **Risiko 3 adressiert:** `flussVerlaufGeber` reicht den Fluss DIREKT aus dem Context (GrafikEditor.tsx ~3032, GrafikExportPanel.tsx ~128 AKTUELLER_FLUSS), localStorage-Brücke bleibt als Fallback.
- ✅ Checkbox „Bilder einbetten (selbsttragend)" — Browser bestätigt Label
- ✅ „JSON exportieren" (wee-anim.json) — Browser bestätigt
- ✅ „HTML-Overlay exportieren" — Browser bestätigt
- ✅ „Runtime-Script herunterladen" (fetch /wee-embed.js) — Browser bestätigt

## §1.I — Schwebendes Objektmenü (GrafikObjektMenue)
- ✅ Alle Punkte (Titel/◉ locken/⧉/⇄/📄/▲/▼/👁/🔒/✕ + imperative rAF-Positionierung) — GrafikObjektMenue.tsx unverändert, gemountet GrafikEditor.tsx ~3070 (nur bei ausgewählter Grafik; aktuell 0 Grafiken in Config → kein Live-Test, Rendersite verifiziert)

## §1.J — Overlays & Indikatoren
- ✅ gre-lock „🔒 eingeloggt" — GrafikEditor.tsx ~3044
- ✅ gre-drop — ~3045
- ✅ gre-status — ~3046
- ✅ Vektor-/Freistell-Overlay (Spinner) — ~3048
- ✅ Rubber-Band Auswahl-Rechteck — ~3092
- ✅ Snap-Hilfslinien — ~3104
- ✅ GrafikTutorial-Modal (6 Schritte, localStorage-Latch) — ~3114; GrafikHilfe.tsx vorhanden
- ✅ HilfeIcon-Popover — shared/HilfeIcon.tsx + GrafikHilfe.tsx
- ✅ GrafikCrop-Overlay — GrafikCrop.tsx vorhanden

## §1.K — Canvas-Interaktionen
- ✅ Klick=auswählen / Ziehen=verschieben (naechsterKfIndex) / Klick<4px=ein-/ausloggen — GrafikEditor.tsx (Fenster-Pointer-Logik unverändert)
- ✅ Umschalt+Klick Mehrfachauswahl (shiftKlickToggle) — grafik-mehrfachauswahl.ts vorhanden
- ✅ Gruppen-Drag / Rubber-Band (istEditorChrome) — grafik-mehrfachauswahl.ts / GrafikEditor.tsx
- ✅ Einrasten (grafik-snapping.ts) — vorhanden
- ✅ Drag&Drop Datei / Strg+V Paste — GrafikEditor.tsx ~1354 (onPaste)
- ✅ Gesperrte Ebene anklickbar aber nicht verschiebbar — GrafikEditor.tsx
- ✅ EIN Zug = EIN Verlaufsschritt — GrafikEditor.tsx (Commit bei pointerup)
- ✅ Mausrad im Lock skaliert nächsten KF — GrafikEditor.tsx

---

## §1.L — FLUSS-EDITOR: Panel-Rahmen → VERSCHOBEN ins Grafik-Panel
- ➡️ Titel „Fluss-Editor" → „🌊 Fluss"-Objekt (Ebenen-Eintrag + Objekt-Reiter-Kopf FlussObjektBild.tsx ~57)
- ➡️ Link „Grafiken →" **[UMBAU-RELEVANT]** — entfällt bewusst (RiverKursEditor.tsx ~56 Kommentar), da beide Editoren auf `/editor`. Kein Verlust (Ziel-Route ist Redirect auf sich selbst).
- ➡️ Knoten-Zähler „{n} Knoten" — im Ebenen-Eintrag (GrafikEditor.tsx ~2464) + Objekt-Reiter-Kopf. Browser: „13 Knoten"
- ➡️ Reiter-Leiste 6 Buttons → 4 Eigenschafts-Sektionen (Fluss/Wasser/Front/Nebel) als `<details>` im Objekt-Reiter + Profile im Speichern-Reiter + Hintergrund ist Grafik-Panel-Reiter. Browser: Sektionen [„Fluss (Knoten)",„Wasser",„Front",„Nebel"]
- ➡️ Statuszeile → `s.status` in FlussObjektBild.tsx ~132

## §1.M — Knoten-Handle-Ebene → VERSCHOBEN nach FlussKnotenHandles.tsx
- ➡️ Knoten-Handle .rke-knoten — FlussKnotenHandles.tsx ~26, gerendert via FlussHandlesEbene (nur bei Fluss-Fokus). Browser: `.rke-layer` + **13 .rke-knoten** bei Fokus
- ➡️ Eingeloggter Handle .rke-knoten--lock — FlussKnotenHandles.tsx ~36
- ➡️ Handle-Label „{i+1} · {breite}px" — FlussKnotenHandles.tsx ~42

## §1.N — Reiter „Fluss" → sektionen/FlussSektion.tsx
- ➡️ Hilfetext — FlussSektion.tsx ~30
- ➡️ „+ Knoten" (interpoliert, sortiert) — knotenHinzufuegen useFlussKnoten.ts ~394
- ➡️ „− Knoten" (disabled ohne Lock, Min 2) — knotenLoeschen ~411; FlussSektion Button disabled={gelockt===null}
- ➡️ „Gerade zurücksetzen" (x=600, breite=240) — geradeZuruecksetzen ~418. Browser: Klick erzeugt Verlaufsschritt (Undo aktiv)
- ➡️ Checkbox „Fluss komplett aufdecken" — FlussSektion.tsx ~43 (ctx.vollAufgedeckt)

## §1.O — Reiter „Wasser" → sektionen/WasserSektion.tsx
- ➡️ Checkbox „Glitzer an" (sparkleMode) — WasserSektion.tsx ~36
- ➡️ 5 Regler Wellen-Atmung/Glitzer-Tempo/Glitzer pro Spur/Aufblitzen/Sandufer-Breite — REGLER_WASSER ~19. Browser: alle 5 gezählt
- ➡️ „Animation zurücksetzen" (ANIM_DEFAULTS) — WasserSektion.tsx ~48 (je Sektion eigener Knopf, Wirkung identisch)

## §1.P — Reiter „Front" (id=blasen) → sektionen/FrontSektion.tsx
- ➡️ Hilfetext (3 Schichten) — FrontSektion.tsx ~32
- ➡️ 5 Regler Partikel/Vorpreschen/Tempo/Größe/Springen — REGLER_BLASEN ~16. Browser: alle 5 gezählt
- ➡️ „Animation zurücksetzen" — FrontSektion.tsx ~40

## §1.Q — Reiter „Nebel" → sektionen/NebelSektion.tsx
- ➡️ Hilfetext (CSS-blur) — NebelSektion.tsx ~32
- ➡️ 5 Regler Wolken/Wolkengröße/Deckkraft/Weichheit/Waber-Tempo — REGLER_NEBEL ~16. Browser: alle 5 gezählt (gesamt 15 Anim-Regler)
- ➡️ „Animation zurücksetzen" — NebelSektion.tsx ~39

## §1.R — Reiter „Profile" (id=verlaeufe) → sektionen/ProfileSektion.tsx, im Reiter „Speichern"
- ➡️ Textfeld „Profil-Name" — ProfileSektion.tsx ~47. Browser: input placeholder „Profil-Name" im Speichern-Block
- ➡️ „Speichern" (friert nodes+anim+Geometrie+Farben+meta ein; bricht ehrlich ab wenn Geometrie/Farben nicht bereit) — useFlussKnoten.ts speichern ~465 / baueAktuellenVerlauf ~431
- ➡️ Profil-Liste (alphabetisch) — ProfileSektion.tsx ~54
- ➡️ Lade-Button (skaliereKnotenY-Normalisierung, ANIM_DEFAULTS-Merge, undo-barer Commit) — laden ~480
- ➡️ Lösch-Button „✕" — verlaufLoeschen ~502
- ➡️ Datei-Input importRef — ProfileSektion.tsx ~74
- ➡️ „Importieren" (Einzel-Snapshot ODER Map, klare Fehlermeldung, resetHistory) — dateiImportiert ~558
- ➡️ „Als JSON exportieren" (Profil muss gespeichert sein) — exportieren ~510. Browser bestätigt
- ➡️ „Als SVG exportieren" (nur Körper) — alsSvgExportieren ~599. Browser bestätigt

## §1.S — Fluss-Interaktionen → useFlussKnoten.ts (verhaltensgleich herausgelöst)
- ➡️ Knoten ziehen (x 40–1160, commitPerFrame rAF) — onPointerMove ~357
- ➡️ Knoten anklicken (<4px = Lock toggle) — onPointerUp ~377
- ➡️ Scrollrad = Breite (×1.08, 6–900px, Scroll blockiert) — Wheel-Effekt ~313
- ➡️ Zonen-Vermessung .river-zone (scroll-invariant, +MutationObserver-Remount-Fix) — messeZone ~75 / Effekt ~239
- ➡️ Reveal beim Scrollen — RiverFlow.tsx unverändert

---

## §1.T — GETEILT: Reiter „Hintergrund" (BackdropAuswahl)
- ✅ Alle Punkte (?-Hilfe/Aktuell-Anzeige/🖼 Screenshot/📄 HTML/📁 Ordner/🔓 erneut freigeben/← Zurück/Status/verstecktes Input) — BackdropAuswahl.tsx unverändert; gemountet als Grafik-Panel-Reiter (GrafikEditor.tsx ~3022) UND (additiv) im alten RiverKursEditor ~108. BackdropHilfeIcon.tsx vorhanden.

## §1.U — GETEILT: Backdrop-Rendering (Backdrop.tsx)
- ✅ bild/html/ordner-Modus — Backdrop.tsx + public/wee-site-sw.js unverändert. **Risiko 5 adressiert:** EIN BackdropProvider auf /editor (app/editor/page.tsx ~102), geteilte wee-backdrop-IndexedDB, Handle-Permission-Flow unangetastet.

## §1.V — GETEILT: Embed-/Export-Kette
- ✅ baueEmbedConfig / baueOverlayHtml / baueReadme — components/embed/embed-export.ts vorhanden
- ✅ EmbedRoot / embed-entry — vorhanden
- ✅ RiverFromSnapshot — components/river/RiverFromSnapshot.tsx vorhanden (**Risiko 10:** nicht „aufgeräumt")
- ✅ build-embed.mjs — scripts/build-embed.mjs vorhanden

## §1.W — GETEILT: Vektorisierer-Bibliothek
- ✅ vektorisieren/quantisieren/regionen/konturen(+moore)/vereinfachen/bezier/svg/typen — alle components/vektor/*.ts vorhanden, unverändert (öffentlicher Vertrag intakt)

## §1.X — GETEILT: API-Routen
- ✅ /api/vektorisieren, /api/abbild (standard→grafik.config.json), /api/assets, /api/builder/status, /api/import/grafik-setup, /api/puck-seite/{lade,liste,speichere,loesche}, lib/api/server-helfer.ts — alle route.ts vorhanden (9 Routen bestätigt)

## §1.Y — GETEILT: Puck-Spike
- ✅ /puck (page.tsx + app/puck/puck.config.tsx) — vorhanden
- ✅ /puck-import (page.tsx + beispiel-setup.ts) — vorhanden
- ✅ lib/puck-registry.ts (Synchronpflicht) — vorhanden (**Risiko 10:** nicht „aufgeräumt")

---

## §2 — Tastenkürzel
- ✅ **Strg/Cmd+Z** Rückgängig — GrafikEditor.tsx ~1982; **Konflikt gelöst:** dispatcht bei Fluss-Fokus auf Fluss-Verlauf (rueckgaengigMachen ~1950). Browser: „Gerade zurücksetzen" → Undo aktiv → nach Undo Redo aktiv. Fluss hat jetzt Undo (Welle 2c) — der §4-Konzeptkonflikt bewusst durch getrennten Fluss-Stapel (useFlussVerlauf) aufgelöst.
- ✅ **Strg+Umschalt+Z / Strg+Y** Wiederholen — ~1984/1988 (auch Fluss)
- ✅ **Entf/Backspace** — Grafik löscht Auswahl (~1993, nur bei ctx.auswahl, 1 Verlaufsschritt via loescheMehrere); **Kollision gelöst (Risiko 8):** bei Fluss-Fokus löscht Entf den eingeloggten Knoten (FlussObjektContext.tsx ~84, Min 2, respektiert Textfeld). Objekttyp-abhängig.
- ✅ **Esc** — Grafik: Auswahl+Lock aufheben (~2017); Fluss: eingeloggten Knoten ausloggen (useFlussKnoten.ts ~331). Gleiche Semantik, beide erhalten.
- ✅ **Pfeiltasten** Nudge 1px / **Umschalt+Pfeil** 10px — GrafikEditor.tsx ~2006 (nur bei Auswahl)
- ✅ **Strg+V** Bild aus Zwischenablage — GrafikEditor.tsx ~1354 (onPaste, istEingabeFokussiert-Guard)
- ✅ **Mausrad im Lock** — Grafik skaliert / Fluss Breite; **Kollision gelöst (Risiko 8):** FlussObjektContext loggt Knoten aus, sobald Fluss-Fokus verloren (~73), so wirkt das Rad nur auf den fokussierten Objekttyp. WHEEL_FAKTOR=1.08 in beiden.
- ✅ **Umschalt+Klick** Mehrfachauswahl — grafik-mehrfachauswahl.ts (Fluss kennt keine, unverändert)
- ✅ **Capture-Guards (Risiko 9):** Freistellen blockt Entf/Strg+Z/Y in Capture-Phase (GrafikEditor.tsx ~1344 capture:true); GrafikCrop.tsx blockt selbst; istEingabeFokussiert (~154) verhindert Feuern in INPUT/TEXTAREA/contentEditable — alle drei Schichten intakt.

## §3 — Zustands-/Persistenz-Karte
- ✅ **GrafikContext** — GrafikContext.tsx unverändert (liest grafik.config.json, Undo/Redo Limit 50/Coalesce 600ms). Auf /editor gemountet.
- ✅ **RiverKursContext** — RiverKursContext.tsx unverändert (river.config.json→ANIM_DEFAULTS). Jetzt auf /editor gemountet (3 Provider gemeinsam, app/editor/page.tsx ~83).
- ✏️ **BackdropContext** — EIN Provider auf /editor statt zwei getrennter (bewusste §4.1-Vereinfachung). Geteilte wee-backdrop-IndexedDB, kein Verlust.
- ✅ **localStorage** wee-grafik-setups / wee-grafik-tutorial-gesehen / wee-fluss-verlaeufe (schreibt useFlussKnoten, liest Fluss-Profile + Export-Fallback) / flowcode-puck-spike — alle Schreib-/Lese-Pfade intakt
- ✅ **sessionStorage** wee-title-curtain-seen — Latch-Lösung in app/editor/page.tsx ~49 (vorhangLatchLoesen, Modul-Flag, einmal pro Laufzeit)
- ✅ **IndexedDB** wee-grafik (K_ORDNER/K_SETUPS) + wee-backdrop (aktuell/ordnerHandle) — unverändert
- ✅ **Cache/SW** wee-site + public/wee-site-sw.js — unverändert
- ✅ **Dateien/API** grafik.config.json (schreibt nur /api/abbild standard) / curtain.config.json + river.config.json NIE vom Builder / abbilder/ / seiten/ / public/vektor/ / public/wee-embed.js — alle Pfade intakt (**Risiko 4** gewahrt)

---

## Zusammenfassung

**Kein VERLOREN-Punkt.** Jede Funktion aus §1.A–1.Y, §2 und §3 ist nachweisbar vorhanden — entweder ✅ am alten Ort (Grafik-Interna + geteilte Subsysteme, unveränderte Dateien), ➡️ verschoben (das komplette Fluss-Editor-Panel §1.L–1.S ist zum „Fluss"-Objekt im Grafik-Panel geworden: Ebenen-Eintrag + kontextueller Objekt-Reiter + Handle-Ebene + Profile im Speichern-Reiter; Maschinerie 1:1 in useFlussKnoten.ts herausgelöst), oder ✏️ verändert im Rahmen der Bauvorlage (Reiter-Labels/Reihenfolge, Kreuz-Links entfallen da Ein-Route, Hover-Buttons von opacity 0→0.4 gehärtet = Risiko 1, Fluss-Undo neu = Welle 2c). Alle 10 Risiken aus §5 sind adressiert (Nachweis in den jeweiligen Punkten). Das alte RiverKursEditor.tsx-Panel bleibt additiv erhalten (CLAUDE.md-No-Delete), ist aber nicht mehr gemountet — beide Alt-Routen sind Client-Redirects auf /editor.

**GATE: BESTANDEN (verlustfrei).**

## Browser-Stichproben (Playwright-MCP, /editor)
1. Panel-Grundgerüst: `.gre-panel` + Titel „Grafik-Editor" + Undo/Redo (disabled bei leerem Verlauf) + „? Hilfe" + scrollY + 🧲 Einrasten — alle vorhanden
2. Kein `a[href*=fluss-editor]` mehr (Kreuz-Link entfernt)
3. 8 Reiter exakt: Bibliothek/Ebenen/Objekt/Animation/Seite/Hintergrund/Speichern/Export
4. `.rke-panel` (altes Fluss-Panel) NICHT im DOM (unmounted)
5. 2 versteckte file-inputs (dateiRef + ordnerRef)
6. Ebenen-Reiter: „🌊 Fluss · 13 Knoten"-Objekt zuoberst
7. Fluss-Fokus setzen → `.rke-layer` mit **13 .rke-knoten** auf der Bühne
8. Objekt-Reiter bei Fluss-Fokus → `.gre-fluss-objekt` mit Sektionen Fluss/Wasser/Front/Nebel
9. Undo-Titel schaltet auf „Rückgängig – Fluss (Strg+Z)" bei Fluss-Fokus
10. 15 Anim-Regler gezählt (5 Wasser + 5 Front + 5 Nebel) mit korrekten Labels
11. Speichern-Reiter: zwei Blöcke „Grafik-Setups (Server)" + „Fluss-Profile (lokal)"
12. „Als Standard setzen" vorhanden (Risiko 4)
13. Fluss-Profile: Name-Input + „Als JSON exportieren" + „Als SVG exportieren"
14. Export-Reiter: Fluss-`<select>` mit „Aktueller Fluss (Editor)" (Risiko 3) + JSON/HTML-Overlay/Runtime-Knöpfe + „? Anleitung"
15. Export „Bilder einbetten (selbsttragend)"-Checkbox vorhanden
16. Seite-Reiter: 3 `<details>` (Ebenen 1/2/3) via SeiteTab
17. Bibliothek: 📁 Ordner + „+ Datei" + „Canva ↗" + Pool-Items je mit ⬡ (Vektorisieren) und ✕ (Entfernen) — Hover-Buttons sichtbar (Risiko 1)
18. **Funktionaler Undo-Zyklus (Fluss):** „Gerade zurücksetzen" → Undo aktiviert → Klick Undo → Redo aktiviert (Welle-2c-Fluss-Verlauf arbeitet end-to-end)