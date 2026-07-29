# Spike-Befund: Trägt Instatics Plugin-Ebene unseren Animations-Editor?

> **Datum:** 2026-07-29 · **Instatic:** v0.0.14 (Klon `instatic/`, MIT, Bun 1.3.14)
> **Spike-Code:** `spike-plugin/` (Wegwerf, nicht produktiv gedacht)
> **Verdikt: JA — Plugin trägt.** Ein Fork ist für den Kernfall nicht nötig.

## Fragestellung

Die Kartierung hatte aus dem Code hergeleitet, dass ein Editor-Plugin ein interaktives
Canvas-Overlay rendern kann. Zwei Stellen waren aber **nur hergeleitet, nicht laufen gesehen**:

1. Schlucken die Canvas-Gesten (Pan/Zoom via `@use-gesture`) die Pointer-Events unserer
   Drag-Handles?
2. Funktioniert das im **Live-Modus**, wo der Host den Overlay-Layer laut
   `CanvasRoot.tsx:535` (`!isLive && …`) gar nicht mountet?

## Aufbau

Minimal-Plugin `flowcode.ankerspike` (Manifest + ein Editor-Entrypoint, roher ESM ohne
Build-Schritt, React über die Import-Map des Hosts). Registriert:
`api.editor.canvas.registerOverlay` (Handle + Anker-Linie + Node-Rahmen),
`api.editor.panels.register` (Messwert-Panel), liest die Selektion via `useEditorStore`,
misst via `useCanvasNodeRect`. Zusätzlich eine Sonde, die sich im Live-Modus per
`createPortal` selbst in `[data-instatic-canvas-root]` hängt.

Installation über die Admin-UI (ZIP-Upload → Permission-Review → **Step-Up-Auth mit
Passwort-Wiedereingabe**, weil ein Editor-Plugin unsandboxed läuft = RCE-Risiko; das ist
sauber gelöst und ehrlich formuliert).

## Ergebnisse — bewiesen

| Nr. | Prüfung | Ergebnis |
|---|---|---|
| 1 | Plugin mit Editor-Entrypoint installierbar | **OK** — Status „Active" nach Step-Up-Auth |
| 2 | `registerOverlay` mountet | **OK** — `overlayGemountet: true` |
| 3 | `useCanvasNodeRect` misst echt | **OK** — `{top:61, left:11, width:188, height:400}` für den Body-Node im Mobile-Frame bei 50 % Zoom (= 375 px real, stimmt) |
| 4 | Messung ist dynamisch | **OK** — nach Canvas-Pan änderte sich `left` von `11` auf `-169`, ohne Zutun |
| 5 | **Interaktives Drag-Handle** | **OK** — Handle bewegte sich exakt um die Mausdistanz (`dx:120, dy:70`) |
| 6 | **Kein Gesten-Konflikt** | **OK** — `canvasVerschoben: false`; `stopPropagation` im `pointerdown` genügt, der Canvas pannt nicht mit |
| 7 | Panel-Registrierung | **OK** — Rail-Eintrag „Open Anker-Spike panel" erscheint neben den Host-Panels |
| 8 | Store-Lesen | **OK** — Selektion aus `useEditorStore` gelesen |
| 9 | **Portal in die Canvas-Wurzel im Live-Modus** | **OK** — `portalSchichtDa: true` bei `data-canvas-view="live"`, während das Host-Overlay erwartungsgemäß weg war (`hostHandleDa: false`) |
| 10 | **Live-Frame: Scroll messbar** | **OK** — `contentDocument` zugänglich (same-origin), `scrollY` lesbar, `scrollHeight: 1150` |
| 11 | Live-Frame: Node-IDs vorhanden | **OK** — `[data-node-id]` im Live-Dokument, Geometrie in Editor-Koordinaten umrechenbar |

Visuelle Belege: `spike-overlay-drag.png` (oranges Handle + Anker-Linie am selektierten Node),
`instatic-editor-leer.png` (Editor-Grundzustand).

## Einschränkungen — ehrlich

- **Im Live-Modus gibt es keine Node-Selektion über den Explorer** (Panel zugeklappt, kein
  `selectedNodeId`). Der Host-Hook feuert dort deshalb nicht — die zugrundeliegende
  Geometrie ist aber nachweislich messbar (Zeile 10/11). **Konsequenz:** Wenn wir im
  Live-Modus authoren wollen, brauchen wir eigene Auswahl-Logik (Klick-Handler im Portal),
  oder wir authoren im Design-Modus und nutzen Live nur zur Kontrolle.
- **Publizierte Seiten wurden nicht getestet.** Der Weg für unsere Runtime
  (Site-Level-Script, `runInCanvas`, esbuild beim Publish) ist nur aus Doku und Code
  bekannt, nicht ausgeführt. Ebenso ungetestet: ob unsere Anker-Attribute über
  `htmlAttributes` bis in den publizierten HTML-Output durchkommen.
- **Der Spike-Code ist Wegwerf** — kein Fehlerpfad, kein Cleanup-Feinschliff, Sonde hängt
  am Panel (schließt man das Panel, verschwindet die Live-Schicht).
- **Pre-1.0:** Instatic dokumentiert „No backward compatibility. Ever." Die genutzten
  Extension-Points können sich mit jedem `0.0.x` ändern; `useCanvasNodeRect` wurde laut
  Changelog kürzlich erst repariert.

## Folgerung für die Architektur

Der Plugin-Weg ist tragfähig — mit einer Präzisierung gegenüber der Kartierung: Der
**Design-Modus** ist der natürliche Ort für unser Werkzeug (Overlay mountet, Selektion da,
Drag funktioniert). Für den **Live-Modus** ist der Portal-Weg bewiesen, aber wir müssen
Selektion selbst mitbringen. Der Ein-Zeichen-Fork in `CanvasRoot.tsx:535` bleibt die
Alternative, falls das in der Praxis hakt.

Die Scroll-Messung — das Herz unseres Animations-Editors — funktioniert: Der Live-Frame ist
same-origin, `scrollY` und `scrollHeight` sind direkt lesbar.
