# Design-Vorgaben (Leon, 2026-07-23 — Grundlage für M24/R5, Designsystem in Festlegung)

> Status: **Leons erste verbindliche Farbregeln** (wörtlich + meine Interpretation, die er noch bestätigt).
> Basis-Token-Quelle: WEE-Designsystem `wee-website-refactoring/Information/World Eden Era Design System
> - Standalone.html` (+ `design-tokens.css`: `--sand-50..300`, `--green-300..600`, `--accent-500` = Orange).
> Das vollständige Designsystem ist noch nicht festgelegt — offene Punkte unten.

## Leons Regeln (wörtlich)

1. „Nur **dezente Töne für Flächen** nutzen — alle Grüntöne inkl. und unter 500 **nicht**."
2. „**Orange und 500er-Grün für Signal** ist okay."
3. „Ansonsten **recht hell**, mit **Sandfarben** und **Dunkelgrün** — aber **Dunkel nicht großflächig!**"

## Meine Interpretation (zur Bestätigung durch Leon)

- **Flächen** (Panels, Hintergründe, Karten): nur dezente, helle Töne — v. a. **Sand-Töne**
  (`--sand-50/100/200/300`) und Weiß-nahe. **Keine Grüntöne als Flächenfarbe** (weder `green-500` noch
  hellere 400/300er).
- **Signal/Akzent** (Buttons, aktive Zustände, Hervorhebungen): **Orange** (`--accent-500`) und
  **`green-500`** erlaubt.
- **Dunkelgrün** (`green-600`+): erlaubt für Text, Linien, kleine Akzente — **nie großflächig**
  (kein dunkles Panel, keine dunklen Vollflächen).
- Konsequenz fürs Editor-UI: Das heutige **dunkle Panel widerspricht der Vorgabe** → Umbau auf helles,
  sandbasiertes UI mit Orange/Grün-500 als Signalfarben. (Zur Bestätigung.)

## Bestätigt (Leon, 2026-07-23 — „jo")

1. **Hell-Modus:** ✅ Editor-Panels hell/sand statt dunkel (Interpretation bestätigt).
2. **Typografie:** ✅ WEE-Fonts (Syne/Montserrat) auch fürs Tool-UI.
3. **Weitere Regeln:** ✅ Standalone-Designsystem + Farbregeln; Rest nach fachlichem Ermessen mit
   Leons Abnahme.
4. **M25-Zielbild:** ✅ mit Präzisierung — der Export ist **primär (nicht ausschließlich) auf den
   Webbuilder ausgelegt**: Kernweg = **Ordner-Struktur-Export** (fertiger, deploybarer statischer
   Ordner der im Builder gebauten Seite MIT Animationen). Das **Export-Menü ist primär darauf
   ausgerichtet**; Fremdseiten-Wege (Overlay/Runtime/Element) bleiben nachgeordnete Zusatzoptionen.
