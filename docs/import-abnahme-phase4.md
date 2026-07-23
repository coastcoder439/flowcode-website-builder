# Import-Abnahme Phase 4 (I9) — End-zu-End-Abnahmelauf

> **Datum:** 2026-07-23 · **Kandidat-Slug:** `wee-v3-fein` (16 Seiten) · **Messlatte:**
> `test-sites/wee-website-v3/out/` (Bens gebauter Next-Export) · **Verfahren:** dreiwertig
> (OK / FEHLGESCHLAGEN / UNGEPRÜFT), Belege selbst gemessen.
>
> **Kernurteil: OK** — die feine Import-Pipeline liefert für alle 16 Seiten sichtbaren,
> segmentierten Inhalt ohne 404, ohne Passwort-Gate, mit lebendiger Bühne. Ein
> dokumentierter Rest (einzelne Bild-Scroll-Reveals in der skriptlosen Fallback-Bühne)
> bleibt als bekannte Grenze offen. **Leons Optik-Abnahme steht noch aus** (Screenshot-Paare
> unten) — die Puck-Vorschau zerlegt die Kopf-Navigation in gestapelte Textbausteine; ob das
> so gewollt ist, ist eine Design-Entscheidung, kein technischer Defekt.

## 0 · Lauf-Rahmen

- **Reproduktions-Lauf** (deterministisch): `node scripts/import-fein.mjs --alle --kein-freeze --json`
  über die heute (2026-07-23) erzeugten, kohärenten Freeze- + Segmentierungs-Artefakte
  (`scripts/.freeze-out/`). Bewusst **kein Re-Freeze**: der Segmentier-Cache ist Hash-über-
  Outline; ein Re-Freeze könnte die Outline verschieben → gemma liefe neu → nicht mehr
  deterministisch. Die **Freeze-Qualität** ist stattdessen direkt an den Artefakten gemessen
  (§(a)). Ergebnis: **16 gespeichert, 0 fehlgeschlagen** (`scripts/.abnahme-import.json`).
- **Bühne** (`+Bühne` des Auftrags): `scripts/import-fein.mjs` schreibt die Bühne **nicht** —
  das macht separat `scripts/buehne-schreiben.mjs`. Für den Vollimport inkl. Bühne wurden
  danach alle **16 `public/import/wee-v3-fein*/buehne.html`** geschrieben (Freeze → self-
  contained, Fremdkörper-Filter, Skripte gestrippt, Assets als data:-URI).
- **`wee-website-v3` (alt) unberührt:** Zeitstempel `2026-07-22`, `git status` sauber. Der
  Umstieg der Live-Seite bleibt Leons Entscheidung.
- **Umgebung verifiziert:** Dev-Server `:3113` (HTTP 200), Ollama `:11434` mit `gemma4:latest`
  + `gemma4:12b`. Original als echte http-Origin via `scripts/.abnahme/serve-out.mjs`.

## Messlatte-Ergebnisse

### (a) 0× opacity:0-Texte — **OK**

Gemessen an drei Ebenen (jeweils direkte, nicht-ererbte Textknoten auf Text-Tags):

| Ebene | Text-Träger mit opacity:0 | Rest-opacity:0 (legitim) |
|---|---|---|
| Freeze-HTML, alle 16 Seiten (roh-Zählung) | **0** | 12 gesamt: 4× Hero-Canvas `tc-*` (live-animiert), 8× Bild-/Media-Reveal-Wrapper |
| Puck-Vorschau Startseite (gerendert, computed) | **0** | 4: 2× `nav-dropdown` (Hover-Menü), 2× `tc-*`-Canvas |
| Puck-Vorschau bildung (gerendert, computed) | **0** | 0 |
| Bühne Startseite (gerendert, computed) | **0** | 8: 2× `nav-dropdown`, 4× `tc-*`, 1× `block-stats__glow`, **1× `block-prose__media-cell`** (→ Befund M18/Freeze) |
| Bühne bildung (gerendert, computed) | **0** | 2: 2× `nav-dropdown` |

**Kein einziger Textträger** trägt in Freeze, Puck-Vorschau oder Bühne `opacity:0`. Der
M4-Defekt (34× `opacity:0` in der Roh-`out/index.html`) ist gelöst — der Freeze treibt die
Entrance-Animationen in ihren sichtbaren Endzustand. Die verbliebenen `opacity:0` sind
dekorativ (Hero-Vorhang-Canvases, die live via CSS-@keyframes animieren; Nav-Dropdowns, die
per Design bis Hover verborgen sind).

### (b) 0× 404 in Vorschau + Bühne — **OK**

- **Puck-Vorschau Startseite:** 3 CSS (200) + **8 Fonts** `/import/wee-v3-fein/*.woff2` (alle
  200) + 23 Bilder (0 gebrochen; 13 als data:-URI eingebettet, Rest kopiert). CSS-`url()`-
  Rebase (Schritt V/M7) auflösbar → 0× 404.
- **Puck-Vorschau bildung:** 3 CSS (200) + 8 Fonts (200) + 15 Bilder (0 gebrochen) → 0× 404.
- **Bühne (beide Seiten):** self-contained (Fonts/Bilder als data:-URI), **keine externen
  Asset-Requests** möglich; 0 gebrochene Bilder gemessen → 0× 404 per Konstruktion.

### (c) Importierte Seiten vs. 16 vorhandene — **OK (16/16)**

`out/` enthält 16× `index.html`; **16 Seiten importiert**, 0 fehlgeschlagen. Alle unter
`seiten/wee-v3-fein*.json`: (Start), 404, barrierefreiheit, bildung, bildung-aquaponik,
bildung-permakultur, bildung-vergleich-landwirtschaft, bildung-wissenschaft, datenschutz, faq,
impressum, organisation, organisation-grundsaetze, organisation-team, pilot-projekt,
project-oasis. Dazu 16× `buehne.html`.

### (d) Sektionen-/Baustein-Statistik vs. alt — **OK (deutlicher Feinheitsgewinn)**

| | alt `wee-website-v3` (grober Import) | grober Fallback-Adapter (16 Seiten Σ) | **fein (16 Seiten Σ)** |
|---|---|---|---|
| Root-Bausteine | 6 (5× HtmlBlock + 1× Sektion) | — | — |
| Sektionen | 1 | 32 (Ø 2/Seite) | **158 (Ø 9,9/Seite)** |
| Text-Bausteine | 0 (Text in HTML-Blobs) | 0 | **1134 (Ø 70,9/Seite)** |
| Bild-Bausteine | — | — | **201** |
| HTML-Blöcke (Rest) | 5 | 145 | 177 (Ø 11,1/Seite) |

Der M5-Defekt („alles in wenigen HTML-Blobs") ist gelöst: statt 6 groben Blöcken tragen die
neuen Seiten fein segmentierte Sektionen mit einzeln editierbaren Text-/Bild-Bausteinen.
`HtmlBlock` bleibt nur für echt nicht-abbildbares Rest-Markup.

### (e) Fremdkörper-Flags — **OK**

- **16× „Fremdkörper entfernt: Passwort-/Vorschau-Gate"** — genau 1× je Seite; das
  `.site-gate`-Passwort-Overlay (N15) ist auf allen 16 Seiten gefiltert. In der gerenderten
  Puck-Vorschau **und** Bühne: `site-gate`-Reste = **0**.
- **3× „javascript:-URL entfernt"** — `javascript:`-`href`s aus Links entschärft (benign).
- **249× „Skript entfernt"** — Next.js-Hydration-Chunks (~15/Seite); erwartet, da die
  Animationen eingefroren sind. Kein Defekt.

Sichtbar im Screenshot-Paar: Original zeigt das Passwort-Gate prominent, Puck-Vorschau/Bühne
zeigen es nicht mehr.

### (f) gemma-Modus je Seite — **OK (15 gemma / 1 deklarierter Fallback)**

15 Seiten `modus=gemma` (`gemma4:latest`). **1 Seite `barrierefreiheit` → `modus=fallback`**
(deterministische Segmentierung, im Aggregat-JSON **offen deklariert** — kein stiller
Fallback; die Regel „nie still" greift). Alle 16 Seiten `framework=next-static` korrekt
erkannt. Das Modell-Urteil ist gecacht (Determinismus: gleiche Outline → gleicher Hash →
wiederverwendet).

### (g) M18-Befund (html/body-Reset auf der Bühne) — **OK (Reset greift)**

Auf der served `buehne.html` (= das Dokument, das der Animator per iframe lädt):
`html`-margin `0px`, `body`-margin `0px`, `overflow-x: visible`, `bodyScrollWidth 1425 ≤
viewport 1440` → **kein horizontaler Overflow**, Reset-Regeln greifen. Die Plan-Hypothese
(M18 wird obsolet, sobald die Bühne die self-contained Seite ist, nicht die eingefrorene
Puck-Fassung) bestätigt sich. *Einschränkung:* verifiziert am Bühnen-Artefakt direkt, nicht
im voll aufgebauten Animator-Shell (Aktive-Seite-State + SW) — es ist dasselbe Dokument.

### (h) Screenshot-Paare — **erstellt (Leons Optik-Abnahme offen)**

Unter `scripts/.abnahme/` (1440×full-page, Chrome):

| Seite | Original (`out/`) | Puck-Vorschau | Animator-Bühne |
|---|---|---|---|
| Startseite | `original-startseite.png` | `puck-vorschau-startseite.png` | `buehne-startseite.png` |
| bildung | `original-bildung.png` | `puck-vorschau-bildung.png` | `buehne-bildung.png` |

**Orchestrator-Beobachtung (technisch, ohne Optik-Urteil):**
- **Original** (roh `out/`): Passwort-Gate oben, Seiteninhalt weitgehend **unsichtbar**
  (opacity:0 eingefroren) — der Roh-Zustand ist ungenutzt/gesperrt (M4+N15 sichtbar).
- **Bühne**: getreuer, self-contained Render der echten WEE-Seite (voller Hero „Together, WEE
  can." / „Verstehen, was uns trägt.", horizontale Nav, alle Sektionen, echte Fonts/Fotos,
  kein Gate). Der Cookie-Hinweis bleibt als echter Seiteninhalt stehen (kein Fremdkörper).
- **Puck-Vorschau**: Inhalt vollständig sichtbar, aber die Kopf-Navigation ist in einzeln
  editierbare, **vertikal gestapelte Textbausteine** zerlegt (Segmentier-Charakter). Layout
  weicht dadurch vom Original-Header ab → **Design-Frage für Leon**, kein Opacity-/404-Defekt.

## Befunde / offene Punkte

1. **Bild-Scroll-Reveals in der Fallback-Bühne (dokumentierte Grenze, nicht gefixt).**
   Wenige Media-Wrapper (`block-prose__media-cell`, `step__image`, `features-orbit__media-wrap`
   — Freeze-weit 8 Vorkommen auf 3 Seiten; Bühne-Startseite 1) bleiben `opacity:0`, weil ihr
   IntersectionObserver-getriebener Reveal beim Freeze-Scroll-Sweep nicht auslöste und die
   skriptlose Fallback-Bühne ihn nicht nachholt. **Kein Textträger** betroffen. Auf der
   voll-lebendigen SW-Ordner-Bühne (mit JS) würde er auslösen. Ein Fix gehört in
   `freeze-seite.mjs` (gezieltes Aufdecken NUR dieser Reveal-Wrapper — die `tc-*`-Canvases
   müssen `opacity:0` behalten) und erzwingt ein Re-Freeze aller Seiten → bewusst als
   **Folge-Schritt dokumentiert**, nicht als blinder <20-Zeilen-Fix ausgeführt (Risiko: Hero
   zerstören / Determinismus brechen).
2. **Puck-Vorschau-Header** (siehe (h)) — Design-Entscheidung für Leon.
3. **Interne Links zwischen Seiten** noch nicht auf die neuen Slugs umgebogen (bewusst später,
   `lens-import.md` §3-Schritt-VI) — HtmlBlöcke tragen Original-hrefs.

## Reproduktion

```
# 1. Vollimport (16 Seiten, deterministisch aus Cache):
node scripts/import-fein.mjs --alle --kein-freeze --json
# 2. Bühnen schreiben (je Seite freezeSlug→zielSlug):
for slug in <freeze-slugs>; do node scripts/buehne-schreiben.mjs --slug $slug --ziel wee-v3-fein[-$slug]; done
# Vorschau:  http://127.0.0.1:3113/editor?vorschau=wee-v3-fein
# Bühne:     http://127.0.0.1:3113/import/wee-v3-fein/buehne.html
```

---

# Phase 4b: Struktur-Treue (K3) — Deckungsgleichheits-Messung

> **Datum:** 2026-07-23 · **Anlass:** Leons Befund — das feine Mapping (Phase 4)
> zerlegt Sektionen in lose Geschwister und zerstört das Layout (Hero-Text UNTER
> statt ÜBER dem Bild, Zweispalter → Stapel). Phase 4b importiert alle 16 Seiten
> **struktur-erhaltend** neu (`--modus strukturtreu`, je Sektion EIN `StrukturBlock`
> mit Original-Markup als Layout-Träger + Marker-Injektion) und misst die Deckung
> zum gefreezten Original mit einer **harten geometrischen Messlatte**.
>
> **Kernurteil: TEILWEISE — die Struktur-Treue ist ein grosser, sichtbarer
> Fortschritt (Nav horizontal, Sektionen erhalten, Hero-Overlay strukturell
> vorhanden, 6 Seiten pixelnah), aber die 8-%-Deckungs-Messlatte wird NICHT
> erreicht: 6/16 bestehen, die Pflicht-Seite Startseite scheitert, project-oasis
> besteht.** Der Grund ist präzise diagnostiziert (unten §Root-Cause) und ist eine
> echte Mapping-Grenze, kein Mess-Artefakt.

## Re-Import (strukturtreu, überschreibe:true)

`node scripts/import-fein.mjs --alle --kein-freeze --modus strukturtreu --json` —
**16 gespeichert, 0 fehlgeschlagen**, deterministisch aus dem Freeze-/Segmentier-
Cache. Jede Seite trägt jetzt N `StrukturBlock`-Bausteine (eine je gemma-Sektion),
**0 lose Text-/Bild-Geschwister, 0 HtmlBlöcke**. Beispiel project-oasis: 12
StrukturBlöcke (vorher: 14 Sektion + 108 Text + 23 Bild + 26 Html = zerlegt).
`wee-website-v3` (Bens Original-Kandidat) blieb unberührt — nur die eigenen
`wee-v3-fein*`-Kandidaten wurden überschrieben.

## Messverfahren (`scripts/abnahme-deckung.mjs`)

Je Seite rendert Chromium (playwright-core, **Viewport-Breite 1280**) zwei Fassungen:

- **(a) Original** — das gefreezte HTML aus `scripts/.freeze-out/<slug>.html`,
  serviert über einen Mini-Static-Server, dessen Asset-Pfade (`/images`, `/_next`,
  `/curtain`, Fonts) gegen `test-sites/wee-website-v3/out/` auflösen. Das
  Passwort-Gate wird über **denselben** reinen Filter wie der Import entfernt
  (`lib/import/fremdkoerper-filter.ts`); Kontext mit `javaScriptEnabled:false` →
  keine Re-Hydration, der eingefrorene Endzustand bleibt stabil.
- **(b) Puck-Vorschau** — `/editor?vorschau=<zielSlug>` am laufenden Dev-Server.

**Metrik:** Für die **5 längsten Texte** der Seite werden in beiden Renderings die
Bounding-Boxen erfasst und je Rendering auf seine eigene Inhalts-Wurzel normiert
(x relativ zur Wurzel-Breite, y relativ zur Dokument-/Inhaltshöhe). Deckung gilt,
wenn **|Δx| < 8 % UND |Δy| < 8 %**. **Hero-spezifisch:** der Hero-Haupttext
(grösste Schrift oben) muss die Bounding-Box des Hero-Bilds ÜBERLAPPEN, wenn das
Original das tut. Eine Seite besteht bei ≥ 3 gemessenen Landmarken, **allen**
innerhalb der Schwelle und **keiner** gescheiterten Hero-Überlappung.

**Mess-Validität (Kontroll-Beleg):** Wo eine Sektion gleich liegt, matcht die
Normierung **exakt** (z. B. project-oasis durchweg Δx = 0,0000; Startseite
„Bildet den produktiven Kern" o.nx = p.nx = 0,096; „Wir träumen…" 0,3245 = 0,3245).
Die Abweichungen sind also **echte Positions-Unterschiede**, kein Normierungsfehler.
`bildung-aquaponik` besteht 5/5, obwohl es 48 % höher rendert — die y-Normierung
auf die eigene Dokumenthöhe macht die Metrik korrekt robust gegen gleichmässige
Höhenskalierung; sie schlägt nur bei **relativer** Verschiebung an.

## Ergebnis je Seite

| Seite | bestanden | Landmarken | Hero | Höhe orig→puck | Dominante Ursache bei Scheitern |
|---|---|---|---|---|---|
| **project-oasis** (Pflicht) | **JA** | 5/5 | ok | 13223→14449 (1,09) | — |
| **startseite** (Pflicht) | **nein** | 1/5 | ok | 6023→8672 (1,44) | Mehrspaltigkeit + Scroll-Komposition (s. u.) |
| faq | JA | 5/5 | ok | 2996→3213 | — |
| bildung-aquaponik | JA | 5/5 | ok | 4903→7261 | — |
| bildung-vergleich-landwirtschaft | JA | 5/5 | ok | 5738→5796 | — |
| organisation-grundsaetze | JA | 5/5 | ok | 5561→6176 | — |
| pilot-projekt | JA | 5/5 | ok | 8319→8297 | — |
| bildung | nein | 3/5 | ok | 4268→4955 | Zweispalter-Vergleich stapelt (2 LM x 0,52→0,01) |
| bildung-permakultur | nein | 4/5 | ok | 4959→6032 | 1 Kennwert-Leiste vertikal versetzt (Δy 0,31) |
| bildung-wissenschaft | nein | 4/5 | ok | 6526→7058 | 1 LM knapp über Schwelle (Δx 0,088) |
| barrierefreiheit | nein | 2/5 | n/a | 1804→1832 | **Zentrier-Container verloren** (x 0,195→0) |
| datenschutz | nein | 1/5 | n/a | 4249→4207 | **Zentrier-Container verloren** (x 0,195→0) |
| impressum | nein | 1/3 | n/a | 1622→2088 | Zentrier-Container + Adressblock stark versetzt |
| 404 | nein | 2/3 | n/a | 900→1334 | 2 dynamische Texte (Analytics/SEPA) nicht gematcht |
| organisation | nein | 1/5 | ok | 8555→11876 | Mehrspaltigkeit/Versatz (4 LM x-verschoben) |
| organisation-team | nein | 1/5 | ok | 3287→4453 | Zitat-/Social-Layout versetzt |

**Summe: 6/16 bestanden.** Messlatte (≥ 13/16) **nicht erreicht**; Pflicht:
project-oasis ✓, **Startseite ✗**. `scripts/.abnahme/deckung-protokoll.json` trägt
die Messwerte je Seite/Landmarke; Screenshot-Paare
`scripts/.abnahme/deckung-{startseite,project-oasis,bildung,faq}-{original,puck}.png`.

## Root-Cause (bewiesen, nicht vermutet)

Der `StrukturBlock`-Template ist der Klon des **kleinsten gemeinsamen Vorfahren
(LCA)** der Atome einer Segmentier-Sektion (`baueStrukturBlock`,
`lib/import/html-zu-puck.ts`). Splittet die Segmentierung eine visuelle Sektion in
mehrere Unter-Sektionen, liegt der LEDE je Block **unter** dem gemeinsamen Layout-
Vorfahren — und der geht verloren. Direkt gemessene Vorfahren-Kette einer
datenschutz-Landmarke (`__probe`, 1280 px):

```
ORIGINAL:  p(maxW 720) → div.legal__section(w 780) →
           div.container.legal__inner(maxW 820, margin 230px auto)  ← ZENTRIERUNG
           → section.legal(w 1280) → main → body      ⇒ Text bei left=250
PUCK:      p(maxW 720) → div.legal__section(w 1280) →
           div.fc-struktur-block(w 1280)              ← .container FEHLT
           → seiten-vorschau-buehne → body            ⇒ Text bei left=0
```

Der zentrierende `div.container.legal__inner` (max-width + `margin:auto`) sitzt
**oberhalb** der Segment-Grenze und fehlt im Template → der Text rutscht von einer
zentrierten 820-px-Spalte auf die volle Breite links (x 0,195 → 0). Dieselbe
Mechanik erklärt die drei Fehlerklassen:

1. **Zentrier-Container verloren** (datenschutz, barrierefreiheit, impressum,
   teils organisation): geteilte `.container`-Spalte liegt über der Segment-Grenze.
2. **Mehrspaltige Reihe stapelt** (startseite-Cards 4→2, bildung-Vergleich,
   organisation, organisation-team): der Grid-/Flex-Container einer Spaltenreihe
   liegt über der Segment-Grenze → isolierte Blöcke stapeln statt nebeneinander.
3. **Scroll-/Overlay-Komposition** (Startseite): der Kurtinen-Hero ist ein
   JS-Canvas — er zeichnet in der **statischen** Puck-Vorschau nicht (nur die
   Animator-Bühne rendert ihn); zudem überlagern sich im Original Sektionen per
   Sticky/Scroll, was beim Split in eigenständige Blöcke wegfällt → Seite 44 %
   höher, y-Positionen verschoben.

Der **Hero-Overlap-Test besteht überall** (Text liegt strukturell über dem Bild) —
der ursprüngliche Kern-Defekt (Hero-Text als Geschwister UNTER dem Bild) ist
behoben. Was fehlt, ist die feine Spalten-/Zentrier-Treue.

## Bewertung & Empfehlung (Übergabe)

Die Struktur-Treue ist gegenüber Phase 4 ein **grosser Fortschritt** und für
einspaltige Inhaltsseiten (project-oasis, faq, pilot-projekt, bildung-aquaponik,
-vergleich, organisation-grundsaetze) bereits **deckungsgleich**. Die 8-%-Messlatte
scheitert auf 10 Seiten inkl. der Pflicht-Startseite an **einer** Wurzel: die
Segmentierung splittet unter geteilten Layout-Vorfahren (Zentrier-Container,
Spalten-Grids).

**Fix-Richtung (Folge-Häppchen, bewusst NICHT in K3 ausgeführt — Mapping-Änderung
mit Regressionsrisiko für die bestehenden 6 grünen Seiten, kein „auf grün tunen"):**
den Template-Wurzel-Knoten von der LCA **aufwärts** bis zum layout-tragenden
Sektions-Vorfahren erweitern (`section`/`.container` mit max-width/Grid/Flex
einschliessen), oder gröber segmentieren (eine visuelle Sektion = ein Block statt
mehrerer Unter-Blöcke). Der JS-Canvas-Hero bleibt eine bekannte Grenze der
statischen Vorschau (er lebt auf der Animator-Bühne).

## Reproduktion (Phase 4b)

```
# 1. Strukturtreuer Re-Import (16 Seiten, deterministisch aus Cache):
node scripts/import-fein.mjs --alle --kein-freeze --modus strukturtreu --json
# 2. Deckungs-Messung (Dev-Server :3113 muss laufen; Browser-Kanal via FREEZE_KANAL):
node scripts/abnahme-deckung.mjs                 # alle 16 Seiten + 4 Screenshot-Paare
node scripts/abnahme-deckung.mjs --nur startseite # eine Seite (Debug)
# Protokoll:   scripts/.abnahme/deckung-protokoll.json
# Screenshots: scripts/.abnahme/deckung-<kurz>-{original,puck}.png
```

---

# Phase 4b — Struktur-Treue: FIX-RUNDE (K3-Nacharbeit)

> Diese Runde behebt die im Abschnitt oben dokumentierte Wurzel-Ursache. Das
> vorherige Ergebnis (10/16, Pflicht-Startseite rot) ist damit überholt.
> **Neues Ergebnis: 14/16 bestanden, `schwelleErfuellt: true`, Startseite UND
> project-oasis (beide Pflicht) grün.**

## Was war kaputt (bestätigt, nicht vermutet)

Der alte strukturtreue Weg leitete die Sektionsgrenzen aus **gemmas semantischem
Urteil** ab (`baueStrukturBlock`: LCA der verstreuten Sektions-Atome + Fremd-Atom-
Beschnitt). gemma segmentiert aber inhaltlich („Hero", „Über uns", „Features"),
**nicht DOM-strukturell** — schnitt es eine echte Zweispalten-Sektion
(`block-prose`: Fliesstext | Zitat) auf zwei Segmente, bekam jede Hälfte eine zu
tiefe LCA und wurde ein vollbreiter Block → **die Spalten stapelten** (Leons
`project-oasis`-„Das Konzept"-Befund).

Beim Rendern kamen **drei** juice-verursachte Layout-Brüche dazu (bewiesen per
Browser-Messung Original vs. Vorschau):

1. **`grid-template-columns` inline** — juice zog die Basis-Regel
   `.block-prose__inner{grid-template-columns:1fr}` als style-Attribut inline; das
   schlägt jede `@media(min-width:860px){…1.1fr .9fr}`-Überschreibung (Inline-
   Spezifität > Stylesheet). Gemessen: Original `594px 486px` (2 Spalten) vs.
   Vorschau `1120px` (1 Spalte) → Mission-Text von nx 0.05 nach 0.36.
2. **`grid-column: span 2` inline** — dieselbe Mechanik auf Item-Ebene: die 3
   CTA-Karten (`block-ctaband`) spannten je 2 Spuren und **stapelten** statt
   nebeneinander → Sektion +395 px höher (bildung, organisation-team).
3. **Marker-Text-Flattening** — die StrukturBlock-Injektion setzte immer
   `el.textContent = wert` und plättete `<h2>Unsere <span>Mission</span></h2>` zu
   einem Textknoten; dadurch änderte sich der **direkte** Textinhalt des Elements
   („Unsere " → „Unsere Mission"), was die Hero-Heuristik der Messung kippte.

## Fix (drei chirurgische Änderungen, kein „auf grün tunen")

1. **DOM-treue Sektionierung** (`lib/import/html-zu-puck.ts`,
   `htmlZuPuckStrukturtreu`): Die Sektionsgrenze kommt jetzt aus dem **echten
   Container-Baum**, nicht aus gemma. `sammleSektionsWurzeln` steigt durch reine
   Hüllen (main/body, attribut-lose Wrapper-divs) ab und emittiert jeden ersten
   echten Sektions-Container (`section`/`header`/`footer`/klassifizierter Layout-
   div) als EINEN StrukturBlock mit seinem **vollständigen** Original-Markup →
   Spalten/Overlays/Grids bleiben unversehrt. Durchstiegs-Entscheidung nur bei
   **beweisbar vertikalem Stapel** (`stapeltVertikal`, liest die von juice
   inlinierte `display`/`flex-direction`) — horizontale Anordnungen (flex-row,
   grid) bleiben als ein Block zusammen. gemma liefert nur noch das Text/Bild-
   Urteil je Atom (Marker-Platzierung), NICHT mehr die Geometrie. Der alte
   `baueStrukturBlock` + `refVon` sind entfernt.
2. **juice-`excludedProperties`** (`scripts/import-fein.mjs`): responsive Track-/
   Item-/Sizing-Eigenschaften werden NICHT mehr inline gezogen (`grid-template-*`,
   `grid-column/-row/-area`, `order`, `*-self`, `flex-direction/-flow/-wrap`,
   `columns`, `width/min-width/max-width`) — das mit-hochgeladene Stylesheet (inkl.
   `@media`) regelt sie klassen-basiert korrekt, auch nach Umzug in die Bühne.
   `display` bleibt bewusst inline (Sektionierung braucht es).
3. **Injektion bewahrt un-editiertes Markup** (`lib/import/struktur-injektion.ts`):
   `injiziereStruktur` überschreibt `textContent` NUR, wenn der Prop-Wert (space-
   normiert) vom aktuellen Marker-Inhalt abweicht (= echte Sidebar-Änderung). Un-
   editierter Text behält sein Inline-Markup (`<span class="accent">`) — Optik
   (Gradient-Akzent) und direkter Textinhalt bleiben originalgetreu.

## Messlatte strenger gemacht (Nicht-OK-Check 3b)

Die reine 5-längste-Texte-Positionsmetrik erkannte eine **Spalten-Stapelung**
nicht zuverlässig. `scripts/abnahme-deckung.mjs` prüft jetzt zusätzlich
**strukturell** (`spaltenTreue`): es sucht im Original die klarste On-Screen-
Zweispalten-Reihe (zwei Texte gleicher Zeile, nx-Abstand 0.3–0.9) und verlangt,
dass die Vorschau sie **weiterhin nebeneinander** zeigt (gleiche Zeile, erhaltener
Horizontal-Abstand). Stapeln sie, ist die Seite `GESCHEITERT`. Der Check ist live
und aussagekräftig — Beispiel-Paare aus dem Protokoll: project-oasis „Das System
im Detail" ↔ „Ziehen zum Umschauen" (Spreizung orig 0.672 / puck 0.672),
Startseite „Bildet den produktiven…" ↔ „Wissenstransfer…" (0.67 / 0.67).

## Ergebnis je Seite (Fix-Runde)

| Seite | Landmarken | Hero | Spalten | Urteil |
|---|---|---|---|---|
| **startseite** (Pflicht) | 5/5 | ok | ok | ✅ |
| **project-oasis** (Pflicht) | 5/5 | ok | ok | ✅ |
| bildung | 5/5 | ok | ok | ✅ |
| faq | 5/5 | ok | ok | ✅ |
| barrierefreiheit | 5/5 | n/a | ok | ✅ |
| bildung-aquaponik | 5/5 | ok | ok | ✅ |
| bildung-permakultur | 5/5 | ok | ok | ✅ |
| bildung-vergleich-landwirtschaft | 5/5 | ok | ok | ✅ |
| bildung-wissenschaft | 5/5 | ok | ok | ✅ |
| datenschutz | 5/5 | n/a | ok | ✅ |
| organisation | 5/5 | ok | ok | ✅ |
| organisation-grundsaetze | 5/5 | ok | ok | ✅ |
| organisation-team | 5/5 | ok | ok | ✅ |
| pilot-projekt | 5/5 | ok | ok | ✅ |
| 404 | 3/4 | n/a | ok | ❌ |
| impressum | 3/4 | n/a | ok | ❌ |

**Summe: 14/16 bestanden** (`schwelleErfuellt: true`, ≥ 13 erreicht, beide
Pflicht-Seiten grün). Alle 16 bestehen die **Spalten-Treue** und (wo vorhanden)
den **Hero-Overlap**.

### Warum 404 und impressum (noch) scheitern — ehrliche Ursache

Beides sind **kurze Rechtsseiten**, auf denen der Footer-Block
`Spenden-SEPA-Formular` unter die 5 längsten Texte fällt (auf inhaltsreichen
Seiten nie). Der Block **rendert in der Vorschau korrekt** (verifiziert:
„Spenden-SEPA-Formular IBAN: DE03 3702 0500 0020 2370 91 BIC: …"). Der Fehler ist
**kein Layout-/Struktur-Defekt**, sondern eine **Whitespace-Empfindlichkeit der
Landmarken-Textsuche** der Messung: die `direkterText`-Extraktion des Originals
liefert „…FormularIBAN:" (ohne Leerzeichen zwischen zwei angrenzenden Textknoten),
die Vorschau „…Formular IBAN:" (mit Leerzeichen) → weder Exakt- noch Teilstring-
Treffer. Beide Seiten bestehen 3/4 übrige Landmarken **und** die Spalten-Treue.
Ein Angleichen der Messungs-Textextraktion (nicht der Import-Fidelity) wäre ein
sauberes Folge-Häppchen; bewusst NICHT in dieser Runde nachgezogen, um die 14
grünen Seiten nicht durch eine Matching-Änderung zu riskieren.

## Gates (vor Abschluss, alle grün)

- `npx tsc --noEmit` → Exit 0
- `node scripts/api-roundtrip.mjs` → 51 grün, 0 rot
- `scripts/tests/*.mjs` (11 Suites, inkl. `mapping-strukturtreu`, `struktur-block`) → alle grün

## Reproduktion (Fix-Runde)

```
# 1. Strukturtreuer Re-Import aller 16 Seiten (Cache, deterministisch):
node scripts/import-fein.mjs --alle --kein-freeze
# 2. Deckungs-Messung inkl. Spalten-Treue (Dev-Server :3113 muss laufen):
node scripts/abnahme-deckung.mjs
# Protokoll:   scripts/.abnahme/deckung-protokoll.json  (Feld .spalten je Seite)
# Screenshots: scripts/.abnahme/deckung-<kurz>-{original,puck}.png
```
