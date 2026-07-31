/*
 * 40-welten-harness.mjs — baut `out/h4/welten.html`: die beiden EDITOR-Welten
 * (Design-Frame und Live-Frame) als nachgebaute Geometrie um dieselbe
 * server-gerenderte Seite herum, die Welt C benutzt.
 *
 * WARUM NACHGEBAUT UND NICHT IM ECHTEN EDITOR
 * -------------------------------------------
 * Die Instatic-Admin-Sitzung ist abgelaufen (Login-Wand), und Einloggen ist
 * dem Agenten verboten. Statt den Check fallenzulassen (Verifikations-Protokoll
 * §1.1: Eskalationsleiter, nicht beim ersten Fehlschlag aufgeben) wird die
 * GEOMETRIE der beiden Frames aus dem Wirt-Quellcode nachgebaut. Jede
 * uebernommene Eigenschaft ist unten mit Datei:Zeile belegt.
 *
 * DAS IST EIN NACHBAU, KEINE MESSUNG IM ZIEL. Jeder darauf gestuetzte Befund
 * ist im Bericht als "auf Zielumgebung UNGEPRUEFT" gefuehrt.
 *
 * WAS AM NACHBAU ECHT IST
 * -----------------------
 *  - die Seite selbst: aus der Instatic-Datenbank ueber `publishPage()`
 *    gerendert (scripts/10-render.ts, derselbe Pfad wie der Publish),
 *  - unsere Laufzeit: von Instatics eigenem esbuild als Site-Script gebuendelt
 *    und ueber Instatics eigenen <script>-Tag geladen,
 *  - die Anker-Klassen: in Instatic gesetzt, aus der Datenbank gelesen.
 * NACHGEBAUT ist ausschliesslich die Rahmen-Geometrie der beiden Editor-Welten.
 *
 * DIE UEBERNOMMENEN WIRT-EIGENSCHAFTEN (alle Pfade relativ zu
 * instatic/src/admin/pages/site/canvas/)
 * ----------------------------------------------------------------------
 * DESIGN-FRAME (interaction='canvas'):
 *   - eigenes same-origin-iframe je Breakpoint            IframeFrameSurface.tsx:637-652
 *   - Breite = Breakpoint-Breite (feste px)               IframeFrameSurface.tsx:646
 *   - Hoehe waechst auf die Inhaltshoehe                  useIframeFrameAutoHeight.ts:44-63
 *     Zielhoehe = max(body.scrollHeight, html.scrollHeight)  iframeFrameHeight.ts:24
 *   - html/body: height auto, overflow hidden             iframeBodyReset.ts:81-88
 *   - body min-height = CANVAS_VIEWPORT_HEIGHT (800)      iframeBodyReset.ts:83
 *   - `100vh` wird auf 800 px aufgeloest                  resolveViewportUnits.ts:47
 *                                                          IframeFrameSurface.tsx:633
 *   - der ganze Canvas haengt unter EINEM CSS-transform
 *     (Pan/Zoom)                                          CanvasTransformLayer.tsx:2-8
 *   => Der Frame SCROLLT NICHT. Es gibt dort keine Scroll-Achse zu lesen.
 *
 * LIVE-FRAME (interaction='live'):
 *   - dasselbe iframe, aber width/height 100 %            IframeFrameSurface.tsx:646
 *   - html/body-Reset wird ZURUECKGENOMMEN, die Seite
 *     verhaelt sich wie publiziert                        iframeBodyReset.ts:73-79
 *   - kein Auto-Height                                    useIframeFrameAutoHeight.ts:32
 *   - kein Pan/Zoom                                       CanvasLiveSurface.tsx:8-11
 *   => Der Frame scrollt INTERN; contentWindow.scrollY ist same-origin lesbar.
 *
 * WICHTIGER NEBENBEFUND AUS DEM QUELLCODE (nicht nachgebaut, nur notiert):
 *   IframeFrameSurface.tsx:633 setzt `viewport = { width, height:
 *   CANVAS_VIEWPORT_HEIGHT }` OHNE `isLive`-Verzweigung. `100vh` ist also auch
 *   im LIVE-Frame auf 800 px gepinnt, nicht auf die echte Frame-Hoehe. Fuer
 *   eine Seite mit `min-height:100vh` weicht die Dokumenthoehe im Live-Frame
 *   damit ebenso von der publizierten Seite ab wie im Design-Frame. Die hier
 *   vermessene Seite benutzt keine vh-Einheiten (0 Treffer im HTML), deshalb
 *   ist dieser Kanal in den Zahlen unten NICHT sichtbar — er ist trotzdem da.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const H4 = resolve(__dirname, '../out/h4')

/** Breakpoint-Breite des Design-Frames. 1280 = dieselbe Breite, mit der Welt C
 *  gemessen wird, damit ein Breiten-Umbruch als Erklaerung ausscheidet. */
const DESIGN_BREITE = 1280
/** Pan/Zoom des Canvas. Bewusst != 1, damit sichtbar wird, was der Zoom
 *  beruehrt (Eltern-Rect) und was nicht (Frame-Innengeometrie). */
const CANVAS_ZOOM = 0.6
/** Hoehe des Live-Frames. Absichtlich != 800, damit die Achsenlaenge des
 *  Live-Frames messbar von der der publizierten Seite abweicht. */
const LIVE_HOEHE = 900
const LIVE_BREITE = 1280
/** Instatics CANVAS_VIEWPORT_HEIGHT (resolveViewportUnits.ts:47). */
const CANVAS_VIEWPORT_HEIGHT = 800

const indexHtml = readFileSync(join(H4, 'index.html'), 'utf8')
const runtimeSrc = /<script type="module" src="([^"]+)"/.exec(indexHtml)?.[1]
if (!runtimeSrc) throw new Error('Kein Runtime-Script-Tag in out/h4/index.html gefunden')

const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>H4 — Welt A (Design) und Welt B (Live)</title>
<style>
  body { margin: 0; font: 13px system-ui, sans-serif; background: #1b1b1f; color: #ddd; }
  h2 { margin: 12px; font-size: 13px; font-weight: 600; }
  /* --- WELT A: Canvas mit Pan/Zoom (CanvasTransformLayer) --- */
  #canvasFlaeche { overflow: hidden; height: 520px; border-bottom: 1px solid #444; }
  #canvasTransform { transform: scale(${CANVAS_ZOOM}); transform-origin: 0 0; }
  #designFrame { width: ${DESIGN_BREITE}px; border: 0; display: block; background: #fff; }
  /* --- WELT B: ein Frame in Realgroesse, scrollt intern --- */
  #liveHuelle { width: ${LIVE_BREITE}px; height: ${LIVE_HOEHE}px; margin: 12px; }
  #liveFrame { width: 100%; height: 100%; border: 0; display: block; background: #fff; }
</style>
</head>
<body>
<h2>WELT A — Design-Frame (ausgerollt, scrollt nicht, Canvas-Zoom ${CANVAS_ZOOM})</h2>
<div id="canvasFlaeche"><div id="canvasTransform">
  <iframe id="designFrame" src="/index.html" title="Design-Frame"></iframe>
</div></div>
<h2>WELT B — Live-Frame (${LIVE_BREITE}×${LIVE_HOEHE}, scrollt intern)</h2>
<div id="liveHuelle"><iframe id="liveFrame" src="/index.html" title="Live-Frame"></iframe></div>

<!-- Die Laufzeit auch im ELTERN-Realm: fuer Welt B2 (Runtime laeuft im Editor,
     nicht im Frame) wird von hier aus per iframeQuelle in den Frame gegriffen.
     Autostart findet hier keinen Anker und meldet das laut — erwartet. -->
<script type="module" src="${runtimeSrc}"></script>

<script>
/* Der Wirt-Vertrag des DESIGN-Frames, 1:1 aus iframeBodyReset.ts:81-88 +
   useIframeFrameAutoHeight.ts. Wird nach dem Laden angewandt. */
window.__designVertragAnwenden = function () {
  var f = document.getElementById('designFrame')
  var d = f.contentDocument
  d.documentElement.style.height = 'auto'
  d.body.style.height = 'auto'
  d.body.style.minHeight = '${CANVAS_VIEWPORT_HEIGHT}px'
  d.documentElement.style.overflow = 'hidden'
  d.body.style.overflow = 'hidden'
  /* resolveCanvasFrameHeight (iframeFrameHeight.ts:24): der Frame wird auf die
     Inhaltshoehe ausgerollt — danach gibt es nichts mehr zu scrollen. */
  var ziel = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight)
  f.style.height = ziel + 'px'
  /* Zweiter Durchlauf: das Ausrollen kann die Inhaltshoehe erneut aendern. */
  ziel = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight)
  f.style.height = ziel + 'px'
  return ziel
}
/* Der LIVE-Frame bekommt genau nichts davon (iframeBodyReset.ts:73-79 setzt
   height/overflow zurueck) — er verhaelt sich wie die publizierte Seite. */
</script>
</body>
</html>
`

writeFileSync(join(H4, 'welten.html'), html, 'utf8')
console.log(
  JSON.stringify(
    {
      geschrieben: join(H4, 'welten.html'),
      runtimeSrc,
      designBreite: DESIGN_BREITE,
      canvasZoom: CANVAS_ZOOM,
      liveGroesse: `${LIVE_BREITE}x${LIVE_HOEHE}`,
      canvasViewportHeight: CANVAS_VIEWPORT_HEIGHT,
    },
    null,
    2,
  ),
)
