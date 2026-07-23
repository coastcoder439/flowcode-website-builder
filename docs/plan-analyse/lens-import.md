I have verified all the evidence I need. Here is my analysis.

---

# Analyse — Lens: Import-Endlevel-Pipeline (Station 1), HYBRID-Spec

Belege sind selbst verifiziert (Read/Grep gegen den echten Testfall `test-sites/wee-website-v3/out/`). Defekt-IDs dieser Lens: **M3, M4, M5, M6, M7, M8, M9, N1, N15, M18**.

## 1 · Ist-Befund (mit selbst geprüften Belegen)

**Der heutige Import ist ein rein deterministischer DOMParser-Adapter ohne Freeze, ohne Modell, ohne Unterseiten, ohne Framework-Bewusstsein.** Konkret:

- **Kein Einfrieren → opacity:0 wird eingefroren (M4).** `SeitenImport.tsx:149` liest die rohe Datei (`dateien.get(gewaehlteDatei)!.text()`) und gibt sie direkt an `htmlZuPuck`. Im echten Testfall stehen **34× `opacity:0`** in `out/index.html` (selbst gezählt) — Bens Entrance-Animationen sind im Roh-HTML mit `opacity:0` fixiert. Der Import übernimmt genau diesen unsichtbaren Zustand. Es gibt keinen `scripts/freeze-*.mjs`.
- **Zerlegung viel zu grob (M5).** `lib/import/html-zu-puck.ts:352-404` (`mappeKinder`) mappt **nur EINE Ebene**: verschachtelte Container fallen in `htmlBlock` (Zeile 399-402), das den **kompletten Subtree** als `outerHTML` in EINEN `HtmlBlock` presst (`htmlBlock`, Zeile 336-348). Bei Bens Next-Build wird der anonyme Wrapper aufgelöst (`istAnonymerWrapper`, Zeile 421-428), sodass `header/main/footer` je EIN Riesen-HtmlBlock werden — praktisch der gesamte Inhalt in 2-3 Roh-Markup-Blöcken. Das ist die Ursache von „alles in einem HTML-Block, sehr random verteilt". Es gibt **keinen** Modell-Aufruf; kein `scripts/segmentiere-*.mjs`.
- **Unterseiten fehlen (M6).** `listeHtmlDateien` (`ordner-import.ts:76-85`) listet zwar alle HTMLs, aber die UI importiert per Radio-Button **genau EINE** (`SeitenImport.tsx:250-269`, `gewaehlteDatei`). Im Testfall existieren **16 `index.html`** unter `out/` (selbst gezählt: `bildung/`, `faq/`, `impressum/`, `datenschutz/`, `bildung/aquaponik/` …). Nur eine landet in Puck.
- **Asset-404 (M7).** Bild-`src` und Inline-`url()` werden erfasst (`registriereHtmlBilder`, Zeile 317-333), aber **`url()`-Verweise INNERHALB der kopierten CSS-Dateien** (Fonts, Hintergründe, `/_next/static/media/…`) werden nicht rebased/kopiert — `ordner-import.ts:202,255-259` gesteht das selbst ein als Flag `FLAG_CSS_URL` „CSS-Verweise … bleiben unaufgelöst". Also 404 bei Schriften/CSS-Bildern.
- **Fremdkörper Passwort-Gate (N15).** `out/index.html` enthält im Body ein echtes React-Formular `<div class="site-gate" role="dialog"><form class="site-gate__panel">…„Diese Seite ist geschützt … Passwort … Freischalten"</form></div>` (selbst extrahiert, **1× `site-gate__panel`**, direkt vor dem `<script src="/_next/…">`). Es steht in Bens eigenem Markup (kein Vercel-Header-Inject) → landet heute ungefiltert in einem HtmlBlock und würde mitexportiert.
- **Kein Framework-Bewusstsein.** Marker sind vorhanden und stabil: **19× `/_next/static/`** in `out/index.html`. `SeitenImport.tsx:57-63` (`hatNextStruktur`) nutzt nur `_next/` als An-/Aus-Schalter für „Styles übernehmen" — keine Strategie-Steuerung.
- **Keine lebendige Bühne im Import (M8/M18).** Der „lebendige" Pfad existiert bereits separat: `components/backdrop/ordner-serve.ts` serviert einen Ordner über **Service Worker** (`swRegistrieren`, `ordnerBereitstellen`, `ordnerInCacheLaden`, Zeile 184-210) — das ist der Modus, der die echte Seite MIT ihren Animationen zeigt. Der Import ist damit heute **nicht** gekoppelt; die eingefrorene Puck-Version wird fälschlich als Bühne behandelt. M18 (html/body-Reset greift auf der Bühne nicht) ist ein Symptom desselben Bruchs.
- **Kein Hilfe-Icon (N1).** `SeitenImport.tsx:215-228` hat im `seiten-kopf` nur den „Zurück"-Button, kein „?"-Icon (die Seiten-Liste hat eins) — bestätigt.
- **M9 (Falsch-Ordner-Meldung) teils vorhanden.** `SeitenImport.tsx:111-114` meldet „keine HTML-Datei gefunden" — aber undifferenziert. Ein **ungebautes Next-Quellprojekt** (nur `app/`, kein `out/`) trifft denselben Zweig ohne den nötigen „erst bauen"-Hinweis.

**Was gut ist und bleibt:** Die reine/immutable Trennung (Adapter rein, `ordner-import.ts` unrein) ist sauber und muss erhalten bleiben. `ersetzeBildQuellen` (Zeile 597-622, Ein-Durchgang-Alternation, längste Pfade zuerst) ist solide und wird weiterverwendet. `SeitenDatei` trägt bereits `styles` **und** `anim` (verifiziert: `speichere/route.ts:26-35` mit `pruefeStyles`/`pruefeAnim`) — die Zielfelder für 5a/6 existieren schon. Der Server-Endpoint `/api/import/asset` deckt Bilder **und** `.css` mit enger Endung↔MIME-Kopplung ab (`route.ts:48-60`).

## 2 · Ziel-Architektur (diese Lens)

Fünfstufige Pipeline (import-endlevel.md §1, editor-vereinheitlichung.md §11), **Skripte mechanisch · gemma4 urteilt**:

```
out/**/index.html
  └─(A) FREEZE   scripts/freeze-seite.mjs   Playwright-Render → Scroll-Sweep →
  │              getAnimations().finish() → sichtbarer End-DOM (freeze-dry-Fassung)
  │              → materialisierte, self-contained HTML je Seite   [löst M4]
  └─(B) ERKENNEN eigene Framework-Marker (/_next/static/)          [Strategie]
  └─(C) CSS-JE-BAUSTEIN  juice inlined aufgelöste Regeln VOR der Zerlegung;
  │              PostCSS für :root→:scope + url()-Rebase/Kopie      [löst M7]
  └─(D) SEGMENT  scripts/segmentiere-gemma.mjs  kompakte DOM-Outline → gemma4
  │              (JSON) → Sektionsgrenzen + Block-Typen + Titel     [löst M5]
  │              Fremdkörper-Filter (.site-gate u.a.) VOR gemma     [löst N15]
  └─(E) PUCK-MAP eigenes Mapping HAST/DOM → Sektion/Text/Bild/Html  [löst M5]
           ↓ pro Seite eine seiten/<slug>.json (+ Unterseiten)      [löst M6]
```

Zwei Schienen, EIN Adapterkern:
- **Bühne = lebendige Seite (M8/M18):** Der Animator lädt weiter die aktive Seite über den **bestehenden Backdrop-SW-Ordnermodus** (`ordner-serve.ts`) — die echte, animierte Seite. Die eingefrorene Fassung ist **ausschließlich** Segmentier-Input, nie Bühne. Damit werden die `html/body`-Reset-Regeln auf der Bühne wieder wirksam (M18 fällt weg, wie in der Mängelliste vermutet — zu verifizieren im Abnahme-Schritt).
- **Puck-Inhalt = segmentierte Endzustand-Kopie:** feine Bausteine für den Bau, nicht die Bühne.

Der reine Adapter `html-zu-puck.ts` bleibt der deterministische **Fallback- und Mapping-Kern**; gemma4 liefert nur die **Grenz-/Typ-Urteile**, die der Adapter dann mechanisch in Puck-Data gießt. So bleibt „gleiche Eingabe → gleiche Ausgabe" gewahrt, sobald das Modell-Urteil vorliegt (Urteil wird mitgespeichert/cachebar).

## 3 · Geordnete Umsetzungsschritte (reviewbare Häppchen)

**Schritt I — Freeze-Skript (Station-1-Fundament, M4).**
Dateien: neu `scripts/freeze-seite.mjs`, neu `scripts/lib/static-server.mjs` (Mini-Static-Server für `out/`), `package.json` (devDep `playwright` + Chromium; `npm install` erlaubt, `npm run build` bleibt verboten).
Inhalt: Static-Server über `out/` → Playwright rendert eine Seite → wartet Hydration (`/_next/static/`-Idle) → Scroll-Sweep (Entrance/Lazy triggern) → `document.getAnimations().forEach(a=>a.finish())` → End-DOM abgreifen (freeze-dry falls tragfähig, sonst dokumentierter Eigen-Abgriff via `documentElement.outerHTML` nach Inline-Style-Fixierung).
Deliverable: `freeze-seite.mjs --seite bildung` gibt eine self-contained HTML aus, in der **kein `opacity:0`** an Textträgern mehr steht (Vergleich gegen die 34 Roh-Treffer). Reviewbar isoliert, kein Eingriff in den Adapter.

**Schritt II — Fremdkörper- & Framework-Filter (N15, B).**
Dateien: neu `lib/import/fremdkoerper-filter.ts` (rein), Einbindung in `html-zu-puck.ts` vor `mappeKinder`.
Inhalt: entfernt+flaggt bekannte Hosting-/Gate-Artefakte per konservativer Selektor-Liste (`.site-gate`, `[role=dialog][aria-label*=Passwort]`, Vercel-Preview-Marker), dokumentiert und deterministisch. Framework-Marker-Erkennung (`/_next/static/`) als `erkenntFramework(html)` → steuert später die Strategie.
Deliverable: importierte Seite enthält **keinen** `site-gate__panel`-Block mehr; Filter erscheint als Flag „Fremdkörper entfernt: Passwort-Gate" im Bericht. Unit-testbar gegen die echte `out/index.html`.

**Schritt III — gemma4-Segmentierung (M5, Kernstück D).**
Dateien: neu `scripts/segmentiere-gemma.mjs`, neu `lib/import/dom-outline.ts` (kompakte Outline-Bildung, rein), neu `lib/import/gemma-contract.ts` (Typen + Validierung).
Contract (Input→Output, s. §3-Detail unten). Skript ruft `http://127.0.0.1:11434` (gemma4, `format: json`), validiert, bis 2 Retries mit Fehler-Feedback, sonst deklarierter deterministischer Fallback.
Deliverable: für `out/index.html` eine `segmentierung.json` mit **feinen** Sektionen (Hero, Mission, Stats, CTA, Footer …) statt 3 Grobblöcken; Validierungslog „alle N Knoten abgedeckt, Reihenfolge dokumenttreu".

**Schritt IV — Puck-Mapping aus dem Modell-Urteil (M5/E).**
Dateien: `lib/import/html-zu-puck.ts` (neuer Pfad `htmlZuPuckMitSegmentierung(html, segmentierung, opts)`), bestehende `htmlZuPuck` bleibt als deterministischer Fallback.
Inhalt: statt der Ein-Ebenen-`mappeKinder`-Grobheuristik werden die gemma-Grenzen zu `SektionBlock` mit feinen `TextBlock`/`BildBlock`/`HtmlBlock`-Kindern; `HtmlBlock` nur noch für echt nicht-abbildbares Rest-Markup (nicht mehr für ganze `header/main`). CSS-je-Baustein (juice) VOR dem Mapping, sodass jeder Block seinen Look selbst trägt.
Deliverable: Puck-Baum mit vielen kleinen, visuell editierbaren Bausteinen; `statistik.htmlBloecke` sinkt drastisch, `sektionen/texte/bilder` steigen. Screenshot-Paar Original vs. Puck-Render deckungsgleich.

**Schritt V — CSS-`url()`-Reparatur (M7 Rest, C).**
Dateien: `lib/import/ordner-import.ts` (`uebernimmStyles`), neu `lib/import/css-rewrite.ts` (PostCSS), `app/api/import/asset/route.ts` (falls Font-/Medien-Endungen fehlen — prüfen; `BILD_ENDUNGEN` deckt `woff` NICHT ab → erweitern auf Font-MIME).
Inhalt: `url()`-Pfade in kopierten CSS-Dateien auflösen, referenzierte Fonts/Bilder mitkopieren nach `public/import/<slug>/`, Pfade rebasen; `:root`→`:scope` per AST (nicht Regex — bestehende Regex-Grenze in `SeitenStyles.tsx` ist der bekannte Bug).
Deliverable: **0× 404** im Netz-Scan der importierten Seite (Fonts sichtbar). Neues Flag entfällt oder wird zu „N Font/Medien-Assets mitkopiert".

**Schritt VI — Unterseiten-Crawl (M6).**
Dateien: `SeitenImport.tsx` (Mehrfachauswahl statt Einzel-Radio: Startseite Pflicht, Unterseiten Checkbox-wählbar), `scripts/import-ben.mjs` (Schleife über `out/**/index.html`), Slug-Vergabe `<slug>` + `<slug>-<unterpfad>`.
Inhalt: alle gewählten `out/**/index.html` durch die Pipeline; je Seite eine `seiten/<slug>.json`; interne Links optional auf die importierten Slugs umbiegen (nachgeordnet).
Deliverable: nach Import liegen im Seiten-Bereich Startseite + gewählte Unterseiten (Testfall: bis zu 16).

**Schritt VII — Station-1-UI-Feinschliff (N1, M9) + Design (R5-Kopplung).**
Dateien: `SeitenImport.tsx`, zugehöriges CSS.
Inhalt: „?"-Hilfe-Icon in `seiten-kopf` (konsistent zur Liste, N1); differenzierte Meldung „Ordner enthält Next-Quellcode, aber kein gebautes `out/` — erst `npm run build`" (M9); Bericht-Panel auf WEE-Designsystem (hell/sand) umstellen — Detailschnitt gehört zur Design-Lens, hier nur die Struktur-Hooks.
Deliverable: Import-Subview mit Hilfe, klarer Fehlmeldung, WEE-konformem Bericht.

**Schritt VIII — Abnahme (6d).**
Verify-Agent nach `verifikations-protokoll.md`: Screenshot-Paar Original vs. Bühne, opacity-Stichproben, 404-Netzscan, Unterseiten-Liste, `rt-bleibt`-Preset entfernt-Check; danach eigener End-to-End-Blick des Orchestrators.

### gemma4-Contract (Schritt III, Detail)

- **Input (nie Roh-HTML):** kompakte Outline-Liste je Knoten `{ ref, tag, klassenHinweis, textDichte, tiefe, bbox:{y,h,vollBreite}, hatBild }`. `bbox`/`vollBreite` kommen aus dem Freeze-Pass (Geometrie), `textDichte` aus `hast-util-to-text`-Analogon. Fremdkörper (Schritt II) sind vorab entfernt.
- **Output (`format: json`):** `{ sektionen: [{ titel, vonRef, bisRef, bloecke: [{ ref, typ: "text"|"bild"|"html" }] }] }`.
- **Validierung (Skript, mechanisch):** jede `ref` genau einmal abgedeckt; Reihenfolge = Dokumentreihenfolge; `typ` konsistent zum Tag (kein `<img>`→text); keine überlappenden Bereiche. Bei Formfehler: bis **2 Retries** mit angehängtem konkretem Fehlertext.
- **Fallback bei Ollama down / 2× Formfehler:** deterministische Segmentierung (verbesserte Grenz-Heuristik: Landmarks → Heading-Rang → Geometrie-Abstandsschwellen/Full-Bleed-Wechsel) — **im Bericht klar deklariert** als „Modell nicht erreichbar — deterministischer Fallback-Modus". Nie stiller Fallback.
- **Determinismus:** das Modell-Urteil (`segmentierung.json`) wird neben der Seite abgelegt/gecacht; erneuter Import mit vorliegendem Urteil ist wieder rein.

### Re-Import-Verhalten (Idempotenz)

- Slug ist stabil (Ordnername/Seitenname). Re-Import derselben Seite = **Überschreiben mit Bestätigung**, nicht zweite Seite: heute widersprüchlich — `import-ben.mjs:237` nutzt `ueberschreibe:true`, `SeitenImport.tsx:199` wirft 409. Vereinheitlichen auf: UI zeigt bei existierendem Slug „Seite existiert — überschreiben?" (statt hartem 409), nutzt dann `ueberschreibe:true` + `erwartetGespeichert` (Konfliktschutz der Flow-Lens).
- **Asset-Aufräumung:** vor dem Neuschreiben `public/import/<slug>/` leeren (sonst Waisen aus dem Vorlauf). Neuer optionaler Endpoint-Zweig oder Server-seitiges „ersetze Ordner" — mit Flow-/Undo-Lens abstimmen (Löschen muss umkehrbar bleiben, R1).
- Gleiche Quelle + gleiches Modell-Urteil → gleiche `seiten/<slug>.json` (bis auf Freeze-Zeitstempel, den wir aus der Data heraushalten).

## 4 · Risiken + Mitigationen

- **Playwright im self-hosted Produkt (Binaries ~Hunderte MB, Latenz).** Mitigation: Freeze läuft primär als **Node-Skript/dev-API**, nicht im Browser-UI-Pfad. Der UI-Ordner-Import (File System Access) kann kein Playwright fahren → siehe offene Frage. Für reinen statischen Ordner ohne SPA-Marker Render überspringen (Direkt-HTML).
- **freeze-dry ist seit 2022 dormant** (import-endlevel.md §6). Mitigation: an Bens echter Seite gegen `single-file-cli`-Output benchmarken; Eigen-Abgriff (`getAnimations().finish()` + `outerHTML`) als tragfähige Rückfallbasis einplanen; freeze-dry forken/vendoren, nicht als Live-Dep erwarten.
- **gemma4-Urteil instabil/halluziniert Grenzen.** Mitigation: harte mechanische Validierung (Abdeckung/Reihenfolge), 2 Retries, deklarierter deterministischer Fallback; Urteil ist Vorschlag, das Mapping bleibt mechanisch.
- **juice sieht nur Stylesheet-Regeln, keine CSS-in-JS/JS-berechneten Styles** (import-endlevel.md §6). Mitigation: für CSS-in-JS-Teilbäume `computed-style`-Fallback selektiv; Heuristik „statisch vs. computed" definieren; da Freeze bereits den gerenderten Endzustand liefert, ist der Bedarf kleiner.
- **`site-gate`-Filter zu aggressiv/zu lasch (N15).** Mitigation: konservative, benannte Selektor-Liste + Bericht-Flag; nie generisches „dialog entfernen".
- **AGPL-Copyleft** (single-file-cli, webappanalyzer). Mitigation: strikt externer Kindprozess/Prozessgrenze, nie in den Produktkern linken (import-endlevel.md §3).
- **Model-Tag „gemma4" verifizieren:** Ollama-Tag vor Einbau bestätigen (`ollama list`) — der Contract ist modellagnostisch, nur der Tag ist zu prüfen.

## 5 · Abhängigkeiten zu den anderen Lenses

- **Preview/Export (M25):** Der Ordner-Struktur-Export muss die importierten `styles[]` + `anim` **round-trippen** — die 5a-CSS-Kopien unter `public/import/<slug>/` und die url()-Rebases von Schritt V müssen im Export-Ordner konsistent landen. Gemeinsame Wahrheit ist die Bühne-Render-Grundlage (M23 = Export-Wahrheit). Enge Kopplung.
- **Flow/Undo (R1, N2, N17/N18):** Re-Import-Überschreiben + Asset-Aufräumung müssen umkehrbar/konfliktsicher sein (die Flow-Lens besitzt `erwartetGespeichert`/Papierkorb). Der 308-Doppelaufruf (N17) und das Wiederbeleben (N18) betreffen die Seiten-API, die der Import mitnutzt.
- **Import→Animator-Bühne (M8):** Die „lebendige Bühne" ist der bestehende Backdrop-SW-Ordnermodus (`ordner-serve.ts`) — gehört der Flow/Preview-Lens. Diese Lens liefert nur die eingefrorene Segmentier-Kopie und die aktive-Seiten-Verknüpfung; die Bühnen-Darstellung selbst nicht.
- **Design (R5, N1):** Bericht-UI, Hilfe-Icon, Fehlmeldungen folgen dem WEE-Designsystem — Optikschnitt bei der Design-Lens.
- **Flow (R3/R4):** Import ist **Station 1** und Startansicht (M1); die Menü-Einordnung des Import-Assistenten in den Vier-Stationen-Flow gehört der Flow-Lens.

## 6 · Offene Fragen (nur echt unentscheidbar)

1. **Bekommt der UI-Ordner-Import (File System Access im Browser) den Freeze-Vorteil, oder nur der Node-Skript-Pfad?** Playwright läuft nicht im Browser-Client. Optionen: (a) Freeze nur im Skript/`import-ben`, UI-Import bleibt „roh + Fallback-Segmentierung" (schlechteres Ergebnis im UI); (b) neue dev-only-API-Route `POST /api/import/freeze`, die serverseitig Playwright fährt, und der UI-Client ruft sie — verlagert das SPA-Freeze auf den Server, bindet aber Playwright an den laufenden Dev-Server. Diese Weiche bestimmt, ob Leon im UI dieselbe Qualität wie im Skript bekommt — entscheidungsbedürftig durch Leon, weil sie den Produktbetrieb (self-hosted) berührt.

## 7 · Abgedeckte Defekt-IDs (Coverage)

**M3** (richtige/komplette Seite — Summe aus M4/M5/M6/M7/N15), **M4** (Freeze End-Zustand, Schritt I), **M5** (gemma4-Feinsegmentierung, Schritte III+IV), **M6** (Unterseiten-Crawl, Schritt VI), **M7** (Assets inkl. CSS-url()/Fonts, Schritt V), **M8** (lebendige Bühne via bestehendem SW-Modus, Ziel-Arch §2 — Kopplung, Umsetzung mit Flow/Preview-Lens), **M9** („erst bauen"-Meldung, Schritt VII), **N1** (Hilfe-Icon Import-Subview, Schritt VII), **N15** (Fremdkörper/Passwort-Gate-Filter, Schritt II), **M18** (html/body-Reset — wird durch M8 voraussichtlich obsolet, Verifikation in Schritt VIII).

Relevante Dateien (absolut): `C:/Users/Lonsinator/Flowcode-Agentic-OS/user-projects/flowcode-website-builder/lib/import/html-zu-puck.ts`, `.../lib/import/ordner-import.ts`, `.../app/editor/SeitenImport.tsx`, `.../scripts/import-ben.mjs`, `.../app/api/import/asset/route.ts`, `.../app/api/puck-seite/speichere/route.ts`, `.../components/backdrop/ordner-serve.ts`, `.../test-sites/wee-website-v3/out/` (Messlatte).