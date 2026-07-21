# Wassertropfen-Splash — Varianten für den Klecks-See

Drei autarke HTML-Prototypen für den Tropfen-Einschlag in den WEE-Klecks-See.
Jede Datei ist ein einzelner `<div>` mit eigenem `<style>` + `<svg>` (+ minimalem
Vanilla-JS für Klick-Neustart) — komplett kopierbar an beliebige Stelle, wie das
Original-See-Snippet. Keine externen Libraries, keine Netzwerk-Requests.

Gemeinsame Basis:
- Farbwelt exakt aus dem See-Snippet (Grund `#4395A7`, Ringe `#52A8B6 #68BAC4 #81CAD4 #96D5D5 #BCE8E5`, Sand `#DDB98B`, nasser Sand `rgba(38,62,36,0.6)`).
- viewBox `200×200`, Klecks-Umriss unverändert, Einschlagpunkt `104,92`.
- Deterministisch (feste Keyframes, kein `Math.random` zur Laufzeit).
- Läuft in Endlosschleife; **Klick auf den See spielt den Splash erneut ab**.
- `prefers-reduced-motion: reduce` → statisches, ruhiges Endbild (Tropfen/Splash ausgeblendet, nur der ruhige See).

## Varianten

### `splash-variante-1.html` — Dezent-Organisch
Weicher Aufschlag mit squash-and-stretch-Tropfen, drei asymmetrisch ausbreitenden
Wellenringen und vier feinen Mini-Spritzern in unregelmäßigen Richtungen — zurückhaltend,
natürlich, nah an der bestehenden Wasser-Ruhe der Seite.
**Tuning:** `--v1-cycle` (Gesamtdauer, Default `5.5s`); Spritzer-Richtungen/Weiten in den `@keyframes v1-sp1..4`.

### `splash-variante-2.html` — Cartoon-Satisfying (Krone)
Satter „Milk-Crown"-Einschlag: aufsteigende Zacken-Krone, fünf Sekundärtropfen im
Bogenwurf und ein zentraler Rebound-Tropfen, der nachspringt und wieder eintaucht —
verspielt und befriedigend, mit spürbarem Timing-Peak.
**Tuning:** `--v2-cycle` (Default `4.8s`); Krone in `@keyframes v2-crown`, Wurfhöhe/-weite der Sekundärtropfen in `v2f1..5`, Nachsprung in `v2-rebound`.

### `splash-variante-3.html` — Minimalistisch
Nur ein kurzer, weicher Lichtblitz am Einschlag plus vier gestaffelte, sauber
ausbreitende Ringe — kein Spritzer, keine Krone. Edel, reduziert, ruhig.
**Tuning:** `--v3-cycle` (Default `5s`); Blitz-Intensität im `radialGradient#v3-flash-fill` und `@keyframes v3-flash`, Ring-Staffelung über die `animation-delay` von `v3-ra..rd`.

## Hinweise zur Einbettung
- Der Container ist standardmäßig `position: relative; width/height: 240px`. Für die
  Einbettung an den Horizontpunkt kann er wie das Original-Snippet auf
  `position: absolute` mit `top/left` gesetzt werden.
- Der Einschlagpunkt `104,92` liegt bewusst dort, wo die Grundwellen-Ringe konvergieren.
  Wird er verschoben, müssen `transform-origin` (Ripples/Flash/Splash) und der
  `translate(104 92)` des Tropfen-`<g>` gemeinsam angepasst werden.
- CSS-`d:`-Path-Animation und `transform-box: view-box` sind für Chromium/WebKit
  optimiert (Ziel-Browser des Projekts).
