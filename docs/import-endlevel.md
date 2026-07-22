<!-- Recherche-Provenienz: Multi-Agent-Workflow 2026-07-22 (4 Dimensionen, 42 Kandidaten,
6 adversarielle Lizenz-/Faehigkeits-Verdikte; 2 Verify-Agenten technisch ausgefallen — deshalb ist im Text
[verifiziert] vs. [recherchiert] unterschieden). Anlass: Leons Auftrag "nicht das Rad neu erfinden" fuer
das Import-Endlevel; Messlatte ist der reale Testfall test-sites/wee-website-v3 (Bens Next-Export). -->

# Import-Endlevel: Werkzeug-Landkarte & Pipeline-Empfehlung

> Belegstatus: Werkzeuge mit **[verifiziert]** wurden adversariell gegen Repo/npm/Lizenzdatei geprüft (Stand 2026-07-22). Mit **[recherchiert]** markierte sind gut belegt, aber nicht einzeln verify-gegengeprüft — vor produktivem Einbau kurz nachziehen. Nichts hier ist geraten.

## 1. Kernempfehlung (die konkrete Pipeline)

Das eigentliche Problem des Next.js-Testfalls ist **nicht** Scoping, sondern dreifach: (a) Inhalt liegt im gerenderten DOM, nicht im Quell-HTML; (b) positionsabhängige Selektoren (Vorfahren, Kombinatoren, nth-child) brechen, sobald ein Element aus dem React-Root in einen eigenen Baustein gelöst wird; (c) Styles teils per JS injiziert. Die Antwort ist eine **fünfstufige Pipeline: Einfrieren → Erkennen → Segmentieren → CSS je Baustein inlinen → Puck-Mapping.**

- **Einfrieren:** Erstwahl **Playwright** [recherchiert, Apache-2.0] rendert URL/Ordner headless bis zur Hydration, dann **freeze-dry** [verifiziert, Unlicense] friert das voll gerenderte DOM zu einer selbst-enthaltenen HTML — löst (a) an der Wurzel und ist lizenzrein einbettbar. Zweitwahl als opt-in „High-Quality-Import": **single-file-cli** [verifiziert, AGPL-3.0] — nur als externer CLI-Kindprozess (imgly-Präzedenz), robuster bei Fonts/cross-origin.
- **Erkennen:** Erstwahl **eigene Framework-Marker** [verifiziert-als-Ansatz, lizenzfrei] (~50 Zeilen). Zweitwahl für Breite: **enthec/webappanalyzer**-Fingerprints [recherchiert, GPL-3.0] nur als externer Prozess.
- **Segmentieren:** Erstwahl **unified/rehype + hast-util-*** [verifiziert, MIT] als HAST-Baukasten (Landmarks → Heading-Hierarchie → Textdichte). Zweitwahl/Fallback fürs flache React-Root: **Playwright-Geometrie-Pass** (getBoundingClientRect + getComputedStyle) [recherchiert].
- **CSS je Baustein:** Erstwahl **juice** [verifiziert, MIT] inlined aufgelöste Styles VOR der Zerlegung → jeder Baustein trägt seinen Look selbst und überlebt die Verschiebung. Zweitwahl **@css-inline/css-inline** [recherchiert, MIT, Rust/WASM, auch im Browser]; für JS-gestylte Teilbäume **computed-style-to-inline-style** [recherchiert, MIT] als Browser-Fallback.
- **Puck-Mapping:** Kein fertiges Tool — Eigenbau, orientiert am **GrapesJS-Parser-Muster** [recherchiert, BSD-3] und **parse5** [verifiziert, MIT] als Baumbasis.

## 2. Kandidaten-Tabelle

| Werkzeug | Schritt | Lizenz (verifiziert) | Reifegrad | Urteil |
|---|---|---|---|---|
| single-file-cli | Einfrieren | **AGPL-3.0** ✔ (LICENSE+README; kein `license`-Feld in package.json — Scanner täuschen sich) | 1,5k★, v2.0.83 Nov 2025, sehr aktiv ✔ | Stark — nur als externer Prozess |
| freeze-dry | Einfrieren | **Unlicense** ✔ (3 Quellen) | 303★, **letzter Commit 2022-09, dormant** ✔ | Stark (Fähigkeit+Lizenz), aber forken+selbst warten |
| Playwright | Einfrieren/Render | Apache-2.0 (recherchiert) | Industriestandard, MS-getragen | Fundament, direkt einbettbar |
| monolith | Asset-Inlining | CC0-1.0 (recherchiert) | 15,4k★, v2.10.1 2025 | Brauchbar, keine JS-Engine |
| eigene Marker | Erkennen | keine/Eigencode ✔ | trivial, pflegebedürftig ✔ | Stark — GPL-DB nicht kopieren |
| enthec/webappanalyzer | Erkennen (Breite) | **GPL-3.0** (recherchiert) | ~547★, aktiv | Nur externer Prozess |
| rehype + hast-util-* | Segmentieren | **MIT** ✔ (alle 6 Pakete) | 27,5 Mio DL/Mon, breit ✔ | Stark — Baukasten, kein Turnkey |
| parse5 | Parsing-Basis | **MIT** ✔ (LICENSE+8.0.1) | ~3,9k★, ~2.200 Dependents ✔ | Stark |
| linkedom/happy-dom | Selektor-Layer | ISC/MIT (recherchiert) | sehr aktiv, schon devDep | Brauchbar — kein echtes Layout |
| Mozilla Readability | (Anti-Kandidat) | Apache-2.0 (recherchiert) | 11k★, top | Schwach — kollabiert auf 1 Blob |
| GrapesJS-Parser | Puck-Mapping-Muster | BSD-3 (recherchiert) | 26k★, v0.23.2 2026 | Stark als Referenz |
| html-to-figma (Technik) | Render-Extraktion | MIT (recherchiert) | archiviert, Code da | Brauchbar — Technik, nicht Output |
| juice | CSS inlinen | **MIT** ✔ (3 Quellen) | 3,3k★, 2,9 Mio DL/Wo, v12.1.1 2026 ✔ | Stark |
| @css-inline/css-inline | CSS inlinen | MIT (recherchiert) | ~340k DL/Wo, v0.21 2026 | Brauchbar (nimm das `@`-Paket) |
| computed-style-to-inline-style | CSS (Fallback) | MIT (recherchiert) | klein/stabil | Brauchbar — verbose, nur Browser |
| PurgeCSS | CSS-Reduktion | MIT (recherchiert) | 8k★, v8 2026 | Brauchbar |
| PostCSS (+postcss-url) | CSS-Substrat | MIT (recherchiert) | Industriestandard | Stark — :root→:scope, url()-Rebase |
| CSS @scope (nativ) | Isolation | Web-Standard | **cross-browser Baseline seit Dez 2025** | Stark — Chromium-Hinweis veraltet |
| Webstudio / Plasmic | (Referenz) | AGPL/proprietär (recherchiert) | aktiv | Nur Architektur-Blaupause |
| nodeSavePageWE / obelisk / percollate | Einfrieren | GPL-2.0 / MIT / MIT | veraltet bzw. falscher Typ | Schwach–ungeeignet |

## 3. Lizenz-Ampel fürs Whitelabel

**🟢 Direkt einbaubar (permissiv):** freeze-dry (Unlicense/Public Domain), Playwright (Apache), monolith (CC0), rehype + alle hast-util-* (MIT), parse5 (MIT), juice (MIT), css-inline (MIT), computed-style-to-inline-style (MIT), PurgeCSS/PostCSS (MIT), GrapesJS-Parser (BSD-3), linkedom/happy-dom (ISC/MIT), eigene Marker (kein Fremdcode). Das ist der komplette Default-Stack — **kein Copyleft im Produktkern.**

**🟡 Nur als optionaler externer Prozess (Prozessgrenze, imgly-Präzedenz):** single-file-cli (AGPL-3.0) als High-Fidelity-CLI-Aufruf; enthec/webappanalyzer-Fingerprints (GPL-3.0) als Erkennungs-Microservice, falls Breite über die Eigen-Marker hinaus nötig wird. Beides **nicht** ins Produkt linken.

**🔴 Raus:** Webstudio (AGPL + proprietäres EULA-Paket, konsumiert ohnehin nur Webflow-Clipboard), Plasmic-Import (AGPL/serverseitig), nodeSavePageWE (GPL-2.0, von SingleFile dominiert), Save Page WE (kein CLI), wombat/webrecorder (AGPL, falscher Zweck), unfluff (kein Lizenzfeld). Readability/article-extractor/Postlight fachlich raus (Single-Blob-Kollaps zerstört genau die Sektionen).

## 4. Was wir TROTZDEM selbst bauen müssen (ehrlich)

Es gibt **kein** erprobtes Turnkey-Tool für framework-bewusste Sektions-Segmentierung. Der VIPS-/Visual-Segmentation-Zweig existiert im JS-Ökosystem nur als akademischer Prototyp (11–55★, LGPL, Java/Python) — nur als Algorithmus-Referenz lesen, nie bundeln. Konkret Eigenbau:

- **Die Segmentier-Heuristik selbst:** rehype liefert Baum + Signale (Heading-Rank, Landmarks, Textdichte), aber die Grenz-Logik „wann beginnt eine neue Sektion" schreiben wir. Für das flache React-Root ohne semantische Tags braucht es zusätzlich den Playwright-Geometrie-Pass (Abstands-Schwellen, Full-Bleed-/Hintergrundwechsel-Erkennung) — Cluster-Schwellen sind Eigenbau.
- **Das Puck-Mapping** (HAST/Komponentenbaum → SektionBlock/TextBlock/BildBlock/HtmlBlock): kein Fremdtool nimmt uns das ab; GrapesJS zeigt nur das Muster (Parser → custom component types).
- **Framework-Pfade:** Erkennung steuert Strategie. Wichtig aus Verify: „deterministisch" gilt nicht durchgehend. Next.js **App Router** (Default seit 13) emittiert `#__next`/`#__NEXT_DATA__` **nicht** — versionsstabiler Anker ist `/_next/static/`. Remix-Marker nur v1/v2 (in React Router v7 aufgegangen), Vue `data-v-*` schwach, Astro `astro-island` nur bei hydratisierten Islands. Marker-Set muss gepflegt werden.
- **Anerkannte Grenzen:** Quell-JS-Animationen kommen konzeptbedingt nicht mit (gewollt — eigener Animator). computed-style-Inlining friert Responsivität auf einen Viewport ein → selektiv einsetzen. freeze-dry ist **seit 2022 dormant**: forken/vendoren, Bugfixes und Browser-Kompatibilität selbst tragen, keine Upstream-Updates erwarten.

## 5. Konkreter Umbauplan (`lib/import/*`) in 4 Häppchen

**Häppchen 1 — Render-Frontend vor den DOMParser setzen.** Neuer Schritt `lib/import/freeze/` mit Playwright-Render + freeze-dry (im page-Kontext via `page.evaluate`). Ersetzt für den URL-Pfad den fragilen `fetch(index.html)`-Vorschritt; für Ordner-Import bleibt Direkt-HTML möglich, wenn Inhalt schon serverseitig da ist. Ergebnis: eine materialisierte HTML ohne mysteriösen Einzel-React-Root → die bestehende Toplevel-Zerlegung greift wieder.

**Häppchen 2 — Style-Inlining vor der Zerlegung.** Neuer Schritt `lib/import/inline-styles/` mit juice (Node) bzw. @css-inline (Browser-Importer), der aufgelöste Stylesheet-Regeln auf die Elemente inlined, BEVOR Bausteine getrennt werden. Das ersetzt das Ganz-Sheet-@scope-Wrappen als Fidelity-Mechanismus; @scope bleibt nur für den Rest (@media/:hover/@keyframes/@font-face).

**Häppchen 3 — Segmentierung auf rehype/parse5 umstellen.** Eigenbau-DOMParser-Baum in `lib/import/` durch parse5/rehype-parse ersetzen, darauf hast-util-select (Landmarks), hast-util-heading-rank (Hierarchie), hast-util-to-text (Textdichte). Playwright-Geometrie als Fallback-Modul für tag-arme Roots.

**Häppchen 4 — CSS-Reparatur + Scoping härten.** In `SeitenStyles.tsx`: das `:root`→`:scope`-Ersetzen von Regex (`/:root/g`, bricht bei `:root` in Strings/url) auf PostCSS-AST umstellen; `url()`-Rebasing/Data-URI via postcss-url gegen die Original-Basis (behebt fehlende Fonts/Bilder). Rest-Sheets mit PurgeCSS reduzieren. **Doku-Korrektur:** Der „Chromium/Chrome-Edge empfohlen"-Hinweis zu @scope ist überholt — @scope ist seit Dez 2025 cross-browser Baseline (Firefox 146, Chrome 118+, Safari 17.4+); Fallback für alte Feld-Browser darf bleiben, die UI-Warnung sollte entschärft werden.

## 6. Offene Fragen / Risiken

- **freeze-dry-Wartung:** dormant seit 2022 — bricht es an modernen CSP-/cross-origin-Frame-/Font-Fällen? Vor Festlegung an einer echten Bens-Seite + am Next.js-Export gegen single-file-cli-Output benchmarken. Fork-/Vendoring-Aufwand als eigene Wartungslast einplanen.
- **Playwright im Produkt:** eigene Browser-Binaries (~Hunderte MB), Latenz pro Import, Betrieb im self-hosted Whitelabel — akzeptabel? Für reinen statischen Ordner-Import ggf. browserlos (monolith/parse5) fahren und Render nur bei erkanntem SPA erzwingen.
- **juice-Grenze:** sieht nur Stylesheet-Regeln, **nicht** JS-berechnete/CSS-in-JS-Styles. Für Next.js-CSS-in-JS-Teilbäume ist der computed-style-Fallback nötig → Heuristik „wann statisch, wann computed" definieren.
- **@css-inline-Paketfalle:** das unscoped `css-inline` auf npm ist tot (0.11.2, 2023) — zwingend `@css-inline/css-inline` verwenden.
- **enthec-GPL:** falls Erkennungs-Breite gebraucht wird, Prozessgrenze wasserdicht halten (kein Linken, kein Datenbank-Copy in den Kern) — sonst Copyleft-Durchgriff aufs Produkt.
- **Nicht verifiziert:** Playwright, GrapesJS, PostCSS/PurgeCSS, css-inline, monolith, computed-style-to-inline-style, enthec sind recherchiert, aber nicht verify-gegengeprüft. Lizenz + letzter Release je vor Einbau final bestätigen.