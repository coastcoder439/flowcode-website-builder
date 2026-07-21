# Übergabe — Flowcode Website Builder

> Stand: 2026-07-21 · Übergabe für die nächste Session. Enthält einen paste-fertigen
> Startprompt (unten) + den vollständigen Kontext. Evergreen-Datei: bei Fortschritt aktualisieren.

---

## Startprompt (in die neue Session kopieren)

```text
Wir arbeiten am Projekt flowcode-website-builder (Ordner
user-projects/flowcode-website-builder/, privates Repo
coastcoder439/flowcode-website-builder, Branch main). Es ist die frische
Whitelabel-Extraktion unseres Scroll-Animations-/Website-Builders aus dem
WEE-Prototyp — Ziel: self-hosted, freier visueller Editor der Wix/Elementor-Klasse.

Lies zuerst zur Orientierung:
- docs/uebergabe.md (diese Übergabe, Abschnitt "Nächste Schritte")
- docs/zielbuild-und-stand.md (Zielbild, Architektur, Roadmap R1–R5)
- docs/builder-plan.md (ausführlicher Master-Plan)

Aufgabe dieser Session, in dieser Reihenfolge:
1) BOOT-VERIFIKATION: npm install im Projektordner, Dev-Server via preview_start
   (Port 3113) starten, /grafik-editor und /fluss-editor + / (Demo) im Browser
   prüfen, ein Screenshot als Beweis, dass die Extraktion eigenständig läuft.
   Konsole/Netzwerk auf Fehler prüfen. KEIN "npm run build" während der Dev-Server
   läuft (teilt sich .next) — falls ein Build nötig ist, NEXT_DIST_DIR nutzen.
2) R2a PUCK-SPIKE: @puckeditor/core installieren, eine kleine puck-config anlegen,
   die EINE bestehende Komponente registriert (render delegiert an die vorhandene
   Komponente), und in einer Editor-Route (/puck o.ä.) beweisen, dass sie dort
   editierbar ist. Klein halten, isoliert, nichts Bestehendes anfassen.
3) Danach melden für R2b (Website-Importer Stufe A).

Wichtig: optische Abnahmen macht ausschließlich Leon (ich liefere nur Technik +
Screenshots, kein Optik-Urteil). Häppchenweise arbeiten. Proaktiv ins Projekt-Repo
committen + pushen (git -C auf den Projektordner), nie in den Workspace.
```

---

## Was in dieser Session passiert ist (2026-07-21)

- **Whitelabel herausgelöst**: ganzer Builder aus `wee-website-refactoring/.../wee-website-ben-refactor/v3`
  **kopiert** (nicht geschnitten) → WEE-Original bleibt unangetastet lauffähig.
- **Neues privates Repo** `coastcoder439/flowcode-website-builder` (Branch `main`) angelegt + gepusht
  (166 Dateien, 22 MB). Sauberer Git-Neustart (keine Historie mitgenommen).
- **Kuratiert weggelassen**: WEE-Entwicklungs-Screenshots (`docs/*.png` ~76 MB), `scripts/.tmp/`,
  Build-Artefakte, ein geleaktes Dev-Log. Kein `.env`/Secret im Repo (geprüft).
- **Enthalten**: Grafik-/Fluss-/Vektor-/Backdrop-/Embed-Tools + `title-curtain` (Vorhang/Bäume) +
  Berge/Deko + `public/`-Assets + `*.config.json` (Demo-Fixtures) + die drei Plan-`.md`.
- `package.json` → name `flowcode-website-builder` v0.1.0. README neu (generisch).
- In Workspace-`.gitignore` als **12. Projekt** registriert (verifiziert: Workspace trackt den
  Inhalt nicht), committet + gepusht nach `coastcoder439/flowcode-agentic-os`.

## Nächste Schritte (Reihenfolge)

1. **Boot-Verifikation** (billig, beweist die saubere Extraktion) — `npm install` + Dev-Server `:3113`,
   Editoren + Demo prüfen, Screenshot. `node_modules` wurde bewusst NICHT mitkopiert.
2. **R2a Puck-Spike** — eine Komponente in eine `@puckeditor/core`-config registrieren und editierbar beweisen.
3. **R2b Website-Importer Stufe A** — deterministischer Adapter: unser config-getriebener Seiteninhalt → Puck-`content[]`.

## Offene R1-Reste (aus dem WEE-Bau übernommen)

- Fluss-Editor: Tutorial + „?"-Hilfen (Grafik-Editor hat sie schon).
- Website-OG voll: ALLES taggen (`data-og-*`), Seiten-Objekte direkt anklicken, Auto-„Ist-Stand"-Ebene.
- Element-ID-Anker (Präzision über die Höhen-Normalisierung hinaus).
- Upscaling (echtes KI-Modell, serverseitig).
- Live-Abnahme durch Leon/Ben (Freistellen-Erfolgsfall, Ordner-Picken, laufende Scroll-Animation).

## Kritische Gotchas

- **NIE `npm run build`, während der Dev-Server läuft** — beide teilen `.next` und zerschießen sich.
  Für isolierte Builds `NEXT_DIST_DIR` setzen (siehe `next.config.mjs`: `distDir` liest die Env-Var).
- **Dev-Port 3113** (`package.json` scripts.dev). Editoren: `/grafik-editor`, `/fluss-editor`, Demo: `/`.
- **Embed-Bundle** `public/wee-embed.js` ist gitignored + reproduzierbar via `npm run build:embed`
  (läuft auch automatisch vor `next build`).
- **imgly Background-Removal** ist AGPL, lazy geladen; Modell-Download kann in Sandbox scheitern (Ben testet live).
- **Ordner-Backdrop-Modus** nur Chromium (File System Access API).
- **WEE-Original NIE referenzieren/verändern** — dieses Repo ist ab jetzt eigenständig.
- Optik-Abnahme ausschließlich durch Leon.

## Zielbild (Kurzform)

Drei Schichten: **Animation** = unsere Tools (fertig) · **Komposition** = Puck-Editor `@puckeditor/core`
(NICHT „Puck CMS", ein unverwandtes C#-Produkt) · **Inhalt** = Decap. Der **Website-Importer** ist ein
eigener Baustein (Stufe A deterministischer Adapter / B Codemod+Agent / C LLM-Agent), KEIN Puck-Feature.
Vollständig: `docs/zielbuild-und-stand.md`.
