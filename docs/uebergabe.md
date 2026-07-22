# Übergabe — Flowcode Website Builder

> Stand: **2026-07-22, nach dem Wellen-Bau 0–4** (Fable orchestriert, Opus gebaut, Sonnet browser-verifiziert).
> Evergreen-Datei: bei Fortschritt aktualisieren. Die frühere Fassung („Boot → R2a → R2b") ist obsolet —
> sie hatte Leons Editor-Kern-Anweisungen übersprungen und Sessions im Kreis laufen lassen. Diese Fassung
> ist gegen den echten Session-Verlauf + Git-Log geschrieben.

---

## Architektur (VERBINDLICH — Decap ist GESTRICHEN)

**ZWEI Schichten:** **Animation** = unsere Tools (Editor unter `/editor`) · **Komposition + Inhalt = Puck**
(`@puckeditor/core` 0.22 — NICHT „Puck CMS"). Inhalt = Props der Puck-Bausteine, gespeichert als
`seiten/<name>.json` in Git. **Kein separates CMS** (kein Decap, kein Sveltia — nie wieder vorschlagen).
Deploy = Static Export (`output:"export"`), die Autoren-API existiert nur unter `next dev` (Port 3113,
Loopback, CSRF-Origin-Gate). Leitplanken: Builder ändert die Quelle nie (Abbild-Prinzip) · additiv, nie
löschen · optische Abnahme ausschließlich Leon · proaktiv ins Projekt-Repo committen.

## Was steht (Wellen 0–4, alle browser-verifiziert + Gate-geprüft)

- **EIN Editor auf `/editor`** (Alt-Routen redirecten): Objekte statt Modi — Grafiken + **Fluss als
  Objekt** (Fokus-Modell). 8 Reiter nach User-Reise: Bibliothek · Ebenen · Objekt · Animation · Seite ·
  Hintergrund · Speichern · Export.
- **Gesamt-Animator** (Leons AP-I): Assets frei animieren, **Animations-Presets** („voranimierte Assets")
  speichern → Bibliothek → anwenden; Fluss-Undo/Redo (Dispatch nach Objekt-Fokus); Tutorial „Willkommen
  im Editor" + „?"-Hilfen überall inkl. Fluss (AP-E).
- **Website-OG** (AP-D): alles getaggt (`data-og-id`/`data-og-typ`), „Website (Ist-Stand)"-Gruppe in den
  Ebenen, Alt+Klick-Direktauswahl, „In den Builder holen" für Bilder/SVGs.
- **Element-ID-Anker**: Keyframes ankern automatisch am nächsten Seiten-Element (bewiesen drift-fest),
  lösbar, rückwärtskompatibel.
- **Export**: JSON · HTML-Overlay · Runtime · Fluss-SVG · **Einzelelement als CSS-Scroll-Driven-Animation**
  (mit JS-Fallback) · **Ganze Seite als eine HTML-Datei**.
- **Seiten-Bereich** („Animator | Seiten"-Umschalter): Puck-Editor über die Seiten-API
  (`/api/puck-seite/*`, Konflikt-Modell `erwartetGespeichert`/409).
- **Ordner-Import** (Leons „das letzte was fehlt", Stufe-C-light deterministisch): Ordner wählen →
  DOM-Zerlegung → Bausteine SektionBlock (Slot) / TextBlock / BildBlock / HtmlBlock (entschärft) →
  **Bericht zuerst** (Zähler + Geflaggt-Liste: script/iframe/on*/Styles raus) → speichern → in Puck
  editierbar. Assets: <300 KB Data-URL, sonst `public/import/<slug>/` via `/api/import/asset`.
- **Fusion** (Leons Relativ-Koordinaten-Problem): Puck-Bausteine tragen `data-og-id="puck:<id>"` →
  Anker greifen nativ; **Puck-Seite als Animator-Bühne** (Hintergrund → „Eigene Seite"); **`anim` im
  Seiten-Dokument** (eine Datei = Seite + Animation); Export fusioniert Markup + Animation.
- **Verlustfreiheits-Beweis:** `docs/checklisten-gate-welle2.md` — komplettes Feature-Inventar, 0 verloren.
- **Agenten-Schnittstelle** (Vorarbeit, nachrangig): `openapi.yaml` (27/27-Roundtrip via
  `scripts/api-roundtrip.mjs`), Printing-Press-CLI+MCP aus der Spec bewiesen (`docs/agent-schnittstelle.md`).

Schlüssel-Docs: `editor-vereinheitlichung.md` (Bauvorlage §1–§9) · `feature-inventar.md` ·
`checklisten-gate-welle2.md` · `puck-erweiterungsebene.md` · `ki-strategie.md` · `agent-schnittstelle.md`.

## Offen (ehrlich)

1. **Leons optische Abnahme von ALLEM** — der gesamte Wellen-Bau ist technisch verifiziert, aber optisch
   ungeprüft. Abnahme-Pfad: `npm run dev` → `http://localhost:3113/editor` → Tutorial öffnen → Fluss
   fokussieren → Preset-Roundtrip → Seiten-Bereich → Import mit echtem Ordner → Fusion (Hintergrund →
   Eigene Seite → Grafik ankern → „Animation in Seite speichern" → Export öffnen).
2. **Bekannte bewusste Grenzen:** Import verliert Styling (geflaggt, Stufe-C-light); Lottie im
   Element-Export statisch; Element-Snippet nutzt absolute Scroll-Range; Anker im Ganze-Seite-Export
   statisch eingefroren (Runtime liest ankerId nicht); Fluss-Fokus ohne platzierte Grafik nur über
   Grafik-Auswahl verlassbar; anim-Lade-confirm kann beim Reload als Reibung auffallen.
3. **Upscaling** (schweres Modell, bewusst verschoben) · **Import-Stufe B/C mit LLM-Veredelung** (lokales
   Modell — Tokenkosten sind KEIN Gegenargument) · **R5 Dashboard im AgenticOS**.
4. **Agenten-Strang** (nachrangig bis Leons Abnahme): learn-Loop bleibt AN (deterministisch), MCP in
   Claude Code registrieren, Paperclip-Worker-Roundtrip, R2c-Agent-Panel-Plugin (puck-erweiterungsebene.md §6).
5. Test-Artefakte untracked: `seiten/rt-4c.json`, `abbilder/welle3b-verifikation.json` (Verify-Reste —
   löschen nur mit Leons Einzelbestätigung).

## Kritische Gotchas (unverändert gültig)

- **NIE `npm run build` während der Dev-Server läuft** (teilen `.next`; Builds via `NEXT_DIST_DIR`).
  POST-API-Routen brechen den Static-Export-Build ohnehin — Autoren-API ist dev-only (dokumentierter
  Architektur-Konflikt, s. `app/api/vektorisieren/route.ts`-Kopf).
- Registry-SYNCHRONPFLICHT: neue Puck-Bausteine in `app/puck/puck.config.tsx` UND `lib/puck-registry.ts`.
- Ordner-Modi (Import + Backdrop) nur Chromium (File System Access API).
- imgly-Freistellen ist AGPL, lazy geladen.
- WEE-Original nie referenzieren; `curtain.config.json` wird nur gelesen; einziger Live-Schreibpfad in
  die Landing ist „Als Standard setzen" (`grafik.config.json`, mit confirm).
