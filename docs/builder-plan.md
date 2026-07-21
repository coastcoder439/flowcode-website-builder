# Plan: Builder-Vereinheitlichung (Fluss + Grafik = EIN Werkzeug)

> Erstellt via `/multi-plan`, **überarbeitet v2** via `/multi-plan` + `/multi-workflow`
> (Fallback-Modus: kein codeagent-wrapper vorhanden → eigene Tiefenanalyse statt Codex/Gemini).
> **v2-Nachtrag (von Leon benannt, in v1 gefehlt):** (a) bestehende Seiten-Objekte DIREKT auf der
> Seite anklicken + auswählen; (b) die Website-Layer automatisch als stehende „Ist-Stand"-Ebene
> lesen — kein manuelles Einzeln-Nachladen. Beides jetzt in AP-D (Abschnitt 4) ausgebaut.
> **v3-Nachtrag (Leons Entscheidungen + Vision):** Modus-Umschalter = ja. Tagging = **ALLES**
> (Bilder, SVG, Hintergründe, Text, Sektionen, Deko — jedes Element der OG-Seite bekommt `data-og-*`).
> Zusatzfeatures = **alle**. NORDSTERN: dieser Builder soll langfristig ein **selbst-gehosteter,
> kostenloser Website-Editor der Wix/Elementor-Klasse** werden (Abschnitt 0). Die APs hier sind das
> Fundament dafür — die Konvention muss von Anfang an alles erfassen, sonst bricht die Logik später.
> **v4-Nachtrag (wiederhergestellte verlorene Anweisung + Web-Recherche):** OSS-Website-Builder als
> Fundament (Recherche → Empfehlung **Puck**, Abschnitt 0.5); flüssiger Keyframe-Verlauf mit sichtbarer,
> verstellbarer Kurve, Keyframe kopieren, frame-spezifischer Bildtausch (AP-G); Asset-Bearbeitung
> skalieren/spiegeln/zuschneiden/freistellen/upscalen (AP-H); klare Master-Liste (Abschnitt 10).
> **v5-Nachtrag (Decap-Frage + Reframe + Roadmap):** Content-Layer-Entscheidung Decap (Abschnitt 0.5);
> Fluss-Editor wird zum **Animations-Editor** (AP-I); universeller kompakter Export + HTML/weitere
> Formate (AP-J); Roadmap „Full-End-Website-Editor-Dashboard im Agentic OS auf OSS-Basis" (Abschnitt 0.6).
> FOKUS ZUERST: Grafik- + Animations-Editor (Scroll-Animation) — Puck kommt als spätere Phase.
> **v6-Nachtrag (2026-07-22, Leon):** ⚠️ **DECAP GESTRICHEN.** Die v5-Content-Layer-Entscheidung (§0.5b) ist
> verworfen — KEIN separates CMS. Nur noch **ZWEI Schichten**: Animation (unsere Tools) + **Komposition UND Inhalt
> = Puck** (Text/Bilder = Props der Puck-Bausteine, direkt im Editor editiert, als `seiten/*.json` in Git versioniert).
> Alle Decap/Sveltia-Stellen unten (§0.5b, Roadmap R3, Checkliste) sind ab hier **historisch/überholt** — nicht mehr
> als aktuelle Architektur lesen. Projekt jetzt eigenständig: `user-projects/flowcode-website-builder`
> (Repo `coastcoder439/flowcode-website-builder`); die Projekt-/Repo-Angaben unten stammen vom WEE-Ursprung vor dem Whitelabel-Split.
> Ausführung über `/multi-execute .claude/plan/builder-vereinheitlichung.md`.
> **Projekt:** `user-projects/wee-website-refactoring/site-versions/wee-website-ben-refactor/v3`
> **Dev-Server läuft auf Port 3113 — im Execute NIE `npm run build`, NIE `.next` löschen.**

---

## 0. Nordstern (Vision — Leon v3)

Ziel ist langfristig ein **selbst-gehosteter, kostenloser visueller Website-Editor der
Wix/Elementor-Klasse** — kein reines Grafik-Overlay. Konsequenz für JETZT: das Fundament muss
vorwärtskompatibel sein, damit spätere Features anschließen, ohne die Logik zu brechen.

**Ehrliche Einordnung (kein Blendwerk):** Was der Builder heute kann, ist Grafik-Ebenen positionieren/
animieren (Abbild). „Wix-Klasse" (Text ändern, Hintergründe/Stile, Sektionen umbauen, responsive
Breakpoints) ist eine **Roadmap über mehrere Phasen**, nicht diese Iteration. Diese APs bauen das
tragfähige Fundament: eine Tagging-Konvention über ALLES + ein typisiertes OG-Register + An-Ort-Adoption.
Element-Typen, deren Editier-Oberfläche noch fehlt, sind trotzdem **sichtbar und auswählbar** (die Logik
bricht nicht) und zeigen ehrlich „Bearbeiten folgt" statt einer Sackgasse.

| OG-Typ (`data-og-typ`) | Heute | Später (Roadmap) |
|---|---|---|
| `bild` / `svg` / `dekor` (positioniert) | adoptierbar → Grafik (Position, Skalierung, Keyframes, Vektorisieren) | Filter/Effekte |
| `fluss` | Verweis in Fluss-Modus | — |
| `hintergrund` | sicht-/auswählbar | Farbe/Bild/Verlauf-Editor |
| `text` | sicht-/auswählbar | Inline-Text + Typo-Stile |
| `sektion`/`container` | sicht-/auswählbar | Layout/Abstände/Reihenfolge, Breakpoints |
| `knopf`/`cta` | sicht-/auswählbar | Link/Aktion/Stil |

## 0.5 OSS-Fundament — Recherche & Entscheidung (Leon v4)

Leons Vorgabe: nicht das Rad neu erfinden — einen **quelloffenen Website-Builder als Grundlage**
(Oberfläche + CMS) nehmen und UNSERE Tools drauflegen. Recherche (mehrere Quellen, belegt):

| Kandidat | Stack | Lizenz | Self-Host/frei | CMS | Unsere React-Tools einbettbar? |
|---|---|---|---|---|---|
| **Puck** `@measured/puck` | **React / Next (App Router)** | **MIT** | ja (Bibliothek) | nein (mitbringen) | **JA — Komponenten + Plugins, nativ** |
| GrapesJS | Vanilla JS | BSD-3 | ja (Bibliothek) | nein | schwer (kein React, Iframe-Canvas) |
| Webstudio | Remix/React | AGPL-3 | ja (Plattform) | ja | Umzug in deren Plattform nötig |
| TinaCMS | Next/Astro | Apache-2 | ja | Git-Content | teils (Inline-Edit, kein Page-Builder) |
| Ghost / WordPress | Node / PHP | MIT / GPL | ja | ja | nein (nicht unser Stack) |

**Empfehlung: Puck.** MIT (sauberste Lizenz), React/Next-nativ (hostet unsere bestehenden Komponenten
UND unsere Overlay-Tools direkt), einbettbare Bibliothek statt Fremdplattform, aktiv gepflegt
(13k★, v0.22.2 · Juli 2026), Komponenten-Registrierung + Plugin-API, „you own your data, no lock-in".

**Die ehrliche Einordnung, die zählt (kein Blendwerk):**
Es gibt ZWEI Wege, einen OSS-Builder zu nutzen — mit völlig unterschiedlichem Risiko:
1. **Koexistenz (empfohlen):** Puck liefert die generische „Wix-Klasse"-Oberfläche, die uns FEHLT
   (neue Seiten, Sektionen, Text, Hintergründe, CMS). Unsere handgebaute animierte Landing bleibt wie
   sie ist; unsere Spezial-Tools (Grafik-Keyframes, Fluss, Vektorisierer, Website-OG-Leser) bleiben die
   Animations-Schicht. Ein vereinheitlichtes UI, aber Puck muss unsere Scroll-Knoten-Fluss-Magie NICHT
   verstehen. Das ist genau „OSS für die Oberfläche, unsere Tools drauf".
2. **Voll-Migration:** die ganze Landing als Puck-Komponenten neu bauen → riesig, riskant, kämpft gegen
   die bespoke Scroll-Animationen. **Nicht empfohlen.**
**Unbequeme Wahrheit:** Unser Alleinstellungsmerkmal — Scroll-Keyframe-Animation über der Live-Seite —
kann KEIN OSS-Builder. Der OSS-Builder kauft uns die generische Seiten-/Text-/Hintergrund-/CMS-Bearbeitung,
die wir nicht haben; unsere Tools bleiben substanzielle Eigenarbeit. So teilt sich der Wert ehrlich auf.

**De-Risking-Spike (Phase 0, PFLICHT vor Voll-Adoption):** EIN Tool (der Grafik-Keyframe-Editor) als
Puck-Plugin/-Komponente prototypisch einbetten und beweisen, dass das Integrationsmodell trägt —
BEVOR wir die Hülle (AP-A) auf Puck umstellen. Scheitert der Spike, bleibt unser eigener BuilderShell.

**Quellen:** [opensourcealternatives.to](https://www.opensourcealternatives.to/blog/best-open-source-website-builders) ·
[Puck GitHub](https://github.com/puckeditor/puck) · [Puck Docs](https://puckeditor.com/docs) ·
[GrapesJS vs Puck vs Webstudio (gjs.market)](https://gjs.market/blogs/grapesjs-vs-webflow-vs-builderio-vs-puck-which-visual-builde) ·
[Top 5 React Page Builders (dev.to)](https://dev.to/fede_bonel_tozzi/top-5-page-builders-for-react-190g) ·
[@imgly/background-removal](https://github.com/imgly/background-removal-js)

### 0.5b Content-Layer — Decap · ~~entschieden (v5)~~ · ✂️ GESTRICHEN (v6, 2026-07-22)

> ⚠️ **ÜBERHOLT — nur Historie.** Decap ist verworfen; Inhalt läuft über Puck (Baustein-Props, `seiten/*.json` in Git),
> kein separates CMS. Der folgende Abschnitt bleibt nur zur Nachvollziehbarkeit stehen.

Ben arbeitet mit **Decap CMS**. Recherche (belegt): Decap ist ein **Git-basiertes Headless-CONTENT-CMS**
(MIT), KEIN visueller Page-Builder. Inhalte = Markdown/YAML/JSON im Git-Repo; Admin = React-SPA unter
`/admin`, konfiguriert per `config.yml` (Collections/Felder). Läuft mit jedem SSG/Next. **Pflege:** noch
Releases (3.11.0, März 2026), aber Tempo seit der Netlify→Community-Übergabe 2023 spürbar verlangsamt;
Nachfolger **Sveltia CMS** (Svelte, leichter, config-kompatibel) ist der moderne, aber Beta-Weg (GA Ende 2026).

**Empfehlung: JA, Decap sinnvoll integrierbar — aber als eigener LAYER, nicht als Ersatz.** Begründung:
Unser Dashboard hat drei getrennte Schichten, die sich NICHT überlappen dürfen:
1. **Inhalt** (Text, Bilder, strukturierte Daten in Git) → **Decap** (oder Sveltia)
2. **Visuelle Komposition** (Blöcke, Layout, Sektionen) → **Puck**
3. **Animation** (Scroll-Keyframes, Fluss, Vektor) → **unsere Tools**

Decap passt architektonisch gut: Git-basiert (deckt sich mit „self-hosted, frei, kein Lock-in"), MIT,
und **Ben kennt es schon** = realer Workflow-Gewinn. Es ist zudem **wechselsicher**: Inhalte sind bloß
Dateien im Repo, `config.yml` ist dokumentiert → späterer Umstieg Decap→Sveltia ist billig (config-kompatibel).
**Bedingungen, sonst bricht die Logik:** (a) klare Grenze Inhalt↔Präsentation ziehen — NICHT Decap UND
Puck gleichzeitig die Seitenstruktur definieren lassen; (b) Einbindung ist LOSE (eigene SPA unter `/admin`
bzw. per iframe/Bundle), nicht nativ-React wie Puck — also „als Content-Backend anschließen", nicht „in
denselben Canvas mergen"; (c) Decaps Pflege-Risiko bewusst tragen, Sveltia als Notausgang notiert.
**Quellen:** [Decap GitHub](https://github.com/decaporg/decap-cms) · [decapcms.org](https://decapcms.org/) ·
[Sveltia CMS](https://github.com/sveltia/sveltia-cms) · [Decap vs Tina 2026](https://dasroot.net/posts/2026/03/decap-cms-vs-tina-cms-vs-forestry-2026-comparison/)

## 0.6 Roadmap — Full-End-Website-Editor-Dashboard im Agentic OS (OSS-Basis)

Die Vision (Wix/Elementor-Klasse, self-hosted, frei) als phasierte Roadmap. **Reihenfolge bewusst:
zuerst unser Alleinstellungsmerkmal (Animation) härten, dann die OSS-Schichten anschließen** — sonst
bauen wir Fundament auf ungeprüftem Sand.

| Phase | Was | Baustein | Status |
|---|---|---|---|
| **R1 (JETZT)** | Grafik- + Animations-Editor: Inspector, SVG-Fix, Keyframe-Kurven, Asset-Bearbeitung, Website-OG, universeller Export | unsere Tools | dieser Plan, AP-A…AP-J |
| **R2** | Puck-Spike bestanden → Puck als visueller Shell; unsere Tools als Puck-Plugins | Puck (MIT) | nach R1 |
| **R3** | Content-Layer anschließen: Decap (Bens Workflow) als Git-Content-Backend, saubere Grenze Inhalt↔Präsentation | Decap/Sveltia | nach R2 |
| **R4** | HTML/Export-Pipeline produktiv: ganze Seiten + Elemente rausgeben, self-hosted deploybar | AP-J + Next-Export | parallel ab R2 |
| **R5** | Dashboard-Integration ins Agentic OS: mehrere Projekte, Rollen, Vorschau-Deploys | OS-Ebene | Vision |

**Leitplanke:** Jede OSS-Schicht wird ERST per Spike bewiesen, DANN adoptiert (Puck-Spike, Decap-Grenze).
Kein Big-Bang. Unsere Animations-Schicht bleibt in jeder Phase das, was kein OSS-Tool liefert.

## 1. Ist-Zustand (am Code verankert, nicht vermutet)

| Bereich | Datei | Befund |
|---|---|---|
| Grafik-Editor | `components/grafik/GrafikEditor.tsx` (~2000 Z.) | 5 Reiter: bibliothek/ebenen/keyframes/setups/seite |
| Vektor-Regler | `GrafikEditor.tsx:1531` | `<details class="gre-vektor-regler">` liegt **im Bibliothek-Reiter** — falscher Ort |
| „In SVG umwandeln" (Pool) | `GrafikEditor.tsx:1404` + `grafik-editor.css:438` | Knopf `gre-pool-vektor` ist `opacity:0` bis Hover → **unauffindbar = „geht nicht"** |
| „In SVG umwandeln" (Ebene) | `GrafikEditor.tsx:1655` | nur sichtbar wenn eine platzierte Grafik ausgewählt ist |
| Objekt-Menü | `components/grafik/GrafikObjektMenue.tsx` | schwebt an der Grafik, ruft bestehende Funktionen |
| Hilfe/Tutorial (Grafik) | `components/grafik/GrafikHilfe.tsx` | 12 „?" + Tutorial — **existiert nur hier** |
| Rückgängig | `components/grafik/GrafikContext.tsx` | Undo/Redo vorhanden (nur Grafik-Seite) |
| Bäume adoptieren | `components/grafik/GrafikSeiteTab.tsx` | liest Bäume über `data-vorhang-id`, `uebernommen`-Liste |
| Fluss-Editor | `components/river/RiverKursEditor.tsx` | 5 Reiter: fluss/wasser/blasen/nebel/verlaeufe; **kein Tutorial, keine „?"** |
| Fluss speichern | `RiverKursEditor.tsx:317/363` | benannte Verläufe speichern/exportieren vorhanden |
| Geteilter Code | — | **KEINER.** `gre-` vs `rke-`, eigene CSS, eigene Provider → volle Duplikation |
| OG-Tags | nur `data-vorhang-id` (Bäume), `data-grafik-id` (Builder-Ebenen) | keine allgemeine „Website-OG"-Konvention |

**Kernschluss:** Beide Editoren sind Overlays über derselben `HomePage`, strukturell Zwillinge,
aber dupliziert. Leons Satz „das ist ein Tool eigentlich" ist technisch korrekt.

---

## 2. Leitentscheidungen (mit Begründung)

### E1 — Ein geteilter Shell, kein Big-Bang-Merge
Statt beide Seiten in eine zu verschmelzen (hohes Risiko): ein **`BuilderShell`** liefert Kopf
(Rückgängig/Wiederholen, „? Hilfe", Speichern, **Modus-Umschalter Fluss ⇄ Grafik**), geteilte
Design-Tokens und geteilte Primitive. `/fluss-editor` und `/grafik-editor` rendern denselben Shell
im jeweiligen Modus; der Umschalter wechselt den Modus, ohne das Overlay über der Live-Seite zu
verlassen. **Ergebnis: „ein Werkzeug"-Gefühl bei begrenztem Risiko.** Voller Routen-Merge = optionaler Folgeschritt.

### E2 — Inspector-Fenster pro Bild (die „eigenes Edit-Fenster"-Forderung)
Auswahl einer Grafik öffnet **einen** zusammenhängenden Inspector mit klaren Abschnitten:
Kopf · Position/Größe · Keyframes · Wiedergabe · **In SVG umwandeln (+ Regler)** · Datei-Aktionen.
Die Vektor-Regler ziehen aus der Bibliothek **hierher** (E-Kritik von Leon direkt adressiert).
Bibliothek wird wieder reiner Asset-Browser. Muster: **Inspector/Property-Panel** (frontend-patterns:
Container/Presentational, State-Trennung).

### E3 — „In SVG umwandeln" wird erstklassig
Wurzel des „geht nicht" = Auffindbarkeit (Hover-Knopf + vergrabene Regler). Fix: **immer sichtbarer
Knopf im Inspector**, nur für Rastergrafiken (bei SVG/Lottie/Video ausgeblendet). Phase 0 reproduziert
zusätzlich im Browser, ob ein echter Laufzeitfehler dahinter steckt — nicht nur verschieben, sondern beweisen.

### E4 — „Website-OG" automatisch lesen + direkt anklickbar (nicht nur eine Liste)
`data-vorhang-id` wird zu einer allgemeinen Konvention verallgemeinert
(`data-og-id` + `data-og-label` + `data-og-gruppe` + `data-og-typ`). Die animierten Bild-/SVG-Ebenen
der Seite werden getaggt. Drei Dinge, die zusammengehören:
1. **Auto-Lesen als stehende „Ist-Stand"-Ebene:** Beim Öffnen scannt der Builder das Live-DOM nach
   `[data-og-id]` und listet ALLE als eigene, klar getrennte Ebenengruppe „Website (Ist-Stand)". Kein
   manuelles Einzeln-Nachladen mehr — die Seiten-Grafiken sind sofort da und auswählbar. *(v2: Leons
   „ich will ja nicht immer alle neu komplett hinzufügen müssen".)*
2. **Direkt auf der Seite anklicken:** In Editor-Modus fängt der bestehende Klick-Listener
   (`GrafikEditor.tsx:436`, heute nur `[data-grafik-id]`) zusätzlich `[data-og-id]`. Klick auf einen
   Baum/eine SVG-Ebene AUF der Seite wählt sie aus. *(v2: Leons „man kann immer noch nicht die Objekte
   … anklicken und auswählen".)*
3. **Bearbeiten = an-Ort-adoptieren (verzögert):** Solange nur ausgewählt, bleibt das Original stehen
   (schreibgeschützt). Erst die erste echte Änderung „adoptiert" das Element an-Ort — schnappt die
   aktuelle Bildschirmposition in eine bearbeitbare Grafik und blendet das Original aus (verallgemeinert
   `uebernommen`). Kein Springen: Position wird zum Klickzeitpunkt gemessen.

**Ehrliche Grenze:** Der Fluss ist knotenbasierte Geometrie — er wird NICHT als Grafik adoptiert.
Klick/Liste bei `data-og-typ="fluss"` leitet in den **Fluss-Modus**.
**Zweite ehrliche Grenze:** Vollständigkeit hängt am Tagging — was keine `data-og-id` trägt, erscheint
nicht. Deshalb ist ein Inventar-Schritt (Phase 0) Teil des Plans.

### E5 — Geteiltes Tutorial-/Hilfe-System für beide Seiten
`GrafikHilfe.tsx` wird zu einem **modus-neutralen** `BuilderHilfe` gehoben (Primitive: `HilfeIcon`,
`TutorialModal`). Beide Editoren speisen nur ihren Inhalt ein. Der Fluss-Tutorial-Inhalt kommt von
einem **eigenen Sonnet-5-Unteragenten** (Leons ausdrückliche Vorgabe).

### E6 — User-Journey-Audit als eigener Arbeitsschritt
Für jedes Menü/Element: „gehört das hierhin, wird der Nutzer logisch geführt?" (Abschnitt 3).
Ausführung des Menü-Designs läuft über **/multi-frontend** + **/frontend-a11y** + **/frontend-patterns**.

---

## 3. User-Journey-Audit („gehört das Element hierhin?")

| Element heute | Problem | Entscheidung |
|---|---|---|
| Vektor-Regler in Bibliothek | Regler gehören zu EINEM Bild, nicht zum Browser | → in den Bild-Inspector (E2) |
| ⬡-Knopf hover-versteckt im Pool | Nutzer findet ihn nie | → erstklassig im Inspector (E3) |
| Bearbeiten über 3 Orte verteilt (Ebenen-Icons, Keyframes-Reiter, Objekt-Menü) | kein Ort „für dieses Bild" | → Inspector bündelt alles; Objekt-Menü bleibt Schnellzugriff |
| „Seite"-Reiter zeigt nur Bäume | Nutzer kann restliche Seiten-Grafiken nicht anfassen | → „Website"-Leser für alle OG-Ebenen (E4) |
| Seiten-Objekte auf der Seite nicht anklickbar | Nutzer muss über eine Liste gehen statt direkt aufs Objekt zu klicken | → Klick-Listener fängt auch `[data-og-id]` (E4.2) |
| Seiten-Grafiken einzeln manuell nachladen | mühsam, „ich will nicht alle neu hinzufügen" | → Auto-Lesen als stehende „Ist-Stand"-Ebene beim Öffnen (E4.1) |
| Zwei getrennte Editor-URLs ohne Wechsel | Nutzer weiß nicht, dass es ein Tool ist | → Modus-Umschalter im Shell (E1) |
| Fluss-Editor ohne Erklärung | Knoten/Locken/Rad unerklärt | → Fluss-Tutorial + „?" (E5) |
| Reiter-Ordnung generisch | Reihenfolge folgt nicht dem Arbeitsablauf | → Ablauf-Reihenfolge: Wählen → Platzieren → Positionieren → Locken → Speichern |
| Kein Leerzustand-Hinweis | Nutzer weiß nicht, was als Nächstes | → Empty-States mit nächstem Schritt + Ablauf-Brotkrumen |

---

## 4. Arbeitspakete

### AP-A — Geteilter BuilderShell + Design-Primitive  *(Fundament, zuerst)*
**Ziel:** eine Hülle, ein Look, geteilte Bausteine.
- Neu `components/builder/BuilderShell.tsx`: Kopf mit ↶↷ (aus Context), „? Hilfe", Speichern-Status,
  **Modus-Umschalter** (Fluss ⇄ Grafik). Rendert je Modus das passende Panel.
- Neu `components/builder/ui/`: `IconButton`, `HilfeIcon` (Popover), `TutorialModal`, `Tabs`, `Popover`,
  `Feldgruppe` (Abschnitts-Container). Semantisches HTML, ARIA, Fokus-Falle im Modal, `focus-visible`,
  Tastatur-Navigation (frontend-a11y).
- Neu `components/builder/builder-tokens.css`: Farben/Abstände/Radien als CSS-Variablen
  (dunkel `rgba(20,30,24,.92)`, Grün `#3f6e3a`, Gelb `#e8b400`). `gre-`/`rke-` werden schrittweise darauf gemappt.
- `app/fluss-editor/page.tsx` und `app/grafik-editor/page.tsx` rendern `BuilderShell` im jeweiligen Startmodus.
**Deliverable:** beide URLs zeigen denselben Kopf + Umschalter; Wechsel ohne Neuladen.
**Pseudocode:**
```
<BuilderShell modus={startModus}>
  {modus==="grafik" ? <GrafikPanel/> : <FlussPanel/>}
  <Kopf> <Undo/><Redo/> <HilfeKnopf/> <SpeichernStatus/> <ModusUmschalter/> </Kopf>
</BuilderShell>
```

### AP-B — Bild-Inspector  *(Kern-IA, Leons „eigenes Edit-Fenster")*
- Neu `components/grafik/GrafikInspector.tsx` mit Abschnitten (`Feldgruppe`):
  1. Kopf (Thumbnail, Name, Art) 2. Position/Größe (x/y/scale/rotation/opacity, Zahl + Ziehen)
  3. Keyframes („Hier locken" + Liste) 4. Wiedergabe (nur lottie/video)
  5. **In SVG umwandeln** (Knopf + maxFarben/minFlaeche/glaettung) — nur Raster
  6. Datei (Tauschen/Ersetzen/Duplizieren/Löschen/z-Ordnung/Ausblenden/Sperren)
- Vektor-Regler aus `GrafikEditor.tsx:1531` **entfernen**, in Abschnitt 5 einsetzen.
- Bibliothek-Reiter → reiner Browser. Ebenen-Reiter → Liste; Klick öffnet Inspector.
- Alle Mutationen durch bestehende `commit()`-Undo-Logik.
**Deliverable:** Auswahl eines Bildes öffnet EIN Fenster mit allem; „In SVG umwandeln" dort sichtbar & klickbar.

### AP-C — „In SVG umwandeln" reparieren  *(hängt an AP-B)*
- Phase 0: im Browser (`tab-1`) reproduzieren, ob echter Fehler oder nur versteckt.
- Knopf immer sichtbar im Inspector (Raster). Fortschritt/Ladeanzeige an neue Stelle hängen.
- Ergebnis-SVG landet wie bisher in `public/vektor/` (Route `app/api/assets/`, unverändert).
**Deliverable:** belegter End-zu-End-Klick: Bild → SVG in Bibliothek, mit Gruppen/Pfade-Status.

### AP-D — Website-OG: auto-gelesen, anklickbar, an-Ort bearbeitbar  *(v2 ausgebaut)*

**AP-D1 · Tagging-Konvention über ALLES + Inventar** *(v3: Leon „alles taggen")*
- Konvention `data-og-id`/`-label`/`-gruppe`/`-typ` auf **jedem** bedeutsamen OG-Element, nicht nur
  Grafiken: Bilder, SVG, **Hintergründe, Text, Sektionen/Container, Deko, Knöpfe/CTA, Fluss**.
  Typ steuert das Routing (Adoption vs. Verweis vs. „Bearbeiten folgt", s. Abschnitt 0).
- Bäume: `data-vorhang-id` → auf `data-og-*` mappen.
- **Breite, aber sichere Aufgabe:** ~51 Element-Stellen allein in `app/page.tsx` plus die
  Sektions-Komponenten. Reine Daten-Attribute, keine Logikänderung → additiv und risikoarm, aber
  systematisch über den Komponentenbaum. Eigener Teil-Durchgang mit Inventar-Checkliste (Phase 0).
- OG-Register (`useWebsiteOg`) liefert **typisierte** Einträge, damit spätere Editier-Oberflächen je
  Typ andocken, ohne den Kern umzubauen (Vorwärtskompatibilität = Nordstern).

**AP-D2 · Auto-Lesen als stehende „Ist-Stand"-Ebene** *(Leons „nicht alle neu hinzufügen")*
- Neu `components/builder/useWebsiteOg.ts`: scannt beim Öffnen `[data-og-id]`, baut eine virtuelle
  Ebenengruppe „Website (Ist-Stand)" — sofort im Ebenen-Reiter sichtbar, klar getrennt von neu
  hinzugefügten Grafiken. Kein manueller Import-Knopf pro Element nötig.
- Neu `components/builder/WebsiteOgPanel.tsx`: gruppierte Liste + Vorschau, Sichtbarkeit umschalten,
  „Im Fluss-Modus bearbeiten" bei Fluss-Typ.

**AP-D3 · Direkt auf der Seite anklicken** *(Leons „anklicken und auswählen")*
- Bestehenden Klick-Listener erweitern:
```
// GrafikEditor.tsx:436 heute:  closest("[data-grafik-id]")
const el = target.closest("[data-grafik-id], [data-og-id]");
if (el.hasAttribute("data-og-id")) waehleOgAus(el.dataset.ogId);  // aus der Ist-Stand-Ebene
else waehleGrafikAus(el.dataset.grafikId);                        // bestehende Logik
```
- Trefferauflösung bei Überlappung: oberste `[data-og-id]`/`[data-grafik-id]` unter dem Zeiger
  (z-Reihenfolge respektieren). Auswahl schnappt die Position zum Klickzeitpunkt (Bäume animieren).

**AP-D4 · An-Ort-Adoption (verzögert)**
- Auswahl allein = Original bleibt stehen, schreibgeschützt markiert.
- Erste echte Änderung (ziehen/skalieren/… oder Menü-Aktion) adoptiert an-Ort: aktuelle Transform →
  bearbeitbare `Grafik`, Original via verallgemeinerter `uebernommen`-Liste ausgeblendet, Eintrag durch
  `commit()` rückgängigfähig. „Zurück an die Seite" macht es rückgängig.
- **Fluss-Typ:** keine Adoption, Verweis in den Fluss-Modus.

**Deliverable:** Beim Öffnen ist die ganze Seite als „Website (Ist-Stand)"-Ebene da; Klick aufs Objekt
auf der Seite wählt es; erste Änderung macht es bearbeitbar; `curtain.config.json` bleibt unberührt.

### AP-E — Fluss-Editor Tutorial + Hilfe  *(eigener Sonnet-5-Unteragent, hängt an AP-A)*
- Nutzt geteilte `TutorialModal`/`HilfeIcon` aus AP-A.
- Tutorial-Inhalt: Knoten = der Fluss; Klick = einloggen; Rad = Breite; benannte Verläufe
  speichern/exportieren; **„ändert nur ein Abbild, nicht die Quelle"**.
- „?"-Icons an: Knoten hinzufügen/löschen, Wellen-Atmung, Blasen, Nebel, Verläufe, Speichern/Export.
**Deliverable:** Fluss-Editor beim ersten Öffnen erklärt; „?" überall; per „? Hilfe" wiederholbar.

### AP-F — User-Journey-Feinschliff + selbstständige Features  *(hängt an B–E)*
- Empty-States mit nächstem Schritt; Ablauf-Brotkrumen (Wählen→Platzieren→Positionieren→Locken→Speichern).
- Konsistente Knopf-Hierarchie (primär/sekundär), Tastenkürzel-Spickzettel, Status-/Toast-System.
- **Zusatzfeatures — ALLE (Leon v3 „ich will alle Features"):** Mehrfachauswahl · Pfeiltasten-Nudge
  (1px / Shift 10px) · Einrasten (Viewport-Mitte / Raster / Nachbarn) · Keyframe-Zeitleiste statt Liste.
- a11y-Durchgang (Kontrast, Fokus, Screenreader-Labels) via /frontend-a11y.

### AP-G — Keyframe-Verlauf, Kopieren, Frame-spezifischer Bildtausch  *(v4, Leon)*
**G1 · Flüssiger Verlauf mit sichtbarer, editierbarer Kurve.** Heute läuft `zustandBei()`
(`grafik-types.ts`) LINEAR zwischen Keyframes. Neu:
- Pro Segment eine **kubische Bézier-Easing** (`GrafikKeyframe.easing?: [x1,y1,x2,y2]`, wirkt bis zum
  nächsten KF); `zustandBei` wendet die Kurve auf das Interpolations-`t` an. Default = weiches
  ease-in-out, damit Bewegung sofort flüssig ist.
- **Sichtbarer Kurven-Editor „wie eine Maske"**: kleines Bézier-Feld mit zwei ziehbaren Griffen im
  Inspector (After-Effects-/CSS-`cubic-bezier`-Stil), Krümmung manuell verstellbar. Live-Vorschau.
**G2 · Keyframe kopieren.** Ausgewählten KF duplizieren (Werte inkl. Easing) → an aktueller Scroll-Position
oder per Einfügen woanders setzen. Durch `commit()` rückgängigfähig.
**G3 · Frame-spezifischer Bildtausch.** `GrafikKeyframe.srcOverride?: string` — bei ausgewähltem KF das
Bild NUR an dieser Stelle tauschen. `GrafikMedium`/Layer wählt die Quelle des aktiven KF (optional
Überblendung). *Ehrlich:* ändert das Render-Modell (Bild kann mitten im Scroll wechseln) — Layer muss
Quelle je aktivem/nächstem KF bestimmen; wird isoliert getestet.

### AP-H — Asset-Bearbeitung (skalieren · spiegeln · zuschneiden · freistellen · upscalen)  *(v4, Leon)*
- **Skalieren/Grundbreite:** existiert (Transform + `breitePx`) → im Inspector bündeln.
- **Spiegeln** (horizontal/vertikal): neues Feld, via negativer Skalierung/Transform. Leicht.
- **Zuschneiden/Cutten:** Crop-Werkzeug auf dem Asset (Canvas). Mittel.
- **Freistellen („abscannen"):** Hintergrund entfernen via **`@imgly/background-removal`** (ONNX+WASM,
  im Browser, self-host). *Lizenz **AGPL** — für ein self-hosted, nicht als SaaS angebotenes Tool ok,
  aber bewusst notiert.* Schwerer (Modell-Download), eigene Phase.
- **Upscaling:** OSS vorhanden (Real-ESRGAN / Upscayl), aber **serverseitig/schwer** → optionale
  Spät-Phase, ehrlich als „größerer Brocken" markiert, nicht Tag eins.
*Hinweis:* Diese Bild-Operationen liefert Puck NICHT — es sind eigene Bibliotheken, die wir zusätzlich
einbauen. „Kommt mit dem OSS-Builder" stimmt hier nicht; ehrlich getrennt gehalten.

### AP-I — Fluss-Editor → Animations-Editor  *(v5, Leon)*
Der Fluss-Editor wird zum allgemeinen **Animations-Editor**: hier werden ASSETS animiert (nicht nur der
Fluss). Der Fluss bleibt EIN Spezial-Asset-Typ (knotenbasiert) unter vielen.
- **Assets direkt platzieren + animieren:** ein Asset (Bild/SVG/Lottie) hereinnehmen, Keyframe-Animation
  bauen (nutzt die AP-G-Easing-Kurve), Vorschau abspielen.
- **Voranimierte Assets fließen in die Grafik-Bibliothek:** ein im Animations-Editor fertig animiertes
  Asset wird als wiederverwendbarer Eintrag in der Grafik-Editor-Bibliothek verfügbar (gemeinsames
  Snapshot-Format, s. AP-J). So animiert man einmal und platziert überall.
- **Gemeinsames Animationsmodell:** Grafik-Keyframes (AP-G) und Animations-Editor teilen EINEN Kern —
  kein zweites, divergierendes Keyframe-System.
- **Fluss-Tutorial (altes AP-E) fällt hier hinein:** Tutorial + „?"-Hilfen für den Animations-Editor
  über das geteilte Hilfe-System (AP-A). Eigener Sonnet-5-Agent.
- *Reframe-Risiko ehrlich:* der Fluss ist knotenbasiert, ein Bild ist transform-basiert — der
  Animations-Editor braucht zwei Bearbeitungs-Modi unter einem Dach (Knoten-Modus / Transform-Modus),
  nicht ein erzwungenes Einheitsmodell. Wird im Machbarkeits-Spike (Phase 0) geprüft.

### AP-J — Universeller kompakter Export + HTML/weitere Formate  *(v5, Leon)*
**J1 · EIN universelles Snapshot-Format.** Der Fluss-Snapshot-Fix (selbsttragend: eingefrorene Geometrie
+ Farben) wird zum GEMEINSAMEN Vertrag für Grafik, Animation UND Fluss verallgemeinert: jeder Export
trägt ALLE nötigen Daten kompakt in sich, universell lesbar/einfügbar — nie wieder „nur Rohdaten".
Ein `components/builder/snapshot.ts` als einzige Quelle der Wahrheit.
**J2 · HTML-Export (ganze Seite ODER einzelnes Element).** Machbarkeit (recherchiert):
- Einzelnes Element → selbsttragendes HTML-Schnipsel: `<div>` + Bild/Inline-SVG + Inline-CSS-Transform.
- Scroll-Animation → **CSS Scroll-Driven Animations** (`animation-timeline: scroll()/view()`): 2026 in
  Chromium (115+) und Safari 18 unterstützt, Firefox hinter Flag → mit `@supports`-Progressive-Enhancement
  + IntersectionObserver/Polyfill-Fallback. Die Keyframe-Bewegung (transform/opacity am Scroll) mappt
  sauber auf CSS. **Ehrliche Grenze:** Partikel (Schaum/Glitzer/Nebel) sind JS/rAF-generiert → brauchen
  ein kleines JS-Runtime-Bündel, sind NICHT rein-CSS. Wird im Export klar getrennt („statischer Körper"
  vs. „mit Laufzeit-Runtime").
- Ganze Seite → statischer HTML-Export (Next `output:"export"`) + unsere Animations-Schicht (CSS + JS-Runtime).
- *Puck liefert KEIN natives HTML* (JSON-in/out) → wir bauen den HTML-Emitter (React-Baum → statisches
  Markup via `renderToStaticMarkup`/Next-Export). GrapesJS hätte es nativ — Abwägung im Puck-Spike notiert.
**J3 · Formate gesamt:** JSON-Snapshot (editierbar) · SVG (Grafik) · **HTML** (portabel/einbettbar,
Element oder Seite). Optional später: Lottie-Export für Animationen.

---

## 5. Sequenzierung & Abhängigkeiten
```
Phase 0  Browser-Repro „SVG-Umwandeln" + OG-Inventar (AP-D1) + **Puck-Spike** (0.5)  (grundiert alles)
── UNABHÄNGIGE SPUR (braucht Puck NICHT, kann sofort starten): AP-B, AP-C, AP-G, AP-H, AP-E, AP-F ──
Phase 1  AP-A  Shell — nach bestandenem Spike auf **Puck** umstellen, sonst eigener Shell (Fundament)
Phase 2  AP-B  Bild-Inspector       ⟵ braucht Primitive
Phase 3  AP-C  SVG-Umwandeln-Fix    ⟵ braucht Inspector
Phase 4  AP-D  Website-OG: D2 auto-lesen → D3 anklicken → D4 an-Ort-adoptieren ⟵ braucht Shell + Tagging + Inspector
Phase 5  AP-E  Fluss-Tutorial       ⟵ braucht Primitive   (Sonnet-5-Agent, parallel zu 2–4 möglich)
Phase 6  AP-F  Journey + Extras + a11y ⟵ braucht B–E
```

## 6. Risiken & Gegenmaßnahmen
| Risiko | Gegenmaßnahme |
|---|---|
| `GrafikEditor.tsx` ~2000 Z. | Inspector/Website-Leser in eigene Dateien; nichts anhängen |
| Dev-Server-Fragilität (.next/build) | im Execute NIE `npm run build`/`.next` löschen; nur `tsc --noEmit` + Browser |
| Fluss ist knotenbasiert, nicht Grafik | AP-D adoptiert ihn NICHT; leitet in Fluss-Modus (E4) |
| Undo muss neue Mutationen umfassen | jede neue Aktion durch `commit()` |
| Klick-Treffer bei Überlappung/beweglichen Bäumen | oberste `[data-og-id]` per z-Ordnung; Position zum Klickzeitpunkt schnappen (AP-D3) |
| `pointer-events` der Grafik-Ebene ist `none` | Seiten-Objekte haben eigene pointer-events; Fenster-Listener in Capture-Phase löst Treffer auf |
| Viele `[data-og-id]` → Scan-Kosten | einmal beim Öffnen + bei Sichtbarkeitswechsel scannen, nicht pro Frame (AP-D2) |
| „Ist-Stand" vs. neu-hinzugefügt vermischen | eigene Ebenengruppe „Website (Ist-Stand)", optisch getrennt |
| Regression an Bestand | Invarianten (Abschnitt 8) nach jeder Phase im Browser prüfen |
| `output:"export"` → nur POST-Routen | keine neue GET-Route; Muster aus `app/api/assets` |
| Nichts wegnehmen (Leon-Regel) | nur additiv/umgruppieren; alte Felder bleiben erreichbar |

## 7. Ausführungs-Routing (für /multi-execute)
| Phase | Agent | Modell | Skills |
|---|---|---|---|
| 0 | Repro/Inventar | Sonnet 5 · high | — |
| 1 AP-A | Shell + Primitive | Sonnet 5 · high | /frontend-patterns, /frontend-a11y |
| 2 AP-B | Inspector | Sonnet 5 · high | /frontend-patterns |
| 3 AP-C | SVG-Fix | Sonnet 5 · high | — |
| 4 AP-D | Website-OG (auto-lesen D2 · anklicken D3 · an-Ort-adoptieren D4) | Sonnet 5 · high | /frontend-patterns, /frontend-a11y |
| 5 AP-E | Fluss-Tutorial | **Sonnet 5 · high (eigener Agent, Leons Vorgabe)** | — |
| 6 AP-F | Journey + a11y | Sonnet 5 · high | /multi-frontend, /frontend-a11y |

> Sonnet 5 läuft IMMER auf **high**, nie low (stehende Leon-Regel). Menü-Design über **/multi-frontend**;
> Gesamt-Orchestrierung der Umsetzung via **/multi-workflow**; a11y-Durchgang **/frontend-a11y**;
> Komponenten-Muster **/frontend-patterns**.
> Verifikation nur über die Vorschau-Werkzeuge dieser Session (nicht Playwright — Chromium startet hier nicht).
> **Optische Abnahme macht ausschließlich Leon.**

## 8. Invarianten (dürfen nach KEINER Phase kaputt sein)
Bibliothek-Autoload (23 Assets) · Vektorisieren-Route · Abbild-Speichern (`abbilder/`) · Baum-Adoption ·
Keyframes · Rückgängig (Strg+Z) · Objekt-Menü · Drag&Drop · Strg+V · Fluss speichern/exportieren.
**Nicht anfassen:** `components/vektor/*`, `app/api/*` (bestehend), `next.config.mjs`, `.gitignore`,
`curtain.config.json`, `components/river/*` außer additiv fürs Tagging/Tutorial.

## 9. Entscheidungen (Leon — alle getroffen)
1. ✅ **Modus-Umschalter** im selben Overlay (kein separater URL-Merge nötig).
2. ✅ **Tagging-Umfang = ALLES** — jedes OG-Element (Bilder, SVG, Hintergründe, Text, Sektionen, Deko,
   CTA, Fluss) bekommt `data-og-*`. Grund: Nordstern Wix/Elementor-Klasse, sonst bricht die Logik später.
3. ✅ **Alle** Zusatzfeatures aus AP-F.
4. ✅ Auto-Lesen als stehende Ist-Stand-Ebene + direktes Anklicken auf der Seite (AP-D2/D3/D4).

**Eine einzige echte Entscheidung, die ich NICHT allein treffe (weil groß & schwer umkehrbar):**
5. ⚠️ **OSS-Fundament = Puck im Koexistenz-Modus** (empfohlen, Abschnitt 0.5) — bestätigst du das als
   Default? Sequenzierung ist so gebaut, dass die unabhängige Spur (Inspector, SVG-Fix, Keyframes,
   Asset-Bearbeitung, Fluss-Tutorial) **sofort startet**, während der Puck-Spike das Fundament de-riskt.
   Du wettest also nichts auf Puck, bevor es bewiesen ist.

---
## 10. KLARE LISTE — alles, was gebaut wird (Master-Checkliste)

**Fundament**
- [ ] 0.5 Puck-Spike: ein Tool als Puck-Plugin einbetten → Integrationsmodell beweisen
- [ ] AP-A Shell vereinheitlichen (Puck bei Erfolg, sonst eigener) + Modus-Umschalter Fluss⇄Grafik
- [ ] Geteilte Primitive (IconButton, HilfeIcon, TutorialModal, Tabs, Popover) + Design-Tokens

**Bild bearbeiten**
- [ ] AP-B Bild-Inspector (ein Fenster: Position/Größe · Keyframes · Wiedergabe · Vektorisieren · Datei)
- [ ] Vektor-Regler aus der Bibliothek → in den Inspector
- [ ] AP-C „In SVG umwandeln" erstklassig + funktionsfähig (Repro + Fix)
- [ ] AP-H skalieren · spiegeln · zuschneiden · freistellen (imgly, AGPL) · upscalen (spät/optional)

**Keyframes**
- [ ] AP-G1 flüssiger Verlauf: Bézier-Easing pro Segment, **sichtbare + verstellbare Kurve** („Maske")
- [ ] AP-G2 Keyframe kopieren
- [ ] AP-G3 frame-spezifischer Bildtausch (`srcOverride` pro KF)
- [ ] AP-F Keyframe-Zeitleiste statt Liste

**Seite lesen & anfassen**
- [ ] AP-D1 ALLES taggen (`data-og-*`: Bild/SVG/Hintergrund/Text/Sektion/Deko/CTA/Fluss) + Inventar
- [ ] AP-D2 Auto-Lesen als stehende „Website (Ist-Stand)"-Ebene
- [ ] AP-D3 Seiten-Objekte direkt auf der Seite anklicken + auswählen
- [ ] AP-D4 An-Ort-Adoption (erste Änderung macht bearbeitbar), „Zurück an die Seite"

**Fluss-Editor**
- [ ] AP-E vollständiges Tutorial + „?"-Hilfen (eigener Sonnet-5-Agent)

**UX / Journey / a11y**
- [ ] AP-F Empty-States, Ablauf-Brotkrumen, Knopf-Hierarchie, Toast/Status, Tastenkürzel-Spickzettel
- [ ] AP-F Mehrfachauswahl · Pfeiltasten-Nudge · Einrasten (Mitte/Raster/Nachbarn)
- [ ] a11y-Durchgang (/frontend-a11y), Menü-Design (/multi-frontend), Muster (/frontend-patterns)

**Animations-Editor (AP-I, v5)**
- [ ] Fluss-Editor → Animations-Editor (Assets direkt platzieren + animieren)
- [ ] Voranimierte Assets fließen in die Grafik-Bibliothek (gemeinsames Snapshot-Format)
- [ ] Ein geteiltes Keyframe-Modell (kein zweites System) · Knoten-Modus + Transform-Modus
- [ ] Tutorial + „?" für den Animations-Editor (eigener Sonnet-5-Agent)

**Export (AP-J, v5)**
- [ ] EIN universelles Snapshot-Format (kompakt, selbsttragend) für Grafik/Animation/Fluss
- [ ] HTML-Export: einzelnes Element (self-contained Schnipsel)
- [ ] HTML-Export: ganze Seite (Next-Export + Animations-Schicht)
- [ ] Scroll-Animation als CSS `animation-timeline` + JS-Fallback (Partikel via Runtime, ehrlich getrennt)
- [ ] Formate: JSON · SVG · HTML (später optional Lottie)

**OSS-Schichten (Roadmap R2–R5, nach dem Animations-Kern)**
- [ ] Puck als visueller Shell (nach Spike), unsere Tools als Plugins
- [ ] Decap/Sveltia als Git-Content-Backend (Grenze Inhalt↔Präsentation)
- [ ] Dashboard-Integration ins Agentic OS

**Roadmap (später, ehrlich nicht Tag eins):** Text-Inline-Edit · Hintergrund/Stil-Editor ·
Sektions-Layout + Breakpoints · CTA/Link-Editor — die „Wix-Klasse" auf dem Puck-Fundament.

---
### SESSION_ID (für /multi-execute)
- CODEX_SESSION: — (Wrapper nicht verfügbar, Fallback-Modus)
- GEMINI_SESSION: — (Wrapper nicht verfügbar, Fallback-Modus)
