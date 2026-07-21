# KI-Strategie / KI-Landkarte — flowcode-website-builder

> Stand: 2026-07-21. Ergebnis einer Multi-Agent-Recherche (4 Dimensionen —
> Paperclip-Anschluss · KI-Hebel · Infrastruktur · Referenz-Editoren) mit
> adversarieller Verifikation (11 von 12 Verify-Verdikten ausgewertet; ein
> Verify-Agent scheiterte am Structured-Output-Retry und ist nicht eingeflossen).
> Lebt im Projekt-Repo, wird mit dem Projekt versioniert. **Entscheidungs-Doku** —
> die zentralen Weichen (Abschnitt 6) beantwortet Leon.
>
> Methodik-Hinweis: „Belegt" heißt hier: durch die adversariellen Verify-Verdikte
> gestützt. Spekulatives und Widerlegtes ist ausdrücklich als solches markiert.
> Alle Paperclip-Wire-Details sind nur an der laufenden lokalen Instanz
> (`localhost:3100`) verifizierbar, nicht aus der öffentlichen Doku.

---

## 1. Kernaussage

KI ist im Builder ausschließlich ein **Authoring-/Build-Zeit-Werkzeug**, niemals eine Laufzeit-Abhängigkeit — der Deploy ist reiner Static Export (`output:"export"`) ohne Server, der Browser eines Besuchers kann weder einen API-Key halten noch `localhost:3100` (Paperclip) erreichen. Der einzige Ort, an dem KI echten, nicht-deterministisch lösbaren Mehrwert liefert, ist der **Website-Importer Stufe B/C** (fremde Struktur → registrierte Puck-Bausteine mit ehrlichem Flagging); fast alles andere ist entweder schon deterministisch gelöst (Vektorisierer, Importer Stufe A) oder gehört in lokale ML-Modelle (Freistellen). Für den einen echten Agenten-Job ist der Claude Agent SDK in der Build-Pipeline der naheliegende Default; Paperclip lohnt nur, wenn ein beaufsichtigter Mehr-Rollen-Lauf (Engineer + Reviewer) wirklich gewollt ist.

## 2. Baustein-Landkarte

| Baustein | KI oder deterministisch | Begründung |
|---|---|---|
| Vektorisierer (Raster → SVG) | **Deterministisch (kein ML)** | Hauseigene TS-Pipeline (Quantisierung → Kontur → Bezier), 63–160 ms, formtreu >98 %. Kein LLM, kein neuronales Netz. Läuft korrekt — nichts ändern. |
| Freistellen (Hintergrund entfernen) | **Lokales ML** (onnxruntime-web + @imgly, im Browser) | Läuft bereits clientseitig, überlebt den Export, 0 Kosten, offline, bester Datenschutz. Vorbild für alle Pixel-Tasks. |
| Keyframe-/Fluss-/Scroll-Engine | **Deterministisch** | Eigene Animations-Tools, fertig. Keine KI. |
| Importer Stufe A (Config → Puck `content[]`) | **Deterministisch** | Mechanisches Mapping bekannter Bausteine, idempotent, testbar, reproduzierbar. Ein LLM wäre hier aktiv schädlich (Halluzination, Round-Trip-Brüche). |
| `data-og-*`-Tagging **eigener** Komponenten | **Deterministisch** | Die Komponente emittiert ihr Typ-Attribut selbst. Reine Daten-Attribute, additiv, kein Generieren. |
| Importer Stufe B (gleiche Struktur, Hand-JSX) | **Hybrid** | AST-Codemod (deterministisch) mappt den statischen Baum; KI-Agent nur für den nicht-mappbaren Rest, danach Serialisierungs-Gate + Review. |
| Importer Stufe C (beliebige Fremdseite) | **KI (Agent)** — Flaggschiff-Hebel | Unscharfe, urteilslastige Segmentierung ohne deterministischen Algorithmus. Output = Vorschlag mit ehrlichem Flagging, kein 1:1-Klon. |
| Alt-Text / SEO-Meta / Text-Rewrite | **KI (optional, noch nicht geplant)** — *spekulativ* | Content = serialisierbare Strings, round-trip-sicher. Aber: **existiert im Repo bisher NICHT und steht nicht im Plan** — wäre ein neues Feature, kein bestätigter Baustein. Alt-Text nur mit Pflicht-Review (falscher Alt-Text ist schädlicher als keiner). |
| Layout-/Design-Vorschläge | **KI (optional, niedrigste Priorität)** | Riskantester Hebel: muss valides `content[]` aus registrierten Blöcken liefern, **nie auto-apply** (Optik-Abnahme ausschließlich Leon), LLM-Layouts neigen zu generisch (Anti-Template-Regel). |
| Upscaling | **Lokales/Server-ML, kein Agent** — bewusst verschoben | Real-ESRGAN/Upscayl. Laut Plan **serverseitig/schwer**, optionale Spät-Phase — **nicht** die im Widerlegten behauptete lokale wasm-Variante. |

## 3. KI-Infrastruktur-Empfehlung (welcher Anschluss wofür)

**Harter Vorbehalt vorab:** Der ausgelieferte Static Export hat keine Server-Laufzeit. Jeder LLM-Call braucht entweder (a) die Build-/Dev-Pipeline auf der Autoren-Maschine, (b) einen separaten, vom Operator gehosteten Companion-Dienst, der den API-Key hält, oder (c) ein rein clientseitiges lokales Modell. Die exportierte Seite selbst darf **niemals** einen Anthropic-Key tragen (`dangerouslyAllowBrowser` ist ausgeschlossen — Key-Leak).

Daraus folgt eine **Drei-Kanal-Zuordnung** (keine Einheitslösung):

- **Lokale Modelle (onnx/wasm), im Browser:** die einzige Laufzeit-KI, die im Export läuft. Nur für eng umrissene Pixel-Tasks — **Freistellen (läuft schon)** und ggf. später Upscaling. Kein Claude, kein Paperclip. 0 Kosten, offline, bester Datenschutz. Fähigkeits-Deckel beachten: keine komplexe Struktur-/Code-Generierung.
- **Direkter Anthropic-SDK, in der Build-/Autoren-Pipeline** (nicht im Export): Default für alles, dessen Ergebnis in den statischen Build eingebacken wird — z. B. der bereits geplante Sonnet-Unteragent für Tutorials/Hilfe, oder (falls gewünscht) SEO-/Alt-Text-Entwürfe im Batch. Für den **dateilesenden Importer Stufe B/C** ist der schwerere **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) das batteries-included-Werkzeug: Claude Code als Bibliothek mit Read/Write/Edit/Bash/Glob/Grep + Agenten-Loop. Läuft auf eigener Infra, nie im Export.
- **Paperclip, nur für echt agentische Mehr-Schritt-/Mehr-Rollen-Läufe:** Importer Stufe C als beaufsichtigter Engineer-+-Reviewer-Lauf oder größere Build-Automationen mit Budget/Approval/Audit. **Nicht** als allgemeiner Anschluss für einzelne Calls.

**Wichtige Klarstellung zur 1-vs-2-Wahl:** Paperclip ersetzt Claude nicht — der `claude_local`-Adapter spawnt die lokale Claude-CLI als Kind-Prozess und reicht ein `--model` durch. Unter der Haube läuft in beiden Fällen dasselbe Claude. Die Wahl ist also **Orchestrierungs-Stil** (Team-als-Dienst mit Governance vs. eigene Bibliotheks-Calls), nicht Modellwahl.

**Zentrale Weiche, die vor jeder Integration zu klären ist:** Soll KI im *deployten* Editor zur Laufzeit funktionieren (dann braucht es einen Companion-Dienst oder lokale Modelle), oder reicht KI zur *Build-/Autoren-Zeit* (dann SDK-in-der-Pipeline, kein Companion nötig)? Diese Antwort entscheidet, ob überhaupt ein Companion-Service gebaut werden muss.

## 4. Paperclip-Anschluss: belegt vs. offen

**Belegt (durch offiziellen Code / Doku / adversariell bestätigt):**

- Paperclip ist eine **self-hosted Orchestrierungs-/Governance-Ebene** (Node-Server + Postgres, MIT), kein Inferenz-Anbieter. Es dirigiert vorhandene Agenten; der genutzte `adapter-claude-local` spawnt die lokale Claude-CLI.
- **Ausführungsmodell ist heartbeat-/wakeup-getrieben und asynchron** (Issue → Run → Callback/Poll), pro Run ein voller CLI-Subprozess, plus Budget-/Approval-/Cost-Governance. → Passt zu langlaufenden, governeten Jobs, **ungeeignet für synchrone In-Editor-Mikro-Tasks** („Alt-Text vorschlagen"). Dafür ist ein direkter API-Call der richtige Hebel. (Verify: bestätigt am installierten Server-Code.)
- Der schwere Setup (Postgres + Dauer-Sidecar + Agent-Anlege-Gotchas) **lohnt nur für Mehr-Rollen-Läufe**; für Einzeltransformationen ist der SDK schlanker. Im konkreten Fall ist der marginale Setup niedrig, weil Instanz + Team (Cooper/Ada/Rams) bereits stehen.
- Es gibt einen **First-Party MCP-Server** `@paperclipai/mcp-server` (Repo `paperclipai/paperclip`, stdio-Transport, dünner REST-Wrapper, ~38 Tools). Damit könnte ein MCP-Client wie Claude Code Paperclip-Issues steuern. **stdio heißt: nicht direkt per HTTP aus Browser/Server-Runtime aufrufbar** — gedacht für einen lokalen MCP-Client-Prozess.
- Anschluss technisch möglich in zwei Richtungen: REST auf `localhost:3100` (Issue anlegen → `heartbeat/invoke` → Run pollen) oder die eigene App als `http`-Adapter registrieren (Paperclip webhookt sie).

**Offen / nur lokal prüfbar (nicht als gesichert behandeln):**

- Ob die **installierte Paperclip-Version** mit der öffentlichen Doku deckt (Endpoints, Payloads, Feldnamen). Basis-Memory ist ~6 Tage alt.
- Ob der **Create-Agent-Silent-No-Op-Trap** (`adapterConfig` nur `{model, cwd}`) in der aktuellen Version noch existiert.
- Exaktes HTTP-Adapter-Webhook-Payload, Signatur/HMAC, Callback-Format auf der installierten Version.
- Ob Paperclip **zuverlässig strukturiertes JSON (Puck-Schema)** ausgeben kann — für constrained Generation ist der direkte Anthropic-API vermutlich verlässlicher, aber ungetestet.

**Ausdrücklich widerlegt — NICHT als Fakt weitertragen:**

- **Paperclip ist in den Projekt-Docs NIRGENDS dem Importer zugeordnet.** Die Docs benennen für Stufe C einen eigens gebauten „lokalen LLM-Agent-Importer", nicht das Paperclip-Team. Dessen Existenz ist belegt, eine Website-Import-Fähigkeit ist es **nicht**. Die Paperclip-für-Importer-Idee ist ein Vorschlag, kein dokumentierter Beschluss.
- **Es existiert kein In-Editor-Claude-API-Kanal** (kein Anthropic-SDK im Repo, nicht im Plan). Alt-Text/SEO/Rewrite via Claude sind **spekulativ**.

## 5. Empfohlener nächster KI-Schritt (klein, konkret)

**Kein Feature bauen — erst die Weiche stellen und das Schema-Fundament legen.** Konkret ein kleiner, isolierter **Stufe-C-Spike außerhalb des Repos**:

1. Aus der Puck-Config ein **maschinenlesbares Register aller registrierten Komponenten-Typen** ableiten (Grundlage jedes späteren KI-Mappings und jedes Validierungs-Gates).
2. Mit dem **direkten Anthropic-SDK** (nicht Paperclip, nicht Agent SDK) an *einer* echten Fremdseite testen: DOM/Assets clientseitig erfassen → Claude strukturiert in **flaches** `content[]` aus ausschließlich registrierten Typen, mit explizitem Flagging des Unabbildbaren.
3. Das Ergebnis **hart gegen das Register validieren** (nur registrierte, serialisierbare Blöcke überleben) und Trefferquote + Flag-Ehrlichkeit von Hand bewerten.

Das ist der billigste Weg, um zu messen, wie gut constrained Generation überhaupt trifft — bevor Infrastruktur-Entscheidungen (Companion-Dienst? Paperclip-Team? Agent SDK?) getroffen werden. Wichtig: **flach halten** — Anthropic Structured Outputs verbieten rekursive Schemas, Pucks echtes Slot-Modell ist aber rekursiv; ein einzelnes `json_schema` kann daher nur flaches `content[]` erzwingen, nicht den vollständigen verschachtelten Baum.

## 6. Offene Fragen für Leon

1. **Zentrale Weiche:** Soll KI im *deployten* self-hosted Editor zur Laufzeit funktionieren (z. B. „Alt-Text generieren"-Knopf beim Endnutzer), oder reicht KI zur *Build-/Autoren-Zeit* auf deiner Maschine? Davon hängt ab, ob überhaupt ein Companion-Dienst gebaut werden muss.
2. **Wer zahlt / wo liegt der Key:** eigener Anthropic-Key im Companion-Dienst (pay-per-token), oder Paperclips `claude_local` auf deinem Claude-Abo (Flat, aber Dauer-Sidecar)?
3. **Datenschutz beim Import fremder/Kunden-Seiten:** Ist es okay, deren Markup an Anthropic zu senden — oder muss das lokal bleiben (dann nur lokale Modelle, die für komplexes Seiten→Puck-Mapping aber zu schwach sind; ggf. Hybrid: lokal grob klassifizieren, nur Unkritisches an die Cloud)?
4. **Governance-Bedarf:** Rechtfertigt der Wunsch nach Budgets/Approvals/Audit-Trail (z. B. Multi-Kunden-Betrieb) den Paperclip-Overhead — oder reicht für den Einzelnutzer-Fall ein simpler direkter API-Call?
5. **Alt-Text/SEO überhaupt gewünscht?** Das ist bisher kein geplantes Feature. Wenn ja: wie tief soll die KI gehen (nur Entwurf) und wo greifen deterministische Guardrails (Längen-Limits, Deko-Regel `alt=""`)?
6. **Layout-Vorschläge:** überhaupt bauen? Wenn ja, ausdrücklich nur als „Startanordnung vorschlagen", nie auto-apply, immer mit deiner optischen Abnahme.

---
*Ehrlichkeits-Hinweis: Als gesichert markiert ist nur, was durch die adversariellen Verify-Verdikte gestützt ist. Der In-Editor-Claude-Kanal und die Paperclip-für-Importer-Zuordnung sind **Vorschläge/Spekulation**, kein dokumentierter Projekt-Stand. Alle Paperclip-Wire-Details (Payloads, Version, Gotchas) sind nur an der laufenden lokalen Instanz `localhost:3100` verifizierbar.*
