# Agent-Schnittstelle des Builders: Printing Press + Paperclip + Puck-Plugin

> Orchestrator-Hinweis: Ergebnis der Multi-Agent-Recherche (3 Dimensionen, 8 adversarielle
> Verify-Verdikte) auf Leons Quellen-Bestätigung hin; gegen die lokale Projekt-Ground-Truth
> (API-Routen, Toolchain) geprüft. Redaktionelle Abweichung bei der Umsetzung: Payload-Validierung
> im Hausmuster (handgerollte Guards wie `app/api/abbild/route.ts`) statt neuem Zod-Package —
> keine neue Dependency ohne Not. Umsetzungsstand der Häppchen aus §5 steht im Git-Log.

Stand: 2026-07-21. Quellen: Repo-Clone `mvanhorn/cli-printing-press` (HEAD `0e724120`, 2026-07-20, per `git ls-remote` als aktueller Upstream-main verifiziert), printingpress.dev, eigene Projekt-Dateien. Alle Aussagen mit Beleg; Offenes ist explizit markiert.

---

## 1. Kernaussage

Printing Press (`mvanhorn/cli-printing-press`, MIT, printingpress.dev) ist eine **Build-Time-Werkzeugfabrik**: Aus einer API-Beschreibung (primaer OpenAPI-Spec) druckt sie ein fertiges, agent-natives Go-Toolpaar — CLI + MCP-Server — plus Claude-Code-Skill, mit mechanischen Quality-Gates. Es ist **kein** Laufzeit-Orchestrator und hat keinerlei Puck-Bezug (damit ist die offene Zuordnungsfrage aus `docs/puck-erweiterungsebene.md` §2.5 durch Leons Quellen-Bestaetigung geschlossen). In unserem System bekommt es genau eine Rolle: Es erzeugt die **synchrone Werkzeug-Schicht** fuer Agenten auf unserer Autoren-API (`next dev`, Port 3113) — orthogonal zu Paperclip (asynchrone Governance) und zum In-Editor-Puck-Plugin (interaktiver Live-Kanal).

---

## 2. Printing Press: Fakten

### 2.1 Was es erzeugt

Pro Lauf entsteht ein komplettes Go-Projekt mit **zwei Binaries**: `<api>-pp-cli` (Cobra-CLI) und `<api>-pp-mcp` (MCP-Server, Basis `mark3labs/mcp-go v0.47.0`), die sich `internal/client` teilen (Beleg: README.md Z.138, Z.294-297; Golden-Fixture `testdata/golden/expected/generate-golden-api/`). Dazu README, AGENTS.md, CLAUDE.md, eine eigene Agent-SKILL.md und ein `.printing-press.json`-Provenienz-Manifest. Praezisierungen aus dem Verify:

- `internal/store` (SQLite-Mirror) entsteht **nur profilabhaengig** (Persistenz-/Search-Bedarf, Datenvolumen — `internal/generator/vision_templates.go` ~Z.62-100); die kanonische Golden-Fixture hat keinen Store.
- Research-Manuskripte und Verifikations-Proofs entstehen pro Lauf, werden aber **ausserhalb** des Projekts archiviert (`~/printing-press/manuscripts/<api>/<run-id>/`, README Z.147-148).
- Artefakt-Runtime ist reines Go (go.mod: `go 1.26.5`), SQLite via `modernc.org/sqlite v1.37.0` (cgo-frei); das goreleaser-Template der Presse baut mit `CGO_ENABLED=0` fuer `windows_amd64`/`windows_arm64`.

### 2.2 Input-Formate (Verify-korrigiert)

Das Binary akzeptiert ueber **ein** Flag `--spec` per Inhalts-Auto-Detection (`internal/cli/root.go` Z.423-435) vier Formate: OpenAPI 3.x **und** Swagger 2.0 (konvertiert via `openapi2conv`), GraphQL-SDL, Google-Discovery, natives Spec-YAML. Weitere Eingaenge: `generate --docs <url>` (LLM-Scrape, sonst Regex-Fallback), `generate --plan <md>`, `browser-sniff --har <file>` (HAR ist **Pflicht-Flag**), `crowd-sniff`, `device-sniff ble`.

**Wichtige Korrektur:** Der beworbene "blosse-URL"-Weg ("point it at a website. No spec needed", printingpress.dev) existiert **nur auf Skill-/Workflow-Ebene**: Die Traffic-Erfassung machen Agent-Tools (browser-use, Claude-Chrome-MCP) oder manueller DevTools-HAR-Export — **nicht** chromedp im Binary. chromedp dient ausschliesslich `press-auth` (Cookie-/Login-Capture, **macOS-only**, `internal/pressauth/keychain_other.go`).

Fuer uns irrelevant, weil wir **spec-first** gehen (siehe §5).

### 2.3 Workflow

Zwei Install-Teile, beide noetig (README Install-Sektion): (a) `go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@latest`, (b) `npx -y skills@latest add mvanhorn/cli-printing-press/skills --skill '*' -g -a claude-code -y` (Vercels `skills`-CLI). Nutzung in Claude Code via `/printing-press <app>` bzw. `/printing-press --spec ./openapi.yaml` (skills/printing-press/SKILL.md Z.27-28); 9 Skills insgesamt (-reprint, -polish, -publish, -amend, -import, -score, -retro, -output-review). Fast-Path-Phasen 0-5 (README Z.315-324); Phase 5 ("Dogfood Testing") ist laut SKILL.md Pflicht sobald ein Key da oder die API auth-frei ist, nutzt Keys aber nur read-only. Das Binary allein kann research/generate/verify/score ohne den kuratierten Loop (README, verbatim bestaetigt). **Verifikation ist der Kern-Mehrwert:** Scorecard (50+50 Punkte), Dogfood, Proof-of-Behavior, optionaler Live-Smoke — und `scorecard`/`dogfood`/`verify` funktionieren auch fuer **handgebaute** CLIs (README FAQ Z.551). LLM-Schritte shellt das Binary an die lokale `claude`-CLI (Fallback `codex`, `internal/llm/llm.go` Z.10-58) — keine direkte Anthropic-API-Anbindung.

### 2.4 Toolchain / Windows (unsere Maschine: Windows 11)

| Punkt | Status | Beleg |
|---|---|---|
| Generator-Binary auf Windows | ✅ Release-Zips `windows_amd64`/`arm64` (v4.29.0), laufende Windows-Fixes im CHANGELOG | GitHub-Releases; CHANGELOG.md Z.237, 943, 1138 |
| Gedruckte CLIs auf Windows | ✅ pure Go, cgo-frei, Install nach `%LOCALAPPDATA%\Programs\PrintingPress\bin` | go.mod des Golden-Fixtures; Golden-README |
| One-Liner-Installer | ❌ `install.sh` bricht auf allem ausser darwin/linux ab → manuell `go install` + `npx skills add` (oder WSL) | `scripts/install.sh` `detect_platform()` |
| `regen-merge` | ❌ offiziell "macOS+Linux only" | README Z.537 |
| `press-auth` (Cookie-Capture) | ❌ macOS-only ("Linux/Windows support is planned") | `internal/pressauth/keychain_other.go` |
| Repo-Clone | ⚠️ braucht `git config core.longpaths true` | eigene Clone-Beobachtung |
| Skill-Loop unter Windows-Claude-Code | **OFFEN** — keine Windows-CI (alle Workflows ubuntu-latest), keine explizite Aussage | Repo-Workflows; muss per Spike verifiziert werden |

Voraussetzungen: Go ≥1.26.5, Node/npm, Claude Code, kein Docker (README Z.31).

### 2.5 Reifegrad / Lizenz / Risiken

4.199 Stars, 449 Forks, **MIT** (Generator-Repo), erstellt 2026-03-23, taeglich aktiv, 1.712 Commits, Release-Kadenz mehrmals/Woche (GitHub-API). Aber: 4 Monate alt, personal Account, **Bus-Faktor effektiv 2** (tmchow 1.147 + mvanhorn 296 Commits = ~85%), 180 offene Issues (GitHub-API contributors/issues). **Konsequenz: Version pinnen, nie blind `@latest`.** Die Lizenz des separaten Library-Repos (`printing-press-library`) ist ungeprueft — **OFFEN**, vor Nutzung fertiger Presses klaeren. Rechtlich warnt das Repo selbst: "Technical capability is not legal permission" (README Z.529-537) — betrifft uns bei eigener API nicht, wohl aber bei Community-Presses gegen fremde Dienste.

---

## 3. Die Library / Commerce-Presses als Muster

`printingpress.dev/library/commerce` ist eine **Kategorie-Seite mit 32 fertigen CLIs** (keine einzelne "Commerce-Press"); Verteilung via `npx -y @mvanhorn/printing-press-library install <slug>` aus dem separaten Repo `mvanhorn/printing-press-library` (Seiten-Fetches 2026-07-20). Kein Hosted-Service: keine Accounts, kein Pricing, alles lokal — passt exakt zu unserem Self-hosted-Setup.

Was wir aus dem Muster (v.a. Shopify-Press, `/library/commerce/shopify`) fuer **unsere eigene Press** uebernehmen:

1. **Auth via Env-Vars + `doctor`-Kommando** (`SHOPIFY_ACCESS_TOKEN` etc., dann `shopify-pp-cli doctor`) → unsere Press braucht ein Discovery-/Health-Ziel (`/api/builder/status`, §5).
2. **Typed Exit-Codes** (0=success, 2=usage, 3=not found, 4=auth, 5=API, 7=rate limited, 10=config) → deterministisch fuer Agenten auswertbar.
3. **Agent-Flags** `--json`, `--select`, `--dry-run`, `--agent` → genau die Konventionen, die wir sonst haendisch bauen muessten.
4. **`--data-source auto|local|live`** mit SQLite-Mirror → fuer uns **redundant**: unsere Daten sind bereits lokale JSON-Dateien (`abbilder/*.json`, kuenftig `seiten/*.json`); der Store-Layer wird bei unserem Profil voraussichtlich gar nicht generiert (§2.1).
5. **Read-only by default** → unsere schreibenden Aktionen muessen explizit sein, `--dry-run` beim Import ist Pflicht-Feature.
6. Falls der Importer (Stufe B/C) je echte Shop-Systeme anzapfen soll: Shopify/Squarespace/Gumroad-Presses sind fertige Konnektoren — aber Community-Qualitaet und ToS pro Press einzeln pruefen (**OFFEN**, teils "discovered APIs" aus eingeloggten Web-Apps).

---

## 4. Rollenklaerung: das Drei-Kanal-System (Leons Kernfrage)

Die drei Ebenen trennen sich sauber entlang **Zustand** (at-rest-Dateien vs. laufende Editor-Session) und **Zeitverhalten** (synchron vs. asynchron). Sie konkurrieren nicht, sie komponieren.

### (a) Printing-Press-generierter CLI/MCP — synchrone Werkzeug-Schicht

Zustandslose Verben auf **at-rest-Daten** ueber die Autoren-API auf :3113 (liste/lade/speichere/importiere). Fuer **jeden** Agenten nutzbar: Claude Code direkt (Bash — vom Projekt erklaerter Primaerweg, "100x fewer tokens than MCP definitions", Repo-README), optional als stdio-MCP, und von Paperclip-Workern als gewoehnliches Shell-Binary. Funktioniert **nur bei laufendem `next dev`** — im Static-Export-Deploy gibt es keine Routen (`next.config.mjs`: `output: "export"`; `app/api/assets/route.ts` Z.14-16).

### (b) Paperclip — asynchrone Orchestrierung/Governance

Issue→Run-Modell, heartbeat-getrieben, Budget/Approval, Mehr-Rollen-Laeufe; am installierten Server-Code als "ungeeignet fuer synchrone In-Editor-Mikro-Tasks" verifiziert (`docs/ki-strategie.md` §4). **Speziell besser aufgehoben bei Paperclip:** alles, was (1) lange laeuft, (2) ein Genehmigungs-Gate braucht, (3) mehrere Rollen/Schritte hat, oder (4) Budget-Kontrolle verlangt. Der `adapter-claude-local` spawnt pro Run eine volle claude-CLI — die kann den printed CLI ohne neuen Adapter nutzen. **Kein Konflikt** mit `@paperclipai/mcp-server`: der ist Control-Plane (Issues steuern, ~38 Tools), unser Builder-CLI/MCP ist Data-Plane (Builder-Inhalte anfassen). **Anti-Empfehlung:** keinen Press-Print der Paperclip-API anfertigen — der First-Party-MCP existiert bereits.

### (c) In-Editor-Puck-Plugin — interaktiver Kanal

Einziger Weg in die **laufende** Editor-Session: Pucks `data`-Prop ist initial-only, Live-Aenderungen gehen ausschliesslich ueber `dispatch(PuckAction)` (`docs/puck-erweiterungsebene.md` §2.1, §3). Selektion, Undo, Live-Vorschau, Leons Abnahme.

### Zuordnung typischer Jobs

| Job | Kanal | Begruendung |
|---|---|---|
| **Import-Lauf Stufe A** (GrafikSetup→Puck) | Builder-API-Endpunkt, via printed CLI aufrufbar | deterministisch, synchron; Adapter existiert (`lib/import/grafik-setup-to-puck.ts`) |
| **Einzel-Edit** (z.B. Alt-Text, eine Prop) | Puck-Plugin (offene Seite) bzw. direkter SDK-Call in der Autoren-Pipeline | NICHT Paperclip (Async-Overhead), NICHT Press (generiert API-Wrapper, keine LLM-Features) |
| **Layout-Aenderung** | NUR Plugin-Kanal, nie auto-apply | Optik-Abnahme ausschliesslich Leon (`docs/ki-strategie.md` §2) |
| **Massen-Migration** (Schema-Update ueber alle Seiten) | deterministischer Kern (transformProps-Kette) + Paperclip als Governance-Huelle; Worker nutzt printed CLI | `docs/puck-erweiterungsebene.md` §4 |
| **Review-Workflow** (Vorschlag→Genehmigung→Anwendung) | Paperclip (Issue→Run mit Approval-Gate); Anwendung dann via CLI (at-rest) oder Plugin (live) | genau Paperclips Approval-/Budget-Modell |

**Einziger echter Ueberlapp:** Plugin und API schreiben beide Puck-Daten → Regel noetig: die API schreibt nie in eine gerade im Editor offene Seite (Konflikt-Design offen, §6).

---

## 5. Implementierungsplan in Haeppchen

Grundsatz-Reihenfolge (aus der Integrations-Analyse): **erst stabile API-Oberflaeche, dann drucken.** Printing Press braucht eine Spec als Input — es zuerst zu installieren waere falsch herum.

1. **Dev-Laufzeit haerten** (~1 h). `package.json`: `next dev -p 3113` → `-H 127.0.0.1`; Host-/Origin-Check + Content-Type-Pruefung in `/api/abbild` und `/api/assets` (heute: keinerlei Auth/Origin-Check, `req.text()` ohne Content-Type = CSRF-simple-Request-Flaeche; `app/api/abbild/route.ts` Z.356-368). Pflicht **bevor** die API als Agenten-Vertrag beworben wird.
2. **Puck-Persistenz-API bauen** (~0,5–1 Tag). Schliesst eine echte Luecke: der R2a-Spike speichert nur nach localStorage (`app/puck/page.tsx` Z.11-12). Neue Routen als **getrennte POST-Pfade** (nicht aktion-Dispatch — OpenAPI erlaubt je Pfad+Methode nur eine Operation): `POST /api/puck-seite/liste`, `/lade`, `/speichere` (Zod-Validierung + `migrate(config)`, Schreiben nach `seiten/<slug>.json`, 409 bei Konflikt), `/loesche`, plus `POST /api/builder/status` als doctor-/Discovery-Ziel. Muster/Sanitisierung 1:1 aus `app/api/abbild/route.ts`.
3. **Import-Endpunkt** (~2–3 h). `POST /api/import/grafik-setup` `{abbildName|setup, ziel?, dryRun?}` um den bestehenden Stufe-A-Adapter, mit Validierungs-Report.
4. **`openapi.yaml` als Vertrag ins Repo** (~2–4 h). Alle Routen (neu + Bestand `/api/abbild`, `/api/assets`, `/api/vektorisieren`) beschreiben. Die Datei ist zugleich Menschen-Doku, `--spec`-Input fuer Printing Press und Diff-Anker fuer Reprints. Optional gleich `x-*`-Extensions nutzen (`docs/SPEC-EXTENSIONS.md`), z.B. `x-auth-type: none` bzw. spaeter lokales Token.
5. **Windows-Spike Printing Press** (~0,5–1 Tag inkl. Toolchain). Go ≥1.26.5 installieren; **manuell** `go install .../v4/cmd/cli-printing-press@latest` + `npx -y skills@latest add mvanhorn/cli-printing-press/skills --skill '*' -g -a claude-code -y` (install.sh ist unix-only, §2.4); Version pinnen. Dann in Claude Code: `/printing-press --spec ./openapi.yaml --name flowcode-builder`. Damit ist zugleich die offene Frage "laeuft der Skill-Loop nativ unter Windows?" empirisch beantwortet.
6. **Beweis-Roundtrip** (~2–3 h). Bei laufendem `next dev`: (a) `flowcode-builder-pp-cli doctor` gruen gegen `/api/builder/status`; (b) Roundtrip `puck-seite speichere → lade → liste` gegen :3113 mit Diff-Vergleich; (c) `flowcode-builder-pp-mcp` als **stdio**-Server in Claude Code registrieren (http-Transport :7777 meiden) und einen Tool-Call durchfuehren — der exakte Registrierungsweg (`claude mcp add` vs. `.mcp.json`) ist undokumentiert und wird hier empirisch geklaert; (d) `scorecard`/`dogfood`/`verify` gegen das Erzeugnis laufen lassen.
7. **Bewerten + Wartungsregel festschreiben** (~1 h). Ertrag messen: Qualitaet des Prints gegen unsere ~10–12 Aktionen vs. Aufwand — die legitime Alternative bleibt ein handgeschriebener Mini-MCP/CLI gegen **dieselbe** `openapi.yaml`. Falls Print gewinnt: Regel dokumentieren "API-Aenderung ⇒ Spec-Aenderung ⇒ `/printing-press-reprint`" (Mechanismus overlay.yaml + Quality-Gates existiert, `docs/PIPELINE.md`); Paperclip-Anbindung (Worker ruft printed CLI) erst danach testen.

Bewusst **nicht** in dieser API: Stufe-C-Import (async, urteilslastig → Paperclip-Issue) und Live-Session-Edits (nur Plugin/dispatch).

---

## 6. Offene Punkte / Risiken (ehrlich)

1. **Windows-Skill-Loop ungetestet** — keine Windows-CI im Repo, keine Aussage "auf Windows getestet"; wird durch Schritt 5 beantwortet. Bekannte harte Luecken: install.sh unix-only, `regen-merge` macOS+Linux-only, `press-auth` macOS-only (fuer uns egal, wir gehen spec-first).
2. **Shipcheck/Live-Smoke bei POST-only-API** — der Live-Smoke ist als read-only beschrieben; wie das Gate mit einer API umgeht, die nur POST kennt (uebersprungen? Fehler?), ist unbelegt.
3. **MCP-Registrierung in Claude Code** — in README/ARTIFACTS.md/SKILLS.md nirgends spezifiziert; empirisch klaeren (Schritt 6c).
4. **Konflikt offene Seite** — was passiert, wenn ein Agent `seiten/<slug>.json` schreibt, waehrend dieselbe Seite im Browser-Editor offen ist? Locking (`erwartetGespeichert`), Reload-Signal via Plugin — Design offen.
5. **Paperclip-Worker-Umgebung** — haben gespawnte claude-CLI-Worker Bash-Permission und den PATH zum printed Binary? Nur an der lokalen Instanz (localhost:3100) pruefbar; Paperclip-Wissensstand ist ~1 Woche alt.
6. **Lizenz der Library** — Generator-Repo ist MIT, `printing-press-library` (fertige Presses) ungeprueft; vor Nutzung fuer unser kommerzielles Whitelabel-Produkt klaeren.
7. **Kosten/Dauer eines Prints** — nur relative Angaben ("~60% weniger Opus-Tokens" im Codex-Modus, Fast Path ~30–60 min laut Phasendauern); absolute Zahlen unbekannt → nach dem ersten Print messen (Schritt 7).
8. **Overkill-Risiko** — der Kern-Mehrwert der Presse (SQLite-Mirror, sync, FTS5) zielt auf grosse Remote-APIs; bei unserer lokalen Datei-API bleiben als Gewinn die Agent-Konventionen + Skill + MCP "gratis" aus einem Spec. Wenn Schritt 7 negativ ausfaellt: Mini-MCP von Hand, die `openapi.yaml` aus Schritt 4 ist in beiden Faellen nicht verloren.
9. **Governance-Risiko Upstream** — junges Projekt, Bus-Faktor ~2, 180 offene Issues: Release pinnen, Reprints bewusst und nicht automatisch fahren.
10. **Leons vorgelagerte Weiche** (`docs/ki-strategie.md` §6) bleibt offen: KI nur zur Autoren-/Build-Zeit oder auch im deployten Editor? Davon haengt ab, ob die Builder-API je ueber die Autoren-Maschine hinaus muss (Companion-Dienst) — der gesamte Plan hier ist auf die Autoren-Maschine beschraenkt und praejudiziert diese Entscheidung nicht.

---

## 7. Print-Beweis + Bewertung (erbracht 2026-07-21, Windows 11)

Schritt 5/6 des Plans durchgefuehrt. Ergebnis: **Der spec-first-Print funktioniert vollstaendig nativ auf Windows.**

### Was bewiesen ist

- **Toolchain:** Go 1.26.5 (winget, Hash-verifiziert). Printing Press auf **v4.29.0 gepinnt** via `go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@v4.29.0`. Windows-Gotchas bestaetigt + geloest: (a) `git config --global core.longpaths true` noetig; (b) `go` muss im PATH der Shell sein, in der PP laeuft (sonst schlaegt das interne `go mod tidy`-Gate mit Exit 3 fehl — kein Qualitaetsproblem).
- **Generierung** aus unserer `openapi.yaml` (6 Ressourcen, 9 Endpoints): alle Validierungs-Gates **PASS** — `go mod tidy`, `govulncheck` (Vuln-Scan), `go vet`, `go build`, lauffaehiges Binary, `--help`/`version`/`doctor`. Erzeugt: `flowcode-builder-pp-cli` + stdio-`flowcode-builder-pp-mcp` + `.mcpb`-Bundle. PP erkennt korrekt `auth: not required` (x-auth-type: none).
- **CLI gegen den echten Server (:3113):** `doctor` → `api: reachable`, `base_url: http://127.0.0.1:3113`. `builder status --agent` → **live**-Antwort (name/version/komponentenTypen/9 Routen). Der Next-308-Redirect (trailingSlash) wird von Gos http.Client sauber gefolgt.
- **MCP-Server (stdio):** `initialize` + `tools/list` liefert **26 Tools** — u.a. `builder_status`, `puck-seite_{lade,liste,speichere,loesche}`, `abbild_aktion`, `assets_aktion`, `vektorisieren_vektorisieren`, `flowcode-builder-autoren-import_grafik-setup`. Ein MCP-Client (Claude Code) kann das direkt einbinden.
- **PP-Scorecard: 77/100, Grade B** (deterministischer Print ohne LLM-Polish). Stark: Auth/Error-Handling/Doctor/Agent-Native/MCP-Desc-Quality/Local-Cache (10/10). Schwach: Insight 2/10, Cache-Freshness 3/10, Vision 6/10 — allesamt LLM-/Store-Features.

### Windows-Frage aus §6.1 — beantwortet

Generator, gedruckte Binaries **und** MCP-Server laufen alle nativ auf Windows. Nur die Skill-Loop-**Automatik** (`/printing-press`-Slash-Command, `install.sh`) ist unix-lastig — die brauchen wir aber nicht, weil wir `generate` direkt aufrufen. **Der spec-first-Weg umgeht die Windows-Luecken vollstaendig.**

### Bewertung: lohnt der Print? — Ja, mit einer Optimierung

Aus einer Spec entstehen in ~30 s (nach Toolchain-Setup) ein CLI mit 20+ Kommandos + stdio-MCP mit produktions-tauglichen Agent-Konventionen (`--agent`/`--json`/`--compact`/`--dry-run`/`doctor`/`agent-context`), typisierten Exit-Codes und einem Vuln-Scan — von Hand waeren das Tage. Die `openapi.yaml` bleibt Single Source of Truth.

**Zum self-learning-Loop (KORRIGIERT 2026-07-21):** Frueher hier als „Overkill, mit `learn.disabled` abschalten" eingestuft — **das war falsch** (Token-Kosten-Denke; Token-/LLM-Kosten sind kein Ablehnungsgrund, wir haben lokale Modelle). Am Code verifiziert: `internal/learn` im gedruckten CLI ruft **kein** LLM auf (kein `net/http`, kein `exec`) — es ist reines SQLite + Jaccard-Token-Matching + `entity_lookups` (`internal/learn/doc.go`). „LLM-fired" heisst „**vom aufrufenden Agenten** gefeuert", nicht „ruft selbst ein LLM". Damit ist der Loop **deterministisch und modell-agnostisch**: jeder Agent (Claude, Paperclip-Worker oder ein lokales Gemma/Qwen) ruft `recall`/`teach` identisch und kostenlos auf. Der Wert liegt in den **Playbooks + Notes** — gelernte Choreografien + Gotchas fuer unsere mehrschrittigen Workflows (Import→Konflikt→Speichern, Massen-Migration). **Behalten, nicht abschalten.** — Einziger Ort mit echtem LLM-Backend ist der *Generator* selbst: `internal/llm/llm.go` shellt fuer optionale Schritte (research/vision/`--polish`) hart an `claude` (Fallback `codex`) via `exec.LookPath`, ohne Env-Var/Ollama-Pfad. Auf ein lokales Modell zeigbar ueber einen `claude`-kompatiblen Shim (`claude -p <prompt> --output-format text` → Ollama), aber nur noetig fuer den LLM-veredelten `--polish`-Print — unser spec-first `generate` braucht es nicht.

### Reproduktion (Windows)

```powershell
# einmalig
winget install --id GoLang.Go        # Go >= 1.26.5
git config --global core.longpaths true
go install github.com/mvanhorn/cli-printing-press/v4/cmd/cli-printing-press@v4.29.0

# drucken (go MUSS im PATH sein)
$env:PATH = "C:\Program Files\Go\bin;" + $env:PATH
cd <ordner-mit-openapi.yaml>
cli-printing-press generate --spec ./openapi.yaml --name flowcode-builder `
  --mcp-transport stdio --spec-source official --output <ziel-ausserhalb-des-next-repos>
```

Das gedruckte Go-Projekt gehoert **nicht** ins Next.js-Repo (falscher Stack). Solange es Evaluierungs-Artefakt ist, lebt es im Scratchpad; wird es produktiv, bekommt es ein eigenes Repo `flowcode-builder-cli` (Ordner == Repo-Name). Reproduzierbar aus `openapi.yaml` — deshalb ist nur der Vertrag versioniert, nicht das Erzeugnis.

### Naechste offene Schritte

- self-learning **bleibt an** (s.o.) — der Wert entsteht, sobald ein Agent den MCP real nutzt und Playbooks/Notes wachsen; kein Umbau noetig, weil deterministisch + modell-agnostisch.
- MCP in Claude Code registrieren (§6.3): `.mcpb`-Bundle liegt vor; der genaue Registrierungsweg (`claude mcp add` vs. `.mcp.json`) ist noch nicht durchgespielt.
- Optional spaeter: `claude`-Shim auf lokales Modell (Ollama) fuer LLM-veredelten `--polish`-Print — nur bei Bedarf.
- Paperclip-Worker-Roundtrip (§6.5): Worker ruft das gedruckte CLI — nur an der lokalen Paperclip-Instanz pruefbar.
- Puck-Editor (`/puck`) von localStorage auf die neue Seiten-API umstellen; R2c-Agent-Panel-Plugin (docs/puck-erweiterungsebene.md §6).