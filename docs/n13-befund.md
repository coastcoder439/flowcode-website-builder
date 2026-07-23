# N13-Befund — „Together, WEE can." + CTA-Buttons unsichtbar in Vorschau/Export

*Auftrag X6 · Spec `docs/plan-analyse/lens-preview-export.md` §3-S6 · Mangel N13
(maengelliste-final.md §7) · geprüft 2026-07-23.*

## Verdikt (dreiwertig)

**ECHTER BUG — bestätigt (CONFIRMED). Kein Headless-Mess-Artefakt.**

Die Hero-Überschrift „Together, WEE can." und die CTA-Buttons „Über uns" /
„Unterstütze uns hier" sind in Station 4 **und** im deploybaren Ordner-Export
tatsächlich unsichtbar — reproduziert in einem **echten, sichtbaren Chrome**
(headed, `channel:"chrome"`), also mit echter GPU/Compositor-Pipeline. Der
frühere Verdacht „Blur + Scroll-Animation blockieren nur den Automations-
Screenshot-Kanal" (§10) ist damit **widerlegt**: es ist echt weg, nicht nur im
Screenshot.

Der Bug liegt jedoch **nicht** in der Preview-/Export-Linse (dieser Code), sondern
in **importierten Daten** — er ist ein Geschwister von **M4** (Import friert
Einblende-Animationen im Startzustand ein). Preview und Ordner-Export **decken die
Import-Lücke korrekt auf** (§5 der Lens-Spec: „mein Export deckt Import-Lücken auf,
behebt sie aber nicht").

## Prüfmethode

Harness: `scripts/n13-verify.mjs` (headed Chrome, viewport 1440×900).

1. Aktive Website = `wee-v3-fein` (Startseite mit dem Hero) per localStorage gesetzt.
2. Station 4 (`?station=preview`, In-Memory-iframe) geöffnet → Screenshot.
3. „Als Ordner exportieren" ausgelöst → `export/wee-v3-fein/` + `public/export/wee-v3-fein/`.
4. `export/wee-v3-fein/index.html` **direkt via `file://`** im selben echten Chrome
   geöffnet → Screenshot (der geforderte Echt-Chrome-Weg, nicht der Automations-Kanal).

## Belege

Screenshots (`scripts/.abnahme/`):

| Datei | Zeigt |
|---|---|
| `n13-memory-iframe.png` | Station-4-Vorschau (In-Memory): Hintergrund da, **Hero-Text + Buttons fehlen** |
| `n13-station4-full.png` | Ganze Station-4-Shell (Kontext) |
| `n13-export-index.png` | Deploybares `export/…/index.html` in echtem Chrome: **Hero-Text + Buttons fehlen** |
| `n13-export-index-full.png` | Ganzseiten-Screenshot des Exports (Kontext) |

Beide Screenshots zeigen identisch: das Hero-Hintergrundbild (grünes Tal) lädt
sauber, der Header/Nav lädt, der Cookie-Hinweis lädt — **nur der Hero-Block-Inhalt
ist leer**.

DOM-Messung (Harness-Ausgabe, für Preview UND Export identisch):

- Hero-`<h1>` „Together, WEE can." vorhanden, im Viewport, `opacity: 1`,
  aber **`visibility: hidden`**.
- Beide Buttons vorhanden, im Viewport, `opacity: 1`, **`visibility: hidden`**.

Ancestor-Kette (Trace): Der Abschnitt `section.block-hero.block-hero--image` ist
`visible`; sein Kind
`div.container.block-hero__inner.block-hero__inner--above-curtain` ist
`visibility: hidden`, und alle Kinder (`block-hero__content` → `block-hero__glass`
→ `<h1>` / Buttons) **erben** dieses `hidden`.

## Ursache (mechanistisch)

Der Hero-Inhalts-Wrapper trägt einen **eingefrorenen Inline-Stil**:

```
class="container block-hero__inner block-hero__inner--above-curtain"
style="… position: relative; z-index: 6; display: flex; …; visibility: hidden;"
```

Auf der Original-WEE-Seite ist `--above-curtain` der Inhalt, der „über dem Vorhang"
liegt und **vom Vorhang-Intro-JS** erst nach Ablauf der Vorhang-(Baum-)Animation auf
`visibility: visible` gesetzt wird (vgl. auch die CSS-Regel
`.tc-hero--curtain .block-hero__inner{visibility:hidden}` in der übernommenen
Site-CSS). Beim **Import** wurde der DOM-Zustand **mitten im Vorhang-Intro**
eingefroren → das Inline-`visibility: hidden` steckt fest in den gespeicherten
Puck-Daten.

**Nachweis, dass es import-eingefroren ist (nicht vom Generator erzeugt):**

- `seiten/wee-v3-fein.json` enthält `visibility: hidden` **3×** direkt im
  gespeicherten Markup des `--above-curtain`-Wrappers.
- Der Generator (`components/embed/ordner-export.ts`,
  `components/embed/embed-export.ts`) und der CSS-Rewriter
  (`lib/import/css-rewrite.ts`) fassen `visibility` **nirgends** an — sie
  übernehmen das Markup 1:1.

Da der statische Export bewusst **nur** `wee-embed.js` (unsere Animations-Runtime)
mitliefert und **nicht** das bespoke Vorhang-Intro-JS der Quellseite (§2 der
Lens-Spec), wird der Vorhang nie „gehoben" → der Hero bleibt dauerhaft
`visibility: hidden`. Auf einem echten Host wäre die Startseite dadurch ohne
Hero-Titel und ohne CTA — ein echter Deploy-Schaden.

## Warum hier KEIN Export-seitiger Code-Fix (dokumentierte Abweichung)

Der Auftrag sieht „echter Bug → minimal fixen" vor. Der **minimale korrekte Fix
liegt aber außerhalb dieser Linse** und ein Fix *innerhalb* dieser Linse wäre ein
maskierendes Pflaster:

1. **Quelle nie umschreiben (VERBINDLICH):** „Übernehmen statt Umschreiben" /
   „Builder ändert die Quelle nie". Das Inline-`visibility: hidden` aus dem
   gespeicherten Puck-Markup zu strippen, hieße die Import-Quelle umzuschreiben —
   verboten.
2. **Kein result-getriebenes Pflaster:** Ein additiver
   `…--above-curtain{visibility:visible !important}`-Override im gemeinsamen
   Generator würde zwar das Inline-`hidden` überstimmen, aber (a) WEE-spezifisch
   hart verdrahten, (b) die eigentliche Datendefekt-Ursache (Import-Freeze)
   verdecken und (c) nur `visibility` und nur den Vorhang treffen, während andere
   JS-getriebene Reveals der Quellseite gleich gelagert kaputt blieben. Das
   widerspricht der Regel gegen ergebnisgetriebene Kaschierung einer noch
   fehlerhaften Kette.
3. **Linsen-Grenze (Spec §5):** Import-Vollständigkeit gehört der Import-Linse;
   der Export deckt Lücken auf, behebt sie nicht.

Der Preview-/Export-Code selbst ist **korrekt** (er liefert getreu ab, was
importiert wurde) — verifiziert: `tsc --noEmit` Exit 0; `api-roundtrip.mjs`
52 grün; alle `scripts/tests/*.mjs` grün. Es gab daher **keinen Fix an diesem
Linsen-Code** anzuwenden.

## Empfohlener Fix (Owner: Import-Linse, M4-Klasse)

Beim Import den **post-Vorhang-Endzustand** einfrieren statt des Intro-
Startzustands — analog zu M4 (dort wurde `opacity: 0` → gerenderter Endzustand
eingefroren). Konkret eine der beiden Optionen:

- Beim Import-Freeze auf `.block-hero__inner--above-curtain` (bzw. jedem
  Vorhang-gegateten Knoten) das Inline-`visibility: hidden` in `visible`
  überführen, **oder**
- die Vorhang-Gate-Klasse/`--curtain`-Kopplung beim Import auflösen, sodass der
  gespeicherte Endzustand der sichtbare ist.

Danach `scripts/n13-verify.mjs` erneut laufen lassen — Erwartung: Hero-Titel +
CTA-Buttons in beiden Screenshots sichtbar.

## Wiederholbarkeit

```
# Dev-Server auf 3113 muss laufen
node scripts/n13-verify.mjs
# → Screenshots scripts/.abnahme/n13-*.png + DOM-Messung als JSON auf stdout
```
