## 0. Vorbemerkung zur Beweislage

Alle drei Texte brechen mitten im Satz ab (datenfluss in der Runtime-Tabelle §3, interaktion in der Flächen-Tabelle §2, risiko im Smoke-Punkt 9). Genau dort liegt zufällig der offenste der fünf Punkte (Runtime-Auslieferung). Die Aussagen unten zu diesem Punkt beruhen also auf Teiltexten — das ist der Grund, warum er in §3 als grösste Lücke steht und nicht als Widerspruch.

---

## 1. KONSENS — was tragfähig ist

| Aussage | Belegt von |
|---|---|
| **Freie Node-Props überleben die Validierung** (`validateNodeProps` gibt `{...rawProps, ...cleaned}`) → Keyframes am Node sind persistenzsicher ablegbar | datenfluss + risiko unabhängig, mit derselben Zeile; interaktion baut darauf auf |
| **`data-og-id` via `htmlAttributes` ist der Anker-Vertrag** und erreicht Canvas **und** publizierten Output über dieselbe Normalisierung | alle drei |
| **Nur 5 Module tragen `htmlAttributes`** (container/text/image/button/link, + body) — auf svg/video/list/loop still verworfen | datenfluss + risiko, identische Liste |
| **Im publizierten HTML gibt es keine Node-Handles** (`annotateNodeIds` nur im Agenten-Lesepfad) → wir brauchen eigene Marker, kein `publish.html`-Hook | datenfluss (widerlegt den Hook explizit) + risiko |
| **Instatic hat null Animation** → Keyframe-/Pointer-Logik ist unser Kern, wird portiert, nicht ersetzt | alle drei |
| **Das Properties-Panel reicht nicht** (8 JSON-Control-Typen, kein React-Control) → eigene UI = Panel + Canvas-Overlay | datenfluss + interaktion |
| **Unsere Persistenz-Altlast stirbt** (Setups-API, Backdrop, Export, 9 von 11 `fetch`) | datenfluss + interaktion |
| **Assets in die Instatic-Media-Library, nie Data-URLs im Node** | datenfluss + interaktion |
| **Das SDK hat keine BC-Garantie** → Pin und bewusste Vorsicht nötig | risiko explizit, datenfluss implizit („Grant-Zuschnitt kann pre-1.0 nachgezogen werden") |

Das ist ein solides Fundament: **die Datenverträge sind einig belegt.** Kein einziger Widerspruch liegt auf dieser Ebene.

---

## 2. WIDERSPRÜCHE

### W1 — Schreibpfad: `transaction` vs. `read().updateNodeProps` ⚠ **hart, und teuer wenn falsch**
- **risiko:** Adapter-Funktion `schreibeNodeProps(id, patch)` kapselt `api.editor.store.transaction` — „nur diese eine Mutation".
- **datenfluss:** `transaction` ist ein rohes `setState` und umgeht `runHistoricMutation` — die **einzige** Stelle, die `hasUnsavedChanges = true` setzt. Autosave hängt nur daran → **so geschriebene Keyframes sind nach dem Reload weg.** Richtiger Pfad: `read().updateNodeProps(...)`.

**datenfluss ist deutlich besser belegt:** es nennt den Mechanismus, die Zeilen *und* eine Gegenprobe (grep auf `hasUnsavedChanges = true` → genau 3 Treffer, alle in History-Pfaden). risiko stellt die Persistenzfrage gar nicht, es bewertet `transaction` nur nach Sprengweite. → **Adapter-Idee von risiko behalten, Innenleben von datenfluss.** Kein Streitpunkt für Leon, aber Punkt 1 der Testreihenfolge, weil er billig zu beweisen ist.

### W2 — Mehrfachauswahl im Host ⚠ **hart, mit grossem Umfangs-Hebel**
- **interaktion:** „es gibt keine Mehrfachauswahl im Host" (Quelle: `docs/editor.md:337`) → unsere Rubber-Band-/Gruppen-Mechanik bleibt eigener Zustand.
- **risiko:** `selectedNodeIds: string[]` ist die Wahrheit, `selectedNodeId` nur abgeleitet (Quelle: `selectionSlice.ts:28-36`).

**risiko ist besser belegt** — Quellcode schlägt Doku, erst recht bei 4 Releases in 14 Tagen. **Aber beide könnten recht haben:** ein Array im Store beweist nicht, dass die *UI* Mehrfachauswahl anbietet. Das ist keine Entscheidung, sondern ein 10-Minuten-Test im laufenden Editor (Shift-Klick im Layers-Baum). Folge, falls der Host es kann: unsere Gruppen-Mechanik setzt auf statt danebenzustehen — spart Code und verhindert zwei konkurrierende Auswahl-Begriffe.

### W3 — Ist der Renderkern fertig? ⚠ **hart**
- **risiko:** „Der kritische Pfad läuft nicht über den Renderkern (der ist fertig und importfrei)."
- **interaktion:** Der Design-Frame **scrollt nicht** — er ist auf Inhaltshöhe ausgerollt, `100vh` ist auf 800 px gepinnt. Unsere `hoehenFaktor`/`ankerFelderFuer` lesen `window.scrollY` → **der Kern muss umgebaut werden** (Scroll-Quelle injizieren).

**interaktion ist besser belegt** (drei konkrete Fundstellen plus die betroffenen Funktionen). Der Umbau ist klein, aber er betrifft drei verschiedene Achsen (ausgerollter Design-Frame / intern scrollender Live-Frame / `window` auf der publizierten Seite). risikos Satz ist in der Sache falsch — und da er die Reihenfolge begründet („vor jedem Zeilen-Port"), verschiebt das die Planung.

### W4 — Nähe zum Host: „geschenkt" vs. „Kopplung" ○ **Haltungsdifferenz, auflösbar**
- **interaktion:** Node-Modell schenkt uns Layers, Selektion, Sperren, Duplizieren, Undo, Publish; ~1800 Zeilen sterben.
- **risiko:** Jede Host-Fläche ist Bruchfläche; alles hinter `wirt.ts`, kein Fremdimport ausserhalb.

Kein Faktenwiderspruch. Auflösung folgt aus risikos eigener Staffelung: interaktions „Geschenke" liegen fast alle auf **Stufe 3 (Datenverträge, belegt stabil)** — sie folgen aus dem Modul-Vertrag, nicht aus DOM-Markern. Echte Überschneidung nur bei Selektion und Geometrie (Stufe 1/2). → **Nah bei Daten und Host-UI, distanziert bei DOM/Geometrie.** Nebenbei: risikos Regel „nichts ausser `wirt.ts` importiert `@instatic/`" kollidiert mit interaktions Plan, ~1300 Zeilen mit `@instatic/host-ui` neu zu bauen. Die Regel muss präzisiert werden — `host-ui` ist die einzige Fläche mit Instatic-eigenem Paritäts-Gate-Test, also die stabilste; sie gehört **nicht** hinter den Adapter.

### W5 — Vektorisieren client- oder serverseitig ○ **kein echter Widerspruch**
datenfluss nennt `api.cms.routes.post` als Option, interaktion begründet clientseitig (QuickJS 2 s/64 MB, `sharp` unmöglich, unsere Vektor-Bibliothek importfrei). interaktion gewinnt mangels Gegenargument.

---

## 3. LÜCKEN — die 5 offenen Punkte, ehrlich bewertet

| Punkt | Stand | Was konkret fehlt |
|---|---|---|
| **Anker im Output** | ✅ **überzeugend** | Zwei ungeprüfte Ränder: (a) **Duplizieren kopiert `htmlAttributes` mit → sofort zwei Nodes mit derselben `data-og-id`.** Nennt keine der drei Perspektiven. (b) Der Fallback für svg/video („nächster ankerfähiger Vorfahre") ist vorgeschlagen, aber nicht belegt — und bei einem *Grafik*-Animator sind SVG/Video der Normalfall, nicht der Rand. |
| **Keyframe-Datenhaltung** | ⚠ **Ablage geklärt, Struktur offen** | Verdeckter Konflikt: datenfluss will **einen Stage-Node pro Seite** (1 Ort, 1 Undo-Schritt) — dann sind Grafiken keine Nodes und interaktions gesamte Ersparnis (Layers/Selektion/Duplizieren) fällt weg. interaktion will **einen Node pro Grafik**. Unvereinbar, von niemandem als Konflikt erkannt. Zusätzlich fehlt jede **Zahl**: wie gross ist ein reales Keyframe-Set? Ein `wc -c` auf ein bestehendes WEE-Setup entscheidet Page-Row- und QuickJS-Heap-Fragen in einer Minute. |
| **Upgrade-Strategie** | ⚠ **Mechanik gut, Politik fehlt** | risiko liefert Pin + Adapter + Smoke-Suite und benennt die eigene Lücke ehrlich (depth-1-Klon → Churn nicht messbar; `git fetch --unshallow` als billiger Fix). Offen bleibt: **was passiert, wenn die Suite rot ist** — reparieren oder auf dem Pin stehenbleiben? Das ist eine Produktentscheidung. Ausserdem: der Klon ist gitignoriert, es gibt aktuell **keinen reproduzierbaren Stand**. |
| **Runtime-Auslieferung** | ❌ **nicht beantwortet** | Drei Teilbefunde, nie zusammengeführt: Site-Script läuft im Canvas (`runInCanvas:true`), wird aber **pro Seite gebündelt** (N × 172 KB, N esbuild-Läufe, 30 s Timeout); `frontend.assets[]` ist eine URL, läuft aber **nicht im Canvas**. Es fehlt: (i) eine Messung des Publish-Aufwands mit N Seiten; (ii) die Frage, ob die Runtime nach Abzug der Editor-Teile überhaupt 172 KB bleibt; (iii) ob im Canvas überhaupt die Runtime laufen muss oder der Editor-Entrypoint die Vorschau treibt; (iv) die naheliegende Kombination — **Site-Script als 3-Zeilen-Loader auf die gepinnte Asset-URL** (1 Kopie statt N). Niemand hat (iv) geprüft. |
| **Live-Selektion** | ❌ **nicht beantwortet** | Belegt ist nur das Problem: im Live-Modus fehlt der Overlay-Layer, `useCanvasNodeRect` liefert `null`, und der Spike hängt sein Portal an `[data-instatic-canvas-root]` — einen Marker **ohne SDK-Zusage**, den ein Upgrade still killt. Es fehlt die vorgelagerte Frage: **brauchen wir den Live-Modus als Werkzeugmodus überhaupt?** Der ausgerollte Design-Frame ist zum Keyframe-Setzen sogar besser (die Achse liegt räumlich vor einem). Wird das mit „nein" beantwortet, fällt der komplette Stufe-1-Risikoblock weg. Kein Fallback für den Marker-Verlust ist irgendwo genannt. |

---

## 4. REIHENFOLGE-VORSCHLAG

Prinzip: erst die drei Behauptungen prüfen, deren Widerlegung die Planung umwirft (W1, W3, Runtime); dann früh eine sichtbare Bewegung auf einer echten Seite; Kapselung und Editor-UI erst danach.

| # | Häppchen | Nutzersichtbare Messlatte |
|---|---|---|
| **H0** | **Boden herstellen** (½ Tag): `git fetch --unshallow`, `instatic-pin.json` (Version + Commit + bun-Range) ins Builder-Repo committen, Churn der 6 kritischen Dateien der letzten 60 Tage messen | „Wir können jederzeit exakt denselben Instatic-Stand wiederherstellen — und wir kennen die echte Änderungsrate statt sie zu schätzen." |
| **H1** | **Persistenz-Probe** (1 Tag): Ein Knopf schreibt einen Zeitstempel in die Props des selektierten Nodes — einmal via `transaction`, einmal via `read().updateNodeProps`. Speichern, neu laden. **Entscheidet W1.** | „Ich klicke, lade den Editor neu, und die Zahl ist noch da — und der Speichern-Punkt wird schmutzig." |
| **H2** | **Anker-Kette bis zum Output** (1–2 Tage): `data-og-id` setzen, publizieren, im HTML nachsehen. Mitprüfen: SVG/Video (still verworfen?), **Node duplizieren (doppelte id?)**, Node löschen (Waise?) | „Ich klicke ‚Anker setzen', publiziere, finde das Attribut im ausgelieferten HTML — und bei nicht-ankerfähigen Ebenen sagt es mir das klar, statt still zu scheitern." |
| **H3** | **Walking Skeleton: Runtime auf die publizierte Seite** (2–3 Tage): nackter Renderkern (Scroll→Transform, keine Editor-UI), Keyframes von Hand ins Prop, Publish mit 5 Seiten, **Bundle-Zeit und Bytes messen**. Schliesst Lücke „Runtime-Auslieferung" mit Zahlen statt Optionen | **„Auf der veröffentlichten Seite bewegt sich ein Element beim Scrollen — und der Publish dauert nicht spürbar länger."** ← erster echter Nutzen |
| **H4** | **Scroll-Achse in allen drei Welten** (1 Tag): Design-Frame (ausgerollt, 800-px-vh), Live-Frame (intern), publizierte Seite — Scroll-Quelle injiziert. **Entscheidet W3 und nebenbei die Live-Selektions-Frage** | „Bei gleichem Fortschritt steht dasselbe Element in Design-Vorschau, Live-Vorschau und veröffentlichter Seite an derselben Stelle." |
| **H5** | **Datenmodell-Entscheid am Prototyp** (1–2 Tage): Stage-Node vs. Node-pro-Grafik mit je 3 Grafiken durchspielen — Layers-Baum, Undo-Schritte, Duplizieren, Anker-Kollision, JSON-Grösse | **„Leon sieht zwei Layers-Bäume nebeneinander und sagt, welcher sich richtig anfühlt."** |
| **H6** | **`wirt.ts` + Smoke-Suite** (1 Tag): die in H1–H5 *tatsächlich benutzten* Berührungspunkte kapseln (es werden ~6 sein, nicht 8), Grep-Gate + statische Vertragsprüfungen. Bewusst **nach** den Proben — vorher weiss man nicht, was zu kapseln ist | „Ein Testlauf sagt in unter 5 Sekunden, ob ein Instatic-Update uns bricht." |
| **H7** | **Erste Editor-Fläche: Keyframes setzen** (3–5 Tage): Panel + Overlay; zuerst der 297-Zeilen-Pointer-Block und die 106 Zeilen Keyframe-Ops | „Leon setzt ohne JSON-Bearbeitung zwei Keyframes, scrollt, sieht die Bewegung — und nach dem Publish sieht sie auf der Seite gleich aus." |

Danach erst: Bibliothek/Vektorisieren/Freistellen, Mehrfachauswahl, Presets. **Bewusst nicht als eigenes Häppchen:** die Live-Selektion — sie ist ein Nebenprodukt von H4. Fällt dort die Entscheidung „Design-Frame ist der Werkzeugmodus", ist der teuerste Risikoblock ersatzlos erledigt.

---

## 5. WAS LEON ENTSCHEIDEN MUSS

| # | Entscheidung | Empfehlung |
|---|---|---|
| **1** | **Sind unsere Grafiken Seiteninhalt (eigene Ebenen im Baum) oder ein Effekt über der Seite (eine Bühne)?** | **Seiteninhalt — ein Node pro Grafik.** Nur so fühlt sich das Werkzeug wie Instatic an (vertrautes Ebenen-Panel, Auswahl, Sperren, Duplizieren, Rückgängig) und die Eigenbau-UI halbiert sich. Der Preis (verteilte Szene, Anker-Kollision beim Duplizieren) ist lösbar; der Preis der Bühne — eine dauerhafte Parallelwelt neben dem Ebenen-Baum — ist es nicht. Erst nach H5 endgültig festnageln. |
| **2** | **Ist der Design-Modus unser Werkzeugmodus und Live nur Vorschau?** | **Ja.** Streicht den grössten Risikoblock (Portal an einen ungesicherten Marker, fehlender Overlay-Layer). Der ausgerollte Design-Frame ist zum Keyframe-Setzen ohnehin besser. Kosten: „Abspielen" muss die Vorschau leisten, nicht das Werkzeug. |
| **3** | **Wie nah an Instatic?** | **Nah bei Daten und Bedien-Bausteinen, distanziert bei DOM und Geometrie.** Die einzige Aufteilung, die beide Perspektiven zugleich bedient — und sie folgt der belegten Stabilitäts-Staffelung, nicht dem Bauchgefühl. |
| **4** | **Was tun, wenn ein Instatic-Update unsere Prüfungen rot macht?** | **Auf dem festgeschriebenen Stand bleiben; Upgrade als eigenes, geplantes Häppchen alle 4–6 Wochen.** Bei vier Releases in vierzehn Tagen ist Mitlaufen ein Vollzeitjob. Ausnahme: Sicherheitsupdates. |
| **5** | **Müssen SVG- und Video-Ebenen animierbar sein?** | Wenn ja (bei einem Grafik-Animator wahrscheinlich): **automatisch einen benannten Container einziehen**, sichtbar, nie still. Das verändert den Baum des Nutzers — deshalb deine Entscheidung, nicht unsere. Alternative wäre ein Instatic-Fork; zu teuer. |
| **6** | **Bleibt Mehrfachauswahl (Rubber-Band, Gruppen-Zug) ein Muss für v1?** | **Erst prüfen, ob Instatic es selbst kann** (10 Minuten, siehe W2). Kann es das: aufsetzen. Kann es das nicht: **v1 ohne** — ein zweiter Auswahl-Begriff neben dem Host-Ebenen-Baum verwirrt mehr, als er nützt. |
| **7** | **Bleiben Vektorisieren und Freistellen im Produkt?** | **Ja, aber später und im Browser** (kein Server-Roundtrip). Es ist das Einzige, was Instatic nicht ersetzt — liegt aber nicht auf dem kritischen Pfad. Nach H7 einplanen. |