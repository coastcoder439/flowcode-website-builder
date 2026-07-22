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

**Invarianten für alle Wellen** (Inventar §4.4): z-Stack kollisionsfrei · „Knoten SIND der Fluss" ·
Höhen-Normalisierung nur im Prop-Pfad · Grafik-Ebene pointer-events:none · uebernommen-Kopplung ·
`grafik.config.json` bleibt der EINZIGE Live-Schreibpfad („Als Standard setzen", mit confirm) ·
Landing-Renderpfad (`/`, `/pilot-projekt`) unangetastet · geparkte Bausteine (RiverLakeBlob,
disabledWaypointTypes-Code) NICHT löschen.
