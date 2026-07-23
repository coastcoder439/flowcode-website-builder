I now have everything I verified myself. Here is my lens analysis.

---

# Analyse — Linse Station 4: Live-Preview-Modus + Ordner-Struktur-Export

*Zuständige Defekt-IDs: M25, M23 (Umsetzungsdetails), N14, N13, N17.*
Alle Datei:Zeile-Belege selbst gelesen (GrafikEditor.tsx über NUL-entschärfte Kopie, nie über Grep).

---

## 1 · Ist-Befund (mit selbst verifizierten Belegen)

**Der heutige Export ist rein datei-/download-orientiert — kein Ordner-Export existiert.**
`GrafikExportPanel.tsx` bietet fünf Wege, alle enden in `downloadeBlob()`:
- `jsonExportieren` (Z.167) → `wee-anim.json`
- `htmlExportieren` (Z.192) → `wee-overlay.html`
- `runtimeHerunterladen` (Z.217) → `wee-embed.js`
- `elementExportieren` (Z.233) → `wee-element-<name>.html`
- `seiteExportieren` (Z.256) → **eine** `wee-seite.html`

Der „Ganze Seite"-Weg ist der einzige, der Seite+Animation fusioniert: `baueSeiteHtml` (`embed-export.ts:224-268`) legt das Puck-Markup (`optionen.seitenMarkup`) in den `<body>`, darüber das Overlay-Mount + inline `<script data-wee-config>` + die **inline** eingebettete Runtime (`escapeRuntimeFuerInline`). Das Markup kommt per Client-DOM-Abgriff: `GrafikEditor.tsx:3565-3568` — `seitenMarkupGeber = () => document.querySelector("[data-fc-puck-buehne]")?.innerHTML`, nur im Puck-Seiten-Modus (`puckSeiteName` truthy). Bilder werden über `bilderInline` (`embed-export.ts:70-84`) als Data-URL **inline** gepackt. → Das Ergebnis ist genau EINE selbsttragende HTML-Datei mit allem inline, **kein deploybarer Ordner mit ausgelagerten Assets/CSS/Runtime, keine Unterseiten.** Das ist die M25-Lücke.

**Vorschau und Export sind zwei unverbundene Welten (N14 bestätigt).**
`SeitenVorschau.tsx` rendert die Seite über `<Render config={config} data={data} />` (Z.140) mit gescopten Styles (`GescopteSeitenStyles`, Z.125) — **ohne jede Animation** (kein GrafikLayer-Overlay, kein Runtime), und mit **nur einem „← Zurück"-Knopf** (Z.112-120), keinerlei Export-Anbindung. Sie lebt als Unter-Ansicht IM Seiten-Bereich (`SeitenBereich.tsx:351-353`, ausgelöst per „Vorschau"-Knopf je Seite Z.551), **nicht** als vierte Station. Die Preview zeigt also weder die Animation noch die Export-Wahrheit — sie ist eine dritte, abweichende Render-Variante.

**Die Animator-Bühne animiert, die Preview nicht — Render-Grundlagen driften.**
`app/editor/page.tsx` (EditorInner, Z.85-153) rendert `HomePageContent` mit `Backdrop art="puck-seite"` (Z.135) über der aktiven Seite + `GrafikEditor` + `FlussHandlesEbene` — dort laufen die GrafikLayer-Scroll-Animationen. M23/N14 fordern für Station 4 „dieselbe Render-Grundlage, Animator komplett aus". Heute existiert diese Grundlage nur MIT Editor-Chrome (Animator) oder OHNE Animation (SeitenVorschau) — nie „Bühne + Animation, aber Editor komplett aus".

**Die Seite trägt Animation und Styles bereits als Daten** — die Export-Basis ist vorhanden:
`seiten-speicher.ts:45-60` — `SeitenDatei { data, anim?: SeitenAnim (grafiken[]), styles?: string[] }`. `speichereSeite` erhält `anim`/`styles` auch bei reinem Daten-Speichern (Z.271-273). D.h. eine gespeicherte Seite = Puck-Data + Animations-Grafiken + übernommene CSS-URLs. Der Ordner-Export kann alles daraus lesen, ohne Live-Editor-Zustand.

**N17 — trailingSlash-308-Doppelrequests, Ursache im next.config verifiziert.**
`next.config.mjs:7` `trailingSlash: true` bei `output:"export"` (Z.5). Alle API-Fetches gehen OHNE End-Schrägstrich raus: `SeitenBereich.tsx:201` `/api/puck-seite/liste`, `page.tsx:104` dito, `SeitenVorschau.tsx:62` `/api/puck-seite/lade`, plus alle `postJson`-Aufrufer. Next antwortet 308 → `…/liste/` → Resend. Bei POST besonders unnötig.

**N13 — unsichtbare Hero in der Vollbild-Vorschau: Mess-Artefakt-Verdacht.**
Laut Mängelliste §7 sind alle DOM-Messwerte korrekt; Verdacht: Blur + Scroll-Animation blockieren den Screenshot-Kanal des Automations-Browsers (§10 „Screenshot-Kanal timeoutet"). Heute rendert die Preview React-`<Render>` im Editor-Dokument — anfällig genau für diese Erfassungsfalle. Noch nie in echtem Chrome geprüft.

**Registry-/Contract-Kopplung (für den Export relevant):**
`puck.config.tsx:310-324` hängt an JEDE Baustein-Wurzel `data-og-id="puck:<id>"`/`data-og-typ`; `SektionBlock` rendert Slot-Kinder `<Kinder/>` (Z.195). `api-roundtrip.mjs` ist der Autoren-API-Vertragstest (S2: Neudruck/CLI erst am Schluss). Asset-Schreibmuster steht mit `app/api/import/asset/route.ts` bereits als Vorlage (Origin-Gate, Pfad-Guards, Endungs↔MIME-Whitelist, `public/import/<slug>/`).

---

## 2 · Ziel-Architektur (Station 4 = EIN verbundenes Preview+Export-Gerät)

**Leitidee: EIN Export-Generator, zwei Ausgabe-Modi — und die Preview rendert genau dessen Artefakt.**

```
                    ┌─────────────────────────────────────────────┐
  Seite(n) als      │   Export-Generator (eine Kette)              │
  Daten:            │                                             │
  data + anim +     │  1. Markup je Seite: <Render> (versteckt)   │
  styles ──────────▶│     → innerHTML  (Client-DOM-Abgriff,       │
                    │       gleiches Muster wie seitenMarkupGeber)│
                    │  2. Config je Seite: baueEmbedConfig(       │
                    │       anim.grafiken, fluss, {docH})         │
                    │  3. Asset-Sammlung: walkTree(data) +        │
                    │     anim.grafiken/keyframes → Referenzliste │
                    │  4. Zusammenbau ──┬── Modus INLINE          │
                    │                   └── Modus ORDNER          │
                    └───────┬───────────────────────┬─────────────┘
                            │                       │
              PREVIEW (Station 4)          EXPORT (Ordner)
              iframe srcdoc = INLINE       schreibt export/<slug>/…
              = die Export-Wahrheit        (deploybar) über
              live, ohne Disk-Write        POST /api/export/ordner
```

**Modus INLINE** (= heutige `baueSeiteHtml`, unverändert weiterverwendet): eine selbsttragende HTML mit allem inline. Powert die **Preview** (via `iframe srcdoc` bzw. Blob-URL) und bleibt als sekundärer Datei-Export „Ganze Seite (HTML)" erhalten (feature-inventar 1.H, nichts entfernt).

**Modus ORDNER** (neu, M25-Kernweg): Der Generator externalisiert statt zu inlinen und schreibt eine **deploybare Ordner-Struktur**:

```
export/<slug>/
  index.html                     ← Startseite: Puck-Markup + Overlay-Mount
                                    + <script src="./wee-embed.js"> + <script data-wee-config>
  <unterseite>/index.html        ← je weitere Seite der aktiven Website (Verlinkung relativ)
  wee-embed.js                   ← Runtime als DATEI (aus public/wee-embed.js kopiert)
  assets/<hash>.<ext>            ← alle Bild-/Medien-Assets (Data-URLs extrahiert,
                                    /import- und /curtain-Pfade kopiert), Referenzen relativ umgeschrieben
  css/<name>.css                 ← übernommene styles[] (aus public/import/<slug>/css kopiert)
  README.txt                     ← „Ordner auf jeden statischen Host laden"
```

- **Puck-Data → statisches HTML:** Primär **Client-DOM-Abgriff** (`renderToString`-Äquivalent gratis: der bereits gerenderte `<Render>`-Baum, `.innerHTML`) — reüsiert exakt das existierende `seitenMarkupGeber`-Muster und braucht **keinen** Server-Import der UI-lastigen `puck.config.tsx` (die Registry-Note in `puck-registry.ts:6-11` warnt genau davor). Für Multi-Page wird je Seite ein verstecktes `<Render>` gemountet, Markup abgegriffen, wieder unmountet. *Alternative* (server-seitig `renderToStaticMarkup(<Render>)` in der Export-Route über die RSC-Auflösung `dist/rsc.js`, wie `seiten-speicher.ts:19-22` sie schon nutzt) — sauberer für reine Server-Generierung, aber zieht das Client-Bundle in den Handler; nur als dev-only-Tooling vertretbar. Empfehlung: DOM-Abgriff primär.
- **Asset-Enumeration:** `walkTree(data)` aus `@puckeditor/core` traversiert den content-Baum deterministisch → sammelt `BildBlock.src`, `GrafikLayer.src`, `HtmlBlock`-`<img>`; zusätzlich `anim.grafiken[].src` + `keyframes[].srcOverride`; plus `styles[]`. Data-URLs → Datei extrahieren; `/import`- und `/curtain`-Projektpfade → kopieren; Referenzen im Markup/Config auf `./assets/…` bzw. `./css/…` umschreiben.
- **Erzeugung unter `next dev`:** neue **Autoren-API-Route** `POST /api/export/ordner` (`runtime="nodejs"`), UI-frei — sie nimmt das vom Client zusammengebaute Artefakt (`{ slug, seiten:[{pfad, html}], assets:[{pfad, dataUrl|quellUrl}], css:[…] }`) entgegen und schreibt reine Dateien (Muster 1:1 aus `app/api/import/asset/route.ts`: Origin-Gate, Pfad-Guards, Endungs↔MIME-Whitelist, Größenlimit). Kein Puck-Import server-seitig → Architektur-Invariante gewahrt. Ziel-Ordner `export/<slug>/` (Projektwurzel, gitignored — deploybarer Rohbau). Optional zusätzlich `public/export/<slug>/`, damit die Preview das **echte On-Disk-Artefakt** per iframe laden kann (N14 „ideally renders the actual export artifact").
- **Preview = Export-Wahrheit:** Station 4 rendert primär den INLINE-Modus per `iframe srcdoc` (kein Disk-Write, sofort). Weil es echtes HTML in einem echten iframe ist, laufen Links echt, nichts ist selektierbar, der Animator ist per Konstruktion komplett weg (M23). Ein ausklappbares Export-Fenster oben (WEE-Design, R5) enthält: „Als Ordner exportieren" (primär), die fünf Datei-/Embed-Wege (sekundär), und einen Umschalter „Vorschau: In-Memory ⇄ echtes Ordner-Artefakt".

**Trailingslash (N17):** `next.config.mjs` um `skipTrailingSlashRedirect: true` ergänzen — behält `trailingSlash:true` für die statischen Seiten-URLs (`/editor` → `/editor/index.html`), unterbindet aber die 308-Umleitung der API-POSTs. Zentrale Ein-Zeilen-Behebung ohne alle Aufrufer anzufassen.

---

## 3 · Umsetzungsschritte (geordnet, je reviewbare Häppchen)

**S0 — next.config-Fix (N17), isoliert.**
Datei: `next.config.mjs`. `skipTrailingSlashRedirect: true` ergänzen. Deliverable: `api-roundtrip.mjs`-Netzmitschnitt zeigt 200 ohne vorheriges 308 auf `/api/puck-seite/liste`. *Winziges, sofort verifizierbares Häppchen; keine Abhängigkeit.*

**S1 — Export-Generator-Kern (reine Funktionen, DOM-frei testbar).**
Neue Datei `components/embed/ordner-export.ts`. Funktionen: `sammleAssetReferenzen(data, anim)` (nutzt `walkTree`), `baueOrdnerArtefakt(seiten, {inline|folder})` → gibt `{ dateien: {pfad, inhalt|quelle}[] }`. Wiederverwendet `baueEmbedConfig`, `baueSeiteHtml` (INLINE) und teilt die Mount/Config-Zeilen (`baueMountUndConfig`). Deliverable: Unit-Tests (AAA) für Referenz-Sammlung + Pfad-Umschreibung; keine UI. *Reine Logik, isoliert reviewbar.*

**S2 — Schreib-Route `POST /api/export/ordner`.**
Neue Datei `app/api/export/ordner/route.ts` (Muster `import/asset/route.ts`). Schreibt nach `export/<slug>/`. Deliverable: Erweiterung in `api-roundtrip.mjs` (Negativ: fremder Origin→403, Pfadausbruch→400, Nicht-Whitelist-Endung→400; Positiv: schreibt index.html + wee-embed.js + assets, danach aufräumen). Registry-Gate unberührt. *Server-only, gegen laufenden Dev-Server prüfbar.*

**S3 — Multi-Page-Markup-Abgriff (Client).**
Neue Datei `app/editor/ExportSammler.tsx`: mountet je Seite der aktiven Website versteckt `<Render>` (+ styles gescopt), greift `.innerHTML` ab, sammelt `anim`/`styles` aus `/api/puck-seite/lade`. Deliverable: liefert dem Generator das komplette Seiten-Set. *Client-Logik, an einer 2-Seiten-Fixture verifizierbar.*

**S4 — Station-4-Preview als iframe-Artefakt.**
`SeitenVorschau.tsx` umbauen bzw. neue `Station4LivePreview.tsx`: statt `<Render>` direkt → INLINE-Artefakt aus S1 in `iframe srcdoc` (bzw. Blob-URL), plus Umschalter „echtes Ordner-Artefakt" (lädt `/export/<slug>/index.html`). Ausklappbares Export-Fenster (WEE-Design) mit „Als Ordner exportieren" + den 5 sekundären Wegen (Wiederverwendung `GrafikExportPanel`, additiv). Deliverable: Preview zeigt Seite MIT laufender Scroll-Animation, Links klickbar, nichts selektierbar. Behebt N14 + M23-Umsetzung. *Optik-Abnahme bleibt bei Leon.*

**S5 — Verkabelung Preview↔Export + Nav-Übergabe.**
Export-Fenster ruft S1-Generator (folder) → S2-Route; „Vorschau"-Toggle nutzt denselben Generator (inline). Übergabepunkt an die Flow-Linse: Station 4 als 4. Reiter der Vier-Stationen-Nav registrieren (ich liefere die Komponente + benötigten Nav-Titel „4 · Live-Preview + Export", N16). Deliverable: durchgehender Pfad Seite → Preview (=Export-Wahrheit) → Ordner auf Platte.

**S6 — N13-Verifikations-Harness (echtes Chrome).**
Kein Code-Fix, sondern definierter Prüfschritt (Verifikations-Protokoll §1): (a) Ordner-Export der aktiven Seite erzeugen; (b) `export/<slug>/index.html` **direkt in echtem Chrome** öffnen (nicht über den Automations-Screenshot-Kanal, der laut §10 an Blur+Canvas hängt); (c) zur Hero scrollen, „Together, WEE can." + Buttons „Über uns"/„Unterstütze uns hier" sichtbar bestätigen; (d) identisch im Preview-iframe. Erst dann N13 als Bug ODER als Mess-Artefakt verbuchen. Deliverable: dreiwertiges Protokoll (OK/FEHLGESCHLAGEN/UNGEPRÜFT). *S2 (api-roundtrip-Neudruck) bleibt bis zum finalen Tool ungedruckt.*

---

## 4 · Risiken + Mitigation

- **Asset-Vollständigkeit (0×404):** Fonts/`url()` in übernommenem CSS werden — wie beim Import (`SeitenStyles.tsx:33-37` ehrliche Grenze) — nicht aufgelöst. *Mitigation:* CSS-`url()` beim Ordner-Export mitscannen und kopieren + Referenzen relativieren; verbleibende externe Verweise in einen sichtbaren Export-Bericht schreiben (kein stiller Verlust).
- **Anker-Auflösung im Export statisch eingefroren** (`embed-export.ts:200-211`): die Runtime nutzt absolute Keyframe-Werte, liest `ankerId` NICHT. Verschiebt sich Markup im Zielhost, driften Grafiken. *Mitigation:* im Export-Bericht + README ehrlich benennen (bestehende dokumentierte Grenze, nicht neu verschlimmern).
- **DOM-Abgriff braucht gemountete `<Render>`:** versteckter Multi-Mount kann teuer/flackernd sein. *Mitigation:* sequenziell mounten/abgreifen/unmounten; bei Problemen Fallback auf server-seitiges `renderToStaticMarkup` (dev-only Route).
- **`export/`-Ordner im Repo:** darf nicht getrackt werden. *Mitigation:* `.gitignore`-Eintrag; Ziel klar als Build-Output kommunizieren (CLAUDE.md: keine ungesicherten Projektartefakte verwechseln).
- **@scope nur Chromium** (`SeitenStyles.tsx:49-53`): Preview-Styling degradiert in Alt-Browsern. *Mitigation:* Im ausgelieferten Ordner ist @scope irrelevant (jede Seite ist eigenes Dokument); nur die In-Editor-Preview braucht es — bestehende Warnung bleibt.
- **Registry-Synchronpflicht** (`puck-registry.ts` ↔ `puck.config.tsx`): Export darf keine neuen Bausteintypen einführen. *Mitigation:* Generator ist rein konsumierend, registriert nichts.

---

## 5 · Abhängigkeiten zu den anderen Linsen

- **Flow-Linse:** registriert Station 4 als 4. Reiter der Vier-Stationen-Nav (R3/R4) und liefert Nav-Titel/`document.title` je Station (N16); verschiebt die „Vorschau" aus der Seiten-Bereich-Unteransicht in Station 4. Ich liefere die Preview+Export-Komponente, sie verdrahtet die Navigation. Braucht außerdem „Animator komplett aus" (M22 Panel-Ausblenden **+ Klick-Abfangung aus**) — ich definiere die Anforderung, die Animator-Linse setzt sie um.
- **Undo-Linse (R1):** Preview und Ordner-Export sind read-only Build-Aktionen — kein Editier-Zustand, kein Ctrl+Z nötig. Kurz gegenbestätigen, dass „Ordner erzeugen" nicht als undo-pflichtige Editier-Aktion gilt.
- **Import-Linse:** liefert die aktive Website multi-page + `styles[]` + Assets unter `public/import/<slug>/`. Import-Vollständigkeit (M7/6c: 0×404, alle Unterseiten) ist Voraussetzung für einen 404-freien Export — mein Export deckt Import-Lücken auf, behebt sie aber nicht.
- **Design-Linse (R5):** das ausklappbare Export-Fenster + Station-4-Chrome nach WEE-Tokens (hell/Sand, Orange/Grün-500 nur Signal, Syne/Montserrat). Das Preview-iframe selbst zeigt die Seite mit IHREN Styles (korrekt, kein Tool-Design).
- **Preview-Export = meine Linse** (Selbst).

---

## 6 · Offene Fragen (nur echt unentscheidbar)

1. **Umfang v1 — Einzelseite oder ganze Website?** M25 formuliert „die im Builder gebaute Seite" (Singular), die importierte aktive Website ist aber mehrseitig (M6). Soll der Ordner-Export in v1 **alle** Unterseiten der aktiven Website als verlinkten Multi-Page-Ordner ausspucken, oder zunächst nur die aktive/geöffnete Einzelseite (Multi-Page als Folgeschritt)? — Entscheidet Seiten-Set und relative Verlinkung; für Leon.
2. **Auslieferungsweg:** deploybarer Ordner auf Platte via Dev-Server-Route (`export/<slug>/`) **und/oder** ZIP-Download im Browser? Beides technisch machbar; reine UX-/Betriebsentscheidung (self-hosted). Empfehlung: On-Disk-Ordner primär (das ist buchstäblich der geforderte „Ordner"), ZIP optional.

---

## 7 · Von meinen Schritten aufgelöste Defekt-IDs

**M25** (S1–S3, S5 — Ordner-Struktur-Export als Kernweg, Datei-/Embed-Wege bleiben sekundär, nichts entfernt) · **M23** (S4 — Station 4 = Preview-Modus auf Export-Artefakt, Animator komplett aus, echtes Link-/Selektions-Verhalten) · **N14** (S4/S5 — Preview + Export als EINE verbundene Einheit, ausklappbares Export-Fenster) · **N13** (S6 — echt-Chrome-Verifikationsschritt vor Verbuchung) · **N17** (S0 — `skipTrailingSlashRedirect` im next.config).

*Berührt zusätzlich, aber im Besitz anderer Linsen: N16 (Station-Titel — ich liefere den Titel-String), M22 (Animator-Ausblenden — ich definiere „komplett aus" als Preview-Anforderung).*