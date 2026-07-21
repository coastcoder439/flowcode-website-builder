# Flowcode Website Builder

Selbst-gehosteter, freier **visueller Scroll-Animations- & Website-Builder**
(Wix-/Elementor-Klasse als Ziel). Herausgelöst als eigenständiges Whitelabel-Produkt
aus dem WEE-Prototyp — WEE ist ab hier nur noch *ein* Demo-Fall, nicht mehr der Kern.

> Next.js 15 (App Router) · React 19 · `motion/react` · TypeScript strict · `output: export`

## Was drin ist

| Werkzeug | Ordner | Zweck |
|---|---|---|
| **Grafik-/Animations-Editor** | `components/grafik`, `app/grafik-editor` | Assets platzieren, Scroll-Keyframes mit Bézier-Kurven, Vektorisieren, Mehrfachauswahl, Snapping, Zeitleiste, Undo/Redo |
| **Fluss-Editor** | `components/river`, `app/fluss-editor` | Knoten-basierter Fluss inkl. Partikel; selbsttragende Profile (Snapshot) |
| **Vektorisierer** | `components/vektor`, `app/api/vektorisieren` | Raster → SVG, jede Farbfläche ein eigener animierbarer Pfad |
| **Backdrop** | `components/backdrop` | Fremde Seite als Hintergrund laden: Screenshot · Single-File-HTML · **ganzer Ordner** (Service Worker) |
| **Embed/Export** | `components/embed`, `scripts/build-embed.mjs` | Export als vollständige JSON-Config · HTML-Overlay · Runtime-Script (`wee-embed.js`) |
| **Vorhang-/Baum-Engine** | `components/title-curtain` | Config-basierter Parallax-Vorhang (Demo-Fall) |

Die konkreten Grafiken, Berge, Bäume und der Fluss-Verlauf in `public/` +
`*.config.json` sind **Demo-Fixtures**, damit das Tool „aus der Box" etwas zeigt.

## Starten

```bash
npm install
npm run dev          # http://localhost:3113
```

Editoren:
- `/grafik-editor` — Grafik- & Scroll-Animations-Editor
- `/fluss-editor` — Fluss-Editor
- `/` — Demo-Seite (backdrop-fähig)

Embed-Bundle bauen (für den Export nötig):

```bash
npm run build:embed  # erzeugt public/wee-embed.js (gitignored, reproduzierbar)
```

## Roadmap & Architektur

Der vollständige Plan liegt in `docs/`:
- [`docs/zielbuild-und-stand.md`](docs/zielbuild-und-stand.md) — Zielbild, Drei-Schichten-Architektur, Ist-Stand, Roadmap R1–R5
- [`docs/builder-plan.md`](docs/builder-plan.md) — ausführlicher Master-Plan
- [`docs/canva-connect-vorlage.md`](docs/canva-connect-vorlage.md) — Canva-Connect-Recherche

Kurz: **Animation** = diese Tools (Alleinstellungsmerkmal) · **Komposition** = Puck-Editor
(geplant) · **Inhalt** = Decap (geplant). Der **Website-Importer** (bestehende Seite →
editierbar) ist ein eigener Baustein (Adapter/Codemod/Agent), kein Fremd-Feature.

## Herkunft

Extrahiert aus `wee-website-refactoring/.../wee-website-ben-refactor/v3` (sauberer
Git-Neustart, ohne WEE-Entwicklungs-Screenshots). Der WEE-Ursprung bleibt dort
unangetastet lauffähig; dieses Repo ist die generische Weiterführung.
