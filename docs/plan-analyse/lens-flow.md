I have all the evidence I need. Here is my analysis.

---

# LENS: App-Struktur & Vier-Stationen-Flow (Fundament)

## 1 · Ist-Befund (selbst verifiziert, file:line)

### Die Navigation ist ein 2-Reiter-Umschalter, kein Vier-Stationen-Flow
- `app/editor/page.tsx:170` — `type Bereich = "animator" | "seiten"`. Es gibt genau **zwei** Bereiche, nicht vier Stationen.
- `app/editor/page.tsx:221` — `useState<Bereich>("animator")`: Start-Default ist der **Animator**.
- `app/editor/page.tsx:172-175` — `leseBereich()` gibt für `?bereich=seiten` → `"seiten"`, **sonst immer `"animator"`** (auch der Server-Default `window===undefined` → `"animator"`).
- `app/editor/page.tsx:177-218` — `BereichsUmschalter` rendert die beiden `role="tab"`-Buttons in der Reihenfolge **„Animator" (zuerst), „Seiten"**. Das ist die exakte Umkehrung des Soll-Flows und bildet Import/Preview gar nicht als Navigationsstationen ab. → **M1 bestätigt.**
- Der Umschalter liegt bei `z-index:1000` (belegt durch Kommentar `SeitenVorschau.tsx:11-15`), die Seiten-Fläche `.editor-seiten-flaeche` bei `z-index:40`.

### Import und Preview sind KEINE Stationen, sondern Unterzustände von „Seiten"
- Der Import ist ein `useState`-Flag **innerhalb** von SeitenBereich: `SeitenBereich.tsx:160` `const [importOffen, setImportOffen]`, gerendert bei `SeitenBereich.tsx:442-459`. Er ist nur erreichbar, wenn man vorher auf Reiter „Seiten" steht und dort „Website importieren" klickt (`:466-473`). Import ist also **hinter zwei Klicks vergraben**, obwohl er Station 1 sein soll.
- Die Vorschau ist ebenfalls ein Unterzustand von „Seiten": Query-Param `?vorschau=<name>`, gelesen in `SeitenBereich.tsx:170-180`, hat Vorrang vor allem (`:351-353` `if (vorschau) return <SeitenVorschau…>`). Sie ist nur erreichbar über den „Vorschau"-Knopf je Seiten-Listeneintrag (`:551`).

### Startansicht = Animator, dort feuert auch das Produkt-Tutorial (M2)
- `app/editor/page.tsx:264-273` — der Animator-Zweig mountet `<BackdropProvider><EditorInner/>`. `EditorInner` (`:138-153`) mountet `<GrafikEditor/>` (`:146`).
- `GrafikEditor.tsx:3654` — `<ProduktTutorial …/>` ist **im GrafikEditor-Panel** gemountet, mit Auto-Ketten-Ref `GrafikEditor.tsx:421` `produktAutoKetteRef`. Da GrafikEditor nur im Animator-Zweig existiert, kann das Onboarding **strukturell nur auf dem Animator** erscheinen — nicht am Anfang des Ablaufs (Station 1). → **M2 bestätigt.** (Die 5-Schritt-Tour in `ProduktTutorial.tsx:63-137` beschreibt bereits den korrekten Flow Import→Puck→Aktiv→Animator→Export — der Inhalt stimmt, nur der Trigger-Ort ist falsch.)

### Kein Ein-/Ausblenden des Animator-Panels (M22)
- `GrafikEditor.tsx:2564-2607` — der Panel-Kopf (`.gre-panel` → `.gre-kopf`) enthält Titel, Undo/Redo (`:2574-2595`), HilfeMenue (`:2599`), Einrasten-Checkbox (`:2614`), Tab-Leiste (`:2634`). **Es gibt keinen Toggle-Button**, der `.gre-panel` versteckt. Das Panel ist immer gemountet und liegt permanent über der Bühne. → **M22 bestätigt.**

### Station 4 (Live-Preview + Export) existiert nicht als eigene Station
- `SeitenVorschau.tsx` ist die einzige „fertige-Seite"-Ansicht. Sie ist: ein `createPortal` auf `document.body` (`:145`), zeigt `<Render config data/>` (`:140`), hat als einzige Chrome einen **„← Zurück"-Knopf** (`:112-120`) — **keinerlei Export**. → **N14 bestätigt.**
- Sie rendert über `@puckeditor/core` `Render` mit gescopten Styles (`:125`) — das ist **nicht** dieselbe Render-Grundlage wie die Animator-Bühne (die läuft über `HomePageContent` + `Backdrop` + `GrafikLayer`/`RiverFlow`). Der Soll-Zustand M23 verlangt ausdrücklich „**Preview-Modus auf derselben Render-Grundlage wie die Animator-Bühne**" mit abgeschaltetem Animator inkl. Klick-Abfangung + ein-/ausklappbarem Export-Fenster. Der heutige Aufbau ist eine zweite, getrennte Render-Welt. → **M23 offen/bestätigt.**
- Der Export lebt heute komplett getrennt im Animator: Reiter „Export" (`GrafikEditor.tsx` REITER `"export"`, `:118`), also nur über den Animator erreichbar. Es gibt keinen Weg Vorschau↔Export.

### Browser-History-Integration ist asymmetrisch (N20)
- `SeitenBereich.tsx:219-237` — `oeffne()` lädt die Seite und mountet Puck (`setOffeneSeite` + `setPuckKey`), **ohne `pushState`**. Puck-Öffnen legt keinen History-Eintrag an.
- Gegenbeleg: `SeitenBereich.tsx:182-188` — `oeffneVorschau()` macht sehr wohl `window.history.pushState(...)`. Und `app/editor/page.tsx:237-241` — `wechsle()` pusht ebenfalls.
- Folge: Bei offenem Puck-Editor → „Zurück" → `popstate` (`page.tsx:230-234`) setzt `bereich` zurück, der offene Editor wird ohne „Wirklich verlassen?"-Rückfrage weggeworfen. **Es gibt keinen Dirty-State-Guard** (kein `beforeunload`, kein Vergleich `aktuelleDatenRef` vs. `offeneSeite.data`). → **N20 bestätigt (per Code).**
- `schliesse()` (`:294-300`) macht ebenfalls kein History-Cleanup — es setzt nur State zurück.

### Deep-Link `?vorschau=` ohne `?bereich=seiten` landet auf dem Animator (N21)
- `page.tsx:172-175` liest NUR `?bereich`; ohne `bereich=seiten` → `"animator"`. Der `?vorschau`-Param wird in `SeitenBereich.tsx:170-180` gelesen — aber SeitenBereich ist bei `bereich=animator` gar nicht gemountet (`page.tsx:251`). Ein Link `?vorschau=X` allein zeigt also den Animator. → **N21 bestätigt (per Code).**

### Statischer Fremd-Titel auf allen Routen (N16)
- `app/layout.tsx:20-24` — `metadata.title = "WEE Titelkarte – Prototyp v1"`, `description` = alter Vorhang-Prototyp. Statisch im Root-Layout, keine per-Route/per-Station-Titel. → **N16 bestätigt.**

### R4-Menü-Inventar heute (verstreut über beide Welten)
- Animator-Welt (`.gre-panel`): 8 Reiter (`GrafikEditor.tsx:110-118`: bibliothek/ebenen/bild/keyframes/setups/seite/hintergrund/export) + Kopf (Undo/Redo, HilfeMenue, Einrasten, scrollY). Der Export-Reiter (Station-4-Material) und der Hintergrund-Reiter (Backdrop = „welche Seite ist die Bühne") sitzen mitten im Animator-Panel.
- Seiten-Welt (SeitenBereich): Verwaltung (Neu/Import/Hilfe + Liste mit Vorschau/Öffnen/Aktiv-setzen/Löschen), Puck-Editor-Kopf, Import-Assistent, Vorschau. Import (Station 1) und Vorschau (Station 4) hängen hier als Unterzustände.

---

## 2 · Ziel-Architektur (Station-Shell)

**Kernentscheidung: EINE Station-Shell ersetzt den 2-Reiter-`Bereich`-Umschalter durch eine 4-Stationen-Leiste.** Der `Bereich`-Typ wird von `"animator"|"seiten"` auf einen `Station`-Typ mit vier Werten erweitert; die bestehenden Mount-Bäume werden den Stationen zugeordnet, ohne sie inhaltlich umzubauen (additiv, R4/feature-inventar-konform).

```
type Station = "import" | "bauen" | "animator" | "preview";
// URL-Wahrheit: ?station=import|bauen|animator|preview  (Default: import)
// Reihenfolge in der Nav = Flow-Reihenfolge (R3)
```

### Was pro Station mountet

| # | Station | Nav-Label | Mount (wiederverwendet) | Herkunft heute |
|---|---------|-----------|--------------------------|----------------|
| 1 | **Import** | „1 · Importieren" | `SeitenImport` als Voll-Bereich (statt Unterzustand); danach Übergabe an Station 2 | `SeitenBereich.tsx:442-459` herausgehoben |
| 2 | **Bauen (Puck)** | „2 · Seite bauen" | Seiten-Verwaltungsliste + Puck-Editor (`SeitenBereich` Verwaltungs-/Editor-Ansicht) | `SeitenBereich.tsx:356-593` |
| 3 | **Animator** | „3 · Animieren" | `BackdropProvider → EditorInner` (unverändert) | `page.tsx:264-273` |
| 4 | **Live-Preview + Export** | „4 · Vorschau & Export" | Preview-Modus auf Animator-Render-Grundlage + einklappbares Export-Fenster | neu, aus SeitenVorschau + Export-Reiter |

### Routing/State
- **Query-Param bleibt die URL-Wahrheit** (bewusst, wegen `output:"export"` — Begründung in `page.tsx:160-166` gilt weiter; keine dynamische Unterroute). Param umbenennen `?bereich` → `?station` mit 4 Werten. `?vorschau=<name>` bleibt als **Sub-Parameter von Station „bauen"** (welche Seite in Puck offen/vorschaubar ist) erhalten, aber Station 4 ist ein eigener Wert.
- **Ein zentraler History-Reducer** in `page.tsx`: alle Stationswechsel UND das Puck-Öffnen laufen über EINE `navigiere(next)`-Funktion, die konsistent `pushState` macht. Das behebt die N20-Asymmetrie an der Wurzel, statt sie pro Callback zu flicken.
- **Station 4 = Preview-Modus, nicht zweite Render-Welt:** Station 4 mountet denselben `BackdropProvider → EditorInner`-Baum wie Station 3, aber mit einem `previewModus`-Flag durch den Context, das (a) `.gre-panel` + `FlussHandlesEbene` + Objektmenü nicht rendert, (b) die Grafik-Ebene/Fenster-Pointer-Logik auf `pointer-events`-durchlässig schaltet (Klick-Abfangung AUS → Links echt klickbar, nichts selektierbar), (c) oben ein einklappbares Export-Fenster einblendet. So ist es „die Export-Wahrheit auf derselben Bühne" (M23) ohne Doppel-Bau. **Der ausblendbare Animator (M22) bleibt in Station 3 als schneller Blick-Toggle daneben bestehen** — das ist eine andere Sache als Station 4.

### M22 — Panel-Toggle in Station 3
Ein Toggle-Button im `.gre-kopf` (`GrafikEditor.tsx:2567`) blendet `.gre-panel` per CSS-Klasse aus/ein (Zustand tab-unabhängig, wie die Einrasten-Checkbox). Reine Sichtbarkeit; kein Unmount (State/History bleiben). Klein-Restknopf zum Wiedereinblenden bleibt sichtbar.

### N16 — per-Station-Titel
Da `layout.tsx` statisch ist und die Stationen client-seitig umschalten: ein kleiner `useEffect` in der Shell setzt `document.title` je Station (z. B. „1 · Import — Flowcode Builder"). `layout.tsx:20-24` bekommt einen neutralen Produkt-Default statt des Vorhang-Prototyp-Titels.

---

## 3 · Umsetzungsschritte (reviewbare Häppchen)

**S1 — Titel-Fix + Produkt-Default (klein, isoliert).**
Dateien: `app/layout.tsx`. Deliverable: neutraler Produkt-Titel/-Description statt Vorhang-Prototyp. (Löst N16 zur Hälfte; per-Station-Titel folgt in S3.) Kein Verhaltensrisiko.

**S2 — `Station`-Typ + 4er-Nav-Shell (Kern, additiv).**
Dateien: `app/editor/page.tsx`, `app/editor/seiten-bereich.css` (Nav-Styles). Deliverable: `type Station`, `leseStation()`, 4-Button-Nav in Flow-Reihenfolge, `?station`-Param mit Default `import`; die vier Mount-Zweige (Import-Bereich, Bauen-Bereich, Animator, Preview) — zunächst zeigt „import" den SeitenImport-Bereich, „bauen" die bisherige SeitenBereich-Liste/Puck, „animator" unverändert, „preview" vorerst = heutige SeitenVorschau-Portalvariante. **Abwärtskompatibilität:** `?bereich=seiten` weiterhin auf `bauen` mappen (Alt-Links). Löst **M1, R3, R4** (Grundstruktur).

**S3 — Zentraler History-Reducer + per-Station-Titel + Dirty-Guard.**
Dateien: `app/editor/page.tsx`, `app/editor/SeitenBereich.tsx` (`oeffne`/`schliesse`/`oeffneVorschau`/`schliesseVorschau` auf die zentrale `navigiere()` umstellen). Deliverable: EINE `navigiere(station, sub?)`-Funktion mit konsistentem `pushState`; Puck-Öffnen legt History-Eintrag an; `beforeunload`/Bestätigungsdialog bei ungespeicherten Puck-Änderungen (`aktuelleDatenRef` ≠ geladener Stand); `document.title` je Station. Löst **N20, N16 (Rest)**.

**S4 — Deep-Link-Heilung.**
Dateien: `app/editor/page.tsx`. Deliverable: Wenn `?vorschau=X` (oder künftig `?station=preview&seite=X`) ohne gültige Station kommt, auf die zugehörige Station auflösen statt stumm auf Animator. Löst **N21.** (Klein, nach S2/S3.)

**S5 — Import als echte Station 1.**
Dateien: `app/editor/page.tsx` (Import-Zweig), `app/editor/SeitenBereich.tsx` (Import-Unterzustand herauslösen → `importOffen`-Flag entfällt), `app/editor/SeitenImport.tsx` (nur `onFertig`/`onAbbruch`-Verdrahtung: nach Speichern → `navigiere("bauen", frischerName)`). Deliverable: Station 1 zeigt direkt den Import-Assistenten; „Zurück zur Liste" führt nach Station 2. Löst **M1 (Startansicht), R3/R4** für Station 1.

**S6 — Produkt-Tutorial-Trigger auf Station 1 verlagern.**
Dateien: `app/editor/page.tsx` (oder neue Shell-Komponente), `components/grafik/GrafikEditor.tsx` (Auto-Ketten-Ref `:421` + Auto-Open-Effekt + `<ProduktTutorial>` `:3654` **heraus**lösen), `components/grafik/ProduktTutorial.tsx` (unverändert wiederverwenden — Inhalt stimmt bereits). Deliverable: `ProduktTutorial` auf Shell-Ebene gemountet, Auto-Open-Effekt feuert beim ersten `/editor`-Besuch auf **Station 1**; `HilfeMenue`-Aufruf (Animator-Kopf) bleibt erhalten. **Wichtig (feature-inventar):** Der Latch-Key `wee-produkt-tutorial-gesehen` und `HilfeMenue` (Animator-Anleitung separat) dürfen nicht verloren gehen. Löst **M2.**

**S7 — M22 Panel-Toggle in Station 3.**
Dateien: `components/grafik/GrafikEditor.tsx` (`.gre-kopf`), `components/grafik/grafik-editor.css`. Deliverable: Ein-/Ausblenden-Toggle für `.gre-panel` (CSS-Sichtbarkeit, kein Unmount), Rest-Wiedereinblend-Knopf. Löst **M22.**

**S8 — Station 4 als Preview-Modus auf der Animator-Bühne (größtes Häppchen, ggf. teilen).**
Dateien: `app/editor/page.tsx` (Preview-Zweig mountet `BackdropProvider → EditorInner` mit `previewModus`), `components/grafik/GrafikEditor.tsx` (`previewModus` → Panel/Handles/Objektmenü nicht rendern, Klick-Abfangung aus), Grafik-Ebene/Pointer-Logik (pointer-events durchlässig im Preview), ein neues einklappbares Export-Fenster (wiederverwendet den bestehenden Export-Reiter-Inhalt). Deliverable: Station 4 zeigt die echte Bühne ohne Editor, Links klickbar, oben klappbares Export-Fenster mit Ordner-Struktur-Export als Kernweg. Löst **M23, N14.** (Abhängig von Import-/Export-Lens — Export-Truth-Inhalt kommt von dort.)

---

## 4 · Risiken + Mitigationen

- **R-A: `EditorInner`/GrafikEditor in ZWEI Stationen (3 + 4) gemountet → doppelte Provider-/Latch-Effekte, Vorhang-Latch-Doppellösung.** Mitigation: Station 3 und 4 teilen sich denselben gemounteten Baum via ein `previewModus`-Flag im BackdropProvider-Scope statt zweier paralleler Mounts; Stationswechsel 3↔4 remountet NICHT, sondern schaltet nur das Flag. So bleibt `latchGeloest` (`page.tsx:52`) und der Backdrop-State stabil.
- **R-B: Klick-Abfangung im Preview falsch abgeschaltet → entweder Links tot oder Grafik-Ebene fängt weiter ab.** Mitigation: `previewModus` schaltet exakt die eine Fenster-Pointer-Logik + `grafik-item--editierbar` aus (feature-inventar §4.4: „Grafik-Ebene pointer-events:none" ist ohnehin Invariante); Verify per Browser-Klick auf einen echten Link.
- **R-C: History-Reducer-Umbau bricht den bestehenden `popstate`-Pfad (`page.tsx:230-234`) und die Vorschau-Vorrang-Logik.** Mitigation: EIN Reducer, alle vier Callbacks (`wechsle`, `oeffne`, `oeffneVorschau`, `schliesse*`) darauf umstellen; Zustandsmatrix (station × sub) als Tabelle testen, inkl. Reload-Festigkeit.
- **R-D: Feature-Verlust beim Herauslösen von Import/Vorschau aus SeitenBereich.** Mitigation: additiv umbauen — SeitenBereich-Verwaltungsansicht bleibt inhaltlich; nur der Einstieg wandert in die Nav. Gate gegen `feature-inventar.md` §1 (nichts aus der Liste darf fehlen).
- **R-E: Tutorial-Latch-Kette (`produktAutoKetteRef`) beim Herauslösen kaputt → Tutorial nie/immer.** Mitigation: Ref + Effekt als Ganzes auf Shell-Ebene verschieben, Latch-Key unverändert lassen; erster-Besuch-Verhalten manuell mit gelöschtem localStorage prüfen.
- **R-F: `?bereich`-Alt-Links (geteilte Vorschau-Links, Doku) brechen.** Mitigation: `?bereich=seiten` weiter akzeptieren und auf `station=bauen` mappen.

---

## 5 · Abhängigkeiten zu den anderen Lenses

- **Undo-Lens (R1):** Der M22-Toggle und der Station-3↔4-Wechsel dürfen die Undo-Historie **nicht** resetten (nur Sichtbarkeit/Flag). Der Dirty-State-Guard (N20) muss wissen, was „ungespeichert" ist — das ist die Puck-Datenreferenz, unabhängig von der Grafik-Undo-Historie.
- **Import-Lens (M3–M9, S4, Welle 6):** Station 1 ist die Shell; der eigentliche Import-Umbau (gemma-Segmentierung, Assets, Unterseiten) füllt sie. Meine `navigiere("bauen", name)`-Übergabe nach `onFertig` muss zum neuen Import-Ergebnis passen.
- **Design-Lens (M24/R5):** Die neue 4er-Nav, der M22-Toggle und das Station-4-Export-Fenster brauchen WEE-Tokens (hell/sand, Orange/Grün-500 nur Signal). Ich liefere Struktur/Klassen, die Design-Lens die Optik. Nav muss hell sein (nicht der heutige dunkle Balken, N5).
- **Preview/Export-Lens (M25):** Station 4 zeigt die **Export-Wahrheit** — der Inhalt des Export-Fensters (Ordner-Struktur-Export mit Animationen) kommt von dort; ich liefere die Preview-Bühne + das einklappbare Fenster-Gerüst.
- **Flow ist Fundament:** M1/R3/R4 (diese Lens) müssen ZUERST stehen, sonst mounten die anderen Lenses in die falsche Struktur.

---

## 6 · Offene Fragen (nur echt Unentscheidbares)

- **Station 2 vs. Station 4 — wo lebt der „Vorschau"-Knopf je Seite?** Heute pro Listeneintrag (`SeitenBereich.tsx:551`). Im 4-Stationen-Modell könnte „Vorschau" entweder in Station 2 bleiben (schnelle Puck-Vorschau je Seite) ODER ausschließlich Station 4 sein. M23 sagt „Station 4 = Preview der **aktiven** Seite/Export-Wahrheit". Frage an Leon: Soll die Nicht-aktive-Seiten-Schnellvorschau in Station 2 als leichte Variante erhalten bleiben (additiv, kein Verlust) oder ganz nach Station 4 wandern? (Default-Vorschlag: in Station 2 als Schnellblick behalten, Station 4 ist die Export-Wahrheit der aktiven Seite — kein Feature-Verlust.)

---

## 7 · Abgedeckte Defect-IDs (Coverage)

Meine Schritte lösen: **M1** (S2/S5), **M2** (S6), **M22** (S7), **M23** (S8), **N14** (S8), **N16** (S1/S3), **N20** (S3), **N21** (S4), **R3** (S2/S5), **R4** (S2 — Menü-Inventar je Station neu gruppiert, nichts fällt weg).

Explizite ID-Liste: `M1, M2, M22, M23, N14, N16, N20, N21, R3, R4`.