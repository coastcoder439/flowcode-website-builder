# Übergabe: Phase 6 (Design-Umbau) — für die Cowork-Session

> **Zweck:** Diese Datei macht eine frische Session zur direkten Fortsetzung der bisherigen
> Arbeit — gleiche Rolle, gleiche Regeln, gleicher Qualitätsanspruch. Stand: 2026-07-24,
> Phasen 0–5 + 4b fertig (letzter Commit `3f7bdc5`).
>
> **Annahme:** Die Cowork-Session hat als lokalen Ordner den **Harness/Workspace**
> `Flowcode-Agentic-OS` (dort ist das ECC-Plugin aktiviert). Das Projekt liegt darunter in
> `user-projects/flowcode-website-builder/` — falls es dort fehlt, siehe §1.

---

## 1 · Setup (einmalig, vor dem Start-Prompt)

```bash
# 1) Projekt-Repo in den Workspace holen (falls noch nicht vorhanden)
git clone https://github.com/coastcoder439/flowcode-website-builder.git user-projects/flowcode-website-builder

# 2) Abhängigkeiten
cd user-projects/flowcode-website-builder && npm install

# 3) Browser für die Optik-Verifikation
npx playwright install chromium
```

**Dev-Server:** läuft auf `http://127.0.0.1:3113` (`npm run dev` im Projektordner, oder über den
`.claude/launch.json`-Eintrag `flowcode-builder`). Der Editor liegt unter `/editor/`.

**Was NICHT im Repo ist (gitignored, für Phase 6 aber auch NICHT nötig):**
- `test-sites/` — Bens gebaute Quell-Website (nur für Import-Arbeit relevant)
- `scripts/.freeze-out/` — Freeze-Zwischenartefakte des Imports
- Ollama + `gemma4` — lokales Modell, nur für Import-Zerlegung
- `export/`, `public/export/` — Build-Ausgabe des Ordner-Exports

**Modell-Empfehlung:** Opus zum Bauen, Sonnet zum Verifizieren. Phase 6 ist überwiegend
mechanisch (Token-Mapping in CSS) — der Erfolgsfaktor ist nicht der Modell-Tier, sondern die
Verifikations-Disziplin (§4).

---

## 2 · START-PROMPT (wörtlich in die neue Session kopieren)

```
Du übernimmst die laufende Arbeit am flowcode-website-builder (Ordner:
user-projects/flowcode-website-builder/, privates Repo coastcoder439/flowcode-website-builder,
Branch main). Der Workspace-Ordner ist dein cwd; das Projekt ist ein Unterordner davon.

DEINE ROLLE: Du bist Orchestrator, nicht Einzelkämpfer. Du planst, delegierst an Bau- und
Verify-Agenten (ECC-Workflows: Opus baut, Sonnet verifiziert, parallel wo möglich), prüfst
deren Ergebnisse KRITISCH nach und gehst vor jedem "fertig"-Bericht selbst den End-to-End-Pfad
im Browser. Du sparst keine Tokens — Token-/Kostenargumente sind ausdrücklich KEIN Grund,
Qualität oder lokale Modelle wegzulassen.

ZUERST LESEN (Pflicht, in dieser Reihenfolge):
1. user-projects/flowcode-website-builder/docs/uebergabe-phase6.md  (diese Datei — Stand,
   Regeln, Auftrag)
2. .../docs/plan-webbuilder-umbau-gesamt.md  (der Gesamtplan; DEIN Auftrag ist Phase 6)
3. .../docs/plan-analyse/lens-design.md  (die detaillierte Design-Spec mit Token-Mapping-
   Tabelle, Komponenten-Inventar, CSS-Architektur, Chunk-Reihenfolge C0–C9)
4. .../docs/design-vorgaben.md  (Leons verbindliche Farbregeln + die entschiedenen Punkte
   E7/E8 — NICHT neu diskutieren, sie sind gesetzt)
5. .../docs/verifikations-protokoll.md  (wie verifiziert wird — VERBINDLICH)
6. .../docs/maengelliste-final.md Abschnitt 2  (die Design-Mängel M24/R5, N5, M17, M19,
   M16, M20, M21 im Wortlaut)
7. .../docs/feature-inventar.md §1  (Nichts-verlieren-Gate)

DEIN AUFTRAG: Phase 6 des Gesamtplans (Design-Umbau, Chunks D0–D8) — das Editor-UI vom
heutigen dunklen Look auf das WEE-Designsystem umstellen (hell/sand), plus Hover-Erklärungen
für ~30 Knöpfe. Danach Phase 7 (Gesamt-Abnahme) nur nach Leons ausdrücklicher Freigabe.

ARBEITSWEISE (wie bisher, verbindlich):
- Häppchenweise: ein Chunk = ein Bau-Agent + ein Verify-Agent + max. 1 Fix-Runde. Bleibt es
  danach rot: Kette STOPPEN und als ABGEBROCHEN berichten, niemals als Teilerfolg.
- Verify dreiwertig: OK / FEHLGESCHLAGEN / UNGEPRÜFT (mit Grund + was versucht wurde).
  gruen=true NUR wenn ALLE Checks OK sind. UNGEPRÜFT ist nicht "halb ok".
- Nach jedem grünen Chunk: proaktiv committen + pushen ins PROJEKT-Repo mit
  `git -C user-projects/flowcode-website-builder ...` — NIEMALS in den Workspace committen.
  Beim Commit immer ansagen, in welches GitHub-Repo es geht.
- Optik-Häppchen einzeln an Leon zur Abnahme geben (Screenshots), nicht alles am Stück.
- Zwischen den Chunks die Server-Erreichbarkeit prüfen (der Dev-Server ist in dieser Session
  schon 3× gestorben; ein Hänger darf nie stundenlang unbemerkt bleiben).

HARTE REGELN (aus schmerzhafter Erfahrung):
- NIEMALS "npm run build" im Projekt-Root ausführen, solange der Dev-Server läuft (killt ihn).
- NIEMALS Features entfernen — nur additiv/umgruppieren. Gate: feature-inventar.md §1.
- Die Seite "wee-website-v3" (seiten/wee-website-v3.json) NIE überschreiben oder löschen.
- Optik-URTEILE trifft ausschließlich Leon. Du bereitest Optionen und Belege vor, du nimmst
  nichts optisch ab.
- Kein Decap / kein separates CMS vorschlagen (aus der Architektur verbannt).
- Die Puck-Registry (lib/puck-registry.ts) und app/puck/puck.config.tsx sind
  synchronpflichtig — beide pflegen.

MESSLATTE (die Lehre aus Phase 4): Prüfe immer das NUTZER-SICHTBARE Ziel, nie einen
Ersatz-Indikator. In Phase 4 galt "Screenshot deckungsgleich mit Original" — die Verifies
maßen aber nur "Texte vorhanden, 0 Fehler". Ergebnis: das Layout war zerrissen und Leon
musste es finden. Für Phase 6 heißt das: nicht "CSS-Variablen ersetzt" prüfen, sondern
"Panel ist hell, Kontrast stimmt, keine Grünfläche, Fokus sichtbar" — mit Screenshot-Beleg.

Melde dich mit einer kurzen Bestandsaufnahme (was du gelesen hast, wie du Phase 6 schneidest)
und lege dann los.
```

---

## 3 · Stand: Was steht bereits (nicht neu bauen!)

| Phase | Inhalt | Commit |
|---|---|---|
| 0 | NUL-Byte, 308-Doppelrequests, Tab-Titel, tote Datei | `6ff3fba` |
| 1 | **Vier-Stationen-Shell** (`?station=import\|bauen\|animator\|preview`), zentraler History-Reducer, Dirty-Guard, Panel-Toggle | `c3acaa5` |
| 2 | **EIN Undo-Bus** (Command-Timeline, Stations-Scopes, Puck-Bridge, Seiten-Papierkorb + 409) | `e2b623b` |
| 3 | Funktions-Bugs (Neu-einlesen, Fluss-Fokus, Lade-Dialog, Doppel-ID, Anker-Spam, Builder-holen, Preset-UI) | `7f82f17` |
| 4 | **Import-Endlevel** (Freeze, Fremdkörper-Filter, gemma4-Segmentierung, CSS/Fonts, 16 Unterseiten, lebendige Bühne) | `ea963d4` |
| 4b | **Strukturtreues Mapping** (Layout = Original, Texte/Bilder injiziert) + Geometrie-Messlatte | `7b08a01` |
| 5 | **Station 4** (iframe = Export-Wahrheit) + **Ordner-Export** (deploybar, Multi-Page) | `b930c62`, `3f7bdc5` |

**Testinfrastruktur, die grün bleiben MUSS:**
```bash
npx tsc --noEmit                    # Exit 0
node scripts/api-roundtrip.mjs      # 52 grün, 0 rot (Dev-Server muss laufen)
for f in scripts/tests/*.test.mjs; do node "$f"; done   # alle grün
```

---

## 4 · Phase 6 im Detail (dein Auftrag)

**Ziel:** Das Editor-UI folgt dem WEE-Designsystem. Heute sind ~11 Panel-CSS-Dateien mit
dunklen Hartwerten dupliziert (`rgba(20,30,24,.92)` als Panelfläche, `#3f6e3a` = green-600
als Button-**Fläche** → direkter Verstoß gegen Leons Regel, `#e8b400` Fremd-Gelb in drei
verschiedenen Bedeutungen, `system-ui` statt der WEE-Fonts).

**Die Architektur steht in `docs/plan-analyse/lens-design.md`** — kurz:
1. `app/design-tokens.css` = Single Source of Truth (liegt bereits im Repo, identisch zur
   WEE-Referenz — nicht anfassen)
2. Neu: `app/editor/editor-ui.css` mit semantischen `--tool-*`-Aliassen auf die WEE-Tokens
3. Jede Panel-CSS ersetzt ihre Hartwerte durch `--tool-*` (ein Panel je Chunk)
4. Puck-Chrome über die dokumentierten `--puck-*`-Variablen umfärben

**Chunks (Reihenfolge aus der Spec):** D0 Fundament + Fonts · D1 Seiten-Station hell
(inkl. N5, das erste Optik-Häppchen für Leon) · D2 Puck-Chrome · D3 Animator-Hauptpanel
(3 Teile) · D4 Satelliten-Dialoge · D5 Overlays + Hilfe (inkl. M19 @scope-Warnung entfernen)
· D6 Fluss/Backdrop-UI · D7 M17 Titel-Abdeckung (~30 Knöpfe, Liste in maengelliste-final.md
§2) · D8 Feinschliff nach Leons Wahl.

**Entschieden (NICHT neu aufrollen), siehe `docs/design-vorgaben.md`:**
- **E7:** Animator-Panel = **solides Sand-Panel** + Schatten/Rahmen, KEIN Glas
  (Lesbarkeit über bewegter Bühne, Kontrast garantierbar, kein GPU-Kosten)
- **E8:** Das Fremd-Gelb wird nach Bedeutung aufgeteilt — **Grün-500 = Zustand**
  („aktiv/gekoppelt"), **Orange = Aktion** (Buttons) und transiente Overlays (Snap-Linien),
  **Amber = ausschließlich echte Warnungen**
- **A11y-Regeln:** Zustände nie nur über Farbe (immer zusätzlich Umriss/Icon), sichtbarer
  Fokus-Ring auf allen interaktiven Elementen, nur kontrastgeprüfte Text-Flächen-Paare

**Achtung — Reihenfolge:** D0–D2 sind unabhängig. D3+ stylen Panels, deren Struktur bereits
final ist (Phase 1 hat sie umgebaut) — das ist ok. Aber: der Export-Reiter wandert laut
Menü-Inventar konzeptionell zu Station 4; die alte Panel-Version bleibt erhalten
(feature-inventar), also beide Orte stylen.

---

## 5 · Offene Punkte, die LEON gehören (nicht selbst entscheiden)

1. **Umstieg auf die neuen Seiten:** Die 16 strukturtreu importierten `wee-v3-fein*`-Seiten
   liegen NEBEN dem alten `wee-website-v3` (aktiv). Der Umstieg ist Leons Entscheidung —
   er löst nebenbei den N13-Befund (`docs/n13-befund.md`: echter Bug, Wurzel sind die
   ALTEN Import-Daten mit eingefrorenem `opacity:0`).
2. **Optik-Abnahmen:** Screenshot-Paare Original vs. Puck liegen in
   `scripts/.abnahme/deckung-*.png` (8 Dateien).
3. **JS-Animations-Beweis:** Beim UI-Import gibt es die Checkbox „Als lebendige Bühne
   verbinden" (reicht den Ordner-Handle an den Service-Worker-Lebendmodus durch). Der
   Beweis, dass Bens JS-Animationen dann echt laufen, braucht den nativen Ordner-Dialog —
   nicht automatisierbar, Leons Hand-Test.
4. **Navigations-Zerlegung:** In der Puck-Vorschau erscheint die Kopf-Navigation als
   gestapelte Text-Bausteine — technisch korrekt, ob optisch gewollt = Design-Entscheidung.

---

## 6 · Bekannte Stolpersteine (Zeit sparen)

- **Dev-Server stirbt gelegentlich** (Last durch parallele Agenten). Symptom: Verifies
  melden „Server nicht erreichbar" und die Kette bricht ab. Fix: Server neu starten, dann
  den Workflow per Resume fortsetzen (grüne Schritte kommen aus dem Cache). Zwischen
  Chunks aktiv prüfen: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3113/editor/`
- **Konsolen-Fehler mit `all:true`** zeigen die gesamte Browser-Session-Historie inklusive
  alter HMR-Artefakte. Immer „seit letzter Navigation" messen (frischer Reload), sonst
  jagt man Phantome.
- **`GrafikEditor.tsx` ist riesig** (~3900 Zeilen) — mit `Read` + `offset` arbeiten.
- **Screenshot-Kanal des eingebauten Browser-Panes** timeoutet auf `/editor` (Dauer-
  Animation). Ausweichweg: Playwright-MCP als separate Instanz — dort funktioniert es.
- **`mapping-fein.test.mjs`** kann einen bekannten, vorbestehenden FAIL zeigen
  (`htmlBloecke sinkt drastisch`) — betrifft den alten „fein"-Modus, nicht den jetzigen
  strukturtreuen Default. Kein Blocker für Phase 6.

---

## 7 · Definition of Done für Phase 6

- [ ] Alle Chunks D0–D8 grün verifiziert (dreiwertig, mit Screenshot-Belegen)
- [ ] Kein dunkles Vollflächen-Panel mehr; keine Grüntöne als Fläche; Orange/Grün-500 nur
      als Signal; WEE-Fonts im Tool-UI
- [ ] ~30 Knöpfe haben `title` (Gate: kein `<button>` ohne Textkind und ohne `title`)
- [ ] `tsc`, `api-roundtrip` (52/52), alle Node-Tests grün
- [ ] Kein Feature verloren (Abgleich gegen `feature-inventar.md` §1)
- [ ] Screenshot-Serie für Leons Abnahme: Station 2/3/4 bei 375/768/1440 (+1920 Animator)
      plus Control-Nahaufnahmen (Reiter aktiv/hover/focus, Buttons, Slider, Dialoge)
- [ ] **Leons optische Abnahme eingeholt** — technisches Grün ist keine Design-Abnahme
