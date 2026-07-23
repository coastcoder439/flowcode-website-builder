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
