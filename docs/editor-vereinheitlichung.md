# Editor-Vereinheitlichung — Ziel-Architektur (AP-A + AP-I + AP-E)

> Stand: 2026-07-22 · **Bauvorlage** (geplant vom Orchestrator auf Basis von Leons Original-Anweisungen
> und [feature-inventar.md](feature-inventar.md) = Nichts-verlieren-Checkliste + Kollisionskarte).
> Leons Vorgaben (wörtlich): „bearbeite fluss editor und grafikeditor gleichermaßen, **das ist ein tool
> eigentlich**" · „den flusseditor eher in **animationseditor umzubauen** … direkt platzieren, oder später
> die **voranimierten sachen auch in der library** im grafikeditor hinzufügen" · „bei jedem menü oder knopf
> oder funktion über die **user reise** nachdenken: gehört das element hier wirklich hin" ·
> „vollständiges **Tutorial für den Flusseditor**".
> Pflicht-Konventionen für alle Bau-Agenten: `skills/frontend-a11y/SKILL.md`, `skills/frontend-patterns/SKILL.md`,
> `skills/frontend-design-direction/SKILL.md` + ECC-Web-Rules. **Hartes Gate: keine Funktion aus
> feature-inventar.md §1 darf verloren gehen. Additiv umbauen, nie löschen.**

---

## 1. Leitidee: EIN Editor, Objekte statt Modi

Es gibt künftig **einen** Animations-Editor auf **einer** Route **`/editor`**. Die bisherige Trennung
Grafik-Editor ↔ Fluss-Editor verschwindet nicht durch einen Modus-Umschalter, sondern durch ein
**Objekt-Modell**: Auf der Bühne liegen **Objekte verschiedener Typen** — Grafiken (Assets mit
Scroll-Keyframes) und der **Fluss** (Spezial-Objekt mit Knoten). Das Panel ist immer dasselbe; was sich
ändert, ist der Kontext des ausgewählten Objekts. Genau so wird „das ist ein Tool eigentlich" wörtlich.

- `/grafik-editor` und `/fluss-editor` bleiben als **Redirects** auf `/editor` (Alt-Links, Docs,
  Tutorial-Latches brechen nicht — Inventar §4.3).
- Alle drei Provider gemeinsam gemountet: `BackdropProvider` → `RiverKursProvider` → `GrafikProvider`
  (EIN Backdrop-Provider statt zwei — Inventar §4.1; Vorhang-Latch wie bisher lösen).
- Die Fluss-Knoten-Handles sind nur aktiv, wenn das Fluss-Objekt den **Bearbeitungs-Fokus** hat
  (Auswahl in Ebenen/auf der Bühne) — verhindert Drag-Konflikte Grafik↔Knoten ohne globalen Modus.

## 2. Ziel-Panel: Reiter entlang der User-Reise

User-Reise: *Einrichten → Einfügen → Anordnen → Bearbeiten → Animieren → Sichern → Veröffentlichen.*
Jeder Reiter beantwortet EINE Nutzerfrage (Leons Regel; Begründung je Reiter):

| # | Reiter | Nutzerfrage | Inhalt (aus Inventar übernommen — verlustfrei) |
|---|---|---|---|
| 1 | **Bibliothek** | „Was füge ich ein?" | Assets (Ordner/Datei/Canva/Server-Pool, Hover-Aktionen ⬡/✕ — Risiko 1: sichtbar machen statt hover-only!) **+ NEU: Animations-Presets** (§4) |
| 2 | **Ebenen** | „Was liegt alles auf der Seite?" | ALLE Objekte: Grafiken **+ Fluss-Objekt** (ein Eintrag mit 🌊, Auswahl = Fluss-Fokus) + übernommene Vorhang-Bäume; Sichtbarkeit/Sperren/Löschen wie heute |
| 3 | **Objekt** | „Wie bearbeite ich das Ausgewählte?" | Kontextuell: Grafik → heutiger „Bild"-Inspector (Position/Größe/Spiegeln/Zuschneiden/SVG/Freistellen/Datei). Fluss → Fluss-Eigenschaften als Sektionen **Fluss · Wasser · Front · Nebel** (heutige rke-Reiter 1:1) |
| 4 | **Animation** | „Wie bewegt es sich beim Scrollen?" | heutiger Keyframes-Reiter (Liste, Zeitleiste, Easing-Kurve, „Hier locken", Bildtausch) **+ „Als Preset speichern"** (§4) |
| 5 | **Seite** | „Was ist schon auf der Original-Seite?" | Vorhang-Bäume übernehmen/zurückgeben (heutiger Seite-Reiter); später Website-OG/Ist-Stand (AP-D, Welle 3) |
| 6 | **Hintergrund** | „Worüber liegt der Editor?" | BackdropAuswahl unverändert (schon heute geteilt) |
| 7 | **Speichern** | „Stand sichern/laden?" | Grafik-**Setups** (Server/abbilder) UND Fluss-**Profile** (localStorage/Datei) nebeneinander, klar beschriftet — **zwei Speicher-Philosophien bewusst beibehalten** (Inventar §4.2, kein stiller Modellwechsel) |
| 8 | **Export** | „Wie bringe ich es auf meine Website?" | Alle Wege: JSON · HTML-Overlay · Runtime (`wee-embed.js`) · Fluss-SVG; „? Anleitung"-Modal. **Fluss-Profil kommt direkt aus dem RiverKurs-Context** (localStorage nur Fallback) — Risiko 3 |

**Panel-Kopf** (immer sichtbar): Titel „Editor" · Undo/Redo (kontextsensitiv, §3) · „?"-Hilfe · Tutorial ·
Einrasten-Toggle. Die Kreuz-Links „← Fluss"/„Grafiken →" entfallen (eine Route).

## 3. Undo/Redo-Entscheidung (Risiko 2)

Das ausgereifte Grafik-Undo (Coalesce 600 ms, Gruppen-Schlüssel, EIN Zug = EIN Commit) wird **nicht**
angefasst. Der Fluss bekommt einen **eigenen, gleichgebauten Verlauf** im RiverKursProvider (commit/undo/
redo, gleiche Konstanten). Strg+Z/Y und die Kopf-Knöpfe dispatchen an den Verlauf des **fokussierten
Objekttyps** (Fluss-Fokus → Fluss-Verlauf, sonst Grafik-Verlauf). Ergebnis: Knoten-Ops werden erstmals
undo-bar (Verbesserung), ohne die Grafik-Logik zu riskieren. Capture-Guards (Crop/Freistellen/Eingabefokus,
Risiko 9) bleiben unverändert bestehen.

## 4. „Voranimierte Assets" — Animations-Presets (AP-I-Kern)

Ein **Preset** = normiertes Keyframe-Set einer Grafik: Δ-Werte relativ zum ersten Keyframe
(Position/Scale/Opacity/Rotation/Easing), Scroll-Spanne auf 0..1 normiert, plus Name + Vorschau-Thumb.

- **Speichern:** im Reiter Animation „Als Preset speichern" → IndexedDB `wee-grafik`, neuer Key `K_PRESETS`.
- **Anwenden:** Bibliothek-Sektion „Presets": Klick bei ausgewählter Grafik → Keyframes werden an deren
  aktueller Position/Scroll-Lage instanziiert (Spanne default = gespeicherte Spanne, skalierbar).
  Drag auf Asset = Asset platzieren + Preset anwenden in einem Zug.
- Damit: Assets **frei animieren → wiederverwenden → direkt platzieren** — exakt Leons AP-I-Wortlaut.
- Fluss-Presets = bestehende **Profile** (bleiben eigenes Konzept im Speichern-Reiter; kein Zwangs-Merge).

## 5. Typ-abhängige Eingaben (Risiko 8)

„Eingeloggtes" Objekt + Mausrad: Grafik → Skalierung (wie heute) · Fluss-Knoten → Breite (wie heute).
Entf: Grafik → löschen (mit uebernommen-Aufräumung! Risiko 6) · Fluss-Knoten → Knoten löschen (neu,
undo-bar via §3; heute ungenutzt → additiv). Dispatch über den Objekt-Fokus, eine zentrale Stelle.

## 6. Hilfe & Tutorial (AP-E)

EIN Hilfe-System (GrafikHilfe wird generisch; BackdropHilfeIcon-Duplikat wird darauf umgestellt —
Inventar §4.2 Duplikat). Das Einstiegs-Tutorial wird zum **Editor-Tutorial**: bestehende 6 Grafik-Schritte
(Inhalte unverändert, Latch-Key `wee-grafik-tutorial-gesehen` bleibt) **+ neue Fluss-Schritte**
(Knoten ziehen, Breite, Wasser/Front/Nebel, Profile) **+ „?"-Hilfen an allen Fluss-Sektionen** (heute 0).

## 7. Bau-Wellen (jede Welle: bauen → tsc → Browser-Verify → Screenshot → Commit)

- **2a — Shell + eine Route (verlustfreier Zwischenschritt):** `/editor` mit allen drei Providern,
  BEIDE bestehenden Panels gemountet und funktionsfähig (Grafik links, Fluss rechts wie heute),
  Redirects `/grafik-editor` + `/fluss-editor` → `/editor`, Kreuz-Links raus. Kein Panel-Umbau.
  Verify: alle Kernflüsse beider Editoren auf EINER Route.
- **2b — Panel-Merge:** Fluss-Reiter als „Objekt"-Sektionen + Fluss in Ebenen + Reiter-Neuordnung
  (Tabelle §2) + typ-abhängige Eingaben (§5) + Export aus Context (Risiko 3) + Hover-Knöpfe sichtbar
  (Risiko 1). rke-Panel entfällt aus dem DOM (Code bleibt, wird importiert-zerlegt — nicht gelöscht).
- **2c — Fluss-Undo (§3) + Preset-Bibliothek (§4).**
- **2d — Hilfe/Tutorial (§6) + Checklisten-Gate:** Verify-Agent geht `feature-inventar.md` §1 Punkt für
  Punkt durch (Datei-/Verhaltensprüfung), Ergebnis als Abhak-Protokoll.
- Danach Welle 3 (§8) und Welle 4 (Puck-Fusion + Ordner-Import) — separat geplant.

## 8. Welle 3 — Website-OG · Element-Anker · HTML-Export (Spec)

Leons Anweisungen (wörtlich): „es muss **alles von der OG Website auch mit OG getagt** werden … sonst
bricht da die Logik" · „man kann immer noch nicht die **objekte die schon auf der seite sind anklicken
und auswählen** … er muss den website … layer auch schon als '**website-og**' … als **extra ist stand
layer** importiert werden" · „andere **export formate wie html** maybe um die **ganze seite** rauszuhauen
oder **einzelne elemente**". Drei aufeinander aufbauende Stufen:

**3a — AP-D Website-OG (Fundament):**
1. **Alles taggen:** Jede sichtbare Einheit der Landing (Sektionen, Überschriften, Texte, Bilder, SVGs,
   Hintergründe, Deko, Karten) bekommt `data-og-id` (stabil + sprechend, Schema `sektion:element:index`)
   und `data-og-typ` (`sektion|text|bild|svg|deko|hintergrund`). Reine Attribute — null Verhalten,
   null Optik. `data-vorhang-id` der Bäume bleibt zusätzlich bestehen.
2. **Ist-Stand-Ebene:** Der Editor liest beim Start alle `[data-og-id]` und zeigt sie im Ebenen-Reiter
   als eigene, eingeklappte Gruppe „Website (Ist-Stand)" (gruppiert nach Sektion). Klick = Auswahl:
   Element wird auf der Bühne markiert (Outline-Overlay) + hingescrollt; Objekt-Reiter zeigt
   Basis-Infos (Typ, Größe, Bildquelle). Für `bild|svg`: Knopf „In den Builder holen" (generalisiert
   das Vorhang-Muster: erzeugt Grafik am Platz, EIN Keyframe; Quelle bleibt unberührt — für getaggte
   Nicht-Vorhang-Elemente wird das Original NICHT ausgeblendet, ehrlich als Kopie-über-Original
   kommuniziert). `text|sektion|deko`: nur Auswahl/Highlight (Übernahme ergibt als Grafik keinen Sinn).
3. **Direktklick:** Alt+Klick auf der Bühne wählt das getroffene OG-Element aus (Alt vermeidet
   Kollision mit Grafik-Auswahl und normaler Seiten-Interaktion; im Hilfe-/Tutorial-Text erklären).

**3b — Element-ID-Anker (Präzision):** `GrafikKeyframe` bekommt optionale Felder `ankerId?` (eine
`data-og-id`) + `ankerDy?` (Offset zum Anker-Element-Top, Dokument-px). Beim Keyframe-Setzen wird
automatisch das nächstliegende getaggte Element + Offset gespeichert (zusätzlich zu den bestehenden
absoluten Werten — vollständig rückwärtskompatibel). Beim Rendern gilt: Anker vorhanden → Position =
Anker-Top + Offset (überlebt Verschiebungen mitten in der Seite); Anker fehlt → bestehender Pfad
(absolute Werte + Höhen-Normalisierung). Gleiches Prinzip für `scrollY` (Trigger-Anker). Ein
Objekt-Reiter-Hinweis zeigt den erkannten Anker; Abwählbar („frei positionieren").

**3c — AP-J HTML-Export:** Export-Reiter um zwei Wege ergänzt (bestehende drei bleiben):
1. **Einzelnes Element:** ausgewählte Grafik (inkl. Keyframes) als selbständiges HTML-Snippet —
   `<div>` + `<style>` mit CSS-Scroll-Driven-Animation (`animation-timeline: scroll()`; Keyframes →
   CSS-@keyframes) + kleinem JS-Fallback für Browser ohne Scroll-Timeline. Datei `wee-element-<name>.html`.
2. **Ganze Seite:** die bestehende Overlay-HTML-Variante zusätzlich als vollständige eigenständige
   Seite (HTML-Gerüst + Overlay + Runtime + eingebettete Bilder optional) `wee-seite.html`.
Verify je Stufe im Browser; nach 3a/3b läuft zusätzlich eine Checklisten-Gate-Stichprobe (Landing
optisch/funktional unverändert, `/` sauber).

## 9. Welle 4 — Seiten in EINEM Programm: Puck-Verwaltung · Ordner-Import · native Animation (Spec)

Leons Anweisungen (wörtlich): „**alles in einem programm**" · „ich will … **seiten importieren** …
über **ordner** und die eingefügt werden" („kann ja auch ganz normal an mich in **normaler ordner
website struktur** übergeben werden" · „das würde das komplette system perfekt abrunden **das ist das
letzte was fehlt**") · Fusions-Problem: „man muss ja alle **daten relativ haben (knotenpunkte
koordinaten)** … sollten wir dafür den standalone erst mal **mit puck verbinden**".

**4a — Seiten-Bereich im Editor:** `/editor` bekommt oben im Panel-Kopf einen Bereichs-Umschalter
**„Animator | Seiten"**. Der Seiten-Bereich (neue Route `/editor/seiten` + `/editor/seiten/[name]`
oder Client-State — nach Code-Lage entscheiden, output:"export"-tauglich = Query-Param bevorzugt):
Liste aller `seiten/*.json` (bestehende `/api/puck-seite/liste`), Anlegen/Öffnen/Löschen; Öffnen
mountet den Puck-Editor (bestehende `app/puck/puck.config.tsx`-Config) mit der Seite; **Speichern über
die Seiten-API** (Konflikt-Modell `erwartetGespeichert` nutzen; localStorage-Spike-Persistenz der
/puck-Route wird dort NICHT angefasst — der Spike bleibt als Referenz). Fehlerzustände sichtbar (409 →
Hinweis + Neu-laden-Angebot).

**4b — Ordner-Import (Stufe-C-light, deterministisch):** Im Seiten-Bereich „Website importieren":
Ordner wählen (File System Access, Muster aus Backdrop-Ordner-Modus) → `index.html` (bzw. wählbare
HTML-Datei) mit `DOMParser` zerlegen → deterministisches Mapping in **generische, neu registrierte
Puck-Bausteine**: `SektionBlock` (Container), `TextBlock` (Überschriften/Absätze, editierbar),
`BildBlock` (Bilder), `HtmlBlock` (Rest-Markup **entschärft**: `<script>`/`<iframe>`/`on*`-Attribute/
`javascript:`-URLs werden entfernt — deterministisch, dokumentiert; KEIN externer Sanitizer, Grenze
ehrlich benennen). Assets aus dem Ordner: Bilder als Data-URL wenn klein (<300 KB), sonst über neuen
Endpoint `POST /api/import/asset` nach `public/import/<slug>/` kopiert (Muster `/api/assets`
aktion=schreibe; openapi.yaml ergänzen!). Ergebnis: Import-**Bericht zuerst** (was wird zu was, was
wurde entfernt/geflaggt — ehrliches Flagging als fester UI-Teil), dann Speichern als
`seiten/<slug>.json` + Öffnen im Puck-Editor. Serialisierungs-Grenze gilt: nur Abbildbares wird
Baustein, Rest landet sichtbar im Flag-Bericht.

**4c — Animation nativ auf Puck-Seiten (Fusion):** (1) Puck-`render`-Wrapper gibt jeder Komponente
`data-og-id="puck:<props.id>"` → der 3b-Anker-Mechanismus greift sofort relativ zu Puck-Bausteinen.
(2) Neuer Backdrop-Modus „Puck-Seite": der Animator legt sich über eine gerenderte Seite aus
`seiten/*.json` (`<Render>` als Bühne, wie Ordner-Backdrop nur intern). (3) Das Animations-Abbild
wird Teil der Seiten-Datei (optionales Feld `anim` in `SeitenDatei` — Schema-additiv, Server-Gate
erweitert) → **eine Datei = Seite + Animation**. (4) Export „Ganze Seite (HTML)" exportiert für
Puck-Seiten Markup (DOM-Abgriff der Render-Bühne) + Animations-Overlay zusammen. Optische Abnahme
und Feinschliff der Fusion ausdrücklich bei Leon.

## 10. Welle 5 — KORREKTUR „Ein System" (nach Leons Abnahme-Feedback 2026-07-22)

Leons Befund (berechtigt, bestätigt durch Prüfung): Seiten-Bereich und Animator sind **zwei Welten**
(Animator zeigt die hartkodierte WEE-Landing, Seiten-Bereich nur `seiten/*.json`); Bens Website wurde nie
importiert (und ist als Next-Projekt vom 4b-HTML-Import gar nicht erfasst); ~34 Knöpfe ohne Hover-Titel;
kein Produkt-Onboarding. Leons Zielbild (wörtlich): „ich muss ja die **sachen aus der geladenen website
auch dann anklicken können im animator**, und in der **seite aus puck bauen / statische version sehen**
… **alles ein system**." Vier Stufen:

**5a — Ben-Import-Pipeline (Stufe A/B für gebaute eigene Seiten):** Bens Repo liegt als
`test-sites/wee-website-v3` (gitignored, `output:"export"`, Next 15.5.20 wie wir). Pipeline:
(1) Bens Projekt bauen — `npm install` + `npm run build` NUR in dessen Ordner (eigenes `.next`/`out`,
kollidiert nicht mit unserem Dev-Server; unser Builder-Root wird NIE gebaut). (2) Import-Erweiterung
„Eigene gebaute Seite": beim Ordner-Import werden same-origin **Stylesheets ÜBERNOMMEN** statt geflaggt —
CSS-Dateien nach `public/import/<slug>/css/` kopiert, im Seiten-Dokument als `styles: string[]` (additiv
an `SeitenDatei`) gespeichert; Bühne/Puck-Render/Vorschau laden sie **per CSS-`@scope` auf den
Bühnen-Container begrenzt** (Chromium — deckt sich mit der bestehenden Ordner-Feature-Grenze; Fallback
ungescoped mit sichtbarer Warnung). `<script>` bleibt draußen (geflaggt). (3) `out/index.html` (+ optional
Unterseiten `out/*/index.html` als eigene Seiten) → `seiten/wee-website-v3.json` — Slug-Vorgabe beachten:
**„v3", nie „v2"**. Mehrseitig: Startseite Pflicht, Unterseiten wählbar.

**5b — „Aktive Website" (der Ein-System-Zustand):** Eine Seite ist die **aktive Website**
(localStorage-Key, im Seiten-Bereich markier-/erkennbar; nach Import automatisch aktiv). Der **Animator
lädt per Default die aktive Seite als Bühne** (statt WEE-Landing); die WEE-Landing wird zur wählbaren
„Demo-Landing" im Hintergrund-Reiter degradiert. **Statische Vorschau:** je Seite ein „Vorschau"-Knopf →
Vollbild-`<Render>` ohne Editor-Chrome (mit Styles aus 5a), Zurück-Knopf. Damit: bauen in Puck ·
statisch ansehen · animieren im Animator — dieselbe Seite, drei Sichten.

**5c — Anklickbarkeit der geladenen Website im Animator:** Ist-Stand-Gruppe (Ebenen), Alt+Klick und
„In den Builder holen" müssen auf der aktiven-Seiten-Bühne nachweislich funktionieren (die 4c-Kette
`data-og-id="puck:<id>"` liefert die Tags; og-typ je Baustein-Typ prüfen/ergänzen: BildBlock→bild,
TextBlock→text, SektionBlock→sektion, HtmlBlock→deko). Import-Bild-Elemente sind per Klick als Grafik
übernehmbar und damit sofort animierbar + ankerbar.

**5d — Onboarding + Erklärungen + Aufräumen:** (1) **Einmaliges Produkt-Tutorial** (eigener Latch-Key,
erscheint beim ersten `/editor`-Besuch VOR dem Animator-Tutorial): „Website importieren → in Puck
bauen/ansehen → aktive Website → im Animator anklicken & animieren → exportieren" — geführt, mit
Verweis auf die „?"-Hilfen (Tutorial ≠ Hover-Erklärung, Leons Unterscheidung). (2) **Hover-`title` auf
alle nackten Knöpfe** (Prüfstand: SeitenBereich 9/0, SeitenImport 5/0, ExportPanel 6/0, Inspector 14/5).
(3) Testreste entfernen (`seiten/rt-4c.json`, `abbilder/welle3b-verifikation.json` — Leons Ok vom
2026-07-22 liegt vor).

## 11. Welle 6 — Import-Endlevel HYBRID (Skripte mechanisch · lokales Modell urteilt)

Leons Vorgaben: Werkzeuge aus [import-endlevel.md](import-endlevel.md) statt Eigenbau-Heuristik; die
**Zerlegungs-Urteile trifft das lokale Modell** (Ollama `gemma4`, läuft — Tokenkosten sind kein Argument);
Verifikation strikt nach [verifikations-protokoll.md](verifikations-protokoll.md). Messlatte (Nutzer-Erlebnis,
Abnahme dagegen): **Startseite + ALLE Unterseiten in Puck · alle Texte sichtbar · Layout im Screenshot-Paar
Original-vs-Bühne deckungsgleich · 0 Bild-404 · Testreste (rt-bleibt-Preset) entfernt.**

- **6a Einfrieren:** `scripts/freeze-seite.mjs` — Playwright (devDep + Chromium; `npm install` im Root ist
  erlaubt, `npm run build` bleibt verboten) rendert `out/` über einen Mini-Static-Server, wartet Hydration,
  macht einen Scroll-Sweep (Entrance-/Lazy-Trigger), treibt alle Animationen in den Endzustand
  (`getAnimations().finish()`), greift dann den sichtbaren End-DOM ab (freeze-dry falls tragfähig, sonst
  dokumentierter Eigen-Abgriff). Löst die opacity-0-Falle an der Wurzel.
- **6b Gemma-Segmentierung:** `scripts/segmentiere-gemma.mjs` — kompakte DOM-Outline (nicht Roh-HTML) →
  Ollama `http://127.0.0.1:11434` (gemma4, JSON-Format) urteilt: Sektionsgrenzen, Block-Typ-Zuordnung
  (Text/Bild/Html), Sektions-Titel. Skript validiert (alle Knoten abgedeckt, Reihenfolge dokumentgetreu),
  bei Modell-Formfehlern bis 2 Retries mit Fehler-Feedback; deterministischer Fallback nur als klar
  deklarierter Modus im Bericht. CSS je Baustein weiter mechanisch (bestehende 5a-Kette).
- **6c Vollständigkeit:** alle `out/**/index.html` als eigene Seiten; Assets vollständig (`<img>` in
  HtmlBlöcken + CSS-`url()` auflösen und kopieren — 0×404); `rt-bleibt`-Preset entfernen.
- **6d Abnahme:** Verify-Agent nach Protokoll (Screenshot-Paar Original vs. Bühne, opacity-Stichproben,
  404-Netzscan, Unterseiten-Liste); danach **eigener End-to-End-Blick des Orchestrators** vor jedem Bericht.
  Dogfood: Seiten-Checks wo möglich über das gedruckte `flowcode-builder-pp-cli`.

**Invarianten für alle Wellen** (Inventar §4.4): z-Stack kollisionsfrei · „Knoten SIND der Fluss" ·
Höhen-Normalisierung nur im Prop-Pfad · Grafik-Ebene pointer-events:none · uebernommen-Kopplung ·
`grafik.config.json` bleibt der EINZIGE Live-Schreibpfad („Als Standard setzen", mit confirm) ·
Landing-Renderpfad (`/`, `/pilot-projekt`) unangetastet · geparkte Bausteine (RiverLakeBlob,
disabledWaypointTypes-Code) NICHT löschen.
