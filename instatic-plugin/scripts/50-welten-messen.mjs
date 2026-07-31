/*
 * 50-welten-messen.mjs — der H4-Beweis: DASSELBE Transform bei DEMSELBEN
 * Fortschritt, in allen drei Welten.
 *
 * Gemessen wird immer am selben Element (`.fcank-list`) derselben
 * server-gerenderten Seite (out/h4/index.html, aus der Instatic-Datenbank ueber
 * `publishPage()` erzeugt) mit derselben Laufzeit (von Instatics esbuild
 * gebuendelt, ueber Instatics eigenen <script>-Tag geladen).
 *
 * DIE VIER MESSREIHEN
 *   C   publizierte Seite, echtes window-Scrollen         (Referenz)
 *   C'  dieselbe Seite bei anderer Fensterhoehe            (Achsenlaenge-Drift)
 *   A   Design-Frame: ausgerollt, scrollt nicht -> virtuelleQuelle
 *   B1  Live-Frame, Laufzeit IM Frame        -> fensterQuelle (Produktionsform)
 *   B2  Live-Frame, Laufzeit im ELTERN-Realm -> iframeQuelle  (Editor greift rein)
 *
 * ZUSAETZLICH die eigentliche Streitfrage des Haeppchens: was passiert, wenn
 * man statt Dokument-Pixeln einen ANTEIL 0..1 zwischen den Welten austauscht.
 *
 * Browser: Playwright + lokal installiertes Edge (Chromium), aus
 * instatic/node_modules — wie in H3a. Der Instatic-Dev-Server wird NICHT
 * angefasst; gemessen wird ein eigener Wegwerf-Static-Server ueber out/h4.
 */
import { chromium } from '../../instatic/node_modules/playwright/index.mjs'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve, normalize, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { harnessDateiAusliefern } from './lib/harness-dateien.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BELEGE = resolve(__dirname, '../belege')
const WURZEL = resolve(__dirname, '../out/h4')
mkdirSync(BELEGE, { recursive: true })

const PORT = 4179
const BASIS = `http://127.0.0.1:${PORT}`

/** Referenz-Viewport der publizierten Seite. 800 ist absichtlich derselbe Wert
 *  wie Instatics CANVAS_VIEWPORT_HEIGHT — so ist Welt C der beste Fall, und
 *  jede gemessene Abweichung ist eine ECHTE, keine selbstgemachte. */
const REFERENZ_VIEWPORT = { width: 1280, height: 800 }
/** Zweiter Viewport nur fuer die Achsenlaenge-Frage. */
const ZWEITER_VIEWPORT = { width: 1280, height: 1000 }

/** Die Messpunkte auf der Achse, in DOKUMENT-PIXELN. 0/800/1600 sind exakte
 *  Keyframes (dort ist die Easing definitionsgemaess exakt), 400/1197 liegen
 *  mitten im Segment, der letzte Punkt ist das Ende der Referenz-Achse. */
const PUNKTE_PX = [0, 400, 800, 1197, 1600, 2394]
/** Die Regler-Stellungen, mit denen Welt A gefahren wird. */
const PUNKTE_ANTEIL = [0, 0.25, 0.5, 0.75, 1]

// ---------------------------------------------------------------- Static-Server
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

async function findeDatei(root, urlPfad) {
  let rel = decodeURIComponent(urlPfad.split('?')[0].split('#')[0])
  if (rel === '' || rel === '/') rel = '/index.html'
  const abs0 = normalize(join(root, rel))
  if (abs0 !== root && !abs0.startsWith(root + sep)) return null
  let abs = abs0
  const st = await stat(abs).catch(() => null)
  if (st && st.isDirectory()) abs = join(abs, 'index.html')
  const st2 = await stat(abs).catch(() => null)
  return st2 && st2.isFile() ? abs : null
}

const server = createServer(async (req, res) => {
  /* Favicon + Bild-Platzhalter (s. lib/harness-dateien.mjs). Ohne das holt der
     Browser /favicon.ico und der Messpfad traegt einen 404 in der Konsole. */
  if (harnessDateiAusliefern(req.url, res)) return
  const abs = await findeDatei(WURZEL, req.url ?? '/')
  if (!abs) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('nicht gefunden')
    return
  }
  res.writeHead(200, {
    'Content-Type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  })
  res.end(await readFile(abs))
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

// ------------------------------------------------------------------- Messhelfer

/** Liest den Zustand des Zielelements in EINEM Dokument aus. Als String, weil
 *  die Funktion in drei verschiedene Realms injiziert wird. */
const LIES_ZIEL = `(function (doc, win) {
  var el = doc.querySelector('.fcank-list')
  if (!el) return null
  var r = el.getBoundingClientRect()
  var cs = win.getComputedStyle(el)
  return {
    inline: el.style.transform || '(keiner)',
    computed: cs.transform,
    opacity: cs.opacity,
    /* Innen-Geometrie des Frames: unbeeinflusst von einem Eltern-Zoom. */
    rectInnen: { x: +r.x.toFixed(2), y: +r.y.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
    dokY: +(r.y + win.scrollY).toFixed(2),
    docHoehe: doc.documentElement.scrollHeight,
    innerHeight: win.innerHeight,
    maxScroll: Math.max(0, doc.documentElement.scrollHeight - win.innerHeight),
    scrollY: win.scrollY,
  }
})`

const zweiFrames = `function () { return new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r) }) }) }`

// -------------------------------------------------------------------- Ausfuehrung
const browser = await chromium.launch({ channel: 'msedge' })
const bericht = {
  erzeugt: new Date().toISOString(),
  browser: browser.version(),
  wurzel: WURZEL,
  referenzViewport: REFERENZ_VIEWPORT,
  punktePx: PUNKTE_PX,
  punkteAnteil: PUNKTE_ANTEIL,
  konsole: {},
}

try {
  // ============================================================== WELT C
  {
    const ctx = await browser.newContext({ viewport: REFERENZ_VIEWPORT })
    const page = await ctx.newPage()
    const log = []
    page.on('console', (m) => log.push(`${m.type()}: ${m.text()}`))
    page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`))
    await page.goto(`${BASIS}/index.html`, { waitUntil: 'networkidle' })

    bericht.weltC = await page.evaluate(
      async ({ punkte, liesQuelle, warteQuelle }) => {
        const lies = eval(liesQuelle)
        const warte = eval(`(${warteQuelle})`)
        const status0 = window.fcank ? window.fcank.status() : null
        const reihe = []
        for (const p of punkte) {
          window.scrollTo(0, p)
          await warte()
          const z = lies(document, window)
          reihe.push({ sollPx: p, istPx: window.scrollY, ...z })
        }
        window.scrollTo(0, 0)
        await warte()
        return {
          quelle: status0 ? status0.quelle : null,
          spanne: status0 ? status0.spanne : null,
          docHoehe: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          reihe,
        }
      },
      { punkte: PUNKTE_PX, liesQuelle: LIES_ZIEL, warteQuelle: zweiFrames },
    )
    bericht.konsole.weltC = log
    await ctx.close()
  }

  // ============================================================== WELT C'
  {
    const ctx = await browser.newContext({ viewport: ZWEITER_VIEWPORT })
    const page = await ctx.newPage()
    await page.goto(`${BASIS}/index.html`, { waitUntil: 'networkidle' })
    bericht.weltCStrich = await page.evaluate(
      async ({ anteile, liesQuelle, warteQuelle }) => {
        const lies = eval(liesQuelle)
        const warte = eval(`(${warteQuelle})`)
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        const reihe = []
        /* Bewusst ANTEIL-getrieben: genau so wuerde ein 0..1-Fortschritt
           zwischen den Welten ausgetauscht. */
        for (const a of anteile) {
          const px = a * maxScroll
          window.scrollTo(0, px)
          await warte()
          const z = lies(document, window)
          reihe.push({ anteil: a, pxAusAnteil: +px.toFixed(1), istPx: window.scrollY, ...z })
        }
        return {
          docHoehe: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight,
          maxScroll,
          spanne: window.fcank ? window.fcank.status().spanne : null,
          reihe,
        }
      },
      { anteile: PUNKTE_ANTEIL, liesQuelle: LIES_ZIEL, warteQuelle: zweiFrames },
    )
    await ctx.close()
  }

  // ========================================================= WELT A und B
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 } })
    const page = await ctx.newPage()
    const log = []
    page.on('console', (m) => log.push(`${m.type()}: ${m.text()}`))
    page.on('pageerror', (e) => log.push(`pageerror: ${e.message}`))
    await page.goto(`${BASIS}/welten.html`, { waitUntil: 'networkidle' })
    /* Beide Frames muessen ihr Site-Script ausgefuehrt haben. */
    await page.waitForFunction(
      () =>
        document.getElementById('designFrame')?.contentWindow?.fcank &&
        document.getElementById('liveFrame')?.contentWindow?.fcank &&
        window.fcank,
      null,
      { timeout: 15000 },
    )

    const referenzSpanne = bericht.weltC.reihe[0].maxScroll

    // ---------------------------------------------------------- WELT A
    bericht.weltA = await page.evaluate(
      async ({ punktePx, anteile, refSpanne, liesQuelle, warteQuelle }) => {
        const lies = eval(liesQuelle)
        const warte = eval(`(${warteQuelle})`)
        const f = document.getElementById('designFrame')
        const w = f.contentWindow
        const d = f.contentDocument

        const vorVertrag = {
          frameHoehe: f.getBoundingClientRect().height,
          docHoehe: d.documentElement.scrollHeight,
        }
        const ausgerollteHoehe = window.__designVertragAnwenden()
        await warte()

        /* Nachweis, dass der Frame WIRKLICH nicht scrollt. */
        w.scrollTo(0, 500)
        await warte()
        const scrollVersuch = { angefordert: 500, tatsaechlich: w.scrollY }
        const maxScrollImFrame = Math.max(0, d.documentElement.scrollHeight - w.innerHeight)

        /* Die Laufzeit im Frame vom Fenster auf den Regler umhaengen. Die
           Referenz-Spanne kommt von der PUBLIZIERTEN Seite, nicht vom Frame —
           das ist die Regel aus kern/scroll-quelle.ts. */
        const quelle = w.fcank.quellen.virtuell(refSpanne)
        w.__quelle = quelle
        w.fcank.stop()
        w.fcank.start(w.FCANK_CONFIG, { quelle })
        await warte()

        const reihePx = []
        for (const p of punktePx) {
          quelle.setzePixel(p)
          await warte()
          reihePx.push({ sollPx: p, istPx: quelle.fortschritt(), ...lies(d, w) })
        }
        const reiheAnteil = []
        for (const a of anteile) {
          quelle.setzeAnteil(a)
          await warte()
          reiheAnteil.push({ anteil: a, istPx: quelle.fortschritt(), ...lies(d, w) })
        }

        /* Zoom-Frage: was beruehrt der Canvas-Zoom, was nicht? */
        quelle.setzePixel(800)
        await warte()
        const zielInnen = d.querySelector('.fcank-list').getBoundingClientRect()
        const zielAussen = (() => {
          const r = f.getBoundingClientRect()
          return { frameLinks: +r.x.toFixed(2), frameBreiteAmBildschirm: +r.width.toFixed(2) }
        })()

        return {
          vorVertrag,
          ausgerollteHoehe,
          frameHoeheNachVertrag: f.getBoundingClientRect().height,
          frameBreiteCss: f.clientWidth,
          scrollVersuch,
          maxScrollImFrame,
          innerHeightImFrame: w.innerHeight,
          docHoeheImFrame: d.documentElement.scrollHeight,
          quelleArt: w.fcank.status().quelle,
          spanneDerQuelle: quelle.spanne(),
          referenzSpanne: refSpanne,
          zoom: {
            rectInnenBreite: +zielInnen.width.toFixed(2),
            ...zielAussen,
            cssBreiteDesFrames: f.clientWidth,
          },
          reihePx,
          reiheAnteil,
        }
      },
      {
        punktePx: PUNKTE_PX,
        anteile: PUNKTE_ANTEIL,
        refSpanne: referenzSpanne,
        liesQuelle: LIES_ZIEL,
        warteQuelle: zweiFrames,
      },
    )

    // --------------------------------------------------- WELT B1 und B2
    bericht.weltB = await page.evaluate(
      async ({ punktePx, anteile, liesQuelle, warteQuelle }) => {
        const lies = eval(liesQuelle)
        const warte = eval(`(${warteQuelle})`)
        const f = document.getElementById('liveFrame')
        const w = f.contentWindow
        const d = f.contentDocument

        const geometrie = {
          frameBreite: f.clientWidth,
          frameHoehe: f.clientHeight,
          innerHeightImFrame: w.innerHeight,
          docHoeheImFrame: d.documentElement.scrollHeight,
          maxScrollImFrame: Math.max(0, d.documentElement.scrollHeight - w.innerHeight),
        }

        // ---- B1: Laufzeit IM Frame, fensterQuelle (Produktionsform)
        const innen = w.fcank.quellen.fenster(w)
        w.fcank.stop()
        w.fcank.start(w.FCANK_CONFIG, { quelle: innen })
        await warte()
        const b1 = []
        for (const p of punktePx) {
          w.scrollTo(0, p)
          await warte()
          b1.push({
            sollPx: p,
            istPx: w.scrollY,
            quelleLiest: innen.fortschritt(),
            ...lies(d, w),
          })
        }
        const b1Anteil = []
        for (const a of anteile) {
          const px = a * innen.spanne()
          w.scrollTo(0, px)
          await warte()
          b1Anteil.push({ anteil: a, pxAusAnteil: +px.toFixed(1), istPx: w.scrollY, ...lies(d, w) })
        }
        const spanneInnen = innen.spanne()
        w.fcank.stop()
        w.scrollTo(0, 0)
        await warte()

        // ---- B2: Laufzeit im ELTERN-Realm, iframeQuelle + wurzel = Frame-DOM
        const aussen = window.fcank.quellen.iframe(f)
        window.fcank.stop()
        window.fcank.start(w.FCANK_CONFIG, { quelle: aussen, wurzel: d })
        await warte()
        const b2 = []
        for (const p of punktePx) {
          w.scrollTo(0, p)
          await warte()
          b2.push({
            sollPx: p,
            istPx: w.scrollY,
            quelleLiestVonAussen: aussen.fortschritt(),
            ...lies(d, w),
          })
        }
        const status2 = window.fcank.status()
        const spanneAussen = aussen.spanne()
        window.fcank.stop()
        w.scrollTo(0, 0)

        return {
          geometrie,
          spanneInnen,
          spanneAussen,
          statusB2: { quelle: status2.quelle, anker: status2.anker, kollisionen: status2.kollisionen },
          b1,
          b1Anteil,
          b2,
        }
      },
      { punktePx: PUNKTE_PX, anteile: PUNKTE_ANTEIL, liesQuelle: LIES_ZIEL, warteQuelle: zweiFrames },
    )

    bericht.konsole.weltenAB = log

    /* Bildbeleg bei Fortschritt 400 — dort steht das Ziel in BEIDEN Welten im
       Bild (bei 800 laeuft es in Welt B oben aus dem Frame heraus, s. Reihe
       "Sichtbarkeit" im Bericht). Beide Frames werden vorher wieder
       angetrieben: Welt A ueber den Regler, Welt B ueber echtes Scrollen. */
    try {
      await page.evaluate(async () => {
        const f = document.getElementById('designFrame')
        f.contentWindow.__quelle.setzePixel(400)
        const g = document.getElementById('liveFrame')
        const gw = g.contentWindow
        gw.fcank.start(gw.FCANK_CONFIG, { quelle: gw.fcank.quellen.fenster(gw) })
        gw.scrollTo(0, 400)
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      })
      await page.screenshot({ path: join(BELEGE, 'h4-welten-a-und-b.png'), fullPage: true })
      bericht.screenshot = 'belege/h4-welten-a-und-b.png (Fortschritt 400 in A und B)'
    } catch (fehler) {
      bericht.screenshot = `FEHLGESCHLAGEN: ${fehler.message}`
    }

    await ctx.close()
  }
} finally {
  await browser.close()
  server.close()
}

// ---------------------------------------------------------------------- Urteile

function zahlen(t) {
  const tr = /translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(t ?? '')
  const sc = /(?:^|\s)scale\((-?[\d.]+)\)/.exec(t ?? '')
  const ro = /rotate\((-?[\d.]+)deg\)/.exec(t ?? '')
  return {
    x: tr ? Number(tr[1]) : null,
    y: tr ? Number(tr[2]) : null,
    scale: sc ? Number(sc[1]) : null,
    rotation: ro ? Number(ro[1]) : null,
  }
}

/** Vergleicht zwei Messreihen punktweise ueber die GESCHRIEBENEN Zahlen (nicht
 *  ueber den Text — die CSSOM formatiert um) UND die aufgeloeste Matrix. */
function vergleiche(a, b, nameA, nameB) {
  const abweichungen = []
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const za = zahlen(a[i].inline)
    const zb = zahlen(b[i].inline)
    const felder = ['x', 'y', 'scale', 'rotation']
    const diff = {}
    let ungleich = false
    for (const f of felder) {
      if (za[f] === null || zb[f] === null || Math.abs(za[f] - zb[f]) > 0.001) {
        ungleich = true
        diff[f] = { [nameA]: za[f], [nameB]: zb[f] }
      }
    }
    if (Math.abs(Number(a[i].opacity) - Number(b[i].opacity)) > 0.0005) {
      ungleich = true
      diff.opacity = { [nameA]: a[i].opacity, [nameB]: b[i].opacity }
    }
    if (a[i].computed !== b[i].computed) {
      ungleich = true
      diff.computedText = { [nameA]: a[i].computed, [nameB]: b[i].computed }
    }
    if (ungleich) abweichungen.push({ punkt: a[i].sollPx ?? a[i].anteil, diff })
  }
  return abweichungen
}

const urteile = []
const c = bericht.weltC.reihe
const a = bericht.weltA.reihePx
const b1 = bericht.weltB.b1
const b2 = bericht.weltB.b2

urteile.push({
  pruefung: 'A gegen C: gleicher Fortschritt (Dok-Px) -> gleiches Transform',
  abweichungen: vergleiche(c, a, 'C', 'A'),
  ergebnis: vergleiche(c, a, 'C', 'A').length === 0 ? 'OK' : 'FEHLGESCHLAGEN',
})
urteile.push({
  pruefung: 'B1 gegen C: gleicher Fortschritt (Dok-Px) -> gleiches Transform',
  abweichungen: vergleiche(c, b1, 'C', 'B1'),
  ergebnis: vergleiche(c, b1, 'C', 'B1').length === 0 ? 'OK' : 'FEHLGESCHLAGEN',
})
urteile.push({
  pruefung: 'B2 gegen B1: iframeQuelle (von aussen) == fensterQuelle (von innen)',
  abweichungen: vergleiche(b1, b2, 'B1', 'B2'),
  ergebnis: vergleiche(b1, b2, 'B1', 'B2').length === 0 ? 'OK' : 'FEHLGESCHLAGEN',
})
urteile.push({
  pruefung: 'Welt A scrollt nachweislich NICHT (scrollTo(500) bleibt bei 0)',
  gemessen: bericht.weltA.scrollVersuch,
  ergebnis: bericht.weltA.scrollVersuch.tatsaechlich === 0 ? 'OK' : 'FEHLGESCHLAGEN',
})
urteile.push({
  pruefung: 'Welt A hat KEINE eigene Scrollstrecke (maxScroll im Frame = 0)',
  gemessen: {
    maxScrollImFrame: bericht.weltA.maxScrollImFrame,
    ausgerollteHoehe: bericht.weltA.ausgerollteHoehe,
    innerHeightImFrame: bericht.weltA.innerHeightImFrame,
  },
  ergebnis: bericht.weltA.maxScrollImFrame === 0 ? 'OK' : 'FEHLGESCHLAGEN',
})

const achsen = {
  C: bericht.weltC.reihe[0].maxScroll,
  'C-strich': bericht.weltCStrich.maxScroll,
  A_eigen: bericht.weltA.maxScrollImFrame,
  A_gesetzteReferenz: bericht.weltA.spanneDerQuelle,
  B: bericht.weltB.geometrie.maxScrollImFrame,
}
urteile.push({
  pruefung: 'Achsen-LAENGE ist NICHT welt-invariant (der Kernbefund)',
  gemessen: achsen,
  ergebnis:
    new Set([achsen.C, achsen['C-strich'], achsen.B]).size > 1
      ? 'BESTAETIGT (Abweichung nachgewiesen)'
      : 'keine Abweichung gefunden',
})

/* Der teure Fehler, gegengerechnet: derselbe ANTEIL in zwei Welten. */
const anteilDrift = PUNKTE_ANTEIL.map((an, i) => {
  const cPx = an * achsen.C
  const cStrichPx = bericht.weltCStrich.reihe[i].istPx
  const bPx = bericht.weltB.b1Anteil[i].istPx
  return {
    anteil: an,
    'C px': +cPx.toFixed(1),
    "C' px": +cStrichPx.toFixed(1),
    'B px': +bPx.toFixed(1),
    'Drift C->C\' px': +(cStrichPx - cPx).toFixed(1),
    'Drift C->B px': +(bPx - cPx).toFixed(1),
  }
})
urteile.push({
  pruefung: 'Gegenprobe: 0..1 zwischen den Welten ausgetauscht -> Drift in Dok-Px',
  gemessen: anteilDrift,
  ergebnis: anteilDrift.some((r) => r["Drift C->C' px"] !== 0 || r['Drift C->B px'] !== 0)
    ? 'BESTAETIGT (0..1 ist NICHT austauschbar)'
    : 'keine Drift',
})

/* Fuer die E2-Frage (Design- oder Live-Modus als Werkzeugmodus): steht das zu
   bearbeitende Element an einem gegebenen Fortschritt ueberhaupt IM BILD? */
const sichtbar = (r, vh) => r.rectInnen.y + r.rectInnen.h > 0 && r.rectInnen.y < vh
const sichtbarkeit = PUNKTE_PX.map((p, i) => ({
  px: p,
  'C rect.y': c[i].rectInnen.y,
  'C sichtbar (vh 800)': sichtbar(c[i], bericht.weltC.innerHeight),
  'B1 rect.y': b1[i].rectInnen.y,
  'B1 sichtbar (Frame 900)': sichtbar(b1[i], bericht.weltB.geometrie.frameHoehe),
  'A rect.y': a[i].rectInnen.y,
  'A sichtbar (Frame ausgerollt)': sichtbar(a[i], bericht.weltA.ausgerollteHoehe),
}))
bericht.sichtbarkeit = sichtbarkeit
urteile.push({
  pruefung:
    'E2-Beleg: im ausgerollten Design-Frame steht das Ziel an JEDEM Fortschritt im Frame, im Live-Frame nicht',
  gemessen: {
    aImmerImFrame: sichtbarkeit.every((r) => r['A sichtbar (Frame ausgerollt)']),
    b1AusserhalbBei: sichtbarkeit.filter((r) => !r['B1 sichtbar (Frame 900)']).map((r) => r.px),
    achseGleichzeitigSichtbar: {
      'Design bei Zoom 0.6': `${Math.round(bericht.weltA.ausgerollteHoehe * 0.6)} px Bildschirm fuer die ganze Achse`,
      'Design bei Zoom 0.25': `${Math.round(bericht.weltA.ausgerollteHoehe * 0.25)} px Bildschirm fuer die ganze Achse`,
      Live: `${bericht.weltB.geometrie.frameHoehe} von ${bericht.weltB.geometrie.docHoeheImFrame} px = ${(
        (100 * bericht.weltB.geometrie.frameHoehe) /
        bericht.weltB.geometrie.docHoeheImFrame
      ).toFixed(1)}% gleichzeitig`,
    },
  },
  ergebnis: 'INFO (Entscheidungsgrundlage, kein Pass/Fail)',
})

bericht.urteile = urteile
bericht.achsen = achsen
bericht.anteilDrift = anteilDrift

writeFileSync(join(BELEGE, 'h4-messwerte.json'), JSON.stringify(bericht, null, 2), 'utf8')

// ------------------------------------------------------------------- Ausgabe
console.log('=== URTEILE ===')
for (const u of urteile) console.log(`${String(u.ergebnis).padEnd(34)} ${u.pruefung}`)

console.log('\n=== MESSREIHE: gleicher Fortschritt in Dokument-Pixeln ===')
console.log('  px   | C (publiziert)                | A (Design/virtuell)          | B1 (Live/innen)              | B2 (Live/aussen)')
for (let i = 0; i < PUNKTE_PX.length; i++) {
  const k = (r) => (r ? `${r.inline.replace('translate3d(', '').replace(', 0px)', ')').slice(0, 28).padEnd(28)}` : '-'.padEnd(28))
  console.log(
    `${String(PUNKTE_PX[i]).padStart(5)} | ${k(c[i])} | ${k(a[i])} | ${k(b1[i])} | ${k(b2[i])}`,
  )
}

console.log('\n=== ACHSENLAENGEN (Dokument-Pixel) ===')
for (const [k, v] of Object.entries(achsen)) console.log(`  ${k.padEnd(22)} ${v}`)

console.log('\n=== 0..1 ZWISCHEN DEN WELTEN AUSGETAUSCHT ===')
console.table(anteilDrift)

console.log('\n=== SICHTBARKEIT DES ZIELS (E2-Entscheidungsgrundlage) ===')
console.table(sichtbarkeit)

console.log('\n=== WELT A: Geometrie ===')
console.log(
  JSON.stringify(
    {
      frameBreite: bericht.weltA.frameBreiteCss,
      ausgerollteHoehe: bericht.weltA.ausgerollteHoehe,
      innerHeightImFrame: bericht.weltA.innerHeightImFrame,
      maxScrollImFrame: bericht.weltA.maxScrollImFrame,
      scrollVersuch: bericht.weltA.scrollVersuch,
      zoom: bericht.weltA.zoom,
    },
    null,
    2,
  ),
)
console.log('\n=== WELT B: Geometrie ===', JSON.stringify(bericht.weltB.geometrie, null, 2))
console.log('Konsole (Welten A/B):', JSON.stringify(bericht.konsole.weltenAB ?? [], null, 2))
console.log(`\nBelege: ${join(BELEGE, 'h4-messwerte.json')}`)
