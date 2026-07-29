/*
 * Flowcode Anker-Spike — Editor-Entrypoint.
 *
 * ZWECK (Wegwerf-Code, kein Produktionsstand): Genau die zwei Punkte pruefen,
 * die sich nur aus dem Instatic-Code herleiten, aber nicht laufen gesehen
 * wurden:
 *   (1) Traegt das Canvas-Overlay ein INTERAKTIVES Element (Drag-Handle) —
 *       oder schlucken die Canvas-Gesten (Pan/Zoom, @use-gesture) die Pointer-
 *       Events?
 *   (2) Misst `useCanvasNodeRect` auch im LIVE-Modus, wo der Overlay-Layer
 *       laut CanvasRoot.tsx:535 (`!isLive && ...`) gar nicht gemountet wird —
 *       und laesst sich das per Portal in `[data-instatic-canvas-root]`
 *       nachruesten, OHNE Fork?
 *
 * Beides zusammen ist die Vorbedingung dafuer, unseren Scroll-Animations-
 * Editor als Plugin statt als Fork zu bauen.
 *
 * Warum React.createElement statt JSX: das Plugin wird als roher ESM-Entry
 * ausgeliefert (wie examples/plugins/template), es gibt keinen Build-Schritt.
 * `react` und `@instatic/host-hooks` sind Import-Map-Aliase auf die HOST-
 * Instanz (public/runtime/*.js) — dieselbe React-Instanz, sonst waeren Hooks
 * wirkungslos.
 */

import React from 'react'
import { createPortal } from 'react-dom'
import { useCanvasNodeRect, useEditorStore } from '@instatic/host-hooks'

var h = React.createElement

/* Sammelt Messwerte fuer den Spike-Bericht; im Panel sichtbar + auf window
   fuer die Browser-Verifikation von aussen. */
var BEFUND = {
  overlayGemountet: false,
  rectGemessen: null,
  dragGelungen: false,
  liveModusPortal: null,
  liveRect: null,
}
if (typeof window !== 'undefined') window.__ANKER_SPIKE__ = BEFUND

/* ---------------------------------------------------------------- */
/* Das eigentliche Handle: haengt an der Bounding-Box des gewaehlten */
/* Nodes und laesst sich mit der Maus versetzen (Versatz = das, was  */
/* bei uns spaeter der Keyframe-Offset zum Anker ist).               */
/* ---------------------------------------------------------------- */
function AnkerHandle(props) {
  var rect = props.rect
  var versatz = props.versatz
  var setVersatz = props.setVersatz

  var ziehtRef = React.useRef(null)

  React.useEffect(function () {
    function beiBewegung(e) {
      var z = ziehtRef.current
      if (!z) return
      /* stopPropagation im Handler ist zu spaet fuer window-Listener —
         entscheidend ist, dass pointerdown auf dem Handle die Canvas-Geste
         gar nicht erst ausloest (s. onPointerDown unten). */
      setVersatz({ x: z.startVersatzX + (e.clientX - z.startX), y: z.startVersatzY + (e.clientY - z.startY) })
      BEFUND.dragGelungen = true
    }
    function beiEnde() {
      ziehtRef.current = null
    }
    window.addEventListener('pointermove', beiBewegung)
    window.addEventListener('pointerup', beiEnde)
    return function () {
      window.removeEventListener('pointermove', beiBewegung)
      window.removeEventListener('pointerup', beiEnde)
    }
  }, [setVersatz])

  return h(
    'div',
    {
      'data-anker-spike-handle': '1',
      onPointerDown: function (e) {
        /* Die Canvas-Gesten (Pan/Zoom) haengen am Canvas-Container.
           stopPropagation hier = der Test, ob das Overlay die Events
           ueberhaupt zuerst bekommt. */
        e.stopPropagation()
        e.preventDefault()
        ziehtRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startVersatzX: versatz.x,
          startVersatzY: versatz.y,
        }
      },
      style: {
        position: 'absolute',
        top: rect.top + versatz.y - 14 + 'px',
        left: rect.left + versatz.x - 14 + 'px',
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: '#EA8914',
        border: '2px solid #fff',
        boxShadow: '0 2px 8px rgba(0,0,0,.35)',
        cursor: 'grab',
        /* Der Overlay-Layer ist pointer-events:none — Kinder opten ein. */
        pointerEvents: 'auto',
        zIndex: 60,
      },
      title: 'Anker-Spike: ziehen zum Versetzen',
    },
    /* Kleines Fadenkreuz, damit man den Bezugspunkt sieht. */
    h('div', {
      style: {
        position: 'absolute',
        inset: '11px',
        background: '#fff',
        borderRadius: '50%',
      },
    }),
  )
}

/* Verbindungslinie Handle -> Node-Ecke: zeigt, ob der Bezug beim Scrollen
   und Zoomen erhalten bleibt (das ist der Anker-Beweis). */
function AnkerLinie(props) {
  var rect = props.rect
  var versatz = props.versatz
  var laenge = Math.sqrt(versatz.x * versatz.x + versatz.y * versatz.y)
  var winkel = (Math.atan2(versatz.y, versatz.x) * 180) / Math.PI
  return h('div', {
    style: {
      position: 'absolute',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: laenge + 'px',
      height: '0px',
      borderTop: '2px dashed #EA8914',
      transformOrigin: '0 0',
      transform: 'rotate(' + winkel + 'deg)',
      pointerEvents: 'none',
      zIndex: 59,
    },
  })
}

/* Rahmen um den gemessenen Node — belegt visuell, dass die Messung stimmt. */
function NodeRahmen(props) {
  var rect = props.rect
  return h('div', {
    style: {
      position: 'absolute',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      border: '2px solid rgba(234,137,20,.55)',
      pointerEvents: 'none',
      zIndex: 58,
    },
  })
}

/* ---------------------------------------------------------------- */
/* Overlay (Design-Modus): wird vom Host in den Overlay-Layer        */
/* gemountet — der offizielle, dokumentierte Weg.                    */
/* ---------------------------------------------------------------- */
function AnkerSpikeOverlay() {
  var selectedId = useEditorStore(function (s) {
    /* Der Store-Slice-Name ist nicht garantiert — defensiv mehrere Formen
       probieren, damit der Spike nicht an einer Umbenennung scheitert. */
    return (
      (s && s.selectedNodeId) ||
      (s && s.selection && (s.selection.nodeId || (s.selection.nodeIds && s.selection.nodeIds[0]))) ||
      null
    )
  })
  var rect = useCanvasNodeRect(selectedId)
  var versatzState = React.useState({ x: 90, y: -60 })
  var versatz = versatzState[0]
  var setVersatz = versatzState[1]

  React.useEffect(function () {
    BEFUND.overlayGemountet = true
  }, [])

  React.useEffect(
    function () {
      if (rect) {
        BEFUND.rectGemessen = {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      }
    },
    [rect],
  )

  if (!selectedId || !rect) return null

  return h(
    React.Fragment,
    null,
    h(NodeRahmen, { rect: rect }),
    h(AnkerLinie, { rect: rect, versatz: versatz }),
    h(AnkerHandle, { rect: rect, versatz: versatz, setVersatz: setVersatz }),
  )
}

/* ---------------------------------------------------------------- */
/* Live-Modus-Nachruestung: der Host mountet den Overlay-Layer im    */
/* Live-Modus NICHT (CanvasRoot.tsx:535). Test, ob wir uns per       */
/* Portal selbst in die Canvas-Wurzel haengen koennen — ohne Fork.   */
/* ---------------------------------------------------------------- */
function LiveModusSonde() {
  var zielState = React.useState(null)
  var ziel = zielState[0]
  var setZiel = zielState[1]

  React.useEffect(function () {
    /* Der Canvas-Root traegt data-instatic-canvas-root (CanvasRoot.tsx:431).
       Wir pollen kurz, weil er beim Moduswechsel neu montiert wird. */
    var timer = setInterval(function () {
      var wurzel = document.querySelector('[data-instatic-canvas-root]')
      var liveAktiv = !!document.querySelector('[data-instatic-canvas-live], [data-canvas-view="live"]')
      if (wurzel) {
        setZiel(wurzel)
        BEFUND.liveModusPortal = {
          wurzelGefunden: true,
          liveMarkerGefunden: liveAktiv,
          overlayLayerDa: !!document.querySelector('[class*="pluginCanvasOverlay"], [data-plugin-canvas-overlay]'),
        }
      } else {
        BEFUND.liveModusPortal = { wurzelGefunden: false }
      }
    }, 700)
    return function () {
      clearInterval(timer)
    }
  }, [])

  if (!ziel) return null

  /* Eigener Layer, gleiche Regeln wie der Host-Layer. */
  return createPortal(
    h(
      'div',
      {
        'data-anker-spike-liveschicht': '1',
        style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 55 },
      },
      h(LiveInhalt, null),
    ),
    ziel,
  )
}

function LiveInhalt() {
  var selectedId = useEditorStore(function (s) {
    return (
      (s && s.selectedNodeId) ||
      (s && s.selection && (s.selection.nodeId || (s.selection.nodeIds && s.selection.nodeIds[0]))) ||
      null
    )
  })
  var rect = useCanvasNodeRect(selectedId)

  React.useEffect(
    function () {
      if (rect) {
        BEFUND.liveRect = {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      }
    },
    [rect],
  )

  if (!rect) return null
  /* Gruener Rahmen = im Live-Modus gemessen (zur Unterscheidung vom Orange). */
  return h('div', {
    'data-anker-spike-liverahmen': '1',
    style: {
      position: 'absolute',
      top: rect.top + 'px',
      left: rect.left + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      border: '2px dashed #46A03C',
      pointerEvents: 'none',
    },
  })
}

/* Panel: zeigt die Messwerte im Editor an (und haelt die Live-Sonde am
   Leben, weil ein Panel auch im Live-Modus gemountet bleibt). */
function SpikePanel() {
  var tickState = React.useState(0)
  var setTick = tickState[1]
  React.useEffect(function () {
    var t = setInterval(function () {
      setTick(function (n) {
        return n + 1
      })
    }, 800)
    return function () {
      clearInterval(t)
    }
  }, [])

  return h(
    'div',
    { style: { padding: '12px', fontFamily: 'ui-monospace, monospace', fontSize: '12px', lineHeight: 1.6 } },
    h('strong', null, 'Anker-Spike — Messwerte'),
    h('pre', { style: { whiteSpace: 'pre-wrap', marginTop: '8px' } }, JSON.stringify(BEFUND, null, 2)),
    h(LiveModusSonde, null),
  )
}

var mod = {
  activate: function (api) {
    api.editor.canvas.registerOverlay({
      id: 'flowcode.ankerspike.handle',
      component: AnkerSpikeOverlay,
    })

    api.editor.panels.register({
      id: 'flowcode.ankerspike.panel',
      label: 'Anker-Spike',
      iconName: 'crosshair',
      component: SpikePanel,
    })

    if (typeof window !== 'undefined') {
      window.__ANKER_SPIKE_AKTIV__ = true
      console.log('[anker-spike] aktiviert')
    }
  },
}

export default mod
export var activate = mod.activate
