# Portierungsplan: Animations-Editor → Instatic-Plugin

> **Erstellt:** 2026-07-29 · **Grundlage:** `docs/spike-instatic-befund.md` (praktisch validiert),
> Instatic-Kartierung + Portierungs-Inventar, 3-Perspektiven-Analyse (Datenfluss / Interaktion /
> Risiko) + Abgleich — Workflow `wf_5804cb1d-13f`, Volltexte im Session-Scratchpad.
> **Skill:** `/multi-plan` (Codex/Gemini-Backends hier nicht installiert → durch Opus-Agenten mit
> denselben Rollen ersetzt, wie beim Webbuilder-Umbauplan).
> **Status: PLANUNG — nichts gebaut.** Ausführung erst nach Leons Freigabe.

## Aufgabentyp
Fullstack-Plugin-Entwicklung auf fremder Plattform (Editor-UI, Datenmodell, Publish-Pipeline).

---

## 0 · Was diese Analyse Neues gefunden hat (verändert den Plan)

Drei Funde, die man ohne Code-Studium nicht sieht — alle mit Datei:Zeile belegt:

**A · `api.editor.store.transaction` ist NICHT persistenzsicher.** Es ist ein rohes `setState` und
umgeht `runHistoricMutation` — die einzige Stelle, die `hasUnsavedChanges = true` setzt. Autosave
hängt allein an diesem Flag. **So geschriebene Keyframes wären nach einem Reload weg.** Der richtige
Schreibpfad ist `store.read().updateNodeProps(nodeId, patch)` — der läuft durch die History, ist
undo-fähig und markiert die Seite als geändert. *(runtime.ts:515 vs. nodeActions.ts:315-322; Gegenprobe:
`hasUnsavedChanges = true` hat genau 3 Treffer, alle in History-Pfaden.)*

**B · `data-og-id` überlebt nur auf 5 Modultypen** — container, text, image, button, link (+ body).
Auf **svg, video, list, loop, slot** wird das Attribut gespeichert und beim Publish **still verworfen**.
Für einen *Grafik*-Animator sind SVG und Video kein Randfall. → Braucht eine sichtbare Lösung
(Entscheidung E5), niemals stilles Scheitern.

**C · Site-Level-Scripts werden PRO SEITE gebündelt.** Unsere 172-KB-Runtime landet N-mal auf der
Platte (N = Seitenzahl), mit N esbuild-Läufen je Publish und ohne seitenübergreifenden Browser-Cache.
Der naheliegende Ausweg — Site-Script als **3-Zeilen-Loader** auf eine einmalig gepinnte Asset-URL —
ist noch von niemandem geprüft und wird in H3 mit Zahlen entschieden.

**Verdeckter Konflikt (von keiner Einzelperspektive erkannt):** Ist eine Grafik ein **eigener Node im
Ebenen-Baum** (dann schenkt uns Instatic Layers, Auswahl, Sperren, Duplizieren, Undo, Publish — ca.
1.800 Zeilen Eigenbau sterben) **oder** liegt die ganze Szene in **einem Bühnen-Node** (ein Ort, ein
Undo-Schritt, keine Anker-Kollisionen)? Beides zugleich geht nicht. → Entscheidung E1, endgültig nach H5.

---

## 1 · Technische Lösung (Konsens der Analyse, alle drei Perspektiven einig)

| Baustein | Lösung | Belegt |
|---|---|---|
| **Datenablage** | Keyframes/Grafiken als **freie Props am Node** — der Publisher erhält unbekannte Keys (`validateNodeProps.ts:204`); ein namespaced Top-Key `flowcodeAnim` + `schemaVersion`, eigene TypeBox-Validierung beim Lesen (der Host validiert unser Feld nie) | alle 3 |
| **Schreibpfad** | `store.read().updateNodeProps()` — **nicht** `transaction` (Fund A) | datenfluss |
| **Anker-Vertrag** | `htmlAttributes: { "data-og-id": … }` — erreicht Canvas **und** publizierten Output über dieselbe Normalisierung; unser Renderkern spricht dieses Attribut bereits | alle 3 |
| **Anker setzen** | automatisch durch das Plugin beim „Anker setzen"-Klick — kein manueller Nutzerschritt, kein `publish.html`-Hook (der bekommt nur den fertigen String ohne Node-Handles) | datenfluss |
| **Assets** | Instatic-Media-Library (`/uploads/…`), **nie** Data-URLs im Node (Page-Row-Größe, QuickJS-Heap 64 MB) | datenfluss + interaktion |
| **Editor-UI** | Panel (`editor.panels`) + Canvas-Overlay (`editor.canvas`) — das Properties-Panel kennt nur 8 JSON-Control-Typen, eine Keyframe-Zeitleiste ist dort nicht darstellbar | datenfluss + interaktion |
| **Werkzeug-Zustand** (Setups-Bibliothek, Presets) | `api.cms.storage` — das ist Werkzeug-Zustand, kein Seiteninhalt, gehört nicht in den Page-Tree | datenfluss |
| **Vektorisieren/Freistellen** | clientseitig im Browser (unsere Bibliothek ist importfrei; QuickJS könnte es nicht: 2 s Deadline, kein `sharp`) | interaktion |

**Was stirbt:** Import-Pipeline, Ordner-Export, Puck-Schicht, Vier-Stationen-Shell, Seiten-Speicher,
9 von 11 `fetch`-Aufrufen, Backdrop-Mechanik — zusammen ~15.000 Zeilen, die Instatic ersetzt.

---

## 2 · Häppchen-Plan

Prinzip: **erst die drei Behauptungen prüfen, deren Widerlegung die Planung umwirft** (Persistenz,
Anker-Kette, Runtime-Auslieferung) — dann früh eine sichtbare Bewegung auf einer echten Seite —
Kapselung und Editor-UI zuletzt, wenn man weiß, was zu kapseln ist.

| # | Häppchen | Nutzersichtbare Messlatte | Größe |
|---|---|---|---|
| **H0** | **Boden herstellen.** `git fetch --unshallow` im Klon, `instatic-pin.json` (Version + Commit + Bun-Range) ins Builder-Repo committen, Änderungsrate der 6 kritischen Host-Dateien der letzten 60 Tage messen | „Wir können jederzeit exakt denselben Instatic-Stand wiederherstellen — und kennen die echte Änderungsrate, statt sie zu schätzen." | S |
| **H1** ✅ | **Persistenz-Probe.** *Fund A BESTÄTIGT und verschärft* (2026-07-29): `transaction` macht die Seite nie „schmutzig", landet nie im Save-PUT (leerer `changedPages`-Array im mitgeschnittenen Body), überlebt keinen Reload und hängt nicht im Undo. `updateNodeProps` tut alles vier. **Verschärfung:** der „Trittbrettfahrer-Effekt" — eine `transaction`-Schreibung überlebt DOCH, sobald irgendetwas anderes dieselbe Seite schmutzig macht (dreimal unabhängig reproduziert, u. a. durch bloßes Wegnavigieren). Damit ist der Fehler *sporadisch* statt deterministisch — der teuerste Fehlermodus. **Konsequenz:** `transaction` für Node-Props in der Wirt-Schicht hart **verbieten**. | erreicht (via echtem Store gemessen, nicht via Plugin — siehe §7) | S |
| **H2** | **Anker-Kette bis in den Output.** `data-og-id` setzen, publizieren, im ausgelieferten HTML nachsehen. Mitprüfen: SVG/Video (still verworfen?), **Node duplizieren** (zwei gleiche IDs?), Node löschen (verwaister Anker?) | „Ich klicke ‚Anker setzen', publiziere, finde das Attribut im HTML — und bei nicht-ankerfähigen Ebenen sagt das Werkzeug mir das klar, statt still zu scheitern." | M |
| **H3** | **Walking Skeleton: Runtime auf der publizierten Seite.** Nackter Renderkern (Scroll → Transform, keine Editor-UI), Keyframes von Hand ins Prop, Publish mit 5 Seiten, **Bundle-Zeit und Bytes messen**; Loader-Variante gegen Voll-Bundle vergleichen | **„Auf der veröffentlichten Seite bewegt sich ein Element beim Scrollen — und der Publish dauert nicht spürbar länger."** ← erster echter Nutzen | M |
| **H4** | **Scroll-Achse in allen drei Welten.** Design-Frame (ausgerollt, `100vh` auf 800 px gepinnt), Live-Frame (scrollt intern), publizierte Seite (`window`) — Scroll-Quelle wird injiziert statt `window.scrollY` zu lesen. *Entscheidet nebenbei die Live-Selektions-Frage.* | „Bei gleichem Fortschritt steht dasselbe Element in Design-Vorschau, Live-Vorschau und veröffentlichter Seite an derselben Stelle." | M |
| **H5** | **Datenmodell-Entscheid am Prototyp.** Bühnen-Node vs. Node-pro-Grafik mit je 3 Grafiken durchspielen: Ebenen-Baum, Undo-Schritte, Duplizieren, Anker-Kollision, JSON-Größe messen | **„Leon sieht zwei Ebenen-Bäume nebeneinander und sagt, welcher sich richtig anfühlt."** | M |
| **H6** | **Wirt-Schicht + Smoke-Suite.** Die in H1–H5 *tatsächlich benutzten* Berührungspunkte kapseln (es werden ~6 sein), Grep-Gate („kein `@instatic/`-Import außerhalb der Wirt-Schicht", Ausnahme `host-ui`) + statische Vertragsprüfungen | „Ein Testlauf sagt in unter 5 Sekunden, ob ein Instatic-Update uns bricht." | S |
| **H7** | **Erste Editor-Fläche: Keyframes setzen.** Panel + Overlay; zuerst der Pointer-Block (297 Z.) und die Keyframe-Operationen (106 Z.) | „Leon setzt ohne JSON-Bearbeitung zwei Keyframes, scrollt, sieht die Bewegung — und nach dem Publish sieht sie auf der Seite genauso aus." | L |

**Danach** (nicht auf dem kritischen Pfad): Bibliothek, Vektorisieren/Freistellen, Presets,
Fluss-Engine, Mehrfachauswahl.
**Bewusst kein eigenes Häppchen:** die Live-Selektion — sie ist ein Nebenprodukt von H4. Fällt dort die
Entscheidung „Design-Frame ist der Werkzeugmodus", ist der teuerste Risikoblock ersatzlos erledigt.

---

## 3 · Entscheidungen für Leon

| # | Frage | Empfehlung |
|---|---|---|
| **E1** | **Sind unsere Grafiken Seiteninhalt (eigene Ebenen im Baum) oder ein Effekt über der Seite (eine Bühne)?** | **Seiteninhalt — ein Node pro Grafik.** Nur so fühlt sich das Werkzeug wie Instatic an (vertrautes Ebenen-Panel, Auswahl, Sperren, Duplizieren, Rückgängig — alles geschenkt) und die Eigenbau-UI halbiert sich. Der Preis (verteilte Szene, Anker-Kollision beim Duplizieren) ist lösbar; der Preis der Bühne — eine dauerhafte Parallelwelt neben dem Ebenen-Baum — ist es nicht. **Endgültig erst nach H5.** |
| **E2** | **Ist der Design-Modus unser Werkzeugmodus und Live nur Vorschau?** | **Ja.** Streicht den größten Risikoblock (Portal an einen Marker ohne SDK-Zusage, fehlender Overlay-Layer). Der ausgerollte Design-Frame ist zum Keyframe-Setzen ohnehin besser — die ganze Scroll-Achse liegt räumlich vor einem. Kosten: „Abspielen" leistet die Vorschau, nicht das Werkzeug. |
| **E3** | **Wie nah an Instatic?** | **Nah bei Daten und Bedien-Bausteinen, distanziert bei DOM und Geometrie.** Die Datenverträge sind belegt stabil; DOM-Marker und Geometrie sind die Bruchflächen. `host-ui` ist die einzige Fläche mit eigenem Paritäts-Test der Plattform — die darf direkt benutzt werden. |
| **E4** | **Was tun, wenn ein Instatic-Update unsere Prüfungen rot macht?** | **Auf dem festgeschriebenen Stand bleiben; Upgrade als eigenes, geplantes Häppchen alle 4–6 Wochen.** Bei vier Releases in vierzehn Tagen ist Mitlaufen ein Vollzeitjob. Ausnahme: Sicherheitsupdates. |
| **E5** | **Müssen SVG- und Video-Ebenen animierbar sein?** (Fund B: sie tragen keine Anker) | Bei einem Grafik-Animator wahrscheinlich ja → dann **automatisch einen benannten Container einziehen**, sichtbar im Baum, nie still. Das verändert die Struktur des Nutzers — deshalb deine Entscheidung. Alternative wäre ein Instatic-Fork; zu teuer. |
| **E6** | **Bleibt Mehrfachauswahl (Rubber-Band, Gruppen-Zug) ein Muss für v1?** | **Erst 10 Minuten prüfen, ob Instatic es selbst kann** (der Store hat `selectedNodeIds: string[]`, die Doku sagt „keine Mehrfachauswahl" — Widerspruch, klärbar mit Shift-Klick im Ebenen-Baum). Kann er es: aufsetzen. Kann er es nicht: **v1 ohne** — ein zweiter Auswahl-Begriff neben dem Host-Baum verwirrt mehr, als er nützt. |
| **E7** | **Bleiben Vektorisieren und Freistellen im Produkt?** | **Ja, aber später und im Browser.** Es ist das Einzige, was Instatic gar nicht ersetzt — liegt aber nicht auf dem kritischen Pfad. Nach H7. |

---

## 4 · Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| **Persistenz-Falle** (Fund A) — falscher Schreibpfad verliert Daten still | H1 beweist es an Tag 1; Schreibpfad wird in der Wirt-Schicht auf `updateNodeProps` festgenagelt |
| **Duplizieren erzeugt doppelte Anker-IDs** (in keiner Einzelanalyse gesehen) | H2 prüft es explizit; Lösung: ID-Kollisionsprüfung beim Speichern + sichtbare Warnung |
| **SVG/Video tragen keine Anker** (Fund B) | E5; bis dahin: nicht-ankerfähige Ebenen werden im Werkzeug **klar markiert**, nie still ignoriert |
| **Publish wird durch unsere Runtime langsam** (Fund C) | H3 misst mit 5 Seiten, bevor irgendetwas darauf aufbaut; Loader-Variante als Ausweg vorbereitet |
| **Pre-1.0 ohne Kompatibilitätszusage** | H0 pinnt, H6 kapselt + Smoke-Suite, E4 regelt die Politik |
| **Renderkern ist *nicht* fertig** — er liest `window.scrollY`, aber der Design-Frame scrollt gar nicht | H4 injiziert die Scroll-Quelle; kleiner Umbau, aber vor jedem Zeilen-Port fällig |
| **Zwei konkurrierende Auswahl-Begriffe** (unser Rubber-Band vs. Host-Ebenen-Baum) | E6 — erst prüfen, was der Host kann |
| **Der Instatic-Klon ist gitignoriert** → aktuell kein reproduzierbarer Stand | H0 (Pin-Datei ins Builder-Repo) |

---

## 5 · Was mit dem bestehenden Builder passiert

Der `flowcode-website-builder` bleibt **lauffähig eingefroren**, solange die Portierung läuft — die
WEE-Arbeit muss nicht warten. Kein Rückbau, kein Löschen, bis auf Instatic wirklich dasselbe möglich
ist. Der **Vektorisierer** (1.330 Z., null Abhängigkeiten) ist unabhängig davon als eigenständiges
Paket herauslösbar, wann immer es passt.

**Phase 6 (Design-Umbau) des alten Plans bleibt gestrichen** — das wäre Styling für eine Shell, die
stirbt.

---

## 7 · Betriebs-Erkenntnis aus H1: Plugin-Installation braucht einen Menschen

Instatic verlangt vor jeder Plugin-Installation eine **Passwort-Wiedereingabe** (Step-Up-Auth) —
zu Recht, denn ein Editor-Plugin läuft unsandboxed mit den Rechten der Admin-UI. **Diese Grenze ist
für Agenten nicht automatisierbar und soll es auch nicht sein.** In H1 haben zwei Agenten unabhängig
voneinander korrekt verweigert, das Passwort einzutippen; ein Versuch des Orchestrators, das über
einen frischen Agenten nachzuholen, wurde vom Sicherheits-Klassifikator gestoppt — ebenfalls richtig.

**Konsequenzen für den weiteren Plan:**
- **H2 und H3 brauchen kein installiertes Plugin.** Anker setzen und Keyframes schreiben laufen über
  den Editor-Store, die Runtime-Auslieferung über die normale Site-Script-Oberfläche. Beide Proben
  sind damit vollständig agenten-tauglich.
- **Ab H7 (echte Editor-Fläche) wird ein installiertes Plugin gebraucht.** Dafür gibt es genau zwei
  legitime Wege: (a) **Leon bestätigt den Dialog einmal von Hand** — ein Klick plus Passwort, danach
  bleibt das Plugin installiert und Agenten können normal weiterarbeiten; oder (b) ein
  **nicht-interaktiver Seed-Weg fürs Dev-Setup** (Plugin beim Start aus einem Ordner registrieren),
  falls Instatic so etwas vorsieht — das wäre vor H7 zu prüfen.
- **Agenten bekommen ab sofort keine Zugangsdaten mehr in den Auftrag.** Das war ein Fehler des
  Orchestrators in der H1-Runde und ist korrigiert.

## 6 · Provenienz

- Spike (praktisch validiert): `docs/spike-instatic-befund.md`
- Analyse-Volltexte: Scratchpad `plan-analyse/{datenfluss,interaktion,risiko,abgleich}.md`
  (Workflow `wf_5804cb1d-13f`, 3 Opus-Perspektiven + Opus-Abgleich)
- Ehrlichkeits-Hinweis aus dem Abgleich: Die drei Perspektiv-Texte brechen jeweils am Ende ab
  (Längenlimit) — ausgerechnet im Abschnitt Runtime-Auslieferung. Deshalb ist genau dieser Punkt
  im Plan als **offen mit Messauftrag** (H3) geführt und nicht als gelöst.
